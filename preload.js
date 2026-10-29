const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listServers: () => ipcRenderer.invoke('servers:list'),
  saveServers: (list) => ipcRenderer.invoke('servers:save', list),
  connect: (id, cols, rows) => ipcRenderer.send('ssh:connect', { id, cols, rows }),
  input: (id, data) => ipcRenderer.send('ssh:input', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('ssh:resize', { id, cols, rows }),
  readClipboard: () => ipcRenderer.invoke('clip:read'),
  writeClipboard: (t) => ipcRenderer.send('clip:write', t),
  onOut: (cb) => ipcRenderer.on('ssh:out', (_e, p) => cb(p)),
  onStatus: (cb) => ipcRenderer.on('ssh:status', (_e, p) => cb(p)),
});
