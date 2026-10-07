(()=>{
let tok='',me=null,D={cars:[],records:[]},season='',carSearch='',swReg=null,openVehicleDetail=null,lastInteraction=Date.now(),currentModule='home',settingsDevicesLoaded=false,tireTaskView='today',pendingTireTaskId=null,tireTaskDraftRows=[],tireTaskDraftSeq=0,editingCarId=null,notificationView='all',toastNotificationId=null,toastTimer=null,pinChangeState=null,pinResetAdminUserId=null,loginUsers=[],seasonDashboardCampaign='',globalFocusRecordId='',globalSearchTimer=null,globalSearchSeq=0,lastSyncVersion='',syncInFlight=false,adminStateLoadedAt=0,dataLoadedAt={},historyNextOffset=null,historyTotal=0,historyLoading=false,fleetDataKey='',taskProblemTaskId=null;
const $=x=>document.getElementById(x), e=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const ROLE_LABELS={admin:'Admin',dispatch:'Dispatch',driver:'Driver',technician:'Technician',test:'TEST'};
const MODULE_META={
  vehicleOverview:{label:'PŘEHLED VOZIDEL',icon:'🚗'},
  pneu:{label:'PNEU / DOT',icon:'🛞'},
  tiretask:{label:'TASK',icon:'📋'},
  notifications:{label:'OZNÁMENÍ',icon:'🔔'},
  settings:{label:'NASTAVENÍ',icon:'⚙️'},
};
const MODULE_KEYS=Object.keys(MODULE_META);
const PERMS=[['dotView','Vidět DOT údaje v přehledu aut'],['dotCreate','Zapisovat DOT'],['dotEdit','Upravovat DOT záznamy'],['dotDelete','Mazat DOT záznamy'],['fleetView','Vidět přehled aut'],['fleetExport','Exportovat přehled aut'],['historyView','Vidět historii'],['historyExport','Exportovat historii'],['vehicleDetail','Vidět detail vozidla (bez auditu)'],['vehicleAdd','Přidat vozidlo'],['vehicleCategoryAdd','Spravovat skupiny vozidel'],['attentionView','Vidět upozornění Vyžaduje pozornost'],['attentionEdit','Upravovat z Vyžaduje pozornost'],['tireTaskCreate','Vytvořit task'],['tireTaskEdit','Editovat task'],['notificationsReceive','Přijímat oznámení'],['notificationsSendOperational','Odesílat provozní oznámení']];
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
  if(!r.ok){
    const x=new Error(j.error);x.code=j.error;x.data=j;
    if(j.error==='MAINTENANCE'&&tok)setTimeout(()=>lockApp(j.message||'🔧 Probíhá technická údržba\nAplikace je dočasně pozastavena administrátorem.\nZkuste to prosím později.','msg warn'),0);
    if(j.error==='MODULE_OFFLINE'&&tok)setTimeout(()=>showModuleBlocked(j.module,j.message),0);
    if(j.error==='PIN_CHANGE_REQUIRED'&&tok&&action!=='changeOwnPin')setTimeout(()=>showPinChangeScreen({required:true,requireOldPin:j.requireOldPin!==false}),0);
    throw x
  }
  return j;
}
function note(el,t,c='msg'){el.innerHTML='<div class="'+c+'">'+e(t)+'</div>'}
function dt(x){return x?new Intl.DateTimeFormat('cs-CZ',{dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—'}
function csvCell(v){return '"'+String(v??'').replaceAll('"','""')+'"'}
function downloadBlob(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function errorText(x){if(x?.data?.message)return x.data.message;return({DUPLICATE:'SPZ už existuje.',PIN_USED:'PIN už používá někdo jiný.',PIN:'PIN musí mít 4 číslice.',PIN_OLD:'Stávající PIN není správný.',PIN_MATCH:'Nové PINy se neshodují.',PIN_SAME:'Nový PIN musí být jiný než stávající PIN.',PIN_CHANGE_REQUIRED:'Je nutné změnit PIN.',PIN_SELF_SERVICE:'PIN uživatele mění pouze uživatel přes výzvu ke změně.',PIN_RESET_NOT_AVAILABLE:'Reset bez starého PINu není pro tento účet povolen.',PIN_RESET_ONLY:'Tento přístup slouží pouze ke změně PINu.',DOT:'Neplatný DOT.',MILEAGE:'Neplatný stav kilometrů.',CAR:'Auto nebylo nalezeno.',USER:'Uživatel nebyl nalezen.',MESSAGE:'Doplň nadpis i text oznámení.',VEHICLE_CATEGORY:'Vyber platnou kategorii vozidla.',VEHICLE_CATEGORY_DUPLICATE:'Tato kategorie už existuje.',VEHICLE_CATEGORY_IN_USE:'Kategorii používají vozidla nebo aktivní TASKy. Nejdřív je přesuň do jiné kategorie.',READ_ONLY:'Aplikace je momentálně pouze pro čtení.',MAINTENANCE:'Probíhá technická údržba.',SYSTEM_MODE:'Neplatný provozní režim.',MODULE_OFFLINE:'Modul je dočasně offline.',TIRETASK:'Úkol TASK nebyl nalezen.',TIRETASK_DATE:'Zadej platné datum.',TIRETASK_TIME:'Zadej platný čas.',TIRETASK_STATUS:'Neplatný stav úkolu.',TIRETASK_CLOSED:'Uzavřený úkol už nelze měnit.',TIRETASK_NOT_COMPLETED:'Úkol lze uzavřít až po dokončení PNEU/DOT zápisu.',TIRETASK_COMPLETED:'Hotový úkol už lze pouze okomentovat nebo uzavřít.'})[x.code]||'Operace se nepodařila.'}

function lockApp(message='',cls='msg'){
  const lastUserId=me?.id||$('loginUser')?.value||localStorage.getItem('lastLoginUserId')||'';
  if(lastUserId)localStorage.setItem('lastLoginUserId',lastUserId);
  tok='';me=null;D={cars:[],records:[]};openVehicleDetail=null;currentModule='home';settingsDevicesLoaded=false;notificationView='all';toastNotificationId=null;pinChangeState=null;pinResetAdminUserId=null;lastSyncVersion='';syncInFlight=false;adminStateLoadedAt=0;dataLoadedAt={};historyNextOffset=null;historyTotal=0;historyLoading=false;fleetDataKey='';if(toastTimer)clearTimeout(toastTimer);toastTimer=null;
  $('noticeOverlay').hidden=true;$('issueEditOverlay').hidden=true;$('pinAdminResetOverlay').hidden=true;$('pinChangeScreen').hidden=true;$('systemBanner').hidden=true;$('main').hidden=true;$('login').hidden=false;$('loginMsg').innerHTML='';
  if(message)note($('loginMsg'),message,cls);loadLoginUsers().finally(()=>$('pin').focus());
}
async function loadLoginUsers(){
  if(!$('loginUser'))return;
  try{
    const r=await api('loginUsers');loginUsers=r.users||[];
    const selected=localStorage.getItem('lastLoginUserId')||'';
    $('loginUser').innerHTML='<option value="">Vyber uživatele…</option>'+loginUsers.map(u=>'<option value="'+e(u.id)+'">'+e(u.name)+'</option>').join('');
    if(loginUsers.some(u=>u.id===selected))$('loginUser').value=selected;
    updateLoginResetOption();
  }catch{$('loginUser').innerHTML='<option value="">Uživatele se nepodařilo načíst</option>';updateLoginResetOption()}
}
function updateLoginResetOption(){
  const u=loginUsers.find(x=>x.id===$('loginUser')?.value);
  if($('loginResetWithoutOld'))$('loginResetWithoutOld').hidden=!u?.resetWithoutOldPin;
  if($('loginResetHint'))$('loginResetHint').hidden=!u?.resetWithoutOldPin;
}
async function beginResetWithoutOldPin(){
  const userId=$('loginUser').value;
  if(!userId)return note($('loginMsg'),'Vyber svůj účet.','msg err');
  $('loginResetWithoutOld').disabled=true;
  try{
    const r=await api('beginPinReset',{userId});
    tok=r.token;me=r.user;localStorage.setItem('lastLoginUserId',userId);lastInteraction=Date.now();
    $('pin').value='';showPinChangeScreen(r.pinChangeRequired||{required:true,requireOldPin:false});
  }catch(x){note($('loginMsg'),errorText(x),'msg err')}
  finally{$('loginResetWithoutOld').disabled=false}
}
async function login(){
  const userId=$('loginUser').value,p=$('pin').value.replace(/\D/g,'').slice(0,4);$('pin').value=p;
  if(!userId)return note($('loginMsg'),'Vyber svůj účet.','msg err');
  if(p.length!==4)return note($('loginMsg'),'Kód má 4 číslice.','msg err');
  try{
    const r=await api('login',{userId,pin:p});tok=r.token;me=r.user;localStorage.setItem('lastLoginUserId',userId);lastInteraction=Date.now();$('login').hidden=true;$('pin').value='';
    if(r.pinChangeRequired?.required){showPinChangeScreen(r.pinChangeRequired);return}
    $('main').hidden=false;
    await refresh();await heartbeat();await updatePushStatus();
    if(!matchMedia('(display-mode: standalone)').matches&&/iPhone|iPad|iPod/.test(navigator.userAgent))$('install').hidden=false;
    const qs=new URLSearchParams(location.search),tab=qs.get('tab'),mod=qs.get('module'),taskId=qs.get('task');
    if(tab==='admin')openModule('admin');
    else if(['entry','season','fleet','history'].includes(tab)){openModule('pneu');showTab(tab)}
    else if(['vehicleOverview','pneu','tiretask','notifications','settings','admin'].includes(mod))openModule(mod);
    else openModule('home');
    if(mod==='tiretask'&&taskId)openSpecificTask(taskId);
  }catch(x){
    const remaining=x.data?.attemptsRemaining;
    const msg=x.code==='ACCOUNT_LOCKED'?(x.data?.message||'Účet je zablokovaný. Kontaktuj administrátora.'):
      x.code==='LOCKED'?'Přihlášení Admina je na 10 minut pozastavené.':
      x.code==='BAD_PIN'?'Špatný PIN.'+(Number.isFinite(remaining)?' Zbývá '+remaining+' '+(remaining===1?'pokus.':'pokusy.'):''):
      x.code==='MAINTENANCE'?errorText(x):errorText(x);
    note($('loginMsg'),msg,(x.code==='MAINTENANCE'||x.code==='ACCOUNT_LOCKED')?'msg warn':'msg err');
  }
}
function showPinChangeScreen(reset){
  const next=reset||{required:true,requireOldPin:true},wasVisible=!$('pinChangeScreen').hidden;
  pinChangeState=next;
  $('main').hidden=true;$('login').hidden=true;$('pinChangeScreen').hidden=false;
  if(wasVisible)return;
  $('pinChangeMsg').innerHTML='';
  $('pinChangeOldWrap').hidden=!pinChangeState.requireOldPin;
  $('pinChangeOld').value=$('pinChangeNew').value=$('pinChangeConfirm').value='';
  $('pinChangeRequirement').textContent=pinChangeState.requireOldPin?'Zadej svůj stávající PIN a potom dvakrát nový PIN.':'Admin nevyžaduje opětovné zadání stávajícího PINu. Zadej dvakrát nový PIN.';
  setTimeout(()=>$(pinChangeState.requireOldPin?'pinChangeOld':'pinChangeNew').focus(),50);
}
async function submitOwnPinChange(){
  const oldPin=$('pinChangeOld').value.replace(/\D/g,'').slice(0,4),newPin=$('pinChangeNew').value.replace(/\D/g,'').slice(0,4),confirmPin=$('pinChangeConfirm').value.replace(/\D/g,'').slice(0,4);
  $('pinChangeOld').value=oldPin;$('pinChangeNew').value=newPin;$('pinChangeConfirm').value=confirmPin;
  if(pinChangeState?.requireOldPin&&oldPin.length!==4)return note($('pinChangeMsg'),'Zadej stávající čtyřmístný PIN.','msg err');
  if(newPin.length!==4)return note($('pinChangeMsg'),'Nový PIN musí mít 4 číslice.','msg err');
  if(newPin!==confirmPin)return note($('pinChangeMsg'),'Nové PINy se neshodují.','msg err');
  $('pinChangeSubmit').disabled=true;
  try{
    const r=await api('changeOwnPin',{oldPin,newPin,confirmPin});
    if(r.token)tok=r.token;
    if(r.user)me=r.user;
    pinChangeState=null;$('pinChangeScreen').hidden=true;$('main').hidden=false;
    await refresh();
    await heartbeat();
    await updatePushStatus();
    openModule('home');
    $('pin').value='';
  }catch(x){note($('pinChangeMsg'),errorText(x),'msg err')}
  finally{$('pinChangeSubmit').disabled=false}
}
$('pinChangeSubmit').onclick=submitOwnPinChange;
$('pinChangeLogout').onclick=()=>lockApp();
$('pinChangeConfirm').onkeydown=x=>{if(x.key==='Enter')submitOwnPinChange()};
$('loginUser').onchange=()=>{if($('loginUser').value)localStorage.setItem('lastLoginUserId',$('loginUser').value);updateLoginResetOption();$('loginMsg').innerHTML=''};
$('loginResetWithoutOld').onclick=beginResetWithoutOldPin;
$('loginBtn').onclick=login;$('pin').onkeydown=x=>{if(x.key==='Enter')login()};
$('lock').onclick=()=>lockApp();
async function refresh(){
  try{
    const fresh=await api('state');
    D={...D,...fresh};if(D.me)me=D.me;lastSyncVersion=D.syncVersion||lastSyncVersion;render();
    await loadCurrentModuleData(true);
  }
  catch(x){
    if(x.code==='AUTH')lockApp();
    else if(x.code==='MAINTENANCE')lockApp(errorText(x),'msg warn');
    else if(x.code==='PIN_CHANGE_REQUIRED')showPinChangeScreen({required:true,requireOldPin:x.data?.requireOldPin!==false});
    else throw x;
  }
}

async function syncCheck(force=false){
  if(!tok||syncInFlight||(!force&&document.visibilityState!=='visible'))return;
  syncInFlight=true;
  try{
    const r=await api('sync',{since:lastSyncVersion});
    if(r.version)lastSyncVersion=r.version;
    if(r.changed)await refresh();
  }catch(x){if(x.code==='AUTH')lockApp()}
  finally{syncInFlight=false}
}
async function loadAdminState(force=false){
  if(me?.role!=='admin')return;
  if(!force&&D.adminLoaded&&Date.now()-adminStateLoadedAt<30000){renderAdmin();return}
  const r=await api('adminState');Object.assign(D,r);D.adminLoaded=true;adminStateLoadedAt=Date.now();renderAdmin();
}
function dataFresh(key,maxAge=20000){return !!dataLoadedAt[key]&&Date.now()-dataLoadedAt[key]<maxAge}
async function loadVehicleOverviewData(force=false){
  if(!force&&dataFresh('vehicleOverview'))return;
  const r=await api('vehicleOverviewData');Object.assign(D,r);dataLoadedAt.vehicleOverview=Date.now();renderVehicleOverview();
}
async function loadPneuData(force=false){
  if(!force&&dataFresh('pneu'))return;
  const r=await api('pneuData');Object.assign(D,r);dataLoadedAt.pneu=Date.now();
  renderCarOptions($('car')?.value||'');renderSeasonDashboard();if(me?.role!=='admin')renderAttention();
}
function fleetFilters(){return {season:$('fleetSeason')?.value||'',userId:$('fleetUser')?.value||'',from:$('fleetFrom')?.value||'',to:$('fleetTo')?.value||''}}
async function loadFleetData(force=false){
  const filters=fleetFilters(),key=JSON.stringify(filters);
  if(!force&&fleetDataKey===key&&dataFresh('fleet'))return;
  const r=await api('fleetData',filters);D.fleetRows=r.rows||[];D.fleetUsers=r.users||[];D.fleetTotalActive=Number(r.totalActive)||0;fleetDataKey=key;dataLoadedAt.fleet=Date.now();renderFleet();
}
async function loadTaskData(force=false){
  if(!force&&dataFresh('tiretask'))return;
  const r=await api('taskData');Object.assign(D,r);dataLoadedAt.tiretask=Date.now();
  D.myTaskSummary=(D.tireTasks||[]).filter((t)=>t.assignedToUserId===me?.id&&t.status!=='closed').slice(0,8);
  renderTireTask();renderHomePulse();renderHomeAssignedTasks();
}
async function loadNotificationData(force=false){
  if(!force&&dataFresh('notifications'))return;
  const r=await api('notificationData');Object.assign(D,r);dataLoadedAt.notifications=Date.now();renderNotifications();renderNotificationSettings();
}
function historyFilters(){return {season:$('histSeason')?.value||'',userId:$('histUser')?.value||'',from:$('histFrom')?.value||'',to:$('histTo')?.value||''}}
async function loadHistoryPage(reset=true,focusRecordId=''){
  if(historyLoading)return;historyLoading=true;
  try{
    const offset=reset?0:(historyNextOffset||0),r=await api('historyPage',{...historyFilters(),offset,limit:100,focusRecordId});
    D.historyRecords=reset?(r.records||[]):[...(D.historyRecords||[]),...(r.records||[]).filter(x=>!(D.historyRecords||[]).some(y=>y.id===x.id))];
    D.recordUsers=r.users||D.recordUsers||[];historyTotal=Number(r.total)||0;historyNextOffset=r.nextOffset;renderHist();
  }finally{historyLoading=false}
}
async function loadCurrentModuleData(force=false){
  try{
    if(currentModule==='vehicleOverview')await loadVehicleOverviewData(force);
    else if(currentModule==='pneu'){
      await loadPneuData(force);
      const tab=document.querySelector('#pneu .panel.active')?.id;
      if(tab==='fleet'&&can('fleetView'))await loadFleetData(force);
      if(tab==='history'&&can('historyView'))await loadHistoryPage(true,globalFocusRecordId||'');
    }else if(currentModule==='tiretask')await loadTaskData(force);
    else if(currentModule==='notifications')await loadNotificationData(force);
    else if(currentModule==='admin'&&me?.role==='admin')await loadAdminState(force);
  }catch(x){if(x.code==='AUTH')lockApp();else console.error(x)}
}
function latest(id,s){return (D.records||[]).find(r=>r.carId===id&&(!s||r.season===s))}
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
    note($('saveMsg'),r.tireTaskCompleted?'✅ Uloženo. Navázaný TASK je HOTOVO.':'✅ Uloženo a sdíleno online.','msg ok');
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
  const channel=n?.channel||'automatic',severity=n?.severity||'info',role=n?.byUserRole||'';
  if(channel==='admin'){
    const priority=severity==='critical'?'KRITICKÉ':severity==='important'?'DŮLEŽITÉ':'';
    return {icon:'🚨',label:'ADMIN',priority,cls:'source-admin severity-'+severity};
  }
  if(channel==='operational'){
    const roleLabel=role==='dispatch'?'DISPATCH':role==='technician'?'TECHNIK':role==='driver'?'DRIVER':role==='test'?'TEST':'PROVOZNÍ';
    return {icon:'🔵',label:roleLabel,priority:severity==='important'?'DŮLEŽITÉ':'',cls:'source-operational severity-'+severity};
  }
  return {icon:'ℹ️',label:'AUTOMATICKÉ',priority:severity==='important'?'DŮLEŽITÉ':'',cls:'source-automatic severity-'+severity};
}
function notificationKindHtml(m){
  return '<span class="notification-source">'+m.icon+' '+e(m.label)+'</span>'+(m.priority?'<span class="notification-priority">'+e(m.priority)+'</span>':'');
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
    const taskAction=n.taskId?'<button class="notification-task secondary" data-task="'+e(n.taskId)+'">📋 Otevřít TASK</button>':'';
    const ackActions=pending?'<button class="notification-ack primary" data-id="'+e(n.id)+'">✅ Rozumím</button>'+(n.carId?'<button class="notification-vehicle secondary" data-id="'+e(n.id)+'">🚗 Vozidlo</button>':''):'';
    return '<div class="notification-card '+m.cls+' '+(!n.read?'unread':'')+'" data-notification-id="'+e(n.id)+'">'+
      '<div class="notification-head"><div><div class="notification-kind">'+notificationKindHtml(m)+'</div><h3>'+e(n.title||'Oznámení')+'</h3></div>'+(!n.read&&!n.expired?'<span class="notification-unread-dot"></span>':'')+'</div>'+
      '<div class="notification-body">'+e(n.body||'')+'</div>'+
      '<div class="notification-meta">'+dt(n.createdAt)+(n.byUserName?' · '+e(n.byUserName):'')+(n.carPlate?' · '+e(n.carPlate):'')+notificationExpiresText(n)+(n.expired?' · UKONČENO':'')+'</div>'+
      ((ackActions||taskAction)?'<div class="toolbar" style="margin-top:10px">'+ackActions+taskAction+'</div>':n.acknowledgedAt?'<div class="notification-confirmed">✓ Potvrzeno '+dt(n.acknowledgedAt)+'</div>':'')+
      '</div>';
  }).join('')||'<div class="card"><div class="small">V této části zatím nejsou žádná oznámení.</div></div>';
  document.querySelectorAll('.notification-ack').forEach(b=>b.onclick=()=>{const n=(D.notificationInbox||[]).find(x=>x.id===b.dataset.id);if(n)respondNotification(n,'understood')});
  document.querySelectorAll('.notification-vehicle').forEach(b=>b.onclick=()=>{const n=(D.notificationInbox||[]).find(x=>x.id===b.dataset.id);if(n)respondNotification(n,'view_vehicle')});
  document.querySelectorAll('.notification-task').forEach(b=>b.onclick=()=>openSpecificTask(b.dataset.task));
}
function renderNotificationToast(){
  const box=$('notificationToast'),n=(D.toastNotifications||[])[0];
  if(!box)return;
  if(!n){box.hidden=true;toastNotificationId=null;return}
  if(toastNotificationId===n.id)return;
  toastNotificationId=n.id;const m=notificationUiMeta(n);
  box.className='notification-toast '+m.cls;
  box.innerHTML='<button id="notificationToastClose" class="notification-toast-close" aria-label="Zavřít">×</button><div class="notification-kind">'+notificationKindHtml(m)+'</div><b>'+e(n.title||'Oznámení')+'</b><div>'+e(n.body||'')+'</div><div class="small">'+dt(n.createdAt)+(n.byUserName?' · '+e(n.byUserName):'')+'</div>'+(n.taskId?'<button id="notificationToastTask" class="secondary" style="width:100%;margin-top:9px">📋 Otevřít TASK</button>':'');
  box.hidden=false;
  api('notificationSeen',{notificationId:n.id}).catch(()=>{});
  const close=()=>{if(toastTimer)clearTimeout(toastTimer);toastTimer=null;box.hidden=true;toastNotificationId=null;refresh()};
  $('notificationToastClose').onclick=close;
  if($('notificationToastTask'))$('notificationToastTask').onclick=()=>{const id=n.taskId;close();openSpecificTask(id)};
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
    ov.hidden=false;box.className='modal-card';box.innerHTML=vehicleDetailHtml(openVehicleDetail);
    $('closeVehicleDetail').onclick=async()=>{openVehicleDetail=null;await refresh()};
    return;
  }
  const n=pendingNotifications()[0];
  if(!n){ov.hidden=true;box.className='modal-card';box.innerHTML='';return}
  ov.hidden=false;const m=notificationUiMeta(n);
  box.className='modal-card notification-modal '+m.cls;
  box.innerHTML='<div class="notification-kind">'+notificationKindHtml(m)+'</div><h2>'+e(n.title)+'</h2><div class="sub">'+dt(n.createdAt)+(n.byUserName?' · '+e(n.byUserName):'')+(n.carPlate?' · '+e(n.carPlate):'')+notificationExpiresText(n)+'</div>'+
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
function seasonCampaignKey(seasonValue,dateValue){
  const raw=String(dateValue||'').slice(0,10),m=raw.match(/^(\d{4})-(\d{2})/);
  if(!m)return '';
  const year=Number(m[1]),month=Number(m[2]),campaignYear=seasonValue==='winter'?(month>=7?year:year-1):year;
  return seasonValue+':'+campaignYear;
}
function currentSeasonCampaignKey(){
  const today=localDateISO(),year=Number(today.slice(0,4)),month=Number(today.slice(5,7));
  return (month>=10||month<=3)?'winter:'+(month<=3?year-1:year):'summer:'+year;
}
function seasonCampaignLabel(key){
  const [s,yRaw]=String(key||'').split(':'),y=Number(yRaw);
  return s==='winter'?'❄️ Zima '+y+'/'+String(y+1).slice(-2):'☀️ Léto '+y;
}
function seasonCampaignSortValue(key){
  const [s,yRaw]=String(key||'').split(':'),y=Number(yRaw)||0;
  return y*12+(s==='winter'?10:4);
}
function seasonCampaignOptions(){
  const currentYear=Number(localDateISO().slice(0,4)),keys=new Set();
  for(let y=currentYear-3;y<=currentYear+1;y++){keys.add('summer:'+y);keys.add('winter:'+y)}
  (D.seasonRecords||[]).forEach(r=>keys.add(r.season+':'+r.campaignYear));
  (D.pneuTasks||[]).forEach(t=>{const k=seasonCampaignKey(t.targetSeason,t.date);if(k)keys.add(k)});
  return [...keys].sort((a,b)=>seasonCampaignSortValue(b)-seasonCampaignSortValue(a));
}
function seasonTaskForCar(carId,seasonValue,campaignYear){
  return (D.pneuTasks||[]).filter(t=>t.carId===carId&&t.targetSeason===seasonValue&&seasonCampaignKey(t.targetSeason,t.date)===seasonValue+':'+campaignYear)
    .sort((a,b)=>(String(a.date||'')+'T'+String(a.time||'23:59')).localeCompare(String(b.date||'')+'T'+String(b.time||'23:59')))[0]||null;
}
function seasonRowForCar(car,key){
  const [seasonValue,yRaw]=String(key||'').split(':'),campaignYear=Number(yRaw);
  const record=(D.seasonRecords||[]).find(r=>r.carId===car.id&&r.season===seasonValue&&Number(r.campaignYear)===campaignYear)||null;
  const task=seasonTaskForCar(car.id,seasonValue,campaignYear);
  let status='waiting';
  if(record)status='done';
  else if(task?.status==='problem')status='problem';
  else if(task)status='scheduled';
  return {car,season:seasonValue,campaignYear,record,task,status};
}
function seasonStatusMeta(status){
  return status==='done'?{icon:'✅',label:'PŘEZUTO',cls:'done'}:
    status==='scheduled'?{icon:'📋',label:'NAPLÁNOVÁNO',cls:'scheduled'}:
    status==='problem'?{icon:'⚠️',label:'PROBLÉM',cls:'problem'}:
    {icon:'⏳',label:'BEZ TERMÍNU',cls:'waiting'};
}
function seasonShortDate(v){
  if(!v)return '—';
  const d=new Date(String(v).length===10?v+'T12:00:00':v);
  return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('cs-CZ',{day:'numeric',month:'numeric',year:'numeric'}).format(d);
}
function canPlanSeasonTask(){
  return can('tireTaskCreate')&&moduleCfg('tiretask').online!==false&&moduleCfg('tiretask').visible!==false;
}
function planSeasonVehicle(carId,seasonValue){
  const car=(D.cars||[]).find(c=>c.id===carId);if(!car)return;
  tireTaskDraftRows=[newTireTaskDraftRow({carId:car.id,category:car.category||'',targetSeason:seasonValue})];
  openModule('tiretask');
  if($('tireTaskDate'))$('tireTaskDate').value=localDateISO();
  renderTireTask();
  window.scrollTo({top:0,behavior:'smooth'});
}
function openSeasonPneuEntry(carId,seasonValue,taskId=''){
  const linked=(D.tireTasks||D.pneuTasks||[]).find(t=>t.id===taskId);
  if(linked)return openPneuFromTireTask(linked.id);
  pendingTireTaskId=null;openModule('pneu');showTab('entry',false);
  carSearch='';$('carSearch').value='';if($('carCategory'))$('carCategory').value='';
  renderCarOptions(carId);$('car').value=carId;rememberCar(carId);prefillMileage(carId);setSeason(seasonValue);valid();
}
function renderSeasonDashboard(){
  if(!$('seasonList'))return;
  const options=seasonCampaignOptions();
  if(!seasonDashboardCampaign||!options.includes(seasonDashboardCampaign))seasonDashboardCampaign=currentSeasonCampaignKey();
  const campaignSelect=$('seasonCampaign'),selectedBefore=campaignSelect.value||seasonDashboardCampaign;
  campaignSelect.innerHTML=options.map(k=>'<option value="'+e(k)+'">'+e(seasonCampaignLabel(k))+'</option>').join('');
  seasonDashboardCampaign=options.includes(selectedBefore)?selectedBefore:seasonDashboardCampaign;
  campaignSelect.value=seasonDashboardCampaign;

  const categorySelect=$('seasonCategory'),categoryBefore=categorySelect.value;
  categorySelect.innerHTML='<option value="">Všechny skupiny</option>'+(D.vehicleCategories||[]).map(x=>'<option value="'+e(x)+'">'+e(x)+'</option>').join('');
  if((D.vehicleCategories||[]).includes(categoryBefore))categorySelect.value=categoryBefore;

  const [seasonValue,yRaw]=seasonDashboardCampaign.split(':'),campaignYear=Number(yRaw);
  const allRows=(D.cars||[]).map(c=>seasonRowForCar(c,seasonDashboardCampaign));
  const totals={done:0,scheduled:0,waiting:0,problem:0};allRows.forEach(r=>totals[r.status]++);
  const total=allRows.length,donePct=total?Math.round(totals.done/total*100):0;
  $('seasonHeadline').innerHTML='<div><b>'+e(seasonCampaignLabel(seasonDashboardCampaign))+'</b><span>'+totals.done+' / '+total+' vozidel přezuto</span></div><strong>'+donePct+' %</strong>';
  $('seasonProgressBar').style.width=donePct+'%';
  $('seasonStats').innerHTML=[
    ['✅','Přezuto',totals.done,'done'],['📋','Naplánováno',totals.scheduled,'scheduled'],['⏳','Bez termínu',totals.waiting,'waiting'],['⚠️','Problém',totals.problem,'problem']
  ].map(([i,l,n,c])=>'<button class="season-stat '+c+'" data-season-status="'+c+'"><span>'+i+' '+l+'</span><b>'+n+'</b></button>').join('');

  const groups=[...(D.vehicleCategories||[])].map(cat=>{
    const rows=allRows.filter(r=>r.car.category===cat),done=rows.filter(r=>r.status==='done').length,pct=rows.length?Math.round(done/rows.length*100):0;
    return {cat,total:rows.length,done,pct};
  }).filter(g=>g.total).sort((a,b)=>a.cat.localeCompare(b.cat,'cs'));
  $('seasonGroups').innerHTML=groups.map(g=>'<button class="season-group" data-season-category="'+e(g.cat)+'"><div class="top"><b>'+e(g.cat)+'</b><span>'+g.done+' / '+g.total+' · '+g.pct+' %</span></div><div class="season-mini-progress"><span style="width:'+g.pct+'%"></span></div></button>').join('')||'<div class="small">Žádné skupiny vozidel.</div>';

  const q=$('seasonSearch').value.trim().toLocaleUpperCase('cs-CZ'),category=$('seasonCategory').value,status=$('seasonStatus').value;
  const filtered=allRows.filter(r=>{
    const hay=[r.car.plate,r.car.name,r.car.vin,r.car.category].join(' ').toLocaleUpperCase('cs-CZ');
    return(!q||hay.includes(q))&&(!category||r.car.category===category)&&(!status||r.status===status);
  }).sort((a,b)=>{
    const order={problem:0,waiting:1,scheduled:2,done:3},d=(order[a.status]??9)-(order[b.status]??9);
    if(d)return d;
    return String(a.car.plate).localeCompare(String(b.car.plate),'cs');
  });
  $('seasonCount').textContent='Zobrazeno '+filtered.length+' z '+total+' vozidel';
  const currentCampaign=seasonDashboardCampaign===currentSeasonCampaignKey();
  $('seasonList').innerHTML=filtered.map(r=>{
    const m=seasonStatusMeta(r.status),task=r.task,record=r.record;
    let detail='';
    if(record)detail='DOT <b>'+e(dotLabel(record))+'</b> · '+Number(record.mileage||0).toLocaleString('cs-CZ')+' km · zapsáno '+seasonShortDate(record.createdAt);
    else if(task)detail=(task.date?seasonShortDate(task.date):'Bez data')+' · '+(task.time?e(task.time):'CELÝ DEN')+(task.status==='in_progress'?' · rozpracováno':task.status==='problem'?' · '+e(task.problemNote||'problém'):'');
    else detail='V této sezóně zatím bez DOT záznamu a bez TASKu.';
    let actions='';
    if(currentCampaign&&can('dotCreate'))actions+='<button class="season-dot primary" data-car="'+e(r.car.id)+'" data-season="'+e(seasonValue)+'" data-task="'+e(task?.id||'')+'">🛞 Zapsat PNEU/DOT</button>';
    if(currentCampaign&&r.status==='waiting'&&canPlanSeasonTask())actions+='<button class="season-plan secondary" data-car="'+e(r.car.id)+'" data-season="'+e(seasonValue)+'">＋ Naplánovat přezutí</button>';
    return '<div class="season-vehicle '+m.cls+'"><div class="season-vehicle-head"><div><b>'+e(r.car.plate)+'</b> · '+e(r.car.name||'')+'<div class="small">'+e(r.car.category||'BEZ SKUPINY')+'</div></div><span class="season-status '+m.cls+'">'+m.icon+' '+m.label+'</span></div><div class="season-vehicle-detail">'+detail+'</div>'+(actions?'<div class="toolbar" style="margin-top:8px">'+actions+'</div>':'')+'</div>';
  }).join('')||'<div class="small">Filtru neodpovídá žádné vozidlo.</div>';

  document.querySelectorAll('.season-stat').forEach(b=>b.onclick=()=>{$('seasonStatus').value=$('seasonStatus').value===b.dataset.seasonStatus?'':b.dataset.seasonStatus;renderSeasonDashboard()});
  document.querySelectorAll('.season-group').forEach(b=>b.onclick=()=>{$('seasonCategory').value=b.dataset.seasonCategory;renderSeasonDashboard()});
  document.querySelectorAll('.season-plan').forEach(b=>b.onclick=()=>planSeasonVehicle(b.dataset.car,b.dataset.season));
  document.querySelectorAll('.season-dot').forEach(b=>b.onclick=()=>openSeasonPneuEntry(b.dataset.car,b.dataset.season,b.dataset.task));
}
function renderFleetUsers(){
  const current=$('fleetUser').value,users=D.fleetUsers||[];
  $('fleetUser').innerHTML='<option value="">Všichni uživatelé</option>'+users.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'cs')).map(u=>'<option value="'+e(u.id)+'">'+e(u.name)+'</option>').join('');
  if(users.some(u=>u.id===current))$('fleetUser').value=current;
}
function filteredFleetCars(){return D.fleetRows||[]}
function renderFleet(){
  renderFleetUsers();const cars=filteredFleetCars();let done=0,part=0,h='';
  for(const c of cars){
    const s=c.summer,w=c.winter;if(s&&w)done++;else if(s||w)part++;
    h+='<div class="item"><b>'+e(c.plate)+'</b> '+e(c.name)+'<div class="small">'+(c.latestMileage===null||c.latestMileage===undefined?'bez km':Number(c.latestMileage).toLocaleString('cs-CZ')+' km')+'</div><span class="chip '+(s?'good':'')+'">☀️ '+(s?e(dotLabel(s)):'chybí')+'</span><span class="chip '+(w?'good':'')+'">❄️ '+(w?e(dotLabel(w)):'chybí')+'</span>'+(can('vehicleDetail')?'<div class="toolbar" style="margin-top:7px"><button class="fleet-detail secondary" data-id="'+e(c.id)+'">Detail vozidla</button></div>':'')+'</div>';
  }
  $('fleetList').innerHTML=h||'<div class="small">'+(dataLoadedAt.fleet?'Filtru neodpovídá žádné auto.':'Data se načtou při otevření přehledu.')+'</div>';
  $('stats').textContent='Celkem '+cars.length+' · Hotovo '+done+' · Rozpracováno '+part;
  $('fleetCount').textContent='Zobrazeno '+cars.length+' z '+Number(D.fleetTotalActive??D.cars.length)+' aut';
  $('fleetExportCsv').disabled=cars.length===0||!can('fleetExport');$('fleetExportCsv').style.display=can('fleetExport')?'':'none';
  document.querySelectorAll('.fleet-detail').forEach(b=>b.onclick=()=>openVehicle(b.dataset.id));
}
['fleetFrom','fleetTo'].forEach(id=>$(id).oninput=()=>loadFleetData(true));
['fleetSeason','fleetUser'].forEach(id=>$(id).onchange=()=>loadFleetData(true));
$('clearFleetFilters').onclick=()=>{$('fleetSearch').value='';$('fleetSeason').value='';$('fleetUser').value='';$('fleetFrom').value='';$('fleetTo').value='';loadFleetData(true)};
$('fleetRefresh').onclick=()=>loadFleetData(true);
$('fleetExportCsv').onclick=()=>{const cars=filteredFleetCars();if(!cars.length)return alert('Filtru neodpovídá žádné auto.');const rows=[['SPZ','Vozidlo','Letní DOT','Zimní DOT','Kilometry'],...cars.map(c=>[c.plate,c.name,c.summer?dotLabel(c.summer):'',c.winter?dotLabel(c.winter):'',c.latestMileage??''])];downloadBlob('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8;','DOT-Auta-'+new Date().toISOString().slice(0,10)+'.csv')};

