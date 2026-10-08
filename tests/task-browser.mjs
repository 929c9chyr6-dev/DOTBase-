// End-to-end check against the real API handler with isolated in-memory Blob.
// Run with Playwright installed; optional executable/module overrides support
// environments where a browser is supplied separately.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import server from './browser-server.mjs';
import {create,read,tomorrow} from './task-fixture.mjs';
const {chromium}=await import(process.env.AUTOPROVOZ_PLAYWRIGHT_MODULE||'playwright');
const binary=process.env.AUTOPROVOZ_CHROMIUM_PATH;
const browser=await chromium.launch({headless:true,...(binary?{executablePath:binary,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']}:{}),env:process.env});
const errors=[],alerts=[];
const page=await browser.newPage({viewport:{width:390,height:844},locale:'cs-CZ'});
page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept()});
const base='http://127.0.0.1:4173';await fs.mkdir('test-results',{recursive:true});
async function login(user,pin,path='?module=tiretask'){
  await page.goto(base+'/'+path);await page.locator('#loginUser option[value="'+user+'"]').waitFor({state:'attached'});await page.locator('#loginUser').selectOption(user);await page.locator('#pin').fill(pin);await page.locator('#loginBtn').click();await page.locator('#main').waitFor({state:'visible'});
  await page.locator(path.includes('tab=admin')?'#admin.active':'#tiretask.active').waitFor({state:'visible'});
}
async function stateUntil(predicate){for(let i=0;i<100;i++){const rows=read('tiretasks.json');if(predicate(rows))return rows;await new Promise(r=>setTimeout(r,50))}throw new Error('TASK state did not update')}
async function vehicle(id){const v=page.locator('.task-vehicle[data-vehicle-id="'+id+'"]').first();await v.locator('summary').first().click();return v}
async function startVehicle(id){const v=page.locator('#tireTaskMineList .task-vehicle[data-vehicle-id="'+id+'"]');if(!await v.evaluate(el=>el.open))await v.locator('summary').first().click();await v.getByRole('button',{name:'▶ Pracuji na tom',exact:true}).click();await v.locator('.task-dot-form').waitFor({state:'visible'});return v}
try{
  await login('admin','9001');await page.locator('#tireTaskCreateCard').waitFor({state:'visible'});
  for(let i=0;i<3;i++)await page.locator('#addTireTaskRow').click();
  const rows=page.locator('.tiretask-plan-row');assert.equal(await rows.count(),4);
  for(let i=0;i<4;i++){await rows.nth(i).locator('.tt-plan-car').selectOption('car'+(i+1));await rows.nth(i).locator('.tt-plan-instructions').fill('Instrukce vozidlo '+(i+1))}
  await page.locator('#tireTaskAssignee').selectOption('worker1');await page.locator('#tireTaskInstructions').fill('Denní plán · servis podle pořadí');
  await page.locator('#createTireTask').click();let tasks=await stateUntil(t=>t.length===4);assert.equal(new Set(tasks.map(t=>t.batchId)).size,1);assert.equal(tasks[2].instructions,'Instrukce vozidlo 3');
  console.log('PASS creator: one daily TASK with four ordered cars and individual instructions');
  await create('worker2',tomorrow(),['car5','car6','car7','car8']);
  await login('worker1','9002');await page.locator('#tireTaskMineList .tt-accept').click();await page.locator('#tireTaskMineList .task-accept-meta').waitFor({state:'visible'});
  assert.equal(await page.locator('#tireTaskMineList .task-daily').count(),1);assert.equal(await page.locator('#tireTaskMineList .tt-accept').count(),0);
  let v=await startVehicle(tasks[0].id);await v.locator('[data-field="dot"]').fill('2426');await v.locator('[data-field="mileage"]').fill('120001');await v.locator('.task-draft-state').filter({hasText:'Rozpracované údaje uložené'}).waitFor({state:'visible'});
  await login('worker1','9002');v=page.locator('#tireTaskMineList .task-vehicle[data-vehicle-id="'+tasks[0].id+'"]');await v.locator('.task-dot-form').waitFor({state:'visible'});assert.equal(await v.locator('[data-field="dot"]').inputValue(),'2426');assert.equal(await v.locator('[data-field="mileage"]').inputValue(),'120001');
  await v.getByRole('button',{name:'✅ Dokončit',exact:true}).click();await stateUntil(rows=>rows.find(t=>t.id===tasks[0].id).status==='completed');
  v=await startVehicle(tasks[1].id);await v.locator('[data-field="splitDot"]').check();await v.locator('[data-field="dotFront"]').fill('2526');await v.locator('[data-field="dotRear"]').fill('3225');await v.locator('[data-field="mileage"]').fill('130002');await v.getByRole('button',{name:'✅ Dokončit',exact:true}).click();await stateUntil(rows=>rows.find(t=>t.id===tasks[1].id).status==='completed');
  v=await startVehicle(tasks[2].id);await v.locator('[data-field="dot"]').fill('2626');await v.locator('[data-field="mileage"]').fill('140003');await v.getByRole('button',{name:'✅ Dokončit',exact:true}).click();await stateUntil(rows=>rows.find(t=>t.id===tasks[2].id).status==='completed');
  v=await startVehicle(tasks[3].id);await v.locator('[data-field="mileage"]').fill('150004');assert.equal(await page.locator('#tireTaskMineList .tt-finish-group').isDisabled(),true);
  await page.screenshot({path:'test-results/task-mobile-light.png',fullPage:true});
  await page.locator('#tireTaskMineList .tt-handover').click();await page.locator('#taskHandoverOverlay').waitFor({state:'visible'});assert.equal(await page.locator('#taskHandoverReceiver').inputValue(),'worker2');await page.locator('#taskHandoverService').check();await page.locator('#taskHandoverNote').fill('Klíče jsou na recepci servisu.');await page.locator('#taskHandoverSubmit').click();
  const handed=await stateUntil(rows=>rows.length===9),solo=handed.find(t=>t.kind==='carryover');assert.equal(solo.draft.mileage,'150004');assert.equal(solo.draft.dot,'');
  await page.locator('#taskHandoverOverlay').waitFor({state:'hidden'});await page.locator('#tireTaskArchiveList .task-daily').waitFor({state:'visible'});assert.match(await page.locator('#tireTaskArchiveList').innerText(),/3 dokončeno · 1 předáno/);
  console.log('PASS worker1: acceptance, start, single/split DOT, autosave/reload, three cars finished, overnight handover');
  await login('worker2','9003');await page.locator('#tireTaskMineList .task-daily').first().waitFor({state:'visible'});assert.equal(await page.locator('#tireTaskMineList .task-daily').count(),2,'separate solo and daily TASK');
  const soloGroup=page.locator('#tireTaskMineList .task-daily[data-group-id="'+solo.batchId+'"]');await soloGroup.locator('.tt-accept').click();await soloGroup.locator('.task-accept-meta').waitFor({state:'visible'});v=await startVehicle(solo.id);assert.equal(await v.locator('[data-field="mileage"]').inputValue(),'150004');await v.locator('[data-field="dot"]').fill('3126');
  assert.equal(await soloGroup.locator('.tt-finish-vehicle').count(),0);await soloGroup.locator('.tt-finish-group').click();await stateUntil(rows=>rows.find(t=>t.id===solo.id).status==='closed');
  const finished=read('tiretasks.json');assert.equal(finished.filter(t=>t.batchId===tasks[0].batchId&&t.status==='closed').length,4);assert.equal(finished.find(t=>t.id===tasks[3].id).completedById,'worker2');assert.equal(finished.find(t=>t.id===tasks[0].id).workClosedById,'worker1');assert.equal(finished.filter(t=>t.kind==='daily'&&t.assignedToUserId==='worker2').every(t=>t.status==='planned'),true);
  console.log('PASS worker2: separate carryover with retained data, one final action, origin completed, new daily TASK untouched');
  await page.evaluate(()=>{localStorage.setItem('appTheme','dark')});await login('worker1','9002');await page.locator('#tireTaskArchiveList .task-daily').waitFor({state:'visible'});await page.screenshot({path:'test-results/task-mobile-dark-history.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false,'mobile has no horizontal overflow');
  await page.setViewportSize({width:1000,height:900});await login('admin','9001','?tab=admin');await page.locator('[data-admin="permissions"]').click();await page.locator('#userPermissions').waitFor({state:'visible'});assert.equal(await page.locator('.utasknotice-rights[data-id="dispatch"]').count(),5);
  await page.locator('.utasknotice-rights[data-id="dispatch"][data-key="vehicleStarted"]').uncheck();await page.locator('.save-user-rights[data-id="dispatch"]').click();for(let i=0;i<80&&read('config.json').users.find(u=>u.id==='dispatch').taskNotifications.vehicleStarted;i++)await new Promise(r=>setTimeout(r,50));assert.equal(read('config.json').users.find(u=>u.id==='dispatch').taskNotifications.vehicleStarted,false);
  await page.screenshot({path:'test-results/task-desktop-rights.png',fullPage:true});assert.deepEqual(errors,[]);assert.equal(alerts.filter(x=>!x.includes('Práva uživatele')).length,0);
  console.log('PASS light/dark mobile, desktop, five independent notification rights; no browser errors');
}catch(error){await page.screenshot({path:'test-results/task-browser-failure.png',fullPage:true}).catch(()=>{});console.error('BROWSER ERRORS',errors,'ALERTS',alerts);throw error}finally{await browser.close();server.closeAllConnections();server.close()}
