"use client";

/**
 * Couche d'acces au systeme de fichiers et au code natif.
 *
 * La lecture des documents se fait toujours en JavaScript (voir
 * `src/lib/extract.js`) : c'est le meme code sous Tauri et dans un navigateur,
 * et il n'y a donc qu'un seul comportement a maintenir. Seule difference : sous
 * Tauri on obtient les octets par un chemin disque, dans un navigateur par un
 * objet `File`.
 *
 * Le code natif n'est sollicite que pour ecrire le document de sortie dans son
 * format d'origine et pour ouvrir l'explorateur de fichiers.
 */
import {
  buildRegistryWorkbook,
  extractDocument,
  readRegistry,
  SUPPORTED_FORMATS,
} from "@/lib/extract";

export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Charge l'API Tauri a la demande : absente du bundle navigateur.
 *
 * Les modules sont renvoyes nommes, et surtout pas fusionnes : `dialog`, `fs`
 * et `opener` exportent chacun une fonction `open`, aux signatures
 * incompatibles. Les aplatir faisait gagner le dernier etale, et le selecteur
 * de fichiers appelait en realite « ouvrir ce chemin avec l'application par
 * defaut ».
 */
async function tauri() {
  const [core, dialog, fs, opener] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
    import("@tauri-apps/plugin-opener"),
  ]);
  return { core, dialog, fs, opener };
}

const DOC_FILTERS = [{ name: "Documents", extensions: SUPPORTED_FORMATS }];
const REGISTRY_FILTERS = [
  { name: "Registre de correspondances", extensions: ["xlsx", "xls", "csv"] },
];

const DOC_ACCEPT = ".pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.csv";
const REGISTRY_ACCEPT = ".xlsx,.xls,.csv";

/* ------------------------------------------------------------------ */
/* Selection de fichiers                                               */
/* ------------------------------------------------------------------ */

/** Ouvre le selecteur natif et renvoie `{ name, bytes, path }`, ou null. */
async function chooseFile(filters, accept) {
  if (isTauri()) {
    const { dialog, fs } = await tauri();
    const path = await dialog.open({ multiple: false, filters });
    if (!path) return null;
    return {
      name: path.split(/[\\/]/).pop(),
      bytes: await fs.readFile(path),
      path,
    };
  }

  const file = await promptForFile(accept);
  if (!file) return null;
  return { name: file.name, bytes: await file.arrayBuffer(), path: "" };
}

function promptForFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    // Certaines webviews n'ouvrent la boite de dialogue que pour un champ
    // reellement present dans le document.
    document.body.appendChild(input);

    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener("change", () => settle(input.files?.[0] ?? null), {
      once: true,
    });
    // Annulation : evenement standard des navigateurs et webviews recents.
    input.addEventListener("cancel", () => settle(null), { once: true });

    // Repli pour les rares moteurs qui n'emettent pas `cancel`. Le retour de
    // focus n'est ecoute qu'une fois que la boite de dialogue l'a
    // effectivement pris : l'ecouter des le depart resolvait la promesse au
    // moment meme du clic, lorsque la fenetre n'avait pas encore le focus, et
    // le fichier choisi ensuite etait ignore en silence.
    window.addEventListener(
      "blur",
      () => {
        window.addEventListener(
          "focus",
          () => setTimeout(() => settle(input.files?.[0] ?? null), 500),
          { once: true },
        );
      },
      { once: true },
    );

    input.click();
  });
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

/** Ouvre le selecteur de fichiers et extrait le document choisi. */
export async function pickDocument() {
  const chosen = await chooseFile(DOC_FILTERS, DOC_ACCEPT);
  if (!chosen) return null;
  return extractDocument(chosen.name, chosen.bytes, chosen.path);
}

/**
 * Extrait un document depose par glisser-deposer.
 *
 * @param {File|null} file objet du navigateur, absent sous Tauri
 * @param {string} [path] chemin fourni par la webview Tauri
 */
export async function extractDroppedFile(file, path) {
  if (path) {
    const { fs } = await tauri();
    const name = path.split(/[\\/]/).pop();
    return extractDocument(name, await fs.readFile(path), path);
  }
  if (!file) return null;
  return extractDocument(file.name, await file.arrayBuffer());
}

/* ------------------------------------------------------------------ */
/* Registre de correspondances                                         */
/* ------------------------------------------------------------------ */

/** Ouvre et lit un registre Excel ou CSV. */
export async function pickRegistry() {
  const chosen = await chooseFile(REGISTRY_FILTERS, REGISTRY_ACCEPT);
  if (!chosen) return null;
  const terms = await readRegistry(chosen.bytes);
  if (!terms.length) {
    throw new Error("Aucune correspondance lisible dans ce fichier");
  }
  return { fileName: chosen.name, path: chosen.path, terms };
}