// History filters/edit/export
function renderHistoryUsers(){
  const current=$('histUser').value,users=D.recordUsers||[];
  $('histUser').innerHTML='<option value="">Všichni uživatelé</option>'+users.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'cs')).map(u=>'<option value="'+e(u.id)+'">'+e(u.name)+'</option>').join('');
  if(users.some(u=>u.id===current))$('histUser').value=current;
}
function filteredRecords(){return D.historyRecords||[]}
async function editRecord(path){
  const r=(D.historyRecords||D.records||[]).find(x=>x.path===path);if(!r)return;
  const plate=prompt('SPZ vozidla:',r.plate);if(plate===null)return;const car=(D.allCars||D.cars).find(c=>c.plate.toUpperCase()===plate.trim().replace(/\s+/g,'').toUpperCase());if(!car)return alert('Auto s touto SPZ nebylo nalezeno.');
  const sx=prompt('Sada: L = letní, Z = zimní',r.season==='summer'?'L':'Z');if(sx===null)return;const ns=/^z/i.test(sx)?'winter':/^l/i.test(sx)?'summer':null;if(!ns)return alert('Zadej L nebo Z.');
  const payload={path:r.path,carId:car.id,season:ns};
  if(r.dotFront&&r.dotRear){const front=prompt('Přední DOT (4 číslice):',r.dotFront);if(front===null)return;const rear=prompt('Zadní DOT (4 číslice):',r.dotRear);if(rear===null)return;payload.splitDot=true;payload.dotFront=String(front).replace(/\D/g,'');payload.dotRear=String(rear).replace(/\D/g,'')}
  else{const dot=prompt('DOT (4 číslice):',r.dot);if(dot===null)return;payload.splitDot=false;payload.dot=String(dot).replace(/\D/g,'')}
  const km=prompt('Kilometry:',String(r.mileage));if(km===null)return;payload.mileage=Number(String(km).replace(/\D/g,''));
  try{await api('editRecord',payload);await refresh()}catch(x){alert(errorText(x))}
}
function renderHist(){
  if(!$('histList'))return;renderHistoryUsers();const recs=filteredRecords();
  $('histCount').textContent='Zobrazeno '+recs.length+' z '+historyTotal+' záznamů';
  $('exportCsv').disabled=historyTotal===0||!can('historyExport');$('exportCsv').style.display=can('historyExport')?'':'none';
  $('histList').innerHTML=recs.map(r=>'<div class="item history-record" data-record-id="'+e(r.id||'')+'"><b>'+e(r.plate)+'</b> · '+(r.season==='summer'?'☀️ Letní':'❄️ Zimní')+' · DOT <b>'+e(dotLabel(r))+'</b><div class="small">'+Number(r.mileage).toLocaleString('cs-CZ')+' km · '+e(r.userName)+' · '+dt(r.createdAt)+'</div>'+((can('dotEdit')||can('dotDelete'))?'<div class="toolbar" style="margin-top:6px">'+(can('dotEdit')?'<button class="edit-record secondary" data-p="'+e(r.path)+'">Upravit</button>':'')+(can('dotDelete')?'<button class="danger-btn del" data-p="'+e(r.path)+'">Smazat</button>':'')+'</div>':'')+'</div>').join('')||'<div class="small">'+(historyLoading?'Načítám…':'Filtru neodpovídá žádný záznam.')+'</div>';
  if($('historyLoadMore'))$('historyLoadMore').hidden=historyNextOffset===null;
  if(can('dotEdit'))document.querySelectorAll('.edit-record').forEach(b=>b.onclick=()=>editRecord(b.dataset.p));
  if(can('dotDelete'))document.querySelectorAll('.del').forEach(b=>b.onclick=async()=>{if(confirm('Smazat tento záznam? Tato akce se zapíše do auditu.')){await api('deleteRecord',{path:b.dataset.p});await refresh()}});
}
$('refresh').onclick=()=>loadHistoryPage(true);
['histFrom','histTo'].forEach(id=>$(id).oninput=()=>loadHistoryPage(true));
['histSeason','histUser'].forEach(id=>$(id).onchange=()=>loadHistoryPage(true));
$('clearFilters').onclick=()=>{$('histSearch').value='';$('histSeason').value='';$('histUser').value='';$('histFrom').value='';$('histTo').value='';loadHistoryPage(true)};
$('exportCsv').onclick=async()=>{try{const r=await api('historyExportData',historyFilters()),recs=r.records||[];if(!recs.length)return alert('Filtru neodpovídá žádný záznam.');const rows=[['SPZ','Vozidlo','Sada','DOT','Kilometry','Uživatel','Datum a čas'],...recs.map(x=>[x.plate,x.vehicle,x.season==='summer'?'Letní':'Zimní',dotLabel(x),x.mileage,x.userName,dt(x.createdAt)])];downloadBlob('\uFEFF'+rows.map(x=>x.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8;','DOT-Evidence-'+new Date().toISOString().slice(0,10)+'.csv')}catch(x){alert(errorText(x))}};

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
      card.hidden=me?.role!=='admin'&&cfg.visible===false;
      card.classList.toggle('module-offline',cfg.online===false);
      card.title=cfg.online===false?(cfg.offlineMessage||'Modul je dočasně mimo provoz.'):'';
    });
  });
  if($('homeAdminCard'))$('homeAdminCard').hidden=me?.role!=='admin';
}
function renderHomePulse(){
  if(!$('homePulse'))return;
  const activeTasks=Number(D.taskSummary?.active??(D.tireTasks||[]).filter(t=>t.status!=='closed').length);
  const attention=Number(D.attentionIssueCount??(D.attentionIssues||[]).length);
  const unread=Number(D.notificationUnreadCount||0);
  const vehicles=(D.cars||[]).length;
  $('homePulse').innerHTML=[
    ['vehicleOverview','🚗',vehicles,'VOZIDEL',''],
    ['tiretask','📋',activeTasks,'AKTIVNÍ TASKY',''],
    ['attention','⚠️',attention,'POZORNOST',attention?'attention':''],
    ['notifications','🔔',unread,'NOVÁ OZNÁMENÍ',unread?'unread':'']
  ].map(([go,icon,n,label,cls])=>'<button class="home-pulse-item '+cls+'" data-home-pulse="'+go+'"><span>'+icon+' '+label+'</span><b>'+n+'</b></button>').join('');
  document.querySelectorAll('[data-home-pulse]').forEach(b=>b.onclick=()=>{
    const go=b.dataset.homePulse;
    if(go==='attention'){openModule('pneu');if(allowedTab('fleet'))showTab('fleet',false);return}
    openModule(go);
  });
}
function taskDateAddDays(iso,days){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';
  const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3])+days);return localDateISO(d);
}
function taskBucket(t){
  const today=localDateISO(),tomorrow=taskDateAddDays(today,1),date=String(t.date||'');
  if(date&&date<today)return 'overdue';
  if(date===today)return 'today';
  if(date===tomorrow)return 'tomorrow';
  return 'later';
}
function taskBucketMeta(key){return key==='overdue'?{label:'🔴 PO TERMÍNU',cls:'overdue'}:key==='today'?{label:'🟠 DNES',cls:'today'}:key==='tomorrow'?{label:'🔵 ZÍTRA',cls:'tomorrow'}:{label:'⚪ POZDĚJI',cls:'later'}}
function taskDateLabel(t){
  const b=taskBucket(t);if(b==='overdue')return 'Po termínu · '+seasonShortDate(t.date);if(b==='today')return 'Dnes';if(b==='tomorrow')return 'Zítra';return seasonShortDate(t.date);
}
function myTaskStatusMeta(t){
  return t.status==='in_progress'?{label:'PRÁVĚ DĚLÁŠ',icon:'🔵'}:
    t.status==='completed'?{label:'PNEU/DOT HOTOVO',icon:'🟢'}:
    t.status==='problem'?{label:'PROBLÉM',icon:'🔴'}:{label:'ČEKÁ NA ZPRACOVÁNÍ',icon:'⚪'};
}
function renderHomeAssignedTasks(){
  const card=$('homeMyTasks'),list=$('homeMyTasksList');if(!card||!list)return;
  const rows=(D.myTaskSummary||[]).filter((t)=>t.status!=='closed').slice().sort((a,b)=>(String(a.date||'')+'T'+String(a.time||'23:59')).localeCompare(String(b.date||'')+'T'+String(b.time||'23:59')));
  card.hidden=!rows.length;if(!rows.length)return;
  $('homeMyTasksCount').textContent=String(rows.length);
  list.innerHTML=rows.slice(0,4).map((t)=>{
    const sm=myTaskStatusMeta(t),season=t.targetSeason==='winter'?'❄️ Zimní':'☀️ Letní';
    return '<button class="home-task-row" data-home-task="'+e(t.id)+'"><span class="home-task-main"><span class="home-task-title">'+e(t.carPlate||'—')+' · '+season+'</span><span class="home-task-meta">'+e(taskDateLabel(t))+' · '+tireTaskTimeLabel(t)+(t.carName?' · '+e(t.carName):'')+'</span></span><span class="home-task-status">'+sm.icon+' '+sm.label+'</span></button>';
  }).join('')+(rows.length>4?'<div class="small" style="margin-top:7px">＋ další '+(rows.length-4)+' přiřazené TASKy</div>':'');
  document.querySelectorAll('[data-home-task]').forEach((b)=>b.onclick=()=>openSpecificTask(b.dataset.homeTask));
  if($('homeMyTasksOpen'))$('homeMyTasksOpen').onclick=()=>openModule('tiretask');
}
function clearTaskUrl(){
  const u=new URL(location.href);if(!u.searchParams.has('task'))return;
  u.searchParams.delete('task');history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams:'')+u.hash);
}
function openSpecificTask(id){
  if(!id)return;openModule('tiretask');
  loadTaskData(false).then(()=>{
    const esc=CSS.escape(id),el=document.querySelector('.my-task-card[data-my-task-id="'+esc+'"]')||document.querySelector('.tiretask-card[data-task-id="'+esc+'"]');
    if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('flash-focus');setTimeout(()=>el.classList.remove('flash-focus'),1900)}
    clearTaskUrl();
  }).catch(()=>{});
}
function hasPneuAccess(){return ['dotCreate','fleetView','historyView','attentionView'].some(can)}
function openModule(id){
  if(id==='admin'&&me?.role!=='admin')return;
  if(id==='pneu'&&!hasPneuAccess())return;
  if(MODULE_KEYS.includes(id)){
    const cfg=moduleCfg(id);
    if(cfg.online===false)return showModuleBlocked(id,cfg.offlineMessage);
    if(me?.role!=='admin'&&cfg.visible===false)return;
  }
  currentModule=id||'home';
  if($('moduleBlocked'))$('moduleBlocked').hidden=true;
  document.querySelectorAll('.module-screen').forEach(x=>x.classList.toggle('active',x.id===currentModule));
  if(currentModule==='pneu'){
    const active=document.querySelector('#pneu .panel.active')?.id;
    if(!active||!allowedTab(active)){const first=['entry','season','fleet','history'].find(allowedTab);if(first)showTab(first,false)}
  }
  if(currentModule==='vehicleOverview')loadVehicleOverviewData(false).catch(()=>{});
  if(currentModule==='pneu')loadCurrentModuleData(false).catch(()=>{});
  if(currentModule==='admin'&&me?.role==='admin')loadAdminState(false).catch(x=>alert(errorText(x)));
  if(currentModule==='vehicleOverview'||currentModule==='settings')renderModuleShell();
  if(currentModule==='tiretask')loadTaskData(false).catch(()=>{});
  if(currentModule==='notifications')loadNotificationData(false).catch(()=>{});
  if(currentModule==='settings'){updatePushStatus();loadMyPushDevices();renderNotificationSettings()}
}

