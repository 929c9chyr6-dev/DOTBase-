(()=>{
let tok='',me=null,D={cars:[],records:[]},season='',carSearch='',swReg=null,openVehicleDetail=null,lastInteraction=Date.now(),currentModule='home',settingsDevicesLoaded=false,trafficReport=null,trafficLoading=false,lastTrafficLoad=0,trafficPrefsDirty=false;
const $=x=>document.getElementById(x), e=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const ROLE_LABELS={admin:'Admin',dispatch:'Dispatch',driver:'Driver',technician:'Technician'};
const PERMS=[['dotView','Vidět DOT údaje v přehledu aut'],['dotCreate','Zapisovat DOT'],['dotEdit','Upravovat DOT záznamy'],['dotDelete','Mazat DOT záznamy'],['fleetView','Vidět přehled aut'],['fleetExport','Exportovat přehled aut'],['historyView','Vidět historii'],['historyExport','Exportovat historii'],['vehicleDetail','Vidět detail vozidla (bez auditu)'],['attentionView','Vidět upozornění Vyžaduje pozornost'],['attentionEdit','Upravovat z Vyžaduje pozornost'],['notificationsReceive','Přijímat oznámení']];
const WRITE_PERMS=new Set(['dotCreate','dotEdit','dotDelete','attentionEdit']);
function isReadOnly(){return me?.role!=='admin'&&D.system?.mode==='read_only'}
function can(k){if(isReadOnly()&&WRITE_PERMS.has(k))return false;return me?.role==='admin'||!!D.permissions?.[k]}
function roleLabel(r){return ROLE_LABELS[r]||r||'—'}
const themeMedia=matchMedia('(prefers-color-scheme: dark)');
function themePreference(){const p=localStorage.getItem('appTheme')||'system';return ['light','dark','system'].includes(p)?p:'system'}
function applyTheme(pref=themePreference()){
  const dark=pref==='dark'||(pref==='system'&&themeMedia.matches),effective=dark?'dark':'light';
  document.documentElement.dataset.theme=effective;
  document.documentElement.dataset.themePreference=pref;
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=dark?'#0b1220':'#111827';
  if($('themeMode'))$('themeMode').value=pref;
  if($('themeCurrent'))$('themeCurrent').textContent=dark?'🌙 Tmavý':'☀️ Světlý';
}
function setThemePreference(pref){if(!['light','dark','system'].includes(pref))return;localStorage.setItem('appTheme',pref);applyTheme(pref)}
themeMedia.addEventListener?.('change',()=>{if(themePreference()==='system')applyTheme('system')});

async function api(action,p={}){
  const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({action,...p})});
  const j=await r.json().catch(()=>({error:'SERVER'}));
  if(!r.ok){const x=new Error(j.error);x.code=j.error;x.data=j;if(j.error==='MAINTENANCE'&&tok)setTimeout(()=>lockApp(j.message||'🔧 Probíhá technická údržba\nAplikace je dočasně pozastavena administrátorem.\nZkuste to prosím později.','msg warn'),0);throw x}return j;
}
function note(el,t,c='msg'){el.innerHTML='<div class="'+c+'">'+e(t)+'</div>'}
function dt(x){return x?new Intl.DateTimeFormat('cs-CZ',{dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—'}
function csvCell(v){return '"'+String(v??'').replaceAll('"','""')+'"'}
function downloadBlob(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function errorText(x){if(x?.data?.message)return x.data.message;return({DUPLICATE:'SPZ už existuje.',PIN_USED:'PIN už používá někdo jiný.',PIN:'PIN musí mít 2 číslice.',DOT:'Neplatný DOT.',MILEAGE:'Neplatný stav kilometrů.',CAR:'Auto nebylo nalezeno.',USER:'Uživatel nebyl nalezen.',MESSAGE:'Doplň nadpis i text oznámení.',READ_ONLY:'Aplikace je momentálně pouze pro čtení.',MAINTENANCE:'Probíhá technická údržba.',SYSTEM_MODE:'Neplatný provozní režim.',TRAFFIC_TERMS:'Doplň alespoň jeden rozpoznávací název.',TRAFFIC_CORRIDOR:'Sledovaný úsek nebyl nalezen.'})[x.code]||'Operace se nepodařila.'}

function lockApp(message='',cls='msg'){
  tok='';me=null;D={cars:[],records:[]};openVehicleDetail=null;currentModule='home';settingsDevicesLoaded=false;trafficReport=null;trafficLoading=false;lastTrafficLoad=0;trafficPrefsDirty=false;
  $('noticeOverlay').hidden=true;$('issueEditOverlay').hidden=true;$('systemBanner').hidden=true;$('main').hidden=true;$('login').hidden=false;$('loginMsg').innerHTML='';
  if(message)note($('loginMsg'),message,cls);$('pin').focus();
}
async function login(){
  const p=$('pin').value.replace(/\D/g,'').slice(0,2);$('pin').value=p;
  if(p.length!==2)return note($('loginMsg'),'Kód má 2 číslice.','msg err');
  try{
    const r=await api('login',{pin:p});tok=r.token;me=r.user;lastInteraction=Date.now();$('login').hidden=true;$('main').hidden=false;
    $('pin').value='';
    await refresh();await heartbeat();await updatePushStatus();loadTrafficReport(false).catch(()=>{});
    if(!matchMedia('(display-mode: standalone)').matches&&/iPhone|iPad|iPod/.test(navigator.userAgent))$('install').hidden=false;
    const qs=new URLSearchParams(location.search),tab=qs.get('tab'),mod=qs.get('module');
    if(tab==='admin')openModule('admin');
    else if(['entry','fleet','history'].includes(tab)){openModule('pneu');showTab(tab)}
    else if(['service','pneu','transport','maintenance','settings','admin'].includes(mod))openModule(mod);
    else openModule('home');
  }catch(x){
    const msg=x.code==='LOCKED'?'Příliš mnoho pokusů. Zkus to později.':x.code==='MAINTENANCE'?errorText(x):'Špatný kód.';
    note($('loginMsg'),msg,x.code==='MAINTENANCE'?'msg warn':'msg err');
  }
}
$('loginBtn').onclick=login;$('pin').onkeydown=x=>{if(x.key==='Enter')login()};
$('lock').onclick=()=>lockApp();
async function refresh(){try{D=await api('state');if(D.me)me=D.me;render()}catch(x){if(x.code==='AUTH')lockApp();else if(x.code==='MAINTENANCE')lockApp(errorText(x),'msg warn')}}

function latest(id,s){return D.records.find(r=>r.carId===id&&(!s||r.season===s))}
function valid(){
  const d=$('dot').value.replace(/\D/g,'').slice(0,4),k=$('km').value.replace(/\D/g,'').slice(0,7);$('dot').value=d;$('km').value=k;
  $('save').disabled=!can('dotCreate')||!($('car').value&&season&&/^\d{4}$/.test(d)&&+d.slice(0,2)>=1&&+d.slice(0,2)<=53&&k!=='');
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
  if(isReadOnly()){status.textContent='Aplikace je v režimu pouze pro čtení. Nastavení oznámení je dočasně zamknuté.';btn.textContent='Dočasně zamčeno';btn.disabled=true;btn.classList.add('secondary');btn.classList.remove('danger-btn');return}if(!can('notificationsReceive')){status.textContent='Oznámení nejsou pro tento účet povolena administrátorem.';btn.textContent='Oznámení nejsou povolena';btn.disabled=true;btn.classList.add('secondary');btn.classList.remove('danger-btn');return}
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
    if(sub){const endpoint=sub.endpoint;await sub.unsubscribe();await api('pushUnsubscribe',{endpoint});await updatePushStatus();settingsDevicesLoaded=false;await loadMyPushDevices();return}
    const perm=await Notification.requestPermission();if(perm!=='granted'){await updatePushStatus();return}
    if(!D.push?.publicKey)throw new Error('PUSH_KEY');
    sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(D.push.publicKey)});
    await api('pushSubscribe',{subscription:sub.toJSON()});await updatePushStatus();settingsDevicesLoaded=false;await loadMyPushDevices();
  }catch(x){console.error(x);note($('pushStatus'),'Oznámení se nepodařilo zapnout. Zkus aplikaci zavřít a znovu otevřít.','msg err')}
};


function deviceLabel(ua=''){
  const s=String(ua);
  let device=/iPhone/i.test(s)?'iPhone':/iPad/i.test(s)?'iPad':/Android/i.test(s)?'Android':/Windows/i.test(s)?'Windows PC':/Macintosh|Mac OS X/i.test(s)?'Mac':'Zařízení';
  let browser=/Edg\//i.test(s)?'Edge':/CriOS|Chrome\//i.test(s)?'Chrome':/FxiOS|Firefox\//i.test(s)?'Firefox':/Safari\//i.test(s)?'Safari':'Prohlížeč';
  return device+' · '+browser;
}
async function loadMyPushDevices(force=false){
  if(!$('settingsDevices')||!tok)return;
  if(settingsDevicesLoaded&&!force)return;
  $('settingsDevices').innerHTML='<div class="small">Načítám zařízení…</div>';
  try{
    const r=await api('myPushDevices'),rows=r.devices||[];
    settingsDevicesLoaded=true;
    $('settingsDevices').innerHTML=rows.length?rows.map(d=>'<div class="item"><b>📱 '+e(deviceLabel(d.userAgent))+'</b><div class="small">Push aktivován: '+dt(d.createdAt)+'</div></div>').join(''):'<div class="small">Na žádném zařízení nemáš aktivní push oznámení.</div>';
  }catch(x){
    $('settingsDevices').innerHTML='<div class="small">Seznam zařízení se nepodařilo načíst.</div>';
  }
}

// Persistent in-app notifications
function pendingNotifications(){
  const rows=[...(D.pendingNotifications||[])];
  const wanted=new URLSearchParams(location.search).get('notification');
  if(wanted){const i=rows.findIndex(n=>n.id===wanted);if(i>0)rows.unshift(rows.splice(i,1)[0])}
  return rows;
}
function clearNotificationUrl(){
  const u=new URL(location.href);
  if(u.searchParams.has('notification')){u.searchParams.delete('notification');history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams:'')+u.hash)}
}
function vehicleDetailHtml(v){
  const summer=v.latestSummer,winter=v.latestWinter,last=v.latest;
  const records=(v.records||[]).map(r=>'<div class="item"><b>'+(r.season==='summer'?'☀️ Letní':'❄️ Zimní')+' · DOT '+e(r.dot)+'</b><div class="small">'+Number(r.mileage).toLocaleString('cs-CZ')+' km · '+e(r.userName)+' · '+dt(r.createdAt)+'</div></div>').join('')||'<div class="small">Žádné evidenční záznamy.</div>';
  const timeline=(v.timeline||[]).map(a=>'<div class="item"><b>'+e(a.actorName)+'</b> · '+e(a.summary)+'<div class="small">'+dt(a.createdAt)+'</div></div>').join('')||'<div class="small">Žádné změny.</div>';
  return '<h2>🚗 '+e(v.car.plate)+' · '+e(v.car.name||'')+'</h2>'+
    '<div class="vehicle-head"><div><b>Stav:</b> '+(v.car.active===false?'Archivované':'Aktivní')+'</div>'+
    '<div><b>Poslední km:</b> '+(last?Number(last.mileage).toLocaleString('cs-CZ')+' km':'bez záznamu')+'</div>'+
    '<div><b>Letní DOT:</b> '+(summer?e(summer.dot)+' · '+dt(summer.createdAt):'chybí')+'</div>'+
    '<div><b>Zimní DOT:</b> '+(winter?e(winter.dot)+' · '+dt(winter.createdAt):'chybí')+'</div></div>'+
    '<div class="timeline"><h3>Posledních 5 evidenčních záznamů</h3>'+records+'</div>'+
    '<div class="timeline"><h3>Posledních 5 změn a akcí</h3>'+timeline+'</div>'+
    '<button id="closeVehicleDetail" class="primary" style="width:100%;margin-top:12px">Zavřít detail</button>';
}
function renderNoticeOverlay(){
  const ov=$('noticeOverlay'),box=$('noticeBox');
  if(!me){ov.hidden=true;return}
  if(openVehicleDetail){
    ov.hidden=false;box.innerHTML=vehicleDetailHtml(openVehicleDetail);
    $('closeVehicleDetail').onclick=async()=>{openVehicleDetail=null;await refresh()};
    return;
  }
  const n=pendingNotifications()[0];
  if(!n){ov.hidden=true;box.innerHTML='';return}
  ov.hidden=false;
  box.innerHTML='<h2>🔔 '+e(n.title)+'</h2><div class="sub">'+dt(n.createdAt)+(n.carPlate?' · '+e(n.carPlate):'')+'</div>'+
    '<div class="notice">'+e(n.body)+'</div>'+
    '<div class="small" style="margin-top:8px">Oznámení zůstane otevřené, dokud nepotvrdíš jednu z možností.</div>'+
    '<div class="notice-actions"><button id="noticeOk" class="primary">Rozumím</button>'+
    (n.carId?'<button id="noticeVehicle" class="secondary">🚗 Zobrazit vozidlo</button>':'')+'</div>';
  $('noticeOk').onclick=()=>respondNotification(n,'understood');
  if(n.carId)$('noticeVehicle').onclick=()=>respondNotification(n,'view_vehicle');
}
async function respondNotification(n,response){
  const buttons=$('noticeBox').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
  try{
    const r=await api('notificationRespond',{notificationId:n.id,response});
    clearNotificationUrl();
    if(response==='view_vehicle'&&r.vehicle){openVehicleDetail=r.vehicle;renderNoticeOverlay()}
    else{openVehicleDetail=null;await refresh()}
  }catch(x){buttons.forEach(b=>b.disabled=false);alert(errorText(x))}
}
async function openVehicle(carId){
  try{const r=await api(me.role==='admin'?'adminVehicleDetail':'vehicleDetail',{carId});openVehicleDetail=r.vehicle;renderNoticeOverlay()}catch(x){alert(errorText(x))}
}
async function openAdminVehicle(carId){return openVehicle(carId)}

