// Real UI and API with isolated data; never connects to production storage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import server from './browser-server.mjs';
import {call,ok,create,start,record,read,today,tomorrow} from './task-fixture.mjs';
const {chromium}=await import(process.env.AUTOPROVOZ_PLAYWRIGHT_MODULE||'playwright');
const binary=process.env.AUTOPROVOZ_CHROMIUM_PATH;
const browser=await chromium.launch({headless:true,...(binary?{executablePath:binary,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']}:{}),env:process.env});
const page=await browser.newPage({viewport:{width:390,height:844},locale:'cs-CZ'}),errors=[],dialogs=[];
page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
let acceptDelete=false;
page.on('dialog',async dialog=>{dialogs.push(dialog.message());if(dialog.type()==='confirm'&&!acceptDelete)await dialog.dismiss();else await dialog.accept()});
const base='http://127.0.0.1:4173';await fs.mkdir('test-results',{recursive:true});
async function login(user,pin,path='?module=tiretask'){
  await page.goto(base+'/'+path);await page.locator('#loginUser option[value="'+user+'"]').waitFor({state:'attached'});await page.locator('#loginUser').selectOption(user);await page.locator('#pin').fill(pin);await page.locator('#loginBtn').click();await page.locator(path.includes('tab=admin')?'#admin.active':'#tiretask.active').waitFor({state:'visible'});
}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50))}throw new Error('Fixture state did not update')}
const task=id=>read('tiretasks.json').find(t=>t.id===id);
const group=(area,t)=>page.locator(area+' .task-daily[data-group-id="'+t.batchId+'"]');
async function vehicle(area,t){const v=group(area,t).locator('.task-vehicle[data-vehicle-id="'+t.id+'"]');if(!await v.evaluate(el=>el.open))await v.locator('summary').first().click();return v}
async function rights(user,values){
  await login('admin','9001','?tab=admin');await page.locator('[data-admin="permissions"]').click();
  for(const [key,value] of Object.entries(values))await page.locator('.uperm-rights[data-id="'+user+'"][data-k="'+key+'"]').setChecked(value);
  await page.locator('.save-user-rights[data-id="'+user+'"]').click();await until(()=>Object.entries(values).every(([k,v])=>read('config.json').users.find(u=>u.id===user).permissions[k]===v));await page.locator('.save-user-rights[data-id="'+user+'"]').waitFor({state:'visible'});
}
try{
  const planned=await create('worker1',today(),['car1','car2'],{entries:['car1','car2'].map(carId=>({carId,category:'POOL',dotOrder:['summer','winter']}))});
  const [closed]=await create('worker1',today(),['car3'],{entries:[{carId:'car3',category:'POOL',dotOrder:['summer','winter']}]});
  await ok('worker1','tireTaskAccept',{taskId:closed.id});await start('worker1',closed.id);await record('worker1',closed,{season:'summer',dot:'2526',mileage:121000});await record('worker1',closed,{season:'winter',dot:'3026',mileage:121005});await ok('worker1','tireTaskClose',{taskId:closed.id});
  const evidence=structuredClone(task(closed.id));
  const [next]=await create('worker2',tomorrow(),['car5']);
  const [origin]=await create('worker1',today(),['car4'],{entries:[{carId:'car4',category:'VIP',dotOrder:['summer','winter']}]});
  await ok('worker1','tireTaskAccept',{taskId:origin.id});await start('worker1',origin.id);await record('worker1',origin,{season:'summer',dot:'2726',mileage:125000});
  const handover=await ok('worker1','tireTaskHandover',{taskId:origin.id,staysAtService:true}),solo=task(handover.continuationTaskId);
  const [cancelOrigin]=await create('worker1',today(),['car6']);await ok('worker1','tireTaskAccept',{taskId:cancelOrigin.id});await start('worker1',cancelOrigin.id);
  const cancelledHandover=await ok('worker1','tireTaskHandover',{taskId:cancelOrigin.id,staysAtService:true,receiverId:'worker2'}),cancelSolo=task(cancelledHandover.continuationTaskId);
  await login('admin','9001');
  const active=group('#tireTaskList',planned[0]);await active.locator('.tt-group-edit').click();await page.locator('#taskEditOverlay').waitFor({state:'visible'});
  assert.equal(await page.locator('#taskEditVehicleFields').isVisible(),false);assert.equal(await page.locator('#taskEditAssignee').isEnabled(),true);
  await page.locator('#taskEditDate').fill(tomorrow());await page.locator('#taskEditAssignee').selectOption('worker2');await page.locator('#taskEditBatchInstructions').fill('Opravený denní plán');await page.locator('#taskEditSubmit').click();await page.locator('#taskEditOverlay').waitFor({state:'hidden'});await until(()=>planned.every(t=>task(t.id).date===tomorrow()&&task(t.id).assignedToUserId==='worker2'));
  let v=await vehicle('#tireTaskList',planned[0]);await v.locator('.tt-edit').click();assert.equal(await page.locator('#taskEditCar').isEnabled(),true);assert.equal(await page.locator('#taskEditOrder').isEnabled(),true);
  await page.locator('#taskEditCar').selectOption('car7');await page.locator('#taskEditOrder').selectOption('winter');await page.locator('#taskEditTime').fill('08:30');await page.locator('#taskEditInstructions').fill('Opravené vozidlo před zahájením');await page.locator('#taskEditSubmit').click();await page.locator('#taskEditOverlay').waitFor({state:'hidden'});await until(()=>task(planned[0].id).carId==='car7');assert.deepEqual(task(planned[0].id).dotOrder,['winter','summer']);
  console.log('PASS planned editor: entire group date, assignee and instructions; vehicle, time and DOT order before starting');
  v=await vehicle('#tireTaskArchiveList',closed);await v.locator('.tt-edit').click();assert.equal(await page.locator('#taskEditCar').isDisabled(),true);assert.equal(await page.locator('#taskEditOrder').isDisabled(),true);assert.equal(await page.locator('#taskEditAssignee').isDisabled(),true);assert.equal(await page.locator('#taskEditHistoryHint').isVisible(),true);
  await page.locator('#taskEditDate').fill(tomorrow());await page.locator('#taskEditTime').fill('10:15');await page.locator('#taskEditCategory').selectOption('VIP');await page.locator('#taskEditInstructions').fill('Opravené instrukce v historii');await page.locator('#taskEditBatchInstructions').fill('Opravený dokončený TASK');
  await page.locator('#taskEditOverlay .modal-card').evaluate(el=>el.scrollTop=0);assert.equal(await page.locator('#taskEditClose').evaluate(el=>{const b=el.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===el}),true,'notification must not cover editor controls');await page.screenshot({path:'test-results/task-management-mobile-edit.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  await page.locator('#taskEditSubmit').click();await page.locator('#taskEditOverlay').waitFor({state:'hidden'});await until(()=>task(closed.id).instructions==='Opravené instrukce v historii');
  for(const key of ['seasonRecords','drafts','acceptedAt','startedAt','completedAt','closedAt','workClosedAt','assignedToUserId','carId','dotOrder'])assert.deepEqual(task(closed.id)[key],evidence[key],key);
  await group('#tireTaskArchiveList',closed).locator('.tt-group-edit').click();await page.keyboard.press('Escape');await page.locator('#taskEditOverlay').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  await page.evaluate(()=>localStorage.setItem('appTheme','dark'));await login('admin','9001');v=await vehicle('#tireTaskArchiveList',closed);await v.locator('.tt-edit').click();await page.locator('#taskEditOverlay .modal-card').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'test-results/task-management-mobile-dark-edit.png'});await page.locator('#taskEditCancel').click();
  console.log('PASS completed editor: mobile light/dark, metadata changes, original work and both DOT records retained, Escape/cancel');
  await login('dispatch','9004');assert.equal(await page.locator('#tiretask .tt-delete').count(),0);assert.ok(await page.locator('#tireTaskArchiveList .tt-group-edit').count()>0);
  await rights('dispatch',{tireTaskDelete:true});await login('dispatch','9004');await group('#tireTaskList',planned[0]).locator('.tt-delete').waitFor({state:'visible'});
  await rights('dispatch',{tireTaskDelete:false});await login('dispatch','9004');assert.equal(await page.locator('#tiretask .tt-delete').count(),0);assert.equal((await call('dispatch','tireTaskDelete',{taskId:planned[0].id})).status,403);
  await rights('worker2',{tireTaskDelete:true,tireTaskEdit:false,tireTaskCreate:false,tireTaskCompletedView:false});await login('worker2','9003');assert.equal(await page.locator('#tireTaskCreateCard').isVisible(),false);assert.equal(await page.locator('#tiretask .tt-group-edit').count(),0);assert.equal(await page.locator('#tiretask .tt-edit').count(),0);
  const history=group('#tireTaskArchiveList',closed),records=JSON.stringify(read('records-index.json'));await history.locator('.tt-delete').click();assert.ok(task(closed.id),'cancelled confirmation does not delete');assert.match(dialogs.at(-1),/TEST 102/);assert.match(dialogs.at(-1),/kilometrů zůstanou zachované/);
  acceptDelete=true;await history.locator('.tt-delete').click();await until(()=>!task(closed.id));await history.waitFor({state:'detached'});assert.equal(JSON.stringify(read('records-index.json')),records);
  await group('#tireTaskMineList',planned[0]).locator('.tt-delete').click();await until(()=>planned.every(t=>!task(t.id)));assert.ok(task(next.id));assert.equal(JSON.stringify(read('records-index.json')),records);
  console.log('PASS admin delegation/revocation and delete-only access: no create/edit, completed and active whole-group deletion, confirmation, DOT/km retained');
  await group('#tireTaskMineList',cancelSolo).locator('.tt-delete').click();await until(()=>!task(cancelSolo.id)&&task(cancelOrigin.id).status==='cancelled');await group('#tireTaskArchiveList',cancelOrigin).waitFor({state:'visible'});assert.match(await group('#tireTaskArchiveList',cancelOrigin).innerText(),/DOKONČENÍ ZRUŠENO/);assert.equal(await page.locator('#tireTaskList .task-pending').filter({hasText:'TEST 105'}).count(),0);
  await group('#tireTaskArchiveList',origin).locator('.tt-delete').click();await until(()=>!task(origin.id)&&task(solo.id).sourceTaskId===null);v=await vehicle('#tireTaskMineList',solo);await v.getByText('Původní TASK byl smazán. Tento samostatný TASK můžeš dál dokončit.',{exact:true}).waitFor({state:'visible'});assert.equal(await v.locator('.tt-origin').count(),0);assert.equal(task(solo.id).seasonRecords.summer.dotSummary,'2726');assert.ok(task(next.id));
  await page.screenshot({path:'test-results/task-management-mobile-history.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  await page.setViewportSize({width:1100,height:900});await login('admin','9001');await group('#tireTaskArchiveList',cancelOrigin).locator('.tt-group-edit').click();await page.screenshot({path:'test-results/task-management-desktop-edit.png'});await page.locator('#taskEditClose').click();
  await rights('worker2',{tireTaskDelete:false});await login('worker2','9003');assert.equal(await page.locator('#tiretask .tt-delete').count(),0);assert.equal((await call('worker2','tireTaskDelete',{taskId:solo.id})).status,403);
  assert.deepEqual(errors,[]);assert.equal(dialogs.filter(t=>!t.startsWith('Opravdu smazat')&&!t.startsWith('Práva uživatele')).length,0);
  console.log('PASS linked deletion: cancelled pending completion clearly shown, surviving solo remains independent with first DOT, desktop editor, no browser errors');
}catch(error){await page.screenshot({path:'test-results/task-management-failure.png',fullPage:true}).catch(()=>{});console.error('BROWSER ERRORS',errors,'DIALOGS',dialogs);throw error}finally{await browser.close();server.closeAllConnections();server.close()}
