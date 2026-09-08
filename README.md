# Anonymizer — Filtre IA

Application de bureau (Windows, macOS, Linux) de pseudonymisation et de
dé-pseudonymisation de documents. Tout le traitement se fait sur la machine :
aucune donnée personnelle ne quitte le poste.

Remplace le logiciel Tkinter existant, dont le mode d'emploi impose de préparer
à la main un fichier Excel des valeurs à remplacer. Ici, les données
structurées sont pré-détectées et les autres se sélectionnent directement dans
le document.

## Les deux flux

**01 — Pseudonymiser.** On charge un document, l'application pré-détecte
e-mails, téléphones, montants, identifiants, dates et adresses par expressions
régulières, l'utilisateur complète la sélection en cliquant les mots dans le
texte (ou en glissant sur plusieurs mots), ajuste le type et le pseudonyme de
chaque terme, puis lance le traitement. Sortie : le document dans son format
d'origine, plus un registre de correspondances.

**02 — Dé-pseudonymiser.** On charge le document pseudonymisé et son registre,
et l'application restaure les valeurs d'origine.

## Pile technique

| Couche | Choix |
| --- | --- |
| Interface | Next.js 16 (App Router, JavaScript, export statique) |
| Composants | shadcn/ui + Tailwind v4 |
| État | Zustand |
| Lecture des documents | pdf.js, mammoth, SheetJS — côté client |
| Coquille native | Tauri v2 (Rust) |

L'interface est entièrement cliente : `output: "export"` produit un dossier
`out/` que Tauri embarque. Pas de serveur Node dans le binaire.

## Démarrer

```bash
npm install
npm run dev          # interface seule, dans le navigateur
npm run tauri:dev    # application complète (nécessite Rust)
npm run tauri:build  # installateur pour la plateforme courante
```