// Fleet filters/export
function renderFleetUsers(){const current=$('fleetUser').value,users=new Map();D.records.forEach(r=>users.set(r.userId,r.userName));$('fleetUser').innerHTML='<option value="">Všichni uživatelé</option>'+[...users.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'cs')).map(([id,name])=>'<option value="'+e(id)+'">'+e(name)+'</option>').join('');if([...users.keys()].includes(current))$('fleetUser').value=current}
function filteredFleetCars(){const q=$('fleetSearch').value.trim().toLocaleUpperCase('cs-CZ'),s=$('fleetSeason').value,u=$('fleetUser').value,from=$('fleetFrom').value?new Date($('fleetFrom').value+'T00:00:00').getTime():-Infinity,to=$('fleetTo').value?new Date($('fleetTo').value+'T23:59:59.999').getTime():Infinity,recordFilterActive=!!(s||u||$('fleetFrom').value||$('fleetTo').value);return D.cars.filter(c=>{const hay=(String(c.plate||'')+' '+String(c.name||'')).toLocaleUpperCase('cs-CZ');if(q&&!hay.includes(q))return false;if(!recordFilterActive)return true;return D.records.some(r=>{const ts=new Date(r.createdAt).getTime();return r.carId===c.id&&(!s||r.season===s)&&(!u||r.userId===u)&&ts>=from&&ts<=to})})}
function renderFleet(){renderFleetUsers();const cars=filteredFleetCars();let done=0,part=0,h='';for(const c of cars){const s=latest(c.id,'summer'),w=latest(c.id,'winter'),l=latest(c.id);if(s&&w)done++;else if(s||w)part++;h+='<div class="item"><b>'+e(c.plate)+'</b> '+e(c.name)+'<div class="small">'+(l?Number(l.mileage).toLocaleString('cs-CZ')+' km':'bez km')+'</div><span class="chip '+(s?'good':'')+'">☀️ '+(s?e(s.dot):'chybí')+'</span><span class="chip '+(w?'good':'')+'">❄️ '+(w?e(w.dot):'chybí')+'</span>'+(can('vehicleDetail')?'<div class="toolbar" style="margin-top:7px"><button class="fleet-detail secondary" data-id="'+e(c.id)+'">Detail vozidla</button></div>':'')+'</div>'}$('fleetList').innerHTML=h||'<div class="small">Filtru neodpovídá žádné auto.</div>';$('stats').textContent='Celkem '+cars.length+' · Hotovo '+done+' · Rozpracováno '+part;$('fleetCount').textContent='Zobrazeno '+cars.length+' z '+D.cars.length+' aut';$('fleetExportCsv').disabled=cars.length===0||!can('fleetExport');$('fleetExportCsv').style.display=can('fleetExport')?'':'none';document.querySelectorAll('.fleet-detail').forEach(b=>b.onclick=()=>openVehicle(b.dataset.id))}
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
  try{await api('editRecord',{path:r.path,carId:car.id,season:ns,dot:String(dot).replace(/\D/g,''),mileage:Number(String(km).replace(/\D/g,''))});await refresh()}catch(x){alert(errorText(x))}
}
function renderHist(){renderHistoryUsers();const recs=filteredRecords(),shown=recs.slice(0,300);$('histCount').textContent='Zobrazeno '+recs.length+' z '+D.records.length+' záznamů'+(recs.length>300?' · na obrazovce prvních 300':'');$('exportCsv').disabled=recs.length===0||!can('historyExport');$('exportCsv').style.display=can('historyExport')?'':'none';$('histList').innerHTML=shown.map(r=>'<div class="item"><b>'+e(r.plate)+'</b> · '+(r.season==='summer'?'☀️ Letní':'❄️ Zimní')+' · DOT <b>'+e(r.dot)+'</b><div class="small">'+Number(r.mileage).toLocaleString('cs-CZ')+' km · '+e(r.userName)+' · '+dt(r.createdAt)+'</div>'+((can('dotEdit')||can('dotDelete'))?'<div class="toolbar" style="margin-top:6px">'+(can('dotEdit')?'<button class="edit-record secondary" data-p="'+e(r.path)+'">Upravit</button>':'')+(can('dotDelete')?'<button class="danger-btn del" data-p="'+e(r.path)+'">Smazat</button>':'')+'</div>':'')+'</div>').join('')||'<div class="small">Filtru neodpovídá žádný záznam.</div>';if(can('dotEdit'))document.querySelectorAll('.edit-record').forEach(b=>b.onclick=()=>editRecord(b.dataset.p));if(can('dotDelete'))document.querySelectorAll('.del').forEach(b=>b.onclick=async()=>{if(confirm('Smazat tento záznam? Tato akce se zapíše do auditu.')){await api('deleteRecord',{path:b.dataset.p});refresh()}})}
$('refresh').onclick=refresh;['histSearch','histFrom','histTo'].forEach(id=>$(id).oninput=renderHist);['histSeason','histUser'].forEach(id=>$(id).onchange=renderHist);$('clearFilters').onclick=()=>{$('histSearch').value='';$('histSeason').value='';$('histUser').value='';$('histFrom').value='';$('histTo').value='';renderHist()};
$('exportCsv').onclick=()=>{const recs=filteredRecords();if(!recs.length)return alert('Filtru neodpovídá žádný záznam.');const rows=[['SPZ','Vozidlo','Sada','DOT','Kilometry','Uživatel','Datum a čas'],...recs.map(r=>[r.plate,r.vehicle,r.season==='summer'?'Letní':'Zimní',r.dot,r.mileage,r.userName,dt(r.createdAt)])];downloadBlob('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8;','DOT-Evidence-'+new Date().toISOString().slice(0,10)+'.csv')};

