# Empaqueter l'application

Un seul dépôt, quatre plateformes. Le code est identique partout : l'interface
est un export statique servi par une webview, et le natif ne sert qu'à écrire
les fichiers de sortie. Ce qui change d'une cible à l'autre, ce sont les
outils, les comptes et les signatures.

## Ce que chaque cible produit

| Cible | Artefact | Se fabrique sur | Compte requis |
| --- | --- | --- | --- |
| Windows | `.exe` (NSIS), `.msi` | Windows | non |
| macOS | `.dmg`, `.app` universel | macOS | pour la distribution |
| Linux | `.deb`, `.AppImage` | Linux | non |
| Android | `.apk`, `.aab` | n'importe quel système | pour le magasin |
| iOS | `.ipa` | macOS uniquement | oui, sans exception |

**Windows exige Windows et iOS exige macOS.** Aucune astuce n'y change rien :
c'est pourquoi `.github/workflows/paquets.yml` répartit le travail sur trois
systèmes d'exécution et rassemble les résultats sous une même étiquette.

## Prérequis

**Tous** — Node 22 et Rust stable (`rustup`).

**Linux** — `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`,
`patchelf`.

**Windows** — les « Build Tools for Visual Studio » avec la charge de travail
C++, et WebView2 (déjà présent sur Windows 11).

**macOS** — Xcode et ses outils en ligne de commande. Pour un binaire
universel : `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

**Android** — JDK 17, le SDK Android, le NDK (27 ou plus récent), et les
variables `ANDROID_HOME` et `NDK_HOME`. Puis les quatre architectures :

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

**iOS** — Xcode, un appareil ou un simulateur, et
`rustup target add aarch64-apple-ios aarch64-apple-ios-sim`.

## Une fois pour toutes

Les projets natifs mobiles ne sont pas dans le dépôt tant qu'ils n'ont pas été
engendrés :

```bash
npm run tauri android init     # crée src-tauri/gen/android (projet Gradle)
npm run tauri ios init         # crée src-tauri/gen/apple  (projet Xcode)
```

**Commitez ce qu'ils produisent.** C'est là que se modifient le manifeste
Android et le `Info.plist` : régénérer à chaque fois ferait perdre ces
retouches. La chaîne d'intégration sait les engendrer si elles manquent, mais
c'est un filet, pas la règle.

L'identifiant `sn.filtreia.anonymizer` de `tauri.conf.json` devient
l'`applicationId` Android et le `bundle identifier` iOS. Le changer après une
première publication crée une seconde application aux yeux des magasins.

## Construire

```bash
npm run tauri:build            # la plateforme courante
npm run android:build          # apk + aab
npm run ios:build              # ipa
```

Pour mettre au point sur un appareil relié :

```bash
npm run android:dev            # Tauri redirige le port du serveur de dev
npm run ios:dev
```

## Signatures

C'est la partie qui coûte, en argent et en délai.

**Android** — une clef que vous produisez vous-même, gratuite :

```bash
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias pseudonymizer
```

Gardez-la : sans elle, aucune mise à jour de l'application publiée n'est
possible, jamais. Pour le magasin, comptez 25 $ une fois.

**Apple** — 99 €/an, pour iOS comme pour une application macOS distribuée hors
du magasin, qui doit être notariée.

**Windows** — un certificat de signature de code, de l'ordre de quelques
centaines d'euros par an. Facultatif : sans lui, l'installeur fonctionne mais
SmartScreen affiche un avertissement au premier lancement.

**Mise à jour automatique** — la clef privée qui répond à la clef publique de
`tauri.conf.json`. Sans elle, les paquets se construisent, mais l'application
installée refusera toute mise à jour : c'est la signature qui fait foi, pas le
serveur.

Ces valeurs deviennent des secrets du dépôt ; leurs noms sont en tête du
fichier de workflow.

## Ce qui diffère sur téléphone

Ce ne sont pas des manques de finition, mais des différences de plateforme,
traitées dans le code :

- **La mise à jour n'existe pas.** `tauri-plugin-updater` et
  `tauri-plugin-process` sont déclarés hors des cibles mobiles dans
  `Cargo.toml` et enregistrés sous `#[cfg(desktop)]` : ils ne se compilent pas
  pour Android ni iOS, où ce sont les magasins qui livrent les versions. La
  permission correspondante vit dans une capacité séparée,
  `capabilities/desktop.json`.
- **Le sélecteur de fichiers est celui du navigateur.** Le sélecteur natif rend
  un chemin de disque sur un ordinateur ; sur un téléphone, une référence de
  fournisseur de contenu. `isMobileShell()` fait basculer sur le champ de
  fichier de la webview, qui rend les octets directement.
- **Les livrables s'écrivent dans les Documents de l'appareil.** Une webview de
  téléphone ignore `<a download>` : le fichier est écrit par le greffon de
  fichiers, puis ouvert par le système.
- **La réécriture native n'a pas lieu.** Sans chemin de source, le document de
  sortie est reconstruit côté client, en texte. Rendre à un PDF son format
  d'origine sur téléphone demanderait de passer les octets au Rust plutôt qu'un
  chemin : c'est le prochain chantier si le besoin se confirme.
- **La visite guidée est absente.** Elle est ancrée à des éléments de la
  disposition de bureau. Une visite tactile reste à écrire.

## Ordre conseillé

1. **Android d'abord.** Aucun compte, aucune attente : un APK s'installe à la
   main et se teste le jour même.
2. **Windows et Linux ensuite**, qui ne demandent rien non plus.
3. **macOS et iOS en dernier**, quand le dessin est arrêté : c'est là que le
   compte, la notarisation et les profils de provisionnement font perdre des
   jours si l'on s'y prend au mauvais moment.
