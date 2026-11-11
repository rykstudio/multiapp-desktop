'use strict';
const $ = id => document.getElementById(id);
let current = {apps:[]};
function render(data) {
  current = data;
  $('title').textContent = data.title;
  $('error').textContent = data.error ? `Configuration error: ${data.error}` : '';
  const tabs = $('tabs'); tabs.replaceChildren();
  for (const item of data.apps) {
    const el = document.createElement('button');
    el.className = `tab${item.id===data.activeId?' active':''}${item.loading?' loading':''}`;
    el.textContent = item.name; el.title = `${item.name}\n${item.url}${item.failed?'\n'+item.failed:''}`;
    el.setAttribute('role','tab'); el.setAttribute('aria-selected',String(item.id===data.activeId));
    el.onclick = () => window.multiApp.activate(item.id);
    tabs.append(el);
  }
  const active = data.apps.find(a => a.id === data.activeId);
  $('address').textContent = active?.url || '';
  $('address').title = active?.failed || active?.url || '';
  $('back').disabled = !active?.back;
  $('forward').disabled = !active?.forward;
  $('reload').disabled = !active;
  $('home').disabled = !active;
}
for (const action of ['back','forward','reload','home']) {
  $(action).onclick = () => {if(current.activeId) window.multiApp.navigate(current.activeId,action);};
}
$('edit').onclick = () => window.multiApp.openConfig();
$('refreshConfig').onclick = () => window.multiApp.reloadConfig();
window.multiApp.onState(render);
window.multiApp.ready().then(render);
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='r') {e.preventDefault(); if(current.activeId) window.multiApp.navigate(current.activeId,'reload');}
  if ((e.ctrlKey || e.metaKey) && e.key==='Tab') {
    e.preventDefault();const idx=current.apps.findIndex(a=>a.id===current.activeId);const next=(idx+(e.shiftKey?-1:1)+current.apps.length)%current.apps.length;
    if(current.apps[next])window.multiApp.activate(current.apps[next].id);
  }
});