// Modular shell
function hasPneuAccess(){return ['dotCreate','fleetView','historyView','attentionView'].some(can)}
function openModule(id){
  if(id==='admin'&&me?.role!=='admin')return;
  if(id==='pneu'&&!hasPneuAccess())return;
  if(id==='transport'&&D.transport?.enabled===false&&me?.role!=='admin')return;
  currentModule=id||'home';
  document.querySelectorAll('.module-screen').forEach(x=>x.classList.toggle('active',x.id===currentModule));
  if(currentModule==='pneu'){
    const active=document.querySelector('#pneu .panel.active')?.id;
    if(!active||!allowedTab(active)){const first=['entry','fleet','history'].find(allowedTab);if(first)showTab(first,false)}
  }
  if(currentModule==='admin'&&me?.role==='admin')refresh();
  if(currentModule==='service'||currentModule==='maintenance'||currentModule==='settings')renderModuleShell();
  if(currentModule==='transport'){renderTrafficReport();loadTrafficReport(false).catch(()=>{})}
  if(currentModule==='settings'){updatePushStatus();loadMyPushDevices()}
}

function trafficStatusMeta(status){
  return status==='critical'?{cls:'critical',icon:'🔴',label:'Vážné omezení'}:
    status==='warning'?{cls:'warning',icon:'🟠',label:'Omezení / komplikace'}:
    status==='clear'?{cls:'clear',icon:'🟢',label:'Bez hlášených omezení'}:
    {cls:'unknown',icon:'⚪',label:'Čeká na data'};
}
function trafficDaypart(){
  const h=new Date().getHours();
  if(h>=5&&h<10)return '🌅 RANNÍ ŠPIČKA';
  if(h>=14&&h<19)return '🌆 ODPOLEDNÍ ŠPIČKA';
  return 'DOPRAVNÍ REPORT';
}
function trafficHomeText(){
  if(!trafficReport)return 'Dopravní report pro sledované úseky.';
  if(!trafficReport.sourceConfigured)return '⚪ Datový zdroj čeká na připojení';
  if(trafficReport.summary?.critical)return '🔴 '+trafficReport.summary.critical+' úseků s vážným omezením';
  if(trafficReport.summary?.warning)return '🟠 '+trafficReport.summary.warning+' úseků s omezením';
  return '🟢 Bez hlášených omezení';
}
function renderTrafficMap(report){
  if(!$('trafficMap'))return;
  const status=Object.fromEntries((report?.corridors||[]).map(x=>[x.id,x.status]));
  const cls=id=>e(status[id]||'unknown');
  $('trafficMap').innerHTML='<svg viewBox="0 0 520 300" role="img" aria-label="Orientační mapa sledovaných dopravních koridorů">'+
    '<g opacity=".18"><path d="M0 75H520M0 150H520M0 225H520M130 0V300M260 0V300M390 0V300" stroke="currentColor" stroke-width="1"/></g>'+
    '<path class="traffic-map-road '+cls('d6-west')+'" d="M42 90 L85 92 L120 95 L160 101 L202 108"/>'+
    '<path class="traffic-map-road '+cls('d0-west')+'" d="M120 38 L148 63 L176 95 L205 128 L235 162 L274 197 L316 238"/>'+
    '<path class="traffic-map-road '+cls('evropska')+'" d="M176 95 L221 84 L273 80 L334 86 L388 96"/>'+
    '<path class="traffic-map-road '+cls('rozvadovska')+'" d="M205 128 L250 138 L293 146"/>'+
    '<path class="traffic-map-road '+cls('plzenska')+'" d="M293 146 L345 160 L405 172 L468 176"/>'+
    '<path class="traffic-map-road '+cls('lochkov-tunnels')+'" d="M285 210 L316 238 L345 253"/>'+
    '<circle class="traffic-map-road '+cls('jenec')+'" cx="120" cy="95" r="22"/>'+
    '<circle cx="120" cy="95" r="4" fill="currentColor"/><text class="traffic-map-label" x="84" y="128">Jeneč</text>'+
    '<text class="traffic-map-label" x="42" y="78">D6</text><text class="traffic-map-label" x="113" y="27">Středokluky</text>'+
    '<text class="traffic-map-label" x="322" y="251">Lochkov</text><text class="traffic-map-label" x="397" y="166">Plzeňská</text>'+
    '<text class="traffic-map-label" x="335" y="76">Evropská</text><text class="traffic-map-label" x="225" y="127">Rozvadovská spojka</text>'+
    '</svg>';
}
function renderTrafficReport(){
  if(!$('trafficHeadline'))return;
  $('trafficDaypart').textContent=trafficDaypart();
  const r=trafficReport;
  if(!r){
    $('trafficHeadline').textContent=trafficLoading?'Načítám dopravní situaci…':'Dopravní report je připravený.';
    $('trafficUpdated').textContent='Otevři modul nebo použij Obnovit.';
    $('trafficSummary').innerHTML='';
    $('trafficCorridors').innerHTML='<div class="small">Načítám sledované úseky…</div>';
    $('trafficEvents').innerHTML='<div class="small">Načítám aktuální události…</div>';
    renderTrafficMap({corridors:(D.transport?.corridors||[]).map(x=>({...x,status:'unknown'}))});
    return;
  }
  const s=r.summary||{};
  if(!r.sourceConfigured)$('trafficHeadline').textContent='Sledované koridory jsou připravené';
  else if(s.critical)$('trafficHeadline').textContent='Pozor, na trase jsou vážná omezení';
  else if(s.warning)$('trafficHeadline').textContent='Na některých úsecích jsou omezení';
  else $('trafficHeadline').textContent='Bez hlášených omezení';
  $('trafficUpdated').textContent=r.fetchedAt?'Data '+(r.stale?'z posledního dostupného načtení · ':'aktualizována ') + dt(r.fetchedAt):'Živý zdroj zatím není připojený.';
  $('trafficSummary').innerHTML=
    '<div class="traffic-stat"><b>🟢 '+(s.clear||0)+'</b><span>bez omezení</span></div>'+
    '<div class="traffic-stat"><b>🟠 '+(s.warning||0)+'</b><span>omezení</span></div>'+
    '<div class="traffic-stat"><b>🔴 '+(s.critical||0)+'</b><span>vážné</span></div>';
  const src=$('trafficSourceCard');
  src.classList.toggle('traffic-source-ok',!!r.sourceConfigured&&!r.error);
  src.classList.toggle('traffic-source-warn',!r.sourceConfigured||!!r.error);
  $('trafficSourceTitle').textContent=r.sourceConfigured?'📡 '+(r.source||'NDIC přes Golemio'):'📡 Dopravní data čekají na připojení';
  $('trafficSourceText').textContent=!r.sourceConfigured?'Report a sledované úseky jsou připravené. Pro živá data chybí na serveru Golemio API klíč.':r.error?(r.stale?'Zdroj je dočasně nedostupný; zobrazuji poslední uložená data.':'Zdroj je dočasně nedostupný.'):'Aktuální dopravní omezení z NDIC přes server Golemio.';
  $('trafficCorridors').innerHTML=(r.corridors||[]).map(x=>{
    const m=trafficStatusMeta(x.status);
    return '<div class="traffic-corridor traffic-'+m.cls+'"><div class="traffic-corridor-top"><span class="traffic-state-dot"></span><div style="flex:1"><b>'+e(x.name)+'</b><div class="traffic-status-label">'+m.icon+' '+m.label+(x.eventCount?' · '+x.eventCount+' událostí':'')+'</div><div class="small" style="margin-top:4px">'+e(x.summary||x.description||'')+'</div></div></div></div>';
  }).join('')||'<div class="small">Nejsou nastavené žádné sledované úseky.</div>';
  $('trafficEvents').innerHTML=(r.events||[]).map(ev=>{
    const names=(ev.corridorIds||[]).map(id=>r.corridors.find(c=>c.id===id)?.name).filter(Boolean);
    const extra=[ev.delayMinutes?('zdržení cca '+ev.delayMinutes+' min'):'',ev.lanesRestricted?('omezené pruhy: '+ev.lanesRestricted):''].filter(Boolean).join(' · ');
    return '<div class="traffic-event '+(ev.severity==='critical'?'critical':'')+'"><div class="traffic-event-title">'+(ev.severity==='critical'?'🔴':'🟠')+' '+e(ev.typeLabel||'Dopravní omezení')+'</div><div>'+e(ev.text||'')+'</div>'+(extra?'<div class="small" style="margin-top:4px">'+e(extra)+'</div>':'')+(names.length?'<div class="small" style="margin-top:4px">Úsek: '+e(names.join(' · '))+'</div>':'')+'</div>';
  }).join('')||(r.sourceConfigured?'<div class="small">Na sledovaných úsecích nejsou aktuálně zachycená žádná hlášená omezení.</div>':'<div class="small">Události se zobrazí po připojení živého datového zdroje.</div>');
  renderTrafficMap(r);
}
async function loadTrafficReport(force=false){
  if(!tok||trafficLoading||D.transport?.enabled===false)return trafficReport;
  trafficLoading=true;renderTrafficReport();
  try{
    trafficReport=await api('trafficReport',{force:!!force});lastTrafficLoad=Date.now();
    renderTrafficReport();renderModuleShell();
    return trafficReport;
  }catch(x){
    if($('trafficSourceText'))$('trafficSourceText').textContent='Dopravní report se nepodařilo načíst.';
    throw x;
  }finally{trafficLoading=false}
}
function updateTrafficRepeatVisibility(){
  if($('trafficRepeatMinutesWrap'))$('trafficRepeatMinutesWrap').hidden=$('trafficRepeatMode').value!=='interval';
}
function renderTrafficPrefs(force=false){
  if(!$('trafficPrefsCard'))return;
  const t=D.transport||{},p=t.prefs||{};
  $('trafficPrefsCard').hidden=t.enabled===false;
  if(trafficPrefsDirty&&!force)return;
  $('trafficNotifyEnabled').checked=!!p.notificationsEnabled;
  $('trafficSeverity').value=p.severity||'significant';
  $('trafficRepeatMode').value=p.repeatMode||'change';
  $('trafficRepeatMinutes').value=String(p.repeatMinutes||60);
  $('trafficResolved').checked=p.resolved!==false;
  const selected=new Set(p.corridorIds||[]);
  $('trafficPrefsCorridors').innerHTML=(t.corridors||[]).map(x=>'<label class="traffic-pref-item"><input class="traffic-pref-corridor" type="checkbox" value="'+e(x.id)+'" '+(selected.has(x.id)?'checked':'')+'><span><b>'+e(x.name)+'</b><span class="small" style="display:block">'+e(x.description||'')+'</span></span></label>').join('')||'<div class="small">Admin zatím nenastavil žádné sledované úseky.</div>';
  document.querySelectorAll('.traffic-pref-corridor').forEach(x=>x.onchange=()=>{trafficPrefsDirty=true});
  updateTrafficRepeatVisibility();
}