function globalSearchGroup(title,rows){
  if(!rows.length)return '';
  return '<div class="global-search-group"><div class="global-search-group-title">'+e(title)+'</div>'+rows.join('')+'</div>';
}
function globalSearchButton(type,id,title,meta,icon){
  return '<button class="global-search-result" data-global-type="'+e(type)+'" data-global-id="'+e(id)+'"><span class="global-search-result-main"><span class="global-search-result-title">'+icon+' '+e(title)+'</span><span class="global-search-result-meta">'+e(meta||'')+'</span></span><span class="global-search-result-arrow">›</span></button>';
}
async function renderGlobalSearch(){
  if(!$('globalSearchResults'))return;
  const q=String($('globalSearchInput')?.value||'').trim(),seq=++globalSearchSeq;
  if(q.length<2){$('globalSearchResults').innerHTML='<div class="global-search-empty">Napiš alespoň 2 znaky.</div>';return}
  $('globalSearchResults').innerHTML='<div class="global-search-empty">Hledám…</div>';
  try{
    const r=await api('globalSearch',{q});if(seq!==globalSearchSeq)return;
    const vehicles=(r.vehicles||[]).map(v=>globalSearchButton('vehicle',v.id,v.plate||'Vozidlo',(v.name||'')+(v.category?' · '+v.category:''),'🚗'));
    const tasks=(r.tasks||[]).map(t=>globalSearchButton('task',t.id,(t.carPlate||'TASK')+' · '+(t.date||''),(t.carName||'')+' · '+tireTaskStatusMeta(t.status).label,'📋'));
    const records=(r.records||[]).map(x=>globalSearchButton('record',x.id,x.plate||'PNEU/DOT',(x.season==='winter'?'❄️ Zimní':'☀️ Letní')+' · DOT '+dotLabel(x)+' · '+Number(x.mileage||0).toLocaleString('cs-CZ')+' km','🛞'));
    const notifications=(r.notifications||[]).map(n=>globalSearchButton('notification',n.id,n.title||'Oznámení',(n.byUserName||'')+(n.carPlate?' · '+n.carPlate:''),'🔔'));
    $('globalSearchResults').innerHTML=globalSearchGroup('VOZIDLA',vehicles)+globalSearchGroup('TASKY',tasks)+globalSearchGroup('PNEU / DOT',records)+globalSearchGroup('OZNÁMENÍ',notifications)||'<div class="global-search-empty">Nic nenalezeno.</div>';
    document.querySelectorAll('.global-search-result').forEach(b=>b.onclick=()=>openGlobalSearchResult(b.dataset.globalType,b.dataset.globalId));
  }catch(x){if(seq===globalSearchSeq)$('globalSearchResults').innerHTML='<div class="global-search-empty">Hledání se nepodařilo.</div>'}
}
function openGlobalSearch(){
  if(!$('globalSearchOverlay'))return;
  $('globalSearchOverlay').hidden=false;$('globalSearchInput').value='';renderGlobalSearch();
  setTimeout(()=>$('globalSearchInput').focus(),50);
}
function closeGlobalSearch(){if($('globalSearchOverlay'))$('globalSearchOverlay').hidden=true;if(globalSearchTimer)clearTimeout(globalSearchTimer);globalSearchTimer=null}
function focusUi(selector){
  setTimeout(()=>{const el=document.querySelector(selector);if(!el)return;el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('flash-focus');setTimeout(()=>el.classList.remove('flash-focus'),1900)},80);
}
function openGlobalSearchResult(type,id){
  closeGlobalSearch();
  if(type==='vehicle'){
    if($('vehicleOverviewCategory'))$('vehicleOverviewCategory').value='';
    if(moduleCfg('vehicleOverview').online!==false&&(me?.role==='admin'||moduleCfg('vehicleOverview').visible!==false)){openModule('vehicleOverview');loadVehicleOverviewData(false).then(()=>focusUi('.vehicle-overview-card[data-car-id="'+CSS.escape(id)+'"]'))}
    else if(hasPneuAccess()){openModule('pneu');showTab('entry',false);renderCarOptions(id);$('car').value=id;prefillMileage(id);valid()}
    return;
  }
  if(type==='task'){openModule('tiretask');loadTaskData(false).then(()=>focusUi('.tiretask-card[data-task-id="'+CSS.escape(id)+'"]'));return}
  if(type==='record'){
    globalFocusRecordId=id;
    if($('histSeason'))$('histSeason').value='';if($('histUser'))$('histUser').value='';if($('histFrom'))$('histFrom').value='';if($('histTo'))$('histTo').value='';
    openModule('pneu');if(allowedTab('history')){showTab('history',false);loadHistoryPage(true,id).then(()=>focusUi('.history-record[data-record-id="'+CSS.escape(id)+'"]'))}
    return;
  }
  if(type==='notification'){notificationView='all';openModule('notifications');loadNotificationData(false).then(()=>focusUi('.notification-card[data-notification-id="'+CSS.escape(id)+'"]'))}
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
  return (D.tireTasks||[]).filter(t=>t.status!=='closed');
}
function newTireTaskDraftRow(seed={}){
  return {key:String(++tireTaskDraftSeq),time:seed.time||'',carId:seed.carId||'',category:seed.category||'',targetSeason:seed.targetSeason||'winter',search:seed.search||''};
}
function ensureTireTaskDraft(){if(!tireTaskDraftRows.length)tireTaskDraftRows=[newTireTaskDraftRow()]}
function tireTaskCategoryOptions(selected=''){
  return '<option value="">Vyber skupinu…</option>'+(D.vehicleCategories||[]).map(x=>'<option value="'+e(x)+'" '+(x===selected?'selected':'')+'>'+e(x)+'</option>').join('');
}
function tireTaskDraftCarOptions(row){
  const q=String(row.search||'').trim().toLocaleUpperCase('cs-CZ'),category=String(row.category||'');
  const cars=(D.cars||[]).filter(c=>(!category||c.category===category)&&(!q||[c.plate,c.name,c.vin,c.category].join(' ').toLocaleUpperCase('cs-CZ').includes(q)));
  const label=cars.length?'Vyber vozidlo…':category?'Ve skupině nejsou odpovídající vozidla':'Žádné vozidlo nenalezeno';
  return '<option value="">'+label+'</option>'+cars.map(c=>'<option value="'+e(c.id)+'" '+(c.id===row.carId?'selected':'')+'>'+e(c.plate)+' — '+e(c.name||'')+(c.category?' · '+e(c.category):'')+'</option>').join('');
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
    search.oninput=()=>{row.search=search.value;row.carId=carSel.value;carSel.innerHTML=tireTaskDraftCarOptions(row);if(row.carId&&[...carSel.options].some(o=>o.value===row.carId))carSel.value=row.carId;else row.carId=''};
    carSel.onchange=()=>{row.carId=carSel.value;const car=(D.cars||[]).find(c=>c.id===row.carId);if(car?.category&&(D.vehicleCategories||[]).includes(car.category)){row.category=car.category;catSel.value=car.category;carSel.innerHTML=tireTaskDraftCarOptions(row);carSel.value=row.carId}};
    el.querySelector('.tt-plan-time').onchange=x=>row.time=x.target.value;
    catSel.onchange=x=>{row.category=x.target.value;const selected=(D.cars||[]).find(c=>c.id===row.carId);if(selected&&row.category&&selected.category!==row.category)row.carId='';carSel.innerHTML=tireTaskDraftCarOptions(row);if(row.carId)carSel.value=row.carId};
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
  const rows=(D.tireTasks||[]).filter((t)=>t.assignedToUserId===me?.id&&t.status!=='closed').slice().sort((a,b)=>(String(a.date||'')+'T'+String(a.time||'23:59')).localeCompare(String(b.date||'')+'T'+String(b.time||'23:59')));
  $('tireTaskMineCard').hidden=!rows.length;$('tireTaskMineCount').textContent=String(rows.length);
  if(!rows.length){$('tireTaskMineList').innerHTML='';return}
  const groups={overdue:[],today:[],tomorrow:[],later:[]};rows.forEach((t,index)=>groups[taskBucket(t)].push({t,index}));
  $('tireTaskMineList').innerHTML=['overdue','today','tomorrow','later'].map((key)=>{
    if(!groups[key].length)return '';const gm=taskBucketMeta(key);
    return '<section class="my-task-group '+gm.cls+'"><div class="my-task-group-title">'+gm.label+'</div>'+groups[key].map(({t,index})=>{
      const sm=myTaskStatusMeta(t),canProgress=caps.progress||t.assignedToUserId===me?.id,canClose=caps.close||t.assignedToUserId===me?.id;
      const target=t.targetSeason==='winter'?'❄️ Přezout na ZIMNÍ':'☀️ Přezout na LETNÍ';
      let actions='';
      if(t.status==='planned'&&canProgress)actions+='<button class="tt-start primary wide" data-id="'+e(t.id)+'">▶ ZAČÍT PRACOVAT</button>';
      if(t.status==='in_progress'&&can('dotCreate'))actions+='<button class="tt-dot primary wide" data-id="'+e(t.id)+'">🛞 ZAPSAT PNEU / DOT</button>';
      if(t.status==='problem'&&canProgress)actions+='<button class="tt-start primary wide" data-id="'+e(t.id)+'">▶ POKRAČOVAT V PRÁCI</button>';
      if(t.status==='problem'&&can('dotCreate'))actions+='<button class="tt-dot secondary" data-id="'+e(t.id)+'">🛞 PNEU / DOT</button>';
      if(['planned','in_progress'].includes(t.status)&&canProgress)actions+='<button class="tt-problem danger-btn" data-id="'+e(t.id)+'">⚠️ MÁM PROBLÉM</button>';
      if(t.status==='completed'&&canClose)actions+='<button class="tt-close primary wide" data-id="'+e(t.id)+'">✅ DOKONČIT TASK</button>';
      const details='<details class="my-task-details"><summary>Více údajů o vozidle</summary><div class="my-task-detail-grid">'+
        '<div class="my-task-detail"><span>Skupina</span><b>'+e(t.category||t.carCategory||'—')+'</b></div>'+
        '<div class="my-task-detail"><span>Poslední km</span><b>'+(t.latestMileage===null||t.latestMileage===undefined?'—':Number(t.latestMileage).toLocaleString('cs-CZ')+' km')+'</b></div>'+
        '<div class="my-task-detail"><span>☀️ Letní DOT</span><b>'+e(t.latestSummerDot||'—')+'</b></div>'+
        '<div class="my-task-detail"><span>❄️ Zimní DOT</span><b>'+e(t.latestWinterDot||'—')+'</b></div>'+
      '</div></details>';
      return '<article class="my-task-card '+e(t.status)+' '+(taskBucket(t)==='overdue'?'overdue':'')+'" data-my-task-id="'+e(t.id)+'">'+
        '<div class="my-task-head"><div><div class="my-task-order">#'+(index+1)+' V PRACOVNÍ FRONTĚ</div><div class="my-task-plate">'+e(t.carPlate||'—')+'</div><div class="my-task-car">'+e(t.carName||'Bez názvu')+(t.category?' · '+e(t.category):'')+'</div></div><span class="tiretask-status '+e(t.status)+'">'+sm.icon+' '+sm.label+'</span></div>'+
        '<div class="my-task-when">'+e(taskDateLabel(t))+' · '+tireTaskTimeLabel(t)+'</div><div class="my-task-action-label">'+target+'</div>'+
        (t.instructions?'<div class="my-task-instructions"><b>📌 Instrukce</b><div style="margin-top:4px">'+e(t.instructions)+'</div></div>':'')+
        (t.problemNote?'<div class="my-task-problem"><b>⚠️ Nahlášený problém</b><div style="margin-top:4px">'+e(t.problemNote)+'</div></div>':'')+
        (t.completedRecordId?'<div class="my-task-complete"><b>✅ PNEU/DOT zapsáno</b><div style="margin-top:3px">DOT '+e(t.completedDot||'—')+' · '+Number(t.completedMileage??0).toLocaleString('cs-CZ')+' km</div><div class="small">'+dt(t.completedAt)+'</div></div>':'')+
        details+(actions?'<div class="my-task-actions">'+actions+'</div>':'')+
      '</article>';
    }).join('')+'</section>';
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
    return '<div class="tiretask-card '+e(t.status)+'" data-task-id="'+e(t.id)+'">'+
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
  }).join('')||'<div class="card"><div class="small">Nejsou žádné aktivní TASKy.</div></div>';

  document.querySelectorAll('.tt-start').forEach(b=>b.onclick=()=>setTireTaskStatus(b.dataset.id,'in_progress'));
  document.querySelectorAll('.tt-problem').forEach(b=>b.onclick=()=>openTaskProblem(b.dataset.id));
  document.querySelectorAll('.tt-dot').forEach(b=>b.onclick=()=>openPneuFromTireTask(b.dataset.id));
  document.querySelectorAll('.tt-edit').forEach(b=>b.onclick=()=>editTireTask(b.dataset.id));
  document.querySelectorAll('.tt-close').forEach(b=>b.onclick=()=>closeTireTask(b.dataset.id));
  document.querySelectorAll('.tt-delete').forEach(b=>b.onclick=()=>deleteTireTask(b.dataset.id));
  document.querySelectorAll('.tt-comment').forEach(b=>b.onclick=()=>addTireTaskComment(b.dataset.id));
  document.querySelectorAll('.tt-assignee-select').forEach(s=>s.onchange=async()=>{try{await api('tireTaskUpdate',{taskId:s.dataset.id,assignedToUserId:s.value});await refresh()}catch(x){alert(errorText(x))}});
}
function openTaskProblem(id){
  const t=(D.tireTasks||[]).find((x)=>x.id===id);if(!t||!$('taskProblemOverlay'))return;
  taskProblemTaskId=id;$('taskProblemMeta').textContent=(t.carPlate||'TASK')+' · '+(t.targetSeason==='winter'?'zimní':'letní')+' · '+(t.date||'');
  $('taskProblemText').value=t.status==='problem'?(t.problemNote||''):'';
  $('taskProblemMsg').innerHTML='';$('taskProblemOverlay').hidden=false;setTimeout(()=>$('taskProblemText').focus(),40);
}
function closeTaskProblem(){taskProblemTaskId=null;if($('taskProblemOverlay'))$('taskProblemOverlay').hidden=true}
async function submitTaskProblem(){
  const text=$('taskProblemText')?.value.trim();if(!taskProblemTaskId||!text)return note($('taskProblemMsg'),'Popiš prosím problém.','msg err');
  const ok=await setTireTaskStatus(taskProblemTaskId,'problem',text);if(ok)closeTaskProblem();
}
async function setTireTaskStatus(id,status,problemNote=''){
  try{await api('tireTaskSetStatus',{taskId:id,status,problemNote});await refresh();return true}catch(x){alert(errorText(x));return false}
}
async function addTireTaskComment(id){
  const input=document.querySelector('.tt-comment-input[data-id="'+id+'"]'),text=input?.value.trim();
  if(!text)return;
  try{await api('tireTaskComment',{taskId:id,text});await refresh()}catch(x){alert(errorText(x))}
}
async function closeTireTask(id){
  if(!confirm('Uzavřít tento TASK jako dokončený?'))return;
  try{await api('tireTaskClose',{taskId:id});await refresh()}catch(x){alert(errorText(x))}
}
async function deleteTireTask(id){
  const t=(D.tireTasks||[]).find(x=>x.id===id);if(!t)return;
  const label=(t.carPlate||'TASK')+' · '+(t.date||'');
  if(!confirm('Opravdu smazat úkol '+label+'?\n\nSmaže se pouze TASK. Případný PNEU/DOT záznam zůstane zachovaný. Tuto akci nelze vrátit.'))return;
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
  note($('saveMsg'),'📋 Zápis bude propojen s TASK '+(t.carPlate||'')+' · '+(t.targetSeason==='winter'?'zimní':'letní')+'.','msg');
}

