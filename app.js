(()=>{
let tok='',me=null,D={cars:[],records:[]},season='',carSearch='',swReg=null,openVehicleDetail=null,lastInteraction=Date.now(),currentModule='home',settingsDevicesLoaded=false,tireTaskView='today',pendingTireTaskId=null,tireTaskDraftRows=[],tireTaskDraftSeq=0,editingCarId=null,notificationView='all',toastNotificationId=null,toastTimer=null,pinChangeState=null,pinResetAdminUserId=null,loginUsers=[],seasonDashboardCampaign='',globalFocusRecordId='',globalSearchTimer=null,globalSearchSeq=0,lastSyncVersion='',syncInFlight=false,adminStateLoadedAt=0,dataLoadedAt={},historyNextOffset=null,historyTotal=0,historyLoading=false,fleetDataKey='',taskProblemTaskId=null,adminUserProfileData=null;
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
const PERMS=[['dotView','Vidět DOT údaje v přehledu aut'],['dotCreate','Zapisovat DOT'],['dotEdit','Upravovat DOT záznamy'],['dotDelete','Mazat DOT záznamy'],['fleetView','Vidět přehled aut'],['fleetExport','Exportovat přehled aut'],['historyView','Vidět historii'],['historyExport','Exportovat historii'],['vehicleDetail','Vidět detail vozidla (bez auditu)'],['vehicleAdd','Přidat vozidlo'],['vehicleCategoryAdd','Spravovat skupiny vozidel'],['attentionView','Vidět upozornění Vyžaduje pozornost'],['attentionEdit','Upravovat z Vyžaduje pozornost'],['tireTaskCreate','Vytvořit TASK'],['tireTaskEdit','Upravovat TASKy (včetně dokončených)'],['tireTaskDelete','Mazat TASKy (včetně rozpracovaných a dokončených)'],['tireTaskCompletedView','Vidět přehled dokončených TASKů'],['notificationsReceive','Přijímat oznámení'],['notificationsSendOperational','Odesílat provozní oznámení']];
const WRITE_PERMS=new Set(['dotCreate','dotEdit','dotDelete','vehicleAdd','vehicleCategoryAdd','attentionEdit','tireTaskCreate','tireTaskEdit','tireTaskDelete','notificationsSendOperational']);
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
    if(j.error==='AUTH'&&tok){const msg=j.reason==='SESSION_REVOKED'?(j.message||'Relace byla ukončena administrátorem. Zadej svůj stávající PIN.'):'Přihlášení vypršelo. Zadej PIN znovu.';setTimeout(()=>{if(tok)lockApp(msg,'msg warn')},0)}
    if(j.error==='MAINTENANCE'&&tok)setTimeout(()=>lockApp(j.message||'🔧 Probíhá technická údržba\nAplikace je dočasně pozastavena administrátorem.\nZkuste to prosím později.','msg warn'),0);
    if(j.error==='HIBERNATION'&&tok)setTimeout(()=>lockApp(j.message||'🌙 Aplikace je v sezónním spánku\nPrávě odpočívám mezi sezónami. Ozvu se, až se zase probudím!','msg warn hibernation-message'),0);
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
function errorText(x){if(x?.data?.message)return x.data.message;return({DUPLICATE:'SPZ už existuje.',PIN_USED:'PIN už používá někdo jiný.',PIN:'PIN musí mít 4 číslice.',PIN_OLD:'Stávající PIN není správný.',PIN_MATCH:'Nové PINy se neshodují.',PIN_SAME:'Nový PIN musí být jiný než stávající PIN.',PIN_CHANGE_REQUIRED:'Je nutné změnit PIN.',PIN_SELF_SERVICE:'PIN uživatele mění pouze uživatel přes výzvu ke změně.',PIN_RESET_NOT_AVAILABLE:'Reset bez starého PINu není pro tento účet povolen.',PIN_RESET_ONLY:'Tento přístup slouží pouze ke změně PINu.',DOT:'Neplatný DOT.',MILEAGE:'Neplatný stav kilometrů.',CAR:'Auto nebylo nalezeno.',USER:'Uživatel nebyl nalezen.',MESSAGE:'Doplň nadpis i text oznámení.',VEHICLE_CATEGORY:'Vyber platnou kategorii vozidla.',VEHICLE_CATEGORY_DUPLICATE:'Tato kategorie už existuje.',VEHICLE_CATEGORY_IN_USE:'Kategorii používají vozidla nebo aktivní TASKy. Nejdřív je přesuň do jiné kategorie.',READ_ONLY:'Aplikace je momentálně pouze pro čtení.',MAINTENANCE:'Probíhá technická údržba.',HIBERNATION:'Aplikace je v sezónním spánku.',SYSTEM_MODE:'Neplatný provozní režim.',MODULE_OFFLINE:'Modul je dočasně offline.',TIRETASK:'Úkol TASK nebyl nalezen.',TIRETASK_DATE:'Zadej platné datum.',TIRETASK_TIME:'Zadej platný čas.',TIRETASK_STATUS:'Neplatný stav úkolu.',TIRETASK_CLOSED:'Uzavřený úkol už nelze měnit.',TIRETASK_NOT_COMPLETED:'Úkol lze uzavřít až po dokončení PNEU/DOT zápisu.',TIRETASK_COMPLETED:'Hotový úkol už lze pouze okomentovat nebo uzavřít.',TIRETASK_NOT_ACCEPTED:'TASK musí přiřazený uživatel nejdřív přijmout.',TIRETASK_NOT_ASSIGNED:'Tento TASK není přiřazený tobě.'})[x.code]||'Operace se nepodařila.'}

function lockApp(message='',cls='msg'){
  if(taskDotContext)restoreTaskDotForm();
  closeTaskEdit();
  closeAdminOwnPinChange();
  taskDraftTimers.forEach(timer=>clearTimeout(timer));taskDraftTimers.clear();taskDrafts.clear();taskSeasonDrafts.clear();taskDraftStates.clear();taskOpenVehicles.clear();taskBusy.clear();taskRecordRequests.clear();pendingTireTaskId=null;
  const lastUserId=me?.id||$('loginUser')?.value||localStorage.getItem('lastLoginUserId')||'';
  if(lastUserId)localStorage.setItem('lastLoginUserId',lastUserId);
  tok='';me=null;D={cars:[],records:[]};openVehicleDetail=null;currentModule='home';settingsDevicesLoaded=false;notificationView='all';toastNotificationId=null;pinChangeState=null;pinResetAdminUserId=null;lastSyncVersion='';syncInFlight=false;adminStateLoadedAt=0;dataLoadedAt={};historyNextOffset=null;historyTotal=0;historyLoading=false;fleetDataKey='';if(toastTimer)clearTimeout(toastTimer);toastTimer=null;
  $('noticeOverlay').hidden=true;$('issueEditOverlay').hidden=true;$('pinAdminResetOverlay').hidden=true;$('pinChangeScreen').hidden=true;$('systemBanner').hidden=true;$('main').hidden=true;$('login').hidden=false;$('loginMsg').innerHTML='';
  if($('notificationToast')){$('notificationToast').hidden=true;$('notificationToast').innerHTML=''}
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
  const requestedNavigation=new URLSearchParams(location.search);
  const userId=$('loginUser').value,p=$('pin').value.replace(/\D/g,'').slice(0,4);$('pin').value=p;
  if(!userId)return note($('loginMsg'),'Vyber svůj účet.','msg err');
  if(p.length!==4)return note($('loginMsg'),'Kód má 4 číslice.','msg err');
  try{
    const r=await api('login',{userId,pin:p});tok=r.token;me=r.user;localStorage.setItem('lastLoginUserId',userId);lastInteraction=Date.now();$('login').hidden=true;$('pin').value='';
    if(r.pinChangeRequired?.required){showPinChangeScreen(r.pinChangeRequired);return}
    await refresh();await syncExistingPushSubscription();$('main').hidden=false;await heartbeat();await updatePushStatus();
    if(!matchMedia('(display-mode: standalone)').matches&&/iPhone|iPad|iPod/.test(navigator.userAgent))$('install').hidden=false;
    const qs=requestedNavigation,tab=qs.get('tab'),mod=qs.get('module'),taskId=qs.get('task');
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
      (x.code==='MAINTENANCE'||x.code==='HIBERNATION')?(x.data?.message||errorText(x)):errorText(x);
    note($('loginMsg'),msg,(x.code==='MAINTENANCE'||x.code==='HIBERNATION'||x.code==='ACCOUNT_LOCKED')?'msg warn'+(x.code==='HIBERNATION'?' hibernation-message':''):'msg err');
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
    await syncExistingPushSubscription();
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
  const mine=(D.tireTaskGroups||[]).filter(t=>t.assignedToUserId===me?.id&&!t.workClosed);
  D.myTaskSummary=mine.slice(0,8);D.myTaskCount=mine.length;
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
  $('save').disabled=taskDotSaving||!can('dotCreate')||!($('car').value&&season&&dotOk&&k!=='');
  const l=latest($('car').value);$('kmHint').textContent=taskDotContext?'Kilometry zůstanou předvyplněné i pro druhou sadu. Podle tachometru je můžeš upravit.':l?'Předvyplněno z posledního záznamu: '+Number(l.mileage).toLocaleString('cs-CZ')+' km — potvrď nebo uprav.':'Zatím bez předchozího záznamu. Zadej aktuální stav tachometru.';
}
function pneuInputChanged(){valid();if(taskDotContext)scheduleTaskDraft(taskDotContext.id)}
$('dot').oninput=pneuInputChanged;$('dotFront').oninput=pneuInputChanged;$('dotRear').oninput=pneuInputChanged;$('km').oninput=pneuInputChanged;
$('splitDot').onchange=()=>{
  const split=$('splitDot').checked;
  $('singleDotEntry').hidden=split;$('splitDotEntry').hidden=!split;
  if(split&&validDot($('dot').value)){if(!$('dotFront').value)$('dotFront').value=$('dot').value;if(!$('dotRear').value)$('dotRear').value=$('dot').value}
  if(!split&&validDot($('dotFront').value)&&$('dotFront').value===$('dotRear').value)$('dot').value=$('dotFront').value;
  pneuInputChanged();
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
function setSeason(s){if(taskDotContext&&!taskDotLoading)return switchTaskDotSeason(s);season=s;$('summer').classList.toggle('on',s==='summer');$('winter').classList.toggle('on',s==='winter');valid()}
$('summer').onclick=()=>setSeason('summer');$('winter').onclick=()=>setSeason('winter');
['1','2','3','4','5','6','7','8','9','C','0','⌫'].forEach(k=>{const b=document.createElement('button');b.textContent=k;b.onclick=()=>{if(k==='C')$('dot').value='';else if(k==='⌫')$('dot').value=$('dot').value.slice(0,-1);else if($('dot').value.length<4)$('dot').value+=k;pneuInputChanged()};$('pad').append(b)});
$('save').onclick=async()=>{
  if(taskDotContext)return saveTaskDotSeason();
  if($('save').disabled)return;const id=$('car').value,km=+$('km').value,l=latest(id);
  if(l&&km<l.mileage&&!confirm('Stav km je nižší než poslední evidovaný. Opravdu uložit?'))return;
  try{
    const splitDot=$('splitDot').checked;
    const r=await api('addRecord',{carId:id,season,dot:splitDot?'':$('dot').value,splitDot,dotFront:splitDot?$('dotFront').value:'',dotRear:splitDot?$('dotRear').value:'',mileage:km,tireTaskId:pendingTireTaskId||null});
    pendingTireTaskId=null;$('dot').value='';$('dotFront').value='';$('dotRear').value='';$('splitDot').checked=false;$('singleDotEntry').hidden=false;$('splitDotEntry').hidden=true;$('km').value='';season='';$('summer').classList.remove('on');$('winter').classList.remove('on');
    note($('saveMsg'),r.tireTaskCompleted?'✅ Uloženo. Vozidlo v TASKu je hotové.':r.tireTaskLinked?'✅ PNEU/DOT uložené. Vrať se do TASKu a dokonči vozidlo.':'✅ Uloženo a sdíleno online.','msg ok');
    await refresh();setTimeout(()=>$('saveMsg').innerHTML='',2200)
  }catch(x){note($('saveMsg'),errorText(x),'msg err')}
};

// Push notifications
function b64ToBytes(base64){const pad='='.repeat((4-base64.length%4)%4),s=(base64+pad).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(s);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
async function ensureSW(){if(!('serviceWorker'in navigator))return null;if(swReg)return swReg;swReg=await navigator.serviceWorker.register('/service-worker.js');await navigator.serviceWorker.ready;return swReg}
async function currentSubscription(){try{const reg=await ensureSW();return reg?await reg.pushManager.getSubscription():null}catch{return null}}
async function syncExistingPushSubscription(){
  if(!tok||!me)return;
  const sub=await currentSubscription();if(!sub)return;
  // A browser subscription belongs to this device, and survives profile
  // changes. Bind it to the authenticated profile before enabling TASK work.
  try{const r=await api('pushBindDevice',{subscription:sub.toJSON()});if(r.notificationsEnabled===false)await sub.unsubscribe().catch(()=>{})}
  catch(x){await sub.unsubscribe().catch(()=>{});console.warn('Přihlášení zařízení k oznámením se nepodařilo.',x.code)}
}
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
  if(t.assignedToUserId&&!t.acceptedAt&&!['completed','closed'].includes(t.status))return {label:'ČEKÁ NA PŘIJETÍ',icon:'🟡'};
  return t.status==='in_progress'?{label:'PRÁVĚ DĚLÁŠ',icon:'🔵'}:
    t.status==='completed'?{label:'PNEU/DOT HOTOVO',icon:'🟢'}:
    t.status==='problem'?{label:'PROBLÉM',icon:'🔴'}:
    t.acceptedAt?{label:'PŘIJATO',icon:'✅'}:{label:'ČEKÁ NA ZPRACOVÁNÍ',icon:'⚪'};
}
function renderHomeAssignedTasks(){
  const card=$('homeMyTasks'),list=$('homeMyTasksList');if(!card||!list)return;
  const rows=(D.myTaskSummary||[]).filter((t)=>t.status!=='closed').slice().sort((a,b)=>(String(a.date||'')+'T'+String(a.time||'23:59')).localeCompare(String(b.date||'')+'T'+String(b.time||'23:59')));
  card.hidden=!rows.length;if(!rows.length)return;
  $('homeMyTasksCount').textContent=String(Number(D.myTaskCount??rows.length));
  list.innerHTML=rows.slice(0,4).map((t)=>{
    const sm=t.vehicleCount?dailyTaskStatus(t):myTaskStatusMeta(t),title=t.kind==='carryover'?'↪️ '+(t.cars?.[0]?.carPlate||t.carPlate||'Předané vozidlo'):t.vehicleCount?'📋 Denní TASK · '+t.vehicleCount+' vozidel':t.carPlate||'TASK';
    const plates=t.cars?.map(c=>c.carPlate).join(', ')||t.carName||'';
    return '<button class="home-task-row" data-home-task="'+e(t.id)+'"><span class="home-task-main"><span class="home-task-title">'+e(title)+'</span><span class="home-task-meta">'+e(taskDateLabel(t))+(plates?' · '+e(plates):'')+'</span></span><span class="home-task-status">'+sm.icon+' '+sm.label+'</span></button>';
  }).join('')+(Number(D.myTaskCount??rows.length)>4?'<div class="small" style="margin-top:7px">＋ další '+(Number(D.myTaskCount??rows.length)-4)+' přiřazené TASKy</div>':'');
  document.querySelectorAll('[data-home-task]').forEach((b)=>b.onclick=()=>openSpecificTask(b.dataset.homeTask));
  if($('homeMyTasksOpen'))$('homeMyTasksOpen').onclick=()=>openModule('tiretask');
}
function clearTaskUrl(){
  const u=new URL(location.href);if(!u.searchParams.has('task'))return;
  u.searchParams.delete('task');history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams:'')+u.hash);
}
function openSpecificTask(id){
  if(!id)return;openModule('tiretask');
  loadTaskData(true).then(()=>{
    const esc=CSS.escape(id),el=document.querySelector('.task-vehicle[data-task-id="'+esc+'"]')||document.querySelector('.task-daily[data-group-id="'+esc+'"]');
    if(el){if(el.tagName==='DETAILS')el.open=true;el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('flash-focus');setTimeout(()=>el.classList.remove('flash-focus'),1900)}
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
    v==='cancelled'?{label:'DOKONČENÍ ZRUŠENO',icon:'⏹'}:
    {label:'PLÁNOVÁNO',icon:'⚪'};
}
function tireTaskCaps(){return D.tireTaskCapabilities||{view:true,create:false,edit:false,progress:false,comment:true,close:false,delete:false}}
function taskDurationLabel(from,to){
  const a=Date.parse(from||''),b=Date.parse(to||'');if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return '—';
  const mins=Math.round((b-a)/60000),h=Math.floor(mins/60),m=mins%60;return h?(h+' h '+m+' min'):(m+' min');
}
function newTireTaskDraftRow(seed={}){
  return {key:String(++tireTaskDraftSeq),time:seed.time||'',carId:seed.carId||'',category:seed.category||'',firstSeason:seed.firstSeason||(seed.targetSeason==='summer'?'winter':'summer'),search:seed.search||'',instructions:seed.instructions||''};
}
function ensureTireTaskDraft(){if(!tireTaskDraftRows.length)tireTaskDraftRows=[newTireTaskDraftRow()]}
function tireTaskCategoryOptions(selected=''){
  return '<option value="">Vyber skupinu…</option>'+(D.vehicleCategories||[]).map(x=>'<option value="'+e(x)+'" '+(x===selected?'selected':'')+'>'+e(x)+'</option>').join('');
}
function tireTaskPlateQuery(v){return String(v||'').normalize('NFKD').toLocaleUpperCase('cs-CZ').replace(/[^A-Z0-9]/g,'')}
function tireTaskVehicleSource(){return Array.isArray(D.tireTaskCars)?D.tireTaskCars:(D.cars||[])}
function tireTaskDraftCarMatches(row){
  const q=tireTaskPlateQuery(row.search);
  return tireTaskVehicleSource().filter(c=>!q||tireTaskPlateQuery(c.plate).startsWith(q)).sort((a,b)=>String(a.plate||'').localeCompare(String(b.plate||''),'cs'));
}
function tireTaskDraftCarOptions(row){
  const cars=tireTaskDraftCarMatches(row);
  const label=cars.length?'Vyber vozidlo…':row.category?'Ve skupině nejsou odpovídající vozidla':'Žádné vozidlo nenalezeno';
  return '<option value="">'+label+'</option>'+cars.map(c=>'<option value="'+e(c.id)+'" '+(c.id===row.carId?'selected':'')+'>'+e(c.plate)+' — '+e(c.name||'')+(c.category?' · '+e(c.category):'')+'</option>').join('');
}
function tireTaskDraftSuggestions(row){
  const q=tireTaskPlateQuery(row.search);if(!q)return '';
  const cars=tireTaskDraftCarMatches(row).slice(0,12);
  if(!cars.length)return '<div class="tt-plan-suggestion-empty">Žádná SPZ nezačíná na <b>'+e(q)+'</b></div>';
  return cars.map(c=>'<button type="button" class="tt-plan-suggestion" data-car-id="'+e(c.id)+'"><span class="tt-plan-suggestion-plate">'+e(c.plate)+'</span><span class="tt-plan-suggestion-meta">'+e(c.name||'Bez názvu')+(c.category?' · '+e(c.category):'')+'</span></button>').join('');
}
function collectTireTaskDraftRows(){
  if(!$('tireTaskRows'))return tireTaskDraftRows;
  document.querySelectorAll('.tiretask-plan-row').forEach(el=>{
    const row=tireTaskDraftRows.find(x=>x.key===el.dataset.key);if(!row)return;
    row.time=el.querySelector('.tt-plan-time')?.value||'';
    row.search=el.querySelector('.tt-plan-search')?.value||'';
    row.carId=el.querySelector('.tt-plan-car')?.value||'';
    row.category=el.querySelector('.tt-plan-category')?.value||'';
    row.firstSeason=el.querySelector('.tt-plan-season')?.value||'summer';
    row.instructions=el.querySelector('.tt-plan-instructions')?.value||'';
  });
  return tireTaskDraftRows;
}
function renderTireTaskDraft(){
  if(!$('tireTaskRows'))return;
  ensureTireTaskDraft();
  $('tireTaskRows').innerHTML=tireTaskDraftRows.map((row,index)=>'<div class="tiretask-plan-row" data-key="'+e(row.key)+'">'+
    '<div class="tiretask-plan-row-head"><b>Vozidlo '+(index+1)+'</b><div class="toolbar">'+(index>0?'<button class="tt-plan-move secondary" data-key="'+e(row.key)+'" data-direction="-1" aria-label="Posunout vozidlo nahoru">↑</button>':'')+(index<tireTaskDraftRows.length-1?'<button class="tt-plan-move secondary" data-key="'+e(row.key)+'" data-direction="1" aria-label="Posunout vozidlo dolů">↓</button>':'')+(tireTaskDraftRows.length>1?'<button class="tt-plan-remove danger-btn" data-key="'+e(row.key)+'">✕ Odebrat</button>':'')+'</div></div>'+
    '<div class="tiretask-plan-grid">'+
      '<div><div class="filter-label">Čas</div><input class="tt-plan-time" type="time" value="'+e(row.time)+'"><div class="small" style="margin-top:3px">Prázdné = celý den</div></div>'+
      '<div><div class="filter-label">Vozidlo</div><div class="tt-plan-search-box"><div class="search-wrap"><span class="search-icon">🔎</span><input class="tt-plan-search" type="search" autocomplete="off" autocapitalize="characters" spellcheck="false" value="'+e(row.search)+'" placeholder="Začni psát SPZ, např. AX…"></div><div class="tt-plan-suggestions" '+(tireTaskPlateQuery(row.search)?'':'hidden')+'>'+tireTaskDraftSuggestions(row)+'</div></div><select class="tt-plan-car">'+tireTaskDraftCarOptions(row)+'</select></div>'+
      '<div><div class="filter-label">Skupina</div><select class="tt-plan-category">'+tireTaskCategoryOptions(row.category)+'</select></div>'+
      '<div><div class="filter-label">Pořadí zápisu DOT</div><select class="tt-plan-season" aria-label="Pořadí zápisu DOT"><option value="summer" '+(row.firstSeason==='summer'?'selected':'')+'>☀️ Letní → ❄️ Zimní</option><option value="winter" '+(row.firstSeason==='winter'?'selected':'')+'>❄️ Zimní → ☀️ Letní</option></select></div>'+
    '</div><div style="margin-top:8px"><label class="filter-label">Instrukce k tomuto vozidlu (volitelné)</label><input class="tt-plan-instructions" maxlength="700" value="'+e(row.instructions)+'" placeholder="Klíče, předání vozidla, požadavek řidiče…"></div></div>').join('');
  $('tireTaskRowCount').textContent=tireTaskDraftRows.length+' vozidel';
  $('addTireTaskRow').disabled=tireTaskDraftRows.length>=20;
  document.querySelectorAll('.tiretask-plan-row').forEach(el=>{
    const key=el.dataset.key,row=tireTaskDraftRows.find(x=>x.key===key);
    const search=el.querySelector('.tt-plan-search'),suggestions=el.querySelector('.tt-plan-suggestions'),carSel=el.querySelector('.tt-plan-car'),catSel=el.querySelector('.tt-plan-category');
    const refreshCarSearch=()=>{
      const current=row.carId;carSel.innerHTML=tireTaskDraftCarOptions(row);
      if(current&&[...carSel.options].some(o=>o.value===current))carSel.value=current;else{row.carId='';carSel.value=''}
      suggestions.innerHTML=tireTaskDraftSuggestions(row);suggestions.hidden=!tireTaskPlateQuery(row.search);
      suggestions.querySelectorAll('.tt-plan-suggestion').forEach(b=>b.onclick=()=>{
        const car=tireTaskVehicleSource().find(c=>c.id===b.dataset.carId);if(!car)return;
        row.carId=car.id;row.search=car.plate||'';search.value=row.search;
        if(car.category&&(D.vehicleCategories||[]).includes(car.category)){row.category=car.category;catSel.value=car.category}
        carSel.innerHTML=tireTaskDraftCarOptions(row);carSel.value=row.carId;suggestions.hidden=true;
      });
    };
    search.oninput=()=>{row.search=search.value;const selected=tireTaskVehicleSource().find(c=>c.id===row.carId);if(selected&&tireTaskPlateQuery(search.value)!==tireTaskPlateQuery(selected.plate))row.carId='';refreshCarSearch()};
    search.onfocus=()=>{row.search=search.value;if(tireTaskPlateQuery(row.search)){suggestions.innerHTML=tireTaskDraftSuggestions(row);suggestions.hidden=false}};
    search.onblur=()=>setTimeout(()=>suggestions.hidden=true,140);
    carSel.onchange=()=>{row.carId=carSel.value;const car=tireTaskVehicleSource().find(c=>c.id===row.carId);if(car){row.search=car.plate||'';search.value=row.search;suggestions.hidden=true}if(car?.category&&(D.vehicleCategories||[]).includes(car.category)){row.category=car.category;catSel.value=car.category;carSel.innerHTML=tireTaskDraftCarOptions(row);carSel.value=row.carId}};
    el.querySelector('.tt-plan-time').onchange=x=>row.time=x.target.value;
    catSel.onchange=x=>{row.category=x.target.value;const selected=tireTaskVehicleSource().find(c=>c.id===row.carId);if(selected&&row.category&&selected.category!==row.category){row.carId='';row.search='';search.value=''}refreshCarSearch()};
    el.querySelector('.tt-plan-season').onchange=x=>row.firstSeason=x.target.value;
    el.querySelector('.tt-plan-instructions').oninput=x=>row.instructions=x.target.value;
  });
  document.querySelectorAll('.tt-plan-move').forEach(b=>b.onclick=()=>{collectTireTaskDraftRows();const index=tireTaskDraftRows.findIndex(r=>r.key===b.dataset.key),target=index+Number(b.dataset.direction);if(target<0||target>=tireTaskDraftRows.length)return;[tireTaskDraftRows[index],tireTaskDraftRows[target]]=[tireTaskDraftRows[target],tireTaskDraftRows[index]];renderTireTaskDraft()});
  document.querySelectorAll('.tt-plan-remove').forEach(b=>b.onclick=()=>{collectTireTaskDraftRows();tireTaskDraftRows=tireTaskDraftRows.filter(x=>x.key!==b.dataset.key);ensureTireTaskDraft();renderTireTaskDraft()});
}
function tireTaskAssignableOptions(selected=''){
  return '<option value="">👥 Čeká na přiřazení</option>'+(D.tireTaskAssignableUsers||[]).map(u=>'<option value="'+e(u.id)+'" '+(u.id===selected?'selected':'')+'>'+e(u.name)+' · '+e(roleLabel(u.role))+'</option>').join('');
}
function fillTireTaskAssignees(){
  if(!$('tireTaskAssignee'))return;
  const cur=$('tireTaskAssignee').value;
  $('tireTaskAssignee').innerHTML=tireTaskAssignableOptions(cur);
  if(cur&&(D.tireTaskAssignableUsers||[]).some(u=>u.id===cur))$('tireTaskAssignee').value=cur;
}
function tireTaskTimeLabel(t){return t.time?e(t.time):'CELÝ DEN'}
const taskDrafts=new Map(),taskSeasonDrafts=new Map(),taskDraftTimers=new Map(),taskDraftWrites=new Map(),taskDraftStates=new Map(),taskOpenVehicles=new Set(),taskBusy=new Set(),taskRecordRequests=new Map(),taskDraftSequences=new Map(),taskDraftClientId=crypto.randomUUID();
let taskHandoverId=null,taskCreateRequest=null,taskDotContext=null,taskDotSaving=false,taskDotLoading=false,taskEditContext=null;
function dailyTasks(){return D.tireTaskGroups||[]}
function dailyTaskForVehicle(id){return dailyTasks().find(g=>g.cars.some(t=>t.id===id))}
function taskWorkerCanWork(t){return !isReadOnly()&&t.assignedToUserId===me?.id&&!t.workClosedAt&&!['closed','handed_over','cancelled'].includes(t.status)}
function taskDotOrder(t){return Array.isArray(t.dotOrder)&&t.dotOrder.length===2?t.dotOrder:t.targetSeason==='summer'?['winter','summer']:['summer','winter']}
function taskSeasonLabel(s){return s==='summer'?'☀️ Letní':'❄️ Zimní'}
function taskOrderLabel(t){return taskDotOrder(t).map(taskSeasonLabel).join(' → ')}
function taskNextSeason(t){return taskDotOrder(t).find(s=>!t.seasonRecordReady?.[s])||taskDotOrder(t)[1]}
function taskInputDraft(t,s=taskDotContext?.id===t.id?taskDotContext.season:taskNextSeason(t)){
  const local=taskDrafts.get(t.id),saved=taskSeasonDrafts.get(t.id+':'+s)||t.drafts?.[s]||(t.draft?.season===s?t.draft:null)||t.seasonRecords?.[s];
  const draft=local?.season===s?local:saved;
  if(draft)return {...draft,season:s,mileage:String(draft.mileage??'')};
  return {season:s,splitDot:false,dot:'',dotFront:'',dotRear:'',mileage:String(local?.mileage||t.draft?.mileage||(t.lastMileage??t.latestMileage??''))};
}
function readTaskForm(id){
  if(taskDotContext?.id!==id)return taskDrafts.get(id)||taskInputDraft((D.tireTasks||[]).find(t=>t.id===id)||{});
  return {season:taskDotContext.season,splitDot:$('splitDot').checked,dot:$('dot').value,dotFront:$('dotFront').value,dotRear:$('dotRear').value,mileage:$('km').value};
}
function taskDraftMissing(d){
  const missing=[];if(d.splitDot){if(!validDot(d.dotFront))missing.push('DOT přední');if(!validDot(d.dotRear))missing.push('DOT zadní')}else if(!validDot(d.dot))missing.push('DOT');
  if(!/^\d{1,7}$/.test(String(d.mileage)))missing.push('stav kilometrů');return missing;
}
function captureTaskWork(){
  if(taskDotContext){const draft=readTaskForm(taskDotContext.id);taskDrafts.set(taskDotContext.id,draft);taskSeasonDrafts.set(taskDotContext.id+':'+draft.season,draft)}
  document.querySelectorAll('.task-vehicle').forEach(el=>{if(el.open)taskOpenVehicles.add(el.dataset.vehicleId);else taskOpenVehicles.delete(el.dataset.vehicleId)});
}
function taskNoticeHtml(t){
  const comments=(t.comments||[]).slice(-5).map(x=>'<div class="tiretask-comment"><b>'+e(x.userName)+'</b> <span class="small">'+dt(x.at)+'</span><div>'+e(x.text)+'</div></div>').join('');
  const history=(t.activity||[]).slice().reverse().map(x=>'<div>'+dt(x.at)+' · '+e(x.userName||'Systém')+' · '+e(x.text)+'</div>').join('');
  return '<details class="task-vehicle-more"><summary>Poznámky a průběh práce'+(t.comments?.length?' · '+t.comments.length:'')+'</summary>'+comments+
    (taskWorkerCanWork(t)||(!t.workClosedAt&&tireTaskCaps().edit)?'<div class="tiretask-comment-form"><input class="tt-comment-input" data-id="'+e(t.id)+'" maxlength="500" aria-label="Poznámka k vozidlu '+e(t.carPlate)+'" placeholder="Doplnit poznámku…"><button class="tt-comment secondary" data-id="'+e(t.id)+'">Přidat</button></div>':'')+
    '<div class="tiretask-activity">'+history+'</div></details>';
}
function taskSeasonProgressHtml(t){
  return '<div class="task-season-progress">'+taskDotOrder(t).map((s,i)=>{
    const r=t.seasonRecords?.[s],ready=!!t.seasonRecordReady?.[s],draft=taskInputDraft(t,s),partial=!!(draft.dot||draft.dotFront||draft.dotRear);
    return '<div class="task-season-row '+(ready?'saved':'')+'" data-season="'+s+'"><b>'+(i+1)+'. '+taskSeasonLabel(s)+'</b><div>'+(ready?'✅ DOT '+e(r.dotSummary)+' · '+Number(r.mileage).toLocaleString('cs-CZ')+' km':partial?'✏️ Rozpracováno · ulož záznam':r?'⚠ Doplň platný záznam':'⏳ Čeká na doplnění')+'</div>'+(ready?'<div class="small">'+e(r.savedBy||'')+' · '+dt(r.savedAt)+'</div>':'')+'</div>';
  }).join('')+'</div>';
}
function taskVehicleHtml(t,g,archive=false){
  const finished=['completed','closed'].includes(t.status),handed=!!t.handoverTaskId,owned=taskWorkerCanWork(t),accepted=!!g.acceptedAt,canWork=owned&&accepted,remaining=g.cars.filter(x=>!['completed','closed','handed_over'].includes(x.status));
  const last=remaining.length===1&&remaining[0].id===t.id,meta=t.status==='cancelled'?tireTaskStatusMeta(t.status):handed?{label:'PŘEDÁNO DO DALŠÍHO DNE',icon:'↗️'}:tireTaskStatusMeta(t.status);
  const expanded=(!finished||archive)&&(taskOpenVehicles.has(t.id)||(!archive&&['in_progress','problem'].includes(t.status)));
  let actions='',form='';
  if(!archive&&canWork&&!finished){
    if(t.status!=='in_progress')actions+='<button class="tt-start primary" data-id="'+e(t.id)+'">▶ Pracuji na tom</button>';
    if(t.startedAt&&can('dotCreate')){
      form='<div class="task-dot-actions"><button class="tt-write-dot secondary" data-id="'+e(t.id)+'" style="width:100%">🛞 Zapsat DOT</button>'+
        (!last?'<button class="tt-finish-vehicle primary" data-id="'+e(t.id)+'" style="width:100%;margin-top:8px">✅ Dokončit</button>':'<div class="small" style="margin-top:8px">Po uložení obou sad dokončíš poslední vozidlo společně s celým TASKem tlačítkem níže.</div>')+'</div>';
    }else if(t.startedAt){
      form='<div class="small">Pro zápis pneumatik potřebuješ právo Zapisovat DOT.</div>';
    }
    actions+='<button class="tt-problem danger-btn" data-id="'+e(t.id)+'">⚠ Problém</button>';
  }
  if(tireTaskCaps().edit&&!isReadOnly())actions+='<button class="tt-edit secondary" data-id="'+e(t.id)+'">✏️ Upravit vozidlo</button>';
  return '<details class="task-vehicle tiretask-card '+e(t.status)+'" data-vehicle-id="'+e(t.id)+'" data-task-id="'+e(t.id)+'" '+(expanded?'open':'')+'><summary class="task-vehicle-summary"><div><div class="small">Vozidlo '+((t.batchIndex??g.cars.indexOf(t))+1)+' · '+tireTaskTimeLabel(t)+'</div><b class="task-vehicle-plate">'+e(t.carPlate)+'</b><div class="small">'+e(t.carName||'Bez názvu')+'</div></div><span class="tiretask-status '+e(t.status)+'">'+meta.icon+' '+meta.label+'</span></summary><div class="task-vehicle-body">'+
    '<div class="tiretask-badges"><span class="tiretask-badge">'+e(t.category)+'</span><span class="tiretask-badge">'+e(taskOrderLabel(t))+'</span></div>'+
    (t.instructions?'<div class="tiretask-instructions"><b>Instrukce k vozidlu</b><div>'+e(t.instructions)+'</div></div>':'')+
    (t.problemNote?'<div class="tiretask-problem"><b>⚠ Problém</b><div>'+e(t.problemNote)+'</div></div>':'')+
    taskSeasonProgressHtml(t)+
    (t.handedOverAt?'<div class="tiretask-instructions"><b>↗️ Vozidlo zůstalo v servisu</b><div>'+e(t.handedOverBy)+' · '+dt(t.handedOverAt)+' · dokončení '+e(t.handoverDate)+'</div>'+(t.handoverNote?'<div>'+e(t.handoverNote)+'</div>':'')+(t.status==='cancelled'?'<div class="small">⏹ Dokončení zrušil '+e(t.continuationCancelledBy)+' · '+dt(t.continuationCancelledAt)+'</div>':t.status==='closed'&&t.completedAt?'<div class="tiretask-complete">Dokončil '+e(t.completedBy)+' · '+dt(t.completedAt)+'</div>':'<div class="small">Systém čeká na dokončení samostatného navazujícího TASKu.</div>')+'</div>':'')+
    (t.kind==='carryover'?'<div class="tiretask-instructions"><b>↪️ Navazuje na předání od '+e(t.handoverFrom||'pracovníka')+'</b><div>'+dt(t.handoverAt)+(t.handoverNote?' · '+e(t.handoverNote):'')+'</div>'+(t.sourceTaskId?'<button class="tt-origin secondary" data-id="'+e(t.sourceTaskId)+'">Zobrazit původní TASK</button>':t.sourceTaskRemovedAt?'<div class="small">Původní TASK byl smazán. Tento samostatný TASK můžeš dál dokončit.</div>':'')+'</div>':'')+
    '<details class="my-task-details"><summary>Dosavadní údaje o vozidle</summary><div class="my-task-detail-grid"><div class="my-task-detail"><span>Poslední km</span><b>'+(t.latestMileage==null?'—':Number(t.latestMileage).toLocaleString('cs-CZ')+' km')+'</b></div><div class="my-task-detail"><span>☀️ Letní DOT</span><b>'+e(t.latestSummerDot||'—')+'</b></div><div class="my-task-detail"><span>❄️ Zimní DOT</span><b>'+e(t.latestWinterDot||'—')+'</b></div></div></details>'+
    (actions?'<div class="toolbar">'+actions+'</div>':'')+form+taskNoticeHtml(t)+'</div></details>';
}
function dailyTaskStatus(g){
  if(g.systemCompleted)return {label:'HOTOVÝ TASK',icon:'✅'};
  if(g.systemResolved)return {label:'UKONČENO · DOKONČENÍ ZRUŠENO',icon:'⏹'};
  if(g.workClosed)return {label:'HOTOVÝ PRO MĚ · ČEKÁ NA DOT',icon:'↗️'};
  if(!g.assignedToUserId)return {label:'ČEKÁ NA PŘIŘAZENÍ',icon:'👥'};
  if(!g.acceptedAt)return {label:'ČEKÁ NA PŘIJETÍ',icon:'🟡'};
  if(g.status==='problem')return {label:'PROBLÉM',icon:'🔴'};
  if(g.status==='in_progress')return {label:'ROZPRACOVÁNO',icon:'🔵'};
  if(g.status==='ready_to_close')return {label:'PŘIPRAVENO K UKONČENÍ',icon:'🟢'};
  return {label:'PŘIJATO',icon:'✅'};
}
function taskPlanToolsHtml(g){
  const caps=tireTaskCaps();if(isReadOnly()||!caps.edit&&!caps.delete)return '';
  const locked=g.workClosed||g.cars.some(t=>t.startedAt||['completed','closed'].includes(t.status))&&!g.cars.every(t=>t.releasedAfterUserDeletion),id=e(g.cars[0].id);
  return '<div class="task-plan-controls">'+(caps.edit?'<div><label class="filter-label">Pracovník pro celý TASK</label><select class="tt-group-assignee" data-id="'+id+'" '+(locked?'disabled':'')+'>'+tireTaskAssignableOptions(g.assignedToUserId)+(g.assignedToUserId&&!(D.tireTaskAssignableUsers||[]).some(u=>u.id===g.assignedToUserId)?'<option value="'+e(g.assignedToUserId)+'" selected>'+e(g.assignedToName||'Původní pracovník')+'</option>':'')+'</select></div><button class="tt-group-edit secondary" data-id="'+id+'">✏️ Upravit TASK</button>':'')+(caps.delete?'<button class="tt-delete danger-btn" data-id="'+id+'">🗑 Smazat TASK</button>':'')+'</div>';
}
function dailyTaskHtml(g,archive=false){
  const sm=dailyTaskStatus(g),own=g.assignedToUserId===me?.id,canWork=own&&!g.workClosed&&!isReadOnly(),remaining=g.cars.filter(t=>!['completed','closed','handed_over'].includes(t.status)),last=remaining.length===1?remaining[0]:null;
  const name=g.kind==='carryover'?'↪️ Dokončení předaného vozidla':'📋 Denní TASK';
  const doneForWork=g.cars.filter(t=>['completed','closed'].includes(t.status)&&!t.handedOverAt).length;
  const progress=g.cancelledCount?g.completedCount+' dokončeno · '+g.cancelledCount+' zrušeno':g.workClosureReason==='handover'?doneForWork+' dokončeno · 1 předáno':g.completedCount+' / '+g.vehicleCount+' vozidel dokončeno';
  let actions='';
  if(canWork&&!g.acceptedAt)actions='<button class="tt-accept primary" data-id="'+e(g.cars[0].id)+'" style="width:100%">✅ Přijmout TASK</button>';
  if(canWork&&g.acceptedAt&&remaining.length<=1){
    actions='<div class="task-final-actions"><button class="tt-finish-group primary" data-id="'+e(g.cars[0].id)+'" data-group="'+e(g.id)+'">✅ Kompletně vyplněno – Ukončit</button>'+
      (last?'<button class="tt-handover secondary" data-id="'+e(last.id)+'" '+(!last.startedAt?'disabled':'')+'>↗️ Ukončit a přiřadit na druhý den</button>':'')+'</div><div class="small task-final-help" data-group="'+e(g.id)+'"></div>';
  }
  const adminTools=taskPlanToolsHtml(g);
  return '<article class="task-daily card '+(g.kind==='carryover'?'task-carryover ':'')+(g.workClosed?'task-work-closed':'')+'" data-group-id="'+e(g.id)+'" data-my-task-id="'+e(g.id)+'"><div class="tiretask-head"><div><div class="small">'+name+'</div><h3 class="task-daily-title">'+e(taskDateLabel(g))+' · '+g.vehicleCount+' '+(g.vehicleCount===1?'vozidlo':'vozidla')+'</h3><div class="small">👤 '+e(g.assignedToName||'Čeká na přiřazení')+'</div></div><span class="tiretask-status '+e(g.systemCompleted?'closed':g.status)+'">'+sm.icon+' '+sm.label+'</span></div>'+
    '<div class="task-group-progress"><div class="season-progress"><i style="width:'+Math.round((g.workClosed?g.vehicleCount:g.completedCount)/g.vehicleCount*100)+'%"></i></div><b>'+e(progress)+'</b></div>'+
    (g.instructions?'<div class="tiretask-instructions"><b>Instrukce k celému TASKu</b><div>'+e(g.instructions)+'</div></div>':'')+
    (g.acceptedAt?'<div class="small task-accept-meta">✅ Přijal '+e(g.acceptedBy)+' · '+dt(g.acceptedAt)+'</div>':'')+adminTools+
    (g.workClosed?'<div class="tiretask-complete"><b>'+(g.cancelledCount?'Dokončení předaného vozidla zrušeno':g.workClosureReason==='handover'?'Práce ukončena s předáním':'TASK kompletně dokončen')+'</b><div>'+e(g.workClosedBy)+' · '+dt(g.workClosedAt)+'</div>'+(g.handedOver&&!g.cancelledCount?'<div class="small">'+(g.systemCompleted?'Systémově dokončeno · '+e(g.systemCompletedBy)+' · '+dt(g.systemCompletedAt):'V systému zbývá dokončit předané vozidlo.')+'</div>':'')+'</div>':'')+
    '<div class="task-vehicles">'+g.cars.map(t=>taskVehicleHtml(t,g,archive)).join('')+'</div>'+(actions?'<div class="task-group-actions">'+actions+'</div>':'')+'</article>';
}
function renderMyTireTasks(){
  const rows=dailyTasks().filter(g=>g.assignedToUserId===me?.id&&!g.workClosed),groups={overdue:[],today:[],tomorrow:[],later:[]};rows.forEach(g=>groups[taskBucket(g)].push(g));
  $('tireTaskMineCard').hidden=!rows.length;$('tireTaskMineCount').textContent=rows.length+' TASKů';
  $('tireTaskMineList').innerHTML=['overdue','today','tomorrow','later'].map(key=>groups[key].length?'<section class="my-task-group '+key+'"><div class="my-task-group-title">'+taskBucketMeta(key).label+'</div>'+groups[key].map(g=>dailyTaskHtml(g)).join('')+'</section>':'').join('');
}
function renderTireTaskArchive(){
  const card=$('tireTaskArchiveCard'),list=$('tireTaskArchiveList');if(!card||!list)return;
  const all=can('tireTaskCompletedView')||tireTaskCaps().edit||tireTaskCaps().delete,q=String($('tireTaskArchiveSearch').value||'').trim().toLocaleLowerCase('cs-CZ'),select=$('tireTaskArchiveUser'),user=select.value,from=$('tireTaskArchiveFrom').value,to=$('tireTaskArchiveTo').value;
  select.innerHTML='<option value="">'+(all?'Všichni pracovníci':'Moje historie')+'</option>'+(D.tireTaskArchiveUsers||[]).map(u=>'<option value="'+e(u.id)+'">'+e(u.name)+'</option>').join('');select.value=user;select.hidden=!all;
  const originIds=new Set(dailyTasks().filter(g=>g.assignedToUserId===me?.id&&g.originBatchId).map(g=>g.originBatchId));
  for(const assigned of dailyTasks().filter(g=>g.assignedToUserId===me?.id)){
    let id=assigned.sourceTaskId;const seen=new Set();while(id&&!seen.has(id)){seen.add(id);const source=(D.tireTasks||[]).find(t=>t.id===id);if(!source)break;originIds.add(source.batchId||source.id);id=source.sourceTaskId}
  }
  const archive=dailyTasks().filter(g=>g.workClosed&&(all||g.assignedToUserId===me?.id||originIds.has(g.id)));card.hidden=!archive.length;
  const rows=archive.filter(g=>{
    const hay=[g.assignedToName,g.acceptedBy,g.workClosedBy,g.systemCompletedBy,...g.cars.flatMap(t=>[t.carPlate,t.carName,t.completedDot,t.seasonRecords?.summer?.dotSummary,t.seasonRecords?.winter?.dotSummary,t.completedBy,t.instructions])].join(' ').toLocaleLowerCase('cs-CZ'),stamp=g.workClosedAt?localDateISO(new Date(g.workClosedAt)):g.date;
    return (!q||hay.includes(q))&&(!user||g.assignedToUserId===user||g.cars.some(t=>t.completedById===user))&&(!from||stamp>=from)&&(!to||stamp<=to);
  }).sort((a,b)=>String(b.workClosedAt||b.date).localeCompare(String(a.workClosedAt||a.date)));
  $('tireTaskArchiveCount').textContent=rows.length+' TASKů';list.innerHTML=rows.map(g=>dailyTaskHtml(g,true)).join('')||'<div class="small">Žádný TASK neodpovídá filtrům.</div>';
  ['tireTaskArchiveSearch','tireTaskArchiveUser','tireTaskArchiveFrom','tireTaskArchiveTo'].forEach(id=>{$(id).oninput=()=>{captureTaskWork();renderTireTaskArchive();bindTaskActions()};$(id).onchange=$(id).oninput});
  $('tireTaskArchiveClear').onclick=()=>{['tireTaskArchiveSearch','tireTaskArchiveUser','tireTaskArchiveFrom','tireTaskArchiveTo'].forEach(id=>$(id).value='');renderTireTaskArchive();bindTaskActions()};
}
function renderTireTaskCarryovers(){
  const el=$('tireTaskCarryovers');if(!el)return;const date=$('tireTaskDate').value,owner=$('tireTaskAssignee').value,selected=new Set([...el.querySelectorAll('.tt-carryover-choice:checked:not(:disabled)')].map(input=>input.dataset.id));
  const rows=dailyTasks().filter(g=>g.kind==='carryover'&&!g.assignedToUserId&&!g.workClosed&&g.date===date);
  const people=new Set(dailyTasks().filter(g=>g.kind!=='carryover'&&g.date===date&&!g.workClosed&&g.assignedToUserId).map(g=>g.assignedToUserId));if(owner)people.add(owner);
  const auto=owner&&people.size===1;el.hidden=!rows.length;
  el.innerHTML='<b>↪️ Předaná vozidla na tento den</b><div class="small">'+(auto?'Automaticky se přiřadí stejnému pracovníkovi jako samostatné TASKy.':'Vyber, která předaná vozidla má převzít pracovník tohoto plánu. Zůstanou samostatnými TASKy.')+'</div>'+rows.map(g=>'<label class="switchline"><input class="tt-carryover-choice" data-id="'+e(g.cars[0].id)+'" type="checkbox" '+(auto?'checked disabled':selected.has(g.cars[0].id)?'checked':'')+' '+(!owner?'disabled':'')+'><span>'+e(g.cars[0].carPlate)+' · od '+e(g.cars[0].handoverFrom)+'</span></label>').join('');
}
function renderTireTask(){
  if(!$('tireTaskList'))return;captureTaskWork();collectTireTaskDraftRows();const caps=tireTaskCaps();
  $('tireTaskCreateCard').hidden=!caps.create||isReadOnly();if(!$('tireTaskDate').value)$('tireTaskDate').value=localDateISO();
  renderTireTaskDraft();fillTireTaskAssignees();renderTireTaskCarryovers();renderMyTireTasks();renderTireTaskArchive();
  const rows=dailyTasks().filter(g=>!g.systemResolved),mine=rows.filter(g=>g.assignedToUserId===me?.id&&!g.workClosed);
  const visible=rows.filter(g=>!mine.some(m=>m.id===g.id)&&(!g.workClosed||caps.edit||caps.create||caps.delete));
  const waiting=rows.filter(g=>!g.acceptedAt&&!g.workClosed).length,active=rows.filter(g=>g.acceptedAt&&!g.workClosed).length,handed=rows.filter(g=>g.workClosed).length;
  $('tireTaskStats').innerHTML=[[rows.length,'Aktivní TASKy'],[waiting,'Čeká na přijetí / přiřazení'],[active,'Rozpracováno'],[handed,'Čeká na dokončení předání']].map(([n,label])=>'<div class="tiretask-stat"><b>'+n+'</b><span>'+label+'</span></div>').join('');
  $('tireTaskList').innerHTML=visible.map(g=>g.workClosed?'<div class="card task-pending"><div class="top"><b>↗️ '+e(g.assignedToName)+' · '+e(g.date)+'</b><span class="badge">Čeká na dokončení</span></div><div class="small">'+e(g.cars.find(t=>t.handoverTaskId)?.carPlate||'Vozidlo')+' předáno na další den. Pracovník má den uzavřený v historii.</div><button class="tt-origin secondary" data-id="'+e(g.cars[0].id)+'">Zobrazit historii předání</button>'+taskPlanToolsHtml(g)+'</div>':dailyTaskHtml(g)).join('')||'<div class="card"><div class="small">'+(mine.length?'Další aktivní TASKy nejsou.':'Nejsou žádné aktivní TASKy.')+'</div></div>';
  if(taskEditContext&&(!caps.edit||isReadOnly()||!(D.tireTasks||[]).some(t=>t.id===taskEditContext.id)))closeTaskEdit();
  bindTaskActions();updateTaskValidation();renderTaskDotContext();
}
function updateTaskValidation(){
  document.querySelectorAll('.tt-finish-vehicle').forEach(b=>{const t=(D.tireTasks||[]).find(t=>t.id===b.dataset.id);b.disabled=taskBusy.has(dailyTaskForVehicle(b.dataset.id)?.id)||!t?.recordReady||!can('dotCreate')});
  document.querySelectorAll('.tt-finish-group').forEach(b=>{
    const g=dailyTasks().find(g=>g.id===b.dataset.group);if(!g)return;const remaining=g.cars.filter(t=>!['completed','closed','handed_over'].includes(t.status)),t=remaining[0],missing=t?(t.requiresBothRecords?taskDotOrder(t):[t.targetSeason]).filter(s=>!t.seasonRecordReady?.[s]).map(taskSeasonLabel):[];
    b.disabled=taskBusy.has(g.id)||remaining.length>1||!!t&&!t.startedAt||g.cars.some(t=>!t.recordReady)||!can('dotCreate');
    const help=document.querySelector('.task-final-help[data-group="'+CSS.escape(g.id)+'"]');if(help)help.textContent=t&&!t.startedAt?'U posledního vozidla nejdřív zvol Pracuji na tom.':missing.length?'Pro kompletní ukončení ulož: '+missing.join(', ')+'. Pokud vozidlo zůstává v servisu, můžeš ho předat na další den.':'Ukončením se TASK přesune do historie.';
  });
}
function setTaskDraftState(id,message){taskDraftStates.set(id,message);if(taskDotContext?.id===id)$('taskDotDraftState').textContent=message}
function scheduleTaskDraft(id){
  const draft=readTaskForm(id);taskDrafts.set(id,draft);taskSeasonDrafts.set(id+':'+draft.season,draft);setTaskDraftState(id,'Ukládám rozpracované údaje…');clearTimeout(taskDraftTimers.get(id));
  taskDraftTimers.set(id,setTimeout(()=>persistTaskDraft(id).catch(()=>{}),650));updateTaskValidation();
}
async function persistTaskDraft(id,draft={...readTaskForm(id)}){
  clearTimeout(taskDraftTimers.get(id));taskDraftTimers.delete(id);
  const draftSequence=(taskDraftSequences.get(id)||0)+1;taskDraftSequences.set(id,draftSequence);
  const previous=taskDraftWrites.get(id)||Promise.resolve();
  const pending=previous.catch(()=>{}).then(async()=>{try{const r=await api('tireTaskSaveDraft',{taskId:id,draft,draftClientId:taskDraftClientId,draftSequence});if(JSON.stringify(taskDrafts.get(id))===JSON.stringify(draft))setTaskDraftState(id,'Rozpracované údaje uložené · '+dt(r.savedAt));return r}catch(x){setTaskDraftState(id,'Údaje se nepodařilo uložit. Zůstaň online a zkus to znovu.');throw x}});
  taskDraftWrites.set(id,pending);try{return await pending}finally{if(taskDraftWrites.get(id)===pending)taskDraftWrites.delete(id)}
}
async function taskAction(id,work){
  const g=dailyTaskForVehicle(id),key=g?.id||id;if(taskBusy.has(key))return false;taskBusy.add(key);updateTaskValidation();
  document.querySelectorAll('.task-daily[data-group-id="'+CSS.escape(key)+'"] button').forEach(b=>b.disabled=true);
  try{await work();await refresh();await loadTaskData(true);return true}catch(x){alert(errorText(x));await loadTaskData(true).catch(()=>{});return false}finally{taskBusy.delete(key);renderTireTask()}
}
async function saveTaskVehicleRecord(id,draft=readTaskForm(id)){
  const t=(D.tireTasks||[]).find(t=>t.id===id),missing=taskDraftMissing(draft);if(!t||missing.length)throw Object.assign(new Error('INCOMPLETE'),{data:{message:'Doplň: '+missing.join(', ')+'.'}});
  taskDrafts.set(id,draft);await persistTaskDraft(id);
  const dot=draft.splitDot?'PŘ '+draft.dotFront+' / Z '+draft.dotRear:draft.dot,saved=t.seasonRecords?.[draft.season];
  if(t.seasonRecordReady?.[draft.season]&&saved?.dotSummary===dot&&Number(saved.mileage)===Number(draft.mileage))return;
  const payload={carId:t.carId,season:draft.season,dot:draft.splitDot?'':draft.dot,splitDot:draft.splitDot,dotFront:draft.splitDot?draft.dotFront:'',dotRear:draft.splitDot?draft.dotRear:'',mileage:Number(draft.mileage),tireTaskId:id};
  const key=id+':'+draft.season,signature=JSON.stringify(payload);let request=taskRecordRequests.get(key);if(request?.signature!==signature){request={signature,id:crypto.randomUUID()};taskRecordRequests.set(key,request)}
  await api('addRecord',{...payload,requestId:request.id});
}
function readPneuEntry(){return {carId:$('car').value,category:$('carCategory').value,search:carSearch,season,splitDot:$('splitDot').checked,dot:$('dot').value,dotFront:$('dotFront').value,dotRear:$('dotRear').value,mileage:$('km').value,message:$('saveMsg').innerHTML}}
function fillPneuEntry(d){
  taskDotLoading=true;
  $('dot').value=d.dot||'';$('dotFront').value=d.dotFront||'';$('dotRear').value=d.dotRear||'';$('km').value=d.mileage??'';$('splitDot').checked=!!d.splitDot;
  $('singleDotEntry').hidden=!!d.splitDot;$('splitDotEntry').hidden=!d.splitDot;setSeason(d.season||'');taskDotLoading=false;
}
function renderTaskDotContext(){
  if(!taskDotContext)return;const t=(D.tireTasks||[]).find(t=>t.id===taskDotContext.id);
  if(!t||!taskWorkerCanWork(t)||!can('dotCreate')||['completed','closed'].includes(t.status)){restoreTaskDotForm();return}
  $('taskDotTitle').textContent='🛞 '+t.carPlate+' · Zápis DOT';$('taskDotMeta').textContent=taskOrderLabel(t)+' · '+(t.carName||'');
  $('taskDotProgress').innerHTML=taskSeasonProgressHtml(t);
  const order=taskDotOrder(t);order.forEach((s,i)=>{$(s).style.order=String(i)});
  $('kmHint').textContent='Kilometry zůstanou předvyplněné i pro druhou sadu. Podle tachometru je můžeš upravit.';
}
function fillTaskDotSeason(s,carriedMileage){
  const t=(D.tireTasks||[]).find(t=>t.id===taskDotContext?.id);if(!t)return;
  const known=taskSeasonDrafts.has(t.id+':'+s)||t.drafts?.[s]||t.draft?.season===s||t.seasonRecords?.[s],draft=taskInputDraft(t,s);
  if(!known&&carriedMileage!==undefined)draft.mileage=String(carriedMileage);
  taskDotContext.season=s;taskDrafts.set(t.id,draft);taskSeasonDrafts.set(t.id+':'+s,draft);fillPneuEntry(draft);
  $('taskDotDraftState').textContent=t.draftSavedAts?.[s]?'Rozpracované údaje uložené · '+dt(t.draftSavedAts[s]):'Rozpracované údaje se ukládají automaticky.';
  $('saveMsg').innerHTML='';renderTaskDotContext();
}
function openTaskDot(id){
  const t=(D.tireTasks||[]).find(t=>t.id===id);if(!t||!can('dotCreate'))return;
  if(!taskWorkerCanWork(t)||!t.acceptedAt||t.acceptedById!==me?.id||!t.startedAt)return alert('Nejdřív přijmi TASK a u vozidla zvol Pracuji na tom.');
  if(['completed','closed'].includes(t.status)||taskDotContext)return;
  const entry=$('entry');taskDotContext={id,season:taskNextSeason(t),entryParent:entry.parentNode,entryNext:entry.nextSibling,entryClass:entry.className,previous:readPneuEntry(),returnFocus:document.activeElement,bodyOverflow:document.body.style.overflow};
  $('taskDotFormHost').appendChild(entry);entry.classList.add('active');$('taskDotOverlay').hidden=false;document.body.style.overflow='hidden';
  carSearch='';$('carSearch').value='';$('carCategory').value='';renderCarOptions(t.carId);$('car').value=t.carId;
  fillTaskDotSeason(taskDotContext.season);$('taskDotOverlay').querySelector('.modal-card').scrollTop=0;$('taskDotClose').focus();
}
function restoreTaskDotForm(){
  const context=taskDotContext;if(!context)return;
  taskDotContext=null;taskDotLoading=true;const entry=$('entry');entry.querySelectorAll('input,#pad button').forEach(el=>el.disabled=false);context.entryParent.insertBefore(entry,context.entryNext);entry.className=context.entryClass;
  $('taskDotOverlay').hidden=true;document.body.style.overflow=context.bodyOverflow;
  $('summer').style.order='';$('winter').style.order='';$('save').textContent='✅ ULOŽIT ZÁZNAM';
  carSearch=context.previous.search;$('carSearch').value=carSearch;$('carCategory').value=context.previous.category;renderCarOptions(context.previous.carId);fillPneuEntry(context.previous);$('saveMsg').innerHTML=context.previous.message;
  ['save','summer','winter','taskDotClose','taskDotReturn'].forEach(id=>$(id).disabled=false);taskDotSaving=false;valid();
  if(context.returnFocus?.isConnected)context.returnFocus.focus();
}
async function closeTaskDot(){
  if(!taskDotContext||taskDotSaving)return;const context=taskDotContext;captureTaskWork();taskDotSaving=true;setTaskDotBusy(true);
  try{await persistTaskDraft(context.id);if(taskDotContext===context){restoreTaskDotForm();await loadTaskData(true)}}
  catch(x){if(taskDotContext===context)note($('saveMsg'),errorText(x),'msg err')}
  finally{if(taskDotContext===context){taskDotSaving=false;setTaskDotBusy(false)}}
}
function setTaskDotBusy(busy){['save','summer','winter','taskDotClose','taskDotReturn'].forEach(id=>$(id).disabled=busy);$('taskDotFormHost').querySelectorAll('input,#pad button').forEach(el=>el.disabled=busy);if(!busy)valid()}
async function switchTaskDotSeason(s){
  if(!taskDotContext||taskDotSaving||taskDotContext.season===s)return;const context=taskDotContext,draft=readTaskForm(context.id);captureTaskWork();taskDotSaving=true;setTaskDotBusy(true);
  try{await persistTaskDraft(context.id,draft);if(taskDotContext===context)fillTaskDotSeason(s,draft.mileage)}
  catch(x){if(taskDotContext===context)note($('saveMsg'),errorText(x),'msg err')}
  finally{if(taskDotContext===context){taskDotSaving=false;setTaskDotBusy(false)}}
}
async function saveTaskDotSeason(){
  if(!taskDotContext||taskDotSaving||$('save').disabled)return;
  const context=taskDotContext,draft=readTaskForm(context.id),t=(D.tireTasks||[]).find(t=>t.id===context.id);
  if(t?.lastMileage!=null&&Number(draft.mileage)<Number(t.lastMileage)&&!confirm('Stav km je nižší než poslední evidovaný. Opravdu uložit?'))return;
  captureTaskWork();taskDotSaving=true;setTaskDotBusy(true);
  try{
    await saveTaskVehicleRecord(context.id,draft);await loadTaskData(true);
    if(taskDotContext!==context)return;
    const fresh=(D.tireTasks||[]).find(t=>t.id===context.id),next=taskDotOrder(fresh).find(s=>!fresh.seasonRecordReady?.[s]);
    if(next&&next!==draft.season){fillTaskDotSeason(next,draft.mileage);note($('saveMsg'),'✅ '+taskSeasonLabel(draft.season)+' DOT uložený. Teď doplň '+taskSeasonLabel(next)+' DOT; kilometry jsou předvyplněné.','msg ok')}
    else note($('saveMsg'),fresh.recordReady?'✅ PNEU/DOT uložené. Vrať se do TASKu a dokonči vozidlo.':'✅ '+taskSeasonLabel(draft.season)+' DOT uložený. Doplň také druhou sadu.','msg ok');
  }catch(x){if(taskDotContext===context)note($('saveMsg'),errorText(x),'msg err')}
  finally{if(taskDotContext===context){taskDotSaving=false;setTaskDotBusy(false)}}
}
async function finishTaskVehicle(id){
  await taskAction(id,async()=>{await api('tireTaskCompleteVehicle',{taskId:id});taskDrafts.delete(id);taskOpenVehicles.delete(id)});
}
async function finishDailyTask(id){
  await taskAction(id,async()=>{const g=dailyTaskForVehicle(id);await api('tireTaskClose',{taskId:id});g.cars.forEach(t=>{taskDrafts.delete(t.id);taskOpenVehicles.delete(t.id)})});
}
function bindTaskActions(){
  document.querySelectorAll('.tt-accept').forEach(b=>b.onclick=()=>taskAction(b.dataset.id,()=>api('tireTaskAccept',{taskId:b.dataset.id})));
  document.querySelectorAll('.tt-start').forEach(b=>b.onclick=()=>taskAction(b.dataset.id,async()=>{taskOpenVehicles.add(b.dataset.id);await api('tireTaskSetStatus',{taskId:b.dataset.id,status:'in_progress'})}));
  document.querySelectorAll('.tt-problem').forEach(b=>b.onclick=()=>openTaskProblem(b.dataset.id));
  document.querySelectorAll('.tt-edit').forEach(b=>b.onclick=()=>editTireTask(b.dataset.id));
  document.querySelectorAll('.tt-delete').forEach(b=>b.onclick=()=>deleteTireTask(b.dataset.id));
  document.querySelectorAll('.tt-comment').forEach(b=>b.onclick=()=>addTireTaskComment(b.dataset.id));
  document.querySelectorAll('.tt-finish-vehicle').forEach(b=>b.onclick=()=>finishTaskVehicle(b.dataset.id));
  document.querySelectorAll('.tt-finish-group').forEach(b=>b.onclick=()=>finishDailyTask(b.dataset.id));
  document.querySelectorAll('.tt-write-dot').forEach(b=>b.onclick=()=>openTaskDot(b.dataset.id));
  document.querySelectorAll('.tt-handover').forEach(b=>b.onclick=()=>openTaskHandover(b.dataset.id));
  document.querySelectorAll('.tt-origin').forEach(b=>b.onclick=()=>openSpecificTask(b.dataset.id));
  document.querySelectorAll('.tt-group-edit').forEach(b=>b.onclick=()=>editDailyTask(b.dataset.id));
  document.querySelectorAll('.tt-group-assignee').forEach(s=>s.onchange=()=>taskAction(s.dataset.id,()=>api('tireTaskUpdate',{taskId:s.dataset.id,assignedToUserId:s.value})));
  document.querySelectorAll('.task-vehicle').forEach(el=>el.ontoggle=()=>{if(el.open)taskOpenVehicles.add(el.dataset.vehicleId);else taskOpenVehicles.delete(el.dataset.vehicleId)});
}
async function editDailyTask(id){
  openTaskEdit(id,false);
}
function openTaskEdit(id,vehicle=false){
  if(!tireTaskCaps().edit||isReadOnly()||taskDotContext)return;const t=(D.tireTasks||[]).find(t=>t.id===id),g=dailyTaskForVehicle(id);if(!t||!g)return;
  const locked=!!t.startedAt||['completed','closed','cancelled','handed_over'].includes(t.status)||!!t.workClosedAt||t.kind==='carryover'||!!t.sourceTaskId||!!t.completedRecordId||Object.keys(t.seasonRecords||{}).length>0;
  taskEditContext={id,vehicle,original:structuredClone(t),group:structuredClone(g),bodyOverflow:document.body.style.overflow,returnFocus:document.activeElement,saving:false};
  $('taskEditTitle').textContent=vehicle?'✏️ Upravit vozidlo v TASKu':'✏️ Upravit TASK';$('taskEditMeta').textContent=(vehicle?t.carPlate:g.vehicleCount+' '+(g.vehicleCount===1?'vozidlo':'vozidel'))+' · '+(g.assignedToName||'Čeká na přiřazení')+' · '+seasonShortDate(g.date);
  $('taskEditDate').value=g.date;$('taskEditBatchInstructions').value=g.instructions||'';
  $('taskEditAssignee').innerHTML=tireTaskAssignableOptions(g.assignedToUserId)+(g.assignedToUserId&&!(D.tireTaskAssignableUsers||[]).some(u=>u.id===g.assignedToUserId)?'<option value="'+e(g.assignedToUserId)+'" selected>'+e(g.assignedToName||'Původní pracovník')+'</option>':'');
  $('taskEditAssignee').value=g.assignedToUserId||'';$('taskEditAssignee').disabled=g.workClosed||g.cars.some(t=>t.startedAt||['completed','closed'].includes(t.status))&&!g.cars.every(t=>t.releasedAfterUserDeletion);
  $('taskEditVehicleFields').hidden=!vehicle;
  if(vehicle){
    const cars=tireTaskVehicleSource();$('taskEditCar').innerHTML=cars.map(c=>'<option value="'+e(c.id)+'">'+e(c.plate)+' — '+e(c.name||'')+'</option>').join('')+(!cars.some(c=>c.id===t.carId)?'<option value="'+e(t.carId)+'">'+e(t.carPlate)+' — '+e(t.carName||'Archivované vozidlo')+'</option>':'');
    $('taskEditCar').value=t.carId;$('taskEditCar').disabled=locked;$('taskEditTime').value=t.time||'';$('taskEditCategory').innerHTML=tireTaskCategoryOptions(t.category);$('taskEditInstructions').value=t.instructions||'';
    $('taskEditOrder').value=taskDotOrder(t)[0];$('taskEditOrder').disabled=locked;
  }
  $('taskEditHistoryHint').hidden=!g.workClosed&&!g.cars.some(t=>t.startedAt||['completed','closed'].includes(t.status));
  $('taskEditMsg').innerHTML='';$('taskEditSubmit').disabled=false;$('taskEditOverlay').hidden=false;document.body.style.overflow='hidden';$('taskEditOverlay').querySelector('.modal-card').scrollTop=0;$('taskEditDate').focus();
}
function closeTaskEdit(){
  if(!taskEditContext)return;const context=taskEditContext;taskEditContext=null;$('taskEditOverlay').hidden=true;document.body.style.overflow=context.bodyOverflow;if(context.returnFocus?.isConnected)context.returnFocus.focus();
}
async function submitTaskEdit(){
  const context=taskEditContext;if(!context||context.saving)return;
  const data={taskId:context.id},g=context.group,t=context.original;
  if($('taskEditDate').value!==g.date)data.date=$('taskEditDate').value;
  if($('taskEditBatchInstructions').value.trim()!==(g.instructions||''))data.batchInstructions=$('taskEditBatchInstructions').value.trim();
  if(!$('taskEditAssignee').disabled&&$('taskEditAssignee').value!==(g.assignedToUserId||''))data.assignedToUserId=$('taskEditAssignee').value;
  if(context.vehicle){
    for(const [field,id] of [['carId','taskEditCar'],['time','taskEditTime'],['category','taskEditCategory'],['instructions','taskEditInstructions']]){const value=$(id).value.trim();if(value!==(t[field]||''))data[field]=value}
    const first=$('taskEditOrder').value;if(first!==taskDotOrder(t)[0])data.dotOrder=[first,first==='summer'?'winter':'summer'];
  }
  if(Object.keys(data).length===1){closeTaskEdit();return}
  context.saving=true;$('taskEditSubmit').disabled=true;$('taskEditCancel').disabled=true;$('taskEditClose').disabled=true;
  try{await api('tireTaskUpdate',data);if(taskEditContext===context){closeTaskEdit();await refresh()}}
  catch(x){if(taskEditContext===context)note($('taskEditMsg'),errorText(x),'msg err')}
  finally{context.saving=false;$('taskEditSubmit').disabled=false;$('taskEditCancel').disabled=false;$('taskEditClose').disabled=false}
}
function openTaskHandover(id){
  const t=(D.tireTasks||[]).find(t=>t.id===id);if(!t)return;captureTaskWork();taskHandoverId=id;
  const date=taskDateAddDays(t.date>localDateISO()?t.date:localDateISO(),1),people=[...new Set(dailyTasks().filter(g=>g.kind!=='carryover'&&!g.workClosed&&g.date===date&&g.assignedToUserId).map(g=>g.assignedToUserId))];
  $('taskHandoverVehicle').textContent=t.carPlate+' · '+(t.carName||'');$('taskHandoverDate').textContent=seasonShortDate(date);
  $('taskHandoverReceiver').innerHTML='<option value="">Čeká na přiřazení dispatchu</option>'+(D.tireTaskHandoverUsers||[]).map(u=>'<option value="'+e(u.id)+'">'+e(u.name)+' · '+e(roleLabel(u.role))+'</option>').join('');
  $('taskHandoverReceiver').value=people.length===1?people[0]:'';$('taskHandoverNote').value='';$('taskHandoverService').checked=false;$('taskHandoverMsg').innerHTML='';$('taskHandoverOverlay').hidden=false;
}
async function submitTaskHandover(){
  if(!taskHandoverId)return;if(!$('taskHandoverService').checked)return note($('taskHandoverMsg'),'Potvrď, že vybrané vozidlo zůstává v servisu.','msg err');
  const id=taskHandoverId;$('taskHandoverSubmit').disabled=true;
  const ok=await taskAction(id,async()=>{taskDrafts.set(id,readTaskForm(id));await persistTaskDraft(id);await api('tireTaskHandover',{taskId:id,staysAtService:true,receiverId:$('taskHandoverReceiver').value,handoverNote:$('taskHandoverNote').value});taskDrafts.delete(id);taskOpenVehicles.delete(id)});
  $('taskHandoverSubmit').disabled=false;if(ok){$('taskHandoverOverlay').hidden=true;taskHandoverId=null}
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
async function deleteTireTask(id){
  const t=(D.tireTasks||[]).find(x=>x.id===id);if(!t||!tireTaskCaps().delete||isReadOnly())return;
  const g=dailyTaskForVehicle(id),count=g?.vehicleCount||1,label=(g?.kind==='carryover'?'samostatný TASK':'denní TASK · '+count+' '+(count===1?'vozidlo':'vozidel'))+' · '+(t.date||'');
  const affected=(g?.cars||[t]).map(t=>t.carPlate).join(', '),extra=g?.cars.some(t=>t.handoverTaskId)?'\nNavazující TASKy zůstanou zachované a jejich návaznost se upraví.':t.sourceTaskId?'\nPokud po smazání nezbude navazující dokončení, v původní historii se označí jako zrušené.':'';
  if(!confirm('Opravdu smazat '+label+'?\n'+affected+'\nPracovník: '+(g?.assignedToName||'Nepřiřazeno')+'\n\nSmaže se tento TASK včetně jeho vozidel. Zápisy PNEU/DOT a kilometrů zůstanou zachované.'+extra))return;
  await taskAction(id,async()=>{const result=await api('tireTaskDelete',{taskId:id});for(const deleted of result.deletedTaskIds||[id]){clearTimeout(taskDraftTimers.get(deleted));taskDraftTimers.delete(deleted);taskDrafts.delete(deleted);taskDraftStates.delete(deleted);taskOpenVehicles.delete(deleted);for(const s of ['summer','winter']){taskSeasonDrafts.delete(deleted+':'+s);taskRecordRequests.delete(deleted+':'+s)}if(pendingTireTaskId===deleted)pendingTireTaskId=null}});
}
async function editTireTask(id){
  openTaskEdit(id,true);
}
function openPneuFromTireTask(id){
  return openTaskDot(id);
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
  b.hidden=false;b.classList.toggle('read-only',s.mode==='read_only');b.classList.toggle('maintenance',s.mode==='maintenance');b.classList.toggle('hibernation',s.mode==='hibernation');
  if(s.mode==='read_only'){
    $('systemBannerTitle').textContent='🟠 READ ONLY — pouze prohlížení';
    $('systemBannerText').textContent=(s.message||'Probíhá systémová údržba. Data lze prohlížet, ale zápisy jsou dočasně pozastavené.')+(me?.role==='admin'?' Admin má stále plný přístup.':'');
  }else if(s.mode==='hibernation'){
    $('systemBannerTitle').textContent='🌙 HIBERNACE — sezónní spánek';
    $('systemBannerText').textContent=(s.message||'Aplikace je v sezónním spánku.')+(me?.role==='admin'?' Admin zůstává vždy online a má plný přístup.':' Máš udělenou výjimku pro práci během hibernace.');
  }else{
    $('systemBannerTitle').textContent='🔴 MAINTENANCE — technická údržba';
    $('systemBannerText').textContent=(s.message||'Aplikace je momentálně dočasně pozastavena administrátorem.')+(me?.role==='admin'?' Ostatní uživatelé se nemohou přihlásit.':'');
  }
}
const SYSTEM_MESSAGE_TEMPLATES={
  read_only:'Probíhá systémová údržba.\nData lze prohlížet, ale zápisy jsou dočasně pozastavené.',
  maintenance:'🔧 Probíhá technická údržba\nAplikace je momentálně dočasně pozastavena administrátorem.\nZkuste to prosím později.',
  hibernation:'🌙 Aplikace je v sezónním spánku\nPrávě odpočívám mezi sezónami. Ozvu se, až se zase probudím!'
};
const NORMAL_RETURN_TEMPLATE='Jsme zpátky. Aplikace zpět v normálním provozu. Děkuji za trpělivost.';
const HIBERNATION_RETURN_TEMPLATE='🌅 Aplikace je zase vzhůru. Sezónní spánek skončil a Autoprovoz je opět připravený k práci.';
function systemModeHelp(mode){
  if(mode==='read_only')return '<b>🟠 READ ONLY</b>Ostatní uživatelé mohou data prohlížet, ale server odmítne zápisy, úpravy a mazání.';
  if(mode==='maintenance')return '<b>🔴 MAINTENANCE</b>Do aplikace se dostane pouze Admin. Již přihlášení uživatelé budou při dalším spojení odhlášeni.';
  if(mode==='hibernation')return '<b>🌙 HIBERNACE</b>Aplikace je mimo sezónu uzamčená. Admin zůstává vždy online; níže lze povolit konkrétní uživatele, kteří budou mít normální přístup podle svých práv.';
  return '<b>🟢 NORMAL</b>Všichni uživatelé pracují podle svých rolí a oprávnění.';
}
function renderHibernationAccessControls(){
  const list=$('hibernationUserList');if(!list)return;
  const allowed=new Set(D.system?.hibernationAllowedUserIds||[]),users=(D.users||[]).filter(u=>u.active&&u.role!=='admin');
  list.innerHTML=users.length?users.map(u=>'<label class="hibernation-user-choice '+(allowed.has(u.id)?'is-online':'is-offline')+'"><input class="hibernation-user-toggle" type="checkbox" value="'+e(u.id)+'" '+(allowed.has(u.id)?'checked':'')+'><span class="hibernation-check" aria-hidden="true"></span><span class="hibernation-user-main"><b>'+e(u.name)+'</b><span class="small">'+e(roleLabel(u.role))+'</span></span><span class="hibernation-state">'+(allowed.has(u.id)?'ONLINE':'OFFLINE')+'</span></label>').join(''):'<div class="small">Nejsou k dispozici žádní aktivní uživatelé.</div>';
  list.querySelectorAll('.hibernation-user-toggle').forEach(x=>x.onchange=()=>{const row=x.closest('.hibernation-user-choice'),state=row?.querySelector('.hibernation-state');if(!row||!state)return;row.classList.toggle('is-online',x.checked);row.classList.toggle('is-offline',!x.checked);state.textContent=x.checked?'ONLINE':'OFFLINE'});
}
function updateSystemModeEditor(resetNotify=false){
  if(!$('systemMode'))return;
  const selected=$('systemMode').value,current=D.system?.mode||'normal',toNormal=selected==='normal'&&current!=='normal';
  $('systemModeHelp').innerHTML=systemModeHelp(selected);
  $('systemRestrictionMessage').hidden=selected==='normal';
  if($('hibernationAccessBox'))$('hibernationAccessBox').hidden=selected!=='hibernation';
  $('normalNotifyBox').hidden=!toNormal;
  const waking=current==='hibernation'&&toNormal;
  if($('normalNotifyLabel'))$('normalNotifyLabel').textContent=waking?'🚨 Odeslat kritické systémové oznámení o probuzení aplikace':'🔔 Po návratu do NORMAL odeslat oznámení uživatelům';
  if($('normalNotifyHint'))$('normalNotifyHint').textContent=waking?'Kritické systémové oznámení obejde uživatelské preference a každý příjemce ho musí potvrdit tlačítkem „Rozumím“.':'Oznámení se odešle pouze při skutečném návratu do NORMAL z omezeného režimu.';
  if(toNormal&&resetNotify){
    $('normalNotify').checked=true;
    $('normalNotifyMessage').value=waking?HIBERNATION_RETURN_TEMPLATE:NORMAL_RETURN_TEMPLATE;
  }
}
function renderSystemControls(){
  if(me?.role!=='admin'||!$('systemMode'))return;
  const s=D.system||{mode:'normal',customMessage:'',message:''};
  $('systemMode').value=s.mode||'normal';
  $('systemMessage').value=s.customMessage??'';
  $('normalNotify').checked=false;
  $('normalNotifyMessage').value=s.mode==='hibernation'?HIBERNATION_RETURN_TEMPLATE:NORMAL_RETURN_TEMPLATE;
  renderHibernationAccessControls();
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
    const testInfo=u.role==='test'?'<div class="test-profile-note"><b>🧪 TEST profil</b><div class="small">Nemá žádná výchozí oprávnění. Nastavíš je v Admin → Práva uživatelů a přístup k modulům v Admin → Moduly.</div></div>':'';
    const pinReset=u.pinChangeRequired?.required?'<div class="pin-reset-pending"><b>🔐 Čeká na změnu PINu</b><div class="small">'+(u.pinChangeRequired.requireOldPin?'Při změně bude vyžadován i stávající PIN.':'Při změně nebude vyžadováno opětovné zadání stávajícího PINu.')+' · od '+dt(u.pinChangeRequired.requestedAt)+'</div></div>':'';
    const loginLock=u.loginLockedAt?'<div class="login-lock-alert"><b>🔒 ZABLOKOVÁNO PO 3 POKUSECH</b><div class="small">Zablokováno '+dt(u.loginLockedAt)+'. Pro odemčení použij „Vyžádat změnu PINu“ a nejdřív fyzicky ověř, co se stalo.</div></div>':(u.failedPinAttempts?'<div class="login-attempt-warning">⚠️ Chybné pokusy o PIN: <b>'+u.failedPinAttempts+'/3</b> · poslední '+dt(u.lastFailedPinAt)+'</div>':'');
    return '<div class="user '+(u.role==='test'?'test-profile':'')+'"><div class="row mobile-stack"><input class="un" data-id="'+e(u.id)+'" value="'+e(u.name)+'">'+role+'</div><div class="small" style="margin:6px 0">'+presenceHtml(u)+' · poslední aktivita '+dt(u.lastActivityAt)+' · naposledy online '+dt(u.lastOnlineAt)+' · záznamů '+u.recordCount+' · push zařízení '+u.pushDevices+' · '+(u.active?'aktivní':'zablokovaný')+'</div>'+loginLock+pinReset+testInfo+'<div class="toolbar"><button class="admin-user-profile secondary" data-id="'+e(u.id)+'">👤 Přehled profilu</button><button class="primary su" data-id="'+e(u.id)+'">💾 Uložit účet</button>'+(admin&&u.id===me?.id?'<button class="change-admin-own-pin secondary" data-id="'+e(u.id)+'">🔐 Změnit PIN</button>':'')+(!admin?'<button class="request-pin-reset secondary" data-id="'+e(u.id)+'">🔐 '+(u.pinChangeRequired?.required?'Upravit výzvu PINu':'Vyžádat změnu PINu')+'</button><button class="tu '+(u.active?'danger-btn':'primary')+'" data-id="'+e(u.id)+'" data-a="'+u.active+'">'+(u.active?'Zablokovat':'Aktivovat')+'</button><button class="delete-user danger-btn" data-id="'+e(u.id)+'">🗑 Smazat uživatele</button>':'')+'</div></div>';
  }).join('');
  document.querySelectorAll('.su').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id,n=document.querySelector('.un[data-id="'+id+'"]').value,u=(D.users||[]).find(x=>x.id===id);
    const role=u?.role==='admin'?'admin':document.querySelector('.ur[data-id="'+id+'"]').value;
    try{await api('adminUpdateUser',{userId:id,name:n,role});await refresh();alert('Účet uložen.')}catch(x){alert(errorText(x))}
  });
  document.querySelectorAll('.admin-user-profile').forEach(b=>b.onclick=()=>openAdminUserProfile(b.dataset.id));
  document.querySelectorAll('.request-pin-reset').forEach(b=>b.onclick=()=>openAdminPinReset(b.dataset.id));
  document.querySelectorAll('.change-admin-own-pin').forEach(b=>b.onclick=openAdminOwnPinChange);
  document.querySelectorAll('.tu').forEach(b=>b.onclick=async()=>{await api('adminUpdateUser',{userId:b.dataset.id,active:b.dataset.a!=='true'});await refresh()});
  document.querySelectorAll('.delete-user').forEach(b=>b.onclick=()=>deleteAdminUser(b.dataset.id));
}
let adminOwnPinContext=null;
function openAdminOwnPinChange(){
  if(me?.role!=='admin'||adminOwnPinContext)return;
  adminOwnPinContext={userId:me.id,saving:false,returnFocus:document.activeElement,bodyOverflow:document.body.style.overflow};
  for(const id of ['adminOwnPinOld','adminOwnPinNew','adminOwnPinConfirm'])$(id).value='';
  $('adminOwnPinUser').textContent=me.name;$('adminOwnPinMsg').innerHTML='';$('adminOwnPinResult').innerHTML='';
  for(const id of ['adminOwnPinSubmit','adminOwnPinClose','adminOwnPinCancel'])$(id).disabled=false;
  $('adminOwnPinOverlay').hidden=false;document.body.style.overflow='hidden';$('adminOwnPinOld').focus();
}
function closeAdminOwnPinChange(){
  if(!adminOwnPinContext)return;const context=adminOwnPinContext;adminOwnPinContext=null;
  $('adminOwnPinOverlay').hidden=true;for(const id of ['adminOwnPinOld','adminOwnPinNew','adminOwnPinConfirm'])$(id).value='';$('adminOwnPinMsg').innerHTML='';
  document.body.style.overflow=context.bodyOverflow;if(context.returnFocus?.isConnected)context.returnFocus.focus();
}
async function submitAdminOwnPinChange(){
  const context=adminOwnPinContext;if(!context||context.saving||me?.role!=='admin')return;
  const [oldPin,newPin,confirmPin]=['adminOwnPinOld','adminOwnPinNew','adminOwnPinConfirm'].map(id=>$(id).value.replace(/\D/g,'').slice(0,4));
  if(oldPin.length!==4)return note($('adminOwnPinMsg'),'Zadej současný čtyřmístný PIN.','msg err');
  if(newPin.length!==4)return note($('adminOwnPinMsg'),'Nový PIN musí mít 4 číslice.','msg err');
  if(newPin!==confirmPin)return note($('adminOwnPinMsg'),'Nové PINy se neshodují.','msg err');
  context.saving=true;for(const id of ['adminOwnPinSubmit','adminOwnPinClose','adminOwnPinCancel'])$(id).disabled=true;
  try{
    const r=await api('changeOwnPin',{oldPin,newPin,confirmPin});
    if(adminOwnPinContext!==context||me?.id!==context.userId||!tok)return;
    if(r.token)tok=r.token;if(r.user)me=r.user;closeAdminOwnPinChange();
    note($('adminOwnPinResult'),'PIN byl změněn. Při příštím přihlášení použij nový PIN.','msg ok');await refresh();
  }catch(x){if(adminOwnPinContext===context)note($('adminOwnPinMsg'),errorText(x),'msg err')}
  finally{context.saving=false;if(!adminOwnPinContext||adminOwnPinContext===context)for(const id of ['adminOwnPinSubmit','adminOwnPinClose','adminOwnPinCancel'])$(id).disabled=false}
}
async function deleteAdminUser(id){
  const u=(D.users||[]).find(x=>x.id===id);if(!u||u.role==='admin')return;
  const ok=confirm('Opravdu smazat uživatele '+u.name+'?\\n\\nUživatel se už nebude moct přihlásit ani dostávat nové TASKy. Jeho historické DOT zápisy, dokončené TASKy a audit zůstanou zachované. Aktivní přiřazené TASKy se vrátí mezi nepřiřazené.');
  if(!ok)return;
  try{const r=await api('adminDeleteUser',{userId:id});await refresh();alert('Uživatel '+u.name+' byl smazán.'+(r.releasedTasks?' Nepřiřazené aktivní TASKy: '+r.releasedTasks+'.':''))}catch(x){alert(errorText(x))}
}
function adminRightsRoleMeta(role){
  return role==='admin'?{icon:'🛡️',label:'ADMIN',desc:'Správa systému'}:
    role==='dispatch'?{icon:'🎛️',label:'DISPATCH',desc:'Plánování a řízení práce'}:
    role==='driver'?{icon:'🚘',label:'DRIVER',desc:'Řidič a běžná evidence'}:
    role==='technician'?{icon:'🔧',label:'TECHNICIAN',desc:'Technické úkony a evidence'}:
    {icon:'🧪',label:'TEST',desc:'Testovací profil'};
}
function renderAdminUserPermissions(){
  const root=$('userPermissions');if(!root)return;
  const order={dispatch:0,driver:1,technician:2,test:3};
  const users=(D.users||[]).slice();
  const admins=users.filter(u=>u.role==='admin').sort((a,b)=>String(a.name).localeCompare(String(b.name),'cs'));
  const regular=users.filter(u=>u.role!=='admin').sort((a,b)=>(order[a.role]??99)-(order[b.role]??99)||String(a.name).localeCompare(String(b.name),'cs'));
  const userCard=(u)=>{
    const admin=u.role==='admin',meta=adminRightsRoleMeta(u.role);
    const perms=admin
      ?'<div class="admin-rights-full">🛡️ <b>Plný systémový přístup</b><div class="small">Admin má všechna systémová oprávnění vždy aktivní a nelze je vypnout.</div></div>'
      :'<div class="perm-grid">'+PERMS.map(([k,l])=>'<label class="perm"><input class="uperm-rights" data-id="'+e(u.id)+'" data-k="'+e(k)+'" type="checkbox" '+(u.permissions?.[k]?'checked':'')+'><span>'+e(l)+'</span></label>').join('')+'</div>';
    const taskNotices='<div class="module-note admin-rights-notices"><b>🔔 TASK oznámení</b>'+[['accepted','Přijetí TASKu'],['vehicleStarted','Zahájení vozidla – Pracuji na tom'],['vehicleCompleted','Dokončení jednotlivého vozidla'],['taskCompleted','Kompletní dokončení TASKu'],['handedOver','Předání vozidla na další den']].map(([key,label])=>'<label class="switchline"><input class="utasknotice-rights" data-id="'+e(u.id)+'" data-key="'+key+'" type="checkbox" '+(u.taskNotifications?.[key]?'checked':'')+'><span>'+label+'</span></label>').join('')+'<div class="small">Tato volba určuje příjem událostí TASKu. Přístup do modulu se nastavuje samostatně.</div></div>';
    return '<div class="admin-rights-user role-'+e(u.role)+'">'+
      '<div class="admin-rights-user-head"><div class="admin-rights-role-icon">'+meta.icon+'</div><div class="admin-rights-user-title"><b>'+e(u.name)+'</b><div class="small">'+e(meta.desc)+' · '+(u.active?'aktivní':'zablokovaný')+'</div></div><span class="admin-role-pill role-'+e(u.role)+'">'+e(meta.label)+'</span></div>'+
      perms+taskNotices+'<button class="save-user-rights primary" data-id="'+e(u.id)+'" style="width:100%;margin-top:9px">💾 Uložit práva</button></div>';
  };
  const groups=[['dispatch','🎛️','Dispatch'],['driver','🚘','Driver'],['technician','🔧','Technician'],['test','🧪','TEST']];
  let html=admins.length?'<section class="admin-rights-group system"><div class="admin-rights-group-title"><span>🛡️ Systém</span><b>'+admins.length+'</b></div>'+admins.map(userCard).join('')+'</section>':'';
  for(const [role,icon,label] of groups){
    const rows=regular.filter(u=>u.role===role);if(!rows.length)continue;
    html+='<section class="admin-rights-group role-'+role+'"><div class="admin-rights-group-title"><span>'+icon+' '+label+'</span><b>'+rows.length+'</b></div>'+rows.map(userCard).join('')+'</section>';
  }
  root.innerHTML=html||'<div class="small">Nejsou žádní uživatelé.</div>';
  document.querySelectorAll('.save-user-rights').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id,u=(D.users||[]).find(x=>x.id===id);if(!u)return;
    const taskNotifications={};document.querySelectorAll('.utasknotice-rights[data-id="'+id+'"]').forEach(input=>taskNotifications[input.dataset.key]=input.checked);
    const payload={userId:id,taskNotifications};
    if(u.role!=='admin'){
      const permissions={};document.querySelectorAll('.uperm-rights[data-id="'+id+'"]').forEach(x=>permissions[x.dataset.k]=x.checked);payload.permissions=permissions;
    }
    b.disabled=true;
    try{await api('adminUpdateUser',payload);await refresh();alert('Práva uživatele '+u.name+' byla uložena.')}catch(x){alert(errorText(x))}finally{b.disabled=false}
  });
}

