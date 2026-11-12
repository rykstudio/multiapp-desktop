'use strict';
const fs=require('node:fs');
const path=require('node:path');

const EVENTS=new Set(['renderer-crash','navigation-error','unresponsive','settings-save-error']);
const MAX_LOG_BYTES=1024*1024;
function recordDiagnostic(userDataPath,event,appId='',code=''){
  if(!EVENTS.has(event))return false;
  // Deliberately omit URLs, credentials, user identifiers and raw exception text.
  // Only small machine-readable status codes and local app IDs are retained.
  const safe=(value)=>String(value||'').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,64);
  const line=JSON.stringify({
    time:new Date().toISOString(),
    event,
    appId:safe(appId),
    code:safe(code)
  })+'\n';
  const file=path.join(userDataPath,'diagnostics.jsonl');
  try {
    if(fs.existsSync(file)&&fs.statSync(file).size+Buffer.byteLength(line)>MAX_LOG_BYTES)
      fs.renameSync(file,path.join(userDataPath,'diagnostics.previous.jsonl'));
    fs.appendFileSync(file,line,{encoding:'utf8',mode:0o600});
    if(process.platform!=='win32')fs.chmodSync(file,0o600);
    return true;
  } catch {
    // Diagnostics must never stop the app or prevent a transaction.
    return false;
  }
}
module.exports={recordDiagnostic};
