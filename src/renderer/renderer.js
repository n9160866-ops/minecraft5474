const consoleEl = document.getElementById('console');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

function appendLine(line) {
  const atBottom = consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 10;
  consoleEl.textContent += line + '\n';
  if (atBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
}

function setStatus(status) {
  statusDot.className = 'dot ' + status;
  statusText.textContent = status === 'running' ? 'En marche' : 'Arrêté';
}

window.api.onConsoleLog(appendLine);
window.api.onStatus(setStatus);
window.api.onStats(({ cpu, memMB }) => {
  document.getElementById('stat-cpu').textContent = cpu.toFixed(1) + ' %';
  document.getElementById('stat-ram').textContent = memMB + ' Mo';
});

// --- Config ---
let currentConfig = {};

async function refreshConfig() {
  currentConfig = await window.api.getConfig();
  document.getElementById('server-dir-label').textContent = currentConfig.serverDir;
  document.getElementById('java-path-label').textContent = currentConfig.javaPath;
  document.getElementById('cfg-ram-min').value = currentConfig.ramMinMB;
  document.getElementById('cfg-ram-max').value = currentConfig.ramMaxMB;
  document.getElementById('cfg-cpu-threads').value = currentConfig.cpuThreads;
  document.getElementById('cfg-auto-restart').checked = currentConfig.autoRestart;
}

document.getElementById('btn-save-config').onclick = async () => {
  await window.api.setConfig({
    ramMinMB: parseInt(document.getElementById('cfg-ram-min').value, 10),
    ramMaxMB: parseInt(document.getElementById('cfg-ram-max').value, 10),
    cpuThreads: parseInt(document.getElementById('cfg-cpu-threads').value, 10),
    autoRestart: document.getElementById('cfg-auto-restart').checked
  });
  appendLine('[panel] Configuration sauvegardée.');
};

document.getElementById('btn-pick-folder').onclick = async () => {
  const dir = await window.api.pickServerFolder();
  if (dir) { document.getElementById('server-dir-label').textContent = dir; appendLine('[panel] Dossier serveur : ' + dir); }
};

document.getElementById('btn-pick-java').onclick = async () => {
  const javaPath = await window.api.pickJava();
  if (javaPath) { document.getElementById('java-path-label').textContent = javaPath; appendLine('[panel] Java sélectionné : ' + javaPath); }
};

document.getElementById('btn-open-folder').onclick = () => window.api.openServerFolder();

// --- Contrôle serveur ---
document.getElementById('btn-start').onclick = async () => {
  const res = await window.api.startServer();
  if (!res.ok) appendLine('[panel] Erreur : ' + res.error);
};
document.getElementById('btn-stop').onclick = async () => {
  const res = await window.api.stopServer();
  if (!res.ok) appendLine('[panel] Erreur : ' + res.error);
};
document.getElementById('btn-restart').onclick = async () => {
  appendLine('[panel] Redémarrage...');
  await window.api.restartServer();
};
document.getElementById('btn-kill').onclick = () => window.api.killServer();

document.getElementById('btn-backup').onclick = async () => {
  appendLine('[panel] Sauvegarde en cours...');
  const res = await window.api.backupWorld();
  if (!res.ok) appendLine('[panel] Erreur sauvegarde : ' + res.error);
};

document.getElementById('btn-send').onclick = sendCommand;
document.getElementById('cmd-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCommand();
});
async function sendCommand() {
  const input = document.getElementById('cmd-input');
  if (!input.value.trim()) return;
  await window.api.sendCommand(input.value);
  input.value = '';
}

// --- Paper : versions / builds / téléchargement ---
async function loadVersions() {
  const selVersion = document.getElementById('sel-version');
  selVersion.innerHTML = '<option>Chargement...</option>';
  try {
    const versions = await window.api.fetchPaperVersions();
    selVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
    if (currentConfig.paperVersion && versions.includes(currentConfig.paperVersion)) {
      selVersion.value = currentConfig.paperVersion;
    }
    loadBuilds(selVersion.value);
  } catch (e) {
    selVersion.innerHTML = '<option>Erreur de chargement</option>';
    appendLine('[panel] Erreur récupération versions Paper : ' + e.message);
  }
}

async function loadBuilds(version) {
  const selBuild = document.getElementById('sel-build');
  if (!version) return;
  selBuild.innerHTML = '<option>Chargement...</option>';
  try {
    const builds = await window.api.fetchPaperBuilds(version);
    selBuild.innerHTML = builds.map(b => `<option value="${b}">${b}</option>`).join('');
  } catch (e) {
    selBuild.innerHTML = '<option>Erreur</option>';
  }
}

document.getElementById('sel-version').addEventListener('change', (e) => loadBuilds(e.target.value));

document.getElementById('btn-download').onclick = async () => {
  const version = document.getElementById('sel-version').value;
  const build = document.getElementById('sel-build').value;
  if (!version || !build) return;
  appendLine(`[panel] Téléchargement Paper ${version} build ${build}...`);
  const res = await window.api.downloadPaper(version, build);
  if (!res.ok) appendLine('[panel] Erreur : ' + res.error);
};

document.getElementById('btn-eula').onclick = async () => {
  await window.api.acceptEula();
  appendLine('[panel] EULA acceptée.');
};

// --- Init ---
(async () => {
  await refreshConfig();
  setStatus(await window.api.getStatus());
  loadVersions();
})();
