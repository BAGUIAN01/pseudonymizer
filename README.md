# Anonymizer — Filtre IA

Application de pseudonymisation et de dé-pseudonymisation de documents, pour
Windows, macOS, Linux, Android et iOS. Tout se passe sur la machine : aucune
donnée personnelle ne quitte le poste.

Elle remplace l'ancien logiciel Tkinter, qui demandait de préparer à la main un
fichier Excel des valeurs à remplacer : ici, les données structurées sont
pré-détectées et le reste se sélectionne directement dans le texte.

## Fonctionnement

1. **Pseudonymiser** — on charge un document ; e-mails, téléphones, montants,
   identifiants, dates et adresses sont pré-détectés. On complète en cliquant
   les mots, on ajuste type et pseudonyme, puis on lance. Sortie : le document
   dans son format d'origine et un registre des correspondances.
2. **Dé-pseudonymiser** — on charge le document et son registre ; les valeurs
   d'origine sont restaurées.

Formats pris en charge : `.docx`, `.xlsx`, `.pdf`, `.txt`, `.md`, `.csv`. Les
autres sont refusés plutôt que mal rendus.

## Pile technique

Next.js 16 (export statique) · shadcn/ui + Tailwind v4 · Zustand ·
pdf.js, mammoth, SheetJS · Tauri v2 (Rust). L'interface est entièrement
cliente, sans serveur Node dans le binaire.

## Démarrer

```bash
npm install
npm run dev          # interface seule, dans le navigateur
npm run tauri:dev    # application complète (nécessite Rust)
```

`tauri:dev` et `tauri:build` demandent [Rust](https://rustup.rs) (et, sous
Windows, les Build Tools Visual Studio C++). Sans Rust, `npm run dev` lit déjà
les vrais documents ; seule l'écriture du document de sortie exige le code
natif.

## Empaqueter

| Cible | Commande |
| --- | --- |
| Bureau (plateforme courante) | `npm run tauri:build` |
| Android (APK, AAB) | `npm run android:build` |
| iOS (IPA, macOS requis) | `npm run ios:build` |

Le workflow `.github/workflows/paquets.yml` construit les paquets des trois
systèmes. Détails : [docs/empaquetage.md](docs/empaquetage.md) ; notice
utilisateur : [docs/installer.md](docs/installer.md).

## Organisation

```
src/components/   interface (bureau et tactile)
src/lib/          tokenisation, pré-détection, extraction, appels natifs
src/store/        état applicatif (Zustand)
src-tauri/        code natif Rust et commandes exposées
```

## Pour aller plus loin

Les choix d'interface, la disposition tactile et le comportement des livrables
sont expliqués dans [docs/conception.md](docs/conception.md).

Reste à faire : confirmer l'interopérabilité du registre avec l'ancien logiciel
à partir d'un fichier d'exemple.
