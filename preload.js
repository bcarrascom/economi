// Expone una API mínima y segura al renderer (window.api).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  read: (name) => ipcRenderer.invoke('data:read', name),
  write: (name, data) => ipcRenderer.invoke('data:write', name, data),
  backup: () => ipcRenderer.invoke('data:backup'),
  onExternalChange: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('data:changed', handler);
    return () => ipcRenderer.removeListener('data:changed', handler);
  },
  platform: process.platform,
});