function renderVehicleOverview(){
  if(!$('vehicleOverviewList'))return;
  const addCard=$('vehicleOverviewAddCard'),categoryCard=$('vehicleOverviewCategoryAddCard');
  if(addCard)addCard.hidden=!can('vehicleAdd');
  if(categoryCard)categoryCard.hidden=!can('vehicleCategoryAdd');
  if($('vehicleOverviewCategoryManageList')){
    $('vehicleOverviewCategoryManageList').innerHTML=(D.vehicleCategories||[]).map(cat=>'<div class="category-manage-row"><span class="vehicle-category-badge">'+e(cat)+'</span><div class="toolbar"><button class="category-rename secondary" data-category="'+e(cat)+'">✏️ Přejmenovat</button><button class="category-delete danger-btn" data-category="'+e(cat)+'">🗑 Smazat</button></div></div>').join('')||'<div class="small">Nejsou vytvořené žádné skupiny.</div>';
    document.querySelectorAll('.category-rename').forEach(b=>b.onclick=()=>renameVehicleCategory(b.dataset.category));
    document.querySelectorAll('.category-delete').forEach(b=>b.onclick=()=>deleteVehicleCategory(b.dataset.category));
  }
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
    const quick=(v.active!==false?'<div class="compact-actions">'+
      (can('dotCreate')?'<button class="vehicle-quick-dot primary" data-id="'+e(v.id)+'">🛞 PNEU/DOT</button>':'')+
      (canPlanSeasonTask()?'<button class="vehicle-quick-task secondary" data-id="'+e(v.id)+'">📋 TASK</button>':'')+
      ((can('vehicleDetail')||me?.role==='admin')?'<button class="vehicle-quick-detail secondary" data-id="'+e(v.id)+'">Detail</button>':'')+
      '</div>':'');
    return '<div class="vehicle-overview-card" data-car-id="'+e(v.id)+'">'+
      '<div class="vehicle-overview-head"><div><div class="vehicle-overview-plate">'+e(v.plate||'—')+'</div><div class="vehicle-overview-name">'+e(v.name||'Bez názvu')+'</div><div class="vehicle-overview-tags"><span class="vehicle-category-badge">'+e(v.category||'BEZ KATEGORIE')+'</span>'+(v.activeTaskCount?'<span class="vehicle-task-badge">📋 TASK '+v.activeTaskCount+'</span>':'')+'</div></div>'+
      '<span class="vehicle-overview-status '+(v.active?'':'archived')+'">'+(v.active?'AKTIVNÍ':'ARCHIV')+'</span></div>'+
      '<div class="vehicle-overview-metrics">'+
        '<div class="vehicle-overview-metric"><span>Aktuální stav</span><b>'+(v.latestMileage===null||v.latestMileage===undefined?'—':Number(v.latestMileage).toLocaleString('cs-CZ')+' km')+'</b></div>'+
        '<div class="vehicle-overview-metric"><span>DOT evidence</span><b>'+(complete?'✅ Kompletní':'⚠️ Neúplná')+'</b></div>'+
        '<div class="vehicle-overview-metric"><span>Počet záznamů</span><b>'+Number(v.recordCount||0).toLocaleString('cs-CZ')+'</b></div>'+
        '<div class="vehicle-overview-metric"><span>Poslední DOT/km</span><b>'+(v.latestRecordAt?dt(v.latestRecordAt):'—')+'</b></div>'+
      '</div>'+
      '<div class="vehicle-overview-dot">'+season('Letní','☀️',v.summer)+season('Zimní','❄️',v.winter)+'</div>'+
      ((v.activeTasks||[]).length?'<div class="vehicle-task-summary"><div class="vehicle-task-summary-title">📋 Naplánované TASKy</div>'+v.activeTasks.slice(0,3).map(t=>{const sm=tireTaskStatusMeta(t.status);return '<div class="vehicle-task-line"><span>'+sm.icon+' <b>'+e(t.date||'—')+'</b> · '+(t.time?e(t.time):'CELÝ DEN')+'</span><span>'+(t.targetSeason==='winter'?'❄️ Zimní':t.targetSeason==='summer'?'☀️ Letní':'')+'</span></div>'}).join('')+(v.activeTasks.length>3?'<div class="small" style="margin-top:5px">＋ další '+(v.activeTasks.length-3)+' task'+(v.activeTasks.length-3===1?'':'y')+'</div>':'')+'</div>':'')+
      quick+
      '<details class="vehicle-more"><summary>Další údaje</summary><div class="vehicle-more-content"><div class="vehicle-overview-vin">VIN: '+e(v.vin||'nezadaný')+'</div><div class="vehicle-overview-meta"><div><b>Poslední úprava:</b> '+e(v.lastModifiedBy||'—')+'</div><div class="small">'+dt(v.lastModifiedAt)+'</div><div class="small" style="margin-top:5px">Vozidlo založeno: '+dt(v.createdAt)+'</div></div></div></details>'+
      '</div>';
  }).join('')||'<div class="card"><div class="small">'+((q||category)?'Žádné vozidlo neodpovídá zvolenému hledání nebo skupině.':'V evidenci zatím nejsou žádná vozidla.')+'</div></div>';
  document.querySelectorAll('.vehicle-quick-dot').forEach(b=>b.onclick=()=>openSeasonPneuEntry(b.dataset.id,currentSeasonCampaignKey().split(':')[0]));
  document.querySelectorAll('.vehicle-quick-task').forEach(b=>b.onclick=()=>planSeasonVehicle(b.dataset.id,currentSeasonCampaignKey().split(':')[0]));
  document.querySelectorAll('.vehicle-quick-detail').forEach(b=>b.onclick=()=>openVehicle(b.dataset.id));
}

