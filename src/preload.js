'use strict';
const {contextBridge, ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('multiApp',{
  ready:()=>ipcRenderer.invoke('app:get-state'),
  activate:id=>ipcRenderer.invoke('tab:activate',id),
  navigate:(id,action)=>ipcRenderer.invoke('tab:navigate',{id,action}),
  openSettings:()=>ipcRenderer.invoke('settings:open'),
  closeSettings:()=>ipcRenderer.invoke('settings:close'),
  getSettings:()=>ipcRenderer.invoke('settings:get'),
  saveSettings:data=>ipcRenderer.invoke('settings:save',data),
  setDrawer:visible=>ipcRenderer.invoke('drawer:set',visible),
  listLogins:id=>ipcRenderer.invoke('login:list',id),
  copyLogin:(id,loginId,field)=>ipcRenderer.invoke('login:copy',{id,loginId,field}),
  securityStatus:()=>ipcRenderer.invoke('security:status'),
  onState:callback=>{const fn=(_,state)=>callback(state);ipcRenderer.on('app:state',fn);return ()=>ipcRenderer.removeListener('app:state',fn);}
});
