# MC Panel — Application Windows

Vraie application de bureau (Electron) pour héberger et gérer un serveur Minecraft (Paper), sans navigateur : fenêtre native avec console intégrée.

## Fonctionnalités

- 🟢 Démarrer / 🔴 Arrêter / 🔄 Redémarrer le serveur
- 🖥️ Console Minecraft intégrée (logs + envoi de commandes)
- 📁 Ouvrir le dossier des fichiers du serveur (explorateur Windows)
- ⚙️ Choisir le dossier du serveur (bouton de sélection)
- ☕ Choisir le `java.exe` à utiliser (utile si plusieurs versions de Java installées)
- 📊 RAM / CPU en direct (process Java)
- 🟢🔴 Statut du serveur (pastille + texte)
- Choix de la version Paper + du build, téléchargement en un clic
- RAM min/max configurable, nombre de threads CPU (GC) configurable
- Acceptation automatique de l'EULA
- Sauvegarde rapide du monde (zip dans `backups/`)
- Redémarrage automatique en cas de crash (option)

## Pré-requis pour développer / compiler

- [Node.js](https://nodejs.org/) 18+
- **Java** installé sur la machine qui fera tourner le serveur Minecraft (le panel ne l'installe pas — vous choisissez le `java.exe` dans l'appli)

## Lancer en développement

```bash
npm install
npm start
```

Une fenêtre native s'ouvre (pas de navigateur).

## Compiler en .exe (Windows)

```bash
npm install
npm run dist
```

Génère `dist/MC-Panel.exe` — un exécutable **portable** (aucune installation requise, se lance directement).

> ⚠️ La compilation Windows via `electron-builder` doit idéalement se faire **sur une machine Windows**, ou via Wine sur Linux/Mac. Si vous compilez depuis Linux sans Wine, installez-le au préalable (`sudo apt install wine`) ou compilez directement depuis un PC/VM Windows avec Node.js installé — c'est la méthode la plus simple et la plus fiable.

## Compiler automatiquement dans le cloud (GitHub Actions, sans PC Windows)

Le projet inclut `.github/workflows/build.yml` qui compile le `.exe` automatiquement sur une machine Windows fournie gratuitement par GitHub. Aucune installation locale de Node.js/Windows requise.

1. Crée un compte [GitHub](https://github.com) si tu n'en as pas
2. Crée un nouveau dépôt (repository), par exemple `mc-panel`
3. Mets-y le contenu de ce dossier (`mc-panel-electron/`) — soit en le glissant/déposant directement sur la page du dépôt (bouton "Add file" → "Upload files"), soit via `git` :
   ```bash
   cd mc-panel-electron
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/TON-PSEUDO/mc-panel.git
   git push -u origin main
   ```
4. Va dans l'onglet **Actions** de ton dépôt GitHub : le workflow "Build Windows exe" se lance automatiquement
5. Attends 2-3 minutes que le build se termine (coche verte ✅)
6. Clique sur le run terminé → en bas, section **Artifacts** → télécharge `MC-Panel-exe` (c'est un zip contenant le `.exe`)

Tu peux aussi relancer le build manuellement à tout moment depuis l'onglet Actions → "Build Windows exe" → "Run workflow", sans avoir à repush du code.

## Premier lancement

1. Ouvrez `MC-Panel.exe`
2. **⚙️ Choisir dossier serveur** → sélectionnez (ou créez) le dossier où vivra le serveur
3. **☕ Choisir java.exe** → pointez vers votre installation Java (ou laissez `java` si Java est dans le PATH)
4. Choisissez une **version Paper** + un **build**, cliquez **⬇️ Télécharger**
5. **✅ Accepter l'EULA**
6. Réglez RAM min/max et threads CPU dans **Ressources**, puis **💾 Sauvegarder**
7. **🟢 Démarrer**

Le fichier `mc-panel-config.json` (créé à côté de l'exe) conserve tous ces réglages entre les lancements.

## Structure du projet

```
mc-panel-electron/
├── package.json
├── src/
│   ├── main.js          # Process principal Electron (Java, IPC, config, stats)
│   ├── preload.js        # Pont sécurisé main <-> renderer
│   └── renderer/
│       ├── index.html    # Interface
│       ├── style.css
│       └── renderer.js
```

## Notes

- Le nombre de « threads CPU » agit sur les threads de garbage collection de la JVM (`-XX:ParallelGCThreads`) : c'est le principal levier réaliste pour influencer la charge CPU d'un serveur Minecraft. Windows ne permet pas nativement de limiter le nombre de cœurs utilisés par un process sans outil externe (`start /affinity`) — peut être ajouté si besoin.
- Les sauvegardes ne zippent que les dossiers commençant par `world` (les mondes), pas le jar ni les logs.
- Aucune authentification n'est nécessaire ici : l'appli tourne en local, pas de serveur web exposé.
