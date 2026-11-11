'use strict';
const $=id=>document.getElementById(id);
let current={apps:[]}, draft=null, drawerOpen=false, demoEntries=[], importSummary=null;
function el(tag,props={},children=[]) {
  const node=document.createElement(tag);
  for(const [k,v] of Object.entries(props)) {
    if(k==='text')node.textContent=v;
    else if(k==='class')node.className=v;
    else if(k==='onClick')node.onclick=v;
    else if(k==='onInput')node.oninput=v;
    else if(k==='value')node.value=v;
    else if(k==='type' && tag==='input')node.type=v;
    else if(k==='placeholder')node.placeholder=v;
    else if(k==='maxLength')node.maxLength=v;
    else if(k==='title')node.title=v;
  }
  for(const child of children)node.append(child);
  return node;
}
function button(text,fn,cls='') {return el('button',{text,onClick:fn,class:cls});}
function field(label,value,onChange,props={}) {
  const tag=props.multiline?'textarea':'input';
  const attributes={value:value??'',placeholder:props.placeholder||'',maxLength:props.maxLength||500,onInput:e=>onChange(e.target.value)};
  if(tag==='input')attributes.type=props.type||'text';
  const input=el(tag,attributes);
  if(props.multiline)input.rows=2;
  return el('label',{class:'field'},[el('span',{text:label}),input]);
}
let toastTimer;
function toast(message) {
  const node=$('toast');node.textContent=message;node.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,3500);
}
function render(data) {
  const prevActive=current.activeId;current=data;
  $('error').textContent=data.error||'';
  $('fullscreenButton').textContent=data.fullScreen ? '⛶ Exit full screen' : '⛶ Full screen';
  $('fullscreenButton').title=data.fullScreen ? 'Exit full screen (F11)' : 'Enter full screen (F11)';
  $('maximizeButton').textContent=data.maximized?'❐':'□';
  $('maximizeButton').title=data.maximized?'Restore window':'Maximize window';
  $('settings').hidden=!data.settingsVisible;
  $('tabs').replaceChildren();
  for(const app of data.apps){
    const tab=button(app.name,()=>window.multiApp.activate(app.id),
      'tab'+(app.id===data.activeId?' active':'')+(app.loading?' loading':''));
    tab.title=app.url;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(app.id===data.activeId));
    $('tabs').append(tab);
  }
  const active=data.apps.find(a=>a.id===data.activeId);
  $('address').textContent=active?.url||'';
  $('address').title=active?.failed||active?.url||'';
  for(const id of ['back','forward','reload','home'])$(''+id).disabled=!active||(id==='back'&&!active.back)||(id==='forward'&&!active.forward);
  $('loginMenu').hidden=!active?.loginCount||data.settingsVisible;
  $('empty').hidden=data.apps.length!==0||data.settingsVisible;
  if(!active?.loginCount||prevActive!==data.activeId||data.settingsVisible)closeDrawer(false);
}
$('fullscreenButton').onclick=()=>window.multiApp.toggleFullscreen();
$('minimizeButton').onclick=()=>window.multiApp.windowControl('minimize');
$('maximizeButton').onclick=()=>window.multiApp.windowControl('maximize');
$('closeButton').onclick=()=>window.multiApp.windowControl('close');
for(const action of ['back','forward','reload','home'])
  $(action).onclick=()=>{if(current.activeId)window.multiApp.navigate(current.activeId,action);};
