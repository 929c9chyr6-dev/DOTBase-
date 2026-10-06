(()=>{
let tok='',me=null,D={cars:[],records:[]},season='',carSearch='',swReg=null;
const $=x=>document.getElementById(x), e=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));

async function api(action,p={}){
  const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({action,...p})});
  const j=await r.json().catch(()=>({error:'SERVER'}));
  if(!r.ok){const x=new Error(j.error);x.code=j.error;x.data=j;throw x}return j;
}
function note(el,t,c='msg'){el.innerHTML='<div class="'+c+'">'+e(t)+'</div>'}
function dt(x){return x?new Intl.DateTimeFormat('cs-CZ',{dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—'}
function csvCell(v){return '"'+String(v??'').replaceAll('"','""')+'"'}
function downloadBlob(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function errorText(x){return({DUPLICATE:'SPZ už existuje.',PIN_USED:'PIN už používá někdo jiný.',PIN:'PIN musí mít 2 číslice.',DOT:'Neplatný DOT.',MILEAGE:'Neplatný stav kilometrů.',CAR:'Auto nebylo nalezeno.',USER:'Uživatel nebyl nalezen.',MESSAGE:'Doplň nadpis i text oznámení.'})[x.code]||'Operace se nepodařila.'}

async function login(){
  const p=$('pin').value.replace(/\D/g,'').slice(0,2);$('pin').value=p;
  if(p.length!==2)return note($('loginMsg'),'Kód má 2 číslice.','msg err');
  try{
    const r=await api('login',{pin:p});tok=r.token;me=r.user;$('login').hidden=true;$('main').hidden=false;
    $('who').textContent=me.name+(me.role==='admin'?' · Admin':'');$('adminTab').style.display=me.role==='admin'?'':'none';$('pin').value='';
    await refresh();await updatePushStatus();
    if(!matchMedia('(display-mode: standalone)').matches&&/iPhone|iPad|iPod/.test(navigator.userAgent))$('install').hidden=false;
    const tab=new URLSearchParams(location.search).get('tab');if(tab&&document.getElementById(tab))showTab(tab);
  }catch(x){note($('loginMsg'),x.code==='LOCKED'?'Příliš mnoho pokusů. Zkus to později.':'Špatný kód.','msg err')}
}
$('loginBtn').onclick=login;$('pin').onkeydown=x=>{if(x.key==='Enter')login()};
$('lock').onclick=()=>{tok='';me=null;$('main').hidden=true;$('login').hidden=false;$('loginMsg').innerHTML='';$('pin').focus()};
async function refresh(){try{D=await api('state');render()}catch(x){if(x.code==='AUTH')$('lock').click()}}

function latest(id,s){return D.records.find(r=>r.carId===id&&(!s||r.season===s))}
function valid(){
  const d=$('dot').value.replace(/\D/g,'').slice(0,4),k=$('km').value.replace(/\D/g,'').slice(0,7);$('dot').value=d;$('km').value=k;
  $('save').disabled=!($('car').value&&season&&/^\d{4}$/.test(d)&&+d.slice(0,2)>=1&&+d.slice(0,2)<=53&&k!=='');
  const l=latest($('car').value);$('kmHint').textContent=l?'Poslední evidovaný stav: '+Number(l.mileage).toLocaleString('cs-CZ')+' km.':'Aktuální stav tachometru v km.';
}
$('dot').oninput=valid;$('km').oninput=valid;
function recentKey(){return 'dotRecentCars:'+(me?.id||'guest')}
function getRecent(){try{return JSON.parse(localStorage.getItem(recentKey())||'[]').filter(id=>D.cars.some(c=>c.id===id)).slice(0,4)}catch{return []}}
function renderRecent(){const ids=getRecent(),sel=$('car').value;$('recentCars').innerHTML=ids.length?ids.map(id=>{const c=D.cars.find(x=>x.id===id);return c?'<button class="recent-car '+(sel===id?'active':'')+'" data-id="'+e(c.id)+'"><b>'+e(c.plate)+'</b><br><span style="font-size:12px;font-weight:600">'+e(c.name||'')+'</span></button>':''}).join(''):'<div class="small">Zatím žádná.</div>';document.querySelectorAll('.recent-car').forEach(b=>b.onclick=()=>chooseCar(b.dataset.id))}
function rememberCar(id){if(!id)return;try{localStorage.setItem(recentKey(),JSON.stringify([id,...getRecent().filter(x=>x!==id)].slice(0,4)))}catch{}renderRecent()}
function renderCarOptions(sel=$('car').value){const q=carSearch.trim().toLocaleUpperCase('cs-CZ');let cars=D.cars.filter(c=>!q||(c.plate+' '+c.name).toLocaleUpperCase('cs-CZ').includes(q));const cur=D.cars.find(c=>c.id===sel);if(cur&&!cars.some(c=>c.id===cur.id))cars=[cur,...cars];$('car').innerHTML='<option value="">'+(cars.length?'Vyber auto…':'Žádné auto nenalezeno')+'</option>'+cars.map(c=>'<option value="'+e(c.id)+'">'+e(c.plate)+' — '+e(c.name)+'</option>').join('');if(cur)$('car').value=sel;renderRecent()}
function chooseCar(id){if(!D.cars.some(c=>c.id===id))return;carSearch='';$('carSearch').value='';renderCarOptions(id);$('car').value=id;rememberCar(id);valid()}
$('carSearch').oninput=()=>{carSearch=$('carSearch').value;renderCarOptions($('car').value)};
$('car').onchange=()=>{rememberCar($('car').value);valid();renderRecent()};
function setSeason(s){season=s;$('summer').classList.toggle('on',s==='summer');$('winter').classList.toggle('on',s==='winter');valid()}
$('summer').onclick=()=>setSeason('summer');$('winter').onclick=()=>setSeason('winter');
['1','2','3','4','5','6','7','8','9','C','0','⌫'].forEach(k=>{const b=document.createElement('button');b.textContent=k;b.onclick=()=>{if(k==='C')$('dot').value='';else if(k==='⌫')$('dot').value=$('dot').value.slice(0,-1);else if($('dot').value.length<4)$('dot').value+=k;valid()};$('pad').append(b)});
$('save').onclick=async()=>{
  if($('save').disabled)return;const id=$('car').value,km=+$('km').value,l=latest(id);
  if(l&&km<l.mileage&&!confirm('Stav km je nižší než poslední evidovaný. Opravdu uložit?'))return;
  try{await api('addRecord',{carId:id,season,dot:$('dot').value,mileage:km});$('dot').value='';$('km').value='';season='';$('summer').classList.remove('on');$('winter').classList.remove('on');note($('saveMsg'),'✅ Uloženo a sdíleno online.','msg ok');await refresh();setTimeout(()=>$('saveMsg').innerHTML='',1600)}catch(x){note($('saveMsg'),errorText(x),'msg err')}
};

// Push notifications
function b64ToBytes(base64){const pad='='.repeat((4-base64.length%4)%4),s=(base64+pad).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(s);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
async function ensureSW(){if(!('serviceWorker'in navigator))return null;if(swReg)return swReg;swReg=await navigator.serviceWorker.register('/service-worker.js');await navigator.serviceWorker.ready;return swReg}
async function currentSubscription(){try{const reg=await ensureSW();return reg?await reg.pushManager.getSubscription():null}catch{return null}}
async function updatePushStatus(){
  const status=$('pushStatus'),btn=$('pushToggle');
  if(!('Notification'in window)||!('PushManager'in window)||!('serviceWorker'in navigator)){status.textContent='Tento prohlížeč push oznámení nepodporuje.';btn.disabled=true;return}
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode: standalone)').matches){status.textContent='Na iPhonu nejdřív přidej aplikaci na plochu. Pak půjdou oznámení povolit.';btn.textContent='Nejdřív přidat na plochu';btn.disabled=true;return}
  const sub=await currentSubscription();
  if(Notification.permission==='denied'){status.textContent='Oznámení jsou v systému zakázaná. Povol je v nastavení zařízení.';btn.textContent='Oznámení zakázána';btn.disabled=true;return}
  btn.disabled=false;
  if(sub){status.textContent='Oznámení jsou na tomto zařízení zapnutá.';btn.textContent='🔕 Vypnout oznámení';btn.classList.remove('secondary');btn.classList.add('danger-btn')}
  else{status.textContent='Můžeš dostávat zprávy od admina a povolená systémová upozornění.';btn.textContent='🔔 Povolit oznámení';btn.classList.add('secondary');btn.classList.remove('danger-btn')}
}
$('pushToggle').onclick=async()=>{
  try{
    const reg=await ensureSW();let sub=await reg.pushManager.getSubscription();
    if(sub){const endpoint=sub.endpoint;await sub.unsubscribe();await api('pushUnsubscribe',{endpoint});await updatePushStatus();return}
    const perm=await Notification.requestPermission();if(perm!=='granted'){await updatePushStatus();return}
    if(!D.push?.publicKey)throw new Error('PUSH_KEY');
    sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(D.push.publicKey)});
    await api('pushSubscribe',{subscription:sub.toJSON()});await updatePushStatus();
  }catch(x){console.error(x);note($('pushStatus'),'Oznámení se nepodařilo zapnout. Zkus aplikaci zavřít a znovu otevřít.','msg err')}
};

// Fleet filters/export
function renderFleetUsers(){const current=$('fleetUser').value,users=new Map();D.records.forEach(r=>users.set(r.userId,r.userName));$('fleetUser').innerHTML='<option value="">Všichni uživatelé</option>'+[...users.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'cs')).map(([id,name])=>'<option value="'+e(id)+'">'+e(name)+'</option>').join('');if([...users.keys()].includes(current))$('fleetUser').value=current}
function filteredFleetCars(){const q=$('fleetSearch').value.trim().toLocaleUpperCase('cs-CZ'),s=$('fleetSeason').value,u=$('fleetUser').value,from=$('fleetFrom').value?new Date($('fleetFrom').value+'T00:00:00').getTime():-Infinity,to=$('fleetTo').value?new Date($('fleetTo').value+'T23:59:59.999').getTime():Infinity,recordFilterActive=!!(s||u||$('fleetFrom').value||$('fleetTo').value);return D.cars.filter(c=>{const hay=(String(c.plate||'')+' '+String(c.name||'')).toLocaleUpperCase('cs-CZ');if(q&&!hay.includes(q))return false;if(!recordFilterActive)return true;return D.records.some(r=>{const ts=new Date(r.createdAt).getTime();return r.carId===c.id&&(!s||r.season===s)&&(!u||r.userId===u)&&ts>=from&&ts<=to})})}
function renderFleet(){renderFleetUsers();const cars=filteredFleetCars();let done=0,part=0,h='';for(const c of cars){const s=latest(c.id,'summer'),w=latest(c.id,'winter'),l=latest(c.id);if(s&&w)done++;else if(s||w)part++;h+='<div class="item"><b>'+e(c.plate)+'</b> '+e(c.name)+'<div class="small">'+(l?Number(l.mileage).toLocaleString('cs-CZ')+' km':'bez km')+'</div><span class="chip '+(s?'good':'')+'">☀️ '+(s?e(s.dot):'chybí')+'</span><span class="chip '+(w?'good':'')+'">❄️ '+(w?e(w.dot):'chybí')+'</span></div>'}$('fleetList').innerHTML=h||'<div class="small">Filtru neodpovídá žádné auto.</div>';$('stats').textContent='Celkem '+cars.length+' · Hotovo '+done+' · Rozpracováno '+part;$('fleetCount').textContent='Zobrazeno '+cars.length+' z '+D.cars.length+' aut';$('fleetExportCsv').disabled=cars.length===0}
['fleetSearch','fleetFrom','fleetTo'].forEach(id=>$(id).oninput=renderFleet);['fleetSeason','fleetUser'].forEach(id=>$(id).onchange=renderFleet);
$('clearFleetFilters').onclick=()=>{$('fleetSearch').value='';$('fleetSeason').value='';$('fleetUser').value='';$('fleetFrom').value='';$('fleetTo').value='';renderFleet()};$('fleetRefresh').onclick=refresh;
$('fleetExportCsv').onclick=()=>{const cars=filteredFleetCars();if(!cars.length)return alert('Filtru neodpovídá žádné auto.');const rows=[['SPZ','Vozidlo','Letní DOT','Zimní DOT','Kilometry'],...cars.map(c=>{const s=latest(c.id,'summer'),w=latest(c.id,'winter'),l=latest(c.id);return[c.plate,c.name,s?s.dot:'',w?w.dot:'',l?l.mileage:'']})];downloadBlob('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8;','DOT-Auta-'+new Date().toISOString().slice(0,10)+'.csv')};

// History filters/edit/export
function renderHistoryUsers(){const current=$('histUser').value,users=new Map();D.records.forEach(r=>users.set(r.userId,r.userName));$('histUser').innerHTML='<option value="">Všichni uživatelé</option>'+[...users.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'cs')).map(([id,name])=>'<option value="'+e(id)+'">'+e(name)+'</option>').join('');if([...users.keys()].includes(current))$('histUser').value=current}
function filteredRecords(){const q=$('histSearch').value.trim().toLocaleUpperCase('cs-CZ'),s=$('histSeason').value,u=$('histUser').value,from=$('histFrom').value?new Date($('histFrom').value+'T00:00:00').getTime():-Infinity,to=$('histTo').value?new Date($('histTo').value+'T23:59:59.999').getTime():Infinity;return D.records.filter(r=>{const ts=new Date(r.createdAt).getTime(),hay=(String(r.plate||'')+' '+String(r.vehicle||'')).toLocaleUpperCase('cs-CZ');return(!q||hay.includes(q))&&(!s||r.season===s)&&(!u||r.userId===u)&&ts>=from&&ts<=to})}
async function editRecord(path){
  const r=D.records.find(x=>x.path===path);if(!r)return;
  const plate=prompt('SPZ vozidla:',r.plate);if(plate===null)return;const car=(D.allCars||D.cars).find(c=>c.plate.toUpperCase()===plate.trim().replace(/\s+/g,'').toUpperCase());if(!car)return alert('Auto s touto SPZ nebylo nalezeno.');
  const sx=prompt('Sada: L = letní, Z = zimní',r.season==='summer'?'L':'Z');if(sx===null)return;const ns=/^z/i.test(sx)?'winter':/^l/i.test(sx)?'summer':null;if(!ns)return alert('Zadej L nebo Z.');
  const dot=prompt('DOT (4 číslice):',r.dot);if(dot===null)return;const km=prompt('Kilometry:',String(r.mileage));if(km===null)return;
  try{await api('adminEditRecord',{path:r.path,carId:car.id,season:ns,dot:String(dot).replace(/\D/g,''),mileage:Number(String(km).replace(/\D/g,''))});await refresh()}catch(x){alert(errorText(x))}
}
function renderHist(){renderHistoryUsers();const recs=filteredRecords(),shown=recs.slice(0,300);$('histCount').textContent='Zobrazeno '+recs.length+' z '+D.records.length+' záznamů'+(recs.length>300?' · na obrazovce prvních 300':'');$('exportCsv').disabled=recs.length===0;$('histList').innerHTML=shown.map(r=>'<div class="item"><b>'+e(r.plate)+'</b> · '+(r.season==='summer'?'☀️ Letní':'❄️ Zimní')+' · DOT <b>'+e(r.dot)+'</b><div class="small">'+Number(r.mileage).toLocaleString('cs-CZ')+' km · '+e(r.userName)+' · '+dt(r.createdAt)+'</div>'+(me.role==='admin'?'<div class="toolbar" style="margin-top:6px"><button class="edit-record secondary" data-p="'+e(r.path)+'">Upravit</button><button class="danger-btn del" data-p="'+e(r.path)+'">Smazat</button></div>':'')+'</div>').join('')||'<div class="small">Filtru neodpovídá žádný záznam.</div>';if(me.role==='admin'){document.querySelectorAll('.edit-record').forEach(b=>b.onclick=()=>editRecord(b.dataset.p));document.querySelectorAll('.del').forEach(b=>b.onclick=async()=>{if(confirm('Smazat tento záznam? Tato akce se zapíše do auditu.')){await api('adminDeleteRecord',{path:b.dataset.p});refresh()}})}}
$('refresh').onclick=refresh;['histSearch','histFrom','histTo'].forEach(id=>$(id).oninput=renderHist);['histSeason','histUser'].forEach(id=>$(id).onchange=renderHist);$('clearFilters').onclick=()=>{$('histSearch').value='';$('histSeason').value='';$('histUser').value='';$('histFrom').value='';$('histTo').value='';renderHist()};
$('exportCsv').onclick=()=>{const recs=filteredRecords();if(!recs.length)return alert('Filtru neodpovídá žádný záznam.');const rows=[['SPZ','Vozidlo','Sada','DOT','Kilometry','Uživatel','Datum a čas'],...recs.map(r=>[r.plate,r.vehicle,r.season==='summer'?'Letní':'Zimní',r.dot,r.mileage,r.userName,dt(r.createdAt)])];downloadBlob('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8;','DOT-Evidence-'+new Date().toISOString().slice(0,10)+'.csv')};