function renderVehiclePreviews(target,kind){
  const cars=(D.cars||[]).slice(0,80);
  $(target).innerHTML=cars.map(car=>{
    const l=latest(car.id),s=latest(car.id,'summer'),w=latest(car.id,'winter');
    const extra=kind==='service'
      ?'Aktuální km: '+(l?Number(l.mileage).toLocaleString('cs-CZ'):'—')+' · servisní profil doplníme'
      :'Aktuální km: '+(l?Number(l.mileage).toLocaleString('cs-CZ'):'—')+' · údržbová evidence se připravuje';
    return '<div class="vehicle-preview"><b>'+e(car.plate)+'</b> '+e(car.name||'')+'<div class="small">'+extra+'</div>'+(kind==='service'?'<div class="small">DOT: ☀️ '+e(s?.dot||'—')+' · ❄️ '+e(w?.dot||'—')+'</div>':'')+'</div>';
  }).join('')||'<div class="small">Žádná aktivní vozidla.</div>';
}
function renderModuleShell(){
  if($('serviceVehicles'))renderVehiclePreviews('serviceVehicles','service');
  if($('maintenanceVehicles'))renderVehiclePreviews('maintenanceVehicles','maintenance');
  if($('settingsUser'))$('settingsUser').textContent=me?.name||'—';
  if($('settingsRole'))$('settingsRole').textContent=roleLabel(me?.role);if($('themeMode'))$('themeMode').value=themePreference();if($('themeCurrent'))$('themeCurrent').textContent=document.documentElement.dataset.theme==='dark'?'🌙 Tmavý':'☀️ Světlý';
  renderTrafficPrefs();
  if($('homeTrafficStatus'))$('homeTrafficStatus').textContent=trafficHomeText();
  document.querySelectorAll('[data-module="transport"]').forEach(x=>x.hidden=D.transport?.enabled===false&&me?.role!=='admin');
  if($('homeAdminCard'))$('homeAdminCard').hidden=me?.role!=='admin';
  document.querySelectorAll('[data-module="pneu"]').forEach(x=>x.hidden=!hasPneuAccess());
  const count=attentionIssues().length;
  if($('homeAttention')){$('homeAttention').hidden=!count;$('homeAttentionText').textContent=count?count+' položek v PNEU / DOT vyžaduje pozornost.':''}
}

