'use strict';
const { app, BrowserWindow, BrowserView, WebContentsView, ipcMain, shell, session, Menu, clipboard, safeStorage, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {SettingsDatabase}=require('./settings-db');
const {encryptJson,decryptJson}=require('./crypto-export');
const {withSavedOrder,inSavedOrder} = require('./app-order');
const {canOpenEmbedded}=require('./popup-policy');

const BAR_HEIGHT = 71;
const entries = new Map();
let win, config, activeId, configPath, lastError = '';
let settingsDB, pendingImport=null;
let settingsVisible = false;
let drawerVisible = false;
function toggleFullscreen() { if (!win || win.isDestroyed()) return false; win.setFullScreen(!win.isFullScreen()); return win.isFullScreen(); }

function encryptionReady() {
  return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
}
// Demo passwords may be saved locally without an OS keyring. These values are
// plaintext in the SQLite database; this is intentional for demo-only use.
function encryptPassword(value) {
  return encryptionReady() ? 'os:' + safeStorage.encryptString(value).toString('base64') : 'plain:' + value;
}
function decryptPassword(value) {
  if (!value) return '';
  if(value.startsWith('plain:'))return value.slice(6);
  if(value.startsWith('os:')) {
    if (!encryptionReady())throw new Error('This password requires the OS keyring originally used to store it.');
    return safeStorage.decryptString(Buffer.from(value.slice(3),'base64'));
  }
  // Legacy versions wrote unprefixed safeStorage ciphertext.
  if (!encryptionReady())throw new Error('Cannot read a legacy encrypted password without its OS keyring.');
  return safeStorage.decryptString(Buffer.from(value,'base64'));
}
function sanitizeData(data, previous) {
  if (!data || !Array.isArray(data.apps) || data.apps.length > 40) throw new Error('Configuration must have no more than 40 apps');
  const seen = new Set();
  const oldApps = new Map((previous?.apps || []).map(a => [a.id, a]));
  const apps = inSavedOrder(data.apps).map((raw, i) => {
    if (!raw || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(raw.id) || seen.has(raw.id)) throw new Error('Invalid or duplicate application ID at row ' + (i + 1));
    seen.add(raw.id);
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 100) throw new Error('Application name is required (up to 100 characters)');
    let url;
    try { url = new URL(raw.url); } catch { throw new Error('Invalid URL for ' + raw.id); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are accepted');
    if (!Array.isArray(raw.logins || []) || (raw.logins || []).length > 50) throw new Error('Maximum 50 demo logins per application');
    const oldLogins = new Map((oldApps.get(raw.id)?.logins || []).map(a => [a.id, a]));
    const loginIds = new Set();
    const logins = (raw.logins || []).map((login, n) => {
      if (!login || typeof login.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(login.id) || loginIds.has(login.id)) throw new Error('Invalid or duplicate login ID in ' + raw.name);
      loginIds.add(login.id);
      if (typeof login.title !== 'string' || !login.title.trim() || login.title.length > 100) throw new Error('Demo login title required in ' + raw.name);
      const description = String(login.description || '').slice(0, 1000);
      const username = String(login.username || '').slice(0, 500);
      let passwordEnc = oldLogins.get(login.id)?.passwordEnc || '';
      if (Object.hasOwn(login, 'password') && login.password !== '') {
        if (typeof login.password !== 'string' || login.password.length > 2048) throw new Error('Password exceeds 2048 characters');
        passwordEnc = encryptPassword(login.password);
      }
      if (login.clearPassword === true) passwordEnc = '';
      return { id: login.id, title: login.title.trim(), description, username, passwordEnc };
    });
    return { id:raw.id, name:raw.name.trim(), url:url.toString(), logins };
  });
  return {title: String(data.title || 'MultiApp Desktop').trim().slice(0,100), apps:withSavedOrder(apps)};
}
function validateImportedConfig(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.apps) || data.apps.length > 40) {
    throw new Error('Import JSON requires an apps array containing no more than 40 apps');
  }
  if (data.formatVersion !== undefined && data.formatVersion !== 1) throw new Error('Unsupported import format version');
  const ids = new Set();
  const apps = data.apps.map((a, i) => {
    if (!a || typeof a.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(a.id) || ids.has(a.id)) throw new Error('Invalid or duplicate app ID at row ' + (i + 1));
    ids.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 100) throw new Error('Invalid app name for ' + a.id);
    if (typeof a.url !== 'string' || a.url.length > 2048) throw new Error('Invalid URL for ' + a.id);
    let url;
    try { url = new URL(a.url); } catch { throw new Error('Invalid URL for ' + a.id); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are accepted');
    if (a.logins !== undefined && !Array.isArray(a.logins)) throw new Error('Logins must be an array in ' + a.id);
    if ((a.logins || []).length > 50) throw new Error('Maximum 50 logins per application');
    const loginIds = new Set();
    const logins = (a.logins || []).map((l, j) => {
      if (!l || typeof l.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(l.id) || loginIds.has(l.id)) throw new Error('Invalid or duplicate login ID at ' + a.id + ':' + (j+1));
      loginIds.add(l.id);
      if (typeof l.title !== 'string' || !l.title.trim() || l.title.length > 100) throw new Error('Invalid login title for ' + a.id);
      if (l.passwordEnc !== undefined || l.clearPassword !== undefined || l.hasPassword !== undefined) throw new Error('Import JSON cannot include internal password fields');
      if (l.password !== undefined && (typeof l.password !== 'string' || l.password.length > 2048)) throw new Error('Invalid password in ' + a.id);
      if (l.username !== undefined && (typeof l.username !== 'string' || l.username.length > 500)) throw new Error('Invalid username in ' + a.id);
      if (l.description !== undefined && (typeof l.description !== 'string' || l.description.length > 1000)) throw new Error('Invalid description in ' + a.id);
      return {id:l.id,title:l.title.trim(),description:l.description || '',username:l.username || '',password:l.password || ''};
    });
    return {id:a.id,name:a.name.trim(),url:url.toString(),logins};
  });
  if (data.title !== undefined && (typeof data.title !== 'string' || data.title.length > 100)) throw new Error('Invalid platform title');
  return {title:data.title || 'MultiApp Desktop',apps};
}
async function importSettings(passphrase) {
  let input,filename;
  if (pendingImport && typeof passphrase==='string') {
    input=decryptJson(pendingImport.data,passphrase);
    filename=pendingImport.filename;
    pendingImport=null;
  } else {
    pendingImport=null;
    const selected=await dialog.showOpenDialog(win,{
      title:'Import application settings',properties:['openFile'],
      filters:[{name:'JSON configuration',extensions:['json']}]
    });
    if(selected.canceled||!selected.filePaths.length)return {cancelled:true};
    const file=selected.filePaths[0];
    if(fs.statSync(file).size>1024*1024)throw new Error('Import JSON exceeds 1 MB');
    filename=path.basename(file);
    input=JSON.parse(fs.readFileSync(file,'utf8'));
    if(input?.format==='multiapp-encrypted-settings'){
      pendingImport={data:input,filename};
      return {needsPassword:true,filename};
    }
  }
  const incoming=validateImportedConfig(input);
  return {cancelled:false,settings:incoming,
    summary:{apps:incoming.apps.length,logins:incoming.apps.reduce((n,a)=>n+a.logins.length,0),filename}};
}
async function exportSettings(passphrase) {
  if(typeof passphrase!=='string'||passphrase.length<8)throw new Error('Export password must be at least 8 characters');
  const body={formatVersion:1,title:config.title,apps:config.apps.map(a=>({
    id:a.id,name:a.name,url:a.url,logins:a.logins.map(l=>({
      id:l.id,title:l.title,description:l.description,username:l.username,
      password:l.passwordEnc?decryptPassword(l.passwordEnc):''
    }))
  }))};
  const encrypted=encryptJson(body,passphrase);
  const selected=await dialog.showSaveDialog(win,{
    title:'Export encrypted application settings',
    defaultPath:path.join(app.getPath('downloads'),'multiapp-settings-encrypted.json'),
    filters:[{name:'Encrypted JSON configuration',extensions:['json']}]
  });
  if(selected.canceled||!selected.filePath)return {cancelled:true};
  fs.writeFileSync(selected.filePath,JSON.stringify(encrypted,null,2)+'\n',{mode:0o600,flag:'w'});
  return {cancelled:false,filename:path.basename(selected.filePath)};
}
async function saveImportTemplate() {
  const template = path.join(__dirname, '../config/import-template.json');
  const selected = await dialog.showSaveDialog(win, {
    title:'Download settings JSON template',
    defaultPath:path.join(app.getPath('downloads'),'multiapp-settings-template.json'),
    filters:[{name:'JSON configuration',extensions:['json']}]
  });
  if (selected.canceled || !selected.filePath) return {cancelled:true};
  fs.copyFileSync(template,selected.filePath);
  return {cancelled:false, filename:path.basename(selected.filePath)};
}
function publicConfig() {
  return {title:config.title, apps:config.apps.map(a => ({id:a.id,name:a.name,url:a.url,order:a.order,logins:a.logins.map(l => ({
    id:l.id,title:l.title,description:l.description,username:l.username,hasPassword:!!l.passwordEnc
  }))}))};
}
function saveConfig(next) {
  // Settings order is authoritative even when an imported document has order fields.
  const normalized = {...next, apps:next.apps.map(({order, ...item}) => item)};
  const validated = sanitizeData(normalized, config);
  settingsDB.write(validated);
  applyConfig(validated);
  return {ok:true, order:validated.apps.map(a=>a.id)};
}
function state() {
  return { title:config?.title || 'MultiApp Desktop', activeId, error:lastError, settingsVisible, fullScreen:win?.isFullScreen() || false, maximized:win?.isMaximized() || false,
    apps:(config?.apps || []).map(a => {
      const entry = entries.get(a.id), wc = (entry?.popup || entry?.view)?.webContents;
      return { id:a.id,name:a.name,url:wc?.getURL() || a.url,
        loading:entry?.loading || false, back:wc?.canGoBack() || false, forward:wc?.canGoForward() || false,
        failed:entry?.failed || '', loginCount:a.logins.length, popupActive:!!entry?.popup };
    })};
}
function emit() { if (win && !win.isDestroyed()) win.webContents.send('app:state',state()); }
function attachActiveView(entry) {
  if(!win || !entry)return;
  if(entry.popup)win.addBrowserView(entry.popup);
  else win.contentView.addChildView(entry.view);
}
function detachActiveView(entry) {
  if(!win || !entry)return;
  try {
    if(entry.popup)win.removeBrowserView(entry.popup);
    else win.contentView.removeChildView(entry.view);
  } catch {}
}
function fitView() {
  if (!win || !activeId || settingsVisible || drawerVisible) return;
  const entry = entries.get(activeId);
  if (!entry) return;
  const [w,h] = win.getContentSize();
  (entry.popup || entry.view).setBounds({x:0,y:BAR_HEIGHT,width:Math.max(1,w),height:Math.max(1,h-BAR_HEIGHT)});
}
function hideView() {
  const entry = entries.get(activeId);
  if (win && entry)detachActiveView(entry);
}
function setSettings(visible) {
  if (settingsVisible === visible) return;
  if (visible) { hideView(); drawerVisible = false; }
  settingsVisible = visible;
  if (!visible && activeId && entries.has(activeId) && !drawerVisible) {
    const entry=entries.get(activeId);
    attachActiveView(entry);
    fitView();
  }
  emit();
}
function activate(id) {
  if (!entries.has(id) || !win) return;
  if (!settingsVisible) hideView();
  activeId = id; settingsVisible = false; drawerVisible = false;
  attachActiveView(entries.get(id));
  fitView();emit();
}
function createView(item) {
  const ses = session.fromPartition('persist:multiapp-' + item.id);
  ses.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  const view = new WebContentsView({webPreferences:{session:ses,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true}});
  const entry = {view,popup:null,loading:false,failed:''};
  entries.set(item.id,entry);
  const wc=view.webContents;
  wc.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown' && !input.isAutoRepeat && input.key==='F11') {event.preventDefault();toggleFullscreen();}
  });
  wc.setWindowOpenHandler(({url}) => {
    if(!canOpenEmbedded(url) || entry.popup)return {action:'deny'};
    return {
      action:'allow',
      createWindow:(options)=>{
        // A WebContentsView keeps the popup inside this application's tab
        // while preserving window.opener / postMessage needed by OAuth.
        // BrowserView supports options.webContents, which is required by Electron
        // to associate this popup with its window.open() opener. WebContentsView
        // does not support adopting that pre-created webContents.
        const popup=new BrowserView(options);
        const child=popup.webContents;
        if(child!==options.webContents)throw new Error('Popup must adopt Electron-provided webContents');
        child.setWindowOpenHandler(()=>({action:'deny'}));
        child.on('will-navigate',(event,target)=>{
          if(!canOpenEmbedded(target))event.preventDefault();
        });
        child.on('did-navigate',emit);
        child.on('did-navigate-in-page',emit);
        child.on('did-start-loading',emit);
        child.on('did-stop-loading',emit);
        child.on('destroyed',()=>{
          if(entry.popup!==popup)return;
          entry.popup=null;
          if(win && !win.isDestroyed() && activeId===item.id && !settingsVisible && !drawerVisible) {
            try {win.removeBrowserView(popup);}catch{}
            win.contentView.addChildView(view);
            fitView();
          }
          emit();
        });
        if(activeId===item.id && !settingsVisible && !drawerVisible) hideView();
        entry.popup=popup;
        if(win && activeId===item.id && !settingsVisible && !drawerVisible) {
          win.addBrowserView(popup);
          fitView();
        }
        emit();
        return child;
      }
    };
  });
  wc.on('will-navigate',(event,url)=>{if(!/^https?:\/\//i.test(url)) event.preventDefault();});
  wc.on('did-start-loading',()=>{entry.loading=true;emit();});
  wc.on('did-stop-loading',()=>{entry.loading=false;emit();});
  wc.on('did-navigate',emit);
  wc.on('did-navigate-in-page',emit);
  wc.on('did-fail-load',(_e,code,desc,_url,isMainFrame)=>{if(isMainFrame && code!==-3){entry.failed=desc;emit();}});
  wc.loadURL(item.url).catch(err=>{entry.failed=err.message;emit();});
}
function discard(id) {
  const entry=entries.get(id);
  if(!entry)return;
  if(activeId===id){hideView();activeId=undefined;}
  if(entry.popup && !entry.popup.webContents.isDestroyed())entry.popup.webContents.close();
  entry.view.webContents.close();entries.delete(id);
}
function applyConfig(next) {
  const old = new Map((config?.apps || []).map(a=>[a.id,a]));
  for(const id of [...entries.keys()])if(!next.apps.some(a=>a.id===id))discard(id);
  for(const item of next.apps){
    if(!entries.has(item.id))createView(item);
    else if(old.get(item.id)?.url!==item.url)entries.get(item.id).view.webContents.loadURL(item.url).catch(()=>{});
  }
  config=next;lastError='';win?.setTitle(next.title);
  if(!entries.has(activeId) && next.apps.length) {
    if(settingsVisible) activeId=next.apps[0].id;
    else activate(next.apps[0].id);
  }
  if(!next.apps.length){activeId=undefined;setSettings(true);}
  emit();
}
function reloadConfig() {
  try {
    applyConfig(settingsDB.read());
    return {ok:true};
  } catch (err) {lastError=err.message;emit();return {ok:false,error:err.message};}
}
function closePopup(id) {
  const entry=entries.get(id);
  if(!entry?.popup)return {ok:false};
  const popup=entry.popup;
  entry.popup=null;
  if(win && !win.isDestroyed() && activeId===id && !settingsVisible && !drawerVisible) {
    try{win.removeBrowserView(popup);}catch{}
    win.contentView.addChildView(entry.view);
    fitView();
  }
  if(!popup.webContents.isDestroyed())popup.webContents.close();
  emit();
  return {ok:true};
}
function nav(id,action){
  if(id!==activeId || settingsVisible)return {ok:false};
  const entry=entries.get(id);
  const wc=(entry?.popup || entry?.view)?.webContents;
  if(!wc)return {ok:false};
  if(action==='back' && wc.canGoBack())wc.goBack();
  else if(action==='forward' && wc.canGoForward())wc.goForward();
  else if(action==='reload')wc.reload();
  else if(action==='home') {
    if(entry.popup)closePopup(id);
    else wc.loadURL(config.apps.find(a=>a.id===id).url).catch(()=>{});
  }
  emit();return {ok:true};
}
function copyLogin(id,loginId,field) {
  if(id!==activeId || !['username','password'].includes(field))throw new Error('Invalid demo login request');
  const login=config.apps.find(a=>a.id===id)?.logins.find(l=>l.id===loginId);
  if(!login)throw new Error('Demo login not found');
  const value=field==='username' ? login.username : login.passwordEnc ? decryptPassword(login.passwordEnc) : '';
  if(!value)throw new Error('No ' + field + ' configured');
  clipboard.writeText(value);
  return {ok:true};
}
function createWindow(){
  win=new BrowserWindow({width:1320,height:860,minWidth:740,minHeight:540,title:'MultiApp Desktop',frame:false,
    backgroundColor:'#fff',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname,'index.html'));
  win.on('resize',fitView);
  win.on('maximize',emit);
  win.on('unmaximize',emit);
  win.on('enter-full-screen',()=>{fitView();emit();});
  win.on('leave-full-screen',()=>{fitView();emit();});
  win.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown' && !input.isAutoRepeat && input.key==='F11') { event.preventDefault(); toggleFullscreen(); }
  });
  win.on('closed',()=>{win=null;for(const id of [...entries.keys()])discard(id);});
  reloadConfig();
  win.webContents.on('did-finish-load',emit);
}
app.whenReady().then(()=>{
  const userData=app.getPath('userData');
  configPath=path.join(userData,'apps.json');
  settingsDB=new SettingsDatabase(userData);
  if(!settingsDB.isInitialized()) {
    const source=fs.existsSync(configPath)?configPath:path.join(__dirname,'../config/apps.json');
    const original=JSON.parse(fs.readFileSync(source,'utf8'));
    const migrated=sanitizeData(original);
    for(const a of migrated.apps)for(const l of a.logins){
      const prior=(original.apps.find(x=>x.id===a.id)?.logins||[]).find(x=>x.id===l.id);
      if(prior?.passwordEnc)l.passwordEnc=prior.passwordEnc;
    }
    settingsDB.write(migrated);
    // Keep the legacy JSON for recovery, rather than deleting credentials or
    // risking data loss if a migration is interrupted.
    if(source===configPath) {
      try {fs.renameSync(configPath,configPath+'.pre-sqlite-backup');}catch{}
    }
  }
  ipcMain.handle('app:get-state',()=>state());
  ipcMain.handle('window:toggle-fullscreen',()=>{toggleFullscreen();return state();});
  ipcMain.handle('window:control',(_e,action)=>{
    if(!win || !['minimize','maximize','close'].includes(action))return {ok:false};
    if(action==='minimize')win.minimize();
    if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();
    if(action==='close')win.close();
    return {ok:true};
  });
  ipcMain.handle('tab:close-popup',(_e,id)=>typeof id==='string' && id===activeId ? closePopup(id) : {ok:false});
  ipcMain.handle('tab:activate',(_e,id)=>{if(typeof id==='string')activate(id);return state();});
  ipcMain.handle('tab:navigate',(_e,d)=>d && typeof d.id==='string' && ['back','forward','reload','home'].includes(d.action) ? nav(d.id,d.action) : {ok:false});
  ipcMain.handle('settings:open',()=>{setSettings(true);return publicConfig();});
  ipcMain.handle('settings:close',()=>{setSettings(false);return state();});
  ipcMain.handle('settings:get',()=>publicConfig());
  ipcMain.handle('settings:save',(_e,d)=>saveConfig(d));
  ipcMain.handle('settings:import',(_e,password)=>importSettings(password));
  ipcMain.handle('settings:export',(_e,password)=>exportSettings(password));
  ipcMain.handle('settings:template',saveImportTemplate);
  ipcMain.handle('drawer:set',(_e,visible)=>{
    if (typeof visible !== 'boolean' || settingsVisible) return {ok:false};
    if (visible && !drawerVisible) hideView();
    drawerVisible = visible;
    if (!visible && activeId && entries.has(activeId)) { attachActiveView(entries.get(activeId));fitView(); }
    return {ok:true};
  });
  ipcMain.handle('login:list',(_e,id)=>{
    if(id!==activeId)return [];
    return (config.apps.find(a=>a.id===id)?.logins || []).map(l=>({id:l.id,title:l.title,description:l.description,username:l.username,hasPassword:!!l.passwordEnc}));
  });
  ipcMain.handle('login:copy',(_e,d)=>copyLogin(d.id,d.loginId,d.field));
  ipcMain.handle('security:status',()=>({encryptionAvailable:encryptionReady()}));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('before-quit',()=>{settingsDB?.close();settingsDB=null;});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
