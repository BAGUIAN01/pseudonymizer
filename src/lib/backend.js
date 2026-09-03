/**
 * Couche d'acces au backend.
 *
 * Sous Tauri, chaque fonction delegue a une commande Rust (voir
 * `src-tauri/src/commands.rs`). Hors Tauri — pendant le developpement dans un
 * navigateur — elle bascule sur une implementation de secours : lecture du
 * fichier cote client quand c'est possible, document d'exemple sinon, et
 * telechargement par Blob au lieu d'une ecriture disque.
 *
 * C'est le seul fichier a modifier quand les commandes Rust seront ecrites.
 */
import { SAMPLE_DOCUMENT, SAMPLE_REGISTRY } from "@/lib/sample-doc";

export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Charge dynamiquement l'API Tauri : absente du bundle navigateur. */
async function tauri() {
  const [{ invoke }, dialog, opener] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-opener"),
  ]);
  return { invoke, ...dialog, ...opener };
}

const DOC_FILTERS = [
  { name: "Documents", extensions: ["pdf", "docx", "xlsx", "txt"] },
];
const REGISTRY_FILTERS = [
  { name: "Registre de correspondances", extensions: ["xlsx", "xls", "csv"] },
];

/* ------------------------------------------------------------------ */
/* Selection et extraction de documents                                */
/* ------------------------------------------------------------------ */

/**
 * Ouvre le selecteur de fichiers et extrait le document choisi.
 * @returns {Promise<null | {fileName, path, format, title, paragraphs}>}
 */
export async function pickDocument() {
  if (!isTauri()) return pickDocumentInBrowser();

  const { invoke, open } = await tauri();
  const path = await open({ multiple: false, filters: DOC_FILTERS });
  if (!path) return null;
  return invoke("extract_document", { path });
}

/** Extrait un fichier deja obtenu par glisser-deposer. */
export async function extractDroppedFile(file, path) {
  if (isTauri() && path) {
    const { invoke } = await tauri();
    return invoke("extract_document", { path });
  }
  return readFileInBrowser(file);
}

async function pickDocumentInBrowser() {
  const file = await promptForFile(".pdf,.docx,.xlsx,.txt");
  if (!file) return null;
  return readFileInBrowser(file);
}

/**
 * Hors Tauri, seuls les fichiers texte sont vraiment lisibles cote client.
 * Pour les autres formats on retombe sur le document d'exemple, en conservant
 * le nom du fichier choisi pour que l'interface reste coherente.
 */
async function readFileInBrowser(file) {
  const format = (file.name.split(".").pop() ?? "txt").toLowerCase();

  if (format === "txt") {
    const text = await file.text();
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean);
    return {
      fileName: file.name,
      path: "",
      format,
      title: file.name.replace(/\.[^.]+$/, ""),
      paragraphs: paragraphs.length ? paragraphs : [text],
    };
  }

  return { ...SAMPLE_DOCUMENT, fileName: file.name, format };
}

function promptForFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), {
      once: true,
    });
    // Si l'utilisateur annule, `change` ne se declenche jamais : on s'appuie
    // sur le retour de focus pour resoudre la promesse.
    window.addEventListener(
      "focus",
      () => setTimeout(() => resolve(input.files?.[0] ?? null), 300),
      { once: true },
    );
    input.click();
  });
}

/* ------------------------------------------------------------------ */
/* Registre de correspondances                                         */
/* ------------------------------------------------------------------ */

/**
 * Ouvre et lit un registre Excel.
 * @returns {Promise<null | {fileName: string, terms: Array}>}
 */
export async function pickRegistry() {
  if (!isTauri()) {
    const file = await promptForFile(".xlsx,.xls,.csv");
    if (!file) return null;
    return { fileName: file.name, terms: SAMPLE_REGISTRY };
  }

  const { invoke, open } = await tauri();
  const path = await open({ multiple: false, filters: REGISTRY_FILTERS });
  if (!path) return null;
  const terms = await invoke("read_registry", { path });
  return { fileName: path.split(/[\/]/).pop(), terms };
}

/* ------------------------------------------------------------------ */
/* Traitement                                                          */
/* ------------------------------------------------------------------ */

/**
 * Applique les substitutions et produit les livrables.
 *
 * @param {object} args
 * @param {object} args.document  document extrait
 * @param {Array}  args.terms     correspondances
 * @param {boolean} args.reverse  true = de-pseudonymisation
 * @returns {Promise<{documentPath: string|null, registryPath: string|null}>}
 */
export async function runProcessing({ document: doc, terms, reverse }) {
  if (!isTauri()) {
    // Hors Tauri, rien n'est ecrit sur le disque : le traitement se resume
    // au calcul deja fait cote client, l'ecran de resultat s'appuie dessus.
    return { documentPath: null, registryPath: null };
  }

  const { invoke } = await tauri();
  const payload = terms.map((t) => ({
    text: t.text,
    type: t.type,
    pseudo: t.pseudo,
    occurrences: t.hits.length,
  }));
  const result = await invoke("apply_pseudonymisation", {
    sourcePath: doc.path,
    terms: payload,
    reverse,
  });
  return {
    documentPath: result.document_path,
    registryPath: result.registry_path,
  };
}

/* ------------------------------------------------------------------ */
/* Livrables                                                           */
/* ------------------------------------------------------------------ */

/** Ouvre l'explorateur sur un fichier produit. */
export async function revealInFolder(path) {
  if (!isTauri() || !path) return;
  const { invoke } = await tauri();
  await invoke("reveal_in_folder", { path });
}

/** Telechargement de secours (navigateur) : ecrit un Blob. */
export function downloadBlob(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Serialise les correspondances au format CSV (separateur point-virgule). */
export function registryToCsv(terms) {
  const rows = [["Donnée personnelle", "Type", "Pseudonyme", "Occurrences"]].concat(
    terms.map((t) => [t.text, t.type, t.pseudo, String(t.hits.length)]),
  );
  return rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
}