/** Lit un registre depose par glisser-deposer. */
export async function readDroppedRegistry(file, path) {
  if (path) {
    const { fs } = await tauri();
    return {
      fileName: path.split(/[\\/]/).pop(),
      path,
      terms: await readRegistry(await fs.readFile(path)),
    };
  }
  if (!file) return null;
  return {
    fileName: file.name,
    path: "",
    terms: await readRegistry(await file.arrayBuffer()),
  };
}

/* ------------------------------------------------------------------ */
/* Traitement                                                          */
/* ------------------------------------------------------------------ */

/**
 * Applique les substitutions et produit les livrables.
 *
 * @returns {Promise<{documentPath: string|null, registryPath: string|null}>}
 */
export async function runProcessing({ document: doc, terms, reverse }) {
  if (!isTauri() || !doc?.path) {
    // Hors Tauri rien n'est ecrit sur le disque : le resultat s'obtient par
    // les boutons de telechargement, a partir du texte calcule cote client.
    return { documentPath: null, registryPath: null };
  }

  const { core } = await tauri();
  const result = await core.invoke("apply_pseudonymisation", {
    sourcePath: doc.path,
    terms: terms.map((t) => ({
      text: t.text,
      type: t.type,
      pseudo: t.pseudo,
      occurrences: t.hits.length,
    })),
    reverse,
  });

  // Le registre n'a de sens qu'en pseudonymisation : c'est lui qui rend la
  // restauration possible. Il est construit ici par SheetJS, deja utilise pour
  // le relire, puis ecrit par le natif — le plugin `fs` ne peut pas ecrire
  // ailleurs que dans `$DOCUMENT` et `$DOWNLOAD`.
  let registryPath = result.registry_path ?? null;
  if (!reverse) {
    const bytes = await buildRegistryWorkbook(terms);
    const base = (doc.fileName ?? "document").replace(/\.[^.]+$/, "");
    registryPath = await core.invoke("write_beside", {
      sourcePath: doc.path,
      fileName: `${base}_correspondances.xlsx`,
      contents: Array.from(new Uint8Array(bytes)),
    });
  }

  return { documentPath: result.document_path, registryPath };
}

/* ------------------------------------------------------------------ */
/* Projets                                                             */
/* ------------------------------------------------------------------ */

const PROJECTS_KEY = "anonymizer.projects";

/**
 * Relit les projets enregistres.
 *
 * Sous Tauri, le stockage est un fichier du dossier de donnees : il survit au
 * vidage du cache de la webview, ce qui n'est pas le cas du `localStorage`.
 * Celui-ci ne sert que hors application installee.
 */
export async function loadProjects() {
  try {
    const raw = isTauri()
      ? await (await tauri()).core.invoke("projects_load")
      : globalThis.localStorage?.getItem(PROJECTS_KEY);
    return normaliseProjects(raw ? JSON.parse(raw) : null);
  } catch {
    // Un fichier illisible ne doit pas empecher l'application de demarrer.
    return { projects: [], activeId: null };
  }
}

/**
 * Accepte l'ancien format — un simple tableau de projets — pour ne pas perdre
 * les projets crees avant que le projet actif ne soit lui aussi retenu.
 */
function normaliseProjects(value) {
  if (Array.isArray(value)) {
    return { projects: value, activeId: null, onboardingDone: false };
  }
  return {
    projects: value?.projects ?? [],
    activeId: value?.activeId ?? null,
    onboardingDone: Boolean(value?.onboardingDone),
  };
}

/** Enregistre les projets et celui qui est actif. */
export async function saveProjects({ projects, activeId, onboardingDone }) {
  const raw = JSON.stringify({ projects, activeId, onboardingDone });
  if (!isTauri()) {
    globalThis.localStorage?.setItem(PROJECTS_KEY, raw);
    return;
  }
  const { core } = await tauri();
  await core.invoke("projects_save", { contents: raw });
}

/* ------------------------------------------------------------------ */
/* Livrables                                                           */
/* ------------------------------------------------------------------ */

/**
 * Depose une copie des livrables dans un dossier choisi par l'utilisateur.
 *
 * Sous Tauri les fichiers existent deja a cote du document source : telecharger
 * revient a en copier un exemplaire la ou l'utilisateur le souhaite. Un seul
 * choix de dossier suffit pour l'ensemble des livrables.
 *
 * @returns {Promise<string[]|null>} chemins ecrits, ou null si l'utilisateur annule
 */
export async function downloadToFolder(paths) {
  const wanted = paths.filter(Boolean);
  if (!wanted.length) return null;

  const { core, dialog } = await tauri();
  const dir = await dialog.open({ directory: true, multiple: false });
  if (!dir) return null;

  return core.invoke("copy_to_dir", { paths: wanted, dir });
}

/** Declenche l'enregistrement d'un fichier par le navigateur. */
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

/** Enregistre le registre au format Excel. */
export async function saveRegistry(terms) {
  const bytes = await buildRegistryWorkbook(terms);
  downloadBlob(
    "Registre_correspondances.xlsx",
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
