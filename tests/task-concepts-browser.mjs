// Real UI/API against isolated in-memory storage; no production accounts or work.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import server from './browser-server.mjs';
import {read,ok,today,tomorrow} from './task-fixture.mjs';
const {chromium}=await import(process.env.AUTOPROVOZ_PLAYWRIGHT_MODULE||'playwright');
const binary=process.env.AUTOPROVOZ_CHROMIUM_PATH;
const browser=await chromium.launch({headless:true,...(binary?{executablePath:binary,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']}:{}),env:process.env});
const page=await browser.newPage({viewport:{width:390,height:844},locale:'cs-CZ'}),errors=[],dialogs=[];
page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));let acceptConfirm=false;
page.on('dialog',async d=>{dialogs.push(d.message());if(acceptConfirm)await d.accept();else await d.dismiss()});
const base='http://127.0.0.1:4173',concepts=()=>read('task-concepts.json')||[],tasks=()=>read('tiretasks.json')||[],notices=()=>read('notifications.json')||[];
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,40))}throw new Error('Fixture did not update')}
async function ready(){await page.waitForFunction(()=>!document.getElementById('tireTaskConceptCancel').disabled)}
async function login(id,pin){await page.goto(base+'/?module=tiretask');await page.locator('#loginUser option[value="'+id+'"]').waitFor({state:'attached'});await page.locator('#loginUser').selectOption(id);await page.locator('#pin').fill(pin);await page.locator('#loginBtn').click();await page.locator('#tiretask.active').waitFor({state:'visible'})}
const card=id=>page.locator('.task-plan-concept[data-concept-id="'+id+'"]');
await fs.mkdir('test-results',{recursive:true});
try{
  await login('admin','9001');await page.locator('#tireTaskDate').fill('');await page.locator('#tireTaskInstructions').fill('Koncept bez termínu');await page.locator('#saveTireTaskConcept').click();
  await until(()=>concepts().length===1);const id=concepts()[0].id;await card(id).waitFor({state:'visible'});await ready();
  assert.equal(await page.locator('#tireTaskDate').inputValue(),'');assert.equal(await page.locator('#tireTaskAssignee').inputValue(),'');assert.equal(tasks().length,0);assert.equal(notices().length,0);
  assert.equal(await page.locator('#createTireTask').innerText(),'📤 Odeslat a přiřadit TASK');await page.locator('#createTireTask').click();assert.match(await page.locator('#tireTaskCreateMsg').innerText(),/Vyber datum/);
  await login('worker1','9002');assert.equal(await page.locator('#tireTaskConceptsCard').isVisible(),false);assert.equal(await page.locator('#tireTaskMineCard').isVisible(),false);
  await login('dispatch','9004');assert.equal(await card(id).locator('.tt-concept-delete').count(),0);await card(id).locator('.tt-concept-open').click();
  assert.equal(await page.locator('#tireTaskDate').inputValue(),'');assert.equal(await page.locator('#tireTaskInstructions').inputValue(),'Koncept bez termínu');
  await page.locator('#tireTaskDate').fill(tomorrow());await page.locator('#tireTaskAssignee').selectOption('worker1');for(let i=0;i<3;i++)await page.locator('#addTireTaskRow').click();
  const rows=page.locator('#tireTaskRows .tiretask-plan-row');for(let i=0;i<4;i++){await rows.nth(i).locator('.tt-plan-car').selectOption('car'+(i+1));await rows.nth(i).locator('.tt-plan-season').selectOption(i%2?'winter':'summer');await rows.nth(i).locator('.tt-plan-instructions').fill('Klíče vozidla '+(i+1))}
  await rows.first().locator('.tt-plan-time').fill('08:30');await page.locator('#saveTireTaskConcept').click();await until(()=>concepts()[0].version===2);await ready();assert.equal(concepts()[0].entries.length,4);assert.equal(tasks().length,0);
  // A second planner saves while the first still has version 2 open.
  const saved=concepts()[0];await ok('admin','tireTaskConceptSave',{...saved,conceptId:id,version:2,instructions:'Úprava jiného plánovače'});
  await page.locator('#tireTaskInstructions').fill('Moje neuložená změna');await page.locator('#saveTireTaskConcept').click();await page.locator('#tireTaskCreateMsg').getByText(/Koncept mezitím změnil/).waitFor();await ready();
  assert.equal(await page.locator('#tireTaskInstructions').inputValue(),'Moje neuložená změna');assert.equal(concepts()[0].instructions,'Úprava jiného plánovače');
  await page.locator('#tireTaskConceptCancel').click();assert.equal(await page.locator('#tireTaskConceptCancel').isVisible(),true);assert.ok(dialogs.some(d=>d.includes('neuložené změny')));
  acceptConfirm=true;await page.locator('#tireTaskConceptCancel').click();await card(id).locator('.tt-concept-open').click();assert.equal(await page.locator('#tireTaskInstructions').inputValue(),'Úprava jiného plánovače');assert.equal(await rows.count(),4);
  await page.locator('#tireTaskInstructions').fill('Finální plán z konceptu');await page.locator('#saveTireTaskConcept').click();await until(()=>concepts()[0].version===4);await ready();
  await page.locator('#tireTaskConceptCancel').click();await card(id).locator('summary').click();assert.match(await card(id).innerText(),/TEST 100/);assert.match(await card(id).innerText(),/Zimní → Letní/);
  await page.screenshot({path:'test-results/task-concepts-mobile-light.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await login('worker1','9002');assert.equal(await page.locator('#tireTaskMineCard').isVisible(),false);assert.equal(notices().length,0);
  await login('admin','9001');await card(id).locator('.tt-concept-open').click();assert.equal(await page.locator('#tireTaskInstructions').inputValue(),'Finální plán z konceptu');assert.equal(await page.locator('#tireTaskDate').inputValue(),tomorrow());
  await page.locator('#createTireTask').click();await until(()=>tasks().length===4&&concepts()[0].status==='published');await ready();assert.equal(await card(id).count(),0);assert.equal(notices().filter(n=>n.type==='task_assignment').length,1);
  assert.deepEqual(tasks().map(t=>t.dotOrder),[['summer','winter'],['winter','summer'],['summer','winter'],['winter','summer']]);
  await login('worker1','9002');await page.locator('#tireTaskMineList .task-daily').waitFor({state:'visible'});assert.equal(await page.locator('#tireTaskMineList .task-vehicle').count(),4);assert.equal(await page.locator('#tireTaskMineList .tt-accept').count(),1);assert.equal(tasks().some(t=>t.acceptedAt),false);
  console.log('PASS partial concepts, persistence, four-car editing, stale version/unsaved guard, no pre-publication work or notices, one standard assigned TASK');
  await login('admin','9001');await page.locator('#tireTaskInstructions').fill('Koncept ke smazání');await page.locator('#saveTireTaskConcept').click();await until(()=>concepts().some(c=>c.status==='draft'));await ready();const removeId=concepts().find(c=>c.status==='draft').id;
  await page.locator('#tireTaskConceptCancel').click();await card(removeId).locator('.tt-concept-delete').click();await until(()=>concepts().find(c=>c.id===removeId).status==='deleted');await card(removeId).waitFor({state:'detached'});assert.equal(tasks().length,4);
  await ok('admin','adminUpdateUser',{userId:'worker2',permissions:{tireTaskEdit:true,tireTaskCreate:false,tireTaskDelete:false}});
  const editOnly=await ok('admin','tireTaskConceptSave',{date:today(),entries:[{}],instructions:'Pouze editor',requestId:'editor-concept'});
  await login('worker2','9003');assert.equal(await page.locator('#tireTaskCreateCard').isVisible(),false);await card(editOnly.conceptId).locator('.tt-concept-open').click();await page.locator('#tireTaskCreateCard').waitFor({state:'visible'});assert.equal(await page.locator('#createTireTask').isVisible(),false);assert.equal(await page.locator('#saveTireTaskConcept').isVisible(),true);
  await page.locator('#tireTaskInstructions').fill('Uložil editor');await page.locator('#saveTireTaskConcept').click();await until(()=>concepts().find(c=>c.id===editOnly.conceptId).version===2);await ready();
  await ok('admin','adminUpdateUser',{userId:'worker2',permissions:{tireTaskEdit:false,tireTaskDelete:true}});await login('worker2','9003');assert.equal(await card(editOnly.conceptId).locator('.tt-concept-open').count(),0);await card(editOnly.conceptId).locator('.tt-concept-delete').click();await until(()=>concepts().find(c=>c.id===editOnly.conceptId).status==='deleted');
  await login('admin','9001');await page.locator('#tireTaskInstructions').fill('Tmavý koncept');await page.locator('#saveTireTaskConcept').click();await until(()=>concepts().some(c=>c.status==='draft'));await ready();
  await page.evaluate(()=>localStorage.setItem('appTheme','dark'));await login('admin','9001');const darkId=concepts().find(c=>c.status==='draft').id;await card(darkId).locator('.tt-concept-open').click();await page.screenshot({path:'test-results/task-concepts-mobile-dark.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1100,height:900});await page.screenshot({path:'test-results/task-concepts-desktop-dark.png',fullPage:true});assert.equal(await page.locator('#saveTireTaskConcept').isEnabled(),true);assert.equal(await page.locator('#createTireTask').isEnabled(),true);
  await page.locator('#lock').click();await page.locator('#login').waitFor({state:'visible'});await page.locator('#loginUser').selectOption('dispatch');await page.locator('#pin').fill('9004');await page.locator('#loginBtn').click();await page.locator('#tireTaskPlanTitle').getByText('＋ Vytvořit denní TASK',{exact:true}).waitFor();assert.equal(await page.locator('#tireTaskInstructions').inputValue(),'');
  assert.deepEqual(errors,[]);console.log('PASS delegated edit/delete rights, mobile/desktop light/dark, logout clears editor, no browser errors or horizontal overflow');
}catch(e){await page.screenshot({path:'test-results/task-concepts-failure.png',fullPage:true}).catch(()=>{});console.error('BROWSER ERRORS',errors);throw e}finally{await browser.close();server.closeAllConnections();server.close()}
