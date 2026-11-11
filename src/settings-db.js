'use strict';
const {DatabaseSync} = require('node:sqlite');
const path = require('node:path');

class SettingsDatabase {
  constructor(userDataPath) {
    this.filename = path.join(userDataPath,'multiapp-settings.sqlite');
    this.db = new DatabaseSync(this.filename);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, position INTEGER NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS demo_logins(app_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE, id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '', password_storage TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL, PRIMARY KEY(app_id,id));"
    );
    // Existing v1.0.0 installations have no display_mode column.
    const columns=this.db.prepare("PRAGMA table_info(applications)").all().map(col=>col.name);
    if(!columns.includes('display_mode'))this.db.exec("ALTER TABLE applications ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'desktop'");
  }
  isInitialized() {return !!this.db.prepare("SELECT value FROM settings WHERE key='initialized'").get();}
  read() {
    const title=this.db.prepare("SELECT value FROM settings WHERE key='title'").get()?.value || 'MultiApp Desktop';
    const apps=this.db.prepare("SELECT id,name,url,position,display_mode FROM applications ORDER BY position,id").all().map(a=>({id:a.id,name:a.name,url:a.url,order:a.position,displayMode:a.display_mode==='mobile'?'mobile':'desktop',logins:[]}));
    const map=new Map(apps.map(a=>[a.id,a]));
    for (const l of this.db.prepare("SELECT app_id,id,title,description,username,password_storage,position FROM demo_logins ORDER BY app_id,position,id").all()) {
      const a=map.get(l.app_id);
      if(a)a.logins.push({id:l.id,title:l.title,description:l.description,username:l.username,passwordEnc:l.password_storage});
    }
    return {title,apps};
  }
  write(config) {
    const db=this.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM demo_logins; DELETE FROM applications;');
      db.prepare("INSERT INTO settings(key,value) VALUES('title',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(config.title);
      db.prepare("INSERT INTO settings(key,value) VALUES('initialized','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
      const apps=db.prepare('INSERT INTO applications(id,name,url,position,display_mode) VALUES (?,?,?,?,?)');
      const logins=db.prepare('INSERT INTO demo_logins(app_id,id,title,description,username,password_storage,position) VALUES (?,?,?,?,?,?,?)');
      config.apps.forEach((a,i)=>{
        apps.run(a.id,a.name,a.url,i,a.displayMode==='mobile'?'mobile':'desktop');
        a.logins.forEach((l,j)=>logins.run(a.id,l.id,l.title,l.description||'',l.username||'',l.passwordEnc||'',j));
      });
      db.exec('COMMIT');
    } catch (e) {db.exec('ROLLBACK');throw e;}
  }
  close(){this.db.close();}
}
module.exports={SettingsDatabase};