async function renameVehicleCategory(category){
  if(!can('vehicleCategoryAdd'))return;
  const next=prompt('Nový název skupiny:',category);if(next===null)return;
  const clean=next.trim();if(!clean)return alert('Název skupiny nesmí být prázdný.');
  if(clean.toLocaleUpperCase('cs-CZ')===String(category).toLocaleUpperCase('cs-CZ'))return;
  if(!confirm('Přejmenovat skupinu „'+category+'“ na „'+clean+'“?\n\nZměna se propíše i do vozidel a aktivních TASKů.'))return;
  try{const r=await api('vehicleCategoryRename',{category,newCategory:clean});await refresh();alert('Skupina přejmenována. Upraveno '+r.changedCars+' vozidel a '+r.changedTasks+' aktivních TASKů.')}catch(x){alert(errorText(x))}
}
async function deleteVehicleCategory(category){
  if(!can('vehicleCategoryAdd'))return;
  if(!confirm('Opravdu smazat skupinu „'+category+'“?\n\nSmazání projde jen pokud ji nepoužívá žádné vozidlo ani aktivní TASK.'))return;
  try{await api('vehicleCategoryDelete',{category});await refresh()}catch(x){alert(errorText(x))}
}
function renderModuleShell(){
  renderVehicleOverview();
  if($('settingsUser'))$('settingsUser').textContent=me?.name||'—';
  if($('settingsRole'))$('settingsRole').textContent=roleLabel(me?.role);if($('themeMode'))$('themeMode').value=themePreference();if($('themeCurrent'))$('themeCurrent').textContent=document.documentElement.dataset.theme==='dark'?'🌙 Tmavý':'☀️ Světlý';
  if($('homeNotificationBadge')){$('homeNotificationBadge').textContent=String(D.notificationUnreadCount||0);$('homeNotificationBadge').hidden=!(D.notificationUnreadCount>0)}
  if($('headerNotificationBadge')){$('headerNotificationBadge').textContent=String(D.notificationUnreadCount||0);$('headerNotificationBadge').hidden=!(D.notificationUnreadCount>0)}
  renderHomePulse();
  renderHomeAssignedTasks();
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

function updateModuleControlUi(box){
  if(!box)return;
  const online=box.querySelector('.module-online-toggle')?.checked!==false,visible=box.querySelector('.module-visible-toggle')?.checked!==false;
  const badge=box.querySelector('.module-control-state'),access=box.querySelector('.module-user-access');
  if(badge){badge.className='module-control-state '+(online?'online':'offline');badge.textContent=online?'🟢 ONLINE':'🔴 OFFLINE'}
  if(access){
    const testGroup=access.querySelector('.module-test-group'),regularGroup=access.querySelector('.module-regular-group');
    if(testGroup)testGroup.hidden=!online;
    if(regularGroup)regularGroup.hidden=!online||visible;
    access.querySelectorAll('.module-user-toggle[data-role="test"]').forEach(x=>x.disabled=!online);
    access.querySelectorAll('.module-user-toggle:not([data-role="test"])').forEach(x=>x.disabled=!online||visible);
    const hasTest=!!access.querySelector('.module-user-toggle[data-role="test"]'),hasRegular=!!access.querySelector('.module-user-toggle:not([data-role="test"])');
    access.hidden=!online||(!hasTest&&(visible||!hasRegular));
  }
}
function renderModuleControls(){
  if(me?.role!=='admin'||!$('adminModules'))return;
  const modules=D.modulesAdmin||{},users=(D.users||[]).filter(u=>u.active&&u.role!=='admin'),testUsers=users.filter(u=>u.role==='test'),regularUsers=users.filter(u=>u.role!=='test');
  $('adminModules').innerHTML=MODULE_KEYS.map(id=>{
    const meta=MODULE_META[id],m=modules[id]||{visible:true,online:true,allowedUserIds:[],offlineMessage:'Modul je dočasně mimo provoz.'},allowed=new Set(m.allowedUserIds||[]);
    const choices=list=>list.map(u=>'<label class="module-user-choice '+(u.role==='test'?'test-user-choice':'')+'"><input class="module-user-toggle" data-module="'+e(id)+'" data-role="'+e(u.role)+'" value="'+e(u.id)+'" type="checkbox" '+(allowed.has(u.id)?'checked':'')+'><span><b>'+e(u.name)+'</b><span class="small">'+e(roleLabel(u.role))+'</span></span></label>').join('');
    const testChecks=testUsers.length?'<div class="module-test-group"><div class="filter-label">🧪 TEST účty — individuální přístup platí vždy</div><div class="module-user-grid">'+choices(testUsers)+'</div></div>':'';
    const regularChecks=regularUsers.length?'<div class="module-regular-group"><div class="filter-label">Výjimky pro ostatní uživatele při skrytém modulu</div><div class="module-user-grid">'+choices(regularUsers)+'</div></div>':'';
    return '<div class="module-control" data-module-control="'+e(id)+'">'+
      '<div class="module-control-head"><div><b>'+meta.icon+' '+e(meta.label)+'</b><div class="small" style="margin-top:3px">Dostupnost a individuální přístup</div></div>'+
      '<span class="module-control-state '+(m.online?'online':'offline')+'">'+(m.online?'🟢 ONLINE':'🔴 OFFLINE')+'</span></div>'+
      '<div class="switchline"><input class="module-online-toggle" data-id="'+e(id)+'" type="checkbox" '+(m.online?'checked':'')+'><span><b>Modul online</b><span class="small" style="display:block">Když je Offline, nepřihlásí se do něj nikdo — ani Admin.</span></span></div>'+
      '<div class="switchline"><input class="module-visible-toggle" data-id="'+e(id)+'" type="checkbox" '+(m.visible?'checked':'')+'><span><b>Zobrazit všem</b><span class="small" style="display:block">Když vypneš, modul bude skrytý a můžeš níže vybrat výjimky.</span></span></div>'+
      '<div class="module-user-access">'+testChecks+regularChecks+'</div>'+
      '<div class="filter-label">Zpráva při Offline režimu</div>'+
      '<input class="module-offline-message" data-id="'+e(id)+'" maxlength="220" value="'+e(m.offlineMessage||'')+'" placeholder="Modul je dočasně mimo provoz.">'+
      '</div>';
  }).join('');
  document.querySelectorAll('.module-online-toggle,.module-visible-toggle').forEach(x=>x.onchange=()=>updateModuleControlUi(x.closest('.module-control')));
  document.querySelectorAll('.module-control').forEach(updateModuleControlUi);
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
  if($('vehicleCategoryList'))$('vehicleCategoryList').innerHTML=(D.vehicleCategories||[]).map(x=>'<div class="category-manage-row"><span class="vehicle-category-badge">'+e(x)+'</span><div class="toolbar"><button class="admin-category-rename secondary" data-category="'+e(x)+'">✏️</button><button class="admin-category-delete danger-btn" data-category="'+e(x)+'">🗑</button></div></div>').join('')||'<span class="small">Žádné kategorie.</span>';
  document.querySelectorAll('.admin-category-rename').forEach(b=>b.onclick=()=>renameVehicleCategory(b.dataset.category));
  document.querySelectorAll('.admin-category-delete').forEach(b=>b.onclick=()=>deleteVehicleCategory(b.dataset.category));
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
if($('addVehicleCategory'))$('addVehicleCategory').onclick=async()=>{const category=$('newVehicleCategoryName').value.trim();if(!category)return note($('vehicleCategoryMsg'),'Zadej název kategorie.','msg err');try{await api('vehicleCategoryAdd',{category});$('newVehicleCategoryName').value='';note($('vehicleCategoryMsg'),'Kategorie byla přidána.','msg ok');await refresh()}catch(x){note($('vehicleCategoryMsg'),errorText(x),'msg err')}};

// Admin users
$('addUser').onclick=async()=>{const name=$('newUserName').value.trim(),pin=$('newUserPin').value.replace(/\D/g,'').slice(0,4),role=$('newUserRole').value;if(!name||pin.length!==4)return alert('Zadej jméno a čtyřmístný PIN.');try{await api('adminAddUser',{name,pin,role});$('newUserName').value=$('newUserPin').value='';$('newUserRole').value='driver';await refresh()}catch(x){alert(errorText(x))}};
function renderAdminUsers(){
  $('users').innerHTML=(D.users||[]).map(u=>{
    const admin=u.role==='admin';
    const role=admin?'<span class="badge">Admin</span>':'<select class="ur" data-id="'+e(u.id)+'" style="max-width:160px"><option value="driver" '+(u.role==='driver'?'selected':'')+'>Driver</option><option value="dispatch" '+(u.role==='dispatch'?'selected':'')+'>Dispatch</option><option value="technician" '+(u.role==='technician'?'selected':'')+'>Technician</option><option value="test" '+(u.role==='test'?'selected':'')+'>TEST</option></select>';
    const testInfo=u.role==='test'?'<div class="test-profile-note"><b>🧪 TEST profil</b><div class="small">Nemá žádná výchozí oprávnění. Práva nastav níže a přístup k jednotlivým modulům v Admin → Moduly.</div></div>':'';
    const perms=admin?'<div class="small" style="margin:9px 0"><b>Plný systémový přístup.</b> Tato práva nelze vypnout.</div>':'<div class="perm-grid">'+PERMS.map(([k,l])=>'<label class="perm"><input class="uperm" data-id="'+e(u.id)+'" data-k="'+e(k)+'" type="checkbox" '+(u.permissions?.[k]?'checked':'')+'><span>'+e(l)+'</span></label>').join('')+'</div>';
    const pinReset=u.pinChangeRequired?.required?'<div class="pin-reset-pending"><b>🔐 Čeká na změnu PINu</b><div class="small">'+(u.pinChangeRequired.requireOldPin?'Při změně bude vyžadován i stávající PIN.':'Při změně nebude vyžadováno opětovné zadání stávajícího PINu.')+' · od '+dt(u.pinChangeRequired.requestedAt)+'</div></div>':'';
    const loginLock=u.loginLockedAt?'<div class="login-lock-alert"><b>🔒 ZABLOKOVÁNO PO 3 POKUSECH</b><div class="small">Zablokováno '+dt(u.loginLockedAt)+'. Pro odemčení použij „Vyžádat změnu PINu“ a nejdřív fyzicky ověř, co se stalo.</div></div>':(u.failedPinAttempts?'<div class="login-attempt-warning">⚠️ Chybné pokusy o PIN: <b>'+u.failedPinAttempts+'/3</b> · poslední '+dt(u.lastFailedPinAt)+'</div>':'');
    return '<div class="user '+(u.role==='test'?'test-profile':'')+'"><div class="row mobile-stack"><input class="un" data-id="'+e(u.id)+'" value="'+e(u.name)+'">'+role+'</div><div class="small" style="margin:6px 0">'+presenceHtml(u)+' · poslední aktivita '+dt(u.lastActivityAt)+' · naposledy online '+dt(u.lastOnlineAt)+' · záznamů '+u.recordCount+' · push zařízení '+u.pushDevices+' · '+(u.active?'aktivní':'zablokovaný')+'</div>'+loginLock+pinReset+testInfo+perms+'<div class="toolbar"><button class="primary su" data-id="'+e(u.id)+'">Uložit</button>'+(!admin?'<button class="request-pin-reset secondary" data-id="'+e(u.id)+'">🔐 '+(u.pinChangeRequired?.required?'Upravit výzvu PINu':'Vyžádat změnu PINu')+'</button><button class="tu '+(u.active?'danger-btn':'primary')+'" data-id="'+e(u.id)+'" data-a="'+u.active+'">'+(u.active?'Zablokovat':'Aktivovat')+'</button>':'')+'</div></div>';
  }).join('');
  document.querySelectorAll('.su').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id,n=document.querySelector('.un[data-id="'+id+'"]').value,u=(D.users||[]).find(x=>x.id===id);
    const role=u?.role==='admin'?'admin':document.querySelector('.ur[data-id="'+id+'"]').value;
    const permissions={};if(role!=='admin')document.querySelectorAll('.uperm[data-id="'+id+'"]').forEach(x=>permissions[x.dataset.k]=x.checked);
    try{await api('adminUpdateUser',{userId:id,name:n,role,permissions});await refresh();alert('Uloženo.')}catch(x){alert(errorText(x))}
  });
  document.querySelectorAll('.request-pin-reset').forEach(b=>b.onclick=()=>openAdminPinReset(b.dataset.id));
  document.querySelectorAll('.tu').forEach(b=>b.onclick=async()=>{await api('adminUpdateUser',{userId:b.dataset.id,active:b.dataset.a!=='true'});await refresh()});
}