**Rust est requis pour tout ce qui touche à `tauri:dev` / `tauri:build`.**
Installer via [rustup.rs](https://rustup.rs), puis, sous Windows, les
« Build Tools for Visual Studio » avec la charge de travail C++ et WebView2
(déjà présent sur Windows 11).

Sans Rust, `npm run dev` fonctionne et lit déjà les vrais documents :
l'extraction est écrite en JavaScript et tourne à l'identique dans la webview
et dans un navigateur. Seule l'écriture du document de sortie dans son format
d'origine demande le code natif.

## Organisation

```
src/
  app/                     layout (polices, thème), page unique
  components/
    anonymizer-app.jsx     assemblage de la fenêtre
    mode-sidebar.jsx       colonne de gauche : marque, modes, mention locale
    top-bar.jsx            bascule source/résultat, fermeture
    drop-stage.jsx         écran de dépôt
    document-view.jsx      rendu tokenisé et sélection des termes
    term-panel.jsx         liste des correspondances
    deliverables.jsx       récupération des fichiers produits
  lib/
    tokenize.js            découpage, occurrences, substitution
    detect.js              pré-détection par regex, typage heuristique
    types.js               les 9 catégories de données
    extract.js             lecture PDF, DOCX, XLSX, TXT et registres
    backend.js             fichiers, appels natifs, livrables
    sample-doc.js          exercice de démonstration
  store/use-anonymizer.js  état applicatif
src-tauri/
  src/commands.rs          commandes exposées au frontend
```

## Parti pris d'interface

L'application est plate : aucune ombre portée, sauf sur le sélecteur de mode de
la colonne de gauche, seul élément volontairement détaché. Les zones sont
séparées par des filets d'un pixel, pas par des cartes empilées.

Les termes sélectionnés ne sont pas colorisés par catégorie : neuf couleurs dans
un document en font un nuancier illisible. Le surlignage est uniforme, le type
se lit dans le panneau. Le vert citron reste réservé aux actions.

Toute la zone de travail accepte le glisser-déposer, à n'importe quel moment du
flux.

Le registre est un tableau : la valeur et son pseudonyme se lisent en regard,
dans des colonnes qui tiennent d'une ligne à l'autre, et le reste — type,
pseudonyme modifiable, retrait — se déplie sous la ligne. Chaque terme portait
auparavant son sélecteur et son champ en permanence, soit une centaine de
pixels : à quarante termes, le panneau devenait un mur. Une ligne repliée en
fait trente-six.

Le dépli est une rangée de grille qui passe de `0fr` à `1fr` — la hauteur
s'anime sans être mesurée. Replié, il porte `inert` : sans cela le sélecteur et
le champ restaient atteignables au clavier sous une hauteur nulle.

## Au doigt

Sous 768 px, l'application prend une autre disposition. La bascule est faite
par la feuille de style et non par le script : la largeur n'existe pas au rendu
serveur, et attendre un effet pour la mesurer ferait peindre la mauvaise
disposition avant de la corriger. Les deux arbres sont rendus, la requête de
média en montre un, puis l'autre est démonté.

Rien n'est duplique : le store, la lecture des documents, la tokenisation, la
pré-détection et les livrables sont ceux du bureau. Seules les mécaniques qui
n'ont pas d'équivalent tactile sont réécrites.

| Au bureau | Au doigt |
| --- | --- |
| Glisser-déposer | Deux dépôts qui occupent l'écran, sélecteur système |
| Sélection au curseur | Un appui prend le mot |
| Double-clic sur un nom | Un appui long prend l'entité entière |
| Barre ancrée à la sélection | Feuille basse, dans la zone du pouce |
| Panneau latéral de 400 px | Feuille à trois paliers, par-dessus le document |
| Colonne de modes | Deux pastilles flottantes : les modes, puis le projet |

Les barres flottantes sont en verre, et le contenu passe dessous. Leur conteneur
est en `overflow: clip` et non `hidden` : une feuille est plus haute que l'écran
et remontée par une translation, or le navigateur calcule la mise au point sur
la position de mise en page, que la translation ne déplace pas. Avec `hidden`,
appuyer un bouton du bas d'une feuille faisait défiler le conteneur pour
« révéler » ce bouton, et l'écran entier remontait. Un conteneur clippé n'est
pas défilable.

## Empaqueter

`npm run tauri:build` produit l'installeur de la plateforme courante,
`npm run android:build` l'APK et l'AAB, `npm run ios:build` l'IPA. Les projets
natifs mobiles s'engendrent une fois par `npm run tauri android init` et
`npm run tauri ios init`.

Windows exige Windows et une archive iOS exige macOS :
`.github/workflows/paquets.yml` répartit donc le travail sur trois systèmes et
dépose les fichiers en artefacts, prêts à être envoyés. Outils, comptes,
signatures et différences mobiles : [docs/empaquetage.md](docs/empaquetage.md).
Les instructions à joindre aux fichiers : [docs/installer.md](docs/installer.md).

Sur iPhone, aucun fichier ne s'installe sans compte de développeur : la voie
gratuite est Safari, « Sur l'écran d'accueil ». Le manifeste web est en place
pour cela.

## État d'avancement

L'interface et le backend natif sont en place. La réécriture couvre `.docx` et
`.xlsx` (OOXML), `.txt`, `.md`, `.csv` et `.pdf` ; tout autre format est refusé
plutôt que rendu de travers.

Le registre est lu et écrit par SheetJS, avec des en-têtes reconnus à la
tolérance près (casse, accents, libellés voisins) et un repli sur l'ordre des
colonnes. Un fichier d'exemple du dossier `Registres` reste nécessaire pour
confirmer l'interopérabilité avec le logiciel existant.

### Écrire à côté du document

Les livrables s'écrivent dans le dossier du document source. Relancer après
avoir ajusté une correspondance remplace le résultat précédent : numéroter à
chaque essai laisserait une traînée de fichiers.

Sauf si ce fichier est verrouillé. Sous Windows, Word, Excel et les lecteurs
PDF tiennent un verrou exclusif sur ce qu'ils ont ouvert : écraser échoue avec
« le processus ne peut pas accéder au fichier » (os error 32), et tout le
traitement était perdu pour un classeur resté ouvert dans un coin. Le livrable
part alors sous un nom numéroté, et l'interface annonce le nom retenu — le
travail aboutit. Ce repli ne se vérifie pas en test : Linux ne pose pas de
verrou obligatoire, une écriture par-dessus un fichier ouvert y réussit.

Le téléchargement, lui, ne remplace jamais rien : le dossier de destination est
choisi par l'utilisateur et peut contenir un homonyme qui ne vient pas d'ici.

### Bordures d'une occurrence

Une occurrence ne s'arrête plus au premier et au dernier mot : elle s'étend aux
caractères non-mot que l'expression cherchée porte à ses extrémités. Sans cela,
le `+` d'un numéro international restait hors du surlignage et hors du
remplacement — `+221 77 812 44 09` sortait en `+[TELEPHONE_0001]` — et l'aperçu
d'une restauration montrait `[SahelTech Industries]`, crochets compris.

Les séparateurs sont pour cela découpés caractère par caractère : groupés, un
`« [ »` précédé d'une espace formait un seul token, et étendre l'occurrence
jusqu'au crochet aurait avalé l'espace.
