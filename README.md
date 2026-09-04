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

## État d'avancement

L'interface est complète et fonctionnelle. Le backend Rust est déclaré mais pas
encore implémenté : `src-tauri/src/commands.rs` fige les signatures et les types
échangés, chaque commande renvoyant pour l'instant une erreur.

La lecture des documents et des registres est faite, en JavaScript. Restent à
écrire, en Rust :

1. **`apply_pseudonymisation`** — réécriture du document dans son format
   d'origine. Pour le PDF, stratégie retenue : rédaction en place (effacer la
   zone du terme, redessiner le pseudonyme dans la même police, en réduisant le
   corps si le pseudonyme est plus large). Attention aux polices partiellement
   embarquées : les glyphes `[`, `]` et `_` peuvent manquer.
2. **`reveal_in_folder`** — ouverture de l'explorateur sur le fichier produit.

Le registre est lu et écrit par SheetJS, avec des en-têtes reconnus à la
tolérance près (casse, accents, libellés voisins) et un repli sur l'ordre des
colonnes. Un fichier d'exemple du dossier `Registres` reste nécessaire pour
confirmer l'interopérabilité avec le logiciel existant.

### Limite connue

Le `+` d'un numéro international n'appartient pas à un token de mot : il reste
donc hors du surlignage et hors du remplacement (`+221 77 812 44 09` devient
`+ [TELEPHONE_0001]`). À traiter dans la substitution Rust, qui travaille sur le
texte brut et peut absorber le caractère adjacent.
