const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (partial) => ipcRenderer.invoke('set-config', partial),
  pickServerFolder: () => ipcRenderer.invoke('pick-server-folder'),
  pickJava: () => ipcRenderer.invoke('pick-java'),
  openServerFolder: () => ipcRenderer.invoke('open-server-folder'),

  // Paper
  fetchPaperVersions: () => ipcRenderer.invoke('fetch-paper-versions'),
  fetchPaperBuilds: (version) => ipcRenderer.invoke('fetch-paper-builds', version),
  downloadPaper: (version, build) => ipcRenderer.invoke('download-paper', { version, build }),
  acceptEula: () => ipcRenderer.invoke('accept-eula'),

  // Serveur
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  killServer: () => ipcRenderer.invoke('kill-server'),
  restartServer: () => ipcRenderer.invoke('restart-server'),
  sendCommand: (cmd) => ipcRenderer.invoke('send-command', cmd),
  getStatus: () => ipcRenderer.invoke('get-status'),
  backupWorld: () => ipcRenderer.invoke('backup-world'),

  // Events (main -> renderer)
  onConsoleLog: (cb) => ipcRenderer.on('console-log', (e, line) => cb(line)),
  onStatus: (cb) => ipcRenderer.on('status', (e, status) => cb(status)),
  onStats: (cb) => ipcRenderer.on('stats', (e, stats) => cb(stats))
});
