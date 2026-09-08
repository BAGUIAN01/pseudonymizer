/**
 * Document de demonstration, utilise quand l'application tourne hors Tauri
 * (developpement dans le navigateur) ou via le bouton "charger l'exemple".
 * Reprend l'exercice du support de formation Filtre IA.
 */
export const SAMPLE_DOCUMENT = {
  // Marque l'exercice comme tel : il ne doit jamais entrer dans un projet.
  exercice: true,
  fileName: "Exercice 1.pdf",
  path: "",
  format: "pdf",
  title: "Convention de partenariat — Exercice 1",
  paragraphs: [
    "Entre SahelTech Industries, représentée par sa directrice Mariama Diallo, dont le siège est situé 12 rue Carnot, Dakar — NINEA 004512789.",
    "Et le programme Baobab Numérique, dont le point de contact est Ousmane Fall (o.fall@baobab-num.sn, +221 77 812 44 09).",
    "Le montant global de la convention est fixé à 48 500 000 FCFA, versé en trois tranches. La coordination opérationnelle est confiée à Awa Sarr.",
  ],
};

/**
 * Le meme exercice, une fois pseudonymise : c'est ce document que le mode
 * de-pseudonymisation attend en entree, aux cotes du registre ci-dessous.
 */
export const SAMPLE_PSEUDONYMISED_DOCUMENT = {
  exercice: true,
  fileName: "Exercice 1_pseudonymise.pdf",
  path: "",
  format: "pdf",
  title: "Convention de partenariat — Exercice 1",
  paragraphs: [
    "Entre [ENTREPRISE_0001], représentée par sa directrice [PERSONNE_0001], dont le siège est situé 12 rue Carnot, Dakar — NINEA 004512789.",
    "Et le programme [PROGRAMME_0001], dont le point de contact est [PERSONNE_0002] ([EMAIL_0001], +221 77 812 44 09).",
    "Le montant global de la convention est fixé à 48 500 000 FCFA, versé en trois tranches. La coordination opérationnelle est confiée à [PERSONNE_0003].",
  ],
};

/**
 * Registre de correspondances de demonstration, pour tester le mode
 * de-pseudonymisation sans passer par un vrai fichier Excel.
 */
export const SAMPLE_REGISTRY = [
  { text: "SahelTech Industries", type: "ENTREPRISE", pseudo: "[ENTREPRISE_0001]" },
  { text: "Mariama Diallo", type: "PERSONNE", pseudo: "[PERSONNE_0001]" },
  { text: "Baobab Numérique", type: "PROGRAMME", pseudo: "[PROGRAMME_0001]" },
  { text: "Ousmane Fall", type: "PERSONNE", pseudo: "[PERSONNE_0002]" },
  { text: "o.fall@baobab-num.sn", type: "EMAIL", pseudo: "[EMAIL_0001]" },
  { text: "Awa Sarr", type: "PERSONNE", pseudo: "[PERSONNE_0003]" },
];