function id(prefix){return prefix+'_'+Math.random().toString(36).slice(2,11);}
function showSettings(){
  closeDrawer(false);
  Promise.all([window.multiApp.openSettings(),window.multiApp.securityStatus()]).then(([config,status])=>{
    draft=structuredClone(config);
    $('securityNote').textContent=status.encryptionAvailable
      ? 'Settings are saved in a local SQLite database. Demo passwords use OS keyring encryption when available. Exported settings are encrypted with the password you supply.'
      : 'Settings are saved in a local SQLite database. No secure OS keyring is available, so demo passwords will be stored as PLAINTEXT in the local database. Use demo-only credentials. Exported settings are still encrypted with the password you supply.';
    importSummary=null; $('importPreview').hidden=true; $('unlockImport').hidden=true;
    $('platformTitle').value=draft.title;
    renderSettings();
  }).catch(err=>toast(err.message));
}
function renderSettings(){
  if(!draft)return;
  draft.title=$('platformTitle').value || draft.title;
  $('platformTitle').value=draft.title;
  const target=$('appEditor');target.replaceChildren();
  draft.apps.forEach((app,index)=>{
    const panel=el('article',{class:'appEditor'});
    const head=el('div',{class:'editHead'},[
      el('strong',{text:(index+1)+'. '+(app.name||'New application')}),
      button('↑',()=>moveApp(index,-1)),
      button('↓',()=>moveApp(index,1)),
      button('Delete',()=>{if(confirm('Remove '+app.name+' from your desktop? This does not automatically delete its browser storage.')){draft.apps.splice(index,1);renderSettings();}},'danger')
    ]);
    panel.append(head);
    panel.append(el('div',{class:'grid2'},[
      field('Application name',app.name,v=>{app.name=v;head.querySelector('strong').textContent=(index+1)+'. '+(v||'New application');},{maxLength:100}),
      field('Stable ID',app.id,v=>app.id=v,{maxLength:48})
    ]));
    panel.append(field('Website URL',app.url,v=>app.url=v,{placeholder:'https://app.example.com',maxLength:2048}));
    panel.append(el('h3',{text:'Demo logins ('+app.logins.length+')'}));
    const loginList=el('div');loginList.style.display='grid';loginList.style.gap='9px';
    app.logins.forEach((login,j)=>{
      const box=el('div',{class:'loginEditor'});
      box.append(el('div',{class:'editHead'},[
        el('strong',{text:login.title||'New demo login'}),
        button('↑',()=>moveLogin(app,j,-1)),
        button('↓',()=>moveLogin(app,j,1)),
        button('Remove',()=>{app.logins.splice(j,1);renderSettings();},'danger')
      ]));
      box.append(el('div',{class:'grid2'},[
        field('Title',login.title,v=>login.title=v,{maxLength:100}),
        field('Username / email',login.username,v=>login.username=v,{maxLength:500})
      ]));
      box.append(field('Description',login.description,v=>login.description=v,{multiline:true,maxLength:1000}));
      const pwd=field(login.hasPassword?'Replace saved password (leave blank to keep)':'Password (optional)',login.password||'',v=>{login.password=v;if(v)login.clearPassword=false;},{type:'password',maxLength:2048});
      box.append(pwd);
      if(login.hasPassword)box.append(button('Clear saved password',()=>{login.clearPassword=true;login.hasPassword=false;delete login.password;renderSettings();},'danger'));
      loginList.append(box);
    });
    panel.append(loginList);
    panel.append(button('+ Add demo login',()=>{
      if(app.logins.length>=50){toast('Maximum 50 demo logins per app');return;}
      app.logins.push({id:id('login'),title:'Demo account '+(app.logins.length+1),description:'',username:'',password:''});
      renderSettings();
      const cards=target.children[index]?.querySelectorAll('.loginEditor');
      const latest=cards?.[cards.length-1];
      latest?.scrollIntoView({behavior:'smooth',block:'center'});
      latest?.querySelector('input')?.focus();
      toast('Demo account added. Complete the fields, then Save changes.');
    },'secondary'));
    target.append(panel);
  });
}
function moveApp(i,delta){
  const j=i+delta;
  if(!draft || j<0 || j>=draft.apps.length)return;
  const [app]=draft.apps.splice(i,1);
  draft.apps.splice(j,0,app);
  draft.apps.forEach((item,index)=>{item.order=index;});
  renderSettings();
  toast('Tab order updated. Save changes to apply.');
}
function moveLogin(a,i,delta){const j=i+delta;if(j<0||j>=a.logins.length)return;[a.logins[i],a.logins[j]]=[a.logins[j],a.logins[i]];renderSettings();}
function previewImport(result){
  const {apps,logins,filename}=result.summary;
  const existing=draft.apps.length;
  if(!confirm('Import '+apps+' apps and '+logins+' demo logins from "'+filename+'"?\n\nThis will REPLACE the '+existing+' apps currently shown in Settings. Nothing is saved until you click Save changes. Existing passwords for matching app and login IDs remain if imported password is empty.'))return;
  draft=structuredClone(result.settings);
  importSummary=result.summary;
  $('platformTitle').value=draft.title;
  renderSettings();
  $('unlockImport').hidden=true;
  $('importPassphrase').value='';
  $('importPreview').hidden=false;
  $('importPreview').textContent='Preview imported from '+filename+': '+apps+' apps and '+logins+' demo logins. Review then Save changes to apply, or Cancel to discard.';
  toast('Import loaded for review. Save changes to apply.');
}
$('unlockImportButton').onclick=async()=>{
  const password=$('importPassphrase').value;
  if(!password){toast('Enter the export password');return;}
  try{
    const result=await window.multiApp.importSettings(password);
    previewImport(result);
  }catch(err){
    $('importPreview').hidden=false;
    $('importPreview').textContent='Decryption failed: '+err.message;
  }
};
$('cancelImportButton').onclick=()=>{$('unlockImport').hidden=true;$('importPassphrase').value='';};
$('exportSettings').onclick=async()=>{
  const passphrase=$('exportPassphrase').value;
  if(passphrase.length<8){toast('Export password must be at least 8 characters');return;}
  if(passphrase!==$('exportConfirm').value){toast('Export passwords do not match');return;}
  const btn=$('exportSettings');btn.disabled=true;
  try{
    const result=await window.multiApp.exportSettings(passphrase);
    if(!result.cancelled)toast('Encrypted settings exported: '+result.filename);
  }catch(err){toast('Export failed: '+err.message);}
  finally{$('exportPassphrase').value='';$('exportConfirm').value='';btn.disabled=false;}
};
$('importSettings').onclick=async()=>{
  if(!draft)return;
  const button=$('importSettings'); button.disabled=true;
  try{
    const result=await window.multiApp.importSettings();
    if(result.cancelled)return;
    if(result.needsPassword){
      $('unlockImport').hidden=false;
      $('importPassphrase').focus();
      toast('Encrypted import selected. Enter its password.');
      return;
    }
    previewImport(result);
  }catch(err){
    $('importPreview').hidden=false;
    $('importPreview').textContent='Import error: '+err.message;
    toast('Import failed: '+err.message);
  }finally{button.disabled=false;}
};
$('downloadTemplate').onclick=async()=>{
  const button=$('downloadTemplate');button.disabled=true;
  try{
    const result=await window.multiApp.downloadTemplate();
    if(!result.cancelled)toast('Template saved: '+result.filename);
  }catch(err){toast('Download failed: '+err.message);}finally{button.disabled=false;}
};
$('settingsButton').onclick=()=>current.settingsVisible ? window.multiApp.closeSettings() : showSettings();
$('cancelSettings').onclick=()=>{draft=null;window.multiApp.closeSettings();};
$('addApp').onclick=()=>{if(draft.apps.length>=40){toast('Maximum 40 apps');return;}draft.apps.push({id:id('app'),name:'',url:'https://',logins:[]});renderSettings();};
$('saveSettings').onclick=async()=>{
  if(!draft)return;
  draft.title=$('platformTitle').value;
  const btn=$('saveSettings');btn.disabled=true;
  try{
    for (const app of draft.apps) {
      if(!app.name?.trim())throw new Error('Each application needs a name');
      for(const login of app.logins){
        if(!login.title?.trim())throw new Error('A demo login in '+app.name+' needs a title');
      }
    }
    const result=await window.multiApp.saveSettings(draft);
    if(!result.ok)throw new Error(result.error||'Could not save');
    const expectedOrder=draft.apps.map(a=>a.id);
    if(JSON.stringify(result.order)!==JSON.stringify(expectedOrder))throw new Error('Saved tab order does not match Settings');
    draft=null;await window.multiApp.closeSettings();
    const restored=await window.multiApp.ready();
    if(JSON.stringify(restored.apps.map(a=>a.id))!==JSON.stringify(expectedOrder))throw new Error('Tabs are not displaying in the saved order');
    toast('Settings saved. Tabs updated in the selected order.');
  }catch(err){
    $('importPreview').hidden=false;
    $('importPreview').textContent='Could not save settings: '+err.message;
    $('importPreview').scrollIntoView({behavior:'smooth',block:'nearest'});
    toast('Save failed: '+err.message);
  }finally{btn.disabled=false;}
};
async function openDrawer(){
  if(!current.activeId||!current.apps.find(a=>a.id===current.activeId)?.loginCount)return;
  try {
    demoEntries=await window.multiApp.listLogins(current.activeId);
    if(!demoEntries.length)return;
    await window.multiApp.setDrawer(true);
    drawerOpen=true;$('drawer').hidden=false;$('drawerTitle').textContent='Demo logins';
    $('loginCards').replaceChildren();
    for(const login of demoEntries){
      const card=el('article',{class:'loginCard'},[
        el('h3',{text:login.title}),
        el('p',{text:login.description}),
        el('div',{class:'secretrow'},[
          el('code',{text:login.username||'No username'}),
          button('Copy username',()=>copyField(login.id,'username'))
        ])
      ]);
      if(login.hasPassword)card.append(el('div',{class:'secretrow'},[
        el('code',{text:'••••••••'}),
        button('Copy password',()=>copyField(login.id,'password'))
      ]));
      $('loginCards').append(card);
    }
  }catch(err){toast(err.message);}
}
async function copyField(loginId,field){
  try{await window.multiApp.copyLogin(current.activeId,loginId,field);toast(field==='password'?'Password copied to clipboard':'Username copied to clipboard');}
  catch(err){toast('Copy failed: '+err.message);}
}
async function closeDrawer(notify=true){
  if(!drawerOpen)return;
  drawerOpen=false;$('drawer').hidden=true;
  if(notify)try{await window.multiApp.setDrawer(false);}catch(err){toast(err.message);}
  else window.multiApp.setDrawer(false).catch(()=>{});
}
$('loginMenu').onclick=()=>drawerOpen?closeDrawer():openDrawer();
$('closeDrawer').onclick=()=>closeDrawer();
window.multiApp.onState(render);
window.multiApp.ready().then(render);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && drawerOpen)closeDrawer();
  if(e.key==='Escape' && current.settingsVisible){draft=null;window.multiApp.closeSettings();}
  if(current.settingsVisible)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='r'){e.preventDefault();if(current.activeId)window.multiApp.navigate(current.activeId,'reload');}
  if((e.ctrlKey||e.metaKey)&&e.key==='Tab'&&current.apps.length){e.preventDefault();const i=current.apps.findIndex(a=>a.id===current.activeId);window.multiApp.activate(current.apps[(i+(e.shiftKey?-1:1)+current.apps.length)%current.apps.length].id);}
});