// Admin dashboard
function renderAdminDashboard(){const d=D.dashboard||{};$('adminStats').innerHTML=[['Aktivní auta',d.activeCars||0],['Kompletní',d.complete||0],['Nekompletní',d.incomplete||0],['Záznamy',d.records||0],['Pokles km',d.anomalyCount||0],['Archivovaná',d.archivedCars||0]].map(([n,v])=>'<div class="stat"><b>'+e(v)+'</b><span class="small">'+e(n)+'</span></div>').join('');$('adminIssues').innerHTML=(d.issues||[]).slice(0,50).map(x=>'<div class="issue"><b>'+e(x.plate)+'</b> '+e(x.vehicle||'')+'<div class="small">'+e(x.text)+'</div></div>').join('')||'<div class="small">Žádné problémy. 🎉</div>';$('adminActivity').innerHTML=(D.users||[]).map(u=>'<div class="item"><b>'+e(u.name)+'</b> <span class="badge">'+(u.role==='admin'?'Admin':'Uživatel')+'</span><div class="small">Záznamů: '+u.recordCount+' · poslední záznam: '+dt(u.lastRecordAt)+' · poslední přihlášení: '+dt(u.lastLoginAt)+' · zařízení s push: '+u.pushDevices+'</div></div>').join('')}

