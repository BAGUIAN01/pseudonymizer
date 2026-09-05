/**
 * Tokenisation et reperage des occurrences.
 *
 * Le document est decoupe en tokens en conservant les separateurs, ce qui
 * permet de reconstruire le texte source a l'identique et de surligner des
 * mots individuels sans casser la ponctuation.
 */

/**
 * Un "mot" accepte les lettres accentuees, et les liaisons internes `.`, `'`,
 * `@`, `_` et `-` afin qu'une adresse e-mail, un nom compose ou un pseudonyme
 * `TYPE_0001` reste un seul token.
 */
export const WORD_RE =
  /[0-9A-Za-zÀ-ÖØ-öø-ÿ]+(?:[.'’@_-][0-9A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

/**
 * Decoupe un paragraphe en tokens `{ text, word }`.
 * Les separateurs (espaces, ponctuation) sont conserves avec `word: false`.
 */
export function tokenize(text) {
  const out = [];
  let last = 0;
  let m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), word: false });
    out.push({ text: m[0], word: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), word: false });
  return out;
}

/** Tokenise un document entier (tableau de paragraphes). */
export function tokenizeDocument(paragraphs) {
  return paragraphs.map(tokenize);
}

/**
 * Ramene un mot a une forme comparable : minuscules, sans accents, apostrophes
 * uniformisees.
 *
 * Un registre est saisi a la main ou vient d'un autre document : « Sonatel »
 * y cotoie « SONATEL », « Ndiaye » y perd son accent, et l'apostrophe typo-
 * graphique remplace l'apostrophe droite. Comparer les formes brutes ferait
 * echouer ces correspondances alors qu'elles designent la meme donnee.
 */
export function normaliseWord(word) {
  return String(word)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’ʼ]/g, "'")
    .toLowerCase();
}

/** Indices des tokens qui sont des mots, dans l'ordre. */
function wordIndexes(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) if (tokens[i].word) out.push(i);
  return out;
}

/**
 * Reconstruit le texte d'une plage de tokens, en retirant la ponctuation
 * parasite aux extremites (mais en gardant un point final d'abreviation).
 */
export function phraseAt(doc, p, from, to) {
  const tokens = doc[p];
  if (!tokens) return "";
  return tokens
    .slice(from, to + 1)
    .map((t) => t.text)
    .join("")
    .trim()
    .replace(/^[^0-9A-Za-zÀ-ÿ]+|[^0-9A-Za-zÀ-ÿ.]+$/g, "");
}

/**
 * Retrouve toutes les occurrences d'une expression dans le document.
 * La comparaison se fait mot a mot, insensible a la casse, ce qui rend le
 * reperage insensible aux differences d'espacement ou de ponctuation.
 *
 * @returns {Array<{p: number, from: number, to: number}>}
 */
export function findOccurrences(doc, phrase) {
  const words = (String(phrase).match(WORD_RE) ?? []).map(normaliseWord);
  const hits = [];
  if (!words.length) return hits;

  doc.forEach((tokens, p) => {
    const idx = wordIndexes(tokens);
    for (let k = 0; k + words.length <= idx.length; k++) {
      let ok = true;
      for (let j = 0; j < words.length; j++) {
        if (normaliseWord(tokens[idx[k + j]].text) !== words[j]) {
          ok = false;
          break;
        }
      }
      if (ok) hits.push({ p, from: idx[k], to: idx[k + words.length - 1] });
    }
  });
  return hits;
}

/**
 * Table `"p:i" -> { term, first, last }` des tokens couverts par un terme.
 * Utilisee par le rendu pour savoir quel token appartient a quelle occurrence.
 */
export function buildMarks(terms) {
  const marks = {};
  for (const term of terms) {
    for (const hit of term.hits) {
      for (let i = hit.from; i <= hit.to; i++) {
        marks[`${hit.p}:${i}`] = {
          term,
          hit,
          first: i === hit.from,
          last: i === hit.to,
        };
      }
    }
  }
  return marks;
}

/**
 * Applique les substitutions et renvoie le texte resultant, paragraphe par
 * paragraphe. `reverse` remplace les pseudonymes par les valeurs d'origine.
 */
