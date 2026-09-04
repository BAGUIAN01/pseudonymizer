"use client";

/**
 * Extraction du texte des documents, cote client.
 *
 * Lire un document ne demande pas de code natif : pdf.js, mammoth et SheetJS
 * font le travail dans la webview, sur les octets du fichier. Le code natif
 * n'intervient qu'a l'ecriture, ou il faut reconstruire le document dans son
 * format d'origine en preservant la mise en page.
 */

/** Formats reconnus, dans l'ordre ou ils sont proposes a l'utilisateur. */
export const SUPPORTED_FORMATS = ["pdf", "docx", "xlsx", "txt"];

export function formatOf(fileName) {
  const ext = String(fileName).split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xls") return "xlsx";
  if (ext === "doc") return "docx";
  if (ext === "md" || ext === "csv") return "txt";
  return ext;
}

export function baseName(fileName) {
  return String(fileName).replace(/\.[^.]+$/, "");
}

/**
 * Extrait un document a partir de ses octets.
 *
 * @param {string} fileName nom du fichier, qui determine le format
 * @param {ArrayBuffer|Uint8Array} bytes contenu brut
 * @param {string} [path] chemin sur le disque, connu sous Tauri seulement
 * @returns {Promise<{fileName, path, format, title, paragraphs}>}
 */
export async function extractDocument(fileName, bytes, path = "") {
  const format = formatOf(fileName);
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  let paragraphs;
  switch (format) {
    case "pdf":
      paragraphs = await extractPdf(buffer);
      break;
    case "docx":
      paragraphs = await extractDocx(buffer);
      break;
    case "xlsx":
      paragraphs = await extractXlsx(buffer);
      break;
    case "txt":
      paragraphs = splitParagraphs(new TextDecoder().decode(buffer));
      break;
    default:
      throw new Error(
        `Format non pris en charge : .${format || "?"} (attendus : ${SUPPORTED_FORMATS.join(", ")})`,
      );
  }

  if (!paragraphs.length) {
    throw new Error(
      "Aucun texte extractible — le document est peut-être une image scannée.",
    );
  }

  return {
    fileName,
    path,
    format,
    title: baseName(fileName),
    paragraphs,
  };
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

let pdfjsPromise = null;

function loadPdfjs() {
  // Chargement differe : la bibliotheque pese lourd et n'est utile qu'au
  // moment ou l'utilisateur ouvre un PDF.
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * Reconstitue les lignes d'un PDF a partir des fragments positionnes, puis
 * regroupe ces lignes en paragraphes.
 *
 * Un PDF ne contient pas de paragraphes : seulement des fragments de texte
 * places en coordonnees absolues. On les regroupe par ordonnee pour former des
 * lignes, puis on coupe la ou l'interligne s'ecarte nettement de l'interligne
 * courant du document.
 */
async function extractPdf(bytes) {
  const pdfjs = await loadPdfjs();
  // En pdf.js 6, c'est la tache de chargement qui libere les ressources :
  // `PDFDocumentProxy` n'expose plus `destroy()`.
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const lines = [];

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();

      let current = null;
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5] ?? 0;

        // Meme ligne tant que l'ordonnee ne bouge pas de plus d'un point.
        if (current && Math.abs(current.y - y) < 1.5) {
          current.text += item.str;
        } else {
          if (current) lines.push(current);
          current = { y, page: n, text: item.str };
        }
        if (item.hasEOL) {
          lines.push(current);
          current = null;
        }
      }
      if (current) lines.push(current);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }

  return groupLines(lines);
}