// Admin cars
$('addCar').onclick=async()=>{const plate=$('newPlate').value.trim(),name=$('newName').value.trim();if(!plate)return;try{await api('adminAddCar',{plate,name});$('newPlate').value=$('newName').value='';await refresh()}catch(x){alert(errorText(x))}};
async function editCar(id){const c=(D.allCars||[]).find(x=>x.id===id);if(!c)return;const plate=prompt('SPZ:',c.plate);if(plate===null)return;const name=prompt('Název vozidla:',c.name||'');if(name===null)return;try{await api('adminUpdateCar',{carId:id,plate,name});await refresh()}catch(x){alert(errorText(x))}}
async function setCarActive(id,active){if(!confirm(active?'Obnovit toto auto z archivu?':'Archivovat toto auto? Historie zůstane zachována.'))return;await api('adminSetCarActive',{carId:id,active});await refresh()}
function carAdminRow(c,active){return '<div class="item checkrow"><input class="'+(active?'active-car-check':'arch-car-check')+'" type="checkbox" value="'+e(c.id)+'"><div><b>'+e(c.plate)+'</b> '+e(c.name||'')+'</div><div class="toolbar"><button class="edit-car secondary" data-id="'+e(c.id)+'">Upravit</button><button class="toggle-car '+(active?'danger-btn':'primary')+'" data-id="'+e(c.id)+'" data-active="'+(!active)+'">'+(active?'Archivovat':'Obnovit')+'</button></div></div>'}
function renderAdminCars(){const all=D.allCars||[],active=all.filter(c=>c.active!==false),arch=all.filter(c=>c.active===false);$('adminCars').innerHTML=active.map(c=>carAdminRow(c,true)).join('')||'<div class="small">Žádná aktivní auta.</div>';$('archivedCars').innerHTML=arch.map(c=>carAdminRow(c,false)).join('')||'<div class="small">Archiv je prázdný.</div>';document.querySelectorAll('.edit-car').forEach(b=>b.onclick=()=>editCar(b.dataset.id));document.querySelectorAll('.toggle-car').forEach(b=>b.onclick=()=>setCarActive(b.dataset.id,b.dataset.active==='true'))}
$('selectAllActive').onclick=()=>document.querySelectorAll('.active-car-check').forEach(x=>x.checked=true);$('selectAllArchived').onclick=()=>document.querySelectorAll('.arch-car-check').forEach(x=>x.checked=true);
async function bulkCars(selector,active){const ids=[...document.querySelectorAll(selector+':checked')].map(x=>x.value);if(!ids.length)return alert('Nejdřív vyber auta.');if(!confirm((active?'Obnovit ':'Archivovat ')+ids.length+' aut?'))return;await api('adminBulkCars',{carIds:ids,active});await refresh()}
$('bulkArchive').onclick=()=>bulkCars('.active-car-check',false);$('bulkRestore').onclick=()=>bulkCars('.arch-car-check',true);

