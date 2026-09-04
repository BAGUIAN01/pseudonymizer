/**
 * Les neuf categories de donnees personnelles reconnues par l'application.
 *
 * Neuf categories ne portent pas neuf couleurs : ce serait un nuancier, et le
 * document deviendrait penible a lire. Elles sont regroupees en quatre
 * familles, et c'est la famille qui porte la teinte — reprise de la palette de
 * graphiques deja definie dans le theme, pour ne pas introduire de couleurs
 * etrangeres a l'interface.
 *
 * Le vert de `--primary` reste absent de ces teintes : il signale l'action, et
 * le reutiliser comme categorie diluerait ce sens.
 *
 * Dans le document, la couleur ne touche que le filet de soulignement et un
 * fond tres faible ; le texte garde sa couleur de lecture.
 */

/** Les quatre familles et leur teinte, en composantes RVB separees. */
export const TERM_FAMILIES = {
  PERSONNES: { label: "Personnes", rgb: "196 166 255" },
  ORGANISATIONS: { label: "Organisations", rgb: "110 231 255" },
  COORDONNEES: { label: "Coordonnées", rgb: "143 227 176" },
  REFERENCES: { label: "Références", rgb: "255 196 110" },
};

export const TERM_TYPES = [
  { value: "PERSONNE", label: "Personne", family: "PERSONNES" },
  { value: "ENTREPRISE", label: "Entreprise", family: "ORGANISATIONS" },
  { value: "PROGRAMME", label: "Programme", family: "ORGANISATIONS" },
  { value: "ADRESSE", label: "Adresse", family: "COORDONNEES" },
  { value: "EMAIL", label: "E-mail", family: "COORDONNEES" },
  { value: "TELEPHONE", label: "Téléphone", family: "COORDONNEES" },
  { value: "IDENTIFIANT", label: "Identifiant", family: "REFERENCES" },
  { value: "MONTANT", label: "Montant", family: "REFERENCES" },
  { value: "DATE", label: "Date", family: "REFERENCES" },
];

const BY_VALUE = Object.fromEntries(TERM_TYPES.map((t) => [t.value, t]));

export const DEFAULT_TYPE = "PERSONNE";

function typeEntry(value) {
  return BY_VALUE[value] ?? BY_VALUE[DEFAULT_TYPE];
}

export function typeLabel(value) {
  return typeEntry(value).label;
}

/**
 * Composantes RVB de la famille d'un type, a composer avec l'opacite voulue :
 * `rgb(${typeRgb(type)} / 0.12)`.
 */
export function typeRgb(value) {
  return TERM_FAMILIES[typeEntry(value).family].rgb;
}

/** Nom de la famille, pour les infobulles et la legende. */
export function familyLabel(value) {
  return TERM_FAMILIES[typeEntry(value).family].label;
}

/**
 * Construit un pseudonyme au format `[TYPE_0001]`.
 * L'index est calcule par type, comme dans le logiciel existant.
 */
export function buildPseudo(type, index) {
  return `[${type}_${String(index).padStart(4, "0")}]`;
}