/** Regroupe des lignes positionnees en paragraphes selon l'interligne. */
function groupLines(lines) {
  const kept = lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() }))
    .filter((l) => l.text);
  if (!kept.length) return [];

  // Interligne median du document, mesure sur les lignes consecutives d'une
  // meme page : c'est la reference a partir de laquelle un ecart signale un
  // changement de paragraphe.
  const gaps = [];
  for (let i = 1; i < kept.length; i++) {
    if (kept[i].page !== kept[i - 1].page) continue;
    const gap = kept[i - 1].y - kept[i].y;
    if (gap > 0) gaps.push(gap);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

  const paragraphs = [];
  let buffer = kept[0].text;
  for (let i = 1; i < kept.length; i++) {
    const previous = kept[i - 1];
    const line = kept[i];
    const newPage = line.page !== previous.page;
    const gap = previous.y - line.y;
    const breaks = newPage || !median || gap > median * 1.5 || gap < 0;

    if (breaks) {
      paragraphs.push(buffer);
      buffer = line.text;
    } else {
      // Recolle les mots coupes en fin de ligne.
      buffer = buffer.endsWith("-")
        ? buffer.slice(0, -1) + line.text
        : `${buffer} ${line.text}`;
    }
  }
  paragraphs.push(buffer);

  return paragraphs.filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* DOCX / XLSX / TXT                                                   */
/* ------------------------------------------------------------------ */

async function extractDocx(bytes) {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const { value } = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
  return splitParagraphs(value);
}

async function extractXlsx(bytes) {
  const XLSX = await import("xlsx");
  const book = XLSX.read(bytes, { type: "array" });
  const paragraphs = [];

  for (const name of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[name], {
      header: 1,
      blankrows: false,
      defval: "",
    });
    // Une ligne du tableur devient un paragraphe : les correspondances se
    // reperent alors cellule par cellule sans traverser les lignes.
    for (const row of rows) {
      const text = row
        .map((cell) => String(cell).trim())
        .filter(Boolean)
        .join(" · ");
      if (text) paragraphs.push(text);
    }
  }

  return paragraphs;
}

function splitParagraphs(text) {
  const blocks = String(text)
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  if (blocks.length > 1) return blocks;

  // Document sans ligne vide : chaque ligne fait un paragraphe.
  return String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Registre de correspondances                                         */
/* ------------------------------------------------------------------ */

/** Normalise un en-tete pour comparer sans casse ni accents. */
function normalizeHeader(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const HEADER_ALIASES = {
  text: ["donnee personnelle", "donnee", "valeur", "original", "texte"],
  type: ["type", "categorie", "nature"],
  pseudo: ["pseudonyme", "pseudo", "remplacement", "substitut"],
};

/**
 * Lit un registre Excel ou CSV.
 *
 * Les en-tetes sont reconnus a la tolerance pres (casse, accents, libelles
 * voisins) ; a defaut, les colonnes sont prises dans l'ordre valeur, type,
 * pseudonyme, le type restant facultatif.
 *
 * @returns {Array<{text: string, type: string, pseudo: string}>}
 */
export async function readRegistry(bytes) {
  const XLSX = await import("xlsx");
  const book = XLSX.read(bytes, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (!rows.length) return [];

  const header = rows[0].map(normalizeHeader);
  const columnFor = (key) =>
    header.findIndex((cell) =>
      HEADER_ALIASES[key].some((alias) => cell.includes(alias)),
    );

  let iText = columnFor("text");
  let iType = columnFor("type");
  let iPseudo = columnFor("pseudo");

  const hasHeader = iText >= 0 || iPseudo >= 0;
  if (!hasHeader) {
    iText = 0;
    iType = rows[0].length > 2 ? 1 : -1;
    iPseudo = rows[0].length > 2 ? 2 : 1;
  }

  return rows
    .slice(hasHeader ? 1 : 0)
    .map((row) => ({
      text: String(row[iText] ?? "").trim(),
      type: (String(row[iType] ?? "").trim() || "PERSONNE").toUpperCase(),
      pseudo: String(row[iPseudo] ?? "").trim(),
    }))
    .filter((entry) => entry.text && entry.pseudo);
}

/** Serialise les correspondances au format Excel. */
export async function buildRegistryWorkbook(terms) {
  const XLSX = await import("xlsx");
  const rows = [
    ["Donnée personnelle", "Type", "Pseudonyme", "Occurrences"],
    ...terms.map((t) => [t.text, t.type, t.pseudo, t.hits.length]),
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Registre");
  return XLSX.write(book, { bookType: "xlsx", type: "array" });
}
