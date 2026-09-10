const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const pidusage = require('pidusage');

// --- Emplacement du fichier de config : à côté de l'exe (portable) ---
const BASE_DIR = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'mc-panel-config.json');

const DEFAULT_CONFIG = {
  serverDir: path.join(BASE_DIR, 'minecraft-server'),
  javaPath: 'java', // par défaut : java du PATH système
  ramMinMB: 1024,
  ramMaxMB: 4096,
  cpuThreads: 2,     // nombre de threads GC (influence l'usage CPU)
  paperVersion: '',
  paperBuild: '',
  jarName: 'server.jar',
  serverPort: 25565,
  autoRestart: false
};

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    } catch (e) { /* ignore, fallback */ }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();
if (!fs.existsSync(config.serverDir)) fs.mkdirSync(config.serverDir, { recursive: true });

let mainWindow = null;
let mcProcess = null;
let manualStop = false; // pour distinguer un arrêt volontaire d'un crash
let statsInterval = null;

function sendLog(line) {
  if (mainWindow) mainWindow.webContents.send('console-log', line);
}

function sendStatus(status) {
  if (mainWindow) mainWindow.webContents.send('status', status);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'MC Panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    sendStatus(mcProcess ? 'running' : 'stopped');
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (mcProcess) mcProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------
ipcMain.handle('get-config', () => config);

ipcMain.handle('set-config', (event, partial) => {
  config = { ...config, ...partial };
  saveConfig(config);
  return config;
});

ipcMain.handle('pick-server-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled || res.filePaths.length === 0) return null;
  config.serverDir = res.filePaths[0];
  saveConfig(config);
  return config.serverDir;
});

ipcMain.handle('pick-java', async () => {
  const filters = process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [];
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters });
  if (res.canceled || res.filePaths.length === 0) return null;
  config.javaPath = res.filePaths[0];
  saveConfig(config);
  return config.javaPath;
});

ipcMain.handle('open-server-folder', () => {
  if (!fs.existsSync(config.serverDir)) fs.mkdirSync(config.serverDir, { recursive: true });
  shell.openPath(config.serverDir);
});

// ---------------------------------------------------------------------
// PaperMC : versions / builds / téléchargement
// ---------------------------------------------------------------------
ipcMain.handle('fetch-paper-versions', async () => {
  const res = await fetch('https://api.papermc.io/v2/projects/paper');
  const data = await res.json();
  return data.versions.reverse(); // les plus récentes en premier
});

ipcMain.handle('fetch-paper-builds', async (event, version) => {
  const res = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
  const data = await res.json();
  return data.builds.reverse();
});

