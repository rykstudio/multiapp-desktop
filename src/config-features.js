'use strict';
const THEMES=new Set(['auto','light','dark']);
function theme(value='auto'){
  if(value===undefined || value===null)return 'auto';
  if(typeof value!=='string'||!THEMES.has(value))throw new Error('Theme must be auto, light or dark');
  return value;
}
function group(value=''){
  if(value===undefined || value===null)return '';
  if(typeof value!=='string'||value.length>64)throw new Error('Group must be text of 64 characters or less');
  return value.trim();
}
function hidden(value=false){
  if(value===undefined || value===null)return false;
  if(typeof value!=='boolean')throw new Error('Hidden must be true or false');
  return value;
}
function visibleApps(apps){
  return (apps||[]).filter(a=>!a.hidden);
}
function nextActiveId(apps,activeId){
  const visible=visibleApps(apps);
  return visible.some(a=>a.id===activeId)?activeId:(visible[0]?.id);
}
function moveById(apps,fromId,toId){
  if(!Array.isArray(apps)||fromId===toId)return false;
  const from=apps.findIndex(x=>x.id===fromId),to=apps.findIndex(x=>x.id===toId);
  if(from<0||to<0)return false;
  const [app]=apps.splice(from,1);
  apps.splice(to,0,app);
  apps.forEach((a,i)=>{a.order=i;});
  return true;
}
module.exports={theme,group,hidden,visibleApps,nextActiveId,moveById};
