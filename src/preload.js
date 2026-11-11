'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('multiApp', {
  ready: () => ipcRenderer.invoke('app:get-state'),
  activate: id => ipcRenderer.invoke('tab:activate', id),
  navigate: (id, action) => ipcRenderer.invoke('tab:navigate', { id, action }),
  reloadConfig: () => ipcRenderer.invoke('config:reload'),
  openConfig: () => ipcRenderer.invoke('config:open'),
  onState: callback => { const fn = (_, state) => callback(state); ipcRenderer.on('app:state', fn); return () => ipcRenderer.removeListener('app:state', fn); }
});