function renderSystemBanner(){
  const b=$('systemBanner'),s=D.system||{mode:'normal',message:''};
  if(!b||s.mode==='normal'){if(b)b.hidden=true;return}
  b.hidden=false;b.classList.toggle('read-only',s.mode==='read_only');b.classList.toggle('maintenance',s.mode==='maintenance');
  if(s.mode==='read_only'){
    $('systemBannerTitle').textContent='🟠 READ ONLY — pouze prohlížení';
    $('systemBannerText').textContent=(s.message||'Probíhá systémová údržba. Data lze prohlížet, ale zápisy jsou dočasně pozastavené.')+(me?.role==='admin'?' Admin má stále plný přístup.':'');
  }else{
    $('systemBannerTitle').textContent='🔴 MAINTENANCE — technická údržba';
    $('systemBannerText').textContent=(s.message||'Aplikace je momentálně dočasně pozastavena administrátorem.')+(me?.role==='admin'?' Ostatní uživatelé se nemohou přihlásit.':'');
  }
}
const SYSTEM_MESSAGE_TEMPLATES={
  read_only:'Probíhá systémová údržba.\nData lze prohlížet, ale zápisy jsou dočasně pozastavené.',
  maintenance:'🔧 Probíhá technická údržba\nAplikace je momentálně dočasně pozastavena administrátorem.\nZkuste to prosím později.'
};
const NORMAL_RETURN_TEMPLATE='Jsme zpátky. Aplikace zpět v normálním provozu. Děkuji za trpělivost.';
function systemModeHelp(mode){
  if(mode==='read_only')return '<b>🟠 READ ONLY</b>Ostatní uživatelé mohou data prohlížet, ale server odmítne zápisy, úpravy a mazání.';
  if(mode==='maintenance')return '<b>🔴 MAINTENANCE</b>Do aplikace se dostane pouze Admin. Již přihlášení uživatelé budou při dalším spojení odhlášeni.';
  return '<b>🟢 NORMAL</b>Všichni uživatelé pracují podle svých rolí a oprávnění.';
}
function updateSystemModeEditor(resetNotify=false){
  if(!$('systemMode'))return;
  const selected=$('systemMode').value,current=D.system?.mode||'normal',toNormal=selected==='normal'&&current!=='normal';
  $('systemModeHelp').innerHTML=systemModeHelp(selected);
  $('systemRestrictionMessage').hidden=selected==='normal';
  $('normalNotifyBox').hidden=!toNormal;
  if(toNormal&&resetNotify){
    $('normalNotify').checked=true;
    $('normalNotifyMessage').value=NORMAL_RETURN_TEMPLATE;
  }
}
function renderSystemControls(){
  if(me?.role!=='admin'||!$('systemMode'))return;
  const s=D.system||{mode:'normal',customMessage:'',message:''};
  $('systemMode').value=s.mode||'normal';
  $('systemMessage').value=s.customMessage??'';
  $('normalNotify').checked=false;
  $('normalNotifyMessage').value=NORMAL_RETURN_TEMPLATE;
  updateSystemModeEditor(false);
  $('systemModeMeta').textContent=s.updatedAt?'Poslední změna: '+dt(s.updatedAt)+(s.updatedBy?' · '+s.updatedBy:''):'Režim zatím nebyl ručně měněn.';
}

function renderTransportAdmin(){
  if(me?.role!=='admin'||!$('adminTrafficCorridors'))return;
  const t=D.transportAdmin||{};
  const source=$('trafficAdminSource');
  source.classList.toggle('traffic-source-ok',!!t.sourceConfigured);
  source.classList.toggle('traffic-source-warn',!t.sourceConfigured);
  $('trafficAdminSourceText').textContent=t.sourceConfigured?'Golemio API je na serveru připojené. Dopravní události se načítají z NDIC přes Golemio.':'Golemio API klíč zatím není v prostředí Vercelu. Modul funguje, ale živá dopravní data se nezačnou načítat, dokud se klíč nepřidá.';
  $('transportEnabled').checked=t.enabled!==false;
  $('transportNotificationsEnabled').checked=t.notificationsEnabled!==false;
  $('transportCacheMinutes').value=String(t.cacheMinutes||3);
  $('transportPollMinutes').value=String(t.pollMinutes||5);
  $('adminTrafficCorridors').innerHTML=(t.corridors||[]).map(x=>
    '<div class="traffic-admin-row"><div class="top"><div><b>'+e(x.name)+'</b><div class="small">'+e(x.description||'')+'</div></div><span class="badge">'+(x.type==='area'?'Oblast':'Úsek')+'</span></div>'+
    '<div class="switchline"><input class="traffic-active" data-id="'+e(x.id)+'" type="checkbox" '+(x.active!==false?'checked':'')+'><span>Aktivní v reportu</span></div>'+
    '<div class="switchline"><input class="traffic-notify-allowed" data-id="'+e(x.id)+'" type="checkbox" '+(x.notifyAllowed!==false?'checked':'')+'><span>Povolit upozornění z tohoto úseku</span></div>'+
    '<div class="small">Rozpoznávání: '+e((x.matchTerms||[]).join(', '))+'</div>'+
    '<div class="toolbar" style="margin-top:8px"><button class="edit-traffic secondary" data-id="'+e(x.id)+'">Upravit</button><button class="delete-traffic danger-btn" data-id="'+e(x.id)+'">Odstranit</button></div></div>'
  ).join('')||'<div class="small">Žádné sledované úseky.</div>';
  document.querySelectorAll('.traffic-active').forEach(x=>x.onchange=async()=>{try{await api('adminUpdateTransportCorridor',{id:x.dataset.id,active:x.checked});await refresh()}catch(err){alert(errorText(err))}});
  document.querySelectorAll('.traffic-notify-allowed').forEach(x=>x.onchange=async()=>{try{await api('adminUpdateTransportCorridor',{id:x.dataset.id,notifyAllowed:x.checked});await refresh()}catch(err){alert(errorText(err))}});
  document.querySelectorAll('.edit-traffic').forEach(b=>b.onclick=async()=>{
    const x=(D.transportAdmin?.corridors||[]).find(v=>v.id===b.dataset.id);if(!x)return;
    const name=prompt('Název sledovaného úseku:',x.name);if(name===null)return;
    const description=prompt('Krátký popis:',x.description||'');if(description===null)return;
    const terms=prompt('Rozpoznávací názvy oddělené čárkou:',(x.matchTerms||[]).join(', '));if(terms===null)return;
    try{await api('adminUpdateTransportCorridor',{id:x.id,name,description,matchTerms:terms});await refresh()}catch(err){alert(errorText(err))}
  });
  document.querySelectorAll('.delete-traffic').forEach(b=>b.onclick=async()=>{const x=(D.transportAdmin?.corridors||[]).find(v=>v.id===b.dataset.id);if(!x)return;if(!confirm('Odstranit sledovaný úsek „'+x.name+'“?'))return;try{await api('adminDeleteTransportCorridor',{id:x.id});await refresh()}catch(err){alert(errorText(err))}});
}

