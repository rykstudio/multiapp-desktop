'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, shell, session, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const BAR_HEIGHT = 105;
let win;
const entries = new Map();
let config;
let activeId;
let configPath;
let lastError = '';

function validateConfig(data) {
  if (!data || !Array.isArray(data.apps) || !data.apps.length) throw new Error('Config must contain a non-empty apps array');
  if (data.apps.length > 40) throw new Error('Maximum 40 apps are supported');
  const ids = new Set();
  const apps = data.apps.map((item, index) => {
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(item.id)) throw new Error(`Invalid app id at index ${index}`);
    if (ids.has(item.id)) throw new Error(`Duplicate app id: ${item.id}`);
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim()) throw new Error(`App ${item.id} requires name`);
    let url;
    try { url = new URL(item.url); } catch { throw new Error(`Invalid URL for ${item.id}`); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`Only HTTP(S) URLs allowed for ${item.id}`);
    return { id: item.id, name: item.name.trim().slice(0, 60), url: url.toString(), partition: `persist:multiapp-${item.id}` };
  });
  return { title: typeof data.title === 'string' ? data.title.slice(0, 100) : 'MultiApp Desktop', apps };
}
function readConfig() { return validateConfig(JSON.parse(fs.readFileSync(configPath, 'utf8'))); }
function state() {
  return { title: config?.title || 'MultiApp Desktop', activeId, error: lastError,
    apps: (config?.apps || []).map(a => {
      const entry = entries.get(a.id);
      return { id:a.id, name:a.name, url:entry?.view.webContents.getURL() || a.url,
        loading:entry?.loading || false, back:entry?.view.webContents.canGoBack() || false,
        forward:entry?.view.webContents.canGoForward() || false, failed:entry?.failed || '' };
    }) };
}
function emit() { if (win && !win.isDestroyed()) win.webContents.send('app:state', state()); }
function fitView() {
  if (!win || !activeId) return;
  const entry = entries.get(activeId);
  if (!entry) return;
  const [w,h] = win.getContentSize();
  entry.view.setBounds({ x:0, y:BAR_HEIGHT, width:Math.max(1,w), height:Math.max(1,h-BAR_HEIGHT) });
}
function activate(id) {
  const entry = entries.get(id);
  if (!entry || !win) return;
  if (activeId && entries.has(activeId)) {
    const old = entries.get(activeId).view;
    try { win.contentView.removeChildView(old); } catch {}
  }
  activeId = id;
  win.contentView.addChildView(entry.view);
  fitView(); emit();
}
function createView(item) {
  const ses = session.fromPartition(item.partition);
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  const view = new WebContentsView({ webPreferences: {
    session: ses, sandbox: true, nodeIntegration: false, contextIsolation: true,
    webSecurity: true, javascript: true
  }});
  const entry = { view, loading:false, failed:'' };
  entries.set(item.id, entry);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({url}) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(()=>{});
    return {action:'deny'};
  });
  wc.on('will-navigate', (event, url) => {
    if (!/^https?:\/\//i.test(url)) event.preventDefault();
  });
  wc.on('did-start-loading', () => { entry.loading = true; emit(); });
  wc.on('did-stop-loading', () => { entry.loading = false; emit(); });
  wc.on('did-navigate', emit);
  wc.on('did-navigate-in-page', emit);
  wc.on('did-fail-load', (_event, errorCode, desc, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) { entry.failed = desc; emit(); }
  });
  wc.loadURL(item.url).catch(err => { entry.failed = err.message; emit(); });
}
function discard(id) {
  const entry = entries.get(id);
  if (!entry) return;
  if (activeId === id && win) { try { win.contentView.removeChildView(entry.view); } catch {} activeId = undefined; }
  entry.view.webContents.close(); entries.delete(id);
}
function reloadConfig() {
  try {
    const updated = readConfig();
    const previous = new Map((config?.apps || []).map(a => [a.id, a]));
    for (const id of [...entries.keys()]) if (!updated.apps.some(a => a.id === id)) discard(id);
    for (const item of updated.apps) {
      if (!entries.has(item.id)) createView(item);
      else if (previous.get(item.id)?.url !== item.url) entries.get(item.id).view.webContents.loadURL(item.url).catch(()=>{});
    }
    config = updated; lastError = ''; win?.setTitle(config.title);
    if (!entries.has(activeId)) activate(config.apps[0].id);
    emit(); return { ok:true };
  } catch(err) {
    lastError = err.message; emit(); return {ok:false,error:err.message};
  }
}
function nav(id, action) {
  if (id !== activeId) return {ok:false};
  const wc = entries.get(id)?.view.webContents;
  if (!wc) return {ok:false};
  if (action === 'back' && wc.canGoBack()) wc.goBack();
  else if (action === 'forward' && wc.canGoForward()) wc.goForward();
  else if (action === 'reload') wc.reload();
  else if (action === 'home') wc.loadURL(config.apps.find(a=>a.id===id).url).catch(()=>{});
  emit(); return {ok:true};
}
function createWindow() {
  win = new BrowserWindow({width:1320,height:860,minWidth:700,minHeight:480, title:'MultiApp Desktop',
    backgroundColor:'#f8fafc',webPreferences:{preload:path.join(__dirname,'preload.js'),
      nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname,'index.html'));
  win.on('resize',fitView);
  win.on('closed',()=>{win=null; for(const id of [...entries.keys()])discard(id);});
  reloadConfig();
  win.webContents.on('did-finish-load',emit);
}
app.whenReady().then(()=>{
  configPath = path.join(app.getPath('userData'),'apps.json');
  if (!fs.existsSync(configPath)) fs.copyFileSync(path.join(__dirname,'../config/apps.json'),configPath);
  ipcMain.handle('app:get-state',()=>state());
  ipcMain.handle('tab:activate',(_event,id)=>{ if(typeof id==='string') activate(id); return state(); });
  ipcMain.handle('tab:navigate',(_event,data)=>{ if (!data || typeof data.id !== 'string' || !['back','forward','reload','home'].includes(data.action)) return {ok:false}; return nav(data.id,data.action); });
  ipcMain.handle('config:reload',reloadConfig);
  ipcMain.handle('config:open',()=>shell.openPath(configPath));
  createWindow();
  app.on('activate',()=>{if (BrowserWindow.getAllWindows().length===0) createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
