const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('empth', {
  getConfig: () => ipcRenderer.invoke('empth:get-config'),
  hide: () => ipcRenderer.invoke('empth:hide'),
  resize: (height) => ipcRenderer.invoke('empth:resize', height),
  onShown: (cb) => ipcRenderer.on('empth:shown', cb)
});