// Admin users
$('addUser').onclick=async()=>{const name=$('newUserName').value.trim(),pin=$('newUserPin').value.replace(/\D/g,'').slice(0,2);if(!name||pin.length!==2)return alert('Zadej jméno a dvoumístný PIN.');try{await api('adminAddUser',{name,pin});$('newUserName').value=$('newUserPin').value='';await refresh()}catch(x){alert(errorText(x))}};
function renderAdminUsers(){
  $('users').innerHTML=(D.users||[]).map(u=>'<div class="user"><div class="row mobile-stack"><input class="un" data-id="'+e(u.id)+'" value="'+e(u.name)+'"><input class="up" data-id="'+e(u.id)+'" inputmode="numeric" maxlength="2" placeholder="nový PIN" style="max-width:130px"><span class="badge">'+(u.role==='admin'?'Admin':'Uživatel')+'</span></div><div class="small" style="margin:6px 0">Záznamů '+u.recordCount+' · poslední login '+dt(u.lastLoginAt)+' · push zařízení '+u.pushDevices+' · '+(u.active?'aktivní':'zablokovaný')+'</div><div class="toolbar"><button class="primary su" data-id="'+e(u.id)+'">Uložit</button><button class="genpin secondary" data-id="'+e(u.id)+'">🎲 Nový PIN</button>'+(u.role!=='admin'?'<button class="tu '+(u.active?'danger-btn':'primary')+'" data-id="'+e(u.id)+'" data-a="'+u.active+'">'+(u.active?'Zablokovat':'Aktivovat')+'</button>':'')+'</div></div>').join('');
  document.querySelectorAll('.su').forEach(b=>b.onclick=async()=>{const id=b.dataset.id,n=document.querySelector('.un[data-id="'+id+'"]').value,p=document.querySelector('.up[data-id="'+id+'"]').value;if(p&&!/^\d{2}$/.test(p))return alert('PIN musí mít 2 číslice.');try{await api('adminUpdateUser',{userId:id,name:n,pin:p});await refresh();alert('Uloženo.')}catch(x){alert(errorText(x))}});
  document.querySelectorAll('.genpin').forEach(b=>b.onclick=async()=>{if(!confirm('Vygenerovat nový PIN? Starý okamžitě přestane fungovat.'))return;try{const r=await api('adminGeneratePin',{userId:b.dataset.id});alert('NOVÝ PIN: '+r.pin+'\n\nUlož si ho nebo ho předej uživateli. Po zavření tohoto okna už ho aplikace znovu nezobrazí.');await refresh()}catch(x){alert(errorText(x))}});
  document.querySelectorAll('.tu').forEach(b=>b.onclick=async()=>{await api('adminUpdateUser',{userId:b.dataset.id,active:b.dataset.a!=='true'});await refresh()});
}

