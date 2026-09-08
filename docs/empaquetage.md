# Empaqueter l'application

Un seul dépôt, quatre plateformes. Le code est identique partout : l'interface
est un export statique servi par une webview, et le natif ne sert qu'à écrire
les fichiers de sortie. Ce qui change d'une cible à l'autre, ce sont les
outils, les comptes et les signatures.

## Ce que chaque cible produit

Les fichiers se distribuent à la main : aucun magasin n'intervient.

| Cible | Artefact | Se fabrique sur | Envoyable tel quel |
| --- | --- | --- | --- |
| Windows | `.exe` (NSIS), `.msi` | Windows | oui |
| macOS | `.dmg` universel | macOS | oui, avec un détour au premier lancement |
| Linux | `.deb`, `.AppImage` | Linux | oui |
| Android | `.apk` | n'importe quel système | oui |
| iOS | `.ipa` | macOS uniquement | **non — voir plus bas** |

Les instructions à joindre aux fichiers sont dans
[installer.md](installer.md).

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

**macOS** — deux voies. Sans certificat, le `.dmg` se construit et s'installe :
le destinataire passe une fois par Réglages Système → Confidentialité et
sécurité. Avec un compte Apple à 99 €/an, la signature *Developer ID* et la
notarisation suppriment ce détour, et l'application s'ouvre d'un double-clic.

Une précision qui compte sur puce Apple : un binaire **sans aucune signature**
ne démarre pas, même la quarantaine levée. La chaîne applique donc une
signature locale quand aucun certificat n'est fourni — elle ne certifie
personne, elle rend seulement l'application exécutable.

**Windows** — un certificat de signature de code, de l'ordre de quelques
centaines d'euros par an. Facultatif : sans lui, l'installeur fonctionne mais
SmartScreen affiche un avertissement au premier lancement.

**Mise à jour automatique** — la clef privée qui répond à la clef publique de
`tauri.conf.json`. Sans elle, les paquets se construisent, mais l'application
installée refusera toute mise à jour : c'est la signature qui fait foi, pas le
serveur.

Ces valeurs deviennent des secrets du dépôt ; leurs noms sont en tête du
fichier de workflow.

## iOS — la seule cible qui résiste

Il n'existe aucun moyen d'envoyer un fichier qu'un iPhone installera. Le
système n'accepte que ce qu'un profil de provisionnement autorise, et un profil
suppose le programme Apple. Les voies réelles :

- **Safari, « Sur l'écran d'accueil ».** Gratuit, immédiat, et c'est la même
  interface : l'application est un export statique, tout le traitement est
  local. Le manifeste web est déjà en place — l'icône, le nom et la fenêtre
  sans barre d'adresse en découlent. Il suffit de servir le dossier `out/`
  sur une adresse en HTTPS. Ce que l'on perd par rapport à une installation :
  la mise à jour automatique, et les projets sont retenus par le navigateur
  plutôt que par un fichier. Sans agent de service, la première ouverture
  demande le réseau ; le traitement, lui, n'en demande jamais.
- **TestFlight**, 99 €/an. Ce n'est pas publier sur l'App Store : vous
  téléversez une version, vous invitez par courriel, les testeurs installent
  depuis l'application TestFlight. Jusqu'à cent testeurs internes, dix mille
  externes. Les externes passent une revue légère, les internes aucune.
- **Ad Hoc**, 99 €/an également. Un `.ipa` signé pour une liste d'appareils
  dont vous enregistrez l'identifiant, cent au maximum par an, à installer par
  Apple Configurator ou par un lien servi en HTTPS. Plus lourd que TestFlight,
  pour un résultat moindre.
- **Compte gratuit** : signature valable sept jours, réinstallation par câble
  depuis Xcode. Bon pour votre propre appareil, inutilisable pour distribuer.

En résumé : **l'écran d'accueil de Safari si vous ne payez pas, TestFlight si
vous payez.** L'exécution iOS de la chaîne ne démarre que si un identifiant
d'équipe est déclaré ; sans lui, elle est sautée plutôt que d'échouer.

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
3. **macOS** juste après : le `.dmg` part sans compte, au prix d'un détour
   expliqué une fois au destinataire.
4. **iOS en dernier, si jamais.** Servez l'application en HTTPS et laissez
   Safari la poser sur l'écran d'accueil ; ne payez les 99 €/an que le jour où
   une capacité proprement native manquera.
