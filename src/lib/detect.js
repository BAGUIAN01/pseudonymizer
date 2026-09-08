import { findOccurrences, WORD_RE } from "@/lib/tokenize";
import { DEFAULT_TYPE } from "@/lib/types";

/**
 * Pre-detection automatique, par expressions regulieres, des donnees
 * structurees d'un document. Tout se passe en local, sans modele.
 *
 * Les noms de personnes, entreprises et programmes ne sont volontairement pas
 * detectes ici : ils demandent un modele de reconnaissance d'entites nommees.
 * L'utilisateur les selectionne a la main dans le document.
 */
const PATTERNS = [
  {
    type: "EMAIL",
    re: /[0-9A-Za-zÀ-ÖØ-öø-ÿ._%+-]+@[0-9A-Za-z.-]+\.[A-Za-z]{2,}/g,
  },
  {
    // Formats internationaux et locaux : +221 77 812 44 09, 77 812 44 09.
    // Au moins deux groupes separes sont exiges, faute de quoi une suite de
    // chiffres collee comme un NINEA serait prise pour un numero.
    //
    // Le `+` initial est capture. Il ne l'etait pas tant qu'une occurrence
    // s'arretait au premier et au dernier token de mot : il restait alors hors
    // du surlignage et hors du remplacement, et le document sortait avec
    // « +[TELEPHONE_0001] ». `findOccurrences` sait desormais etendre une
    // occurrence a ses bordures.
    type: "TELEPHONE",
    re: /\+?(?:\d{2,3}[\s.-]){2,}\d{2,3}/g,
    validate: (s) => s.replace(/\D/g, "").length >= 9,
  },
  {
    type: "MONTANT",
    re: /\d[\d\s.,]*\s?(?:FCFA|XOF|EUR|USD|€|\$)/gi,
  },
  {
    // NINEA, RCCM, numeros de registre : suites longues de chiffres
    type: "IDENTIFIANT",
    re: /\b\d{6,}\b/g,
  },
  {
    type: "DATE",
    re: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4}\b/gi,
  },
  {
    type: "ADRESSE",
    re: /\b\d{1,4}\s+(?:rue|avenue|av\.|boulevard|bd|route|impasse|allée|allee|place)\s+[0-9A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40}/gi,
  },
];

/**
 * Devine le type d'une expression selectionnee a la main.
 * Reprend les heuristiques du logiciel existant.
 */
export function guessType(text) {
  const t = String(text);
  if (t.includes("@")) return "EMAIL";
  if (/FCFA|XOF|€|\$/i.test(t)) return "MONTANT";
  if (/^\d{1,4}\s+(?:rue|avenue|bd|boulevard|route|place)/i.test(t)) return "ADRESSE";
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(t)) return "DATE";
  // Un identifiant est une suite de chiffres d'un seul tenant ; un numero de
  // telephone comporte des separateurs. L'ordre des deux tests compte.
  if (/^\d{6,}$/.test(t)) return "IDENTIFIANT";
  if (/^\+?\d[\d\s.-]{7,}$/.test(t)) return "TELEPHONE";
  return DEFAULT_TYPE;
}

/**
 * Parcourt le document et renvoie les expressions detectees, dedupliquees et
 * accompagnees de leurs occurrences.
 *
 * @param {string[]} paragraphs texte brut du document
 * @param {Array} doc          le meme document, tokenise
 * @returns {Array<{text: string, type: string}>}
 */
export function autoDetect(paragraphs, doc) {
  const seen = new Map();

  for (const para of paragraphs) {
    for (const { type, re, validate } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(para))) {
        const raw = m[0].trim().replace(/[.,;:]$/, "");
        if (!raw || (validate && !validate(raw))) continue;
        const key = raw.toLowerCase();
        // Un e-mail contient des chiffres : on garde la premiere detection,
        // l'ordre des motifs faisant office de priorite.
        if (!seen.has(key)) seen.set(key, { text: raw, type });
      }
    }
  }

  // Ecarte les detections qui ne sont qu'un fragment d'une autre
  // (le "004512789" interne a un identifiant plus long, par exemple).
  const found = [...seen.values()];
  const kept = found.filter(
    (a) =>
      !found.some(
        (b) =>
          b !== a &&
          b.text.length > a.text.length &&
          b.text.toLowerCase().includes(a.text.toLowerCase()),
      ),
  );

  return kept
    .map((item) => ({ ...item, hits: findOccurrences(doc, item.text) }))
    .filter((item) => item.hits.length > 0);
}

/** Compte les mots d'une expression — utile pour trier du plus long au plus court. */
export function wordCount(text) {
  return (String(text).match(WORD_RE) ?? []).length;
}