// Notifications admin
function renderNotificationAdmin(){
  const cur=$('notifyRecipient').value;$('notifyRecipient').innerHTML='<option value="all">Všichni aktivní uživatelé</option>'+(D.users||[]).filter(u=>u.active).map(u=>'<option value="'+e(u.id)+'">'+e(u.name)+'</option>').join('');if(cur==='all'||(D.users||[]).some(u=>u.id===cur))$('notifyRecipient').value=cur;
  const s=D.notificationSettings||{};$('autoIncomplete').checked=!!s.incompleteEnabled;$('autoIncompleteDays').value=String(s.incompleteRepeatDays||3);$('autoIncompleteRecipients').value=s.incompleteRecipients||'workers';$('autoSummer').checked=s.incompleteMissingSummer!==false;$('autoWinter').checked=s.incompleteMissingWinter!==false;$('autoAnomaly').checked=!!s.adminAnomalyEnabled;$('autoAdminDays').value=String(s.adminAnomalyRepeatDays||3);$('autoStale').checked=!!s.staleEnabled;$('autoStaleDays').value=String(s.staleDays||365);
  $('notificationLog').innerHTML=(D.notificationLog||[]).slice(0,50).map(n=>'<div class="item"><b>'+e(n.title||n.type)+'</b><div class="small">'+e(n.body||'')+'</div><div class="small">'+dt(n.createdAt)+' · odesláno '+(n.sent??0)+'/'+(n.devices??0)+'</div></div>').join('')||'<div class="small">Zatím žádná oznámení.</div>';
}
$('sendNotification').onclick=async()=>{const recipient=$('notifyRecipient').value,title=$('notifyTitle').value.trim(),message=$('notifyMessage').value.trim();try{const r=await api('adminSendNotification',{recipient,title,message});note($('notifyMsg'),'Odesláno na '+r.sent+' zařízení.','msg ok');$('notifyTitle').value=$('notifyMessage').value='';await refresh()}catch(x){note($('notifyMsg'),errorText(x),'msg err')}};
$('saveNotificationSettings').onclick=async()=>{const settings={incompleteEnabled:$('autoIncomplete').checked,incompleteRepeatDays:+$('autoIncompleteDays').value,incompleteRecipients:$('autoIncompleteRecipients').value,incompleteMissingSummer:$('autoSummer').checked,incompleteMissingWinter:$('autoWinter').checked,adminAnomalyEnabled:$('autoAnomaly').checked,adminAnomalyRepeatDays:+$('autoAdminDays').value,staleEnabled:$('autoStale').checked,staleDays:+$('autoStaleDays').value};try{await api('adminSaveNotificationSettings',{settings});alert('Pravidla oznámení jsou uložená.');await refresh()}catch(x){alert(errorText(x))}};

