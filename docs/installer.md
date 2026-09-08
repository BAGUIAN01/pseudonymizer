# Installer Pseudonymizer

À envoyer avec les fichiers.

L'application ne transmet rien : le document, le registre et les projets
restent sur l'appareil. Les avertissements décrits ci-dessous ne signalent pas
un danger — ils signalent que l'application n'a pas été achetée auprès d'un
magasin, ce qui est le cas.

## Windows — fichier `.exe`

Double-cliquez. Windows affiche « Windows a protégé votre ordinateur » :
**Informations complémentaires**, puis **Exécuter quand même**. L'installation
suit son cours normalement.

## macOS — fichier `.dmg`

1. Ouvrez le `.dmg`, faites glisser **Pseudonymizer** dans **Applications**.
2. Au premier lancement, macOS refuse : « impossible de vérifier le
   développeur ».
3. Ouvrez **Réglages Système → Confidentialité et sécurité**, descendez
   jusqu'au message qui nomme Pseudonymizer, et cliquez **Ouvrir quand même**.
4. Confirmez. Les lancements suivants se font d'un simple double-clic.

Sur les versions récentes de macOS, le clic droit → *Ouvrir* ne suffit plus :
c'est bien par les Réglages Système qu'il faut passer, une seule fois.

Si vous préférez le Terminal, une commande remplace ces trois étapes :

```bash
xattr -dr com.apple.quarantine /Applications/Pseudonymizer.app
```

## Android — fichier `.apk`

Ouvrez le fichier depuis **Fichiers** ou depuis la notification de
téléchargement. Android demande d'autoriser cette application-là à installer
des applications : acceptez, la demande ne concerne que ce fichier. Si Play
Protect s'interpose, **Installer quand même**.

## iPhone et iPad

Aucun fichier ne s'installe sur iOS sans passer par Apple. Ouvrez plutôt
l'adresse qui vous a été communiquée dans **Safari**, puis
**Partager → Sur l'écran d'accueil**. L'icône se pose comme celle d'une
application, et l'application s'ouvre en plein écran.

Le traitement reste local : la page est chargée une fois, les documents ne
sont pas envoyés.

## Linux — fichier `.deb` ou `.AppImage`

```bash
sudo apt install ./Pseudonymizer_*.deb      # Debian, Ubuntu
chmod +x Pseudonymizer_*.AppImage && ./Pseudonymizer_*.AppImage
```