// Admin dashboard
function presenceHtml(u){const s=u.presenceStatus||'offline',label=s==='online'?'Online':s==='standby'?'Standby':'Offline';return '<span class="presence presence-'+s+'"><span class="presence-dot"></span>'+label+'</span>'}
function attentionIssues(){return D.attentionIssues||D.dashboard?.issues||[]}
function issueCard(x){
  return '<div class="issue"><div><b>'+e(x.plate)+'</b> '+e(x.vehicle||'')+'</div><div class="small">'+e(x.text)+'</div>'+(can('attentionEdit')?'<div class="toolbar" style="margin-top:7px"><button class="issue-edit secondary" data-key="'+e(x.key)+'">Upravit</button></div>':'')+'</div>';
}
function bindIssueButtons(){document.querySelectorAll('.issue-edit').forEach(b=>b.onclick=()=>{const x=attentionIssues().find(i=>i.key===b.dataset.key);if(x)openIssueEditor(x)})}
function renderAttention(){
  const issues=attentionIssues();
  if($('adminIssues'))$('adminIssues').innerHTML=issues.slice(0,50).map(issueCard).join('')||'<div class="small">Žádné problémy. 🎉</div>';
  $('fleetAttentionCard').hidden=!can('attentionView');
  if(can('attentionView'))$('fleetIssues').innerHTML=issues.slice(0,50).map(issueCard).join('')||'<div class="small">Žádné problémy. 🎉</div>';
  bindIssueButtons();
}
function openIssueEditor(x){
  if(!can('attentionEdit'))return;
  const defaultSeason=x.type==='missing_summer'?'summer':x.type==='missing_winter'?'winter':(x.season||'summer');
  const seasonOptions='<option value="summer" '+(defaultSeason==='summer'?'selected':'')+'>☀️ Letní</option><option value="winter" '+(defaultSeason==='winter'?'selected':'')+'>❄️ Zimní</option>';
  $('issueEditOverlay').hidden=false;
  $('issueEditBox').innerHTML='<h2>⚠️ Upravit upozornění</h2><div class="sub"><b>'+e(x.plate)+'</b> · '+e(x.text)+'</div>'+
    '<div class="filter-label">Sada</div><select id="issueSeason">'+seasonOptions+'</select><div class="small" style="margin:5px 0 8px">Sadu můžeš změnit. Pokud zvolená oprava dané upozornění nevyřeší, upozornění v seznamu zůstane.</div>'+
    '<div class="filter-label">DOT</div><input id="issueDot" inputmode="numeric" maxlength="4" value="'+e(x.dot||'')+'" placeholder="např. 2426">'+
    '<div class="filter-label">Kilometry</div><input id="issueMileage" inputmode="numeric" maxlength="7" value="'+e(x.mileage??'')+'" placeholder="např. 128450">'+
    '<div class="notice-actions"><button id="issueCancel">Zrušit</button><button id="issueSave" class="primary">Uložit opravu</button></div><div id="issueMsg"></div>';
  $('issueCancel').onclick=()=>{$('issueEditOverlay').hidden=true};
  $('issueSave').onclick=async()=>{
    const season=$('issueSeason').value,dot=$('issueDot').value.replace(/\D/g,''),mileage=Number($('issueMileage').value.replace(/\D/g,''));
    if(!/^\d{4}$/.test(dot)||+dot.slice(0,2)<1||+dot.slice(0,2)>53)return note($('issueMsg'),'Zadej platný čtyřmístný DOT.','msg err');
    if(!Number.isInteger(mileage)||mileage<0)return note($('issueMsg'),'Zadej platný stav kilometrů.','msg err');
    $('issueSave').disabled=true;
    try{await api('attentionSave',{issueKey:x.key,issueType:x.type,carId:x.carId,recordId:x.recordId||null,season,dot,mileage});$('issueEditOverlay').hidden=true;await refresh()}
    catch(err){$('issueSave').disabled=false;note($('issueMsg'),err.code==='ISSUE_RESOLVED'?'Upozornění už mezitím není aktuální.':errorText(err),'msg err')}
  };
}
function renderAdminDashboard(){renderSystemControls();const d=D.dashboard||{};$('adminStats').innerHTML=[['Aktivní auta',d.activeCars||0],['Kompletní',d.complete||0],['Nekompletní',d.incomplete||0],['Záznamy',d.records||0],['Pokles km',d.anomalyCount||0],['Archivovaná',d.archivedCars||0]].map(([n,v])=>'<div class="stat"><b>'+e(v)+'</b><span class="small">'+e(n)+'</span></div>').join('');$('adminActivity').innerHTML=(D.users||[]).map(u=>'<div class="item"><div><b>'+e(u.name)+'</b> <span class="badge">'+e(roleLabel(u.role))+'</span> '+presenceHtml(u)+'</div><div class="small">Poslední aktivita: '+dt(u.lastActivityAt)+' · naposledy online: '+dt(u.lastOnlineAt)+' · záznamů: '+u.recordCount+' · push zařízení: '+u.pushDevices+'</div></div>').join('');renderAttention()}

// Admin cars
$('addCar').onclick=async()=>{const plate=$('newPlate').value.trim(),name=$('newName').value.trim();if(!plate)return;try{await api('adminAddCar',{plate,name});$('newPlate').value=$('newName').value='';await refresh()}catch(x){alert(errorText(x))}};
async function editCar(id){const c=(D.allCars||[]).find(x=>x.id===id);if(!c)return;const plate=prompt('SPZ:',c.plate);if(plate===null)return;const name=prompt('Název vozidla:',c.name||'');if(name===null)return;try{await api('adminUpdateCar',{carId:id,plate,name});await refresh()}catch(x){alert(errorText(x))}}
async function setCarActive(id,active){if(!confirm(active?'Obnovit toto auto z archivu?':'Archivovat toto auto? Historie zůstane zachována.'))return;await api('adminSetCarActive',{carId:id,active});await refresh()}
function carAdminRow(c,active){return '<div class="item checkrow"><input class="'+(active?'active-car-check':'arch-car-check')+'" type="checkbox" value="'+e(c.id)+'"><div><b>'+e(c.plate)+'</b> '+e(c.name||'')+'</div><div class="toolbar"><button class="car-detail secondary" data-id="'+e(c.id)+'">Detail</button><button class="edit-car secondary" data-id="'+e(c.id)+'">Upravit</button><button class="toggle-car '+(active?'danger-btn':'primary')+'" data-id="'+e(c.id)+'" data-active="'+(!active)+'">'+(active?'Archivovat':'Obnovit')+'</button></div></div>'}
function renderAdminCars(){const all=D.allCars||[],active=all.filter(c=>c.active!==false),arch=all.filter(c=>c.active===false);$('adminCars').innerHTML=active.map(c=>carAdminRow(c,true)).join('')||'<div class="small">Žádná aktivní auta.</div>';$('archivedCars').innerHTML=arch.map(c=>carAdminRow(c,false)).join('')||'<div class="small">Archiv je prázdný.</div>';document.querySelectorAll('.car-detail').forEach(b=>b.onclick=()=>openAdminVehicle(b.dataset.id));document.querySelectorAll('.edit-car').forEach(b=>b.onclick=()=>editCar(b.dataset.id));document.querySelectorAll('.toggle-car').forEach(b=>b.onclick=()=>setCarActive(b.dataset.id,b.dataset.active==='true'))}
$('selectAllActive').onclick=()=>document.querySelectorAll('.active-car-check').forEach(x=>x.checked=true);$('selectAllArchived').onclick=()=>document.querySelectorAll('.arch-car-check').forEach(x=>x.checked=true);
async function bulkCars(selector,active){const ids=[...document.querySelectorAll(selector+':checked')].map(x=>x.value);if(!ids.length)return alert('Nejdřív vyber auta.');if(!confirm((active?'Obnovit ':'Archivovat ')+ids.length+' aut?'))return;await api('adminBulkCars',{carIds:ids,active});await refresh()}
$('bulkArchive').onclick=()=>bulkCars('.active-car-check',false);$('bulkRestore').onclick=()=>bulkCars('.arch-car-check',true);

