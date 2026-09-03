/**
 * Les neuf categories de donnees personnelles reconnues par l'application,
 * avec la couleur d'accentuation utilisee pour le surlignage dans le document
 * et dans le panneau de correspondances.
 */
export const TERM_TYPES = [
  { value: "PERSONNE", label: "Personne", color: "#CBFF4D" },
  { value: "ENTREPRISE", label: "Entreprise", color: "#6EE7FF" },
  { value: "PROGRAMME", label: "Programme", color: "#C4A6FF" },
  { value: "ADRESSE", label: "Adresse", color: "#8FE3B0" },
  { value: "EMAIL", label: "E-mail", color: "#FFC46E" },
  { value: "TELEPHONE", label: "Téléphone", color: "#FF9BD2" },
  { value: "IDENTIFIANT", label: "Identifiant", color: "#9AB4FF" },
  { value: "MONTANT", label: "Montant", color: "#FFE066" },
  { value: "DATE", label: "Date", color: "#B7C4CF" },
];

const BY_VALUE = Object.fromEntries(TERM_TYPES.map((t) => [t.value, t]));

export const DEFAULT_TYPE = "PERSONNE";

export function typeColor(value) {
  return (BY_VALUE[value] ?? BY_VALUE[DEFAULT_TYPE]).color;
}

export function typeLabel(value) {
  return (BY_VALUE[value] ?? BY_VALUE[DEFAULT_TYPE]).label;
}

/**
 * Construit un pseudonyme au format `[TYPE_0001]`.
 * L'index est calcule par type, comme dans le logiciel existant.
 */
export function buildPseudo(type, index) {
  return `[${type}_${String(index).padStart(4, "0")}]`;
}