function adminProfileTaskRoles(t,userId){
  const roles=[];
  if(t.assignedToUserId===userId)roles.push('Přiřazen');
  if(t.acceptedById===userId)roles.push('Přijal');
  if(t.startedById===userId)roles.push('Zahájil');
  if(t.completedById===userId)roles.push('Dokončil');
  if(t.closedById===userId)roles.push('Uzavřel');
  if(!roles.length&&(t.activity||[]).some(a=>a.userId===userId))roles.push('Aktivita');
  return roles;
}
function renderAdminUserProfile(){
  const p=adminUserProfileData;if(!p||!$('adminUserProfileBody'))return;
  const u=p.user||{},s=p.stats||{},records=p.records||[],tasks=p.tasks||[],audit=p.audit||[];
  $('adminUserProfileTitle').textContent='👤 '+(u.name||'Profil uživatele');
  $('adminUserProfileSub').textContent=roleLabel(u.role)+' · '+(u.active?'aktivní':'zablokovaný')+' · poslední přihlášení '+dt(u.lastLoginAt);
  $('adminUserProfileExport').disabled=!records.length&&!tasks.length;
  const stats='<div class="admin-profile-stats">'+
    '<div><b>'+Number(s.records||0)+'</b><span>PNEU/DOT zápisů</span></div>'+
    '<div><b>'+Number(s.tasksCompleted||0)+'</b><span>Dokončených TASKů</span></div>'+
    '<div><b>'+Number(s.tasksStarted||0)+'</b><span>Zahájených TASKů</span></div>'+
    '<div><b>'+Number(s.tasksInvolved||0)+'</b><span>TASKů s účastí</span></div>'+
  '</div><div class="small admin-profile-meta">Poslední pracovní aktivita: '+dt(s.lastWorkAt)+' · '+(u.presenceStatus==='online'?'🟢 Online':u.presenceStatus==='standby'?'🟠 Standby':'⚪ Offline')+' · účet od '+dt(u.createdAt)+'</div>';
  const taskRows=tasks.slice().sort((a,b)=>Date.parse(b.completedAt||b.closedAt||b.updatedAt||b.createdAt||0)-Date.parse(a.completedAt||a.closedAt||a.updatedAt||a.createdAt||0)).map(t=>{
    const roles=adminProfileTaskRoles(t,u.id),season=t.targetSeason==='winter'?'❄️ Zimní':'☀️ Letní';
    return '<div class="admin-profile-work"><div class="top"><div><b>📋 '+e(t.carPlate||'—')+'</b> · '+season+'<div class="small">'+e(t.carName||'')+' · plán '+e(t.date||'—')+' '+(t.time?e(t.time):'celý den')+'</div></div><span class="badge">'+e(tireTaskStatusMeta(t.status).label)+'</span></div>'+
      '<div class="admin-profile-role">'+roles.map(r=>'<span>'+e(r)+'</span>').join('')+'</div>'+
      '<div class="admin-profile-work-grid"><div><span>Přijato</span><b>'+dt(t.acceptedAt)+'</b></div><div><span>Zahájeno</span><b>'+dt(t.startedAt)+'</b></div><div><span>Dokončeno</span><b>'+dt(t.completedAt)+'</b></div><div><span>Uzavřeno</span><b>'+dt(t.closedAt)+'</b></div></div>'+
      (t.completedRecordId?'<div class="small" style="margin-top:7px">DOT <b>'+e(t.completedDot||'—')+'</b> · '+Number(t.completedMileage??0).toLocaleString('cs-CZ')+' km · dokončil '+e(t.completedBy||'—')+'</div>':'')+
    '</div>';
  }).join('')||'<div class="small">Uživatel zatím nemá žádný TASK.</div>';
  const recordRows=records.slice(0,150).map(r=>'<div class="admin-profile-work"><b>🛞 '+e(r.plate||'—')+'</b> · '+(r.season==='winter'?'❄️ Zimní':'☀️ Letní')+' · DOT <b>'+e(dotLabel(r))+'</b><div class="small">'+Number(r.mileage??0).toLocaleString('cs-CZ')+' km · '+e(r.vehicle||'')+' · '+dt(r.createdAt)+'</div></div>').join('')||'<div class="small">Uživatel zatím nemá žádný PNEU/DOT zápis.</div>';
  const auditRows=audit.slice(0,60).map(a=>'<div class="audit-line"><b>'+e(a.summary||a.action)+'</b><div class="small">'+dt(a.createdAt)+' · '+e(a.action||'')+'</div></div>').join('')||'<div class="small">Bez další systémové aktivity.</div>';
  $('adminUserProfileBody').innerHTML=stats+
    '<div class="admin-profile-section"><h3>📋 TASKy a práce</h3>'+taskRows+'</div>'+
    '<div class="admin-profile-section"><h3>🛞 PNEU / DOT zápisy</h3>'+recordRows+'</div>'+
    '<details class="admin-profile-section"><summary><b>🧾 Další systémová aktivita</b></summary><div style="margin-top:8px">'+auditRows+'</div></details>';
}
async function openAdminUserProfile(id){
  if(me?.role!=='admin'||!$('adminUserProfileOverlay'))return;
  adminUserProfileData=null;$('adminUserProfileTitle').textContent='👤 Přehled profilu';$('adminUserProfileSub').textContent='Načítám pracovní historii…';$('adminUserProfileBody').innerHTML='<div class="small">Načítám data profilu…</div>';$('adminUserProfileExport').disabled=true;$('adminUserProfileOverlay').hidden=false;
  try{adminUserProfileData=await api('adminUserProfile',{userId:id});renderAdminUserProfile()}catch(x){$('adminUserProfileBody').innerHTML='<div class="msg err">'+e(errorText(x))+'</div>'}
}
function closeAdminUserProfile(){adminUserProfileData=null;if($('adminUserProfileOverlay'))$('adminUserProfileOverlay').hidden=true}
function exportAdminUserProfile(){
  const p=adminUserProfileData;if(!p)return;const u=p.user||{},rows=[['Typ','SPZ','Vozidlo','Sada','Plán datum','Plán čas','Role uživatele','DOT','Kilometry','Datum zápisu','Přijato','Zahájeno','Dokončeno','Uzavřeno','Stav TASKu']];
  for(const r of p.records||[])rows.push(['PNEU/DOT',r.plate||'',r.vehicle||'',r.season==='winter'?'Zimní':'Letní','','','Zapsal PNEU/DOT',dotLabel(r),r.mileage??'',dt(r.createdAt),'','','','']);
  for(const t of p.tasks||[])rows.push(['TASK',t.carPlate||'',t.carName||'',t.targetSeason==='winter'?'Zimní':'Letní',t.date||'',t.time||'',adminProfileTaskRoles(t,u.id).join(' + '),t.completedDot||'',t.completedMileage??'','',dt(t.acceptedAt),dt(t.startedAt),dt(t.completedAt),dt(t.closedAt),tireTaskStatusMeta(t.status).label]);
  const safe=String(u.name||'uzivatel').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'uzivatel';
  downloadBlob('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8;','Autoprovoz-Profil-'+safe+'-'+new Date().toISOString().slice(0,10)+'.csv');
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
if($('adminUserProfileClose'))$('adminUserProfileClose').onclick=closeAdminUserProfile;
if($('adminUserProfileExport'))$('adminUserProfileExport').onclick=exportAdminUserProfile;
if($('adminUserProfileOverlay'))$('adminUserProfileOverlay').onclick=(ev)=>{if(ev.target===$('adminUserProfileOverlay'))closeAdminUserProfile()};
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

function renderAdmin(){renderAdminDashboard();renderModuleControls();renderAdminCars();renderAdminUsers();renderAdminUserPermissions();renderNotificationAdmin();renderAudit()}
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
if($('useNormalTemplate'))$('useNormalTemplate').onclick=()=>{$('normalNotifyMessage').value=(D.system?.mode==='hibernation'?HIBERNATION_RETURN_TEMPLATE:NORMAL_RETURN_TEMPLATE)};
if($('forceLogoutAll'))$('forceLogoutAll').onclick=async()=>{
  if(!confirm('Vynutit odhlášení VŠECH uživatelů?\n\nOdhlásí se i tento Admin účet. PINy se nezmění a naposledy vybraný profil zůstane zapamatovaný. Každý pouze znovu zadá svůj stávající PIN.'))return;
  $('forceLogoutAll').disabled=true;
  try{
    await api('adminForceLogoutAll');
    lockApp('🚪 Všechny relace byly ukončeny. Přihlas se znovu svým stávajícím PINem.','msg warn');
  }catch(x){note($('forceLogoutAllMsg'),errorText(x),'msg err');$('forceLogoutAll').disabled=false}
};
if($('saveSystemMode'))$('saveSystemMode').onclick=async()=>{
  const mode=$('systemMode').value,message=$('systemMessage').value.trim();
  const returningToNormal=mode==='normal'&&(D.system?.mode||'normal')!=='normal';
  const notifyOnNormal=returningToNormal&&$('normalNotify').checked;
  const normalNotifyMessage=$('normalNotifyMessage').value.trim();
  const hibernationAllowedUserIds=mode==='hibernation'?[...document.querySelectorAll('.hibernation-user-toggle:checked')].map(x=>x.value):(D.system?.hibernationAllowedUserIds||[]);
  const label=mode==='normal'?'NORMAL':mode==='read_only'?'READ ONLY':mode==='hibernation'?'HIBERNACE':'MAINTENANCE';
  const wakingFromHibernation=returningToNormal&&(D.system?.mode||'normal')==='hibernation';
  if(notifyOnNormal&&!normalNotifyMessage)return note($('systemModeMsg'),'Doplň text oznámení pro návrat do NORMAL.','msg err');
  const extra=mode==='hibernation'?'\nVýjimky ONLINE: '+hibernationAllowedUserIds.length+' uživatelů.':'';
  const notifyConfirm=notifyOnNormal?(wakingFromHibernation?'\nOdešle se KRITICKÉ systémové oznámení s povinným potvrzením „Rozumím“.':'\nUživatelům se zároveň odešle oznámení.'):'';
  if(!confirm('Nastavit provozní režim '+label+'?'+extra+notifyConfirm))return;
  $('saveSystemMode').disabled=true;
  try{
    const r=await api('adminSetSystemMode',{mode,message,hibernationAllowedUserIds,notifyOnNormal,normalNotifyMessage});
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
if($('addTireTaskRow'))$('addTireTaskRow').onclick=()=>{collectTireTaskDraftRows();if(tireTaskDraftRows.length>=20)return;tireTaskDraftRows.push(newTireTaskDraftRow());renderTireTaskDraft()};
if($('tireTaskDate'))$('tireTaskDate').onchange=renderTireTaskCarryovers;
if($('tireTaskAssignee'))$('tireTaskAssignee').onchange=renderTireTaskCarryovers;
if($('taskHandoverSubmit'))$('taskHandoverSubmit').onclick=submitTaskHandover;
if($('taskHandoverCancel'))$('taskHandoverCancel').onclick=()=>{if($('taskHandoverSubmit').disabled)return;$('taskHandoverOverlay').hidden=true;taskHandoverId=null};
if($('taskDotClose'))$('taskDotClose').onclick=closeTaskDot;
if($('taskDotReturn'))$('taskDotReturn').onclick=closeTaskDot;
if($('taskEditSubmit'))$('taskEditSubmit').onclick=submitTaskEdit;
if($('taskEditCancel'))$('taskEditCancel').onclick=()=>{if(!taskEditContext?.saving)closeTaskEdit()};
if($('taskEditClose'))$('taskEditClose').onclick=()=>{if(!taskEditContext?.saving)closeTaskEdit()};
document.addEventListener('keydown',event=>{
  if(adminOwnPinContext){
    if(event.key==='Escape'){event.preventDefault();if(!adminOwnPinContext.saving)closeAdminOwnPinChange()}
    if(event.key==='Tab'){const focusable=[...$('adminOwnPinOverlay').querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length),first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
    return;
  }
  if(taskEditContext){
    if(event.key==='Escape'){event.preventDefault();if(!taskEditContext.saving)closeTaskEdit()}
    if(event.key==='Tab'){const focusable=[...$('taskEditOverlay').querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&el.getClientRects().length),first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
    return;
  }
  if(!taskDotContext)return;
  if(event.key==='Escape'){event.preventDefault();closeTaskDot()}
  if(event.key==='Tab'){
    const focusable=[...$('taskDotOverlay').querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length),first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  }
});
if($('adminOwnPinSubmit'))$('adminOwnPinSubmit').onclick=submitAdminOwnPinChange;
for(const id of ['adminOwnPinClose','adminOwnPinCancel'])if($(id))$(id).onclick=()=>{if(!adminOwnPinContext?.saving)closeAdminOwnPinChange()};
for(const id of ['adminOwnPinOld','adminOwnPinNew','adminOwnPinConfirm'])if($(id))$(id).oninput=()=>$(id).value=$(id).value.replace(/\D/g,'').slice(0,4);
if($('adminOwnPinConfirm'))$('adminOwnPinConfirm').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();submitAdminOwnPinChange()}};
if($('createTireTask'))$('createTireTask').onclick=async()=>{
  const date=$('tireTaskDate').value,rows=collectTireTaskDraftRows();
  const entries=rows.map(r=>({time:r.time,carId:r.carId,category:r.category,dotOrder:[r.firstSeason,r.firstSeason==='summer'?'winter':'summer'],instructions:r.instructions}));
  if(!date)return note($('tireTaskCreateMsg'),'Vyber datum plánu.','msg err');
  if(!entries.length||entries.length>20)return note($('tireTaskCreateMsg'),'Plán musí obsahovat 1 až 20 vozidel.','msg err');
  if(new Set(entries.map(r=>r.carId)).size!==entries.length)return note($('tireTaskCreateMsg'),'Stejné vozidlo je v plánu vícekrát.','msg err');
  const incomplete=entries.findIndex(r=>!r.carId||!r.category||!['summer','winter'].includes(r.dotOrder[0]));
  if(incomplete>=0)return note($('tireTaskCreateMsg'),'Doplň vozidlo a skupinu u řádku '+(incomplete+1)+'.','msg err');
  const data={date,entries,assignedToUserId:$('tireTaskAssignee').value,instructions:$('tireTaskInstructions').value.trim(),carryoverIds:[...document.querySelectorAll('.tt-carryover-choice:checked')].map(input=>input.dataset.id)};
  const signature=JSON.stringify(data);if(taskCreateRequest?.signature!==signature)taskCreateRequest={signature,id:crypto.randomUUID()};data.requestId=taskCreateRequest.id;$('createTireTask').disabled=true;
  try{
    const result=await api('tireTaskCreateBatch',data);
    tireTaskDraftRows=[newTireTaskDraftRow()];$('tireTaskInstructions').value='';$('tireTaskAssignee').value='';
    taskCreateRequest=null;note($('tireTaskCreateMsg'),'✅ Denní TASK byl vytvořen · '+result.count+' vozidel.','msg ok');
    await refresh();setTimeout(()=>$('tireTaskCreateMsg').innerHTML='',2200)
  }catch(x){note($('tireTaskCreateMsg'),errorText(x),'msg err')}finally{$('createTireTask').disabled=false}
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('taskProblemOverlay')?.hidden)closeTaskProblem();if(e.key==='Escape'&&!$('globalSearchOverlay')?.hidden)closeGlobalSearch();if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&tok){e.preventDefault();openGlobalSearch()}});
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
window.addEventListener('pagehide',()=>{if(!tok)return;captureTaskWork();for(const id of taskDraftTimers.keys()){clearTimeout(taskDraftTimers.get(id));const draftSequence=(taskDraftSequences.get(id)||0)+1;taskDraftSequences.set(id,draftSequence);fetch('/api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({action:'tireTaskSaveDraft',taskId:id,draft:taskDrafts.get(id),draftClientId:taskDraftClientId,draftSequence}),keepalive:true}).catch(()=>{})}fetch('/api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({action:'heartbeat',visible:false,active:false}),keepalive:true}).catch(()=>{})});
setInterval(()=>{if(tok&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))syncCheck()},30000);
setInterval(()=>{if(tok&&currentModule==='admin'&&me?.role==='admin')loadAdminState(true).catch(()=>{})},60000);
setInterval(()=>{if(tok&&document.visibilityState==='visible')heartbeat()},90000);
applyTheme();loadLoginUsers();if('serviceWorker'in navigator)ensureSW().catch(()=>{});
})();