// Admin users
$('addUser').onclick=async()=>{const name=$('newUserName').value.trim(),pin=$('newUserPin').value.replace(/\D/g,'').slice(0,2),role=$('newUserRole').value;if(!name||pin.length!==2)return alert('Zadej jméno a dvoumístný PIN.');try{await api('adminAddUser',{name,pin,role});$('newUserName').value=$('newUserPin').value='';$('newUserRole').value='driver';await refresh()}catch(x){alert(errorText(x))}};
function renderAdminUsers(){
  $('users').innerHTML=(D.users||[]).map(u=>{
    const admin=u.role==='admin';
    const role=admin?'<span class="badge">Admin</span>':'<select class="ur" data-id="'+e(u.id)+'" style="max-width:160px"><option value="driver" '+(u.role==='driver'?'selected':'')+'>Driver</option><option value="dispatch" '+(u.role==='dispatch'?'selected':'')+'>Dispatch</option><option value="technician" '+(u.role==='technician'?'selected':'')+'>Technician</option></select>';
    const perms=admin?'<div class="small" style="margin:9px 0"><b>Plný systémový přístup.</b> Tato práva nelze vypnout.</div>':'<div class="perm-grid">'+PERMS.map(([k,l])=>'<label class="perm"><input class="uperm" data-id="'+e(u.id)+'" data-k="'+e(k)+'" type="checkbox" '+(u.permissions?.[k]?'checked':'')+'><span>'+e(l)+'</span></label>').join('')+'</div>';
    return '<div class="user"><div class="row mobile-stack"><input class="un" data-id="'+e(u.id)+'" value="'+e(u.name)+'"><input class="up" data-id="'+e(u.id)+'" inputmode="numeric" maxlength="2" placeholder="nový PIN" style="max-width:130px">'+role+'</div><div class="small" style="margin:6px 0">'+presenceHtml(u)+' · poslední aktivita '+dt(u.lastActivityAt)+' · naposledy online '+dt(u.lastOnlineAt)+' · záznamů '+u.recordCount+' · push zařízení '+u.pushDevices+' · '+(u.active?'aktivní':'zablokovaný')+'</div>'+perms+'<div class="toolbar"><button class="primary su" data-id="'+e(u.id)+'">Uložit</button><button class="genpin secondary" data-id="'+e(u.id)+'">🎲 Nový PIN</button>'+(!admin?'<button class="tu '+(u.active?'danger-btn':'primary')+'" data-id="'+e(u.id)+'" data-a="'+u.active+'">'+(u.active?'Zablokovat':'Aktivovat')+'</button>':'')+'</div></div>';
  }).join('');
  document.querySelectorAll('.su').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id,n=document.querySelector('.un[data-id="'+id+'"]').value,p=document.querySelector('.up[data-id="'+id+'"]').value,u=(D.users||[]).find(x=>x.id===id);
    if(p&&!/^\d{2}$/.test(p))return alert('PIN musí mít 2 číslice.');
    const role=u?.role==='admin'?'admin':document.querySelector('.ur[data-id="'+id+'"]').value;
    const permissions={};if(role!=='admin')document.querySelectorAll('.uperm[data-id="'+id+'"]').forEach(x=>permissions[x.dataset.k]=x.checked);
    try{await api('adminUpdateUser',{userId:id,name:n,pin:p,role,permissions});await refresh();alert('Uloženo.')}catch(x){alert(errorText(x))}
  });
  document.querySelectorAll('.genpin').forEach(b=>b.onclick=async()=>{if(!confirm('Vygenerovat nový PIN? Starý okamžitě přestane fungovat.'))return;try{const r=await api('adminGeneratePin',{userId:b.dataset.id});alert('NOVÝ PIN: '+r.pin+'\n\nUlož si ho nebo ho předej uživateli. Po zavření tohoto okna už ho aplikace znovu nezobrazí.');await refresh()}catch(x){alert(errorText(x))}});
  document.querySelectorAll('.tu').forEach(b=>b.onclick=async()=>{await api('adminUpdateUser',{userId:b.dataset.id,active:b.dataset.a!=='true'});await refresh()});
}

// Notifications admin
function renderNotificationAdmin(){
  const cur=$('notifyRecipient').value;$('notifyRecipient').innerHTML='<option value="all">Všichni aktivní uživatelé</option>'+(D.users||[]).filter(u=>u.active).map(u=>'<option value="'+e(u.id)+'">'+e(u.name)+'</option>').join('');if(cur==='all'||(D.users||[]).some(u=>u.id===cur))$('notifyRecipient').value=cur;
  const curCar=$('notifyVehicle').value;$('notifyVehicle').innerHTML='<option value="">Bez konkrétního vozidla</option>'+(D.allCars||[]).filter(c=>c.active!==false).map(c=>'<option value="'+e(c.id)+'">'+e(c.plate)+' — '+e(c.name||'')+'</option>').join('');if((D.allCars||[]).some(c=>c.id===curCar))$('notifyVehicle').value=curCar;
  const s=D.notificationSettings||{};$('autoIncomplete').checked=!!s.incompleteEnabled;$('autoIncompleteDays').value=String(s.incompleteRepeatDays||3);$('autoIncompleteRecipients').value=s.incompleteRecipients||'workers';$('autoSummer').checked=s.incompleteMissingSummer!==false;$('autoWinter').checked=s.incompleteMissingWinter!==false;$('autoAnomaly').checked=!!s.adminAnomalyEnabled;$('autoAdminDays').value=String(s.adminAnomalyRepeatDays||3);$('autoStale').checked=!!s.staleEnabled;$('autoStaleDays').value=String(s.staleDays||365);
  $('notificationLog').innerHTML=(D.notificationLog||[]).slice(0,80).map(n=>{
    const acks=(n.acks||[]).map(a=>'<div class="ack">✓ '+e(a.userName||a.userId)+' · '+(a.response==='view_vehicle'?'Zobrazil vozidlo':'Rozumím')+' · '+dt(a.at)+'</div>').join('');
    const recipients=(n.recipientUserIds||[]).length,pending=Math.max(0,recipients-(n.acks||[]).length);
    return '<div class="item"><b>'+e(n.title||n.type)+'</b>'+(n.carPlate?' <span class="badge">'+e(n.carPlate)+'</span>':'')+'<div class="small">'+e(n.body||'')+'</div><div class="small">'+dt(n.createdAt)+' · push '+(n.sent??0)+'/'+(n.devices??0)+(recipients?' · potvrzeno '+(n.acks||[]).length+'/'+recipients+' · čeká '+pending:'')+'</div>'+acks+'</div>';
  }).join('')||'<div class="small">Zatím žádná oznámení.</div>';
}
$('sendNotification').onclick=async()=>{const recipient=$('notifyRecipient').value,carId=$('notifyVehicle').value||null,title=$('notifyTitle').value.trim(),message=$('notifyMessage').value.trim();try{const r=await api('adminSendNotification',{recipient,carId,title,message});note($('notifyMsg'),'Odesláno na '+r.sent+' zařízení. Oznámení čeká na potvrzení v aplikaci.','msg ok');$('notifyTitle').value=$('notifyMessage').value='';$('notifyVehicle').value='';await refresh()}catch(x){note($('notifyMsg'),errorText(x),'msg err')}};
$('saveNotificationSettings').onclick=async()=>{const settings={incompleteEnabled:$('autoIncomplete').checked,incompleteRepeatDays:+$('autoIncompleteDays').value,incompleteRecipients:$('autoIncompleteRecipients').value,incompleteMissingSummer:$('autoSummer').checked,incompleteMissingWinter:$('autoWinter').checked,adminAnomalyEnabled:$('autoAnomaly').checked,adminAnomalyRepeatDays:+$('autoAdminDays').value,staleEnabled:$('autoStale').checked,staleDays:+$('autoStaleDays').value};try{await api('adminSaveNotificationSettings',{settings});alert('Pravidla oznámení jsou uložená.');await refresh()}catch(x){alert(errorText(x))}};

// Audit
function renderAudit(){const q=$('auditSearch').value.trim().toLocaleLowerCase('cs-CZ');const rows=(D.audit||[]).filter(a=>!q||(a.actorName+' '+a.action+' '+a.summary).toLocaleLowerCase('cs-CZ').includes(q));$('auditList').innerHTML=rows.slice(0,200).map(a=>'<div class="audit-line"><b>'+e(a.actorName)+'</b> · '+e(a.summary)+'<div class="small">'+dt(a.createdAt)+' · '+e(a.action)+'</div></div>').join('')||'<div class="small">Nic nenalezeno.</div>'}
$('auditSearch').oninput=renderAudit;