ipcMain.handle('download-paper', async (event, { version, build }) => {
  try {
    sendLog(`[panel] Récupération des infos du build ${build} (${version})...`);
    const infoRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}`);
    const info = await infoRes.json();
    const jarName = info.downloads.application.name;
    const url = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/${jarName}`;

    sendLog(`[panel] Téléchargement de ${jarName}...`);
    const jarRes = await fetch(url);
    if (!jarRes.ok) throw new Error('Échec du téléchargement');

    if (!fs.existsSync(config.serverDir)) fs.mkdirSync(config.serverDir, { recursive: true });
    const dest = path.join(config.serverDir, config.jarName);
    const fileStream = fs.createWriteStream(dest);
    await new Promise((resolve, reject) => {
      jarRes.body.pipe(fileStream);
      jarRes.body.on('error', reject);
      fileStream.on('finish', resolve);
    });

    config.paperVersion = version;
    config.paperBuild = build;
    saveConfig(config);
    sendLog('[panel] Téléchargement terminé.');
    return { ok: true };
  } catch (e) {
    sendLog('[panel] Erreur téléchargement : ' + e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('accept-eula', () => {
  if (!fs.existsSync(config.serverDir)) fs.mkdirSync(config.serverDir, { recursive: true });
  fs.writeFileSync(path.join(config.serverDir, 'eula.txt'), 'eula=true\n');
  return true;
});

// ---------------------------------------------------------------------
// Démarrage / arrêt / redémarrage du serveur
// ---------------------------------------------------------------------
function startServer() {
  if (mcProcess) return { ok: false, error: 'Le serveur tourne déjà' };
  const jarPath = path.join(config.serverDir, config.jarName);
  if (!fs.existsSync(jarPath)) return { ok: false, error: 'server.jar introuvable — téléchargez-le d\'abord' };

  const args = [
    `-Xms${config.ramMinMB}M`,
    `-Xmx${config.ramMaxMB}M`,
    `-XX:ParallelGCThreads=${config.cpuThreads}`,
    `-XX:ConcGCThreads=${Math.max(1, Math.floor(config.cpuThreads / 2))}`,
    '-jar', config.jarName,
    'nogui'
  ];

  sendLog(`[panel] Démarrage : "${config.javaPath}" ${args.join(' ')}`);
  manualStop = false;
  try {
    mcProcess = spawn(config.javaPath, args, { cwd: config.serverDir });
  } catch (e) {
    sendLog('[panel] Impossible de lancer Java : ' + e.message);
    return { ok: false, error: e.message };
  }

  mcProcess.stdout.on('data', d => sendLog(d.toString().trimEnd()));
  mcProcess.stderr.on('data', d => sendLog(d.toString().trimEnd()));
  mcProcess.on('close', (code) => {
    sendLog(`[panel] Serveur arrêté (code ${code})`);
    mcProcess = null;
    stopStatsLoop();
    sendStatus('stopped');
    if (!manualStop && config.autoRestart) {
      sendLog('[panel] Redémarrage automatique dans 5s...');
      setTimeout(() => startServer(), 5000);
    }
  });

  startStatsLoop();
  sendStatus('running');
  return { ok: true };
}

function stopServer() {
  if (!mcProcess) return { ok: false, error: 'Le serveur n\'est pas démarré' };
  manualStop = true;
  mcProcess.stdin.write('stop\n');
  return { ok: true };
}

function killServer() {
  if (!mcProcess) return { ok: false, error: 'Le serveur n\'est pas démarré' };
  manualStop = true;
  mcProcess.kill('SIGKILL');
  mcProcess = null;
  stopStatsLoop();
  sendStatus('stopped');
  return { ok: true };
}

ipcMain.handle('start-server', () => startServer());
ipcMain.handle('stop-server', () => stopServer());
ipcMain.handle('kill-server', () => killServer());
ipcMain.handle('restart-server', async () => {
  if (mcProcess) {
    manualStop = true;
    await new Promise((resolve) => {
      mcProcess.once('close', resolve);
      mcProcess.stdin.write('stop\n');
    });
  }
  return startServer();
});

ipcMain.handle('send-command', (event, command) => {
  if (!mcProcess) return { ok: false, error: 'Serveur non démarré' };
  mcProcess.stdin.write(command + '\n');
  return { ok: true };
});

ipcMain.handle('get-status', () => (mcProcess ? 'running' : 'stopped'));

// ---------------------------------------------------------------------
// Statistiques RAM / CPU
// ---------------------------------------------------------------------
function startStatsLoop() {
  stopStatsLoop();
  statsInterval = setInterval(async () => {
    if (!mcProcess) return;
    try {
      const stats = await pidusage(mcProcess.pid);
      if (mainWindow) {
        mainWindow.webContents.send('stats', {
          cpu: stats.cpu,                       // %
          memMB: Math.round(stats.memory / 1024 / 1024)
        });
      }
    } catch (e) { /* process peut être en train de se terminer */ }
  }, 2000);
}

function stopStatsLoop() {
  if (statsInterval) clearInterval(statsInterval);
  statsInterval = null;
}

// ---------------------------------------------------------------------
// Sauvegarde rapide (zip du dossier serveur, sans les .jar)
// ---------------------------------------------------------------------
ipcMain.handle('backup-world', async () => {
  try {
    const archiver = require('archiver');
    const backupDir = path.join(config.serverDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    const dest = path.join(backupDir, filename);

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(dest);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      const worldDirs = fs.readdirSync(config.serverDir).filter(f =>
        fs.statSync(path.join(config.serverDir, f)).isDirectory() &&
        f.startsWith('world') && f !== 'backups'
      );
      worldDirs.forEach(dir => archive.directory(path.join(config.serverDir, dir), dir));
      archive.finalize();
    });

    sendLog(`[panel] Sauvegarde créée : backups/${filename}`);
    return { ok: true, filename };
  } catch (e) {
    sendLog('[panel] Erreur sauvegarde : ' + e.message);
    return { ok: false, error: e.message };
  }
});