function openAdminPinReset(id){
  const u=(D.users||[]).find(x=>x.id===id);if(!u)return;
  pinResetAdminUserId=id;$('pinAdminResetUser').textContent=u.name;
  $('pinAdminResetLead').textContent=u.loginLockedAt?'Tento účet je zablokovaný po 3 chybných pokusech. Odesláním výzvy se účet odemkne a uživatel bude muset dokončit změnu PINu.':'Výzva uživateli vynutí nastavení nového PINu. Pokud níže vypneš požadavek na starý PIN, na přihlašovací obrazovce dostane možnost přejít rovnou ke změně PINu.';
  $('pinAdminRequireOld').value=u.pinChangeRequired?.required&&u.pinChangeRequired.requireOldPin===false?'no':'yes';
  $('pinAdminResetMsg').innerHTML='';$('pinAdminResetOverlay').hidden=false;
}
function closeAdminPinReset(){pinResetAdminUserId=null;$('pinAdminResetOverlay').hidden=true;$('pinAdminResetMsg').innerHTML=''}
$('pinAdminResetCancel').onclick=closeAdminPinReset;
$('pinAdminResetSubmit').onclick=async()=>{
  if(!pinResetAdminUserId)return;
  const u=(D.users||[]).find(x=>x.id===pinResetAdminUserId);if(!u)return closeAdminPinReset();
  const requireOldPin=$('pinAdminRequireOld').value==='yes';
  if(!confirm('Pozastavit běžný přístup účtu '+u.name+' a vyžádat změnu PINu při příštím přihlášení?'))return;
  $('pinAdminResetSubmit').disabled=true;
  try{
    const r=await api('adminRequestPinReset',{userId:u.id,requireOldPin});
    closeAdminPinReset();await refresh();
    alert('Výzva ke změně PINu byla nastavena.'+(r.devices?' Push odeslán na '+r.sent+'/'+r.devices+' zařízení.':''));
  }catch(x){note($('pinAdminResetMsg'),errorText(x),'msg err')}
  finally{$('pinAdminResetSubmit').disabled=false}
};
// Notifications admin
function renderNotificationAdmin(){
  const s=D.notificationSettings||{};$('autoIncomplete').checked=!!s.incompleteEnabled;$('autoIncompleteDays').value=String(s.incompleteRepeatDays||3);$('autoIncompleteRecipients').value=s.incompleteRecipients||'workers';$('autoSummer').checked=s.incompleteMissingSummer!==false;$('autoWinter').checked=s.incompleteMissingWinter!==false;$('autoAnomaly').checked=!!s.adminAnomalyEnabled;$('autoAdminDays').value=String(s.adminAnomalyRepeatDays||3);$('autoStale').checked=!!s.staleEnabled;$('autoStaleDays').value=String(s.staleDays||365);
  $('notificationLog').innerHTML=(D.notificationLog||[]).slice(0,80).map(n=>{
    const m=notificationUiMeta(n),acks=(n.acks||[]).map(a=>'<div class="ack">✓ '+e(a.userName||a.userId)+' · '+(a.response==='view_vehicle'?'Zobrazil vozidlo':'Rozumím')+' · '+dt(a.at)+'</div>').join('');
    const recipients=(n.recipientUserIds||[]).length,pending=n.requiresAck?Math.max(0,recipients-(n.acks||[]).length):0;
    return '<div class="item"><b>'+m.icon+' '+e(n.title||n.type)+'</b> <span class="badge">'+e(m.label)+(m.priority?' · '+e(m.priority):'')+'</span>'+(n.carPlate?' <span class="badge">'+e(n.carPlate)+'</span>':'')+'<div class="small">'+e(n.body||'')+'</div><div class="small">'+dt(n.createdAt)+' · push '+(n.sent??0)+'/'+(n.devices??0)+(n.requiresAck&&recipients?' · potvrzeno '+(n.acks||[]).length+'/'+recipients+' · čeká '+pending:' · bez povinného potvrzení')+'</div>'+acks+'</div>';
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

function renderAdmin(){renderAdminDashboard();renderModuleControls();renderAdminCars();renderAdminUsers();renderNotificationAdmin();renderAudit()}
function allowedTab(id){return id==='entry'?can('dotCreate'):id==='season'?hasPneuAccess():id==='fleet'?(can('fleetView')||can('attentionView')):id==='history'?can('historyView'):false}
function applyAccess(){
  $('who').textContent=me.name+' · '+roleLabel(me.role);
  document.querySelectorAll('.pneu-tabs button').forEach(b=>b.style.display=allowedTab(b.dataset.tab)?'':'none');
  $('pushCard').style.display='';
  $('fleetFiltersCard').style.display=can('fleetView')?'':'none';
  $('fleetListCard').style.display=can('fleetView')?'':'none';
  if(currentModule==='admin'&&me.role!=='admin')openModule('home');
  if(currentModule==='pneu'&&!hasPneuAccess())openModule('home');
  if(MODULE_KEYS.includes(currentModule)&&moduleCfg(currentModule).online===false)showModuleBlocked(currentModule,moduleCfg(currentModule).offlineMessage);
  else if(MODULE_KEYS.includes(currentModule)&&me.role!=='admin'&&moduleCfg(currentModule).visible===false)openModule('home');
}
function render(){const sel=$('car').value;renderCarOptions(sel);valid();renderSeasonDashboard();renderFleet();renderHist();if(me.role==='admin'&&D.adminLoaded)renderAdmin();else if(me.role!=='admin')renderAttention();renderModuleShell();renderTireTask();renderNotificationSettings();renderNotifications();applyAccess();renderSystemBanner();renderNoticeOverlay();renderNotificationToast()}

function showTab(id,doRefresh=true){if(!allowedTab(id))return;document.querySelectorAll('#pneu .panel').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.pneu-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));if(id==='season')renderSeasonDashboard();if(doRefresh){loadPneuData(false).catch(()=>{});if(id==='fleet'&&can('fleetView'))loadFleetData(false).catch(()=>{});if(id==='history'&&can('historyView'))loadHistoryPage(true).catch(()=>{})}}
if($('saveModuleControls'))$('saveModuleControls').onclick=async()=>{
  const modules={};
  MODULE_KEYS.forEach(id=>{
    const visible=document.querySelector('.module-visible-toggle[data-id="'+id+'"]');
    const online=document.querySelector('.module-online-toggle[data-id="'+id+'"]');
    const message=document.querySelector('.module-offline-message[data-id="'+id+'"]');
    const allowedUserIds=[...document.querySelectorAll('.module-user-toggle[data-module="'+id+'"]:checked')].map(x=>x.value);
    modules[id]={visible:!!visible?.checked,online:!!online?.checked,allowedUserIds,offlineMessage:message?.value.trim()||''};
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
if($('seasonCampaign'))$('seasonCampaign').onchange=()=>{seasonDashboardCampaign=$('seasonCampaign').value;renderSeasonDashboard()};
if($('seasonCategory'))$('seasonCategory').onchange=renderSeasonDashboard;
if($('seasonStatus'))$('seasonStatus').onchange=renderSeasonDashboard;
if($('seasonSearch'))$('seasonSearch').oninput=renderSeasonDashboard;
if($('seasonClearFilters'))$('seasonClearFilters').onclick=()=>{$('seasonSearch').value='';$('seasonCategory').value='';$('seasonStatus').value='';renderSeasonDashboard()};
if($('seasonRefresh'))$('seasonRefresh').onclick=()=>loadPneuData(true);
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
    await refresh();setTimeout(()=>$('tireTaskCreateMsg').innerHTML='',2200)
  }catch(x){note($('tireTaskCreateMsg'),errorText(x),'msg err')}
};
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
if($('historyLoadMore'))$('historyLoadMore').onclick=()=>loadHistoryPage(false);
if($('taskProblemCancel'))$('taskProblemCancel').onclick=closeTaskProblem;
if($('taskProblemSubmit'))$('taskProblemSubmit').onclick=submitTaskProblem;
if($('taskProblemOverlay'))$('taskProblemOverlay').onclick=(ev)=>{if(ev.target===$('taskProblemOverlay'))closeTaskProblem()};
if($('globalSearchBtn'))$('globalSearchBtn').onclick=openGlobalSearch;
if($('globalSearchClose'))$('globalSearchClose').onclick=closeGlobalSearch;
if($('globalSearchInput'))$('globalSearchInput').oninput=()=>{if(globalSearchTimer)clearTimeout(globalSearchTimer);globalSearchTimer=setTimeout(renderGlobalSearch,250)};
if($('globalSearchOverlay'))$('globalSearchOverlay').onclick=e=>{if(e.target===$('globalSearchOverlay'))closeGlobalSearch()};
if($('headerNotifications'))$('headerNotifications').onclick=()=>openModule('notifications');
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('globalSearchOverlay')?.hidden)closeGlobalSearch();if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&tok){e.preventDefault();openGlobalSearch()}});
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
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){markActivity();syncCheck(true)}heartbeat()});
window.addEventListener('pagehide',()=>{if(!tok)return;fetch('/api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({action:'heartbeat',visible:false,active:false}),keepalive:true}).catch(()=>{})});
setInterval(()=>{if(tok&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))syncCheck()},30000);
setInterval(()=>{if(tok&&currentModule==='admin'&&me?.role==='admin')loadAdminState(true).catch(()=>{})},60000);
setInterval(()=>{if(tok&&document.visibilityState==='visible')heartbeat()},90000);
applyTheme();loadLoginUsers();if('serviceWorker'in navigator)ensureSW().catch(()=>{});
})();