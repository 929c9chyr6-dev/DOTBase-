(()=>{
let tok='',me=null,D={cars:[],records:[]},season='',carSearch='',swReg=null,openVehicleDetail=null,lastInteraction=Date.now(),currentModule='home',settingsDevicesLoaded=false,trafficReport=null,trafficLoading=false,lastTrafficLoad=0,trafficPrefsDirty=false,tireTaskView='today',pendingTireTaskId=null,tireTaskDraftRows=[],tireTaskDraftSeq=0,editingCarId=null,notificationView='all',toastNotificationId=null,toastTimer=null;
const $=x=>document.getElementById(x), e=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const ROLE_LABELS={admin:'Admin',dispatch:'Dispatch',driver:'Driver',technician:'Technician'};
const MODULE_META={
  vehicleOverview:{label:'PŘEHLED VOZIDEL',icon:'🚗'},
  service:{label:'SERVIS',icon:'🔧'},
  pneu:{label:'PNEU / DOT',icon:'🛞'},
  tiretask:{label:'TIRETASK',icon:'📋'},
  transport:{label:'DOPRAVA',icon:'🚦'},
  maintenance:{label:'ÚDRŽBA',icon:'🧽'},
  notifications:{label:'OZNÁMENÍ',icon:'🔔'},
  settings:{label:'NASTAVENÍ',icon:'⚙️'},
};
const MODULE_KEYS=Object.keys(MODULE_META);
const PERMS=[['dotView','Vidět DOT údaje v přehledu aut'],['dotCreate','Zapisovat DOT'],['dotEdit','Upravovat DOT záznamy'],['dotDelete','Mazat DOT záznamy'],['fleetView','Vidět přehled aut'],['fleetExport','Exportovat přehled aut'],['historyView','Vidět historii'],['historyExport','Exportovat historii'],['vehicleDetail','Vidět detail vozidla (bez auditu)'],['vehicleAdd','Přidat vozidlo'],['vehicleCategoryAdd','Přidat skupinu vozidel'],['attentionView','Vidět upozornění Vyžaduje pozornost'],['attentionEdit','Upravovat z Vyžaduje pozornost'],['tireTaskCreate','Vytvořit task'],['tireTaskEdit','Editovat task'],['notificationsReceive','Přijímat oznámení'],['notificationsSendOperational','Odesílat provozní oznámení']];
const WRITE_PERMS=new Set(['dotCreate','dotEdit','dotDelete','vehicleAdd','vehicleCategoryAdd','attentionEdit','tireTaskCreate','tireTaskEdit','notificationsSendOperational']);
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
  if(!r.ok){const x=new Error(j.error);x.code=j.error;x.data=j;if(j.error==='MAINTENANCE'&&tok)setTimeout(()=>lockApp(j.message||'🔧 Probíhá technická údržba\nAplikace je dočasně pozastavena administrátorem.\nZkuste to prosím později.','msg warn'),0);if(j.error==='MODULE_OFFLINE'&&tok)setTimeout(()=>showModuleBlocked(j.module,j.message),0);throw x}return j;
}
function note(el,t,c='msg'){el.innerHTML='<div class="'+c+'">'+e(t)+'</div>'}
function dt(x){return x?new Intl.DateTimeFormat('cs-CZ',{dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—'}
function csvCell(v){return '"'+String(v??'').replaceAll('"','""')+'"'}
function downloadBlob(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function errorText(x){if(x?.data?.message)return x.data.message;return({DUPLICATE:'SPZ už existuje.',PIN_USED:'PIN už používá někdo jiný.',PIN:'PIN musí mít 2 číslice.',DOT:'Neplatný DOT.',MILEAGE:'Neplatný stav kilometrů.',CAR:'Auto nebylo nalezeno.',USER:'Uživatel nebyl nalezen.',MESSAGE:'Doplň nadpis i text oznámení.',VEHICLE_CATEGORY:'Vyber platnou kategorii vozidla.',VEHICLE_CATEGORY_DUPLICATE:'Tato kategorie už existuje.',READ_ONLY:'Aplikace je momentálně pouze pro čtení.',MAINTENANCE:'Probíhá technická údržba.',SYSTEM_MODE:'Neplatný provozní režim.',TRAFFIC_TERMS:'Doplň alespoň jeden rozpoznávací název.',TRAFFIC_CORRIDOR:'Sledovaný úsek nebyl nalezen.',MODULE_OFFLINE:'Modul je dočasně offline.',TRAFFIC_DISABLED:'Dopravní report je momentálně vypnutý.',TRAFFIC_PREFS_HIDDEN:'Nastavení Dopravního reportu je administrátorem skryté.',TIRETASK:'Úkol TIRETASK nebyl nalezen.',TIRETASK_DATE:'Zadej platné datum.',TIRETASK_TIME:'Zadej platný čas.',TIRETASK_STATUS:'Neplatný stav úkolu.',TIRETASK_CLOSED:'Uzavřený úkol už nelze měnit.',TIRETASK_NOT_COMPLETED:'Úkol lze uzavřít až po dokončení PNEU/DOT zápisu.',TIRETASK_COMPLETED:'Hotový úkol už lze pouze okomentovat nebo uzavřít.'})[x.code]||'Operace se nepodařila.'}

function lockApp(message='',cls='msg'){
  tok='';me=null;D={cars:[],records:[]};openVehicleDetail=null;currentModule='home';settingsDevicesLoaded=false;trafficReport=null;trafficLoading=false;lastTrafficLoad=0;trafficPrefsDirty=false;notificationView='all';toastNotificationId=null;if(toastTimer)clearTimeout(toastTimer);toastTimer=null;
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
    else if(['vehicleOverview','service','pneu','tiretask','transport','maintenance','notifications','settings','admin'].includes(mod))openModule(mod);
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
function dotLabel(r){return r?.dotFront&&r?.dotRear?'PŘ '+r.dotFront+' / Z '+r.dotRear:(r?.dot||'—')}
function validDot(v){return /^\d{4}$/.test(v)&&+v.slice(0,2)>=1&&+v.slice(0,2)<=53}
function prefillMileage(id){
  const l=latest(id);
  $('km').value=l?String(l.mileage):'';
  valid();
}
function valid(){
  const d=$('dot').value.replace(/\D/g,'').slice(0,4),f=$('dotFront').value.replace(/\D/g,'').slice(0,4),r=$('dotRear').value.replace(/\D/g,'').slice(0,4),k=$('km').value.replace(/\D/g,'').slice(0,7);
  $('dot').value=d;$('dotFront').value=f;$('dotRear').value=r;$('km').value=k;
  const split=$('splitDot').checked,dotOk=split?(validDot(f)&&validDot(r)):validDot(d);
  $('save').disabled=!can('dotCreate')||!($('car').value&&season&&dotOk&&k!=='');
  const l=latest($('car').value);$('kmHint').textContent=l?'Předvyplněno z posledního záznamu: '+Number(l.mileage).toLocaleString('cs-CZ')+' km — potvrď nebo uprav.':'Zatím bez předchozího záznamu. Zadej aktuální stav tachometru.';
}
$('dot').oninput=valid;$('dotFront').oninput=valid;$('dotRear').oninput=valid;$('km').oninput=valid;
$('splitDot').onchange=()=>{
  const split=$('splitDot').checked;
  $('singleDotEntry').hidden=split;$('splitDotEntry').hidden=!split;
  if(split&&validDot($('dot').value)){if(!$('dotFront').value)$('dotFront').value=$('dot').value;if(!$('dotRear').value)$('dotRear').value=$('dot').value}
  if(!split&&validDot($('dotFront').value)&&$('dotFront').value===$('dotRear').value)$('dot').value=$('dotFront').value;
  valid();
};
function recentKey(){return 'dotRecentCars:'+(me?.id||'guest')}
function getRecent(){try{return JSON.parse(localStorage.getItem(recentKey())||'[]').filter(id=>D.cars.some(c=>c.id===id)).slice(0,4)}catch{return []}}
function renderRecent(){const ids=getRecent(),sel=$('car').value;$('recentCars').innerHTML=ids.length?ids.map(id=>{const c=D.cars.find(x=>x.id===id);return c?'<button class="recent-car '+(sel===id?'active':'')+'" data-id="'+e(c.id)+'"><b>'+e(c.plate)+'</b><br><span style="font-size:12px;font-weight:600">'+e(c.name||'')+'</span></button>':''}).join(''):'<div class="small">Zatím žádná.</div>';document.querySelectorAll('.recent-car').forEach(b=>b.onclick=()=>chooseCar(b.dataset.id))}
function rememberCar(id){if(!id)return;try{localStorage.setItem(recentKey(),JSON.stringify([id,...getRecent().filter(x=>x!==id)].slice(0,4)))}catch{}renderRecent()}
function renderCarOptions(sel=$('car').value){
  const categorySelect=$('carCategory'),selectedCategory=String(categorySelect?.value||'');
  if(categorySelect){
    categorySelect.innerHTML='<option value="">Všechny skupiny</option>'+(D.vehicleCategories||[]).map(x=>'<option value="'+e(x)+'">'+e(x)+'</option>').join('');
    if(selectedCategory&&(D.vehicleCategories||[]).includes(selectedCategory))categorySelect.value=selectedCategory;
  }
  const category=String(categorySelect?.value||''),q=carSearch.trim().toLocaleUpperCase('cs-CZ');
  let cars=D.cars.filter(c=>(!category||c.category===category)&&(!q||(c.plate+' '+c.name+' '+(c.vin||'')+' '+(c.category||'')).toLocaleUpperCase('cs-CZ').includes(q)));
  const cur=D.cars.find(c=>c.id===sel);
  if(cur&&(!category||cur.category===category)&&!cars.some(c=>c.id===cur.id))cars=[cur,...cars];
  $('car').innerHTML='<option value="">'+(cars.length?'Vyber auto…':'Žádné auto nenalezeno')+'</option>'+cars.map(c=>'<option value="'+e(c.id)+'">'+e(c.plate)+' — '+e(c.name)+(c.category?' · '+e(c.category):'')+'</option>').join('');
  if(cur&&(!category||cur.category===category))$('car').value=sel;
  if($('carFilterCount'))$('carFilterCount').textContent=(q||category)?cars.length+' vozidel'+(category?' · '+category:''):'';
  renderRecent();
}
function chooseCar(id){const c=D.cars.find(x=>x.id===id);if(!c)return;carSearch='';$('carSearch').value='';if($('carCategory'))$('carCategory').value='';renderCarOptions(id);$('car').value=id;rememberCar(id);prefillMileage(id)}
$('carSearch').oninput=()=>{carSearch=$('carSearch').value;renderCarOptions($('car').value)};
if($('carCategory'))$('carCategory').onchange=()=>{$('car').value='';prefillMileage('');renderCarOptions('')};
$('car').onchange=()=>{rememberCar($('car').value);prefillMileage($('car').value);renderRecent()};
function setSeason(s){season=s;$('summer').classList.toggle('on',s==='summer');$('winter').classList.toggle('on',s==='winter');valid()}
$('summer').onclick=()=>setSeason('summer');$('winter').onclick=()=>setSeason('winter');
['1','2','3','4','5','6','7','8','9','C','0','⌫'].forEach(k=>{const b=document.createElement('button');b.textContent=k;b.onclick=()=>{if(k==='C')$('dot').value='';else if(k==='⌫')$('dot').value=$('dot').value.slice(0,-1);else if($('dot').value.length<4)$('dot').value+=k;valid()};$('pad').append(b)});
$('save').onclick=async()=>{
  if($('save').disabled)return;const id=$('car').value,km=+$('km').value,l=latest(id);
  if(l&&km<l.mileage&&!confirm('Stav km je nižší než poslední evidovaný. Opravdu uložit?'))return;
  try{
    const splitDot=$('splitDot').checked;
    const r=await api('addRecord',{carId:id,season,dot:splitDot?'':$('dot').value,splitDot,dotFront:splitDot?$('dotFront').value:'',dotRear:splitDot?$('dotRear').value:'',mileage:km,tireTaskId:pendingTireTaskId||null});
    pendingTireTaskId=null;$('dot').value='';$('dotFront').value='';$('dotRear').value='';$('splitDot').checked=false;$('singleDotEntry').hidden=false;$('splitDotEntry').hidden=true;$('km').value='';season='';$('summer').classList.remove('on');$('winter').classList.remove('on');
    note($('saveMsg'),r.tireTaskCompleted?'✅ Uloženo. Navázaný TIRETASK je HOTOVO.':'✅ Uloženo a sdíleno online.','msg ok');
    await refresh();setTimeout(()=>$('saveMsg').innerHTML='',2200)
  }catch(x){note($('saveMsg'),errorText(x),'msg err')}
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

// Notifications
function notificationUiMeta(n){
  const channel=n?.channel||'automatic',severity=n?.severity||'info';
  if(channel==='admin'&&severity==='critical')return {icon:'🚨',label:'KRITICKÉ SYSTÉMOVÉ',cls:'critical'};
  if(channel==='admin'&&severity==='important')return {icon:'⚠️',label:'DŮLEŽITÉ · ADMIN',cls:'important'};
  if(channel==='admin')return {icon:'🛡️',label:'ADMIN',cls:'admin-info'};
  if(channel==='operational'&&severity==='important')return {icon:'⚠️',label:'DŮLEŽITÉ · PROVOZNÍ',cls:'important'};
  if(channel==='operational')return {icon:'🔔',label:'PROVOZNÍ',cls:'operational'};
  return {icon:'ℹ️',label:'AUTOMATICKÉ',cls:'automatic'};
}
function notificationRecipientOptions(selected=''){
  return '<option value="all">Všichni aktivní uživatelé</option>'+(D.notificationRecipients||[]).map(u=>'<option value="'+e(u.id)+'" '+(selected===u.id?'selected':'')+'>'+e(u.name)+' · '+e(roleLabel(u.role))+'</option>').join('');
}
function notificationExpiresText(n){return n?.expiresAt?' · platí do '+dt(n.expiresAt):''}
function renderNotificationSettings(){
  if(!$('notificationPrefsCard'))return;
  const p=D.notificationPrefs||{};
  $('prefOperationalNotifications').checked=p.operational!==false;
  $('prefAdminInfoNotifications').checked=p.adminInfo!==false;
}
function renderNotifications(){
  if(!$('notificationList'))return;
  const canSend=can('notificationsSendOperational');
  $('operationalComposer').hidden=!canSend;
  $('adminComposer').hidden=me?.role!=='admin';
  if(canSend){
    const cur=$('operationalRecipient').value;$('operationalRecipient').innerHTML=notificationRecipientOptions(cur);if(cur==='all'||(D.notificationRecipients||[]).some(u=>u.id===cur))$('operationalRecipient').value=cur;
  }
  if(me?.role==='admin'){
    const cur=$('adminNoticeRecipient').value;$('adminNoticeRecipient').innerHTML=notificationRecipientOptions(cur);if(cur==='all'||(D.notificationRecipients||[]).some(u=>u.id===cur))$('adminNoticeRecipient').value=cur;
    const car=$('adminNoticeVehicle').value;$('adminNoticeVehicle').innerHTML='<option value="">Bez konkrétního vozidla</option>'+(D.allCars||D.cars||[]).filter(c=>c.active!==false).map(c=>'<option value="'+e(c.id)+'">'+e(c.plate)+' — '+e(c.name||'')+'</option>').join('');if((D.allCars||D.cars||[]).some(c=>c.id===car))$('adminNoticeVehicle').value=car;
  }
  document.querySelectorAll('[data-notification-view]').forEach(b=>b.classList.toggle('active',b.dataset.notificationView===notificationView));
  let rows=(D.notificationInbox||[]).slice();
  if(notificationView==='operational')rows=rows.filter(n=>n.channel==='operational');
  if(notificationView==='admin')rows=rows.filter(n=>n.channel==='admin');
  $('notificationList').innerHTML=rows.map(n=>{
    const m=notificationUiMeta(n),pending=n.requiresAck&&!n.acknowledgedAt&&!n.expired;
    return '<div class="notification-card '+m.cls+' '+(!n.read?'unread':'')+'">'+
      '<div class="notification-head"><div><span class="notification-kind">'+m.icon+' '+m.label+'</span><h3>'+e(n.title||'Oznámení')+'</h3></div>'+(!n.read&&!n.expired?'<span class="notification-unread-dot"></span>':'')+'</div>'+
      '<div class="notification-body">'+e(n.body||'')+'</div>'+
      '<div class="notification-meta">'+dt(n.createdAt)+(n.byUserName?' · '+e(n.byUserName):'')+(n.carPlate?' · '+e(n.carPlate):'')+notificationExpiresText(n)+(n.expired?' · UKONČENO':'')+'</div>'+
      (pending?'<div class="toolbar" style="margin-top:10px"><button class="notification-ack primary" data-id="'+e(n.id)+'">✅ Rozumím</button>'+(n.carId?'<button class="notification-vehicle secondary" data-id="'+e(n.id)+'">🚗 Vozidlo</button>':'')+'</div>':n.acknowledgedAt?'<div class="notification-confirmed">✓ Potvrzeno '+dt(n.acknowledgedAt)+'</div>':'')+
      '</div>';
  }).join('')||'<div class="card"><div class="small">V této části zatím nejsou žádná oznámení.</div></div>';
  document.querySelectorAll('.notification-ack').forEach(b=>b.onclick=()=>{const n=(D.notificationInbox||[]).find(x=>x.id===b.dataset.id);if(n)respondNotification(n,'understood')});
  document.querySelectorAll('.notification-vehicle').forEach(b=>b.onclick=()=>{const n=(D.notificationInbox||[]).find(x=>x.id===b.dataset.id);if(n)respondNotification(n,'view_vehicle')});
}
function renderNotificationToast(){
  const box=$('notificationToast'),n=(D.toastNotifications||[])[0];
  if(!box)return;
  if(!n){box.hidden=true;toastNotificationId=null;return}
  if(toastNotificationId===n.id)return;
  toastNotificationId=n.id;const m=notificationUiMeta(n);
  box.className='notification-toast '+m.cls;
  box.innerHTML='<button id="notificationToastClose" class="notification-toast-close" aria-label="Zavřít">×</button><div class="notification-kind">'+m.icon+' '+m.label+'</div><b>'+e(n.title||'Oznámení')+'</b><div>'+e(n.body||'')+'</div><div class="small">'+dt(n.createdAt)+'</div>';
  box.hidden=false;
  api('notificationSeen',{notificationId:n.id}).catch(()=>{});
  const close=()=>{if(toastTimer)clearTimeout(toastTimer);toastTimer=null;box.hidden=true;toastNotificationId=null;refresh()};
  $('notificationToastClose').onclick=close;
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(close,8000);
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
  const records=(v.records||[]).map(r=>'<div class="item"><b>'+(r.season==='summer'?'☀️ Letní':'❄️ Zimní')+' · DOT '+e(dotLabel(r))+'</b><div class="small">'+Number(r.mileage).toLocaleString('cs-CZ')+' km · '+e(r.userName)+' · '+dt(r.createdAt)+'</div></div>').join('')||'<div class="small">Žádné evidenční záznamy.</div>';
  const timeline=(v.timeline||[]).map(a=>'<div class="item"><b>'+e(a.actorName)+'</b> · '+e(a.summary)+'<div class="small">'+dt(a.createdAt)+'</div></div>').join('')||'<div class="small">Žádné změny.</div>';
  return '<h2>🚗 '+e(v.car.plate)+' · '+e(v.car.name||'')+'</h2>'+
    '<div class="vehicle-head"><div><b>Stav:</b> '+(v.car.active===false?'Archivované':'Aktivní')+'</div>'+
    '<div><b>Kategorie:</b> '+e(v.car.category||'Bez kategorie')+'</div>'+
    '<div><b>Poslední km:</b> '+(last?Number(last.mileage).toLocaleString('cs-CZ')+' km':'bez záznamu')+'</div>'+
    '<div><b>Letní DOT:</b> '+(summer?e(dotLabel(summer))+' · '+dt(summer.createdAt):'chybí')+'</div>'+
    '<div><b>Zimní DOT:</b> '+(winter?e(dotLabel(winter))+' · '+dt(winter.createdAt):'chybí')+'</div></div>'+
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
  ov.hidden=false;const m=notificationUiMeta(n);
  box.className='modal-card notification-modal '+m.cls;
  box.innerHTML='<div class="notification-kind">'+m.icon+' '+m.label+'</div><h2>'+e(n.title)+'</h2><div class="sub">'+dt(n.createdAt)+(n.byUserName?' · '+e(n.byUserName):'')+(n.carPlate?' · '+e(n.carPlate):'')+notificationExpiresText(n)+'</div>'+
    '<div class="notice">'+e(n.body)+'</div>'+
    '<div class="small" style="margin-top:8px"><b>Vyžaduje potvrzení.</b> Oznámení zůstane otevřené, dokud nepotvrdíš jednu z možností.</div>'+
    '<div class="notice-actions"><button id="noticeOk" class="primary">✅ Rozumím</button>'+
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
function renderFleet(){renderFleetUsers();const cars=filteredFleetCars();let done=0,part=0,h='';for(const c of cars){const s=latest(c.id,'summer'),w=latest(c.id,'winter'),l=latest(c.id);if(s&&w)done++;else if(s||w)part++;h+='<div class="item"><b>'+e(c.plate)+'</b> '+e(c.name)+'<div class="small">'+(l?Number(l.mileage).toLocaleString('cs-CZ')+' km':'bez km')+'</div><span class="chip '+(s?'good':'')+'">☀️ '+(s?e(dotLabel(s)):'chybí')+'</span><span class="chip '+(w?'good':'')+'">❄️ '+(w?e(dotLabel(w)):'chybí')+'</span>'+(can('vehicleDetail')?'<div class="toolbar" style="margin-top:7px"><button class="fleet-detail secondary" data-id="'+e(c.id)+'">Detail vozidla</button></div>':'')+'</div>'}$('fleetList').innerHTML=h||'<div class="small">Filtru neodpovídá žádné auto.</div>';$('stats').textContent='Celkem '+cars.length+' · Hotovo '+done+' · Rozpracováno '+part;$('fleetCount').textContent='Zobrazeno '+cars.length+' z '+D.cars.length+' aut';$('fleetExportCsv').disabled=cars.length===0||!can('fleetExport');$('fleetExportCsv').style.display=can('fleetExport')?'':'none';document.querySelectorAll('.fleet-detail').forEach(b=>b.onclick=()=>openVehicle(b.dataset.id))}
['fleetSearch','fleetFrom','fleetTo'].forEach(id=>$(id).oninput=renderFleet);['fleetSeason','fleetUser'].forEach(id=>$(id).onchange=renderFleet);
$('clearFleetFilters').onclick=()=>{$('fleetSearch').value='';$('fleetSeason').value='';$('fleetUser').value='';$('fleetFrom').value='';$('fleetTo').value='';renderFleet()};$('fleetRefresh').onclick=refresh;
$('fleetExportCsv').onclick=()=>{const cars=filteredFleetCars();if(!cars.length)return alert('Filtru neodpovídá žádné auto.');const rows=[['SPZ','Vozidlo','Letní DOT','Zimní DOT','Kilometry'],...cars.map(c=>{const s=latest(c.id,'summer'),w=latest(c.id,'winter'),l=latest(c.id);return[c.plate,c.name,s?dotLabel(s):'',w?dotLabel(w):'',l?l.mileage:'']})];downloadBlob('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8;','DOT-Auta-'+new Date().toISOString().slice(0,10)+'.csv')};

// History filters/edit/export
function renderHistoryUsers(){const current=$('histUser').value,users=new Map();D.records.forEach(r=>users.set(r.userId,r.userName));$('histUser').innerHTML='<option value="">Všichni uživatelé</option>'+[...users.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'cs')).map(([id,name])=>'<option value="'+e(id)+'">'+e(name)+'</option>').join('');if([...users.keys()].includes(current))$('histUser').value=current}
function filteredRecords(){const q=$('histSearch').value.trim().toLocaleUpperCase('cs-CZ'),s=$('histSeason').value,u=$('histUser').value,from=$('histFrom').value?new Date($('histFrom').value+'T00:00:00').getTime():-Infinity,to=$('histTo').value?new Date($('histTo').value+'T23:59:59.999').getTime():Infinity;return D.records.filter(r=>{const ts=new Date(r.createdAt).getTime(),hay=(String(r.plate||'')+' '+String(r.vehicle||'')).toLocaleUpperCase('cs-CZ');return(!q||hay.includes(q))&&(!s||r.season===s)&&(!u||r.userId===u)&&ts>=from&&ts<=to})}
async function editRecord(path){
  const r=D.records.find(x=>x.path===path);if(!r)return;
  const plate=prompt('SPZ vozidla:',r.plate);if(plate===null)return;const car=(D.allCars||D.cars).find(c=>c.plate.toUpperCase()===plate.trim().replace(/\s+/g,'').toUpperCase());if(!car)return alert('Auto s touto SPZ nebylo nalezeno.');
  const sx=prompt('Sada: L = letní, Z = zimní',r.season==='summer'?'L':'Z');if(sx===null)return;const ns=/^z/i.test(sx)?'winter':/^l/i.test(sx)?'summer':null;if(!ns)return alert('Zadej L nebo Z.');
  const payload={path:r.path,carId:car.id,season:ns};
  if(r.dotFront&&r.dotRear){
    const front=prompt('Přední DOT (4 číslice):',r.dotFront);if(front===null)return;
    const rear=prompt('Zadní DOT (4 číslice):',r.dotRear);if(rear===null)return;
    payload.splitDot=true;payload.dotFront=String(front).replace(/\D/g,'');payload.dotRear=String(rear).replace(/\D/g,'');
  }else{
    const dot=prompt('DOT (4 číslice):',r.dot);if(dot===null)return;payload.splitDot=false;payload.dot=String(dot).replace(/\D/g,'');
  }
  const km=prompt('Kilometry:',String(r.mileage));if(km===null)return;payload.mileage=Number(String(km).replace(/\D/g,''));
  try{await api('editRecord',payload);await refresh()}catch(x){alert(errorText(x))}
}
function renderHist(){renderHistoryUsers();const recs=filteredRecords(),shown=recs.slice(0,300);$('histCount').textContent='Zobrazeno '+recs.length+' z '+D.records.length+' záznamů'+(recs.length>300?' · na obrazovce prvních 300':'');$('exportCsv').disabled=recs.length===0||!can('historyExport');$('exportCsv').style.display=can('historyExport')?'':'none';$('histList').innerHTML=shown.map(r=>'<div class="item"><b>'+e(r.plate)+'</b> · '+(r.season==='summer'?'☀️ Letní':'❄️ Zimní')+' · DOT <b>'+e(dotLabel(r))+'</b><div class="small">'+Number(r.mileage).toLocaleString('cs-CZ')+' km · '+e(r.userName)+' · '+dt(r.createdAt)+'</div>'+((can('dotEdit')||can('dotDelete'))?'<div class="toolbar" style="margin-top:6px">'+(can('dotEdit')?'<button class="edit-record secondary" data-p="'+e(r.path)+'">Upravit</button>':'')+(can('dotDelete')?'<button class="danger-btn del" data-p="'+e(r.path)+'">Smazat</button>':'')+'</div>':'')+'</div>').join('')||'<div class="small">Filtru neodpovídá žádný záznam.</div>';if(can('dotEdit'))document.querySelectorAll('.edit-record').forEach(b=>b.onclick=()=>editRecord(b.dataset.p));if(can('dotDelete'))document.querySelectorAll('.del').forEach(b=>b.onclick=async()=>{if(confirm('Smazat tento záznam? Tato akce se zapíše do auditu.')){await api('deleteRecord',{path:b.dataset.p});refresh()}})}
$('refresh').onclick=refresh;['histSearch','histFrom','histTo'].forEach(id=>$(id).oninput=renderHist);['histSeason','histUser'].forEach(id=>$(id).onchange=renderHist);$('clearFilters').onclick=()=>{$('histSearch').value='';$('histSeason').value='';$('histUser').value='';$('histFrom').value='';$('histTo').value='';renderHist()};
$('exportCsv').onclick=()=>{const recs=filteredRecords();if(!recs.length)return alert('Filtru neodpovídá žádný záznam.');const rows=[['SPZ','Vozidlo','Sada','DOT','Kilometry','Uživatel','Datum a čas'],...recs.map(r=>[r.plate,r.vehicle,r.season==='summer'?'Letní':'Zimní',dotLabel(r),r.mileage,r.userName,dt(r.createdAt)])];downloadBlob('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8;','DOT-Evidence-'+new Date().toISOString().slice(0,10)+'.csv')};

// Modular shell
function moduleCfg(id){
  const source=me?.role==='admin'?(D.modulesAdmin||D.modules||{}):(D.modules||{});
  return source?.[id]||{visible:true,online:true,offlineMessage:'Modul je dočasně mimo provoz.'};
}
function showModuleBlocked(id,message){
  if(!me)return;
  currentModule='home';
  document.querySelectorAll('.module-screen').forEach(x=>x.classList.toggle('active',x.id==='home'));
  const meta=MODULE_META[id]||{label:'Modul',icon:'🔴'};
  if($('moduleBlocked')){
    $('moduleBlocked').hidden=false;
    $('moduleBlockedTitle').textContent='🔴 '+meta.label+' je offline';
    $('moduleBlockedText').textContent=message||moduleCfg(id).offlineMessage||'Modul je dočasně mimo provoz.';
    $('moduleBlocked').scrollIntoView?.({behavior:'smooth',block:'nearest'});
  }
}
function renderMainModuleCards(){
  MODULE_KEYS.forEach(id=>{
    document.querySelectorAll('[data-module="'+id+'"]').forEach(card=>{
      const cfg=moduleCfg(id);
      if(me?.role!=='admin')card.hidden=cfg.visible===false;
      else card.hidden=false;
      card.classList.toggle('module-offline',cfg.online===false);
      card.title=cfg.online===false?(cfg.offlineMessage||'Modul je dočasně mimo provoz.'):'';
    });
  });
  if($('homeAdminCard'))$('homeAdminCard').hidden=me?.role!=='admin';
}
function hasPneuAccess(){return ['dotCreate','fleetView','historyView','attentionView'].some(can)}
function openModule(id){
  if(id==='admin'&&me?.role!=='admin')return;
  if(id==='pneu'&&!hasPneuAccess())return;
  if(MODULE_KEYS.includes(id)&&me?.role!=='admin'&&moduleCfg(id).online===false)return showModuleBlocked(id,moduleCfg(id).offlineMessage);
  currentModule=id||'home';
  if($('moduleBlocked'))$('moduleBlocked').hidden=true;
  document.querySelectorAll('.module-screen').forEach(x=>x.classList.toggle('active',x.id===currentModule));
  if(currentModule==='pneu'){
    const active=document.querySelector('#pneu .panel.active')?.id;
    if(!active||!allowedTab(active)){const first=['entry','fleet','history'].find(allowedTab);if(first)showTab(first,false)}
  }
  if(currentModule==='admin'&&me?.role==='admin')refresh();
  if(currentModule==='vehicleOverview'||currentModule==='service'||currentModule==='maintenance'||currentModule==='settings')renderModuleShell();
  if(currentModule==='tiretask')renderTireTask();
  if(currentModule==='notifications')renderNotifications();
  if(currentModule==='transport'){renderTrafficReport();loadTrafficReport(false).catch(()=>{})}
  if(currentModule==='settings'){updatePushStatus();loadMyPushDevices();renderNotificationSettings()}
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
  if(trafficReport.error==='SOURCE_FORBIDDEN')return '⚪ Dopravní zdroj vyžaduje další oprávnění';
  if(trafficReport.error)return '⚪ Dopravní data nejsou dostupná';
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
  $('trafficSourceText').textContent=!r.sourceConfigured
    ?'Report a sledované úseky jsou připravené. Pro živá data chybí na serveru Golemio API klíč.'
    :r.error==='SOURCE_FORBIDDEN'
      ?'Golemio API klíč je připojený a platný, ale tento účet nemá oprávnění k dopravnímu zdroji Traffic Restrictions / FCD.'
      :r.error==='SOURCE_UNAUTHORIZED'
        ?'Golemio API klíč nebyl dopravním zdrojem přijat.'
        :r.error
          ?(r.stale?'Zdroj je dočasně nedostupný; zobrazuji poslední uložená data.':'Zdroj je dočasně nedostupný.')
          :'Aktuální dopravní omezení z NDIC přes server Golemio.';
  $('trafficCorridors').innerHTML=(r.corridors||[]).map(x=>{
    const m=trafficStatusMeta(x.status);
    return '<div class="traffic-corridor traffic-'+m.cls+'"><div class="traffic-corridor-top"><span class="traffic-state-dot"></span><div style="flex:1"><b>'+e(x.name)+'</b><div class="traffic-status-label">'+m.icon+' '+m.label+(x.eventCount?' · '+x.eventCount+' událostí':'')+'</div><div class="small" style="margin-top:4px">'+e(x.summary||x.description||'')+'</div></div></div></div>';
  }).join('')||'<div class="small">Nejsou nastavené žádné sledované úseky.</div>';
  $('trafficEvents').innerHTML=(r.events||[]).map(ev=>{
    const names=(ev.corridorIds||[]).map(id=>r.corridors.find(c=>c.id===id)?.name).filter(Boolean);
    const extra=[ev.delayMinutes?('zdržení cca '+ev.delayMinutes+' min'):'',ev.lanesRestricted?('omezené pruhy: '+ev.lanesRestricted):''].filter(Boolean).join(' · ');
    return '<div class="traffic-event '+(ev.severity==='critical'?'critical':'')+'"><div class="traffic-event-title">'+(ev.severity==='critical'?'🔴':'🟠')+' '+e(ev.typeLabel||'Dopravní omezení')+'</div><div>'+e(ev.text||'')+'</div>'+(extra?'<div class="small" style="margin-top:4px">'+e(extra)+'</div>':'')+(names.length?'<div class="small" style="margin-top:4px">Úsek: '+e(names.join(' · '))+'</div>':'')+'</div>';
  }).join('')||(r.error==='SOURCE_FORBIDDEN'?'<div class="small">Živá dopravní data zatím nejsou dostupná, protože API účet nemá oprávnění k tomuto zdroji.</div>':r.error?'<div class="small">Dopravní data se momentálně nepodařilo načíst.</div>':r.sourceConfigured?'<div class="small">Na sledovaných úsecích nejsou aktuálně zachycená žádná hlášená omezení.</div>':'<div class="small">Události se zobrazí po připojení živého datového zdroje.</div>');
  renderTrafficMap(r);
}
async function loadTrafficReport(force=false){
  if(!tok||trafficLoading||D.transport?.enabled===false||(me?.role!=='admin'&&moduleCfg('transport').online===false))return trafficReport;
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
  const transportOffline=me?.role!=='admin'&&moduleCfg('transport').online===false;
  const hiddenByAdmin=me?.role!=='admin'&&t.userSettingsVisible===false;
  $('trafficPrefsCard').hidden=t.enabled===false||transportOffline||hiddenByAdmin;
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


function localDateISO(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
function addDaysISO(base,n){const d=new Date(base+'T12:00:00');d.setDate(d.getDate()+n);return localDateISO(d)}
function tireTaskCategoryLabel(v){
  const raw=String(v||'').trim();
  return raw.toLowerCase()==='manager'?'MANAŽER':raw.toLowerCase()==='vip'?'VIP':raw.toLowerCase()==='pool'?'POOL':raw||'—';
}
function tireTaskStatusMeta(v){
  return v==='in_progress'?{label:'ROZPRACOVÁNO',icon:'🔵'}:
    v==='completed'?{label:'HOTOVO',icon:'🟢'}:
    v==='problem'?{label:'PROBLÉM',icon:'🔴'}:
    v==='closed'?{label:'UZAVŘENO',icon:'✅'}:
    {label:'PLÁNOVÁNO',icon:'⚪'};
}
function tireTaskCaps(){return D.tireTaskCapabilities||{view:true,create:false,edit:false,progress:false,comment:true,close:false,delete:false}}
function tireTaskRowsForView(){
  const rows=(D.tireTasks||[]).slice(),today=localDateISO(),tomorrow=addDaysISO(today,1),end=addDaysISO(today,6);
  if(tireTaskView==='tomorrow')return rows.filter(t=>t.date===tomorrow);
  if(tireTaskView==='week')return rows.filter(t=>t.date>=today&&t.date<=end);
  if(tireTaskView==='history')return rows.filter(t=>t.status==='closed'||t.date<today).sort((a,b)=>(String(b.closedAt||b.date)+' '+String(b.time||'')).localeCompare(String(a.closedAt||a.date)+' '+String(a.time||'')));
  return rows.filter(t=>t.date===today);
}
function newTireTaskDraftRow(seed={}){
  return {key:String(++tireTaskDraftSeq),time:seed.time||'',carId:seed.carId||'',category:seed.category||'',targetSeason:seed.targetSeason||'winter',search:seed.search||''};
}
function ensureTireTaskDraft(){if(!tireTaskDraftRows.length)tireTaskDraftRows=[newTireTaskDraftRow()]}
function tireTaskCategoryOptions(selected=''){
  return '<option value="">Vyber skupinu…</option>'+(D.vehicleCategories||[]).map(x=>'<option value="'+e(x)+'" '+(x===selected?'selected':'')+'>'+e(x)+'</option>').join('');
}
function tireTaskDraftCarOptions(row){
  const q=String(row.search||'').trim().toLocaleUpperCase('cs-CZ');
  let cars=(D.cars||[]).filter(c=>!q||[c.plate,c.name,c.vin].join(' ').toLocaleUpperCase('cs-CZ').includes(q));
  const selected=(D.cars||[]).find(c=>c.id===row.carId);
  if(selected&&!cars.some(c=>c.id===selected.id))cars=[selected,...cars];
  return '<option value="">'+(cars.length?'Vyber vozidlo…':'Žádné vozidlo nenalezeno')+'</option>'+cars.map(c=>'<option value="'+e(c.id)+'" '+(c.id===row.carId?'selected':'')+'>'+e(c.plate)+' — '+e(c.name||'')+'</option>').join('');
}
function collectTireTaskDraftRows(){
  if(!$('tireTaskRows'))return tireTaskDraftRows;
  document.querySelectorAll('.tiretask-plan-row').forEach(el=>{
    const row=tireTaskDraftRows.find(x=>x.key===el.dataset.key);if(!row)return;
    row.time=el.querySelector('.tt-plan-time')?.value||'';
    row.search=el.querySelector('.tt-plan-search')?.value||'';
    row.carId=el.querySelector('.tt-plan-car')?.value||'';
    row.category=el.querySelector('.tt-plan-category')?.value||'';
    row.targetSeason=el.querySelector('.tt-plan-season')?.value||'winter';
  });
  return tireTaskDraftRows;
}
function renderTireTaskDraft(){
  if(!$('tireTaskRows'))return;
  ensureTireTaskDraft();
  $('tireTaskRows').innerHTML=tireTaskDraftRows.map((row,index)=>'<div class="tiretask-plan-row" data-key="'+e(row.key)+'">'+
    '<div class="tiretask-plan-row-head"><b>Vozidlo '+(index+1)+'</b>'+(tireTaskDraftRows.length>1?'<button class="tt-plan-remove danger-btn" data-key="'+e(row.key)+'">✕ Odebrat</button>':'')+'</div>'+
    '<div class="tiretask-plan-grid">'+
      '<div><div class="filter-label">Čas</div><input class="tt-plan-time" type="time" value="'+e(row.time)+'"><div class="small" style="margin-top:3px">Prázdné = celý den</div></div>'+
      '<div><div class="filter-label">Vozidlo</div><div class="search-wrap"><span class="search-icon">🔎</span><input class="tt-plan-search" type="search" autocomplete="off" value="'+e(row.search)+'" placeholder="Hledat podle SPZ…"></div><select class="tt-plan-car">'+tireTaskDraftCarOptions(row)+'</select></div>'+
      '<div><div class="filter-label">Skupina</div><select class="tt-plan-category">'+tireTaskCategoryOptions(row.category)+'</select></div>'+
      '<div><div class="filter-label">Přezout na</div><select class="tt-plan-season"><option value="winter" '+(row.targetSeason==='winter'?'selected':'')+'>❄️ Zimní</option><option value="summer" '+(row.targetSeason==='summer'?'selected':'')+'>☀️ Letní</option></select></div>'+
    '</div></div>').join('');
  $('tireTaskRowCount').textContent=tireTaskDraftRows.length+' / 6 vozidel';
  $('addTireTaskRow').disabled=tireTaskDraftRows.length>=6;
  document.querySelectorAll('.tiretask-plan-row').forEach(el=>{
    const key=el.dataset.key,row=tireTaskDraftRows.find(x=>x.key===key);
    const search=el.querySelector('.tt-plan-search'),carSel=el.querySelector('.tt-plan-car'),catSel=el.querySelector('.tt-plan-category');
    search.oninput=()=>{row.search=search.value;row.carId=carSel.value;carSel.innerHTML=tireTaskDraftCarOptions(row);if(row.carId)carSel.value=row.carId};
    carSel.onchange=()=>{row.carId=carSel.value;const car=(D.cars||[]).find(c=>c.id===row.carId);if(car?.category&&(D.vehicleCategories||[]).includes(car.category)){row.category=car.category;catSel.value=car.category}};
    el.querySelector('.tt-plan-time').onchange=x=>row.time=x.target.value;
    catSel.onchange=x=>row.category=x.target.value;
    el.querySelector('.tt-plan-season').onchange=x=>row.targetSeason=x.target.value;
  });
  document.querySelectorAll('.tt-plan-remove').forEach(b=>b.onclick=()=>{collectTireTaskDraftRows();tireTaskDraftRows=tireTaskDraftRows.filter(x=>x.key!==b.dataset.key);ensureTireTaskDraft();renderTireTaskDraft()});
}
function tireTaskAssignableOptions(selected=''){
  return '<option value="">👥 Nepřiřazeno – společný úkol</option>'+(D.tireTaskAssignableUsers||[]).map(u=>'<option value="'+e(u.id)+'" '+(u.id===selected?'selected':'')+'>'+e(u.name)+' · '+e(roleLabel(u.role))+'</option>').join('');
}
function fillTireTaskAssignees(){
  if(!$('tireTaskAssignee'))return;
  const cur=$('tireTaskAssignee').value;
  $('tireTaskAssignee').innerHTML=tireTaskAssignableOptions(cur);
  if(cur&&(D.tireTaskAssignableUsers||[]).some(u=>u.id===cur))$('tireTaskAssignee').value=cur;
}
function tireTaskTimeLabel(t){return t.time?e(t.time):'CELÝ DEN'}
function renderMyTireTasks(){
  if(!$('tireTaskMineCard')||!$('tireTaskMineList'))return;
  const caps=tireTaskCaps();
  const rows=(D.tireTasks||[]).filter(t=>t.assignedToUserId===me?.id&&t.status!=='closed').sort((a,b)=>(String(a.date)+'T'+String(a.time||'23:59')).localeCompare(String(b.date)+'T'+String(b.time||'23:59')));
  $('tireTaskMineCard').hidden=!rows.length;
  $('tireTaskMineCount').textContent=String(rows.length);
  $('tireTaskMineList').innerHTML=rows.map(t=>{
    const sm=tireTaskStatusMeta(t.status),canProgress=caps.progress||t.assignedToUserId===me?.id,canClose=caps.close||t.assignedToUserId===me?.id;
    let buttons='';
    if(canProgress&&!['completed','closed'].includes(t.status)&&t.status!=='in_progress')buttons+='<button class="tt-start secondary" data-id="'+e(t.id)+'">▶ Rozpracovat</button>';
    if(can('dotCreate')&&!['completed','closed'].includes(t.status))buttons+='<button class="tt-dot primary" data-id="'+e(t.id)+'">🛞 PNEU/DOT</button>';
    if(canClose&&t.status==='completed')buttons+='<button class="tt-close primary" data-id="'+e(t.id)+'">✅ Ukončit</button>';
    if(caps.delete)buttons+='<button class="tt-delete danger-btn" data-id="'+e(t.id)+'">🗑 Smazat</button>';
    return '<div class="tiretask-mine-item"><div class="tiretask-mine-head"><div><div class="tiretask-mine-title">'+e(t.carPlate||'—')+' · '+(t.targetSeason==='winter'?'❄️ Zimní':'☀️ Letní')+'</div><div class="tiretask-mine-meta">'+e(t.date||'')+' · '+tireTaskTimeLabel(t)+' · '+sm.icon+' '+sm.label+'</div></div></div>'+(t.instructions?'<div class="small" style="margin-top:6px">'+e(t.instructions)+'</div>':'')+(buttons?'<div class="toolbar" style="margin-top:8px">'+buttons+'</div>':'')+'</div>';
  }).join('');
}
function renderTireTask(){
  if(!$('tireTaskList'))return;
  const caps=tireTaskCaps(),today=localDateISO();
  if($('tireTaskCreateCard'))$('tireTaskCreateCard').hidden=!caps.create;
  renderTireTaskDraft();
  fillTireTaskAssignees();
  renderMyTireTasks();
  if($('tireTaskDate')&&!$('tireTaskDate').value)$('tireTaskDate').value=today;
  document.querySelectorAll('[data-tiretask-view]').forEach(b=>b.classList.toggle('active',b.dataset.tiretaskView===tireTaskView));
  const rows=tireTaskRowsForView();
  const waiting=rows.filter(t=>t.status==='planned').length;
  const active=rows.filter(t=>t.status==='in_progress'||t.status==='problem').length;
  const done=rows.filter(t=>t.status==='completed'||t.status==='closed').length;
  $('tireTaskStats').innerHTML=
    '<div class="tiretask-stat"><b>'+rows.length+'</b><span>Celkem</span></div>'+
    '<div class="tiretask-stat"><b>'+waiting+'</b><span>Čeká</span></div>'+
    '<div class="tiretask-stat"><b>'+active+'</b><span>Rozpracováno / problém</span></div>'+
    '<div class="tiretask-stat"><b>'+done+'</b><span>Hotovo</span></div>';
  $('tireTaskList').innerHTML=rows.map(t=>{
    const sm=tireTaskStatusMeta(t.status),seasonLabel=t.targetSeason==='winter'?'❄️ ZIMNÍ':'☀️ LETNÍ',canProgress=caps.progress||t.assignedToUserId===me?.id,canClose=caps.close||t.assignedToUserId===me?.id;
    const comments=(t.comments||[]).slice(-5).map(x=>'<div class="tiretask-comment"><b>'+e(x.userName||'—')+'</b> <span class="small">'+dt(x.at)+'</span><div>'+e(x.text)+'</div></div>').join('');
    const activity=(t.activity||[]).slice(-5).reverse().map(x=>'<div>'+dt(x.at)+' · '+e(x.userName||'Systém')+' · '+e(x.text||'')+'</div>').join('');
    let actions='';
    if(t.status!=='closed'){
      if(canProgress&&t.status!=='completed'){
        if(t.status!=='in_progress')actions+='<button class="tt-start secondary" data-id="'+e(t.id)+'">▶ Rozpracovat</button>';
        actions+='<button class="tt-problem danger-btn" data-id="'+e(t.id)+'">⚠ Problém</button>';
      }
      if(can('dotCreate')&&t.status!=='completed')actions+='<button class="tt-dot primary" data-id="'+e(t.id)+'">🛞 Zapsat PNEU/DOT</button>';
      if(caps.edit&&t.status!=='completed')actions+='<button class="tt-edit secondary" data-id="'+e(t.id)+'">Upravit plán</button>';
      if(canClose&&t.status==='completed')actions+='<button class="tt-close primary" data-id="'+e(t.id)+'">✅ Uložit / ukončit</button>';
    }
    if(caps.delete)actions+='<button class="tt-delete danger-btn" data-id="'+e(t.id)+'">🗑 Smazat úkol</button>';
    const closeInfo=t.status==='closed'?'<div class="small" style="margin-top:8px"><b>Uzavřel:</b> '+e(t.closedBy||'—')+' · '+dt(t.closedAt)+'</div>':'';
    const commentForm=t.status!=='closed'&&caps.comment?'<div class="tiretask-comment-form"><input class="tt-comment-input" data-id="'+e(t.id)+'" maxlength="500" placeholder="Doplnit poznámku…"><button class="tt-comment secondary" data-id="'+e(t.id)+'">Přidat</button></div>':'';
    return '<div class="tiretask-card '+e(t.status)+'">'+
      '<div class="tiretask-head"><div><div class="tiretask-time">'+tireTaskTimeLabel(t)+'</div><div class="tiretask-plate">'+e(t.carPlate||'—')+'</div><div class="small">'+e(t.carName||'')+' · '+e(t.date||'')+'</div></div><span class="tiretask-status '+e(t.status)+'">'+sm.icon+' '+sm.label+'</span></div>'+
      '<div class="tiretask-badges"><span class="tiretask-badge">'+e(tireTaskCategoryLabel(t.category))+'</span><span class="tiretask-badge '+e(t.targetSeason)+'">'+seasonLabel+'</span></div>'+
      (caps.edit?'<div><div class="filter-label">Přiřazeno</div><select class="tt-assignee-select" data-id="'+e(t.id)+'">'+tireTaskAssignableOptions(t.assignedToUserId||'')+'</select></div>':(t.assignedToName?'<div class="tiretask-assigned">👤 Přiřazeno: '+e(t.assignedToName)+'</div>':'<div class="small" style="margin:7px 0">👥 Společný úkol · nepřiřazeno</div>'))+
      (t.instructions?'<div class="tiretask-instructions"><b>Instrukce Dispatch</b><div style="margin-top:4px">'+e(t.instructions)+'</div></div>':'')+
      (t.problemNote?'<div class="tiretask-problem"><b>⚠ Problém</b><div>'+e(t.problemNote)+'</div></div>':'')+
      (t.completedRecordId?'<div class="tiretask-complete"><b>✅ PNEU/DOT zapsáno</b><div>DOT '+e(t.completedDot||'—')+' · '+Number(t.completedMileage??0).toLocaleString('cs-CZ')+' km</div><div class="small">'+e(t.completedBy||'—')+' · '+dt(t.completedAt)+'</div></div>':'')+
      (actions?'<div class="toolbar">'+actions+'</div>':'')+
      '<div class="tiretask-comments"><b>💬 Poznámky '+(t.comments?.length||0)+'</b>'+ (comments||'<div class="small" style="margin-top:5px">Zatím bez poznámek.</div>') +commentForm+'</div>'+
      (activity?'<details style="margin-top:9px"><summary class="small">Aktivita úkolu</summary><div class="tiretask-activity">'+activity+'</div></details>':'')+closeInfo+
      '</div>';
  }).join('')||'<div class="card"><div class="small">Pro tento pohled nejsou žádné TireTasky.</div></div>';

  document.querySelectorAll('.tt-start').forEach(b=>b.onclick=()=>setTireTaskStatus(b.dataset.id,'in_progress'));
  document.querySelectorAll('.tt-problem').forEach(b=>b.onclick=()=>{const n=prompt('Co je problém?');if(n!==null&&n.trim())setTireTaskStatus(b.dataset.id,'problem',n.trim())});
  document.querySelectorAll('.tt-dot').forEach(b=>b.onclick=()=>openPneuFromTireTask(b.dataset.id));
  document.querySelectorAll('.tt-edit').forEach(b=>b.onclick=()=>editTireTask(b.dataset.id));
  document.querySelectorAll('.tt-close').forEach(b=>b.onclick=()=>closeTireTask(b.dataset.id));
  document.querySelectorAll('.tt-delete').forEach(b=>b.onclick=()=>deleteTireTask(b.dataset.id));
  document.querySelectorAll('.tt-comment').forEach(b=>b.onclick=()=>addTireTaskComment(b.dataset.id));
  document.querySelectorAll('.tt-assignee-select').forEach(s=>s.onchange=async()=>{try{await api('tireTaskUpdate',{taskId:s.dataset.id,assignedToUserId:s.value});await refresh()}catch(x){alert(errorText(x))}});
}
async function setTireTaskStatus(id,status,problemNote=''){
  try{await api('tireTaskSetStatus',{taskId:id,status,problemNote});await refresh()}catch(x){alert(errorText(x))}
}
async function addTireTaskComment(id){
  const input=document.querySelector('.tt-comment-input[data-id="'+id+'"]'),text=input?.value.trim();
  if(!text)return;
  try{await api('tireTaskComment',{taskId:id,text});await refresh()}catch(x){alert(errorText(x))}
}
async function closeTireTask(id){
  if(!confirm('Uzavřít tento TireTask jako dokončený?'))return;
  try{await api('tireTaskClose',{taskId:id});await refresh()}catch(x){alert(errorText(x))}
}
async function deleteTireTask(id){
  const t=(D.tireTasks||[]).find(x=>x.id===id);if(!t)return;
  const label=(t.carPlate||'TireTask')+' · '+(t.date||'');
  if(!confirm('Opravdu smazat úkol '+label+'?\n\nSmaže se pouze TireTask. Případný PNEU/DOT záznam zůstane zachovaný. Tuto akci nelze vrátit.'))return;
  try{await api('tireTaskDelete',{taskId:id});if(pendingTireTaskId===id)pendingTireTaskId=null;await refresh()}catch(x){alert(errorText(x))}
}
async function editTireTask(id){
  const t=(D.tireTasks||[]).find(x=>x.id===id);if(!t)return;
  const date=prompt('Datum YYYY-MM-DD:',t.date);if(date===null)return;
  const time=prompt('Čas HH:MM (prázdné = celý den):',t.time||'');if(time===null)return;
  const plate=prompt('SPZ vozidla:',t.carPlate||'');if(plate===null)return;
  const normalizedPlate=plate.trim().replace(/\s+/g,'').toUpperCase();
  const car=(D.cars||[]).find(c=>String(c.plate||'').replace(/\s+/g,'').toUpperCase()===normalizedPlate);
  if(!car)return alert('Vozidlo s touto SPZ nebylo nalezeno.');
  const categoryInput=prompt('Skupina vozidla:\n'+(D.vehicleCategories||[]).join(' · '),tireTaskCategoryLabel(t.category));if(categoryInput===null)return;
  const category=(D.vehicleCategories||[]).find(x=>x.toLocaleUpperCase('cs-CZ')===categoryInput.trim().toLocaleUpperCase('cs-CZ'));
  if(!category)return alert('Vyber existující skupinu vozidel.');
  const sx=prompt('Přezout na: Z = zimní, L = letní',t.targetSeason==='summer'?'L':'Z');if(sx===null)return;
  const targetSeason=/^l/i.test(sx)?'summer':/^z/i.test(sx)?'winter':null;if(!targetSeason)return alert('Zadej L nebo Z.');
  const instructions=prompt('Instrukce Dispatch:',t.instructions||'');if(instructions===null)return;
  try{await api('tireTaskUpdate',{taskId:id,date,time,carId:car.id,category,targetSeason,instructions});await refresh()}catch(x){alert(errorText(x))}
}
function openPneuFromTireTask(id){
  const t=(D.tireTasks||[]).find(x=>x.id===id);if(!t)return;
  pendingTireTaskId=t.id;
  openModule('pneu');showTab('entry',false);
  carSearch='';$('carSearch').value='';renderCarOptions(t.carId);$('car').value=t.carId;rememberCar(t.carId);prefillMileage(t.carId);setSeason(t.targetSeason);valid();
  note($('saveMsg'),'📋 Zápis bude propojen s TIRETASK '+(t.carPlate||'')+' · '+(t.targetSeason==='winter'?'zimní':'letní')+'.','msg');
}

function renderVehicleOverview(){
  if(!$('vehicleOverviewList'))return;
  const addCard=$('vehicleOverviewAddCard'),categoryCard=$('vehicleOverviewCategoryAddCard');
  if(addCard)addCard.hidden=!can('vehicleAdd');
  if(categoryCard)categoryCard.hidden=!can('vehicleCategoryAdd');
  if($('vehicleOverviewAddCategory')){
    const cur=$('vehicleOverviewAddCategory').value;
    $('vehicleOverviewAddCategory').innerHTML='<option value="">Vyber kategorii…</option>'+(D.vehicleCategories||[]).map(x=>'<option value="'+e(x)+'">'+e(x)+'</option>').join('');
    if(cur&&(D.vehicleCategories||[]).includes(cur))$('vehicleOverviewAddCategory').value=cur;
  }
  const all=(D.vehicleOverview||[]).slice().sort((a,b)=>{
    if(a.active!==b.active)return a.active?-1:1;
    return String(a.plate||'').localeCompare(String(b.plate||''),'cs');
  });
  const q=String($('vehicleOverviewSearch')?.value||'').trim().toLocaleUpperCase('cs-CZ');
  const categorySelect=$('vehicleOverviewCategory'),selectedCategory=String(categorySelect?.value||'');
  if(categorySelect){
    const options=['<option value="">Všechny skupiny</option>','<option value="__NONE__">Bez kategorie</option>',...(D.vehicleCategories||[]).map(x=>'<option value="'+e(x)+'">'+e(x)+'</option>')];
    categorySelect.innerHTML=options.join('');
    if(selectedCategory==='__NONE__'||(D.vehicleCategories||[]).includes(selectedCategory))categorySelect.value=selectedCategory;
  }
  const category=String(categorySelect?.value||'');
  const rows=all.filter(v=>{
    if(category==='__NONE__'&&v.category)return false;
    if(category&&category!=='__NONE__'&&v.category!==category)return false;
    return !q||[v.name,v.plate,v.vin,v.category,v.lastModifiedBy].join(' ').toLocaleUpperCase('cs-CZ').includes(q);
  });
  $('vehicleOverviewCount').textContent=rows.length+' z '+all.length+' vozidel'+(category?' · skupina: '+(category==='__NONE__'?'Bez kategorie':category):'');
  const season=(label,icon,s)=>'<div class="vehicle-overview-season"><div class="season-title">'+icon+' '+label+'</div>'+
    (s?'<div><b>DOT '+e(dotLabel(s))+'</b></div><div class="small">'+Number(s.mileage??0).toLocaleString('cs-CZ')+' km</div><div class="small">'+e(s.userName||'—')+' · '+dt(s.createdAt)+'</div>':'<div class="small">Bez záznamu</div>')+'</div>';
  $('vehicleOverviewList').innerHTML=rows.map(v=>{
    const complete=!!v.summer&&!!v.winter;
    return '<div class="vehicle-overview-card">'+
      '<div class="vehicle-overview-head"><div><div class="vehicle-overview-plate">'+e(v.plate||'—')+'</div><div class="vehicle-overview-name">'+e(v.name||'Bez názvu')+'</div><div class="vehicle-overview-tags"><span class="vehicle-category-badge">'+e(v.category||'BEZ KATEGORIE')+'</span></div><div class="vehicle-overview-vin">VIN: '+e(v.vin||'nezadaný')+'</div></div>'+
      '<span class="vehicle-overview-status '+(v.active?'':'archived')+'">'+(v.active?'AKTIVNÍ':'ARCHIV')+'</span></div>'+
      '<div class="vehicle-overview-metrics">'+
        '<div class="vehicle-overview-metric"><span>Aktuální stav</span><b>'+(v.latestMileage===null||v.latestMileage===undefined?'—':Number(v.latestMileage).toLocaleString('cs-CZ')+' km')+'</b></div>'+
        '<div class="vehicle-overview-metric"><span>DOT evidence</span><b>'+(complete?'✅ Kompletní':'⚠️ Neúplná')+'</b></div>'+
        '<div class="vehicle-overview-metric"><span>Počet záznamů</span><b>'+Number(v.recordCount||0).toLocaleString('cs-CZ')+'</b></div>'+
        '<div class="vehicle-overview-metric"><span>Poslední DOT/km</span><b>'+(v.latestRecordAt?dt(v.latestRecordAt):'—')+'</b></div>'+
      '</div>'+
      '<div class="vehicle-overview-dot">'+season('Letní','☀️',v.summer)+season('Zimní','❄️',v.winter)+'</div>'+
      '<div class="vehicle-overview-meta"><div><b>Poslední úprava:</b> '+e(v.lastModifiedBy||'—')+'</div><div class="small">'+dt(v.lastModifiedAt)+'</div><div class="small" style="margin-top:5px">Vozidlo založeno: '+dt(v.createdAt)+'</div></div>'+
      '</div>';
  }).join('')||'<div class="card"><div class="small">'+((q||category)?'Žádné vozidlo neodpovídá zvolenému hledání nebo skupině.':'V evidenci zatím nejsou žádná vozidla.')+'</div></div>';
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
  renderVehicleOverview();
  if($('serviceVehicles'))renderVehiclePreviews('serviceVehicles','service');
  if($('maintenanceVehicles'))renderVehiclePreviews('maintenanceVehicles','maintenance');
  if($('settingsUser'))$('settingsUser').textContent=me?.name||'—';
  if($('settingsRole'))$('settingsRole').textContent=roleLabel(me?.role);if($('themeMode'))$('themeMode').value=themePreference();if($('themeCurrent'))$('themeCurrent').textContent=document.documentElement.dataset.theme==='dark'?'🌙 Tmavý':'☀️ Světlý';
  renderTrafficPrefs();
  if($('homeTrafficStatus'))$('homeTrafficStatus').textContent=trafficHomeText();
  if($('homeNotificationBadge')){$('homeNotificationBadge').textContent=String(D.notificationUnreadCount||0);$('homeNotificationBadge').hidden=!(D.notificationUnreadCount>0)}
  renderMainModuleCards();
  document.querySelectorAll('[data-module="pneu"]').forEach(x=>{if(me?.role!=='admin'&&moduleCfg('pneu').visible!==false)x.hidden=!hasPneuAccess()});
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
  $('trafficAdminSourceText').textContent=t.sourceConfigured?'Golemio API klíč je bezpečně uložený na serveru. Přístup ke konkrétním dopravním zdrojům se ověřuje při načtení reportu.':'Golemio API klíč zatím není v prostředí Vercelu. Modul funguje, ale živá dopravní data se nezačnou načítat, dokud se klíč nepřidá.';
  $('transportEnabled').checked=t.enabled!==false;
  $('transportNotificationsEnabled').checked=t.notificationsEnabled!==false;
  $('transportUserSettingsVisible').checked=t.userSettingsVisible!==false;
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

function renderModuleControls(){
  if(me?.role!=='admin'||!$('adminModules'))return;
  const modules=D.modulesAdmin||{};
  $('adminModules').innerHTML=MODULE_KEYS.map(id=>{
    const meta=MODULE_META[id],m=modules[id]||{visible:true,online:true,offlineMessage:'Modul je dočasně mimo provoz.'};
    return '<div class="module-control" data-module-control="'+e(id)+'">'+
      '<div class="module-control-head"><div><b>'+meta.icon+' '+e(meta.label)+'</b><div class="small" style="margin-top:3px">Nastavení pro běžné uživatele</div></div>'+
      '<span class="module-control-state '+(m.online?'online':'offline')+'">'+(m.online?'🟢 ONLINE':'🔴 OFFLINE')+'</span></div>'+
      '<div class="switchline"><input class="module-visible-toggle" data-id="'+e(id)+'" type="checkbox" '+(m.visible?'checked':'')+'><span>Zobrazit v hlavním menu</span></div>'+
      '<div class="switchline"><input class="module-online-toggle" data-id="'+e(id)+'" type="checkbox" '+(m.online?'checked':'')+'><span>Modul online</span></div>'+
      '<div class="filter-label">Zpráva při Offline režimu</div>'+
      '<input class="module-offline-message" data-id="'+e(id)+'" maxlength="220" value="'+e(m.offlineMessage||'')+'" placeholder="Modul je dočasně mimo provoz.">'+
      '</div>';
  }).join('');
  document.querySelectorAll('.module-online-toggle').forEach(x=>x.onchange=()=>{
    const box=x.closest('.module-control'),badge=box?.querySelector('.module-control-state');
    if(badge){badge.className='module-control-state '+(x.checked?'online':'offline');badge.textContent=x.checked?'🟢 ONLINE':'🔴 OFFLINE'}
  });
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
function vehicleCategoryOptions(selected='',allowEmpty=false){
  const cats=D.vehicleCategories||[];
  return (allowEmpty?'<option value="">Bez kategorie</option>':'<option value="">Vyber kategorii…</option>')+cats.map(x=>'<option value="'+e(x)+'" '+(x===selected?'selected':'')+'>'+e(x)+'</option>').join('');
}
function renderVehicleCategories(){
  const sel=$('newVehicleCategory');if(sel){const cur=sel.value;sel.innerHTML=vehicleCategoryOptions(cur,false);if(cur&&(D.vehicleCategories||[]).includes(cur))sel.value=cur}
  if($('vehicleCategoryList'))$('vehicleCategoryList').innerHTML=(D.vehicleCategories||[]).map(x=>'<span class="vehicle-category-badge">'+e(x)+'</span>').join(' ')||'<span class="small">Žádné kategorie.</span>';
}
function editCar(id){editingCarId=id;renderAdminCars()}
function cancelCarEdit(){editingCarId=null;renderAdminCars()}
async function saveCarEdit(id){
  const row=document.querySelector('.checkrow.editing[data-id="'+id+'"]');if(!row)return;
  const plate=row.querySelector('.car-edit-plate')?.value.trim()||'',name=row.querySelector('.car-edit-name')?.value.trim()||'',vin=row.querySelector('.car-edit-vin')?.value.trim()||'',category=row.querySelector('.car-edit-category')?.value||'';
  if(!plate)return alert('Doplň SPZ vozidla.');
  if(!category)return alert('Vyber kategorii vozidla.');
  const save=row.querySelector('.save-car-edit');if(save)save.disabled=true;
  try{await api('adminUpdateCar',{carId:id,plate,name,vin,category});editingCarId=null;await refresh()}
  catch(x){if(save)save.disabled=false;alert(errorText(x))}
}
async function setCarActive(id,active){if(!confirm(active?'Obnovit toto auto z archivu?':'Archivovat toto auto? Historie zůstane zachována.'))return;await api('adminSetCarActive',{carId:id,active});await refresh()}
function carAdminRow(c,active){
  const check='<input class="'+(active?'active-car-check':'arch-car-check')+'" type="checkbox" value="'+e(c.id)+'">';
  if(editingCarId===c.id)return '<div class="item checkrow editing" data-id="'+e(c.id)+'">'+check+
    '<div class="car-admin-fields">'+
      '<div><div class="filter-label">SPZ</div><input class="car-edit-plate" maxlength="16" value="'+e(c.plate||'')+'"></div>'+
      '<div><div class="filter-label">Vozidlo / model</div><input class="car-edit-name" maxlength="80" value="'+e(c.name||'')+'"></div>'+
      '<div><div class="filter-label">VIN</div><input class="car-edit-vin" maxlength="32" value="'+e(c.vin||'')+'"></div>'+
      '<div><div class="filter-label">Kategorie</div><select class="car-edit-category">'+vehicleCategoryOptions(c.category||'',false)+'</select></div>'+
    '</div>'+
    '<div class="toolbar car-edit-actions"><button class="save-car-edit primary" data-id="'+e(c.id)+'">💾 Uložit změny</button><button class="cancel-car-edit secondary">Zrušit</button></div>'+
    '</div>';
  return '<div class="item checkrow" data-id="'+e(c.id)+'">'+check+'<div><b>'+e(c.plate)+'</b> '+e(c.name||'')+(c.vin?'<div class="small">VIN: '+e(c.vin)+'</div>':'')+'<div style="margin-top:5px"><span class="vehicle-category-badge">'+e(c.category||'BEZ KATEGORIE')+'</span></div></div><div class="toolbar"><button class="car-detail secondary" data-id="'+e(c.id)+'">Detail</button><button class="edit-car secondary" data-id="'+e(c.id)+'">✏️ Upravit</button><button class="toggle-car '+(active?'danger-btn':'primary')+'" data-id="'+e(c.id)+'" data-active="'+(!active)+'">'+(active?'Archivovat':'Obnovit')+'</button></div></div>';
}
function renderAdminCars(){
  renderVehicleCategories();
  const all=D.allCars||[],active=all.filter(c=>c.active!==false),arch=all.filter(c=>c.active===false);
  if(editingCarId&&!all.some(c=>c.id===editingCarId))editingCarId=null;
  $('adminCars').innerHTML=active.map(c=>carAdminRow(c,true)).join('')||'<div class="small">Žádná aktivní auta.</div>';
  $('archivedCars').innerHTML=arch.map(c=>carAdminRow(c,false)).join('')||'<div class="small">Archiv je prázdný.</div>';
  document.querySelectorAll('.car-detail').forEach(b=>b.onclick=()=>openAdminVehicle(b.dataset.id));
  document.querySelectorAll('.edit-car').forEach(b=>b.onclick=()=>editCar(b.dataset.id));
  document.querySelectorAll('.save-car-edit').forEach(b=>b.onclick=()=>saveCarEdit(b.dataset.id));
  document.querySelectorAll('.cancel-car-edit').forEach(b=>b.onclick=cancelCarEdit);
  document.querySelectorAll('.toggle-car').forEach(b=>b.onclick=()=>setCarActive(b.dataset.id,b.dataset.active==='true'));
}
$('selectAllActive').onclick=()=>document.querySelectorAll('.active-car-check').forEach(x=>x.checked=true);$('selectAllArchived').onclick=()=>document.querySelectorAll('.arch-car-check').forEach(x=>x.checked=true);
async function bulkCars(selector,active){const ids=[...document.querySelectorAll(selector+':checked')].map(x=>x.value);if(!ids.length)return alert('Nejdřív vyber auta.');if(!confirm((active?'Obnovit ':'Archivovat ')+ids.length+' aut?'))return;await api('adminBulkCars',{carIds:ids,active});await refresh()}
$('bulkArchive').onclick=()=>bulkCars('.active-car-check',false);$('bulkRestore').onclick=()=>bulkCars('.arch-car-check',true);
if($('addVehicleCategory'))$('addVehicleCategory').onclick=async()=>{const category=$('newVehicleCategoryName').value.trim();if(!category)return note($('vehicleCategoryMsg'),'Zadej název kategorie.','msg err');try{await api('adminAddVehicleCategory',{category});$('newVehicleCategoryName').value='';note($('vehicleCategoryMsg'),'Kategorie byla přidána.','msg ok');await refresh()}catch(x){note($('vehicleCategoryMsg'),errorText(x),'msg err')}};

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
  const s=D.notificationSettings||{};$('autoIncomplete').checked=!!s.incompleteEnabled;$('autoIncompleteDays').value=String(s.incompleteRepeatDays||3);$('autoIncompleteRecipients').value=s.incompleteRecipients||'workers';$('autoSummer').checked=s.incompleteMissingSummer!==false;$('autoWinter').checked=s.incompleteMissingWinter!==false;$('autoAnomaly').checked=!!s.adminAnomalyEnabled;$('autoAdminDays').value=String(s.adminAnomalyRepeatDays||3);$('autoStale').checked=!!s.staleEnabled;$('autoStaleDays').value=String(s.staleDays||365);
  $('notificationLog').innerHTML=(D.notificationLog||[]).slice(0,80).map(n=>{
    const m=notificationUiMeta(n),acks=(n.acks||[]).map(a=>'<div class="ack">✓ '+e(a.userName||a.userId)+' · '+(a.response==='view_vehicle'?'Zobrazil vozidlo':'Rozumím')+' · '+dt(a.at)+'</div>').join('');
    const recipients=(n.recipientUserIds||[]).length,pending=n.requiresAck?Math.max(0,recipients-(n.acks||[]).length):0;
    return '<div class="item"><b>'+m.icon+' '+e(n.title||n.type)+'</b> <span class="badge">'+e(m.label)+'</span>'+(n.carPlate?' <span class="badge">'+e(n.carPlate)+'</span>':'')+'<div class="small">'+e(n.body||'')+'</div><div class="small">'+dt(n.createdAt)+' · push '+(n.sent??0)+'/'+(n.devices??0)+(n.requiresAck&&recipients?' · potvrzeno '+(n.acks||[]).length+'/'+recipients+' · čeká '+pending:' · bez povinného potvrzení')+'</div>'+acks+'</div>';
  }).join('')||'<div class="small">Zatím žádná oznámení.</div>';
}
$('saveNotificationSettings').onclick=async()=>{const settings={incompleteEnabled:$('autoIncomplete').checked,incompleteRepeatDays:+$('autoIncompleteDays').value,incompleteRecipients:$('autoIncompleteRecipients').value,incompleteMissingSummer:$('autoSummer').checked,incompleteMissingWinter:$('autoWinter').checked,adminAnomalyEnabled:$('autoAnomaly').checked,adminAnomalyRepeatDays:+$('autoAdminDays').value,staleEnabled:$('autoStale').checked,staleDays:+$('autoStaleDays').value};try{await api('adminSaveNotificationSettings',{settings});alert('Pravidla oznámení jsou uložená.');await refresh()}catch(x){alert(errorText(x))}};

// Audit
function renderAudit(){const q=$('auditSearch').value.trim().toLocaleLowerCase('cs-CZ');const rows=(D.audit||[]).filter(a=>!q||(a.actorName+' '+a.action+' '+a.summary).toLocaleLowerCase('cs-CZ').includes(q));$('auditList').innerHTML=rows.slice(0,200).map(a=>'<div class="audit-line"><b>'+e(a.actorName)+'</b> · '+e(a.summary)+'<div class="small">'+dt(a.createdAt)+' · '+e(a.action)+'</div></div>').join('')||'<div class="small">Nic nenalezeno.</div>'}
$('auditSearch').oninput=renderAudit;

// Import & backup
function parseCsvLine(line,delimiter){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===delimiter&&!q){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out}
$('importCars').onclick=async()=>{const file=$('csvImport').files?.[0];if(!file)return note($('importMsg'),'Vyber CSV soubor.','msg err');const text=await file.text(),lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return;const delimiter=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';let rows=lines.map(l=>parseCsvLine(l,delimiter));if(rows[0]&&/spz|plate/i.test(rows[0][0]))rows.shift();const payload=rows.map(r=>({plate:r[0],name:r[1]||''})).filter(r=>r.plate);try{const result=await api('adminImportCars',{rows:payload});note($('importMsg'),'Přidáno '+result.added+' aut, přeskočeno '+result.skipped+'.','msg ok');$('csvImport').value='';await refresh()}catch(x){note($('importMsg'),errorText(x),'msg err')}};
$('backupJson').onclick=async()=>{try{const data=await api('adminBackup');downloadBlob(JSON.stringify(data,null,2),'application/json;charset=utf-8','DOT-Evidence-Backup-'+new Date().toISOString().slice(0,10)+'.json')}catch(x){alert(errorText(x))}};

function renderAdmin(){renderAdminDashboard();renderModuleControls();renderAdminCars();renderAdminUsers();renderNotificationAdmin();renderTransportAdmin();renderAudit()}
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
  if(MODULE_KEYS.includes(currentModule)&&me.role!=='admin'&&moduleCfg(currentModule).online===false)showModuleBlocked(currentModule,moduleCfg(currentModule).offlineMessage);
}
function render(){const sel=$('car').value;renderCarOptions(sel);valid();renderFleet();renderHist();if(me.role==='admin')renderAdmin();else renderAttention();renderModuleShell();renderTireTask();renderNotificationSettings();renderNotifications();if(currentModule==='transport')renderTrafficReport();applyAccess();renderSystemBanner();renderNoticeOverlay();renderNotificationToast()}

function showTab(id,doRefresh=true){if(!allowedTab(id))return;document.querySelectorAll('#pneu .panel').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.pneu-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));if(doRefresh&&(id==='history'||id==='fleet'))refresh()}
if($('saveModuleControls'))$('saveModuleControls').onclick=async()=>{
  const modules={};
  MODULE_KEYS.forEach(id=>{
    const visible=document.querySelector('.module-visible-toggle[data-id="'+id+'"]');
    const online=document.querySelector('.module-online-toggle[data-id="'+id+'"]');
    const message=document.querySelector('.module-offline-message[data-id="'+id+'"]');
    modules[id]={visible:!!visible?.checked,online:!!online?.checked,offlineMessage:message?.value.trim()||''};
  });
  try{
    const r=await api('adminSaveModules',{modules});
    D.modulesAdmin=r.modulesAdmin;
    note($('moduleControlsMsg'),'Nastavení modulů bylo uloženo.','msg ok');
    await refresh();
  }catch(x){note($('moduleControlsMsg'),errorText(x),'msg err')}
};
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
  const settings={enabled:$('transportEnabled').checked,notificationsEnabled:$('transportNotificationsEnabled').checked,userSettingsVisible:$('transportUserSettingsVisible').checked,cacheMinutes:+$('transportCacheMinutes').value,pollMinutes:+$('transportPollMinutes').value};
  try{await api('adminSaveTransportSettings',{settings});note($('transportAdminMsg'),'Nastavení Dopravy je uložené.','msg ok');await refresh()}catch(x){note($('transportAdminMsg'),errorText(x),'msg err')}
};
if($('addTrafficCorridor'))$('addTrafficCorridor').onclick=async()=>{
  const name=$('newTrafficName').value.trim(),type=$('newTrafficType').value,matchTerms=$('newTrafficTerms').value.trim(),description=$('newTrafficDescription').value.trim();
  try{await api('adminAddTransportCorridor',{name,type,matchTerms,description});$('newTrafficName').value=$('newTrafficTerms').value=$('newTrafficDescription').value='';note($('newTrafficMsg'),'Sledovaný úsek byl přidán.','msg ok');await refresh()}catch(x){note($('newTrafficMsg'),errorText(x),'msg err')}
};
document.querySelectorAll('[data-notification-view]').forEach(b=>b.onclick=()=>{notificationView=b.dataset.notificationView;renderNotifications()});
if($('saveNotificationPrefs'))$('saveNotificationPrefs').onclick=async()=>{
  const prefs={operational:$('prefOperationalNotifications').checked,adminInfo:$('prefAdminInfoNotifications').checked};
  try{const r=await api('saveNotificationPrefs',{prefs});D.notificationPrefs=r.prefs;note($('notificationPrefsMsg'),'Nastavení oznámení je uložené.','msg ok');renderNotificationSettings()}catch(x){note($('notificationPrefsMsg'),errorText(x),'msg err')}
};
if($('sendOperationalNotice'))$('sendOperationalNotice').onclick=async()=>{
  const expiresRaw=$('operationalExpires').value;
  const data={recipient:$('operationalRecipient').value,severity:$('operationalSeverity').value,title:$('operationalTitle').value.trim(),message:$('operationalMessage').value.trim(),requiresAck:$('operationalAck').checked,expiresAt:expiresRaw?new Date(expiresRaw).toISOString():null};
  try{const r=await api('sendOperationalNotification',data);note($('operationalNoticeMsg'),'Odesláno · push '+r.sent+'/'+(r.devices||0)+'.','msg ok');$('operationalTitle').value=$('operationalMessage').value=$('operationalExpires').value='';$('operationalAck').checked=false;await refresh()}catch(x){note($('operationalNoticeMsg'),errorText(x),'msg err')}
};
function updateAdminNoticeSeverity(){
  if(!$('adminNoticeSeverity'))return;
  const critical=$('adminNoticeSeverity').value==='critical';
  $('adminNoticeAck').checked=critical||$('adminNoticeAck').checked;
  $('adminNoticeAck').disabled=critical;
  if($('adminNoticeSeverityHelp'))$('adminNoticeSeverityHelp').textContent=critical?'Kritické oznámení vždy obejde uživatelské preference a vyžaduje potvrzení.':$('adminNoticeSeverity').value==='important'?'Důležité Admin oznámení obejde uživatelské preference.':'Běžné Admin oznámení respektuje uživatelské nastavení.';
}
if($('adminNoticeSeverity'))$('adminNoticeSeverity').onchange=updateAdminNoticeSeverity;
if($('sendAdminNotice'))$('sendAdminNotice').onclick=async()=>{
  const expiresRaw=$('adminNoticeExpires').value;
  const data={recipient:$('adminNoticeRecipient').value,carId:$('adminNoticeVehicle').value||null,severity:$('adminNoticeSeverity').value,title:$('adminNoticeTitle').value.trim(),message:$('adminNoticeMessage').value.trim(),requiresAck:$('adminNoticeAck').checked,expiresAt:expiresRaw?new Date(expiresRaw).toISOString():null};
  try{const r=await api('adminSendNotification',data);note($('adminNoticeMsg'),'Admin oznámení odesláno · push '+r.sent+'/'+(r.devices||0)+'.','msg ok');$('adminNoticeTitle').value=$('adminNoticeMessage').value=$('adminNoticeExpires').value='';$('adminNoticeVehicle').value='';$('adminNoticeSeverity').value='info';$('adminNoticeAck').checked=false;updateAdminNoticeSeverity();await refresh()}catch(x){note($('adminNoticeMsg'),errorText(x),'msg err')}
};
if($('themeMode'))$('themeMode').onchange=()=>setThemePreference($('themeMode').value);
document.querySelectorAll('.pneu-tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
if($('addTireTaskRow'))$('addTireTaskRow').onclick=()=>{collectTireTaskDraftRows();if(tireTaskDraftRows.length>=6)return;tireTaskDraftRows.push(newTireTaskDraftRow());renderTireTaskDraft()};
if($('createTireTask'))$('createTireTask').onclick=async()=>{
  const date=$('tireTaskDate').value,rows=collectTireTaskDraftRows();
  const entries=rows.map(r=>({time:r.time,carId:r.carId,category:r.category,targetSeason:r.targetSeason}));
  if(!date)return note($('tireTaskCreateMsg'),'Vyber datum plánu.','msg err');
  if(!entries.length||entries.length>6)return note($('tireTaskCreateMsg'),'Plán musí obsahovat 1 až 6 vozidel.','msg err');
  const incomplete=entries.findIndex(r=>!r.carId||!r.category||!['summer','winter'].includes(r.targetSeason));
  if(incomplete>=0)return note($('tireTaskCreateMsg'),'Doplň vozidlo a skupinu u řádku '+(incomplete+1)+'.','msg err');
  const data={date,entries,assignedToUserId:$('tireTaskAssignee').value,instructions:$('tireTaskInstructions').value.trim()};
  try{
    const result=await api('tireTaskCreateBatch',data);
    tireTaskDraftRows=[newTireTaskDraftRow()];$('tireTaskInstructions').value='';$('tireTaskAssignee').value='';
    note($('tireTaskCreateMsg'),'✅ Denní plán byl vytvořen · '+result.count+' vozidel.','msg ok');
    tireTaskView=date===localDateISO()?'today':date===addDaysISO(localDateISO(),1)?'tomorrow':'week';
    await refresh();setTimeout(()=>$('tireTaskCreateMsg').innerHTML='',2200)
  }catch(x){note($('tireTaskCreateMsg'),errorText(x),'msg err')}
};
document.querySelectorAll('[data-tiretask-view]').forEach(b=>b.onclick=()=>{tireTaskView=b.dataset.tiretaskView;renderTireTask()});
if($('vehicleOverviewSearch'))$('vehicleOverviewSearch').oninput=renderVehicleOverview;
if($('vehicleOverviewCategory'))$('vehicleOverviewCategory').onchange=renderVehicleOverview;
if($('vehicleOverviewAddCar'))$('vehicleOverviewAddCar').onclick=async()=>{
  const plate=$('vehicleOverviewAddPlate').value.trim(),name=$('vehicleOverviewAddName').value.trim(),vin=$('vehicleOverviewAddVin').value.trim(),category=$('vehicleOverviewAddCategory').value;
  if(!plate||!category)return note($('vehicleOverviewAddMsg'),'Doplň SPZ a vyber kategorii vozidla.','msg err');
  try{await api('vehicleAdd',{plate,name,vin,category});$('vehicleOverviewAddPlate').value=$('vehicleOverviewAddName').value=$('vehicleOverviewAddVin').value='';$('vehicleOverviewAddCategory').value='';note($('vehicleOverviewAddMsg'),'Vozidlo bylo přidáno.','msg ok');await refresh()}catch(x){note($('vehicleOverviewAddMsg'),errorText(x),'msg err')}
};
if($('vehicleOverviewAddCategoryBtn'))$('vehicleOverviewAddCategoryBtn').onclick=async()=>{
  const category=$('vehicleOverviewNewCategory').value.trim();if(!category)return note($('vehicleOverviewCategoryMsg'),'Zadej název skupiny.','msg err');
  try{await api('vehicleCategoryAdd',{category});$('vehicleOverviewNewCategory').value='';note($('vehicleOverviewCategoryMsg'),'Skupina vozidel byla přidána.','msg ok');await refresh()}catch(x){note($('vehicleOverviewCategoryMsg'),errorText(x),'msg err')}
};
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
  if(!tok||document.visibilityState!=='visible'||D.transport?.enabled===false||(me?.role!=='admin'&&moduleCfg('transport').online===false))return;
  const mins=Math.max(3,Number(D.transport?.pollMinutes||5));
  if(Date.now()-lastTrafficLoad>=mins*60000)loadTrafficReport(false).catch(()=>{});
},60000);
setInterval(()=>{if(tok&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))refresh()},12000);
setInterval(heartbeat,45000);
applyTheme();if('serviceWorker'in navigator)ensureSW().catch(()=>{});
})();
