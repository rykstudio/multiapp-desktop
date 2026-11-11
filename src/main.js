'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, shell, session, Menu, clipboard, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const BAR_HEIGHT = 105;
const entries = new Map();
let win, config, activeId, configPath, lastError = '';
let settingsVisible = false;
let drawerVisible = false;

function encryptionReady() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const backend = safeStorage.getSelectedStorageBackend?.();
  return backend !== 'basic_text';
}
function encryptPassword(value) {
  if (!encryptionReady()) throw new Error('Secure password storage is unavailable. Enable your OS keyring / credential manager and restart the app.');
  return safeStorage.encryptString(value).toString('base64');
}
function decryptPassword(value) {
  if (!encryptionReady()) throw new Error('Secure password storage is unavailable on this device.');
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}
function sanitizeData(data, previous) {
  if (!data || !Array.isArray(data.apps) || data.apps.length > 40) throw new Error('Configuration must have no more than 40 apps');
  const seen = new Set();
  const oldApps = new Map((previous?.apps || []).map(a => [a.id, a]));
  const apps = data.apps.map((raw, i) => {
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
  return {title: String(data.title || 'MultiApp Desktop').trim().slice(0,100), apps};
}
function publicConfig() {
  return {title:config.title, apps:config.apps.map(a => ({id:a.id,name:a.name,url:a.url,logins:a.logins.map(l => ({
    id:l.id,title:l.title,description:l.description,username:l.username,hasPassword:!!l.passwordEnc
  }))}))};
}
function saveConfig(next) {
  const validated = sanitizeData(next, config);
  const temp = configPath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(validated,null,2) + '\n', {mode:0o600});
  fs.renameSync(temp,configPath);
  applyConfig(validated);
  return {ok:true};
}
function state() {
  return { title:config?.title || 'MultiApp Desktop', activeId, error:lastError, settingsVisible,
    apps:(config?.apps || []).map(a => {
      const entry = entries.get(a.id), wc = entry?.view.webContents;
      return { id:a.id,name:a.name,url:wc?.getURL() || a.url,
        loading:entry?.loading || false, back:wc?.canGoBack() || false, forward:wc?.canGoForward() || false,
        failed:entry?.failed || '', loginCount:a.logins.length };
    })};
}
function emit() { if (win && !win.isDestroyed()) win.webContents.send('app:state',state()); }
function fitView() {
  if (!win || !activeId || settingsVisible || drawerVisible) return;
  const entry = entries.get(activeId);
  if (!entry) return;
  const [w,h] = win.getContentSize();
  entry.view.setBounds({x:0,y:BAR_HEIGHT,width:Math.max(1,w),height:Math.max(1,h-BAR_HEIGHT)});
}
function hideView() {
  const entry = entries.get(activeId);
  if (win && entry) {try {win.contentView.removeChildView(entry.view);} catch {}}
}
function setSettings(visible) {
  if (settingsVisible === visible) return;
  if (visible) { hideView(); drawerVisible = false; }
  settingsVisible = visible;
  if (!visible && activeId && entries.has(activeId) && !drawerVisible) {
    win.contentView.addChildView(entries.get(activeId).view);
    fitView();
  }
  emit();
}
function activate(id) {
  if (!entries.has(id) || !win) return;
  if (!settingsVisible) hideView();
  activeId = id; settingsVisible = false; drawerVisible = false;
  win.contentView.addChildView(entries.get(id).view);
  fitView();emit();
}
function createView(item) {
  const ses = session.fromPartition('persist:multiapp-' + item.id);
  ses.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  const view = new WebContentsView({webPreferences:{session:ses,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true}});
  const entry = {view,loading:false,failed:''};
  entries.set(item.id,entry);
  const wc=view.webContents;
  wc.setWindowOpenHandler(({url}) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(()=>{});
    return {action:'deny'};
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
  try{
    const data=JSON.parse(fs.readFileSync(configPath,'utf8'));
    // Stored passwords are already encrypted; do not re-encrypt or discard them.
    const next=sanitizeData(data,config);
    for(const a of next.apps)for(const l of a.logins){
      const saved=(data.apps.find(x=>x.id===a.id)?.logins || []).find(x=>x.id===l.id);
      if(saved?.passwordEnc)l.passwordEnc=saved.passwordEnc;
    }
    applyConfig(next);
    return {ok:true};
  }catch(err){lastError=err.message;emit();return {ok:false,error:err.message};}
}
function nav(id,action){
  if(id!==activeId || settingsVisible)return {ok:false};
  const wc=entries.get(id)?.view.webContents;
  if(!wc)return {ok:false};
  if(action==='back' && wc.canGoBack())wc.goBack();
  else if(action==='forward' && wc.canGoForward())wc.goForward();
  else if(action==='reload')wc.reload();
  else if(action==='home')wc.loadURL(config.apps.find(a=>a.id===id).url).catch(()=>{});
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
  win=new BrowserWindow({width:1320,height:860,minWidth:740,minHeight:540,title:'MultiApp Desktop',
    backgroundColor:'#fff',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname,'index.html'));
  win.on('resize',fitView);
  win.on('closed',()=>{win=null;for(const id of [...entries.keys()])discard(id);});
  reloadConfig();
  win.webContents.on('did-finish-load',emit);
}
app.whenReady().then(()=>{
  configPath=path.join(app.getPath('userData'),'apps.json');
  if(!fs.existsSync(configPath))fs.copyFileSync(path.join(__dirname,'../config/apps.json'),configPath);
  ipcMain.handle('app:get-state',()=>state());
  ipcMain.handle('tab:activate',(_e,id)=>{if(typeof id==='string')activate(id);return state();});
  ipcMain.handle('tab:navigate',(_e,d)=>d && typeof d.id==='string' && ['back','forward','reload','home'].includes(d.action) ? nav(d.id,d.action) : {ok:false});
  ipcMain.handle('settings:open',()=>{setSettings(true);return publicConfig();});
  ipcMain.handle('settings:close',()=>{setSettings(false);return state();});
  ipcMain.handle('settings:get',()=>publicConfig());
  ipcMain.handle('settings:save',(_e,d)=>saveConfig(d));
  ipcMain.handle('drawer:set',(_e,visible)=>{
    if (typeof visible !== 'boolean' || settingsVisible) return {ok:false};
    if (visible && !drawerVisible) hideView();
    drawerVisible = visible;
    if (!visible && activeId && entries.has(activeId)) { win.contentView.addChildView(entries.get(activeId).view); fitView(); }
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
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
