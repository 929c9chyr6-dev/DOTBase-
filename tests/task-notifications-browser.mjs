// Shared-device regression checks use a simulated browser push subscription.
// The real API handler runs against isolated Blob data; no push is sent.
import assert from 'node:assert/strict';
import server from './browser-server.mjs';
import {create,ok,read} from './task-fixture.mjs';
const {chromium}=await import(process.env.AUTOPROVOZ_PLAYWRIGHT_MODULE||'playwright');
const binary=process.env.AUTOPROVOZ_CHROMIUM_PATH;
const browser=await chromium.launch({headless:true,...(binary?{executablePath:binary,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']}:{}),env:process.env});
const page=await browser.newPage({viewport:{width:390,height:844},locale:'cs-CZ'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(12000);
const subscription={endpoint:'https://push.test.invalid/shared-device',keys:{p256dh:'isolated-test',auth:'isolated-test'}};
await page.addInitScript(subscription=>{
  window.__pushUnsubscribed=false;
  const sub={toJSON:()=>subscription,endpoint:subscription.endpoint,unsubscribe:async()=>{window.__pushUnsubscribed=true;return true}};
  const registration={pushManager:{getSubscription:async()=>window.__pushUnsubscribed?null:sub}};
  Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,ready:Promise.resolve(registration)},configurable:true});
  Object.defineProperty(window,'PushManager',{value:function(){},configurable:true});
},subscription);
async function login(id,pin){
  await page.locator('#loginUser option[value="'+id+'"]').waitFor({state:'attached'});
  await page.locator('#loginUser').selectOption(id);await page.locator('#pin').fill(pin);await page.locator('#loginBtn').click();
  await page.locator('#main').waitFor({state:'visible'});
}
async function owner(id){for(let i=0;i<100;i++){if(read('push.json')?.find(p=>p.subscription.endpoint===subscription.endpoint)?.userId===id)return;await new Promise(r=>setTimeout(r,30))}assert.equal(read('push.json')?.[0]?.userId,id,'existing device subscription must follow the newly logged-in profile')}
try{
  await ok('admin','adminUpdateUser',{userId:'worker2',taskNotifications:{accepted:true}});
  const tasks=await create();await ok('admin','pushSubscribe',{subscription});
  await page.goto('http://127.0.0.1:4173/?module=tiretask');await login('worker1','9002');await owner('worker1');
  await page.locator('#tiretask.active').waitFor({state:'visible'});
  assert.ok(read('tiretasks.json').every(t=>!t.acceptedAt),'opening the TASK must not accept it');
  await page.locator('#tireTaskMineList .tt-accept').click();
  for(let i=0;i<100&&!read('tiretasks.json')[0].acceptedAt;i++)await new Promise(r=>setTimeout(r,30));
  const state=await ok('worker1','state');assert.equal(state.toastNotifications.some(n=>n.type==='task_accepted'),false);
  console.log('PASS shared device now belongs to the worker; opening does not accept TASK; acceptance notice is not returned to its sender');
  await page.locator('#lock').click();assert.equal(await page.locator('#notificationToast').isVisible(),false,'locking clears the previous profile notification');
  await login('worker2','9003');await owner('worker2');await page.locator('#notificationToast').waitFor({state:'visible'});
  assert.match(await page.locator('#notificationToast').innerText(),/TASK přijat/);
  await ok('admin','adminUpdateUser',{userId:'worker2',taskNotifications:{accepted:false}});
  const refreshedAt=Date.now();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.locator('#notificationToast').waitFor({state:'hidden'});
  assert.ok(Date.now()-refreshedAt<3000,'permission refresh must hide the queued toast before its automatic timeout');
  await page.locator('#headerNotifications').click();await page.locator('#notifications.active').waitFor({state:'visible'});
  assert.equal(await page.locator('.notification-card').filter({hasText:'TASK přijat'}).count(),0);
  console.log('PASS disabling acceptance notices removes queued toast and inbox access immediately');
  const worker=read('config.json').users.find(u=>u.id==='worker1');
  await ok('admin','adminUpdateUser',{userId:'worker1',permissions:{...worker.permissions,notificationsReceive:false}});
  await page.locator('#lock').click();await login('worker1','9002');
  await page.waitForFunction(()=>window.__pushUnsubscribed);
  assert.equal(read('push.json').some(p=>p.subscription.endpoint===subscription.endpoint),false);
  console.log('PASS login with notifications disabled invalidates the previous profile browser subscription');
  assert.deepEqual(errors,[]);
}finally{await browser.close();server.closeAllConnections();server.close()}