// Import & backup
function parseCsvLine(line,delimiter){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===delimiter&&!q){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out}
$('importCars').onclick=async()=>{const file=$('csvImport').files?.[0];if(!file)return note($('importMsg'),'Vyber CSV soubor.','msg err');const text=await file.text(),lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return;const delimiter=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';let rows=lines.map(l=>parseCsvLine(l,delimiter));if(rows[0]&&/spz|plate/i.test(rows[0][0]))rows.shift();const payload=rows.map(r=>({plate:r[0],name:r[1]||''})).filter(r=>r.plate);try{const result=await api('adminImportCars',{rows:payload});note($('importMsg'),'Přidáno '+result.added+' aut, přeskočeno '+result.skipped+'.','msg ok');$('csvImport').value='';await refresh()}catch(x){note($('importMsg'),errorText(x),'msg err')}};
$('backupJson').onclick=async()=>{try{const data=await api('adminBackup');downloadBlob(JSON.stringify(data,null,2),'application/json;charset=utf-8','DOT-Evidence-Backup-'+new Date().toISOString().slice(0,10)+'.json')}catch(x){alert(errorText(x))}};

function renderAdmin(){renderAdminDashboard();renderAdminCars();renderAdminUsers();renderNotificationAdmin();renderTransportAdmin();renderAudit()}
function allowedTab(id){return id==='entry'?can('dotCreate'):id==='fleet'?(can('fleetView')||can('attentionView')):id==='history'?can('historyView'):false}
function applyAccess(){
  $('who').textContent=me.name+' · '+roleLabel(me.role);
  document.querySelectorAll('.pneu-tabs button').forEach(b=>b.style.display=allowedTab(b.dataset.tab)?'':'none');
  $('pushCard').style.display='';
  $('fleetFiltersCard').style.display=can('fleetView')?'':'none';
  $('fleetListCard').style.display=can('fleetView')?'':'none';
  if($('saveTrafficPrefs'))$('saveTrafficPrefs').disabled=isReadOnly();
  if(currentModule==='admin'&&me.role!=='admin')openModule('home');
  if(currentModule==='pneu'&&!hasPneuAccess())openModule('home');
}
function render(){const sel=$('car').value;renderCarOptions(sel);valid();renderFleet();renderHist();if(me.role==='admin')renderAdmin();else renderAttention();renderModuleShell();if(currentModule==='transport')renderTrafficReport();applyAccess();renderSystemBanner();renderNoticeOverlay()}

function showTab(id,doRefresh=true){if(!allowedTab(id))return;document.querySelectorAll('#pneu .panel').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.pneu-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));if(doRefresh&&(id==='history'||id==='fleet'))refresh()}
if($('systemMode'))$('systemMode').onchange=()=>updateSystemModeEditor(true);
if($('useSystemTemplate'))$('useSystemTemplate').onclick=()=>{
  const mode=$('systemMode').value;
  if(SYSTEM_MESSAGE_TEMPLATES[mode])$('systemMessage').value=SYSTEM_MESSAGE_TEMPLATES[mode];
};
if($('useNormalTemplate'))$('useNormalTemplate').onclick=()=>{$('normalNotifyMessage').value=NORMAL_RETURN_TEMPLATE};
if($('saveSystemMode'))$('saveSystemMode').onclick=async()=>{
  const mode=$('systemMode').value,message=$('systemMessage').value.trim();
  const returningToNormal=mode==='normal'&&(D.system?.mode||'normal')!=='normal';
  const notifyOnNormal=returningToNormal&&$('normalNotify').checked;
  const normalNotifyMessage=$('normalNotifyMessage').value.trim();
  const label=mode==='normal'?'NORMAL':mode==='read_only'?'READ ONLY':'MAINTENANCE';
  if(notifyOnNormal&&!normalNotifyMessage)return note($('systemModeMsg'),'Doplň text oznámení pro návrat do NORMAL.','msg err');
  if(!confirm('Nastavit provozní režim '+label+'?'+(notifyOnNormal?'\nUživatelům se zároveň odešle oznámení.':'')))return;
  $('saveSystemMode').disabled=true;
  try{
    const r=await api('adminSetSystemMode',{mode,message,notifyOnNormal,normalNotifyMessage});
    let ok='Provozní režim byl uložen.';
    if(r.notification)ok+=' Oznámení: '+r.notification.sent+'/'+r.notification.devices+' zařízení.';
    note($('systemModeMsg'),ok,'msg ok');await refresh()
  }
  catch(x){note($('systemModeMsg'),errorText(x),'msg err')}
  finally{$('saveSystemMode').disabled=false}
};
if($('trafficRefresh'))$('trafficRefresh').onclick=()=>loadTrafficReport(true).catch(()=>{});
['trafficNotifyEnabled','trafficSeverity','trafficRepeatMode','trafficRepeatMinutes','trafficResolved'].forEach(id=>{if($(id))$(id).onchange=()=>{trafficPrefsDirty=true;if(id==='trafficRepeatMode')updateTrafficRepeatVisibility()}});
if($('saveTrafficPrefs'))$('saveTrafficPrefs').onclick=async()=>{
  const prefs={
    notificationsEnabled:$('trafficNotifyEnabled').checked,
    corridorIds:[...document.querySelectorAll('.traffic-pref-corridor:checked')].map(x=>x.value),
    severity:$('trafficSeverity').value,
    repeatMode:$('trafficRepeatMode').value,
    repeatMinutes:+$('trafficRepeatMinutes').value,
    resolved:$('trafficResolved').checked,
  };
  if(!prefs.corridorIds.length)return note($('trafficPrefsMsg'),'Vyber alespoň jeden sledovaný úsek.','msg err');
  try{const r=await api('saveTransportPrefs',{prefs});D.transport.prefs=r.prefs;trafficPrefsDirty=false;note($('trafficPrefsMsg'),'Nastavení Dopravního reportu je uložené.','msg ok');renderTrafficPrefs(true)}
  catch(x){note($('trafficPrefsMsg'),errorText(x),'msg err')}
};
if($('saveTransportSettings'))$('saveTransportSettings').onclick=async()=>{
  const settings={enabled:$('transportEnabled').checked,notificationsEnabled:$('transportNotificationsEnabled').checked,cacheMinutes:+$('transportCacheMinutes').value,pollMinutes:+$('transportPollMinutes').value};
  try{await api('adminSaveTransportSettings',{settings});note($('transportAdminMsg'),'Nastavení Dopravy je uložené.','msg ok');await refresh()}catch(x){note($('transportAdminMsg'),errorText(x),'msg err')}
};
if($('addTrafficCorridor'))$('addTrafficCorridor').onclick=async()=>{
  const name=$('newTrafficName').value.trim(),type=$('newTrafficType').value,matchTerms=$('newTrafficTerms').value.trim(),description=$('newTrafficDescription').value.trim();
  try{await api('adminAddTransportCorridor',{name,type,matchTerms,description});$('newTrafficName').value=$('newTrafficTerms').value=$('newTrafficDescription').value='';note($('newTrafficMsg'),'Sledovaný úsek byl přidán.','msg ok');await refresh()}catch(x){note($('newTrafficMsg'),errorText(x),'msg err')}
};
if($('themeMode'))$('themeMode').onchange=()=>setThemePreference($('themeMode').value);
document.querySelectorAll('.pneu-tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
document.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>openModule(b.dataset.module));
document.querySelectorAll('.back-home').forEach(b=>b.onclick=()=>openModule('home'));if($('homeAttention'))$('homeAttention').onclick=()=>{openModule('pneu');if(allowedTab('fleet'))showTab('fleet')};
document.querySelectorAll('.admin-nav-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-nav-btn').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.admin-pane').forEach(p=>p.classList.toggle('active',p.id==='admin-'+b.dataset.admin))});

function markActivity(){lastInteraction=Date.now()}
['pointerdown','keydown','touchstart','input','scroll'].forEach(ev=>document.addEventListener(ev,markActivity,{passive:true}));
async function heartbeat(){
  if(!tok)return;
  const visible=document.visibilityState==='visible',active=visible&&Date.now()-lastInteraction<120000;
  try{await api('heartbeat',{visible,active})}catch{}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')markActivity();heartbeat()});
window.addEventListener('pagehide',()=>{if(!tok)return;fetch('/api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({action:'heartbeat',visible:false,active:false}),keepalive:true}).catch(()=>{})});
setInterval(()=>{
  if(!tok||document.visibilityState!=='visible'||D.transport?.enabled===false)return;
  const mins=Math.max(3,Number(D.transport?.pollMinutes||5));
  if(Date.now()-lastTrafficLoad>=mins*60000)loadTrafficReport(false).catch(()=>{});
},60000);
setInterval(()=>{if(tok&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))refresh()},12000);
setInterval(heartbeat,45000);
applyTheme();if('serviceWorker'in navigator)ensureSW().catch(()=>{});
})();