export function applyTerms(doc, terms, { reverse = false } = {}) {
  if (reverse) {
    // En dé-pseudonymisation le document contient deja les pseudonymes :
    // une substitution textuelle simple suffit.
    return doc.map((tokens) => {
      let text = tokens.map((t) => t.text).join("");
      for (const term of terms) text = text.split(term.pseudo).join(term.text);
      return text;
    });
  }

  return doc.map((tokens, p) => {
    let out = "";
    let i = 0;
    while (i < tokens.length) {
      let matched = null;
      for (const term of terms) {
        const hit = term.hits.find((h) => h.p === p && h.from === i);
        if (hit) {
          matched = { term, hit };
          break;
        }
      }
      if (matched) {
        out += matched.term.pseudo;
        i = matched.hit.to + 1;
        continue;
      }
      out += tokens[i].text;
      i++;
    }
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* Entites                                                             */
/* ------------------------------------------------------------------ */

/**
 * Separateurs admis a l'interieur d'une entite : une entite se lit d'un trait,
 * donc tout signe fort (point, virgule, retour) la termine.
 */
const ENTITY_GAP_RE = /^[ \u00A0'\u2019-]*$/;
const ENTITY_CAP_RE = /^[A-ZÀ-ÖØ-Þ]/;

/** Ces mots traversent une entite sans jamais l'ouvrir ni la fermer. */
const ENTITY_PARTICLES = new Set([
  "de", "du", "des", "d", "le", "la", "les", "van", "von", "der", "den",
  "el", "al", "bin", "ben", "da", "dos",
]);

/**
 * Mots capitalises par leur seule position en tete de phrase, ou titres de
 * civilite : ils ne font jamais partie de l'entite voisine. Sans cette liste,
 * un double-clic sur « Marie » dans « Ensuite Marie a signe » capturerait
 * « Ensuite Marie ».
 *
 * Les particules `de`, `du`, `des`, `d` en sont volontairement absentes : elles
 * doivent rester traversables au milieu d'une raison sociale.
 */
const ENTITY_STOP = new Set([
  "ensuite", "puis", "enfin", "cependant", "toutefois", "ainsi", "donc", "or",
  "mais", "car", "ce", "cet", "cette", "ces", "il", "elle", "ils", "elles",
  "nous", "vous", "je", "tu", "on", "son", "sa", "ses", "leur", "leurs",
  "notre", "nos", "votre", "vos", "au", "aux", "dans", "pour", "par", "sur",
  "sous", "avec", "sans", "avant", "après", "apres", "depuis", "lorsque",
  "quand", "si", "comme", "tout", "tous", "toute", "toutes", "chaque",
  "aucun", "plusieurs", "certains", "un", "une", "ledit", "ladite",
  "monsieur", "madame", "mademoiselle", "docteur", "maitre", "maître",
]);

function isStopWord(token) {
  return token.word && ENTITY_STOP.has(token.text.toLowerCase());
}

function isCapitalised(token) {
  return token.word && ENTITY_CAP_RE.test(token.text);
}

function isParticle(token) {
  return token.word && ENTITY_PARTICLES.has(token.text.toLowerCase());
}

/**
 * Index du mot voisin dans la direction `step`, ou -1 si ce qui les separe
 * n'appartient pas a une entite.
 */
function neighbourWord(tokens, i, step) {
  let gap = "";
  for (let k = i + step; k >= 0 && k < tokens.length; k += step) {
    if (tokens[k].word) return ENTITY_GAP_RE.test(gap) ? k : -1;
    gap += tokens[k].text;
  }
  return -1;
}

/**
 * Etend la position d'un mot a l'entite qui l'entoure : les mots capitalises
 * adjacents sont pris ensemble, de sorte qu'un double-clic sur « Jean »
 * capture « Jean Dupont », et « Societe Generale de Banques » d'un bloc.
 *
 * Un mot en minuscules n'etend rien : il n'y a aucune raison de deviner une
 * entite autour de lui.
 *
 * @returns {{p: number, from: number, to: number}|null}
 */
export function entityRangeAt(doc, p, i) {
  const tokens = doc[p];
  if (!tokens?.[i]?.word) return null;

  let from = i;
  let to = i;

  if (isCapitalised(tokens[i])) {
    for (;;) {
      const k = neighbourWord(tokens, from, -1);
      if (k < 0 || isStopWord(tokens[k])) break;
      if (!isCapitalised(tokens[k]) && !isParticle(tokens[k])) break;
      from = k;
    }
    for (;;) {
      const k = neighbourWord(tokens, to, 1);
      if (k < 0 || isStopWord(tokens[k])) break;
      if (!isCapitalised(tokens[k]) && !isParticle(tokens[k])) break;
      to = k;
    }
  }

  // Une particule capturee en bout de plage n'appartient pas a l'entite.
  while (from < to && isParticle(tokens[from])) from = neighbourWord(tokens, from, 1);
  while (to > from && isParticle(tokens[to])) to = neighbourWord(tokens, to, -1);

  return { p, from, to };
}