// Audit
function renderAudit(){const q=$('auditSearch').value.trim().toLocaleLowerCase('cs-CZ');const rows=(D.audit||[]).filter(a=>!q||(a.actorName+' '+a.action+' '+a.summary).toLocaleLowerCase('cs-CZ').includes(q));$('auditList').innerHTML=rows.slice(0,200).map(a=>'<div class="audit-line"><b>'+e(a.actorName)+'</b> · '+e(a.summary)+'<div class="small">'+dt(a.createdAt)+' · '+e(a.action)+'</div></div>').join('')||'<div class="small">Nic nenalezeno.</div>'}
$('auditSearch').oninput=renderAudit;

// Import & backup
function parseCsvLine(line,delimiter){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===delimiter&&!q){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out}
$('importCars').onclick=async()=>{const file=$('csvImport').files?.[0];if(!file)return note($('importMsg'),'Vyber CSV soubor.','msg err');const text=await file.text(),lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return;const delimiter=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';let rows=lines.map(l=>parseCsvLine(l,delimiter));if(rows[0]&&/spz|plate/i.test(rows[0][0]))rows.shift();const payload=rows.map(r=>({plate:r[0],name:r[1]||''})).filter(r=>r.plate);try{const result=await api('adminImportCars',{rows:payload});note($('importMsg'),'Přidáno '+result.added+' aut, přeskočeno '+result.skipped+'.','msg ok');$('csvImport').value='';await refresh()}catch(x){note($('importMsg'),errorText(x),'msg err')}};
$('backupJson').onclick=async()=>{try{const data=await api('adminBackup');downloadBlob(JSON.stringify(data,null,2),'application/json;charset=utf-8','DOT-Evidence-Backup-'+new Date().toISOString().slice(0,10)+'.json')}catch(x){alert(errorText(x))}};

function renderAdmin(){renderAdminDashboard();renderAdminCars();renderAdminUsers();renderNotificationAdmin();renderAudit()}
function render(){const sel=$('car').value;renderCarOptions(sel);valid();renderFleet();renderHist();if(me.role==='admin')renderAdmin()}

function showTab(id){if(id==='admin'&&me.role!=='admin')return;document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));if(id==='history'||id==='admin'||id==='fleet')refresh()}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
document.querySelectorAll('.admin-nav-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-nav-btn').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.admin-pane').forEach(p=>p.classList.toggle('active',p.id==='admin-'+b.dataset.admin))});

setInterval(()=>{if(tok&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))refresh()},12000);
if('serviceWorker'in navigator)ensureSW().catch(()=>{});
})();
