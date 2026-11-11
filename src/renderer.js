'use strict';
const $=id=>document.getElementById(id);
let current={apps:[]}, draft=null, drawerOpen=false, demoEntries=[];
function el(tag,props={},children=[]) {
  const node=document.createElement(tag);
  for(const [k,v] of Object.entries(props)) {
    if(k==='text')node.textContent=v;
    else if(k==='class')node.className=v;
    else if(k==='onClick')node.onclick=v;
    else if(k==='onInput')node.oninput=v;
    else if(k==='value')node.value=v;
    else if(k==='type')node.type=v;
    else if(k==='placeholder')node.placeholder=v;
    else if(k==='maxLength')node.maxLength=v;
    else if(k==='title')node.title=v;
  }
  for(const child of children)node.append(child);
  return node;
}
function button(text,fn,cls='') {return el('button',{text,onClick:fn,class:cls});}
function field(label,value,onChange,props={}) {
  const input=el(props.multiline?'textarea':'input',{value:value||'',type:props.type||'text',
    placeholder:props.placeholder||'',maxLength:props.maxLength||500,onInput:e=>onChange(e.target.value)});
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
  $('title').textContent=data.title;
  $('error').textContent=data.error||'';
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
for(const action of ['back','forward','reload','home'])
  $(action).onclick=()=>{if(current.activeId)window.multiApp.navigate(current.activeId,action);};
function id(prefix){return prefix+'_'+Math.random().toString(36).slice(2,11);}
function showSettings(){
  closeDrawer(false);
  Promise.all([window.multiApp.openSettings(),window.multiApp.securityStatus()]).then(([config,status])=>{
    draft=structuredClone(config);
    $('securityNote').textContent=status.encryptionAvailable
      ? 'Passwords are encrypted using your operating system credential storage. Leave a password field empty to preserve an existing saved password. Passwords cannot be recovered in Settings, but can be copied in the demo drawer.'
      : 'Secure operating system credential storage is unavailable. You may save apps and usernames, but new demo passwords cannot be saved until you enable your OS keyring / credential manager.';
    renderSettings();
  }).catch(err=>toast(err.message));
}
function renderSettings(){
  if(!draft)return;
  $('platformTitle').value=draft.title;
  const target=$('appEditor');target.replaceChildren();
  draft.apps.forEach((app,index)=>{
    const panel=el('article',{class:'appEditor'});
    const head=el('div',{class:'editHead'},[
      el('strong',{text:app.name||'New application'}),
      button('↑',()=>moveApp(index,-1)),
      button('↓',()=>moveApp(index,1)),
      button('Delete',()=>{if(confirm('Remove '+app.name+' from your desktop? This does not automatically delete its browser storage.')){draft.apps.splice(index,1);renderSettings();}},'danger')
    ]);
    panel.append(head);
    panel.append(el('div',{class:'grid2'},[
      field('Application name',app.name,v=>{app.name=v;head.querySelector('strong').textContent=v||'New application';},{maxLength:100}),
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
      const pwd=field(login.hasPassword?'Replace saved password (leave blank to keep)':'Password (optional)',login.password||'',v=>login.password=v,{type:'password',maxLength:2048});
      box.append(pwd);
      if(login.hasPassword)box.append(button('Clear saved password',()=>{login.clearPassword=true;login.hasPassword=false;delete login.password;renderSettings();},'danger'));
      loginList.append(box);
    });
    panel.append(loginList);
    panel.append(button('+ Add demo login',()=>{app.logins.push({id:id('login'),title:'',description:'',username:'',password:''});renderSettings();},'secondary'));
    target.append(panel);
  });
}
function moveApp(i,delta){const j=i+delta;if(j<0||j>=draft.apps.length)return;[draft.apps[i],draft.apps[j]]=[draft.apps[j],draft.apps[i]];renderSettings();}
function moveLogin(a,i,delta){const j=i+delta;if(j<0||j>=a.logins.length)return;[a.logins[i],a.logins[j]]=[a.logins[j],a.logins[i]];renderSettings();}
$('settingsButton').onclick=()=>current.settingsVisible ? window.multiApp.closeSettings() : showSettings();
$('cancelSettings').onclick=()=>{draft=null;window.multiApp.closeSettings();};
$('addApp').onclick=()=>{if(draft.apps.length>=40){toast('Maximum 40 apps');return;}draft.apps.push({id:id('app'),name:'',url:'https://',logins:[]});renderSettings();};
$('saveSettings').onclick=async()=>{
  if(!draft)return;
  draft.title=$('platformTitle').value;
  const btn=$('saveSettings');btn.disabled=true;
  try{
    const result=await window.multiApp.saveSettings(draft);
    if(!result.ok)throw new Error(result.error||'Could not save');
    draft=null;await window.multiApp.closeSettings();toast('Settings saved');
  }catch(err){toast('Save failed: '+err.message);}finally{btn.disabled=false;}
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
