import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, call, ok, read, put } from './task-fixture.mjs';
import { pragueLocalToIso, processScheduledNotices, SCHEDULE_PATH } from '../lib/manual-notifications.js';
import cron from '../api/scheduled-notifications.js';

const future = (minutes=60) => new Date(Date.now()+minutes*60000).toISOString();
const payload = extra => ({title:'Testovací oznámení',message:'Pouze izolované testovací účty.',recipient:'selected',recipientUserIds:['worker1','worker2'],severity:'info',...extra});
const rows = () => read(SCHEDULE_PATH)||[];
const notices = () => read('notifications.json')||[];
async function config(change){const cfg=read('config.json');change(cfg);await put('config.json',JSON.stringify(cfg),{allowOverwrite:true})}
async function schedule(extra={},user='admin',action='sendOperationalNotification'){return ok(user,action,payload({scheduledAt:future(),requestId:'schedule-'+Math.random(),...extra}))}
const mockPush = async ids => ({sent:ids.length,devices:ids.length,failed:0});

test('immediate operational and admin notices deliver once to each selected recipient; old single and all clients still work',async()=>{
  await seed();const sent=await ok('admin','sendOperationalNotification',payload({recipientUserIds:['worker1','worker1','worker2']}));
  assert.equal(sent.recipientCount,2);assert.deepEqual(notices()[0].recipientUserIds,['worker1','worker2']);
  for(const id of ['worker1','worker2'])assert.equal((await ok(id,'notificationData')).notificationInbox.length,1);
  for(const id of ['admin','dispatch'])assert.equal((await ok(id,'notificationData')).notificationInbox.length,0);
  await ok('admin','adminSendNotification',payload({severity:'critical',requiresAck:false,carId:'car1'}));
  assert.equal(notices()[0].requiresAck,true);assert.equal(notices()[0].carId,'car1');
  await ok('admin','sendOperationalNotification',payload({recipient:'worker1'}));assert.deepEqual(notices()[0].recipientUserIds,['worker1']);
  await ok('admin','sendOperationalNotification',payload({recipient:'all'}));assert.equal(notices()[0].recipientUserIds.length,4);
});

test('send and schedule permissions remain delegated; recipient IDs and delivery modes are validated before creating anything',async()=>{
  await seed();assert.equal((await call('worker1','sendOperationalNotification',payload())).status,403);
  assert.equal((await call('dispatch','sendOperationalNotification',payload({scheduledAt:future()}))).status,403);
  await config(c=>{c.users.find(u=>u.id==='dispatch').permissions.notificationsSendOperational=true});
  await schedule({},'dispatch');assert.equal(rows()[0].byUserId,'dispatch');
  assert.equal((await call('dispatch','adminSendNotification',payload({scheduledAt:future()}))).status,403);
  for(const recipientUserIds of [[],['missing'],['worker1','missing']])assert.equal((await call('admin','sendOperationalNotification',payload({recipientUserIds}))).status,400);
  assert.equal((await call('admin','sendOperationalNotification',payload({deliveryMode:'scheduled'}))).status,400);
  assert.equal((await call('admin','sendOperationalNotification',payload({deliveryMode:'unexpected'}))).status,400);
  assert.equal(notices().length,0);
});

test('Prague times convert independently of server/browser timezone, reject DST gaps and calendar errors, and expiry must follow delivery',async()=>{
  assert.equal(pragueLocalToIso('2027-01-15T08:30'),'2027-01-15T07:30:00.000Z');
  assert.equal(pragueLocalToIso('2027-07-15T08:30'),'2027-07-15T06:30:00.000Z');
  assert.equal(pragueLocalToIso('2026-10-25T02:30'),'2026-10-25T00:30:00.000Z');
  for(const time of ['2027-03-28T02:30','2027-02-30T08:00','2027-01-01T24:00','bad'])assert.throws(()=>pragueLocalToIso(time));
  await seed();const r=await schedule({scheduledAt:null,scheduledLocal:'2027-01-15T08:30',expiresLocal:'2027-01-15T09:00'});
  assert.equal(r.scheduledAt,'2027-01-15T07:30:00.000Z');assert.equal(rows()[0].expiresAt,'2027-01-15T08:00:00.000Z');
  for(const extra of [{scheduledAt:new Date(Date.now()-1000).toISOString()},{expiresAt:future(30)},{expiresAt:future()},{scheduledAt:'bad'},{scheduledAt:null,scheduledLocal:'2027-03-28T02:30'}])assert.equal((await call('admin','sendOperationalNotification',payload({scheduledAt:future(),...extra}))).status,400);
  assert.equal(rows().length,1);assert.equal(notices().length,0);
});

test('future messages are private to sender/admin, never visible as inbox/toast/unread before delivery, then send without app activity',async()=>{
  await seed();const r=await schedule({requiresAck:true});
  assert.equal((await ok('admin','notificationData')).notificationSchedules.length,1);
  for(const id of ['worker1','worker2','dispatch']){const data=await ok(id,'notificationData');assert.equal(data.notificationSchedules.length,0);assert.equal(data.notificationInbox.length,0);assert.equal(data.notificationUnreadCount,0);assert.equal(data.pendingNotifications.length,0);assert.equal(data.toastNotifications.length,0)}
  assert.equal((await processScheduledNotices({now:Date.parse(r.scheduledAt)-1,push:mockPush})).processed,0);
  const result=await processScheduledNotices({now:Date.parse(r.scheduledAt),push:mockPush});assert.equal(result.sent,1);
  assert.equal(rows()[0].status,'sent');assert.equal(notices().length,1);assert.equal(notices()[0].scheduledId,r.scheduleId);assert.equal(notices()[0].claimId,undefined);
  for(const id of ['worker1','worker2'])assert.equal((await ok(id,'notificationData')).pendingNotifications.length,1);
  assert.equal((await processScheduledNotices({now:Date.parse(r.scheduledAt)+60000,push:mockPush})).processed,0);
});

test('scheduled creation retries are idempotent; edit and cancel check ownership, privilege, versions and delivery boundary',async()=>{
  await seed();await config(c=>{c.users.find(u=>u.id==='dispatch').permissions.notificationsSendOperational=true});
  const input=payload({scheduledAt:future(),requestId:'same'});
  const both=await Promise.all([ok('dispatch','sendOperationalNotification',input),ok('dispatch','sendOperationalNotification',input)]);
  assert.equal(both[0].scheduleId,both[1].scheduleId);assert.equal(rows().length,1);
  const row=rows()[0];assert.equal((await call('worker1','notificationScheduleEdit',{...input,scheduleId:row.id,version:1})).status,403);
  const edit=await ok('dispatch','notificationScheduleEdit',{...payload({title:'Upraveno',scheduledAt:future(120),recipientUserIds:['worker2']}),scheduleId:row.id,version:1,channel:'admin'});
  assert.equal(edit.version,2);assert.equal(rows()[0].channel,'operational');assert.deepEqual(rows()[0].recipientUserIds,['worker2']);
  assert.equal((await call('dispatch','notificationScheduleCancel',{scheduleId:row.id,version:1})).status,409);
  await ok('admin','notificationScheduleCancel',{scheduleId:row.id,version:2});assert.equal(rows()[0].status,'cancelled');
  assert.equal((await call('admin','notificationScheduleEdit',{...input,scheduleId:row.id,version:3})).status,409);
  assert.equal((await processScheduledNotices({now:Date.parse(edit.scheduledAt)+1,push:mockPush})).processed,0);assert.equal(notices().length,0);
});

test('simultaneous cron runs acquire one claim and retain concurrent inbox and acknowledgement writes',async()=>{
  await seed();const r=await schedule();let pushes=0;
  const push=async ids=>{pushes++;await new Promise(resolve=>setTimeout(resolve,20));return mockPush(ids)};
  const both=await Promise.all([processScheduledNotices({now:Date.parse(r.scheduledAt),push}),processScheduledNotices({now:Date.parse(r.scheduledAt),push}),ok('admin','sendOperationalNotification',payload({title:'Jiná zpráva'}))]);
  assert.equal(pushes,1);assert.equal(both[0].sent+both[1].sent,1);assert.equal(notices().length,2);assert.equal(rows()[0].status,'sent');
  const id=notices().find(n=>n.scheduledId).id;await ok('worker1','notificationSeen',{notificationId:id});assert.equal(notices().find(n=>n.id===id).seen.length,1);
  assert.equal(read('audit.json').filter(a=>a.action==='notification_schedule_sent').length,1);
});

test('expired leases recover storage/push interruptions with the same inbox ID and do not repeat finished pushes',async()=>{
  await seed();const r=await schedule();let attempts=0;
  const push=async ids=>{attempts++;if(attempts===1)throw new Error('isolated transient failure');return mockPush(ids)};
  const now=Date.parse(r.scheduledAt);await processScheduledNotices({now,push});assert.equal(rows()[0].status,'processing');assert.equal(notices().length,1);
  assert.equal((await processScheduledNotices({now:now+1000,push})).processed,0);
  await processScheduledNotices({now:now+300001,push});assert.equal(rows()[0].status,'sent');assert.equal(notices().length,1);assert.equal(attempts,2);
  const stored=rows();stored[0].status='processing';stored[0].leaseUntil=new Date(now).toISOString();await put(SCHEDULE_PATH,JSON.stringify(stored),{allowOverwrite:true});
  await processScheduledNotices({now:now+600001,push});assert.equal(notices().length,1);assert.equal(attempts,2);
});

test('selected recipients and all recipients are re-evaluated at delivery, with opt-outs and active/receive rights respected',async()=>{
  await seed();const r=await schedule();await config(c=>{c.users.find(u=>u.id==='worker1').notificationPrefs={operational:false}});
  await processScheduledNotices({now:Date.parse(r.scheduledAt),push:mockPush});assert.deepEqual(notices()[0].recipientUserIds,['worker2']);assert.equal(rows()[0].recipientCount,1);
  await seed();const all=await schedule({recipient:'all'});await config(c=>{c.users.find(u=>u.id==='worker1').permissions.notificationsReceive=false;c.users.find(u=>u.id==='worker2').active=false;c.users.push({id:'new',name:'Test New',role:'driver',active:true});c.users.push({id:'tester',name:'Test Tester',role:'test',active:true})});
  await processScheduledNotices({now:Date.parse(all.scheduledAt),push:mockPush});assert.deepEqual(notices()[0].recipientUserIds,['admin','dispatch','new']);
  await seed();const important=await schedule({severity:'important'});await config(c=>{for(const u of c.users.filter(u=>u.id.startsWith('worker'))){u.notificationPrefs={operational:false};if(u.id==='worker2')u.permissions.notificationsReceive=false}});
  await processScheduledNotices({now:Date.parse(important.scheduledAt),push:mockPush});assert.deepEqual(notices()[0].recipientUserIds,['worker1']);
});

test('revoked sender, expired message and no eligible recipients become visible failures without delivery',async()=>{
  for(const reason of ['sender','expiry','recipients']){
    await seed();await config(c=>{c.users.find(u=>u.id==='dispatch').permissions.notificationsSendOperational=true});
    const r=await schedule({expiresAt:future(120)},'dispatch');
    if(reason==='sender')await config(c=>{c.users.find(u=>u.id==='dispatch').permissions.notificationsSendOperational=false});
    if(reason==='recipients')await config(c=>{for(const u of c.users.filter(u=>u.id.startsWith('worker')))u.permissions.notificationsReceive=false});
    const result=await processScheduledNotices({now:Date.parse(r.scheduledAt)+(reason==='expiry'?3600001:0),push:mockPush});
    assert.equal(result.failed,1);assert.equal(rows()[0].status,'failed');assert.ok(rows()[0].error);assert.equal(notices().length,0);
    assert.equal((await ok('admin','notificationData')).notificationSchedules[0].status,'failed');
  }
});

test('maintenance/offline pauses the server queue; it resumes safely and refuses editing a due or processing item',async()=>{
  await seed();const r=await schedule(),now=Date.parse(r.scheduledAt);
  await config(c=>{c.modules={notifications:{online:false}}});assert.equal((await processScheduledNotices({now,push:mockPush})).skipped,'paused');assert.equal(rows()[0].status,'scheduled');
  await config(c=>{c.modules.notifications.online=true;c.system.mode='maintenance'});assert.equal((await processScheduledNotices({now,push:mockPush})).skipped,'paused');
  await config(c=>{c.system.mode='normal'});await processScheduledNotices({now,push:mockPush});assert.equal(rows()[0].status,'sent');
  assert.equal((await call('admin','notificationScheduleCancel',{scheduleId:r.scheduleId,version:rows()[0].version})).status,409);
});

test('cron endpoint requires GET and configured secret, works with no browser or VAPID, and exports include schedules',async()=>{
  await seed();const invoke=async(method,auth)=>{let status,raw;await cron({method,headers:{authorization:auth}},{setHeader(){},status(s){status=s;return this},end(b){raw=b}});return {status,body:JSON.parse(raw)}};
  process.env.CRON_SECRET='isolated-cron-secret';assert.equal((await invoke('POST','Bearer isolated-cron-secret')).status,405);assert.equal((await invoke('GET','Bearer bad')).status,401);
  const r=await schedule();const stored=rows();stored[0].scheduledAt=new Date(Date.now()-1000).toISOString();await put(SCHEDULE_PATH,JSON.stringify(stored),{allowOverwrite:true});
  const result=await invoke('GET','Bearer isolated-cron-secret');assert.equal(result.status,200);assert.equal(result.body.sent,1);assert.equal(rows()[0].status,'sent');assert.equal(notices()[0].reason,'PUSH_NOT_CONFIGURED');
  const backup=await ok('admin','adminBackup');assert.equal(backup.version,10);assert.equal(backup.notificationSchedules[0].id,r.scheduleId);
  delete process.env.CRON_SECRET;assert.equal((await invoke('GET','Bearer isolated-cron-secret')).status,401);
});

test('two editors cannot overwrite each other; an admin can take responsibility for another sender schedule',async()=>{
  await seed();await config(c=>{c.users.find(u=>u.id==='dispatch').permissions.notificationsSendOperational=true});const r=await schedule({},'dispatch');
  const edits=await Promise.all(['dispatch','admin'].map(user=>call(user,'notificationScheduleEdit',{...payload({title:user,scheduledAt:future(120)}),scheduleId:r.scheduleId,version:1})));
  assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);assert.equal(rows()[0].version,2);
  await ok('admin','notificationScheduleEdit',{...payload({title:'Admin přebírá odeslání',scheduledAt:future(180)}),scheduleId:r.scheduleId,version:2});assert.equal(rows()[0].byUserId,'admin');
  await config(c=>{c.users.find(u=>u.id==='dispatch').permissions.notificationsSendOperational=false});await processScheduledNotices({now:Date.parse(rows()[0].scheduledAt),push:mockPush});assert.equal(rows()[0].status,'sent');assert.equal(notices()[0].byUserId,'admin');
});

test('a full queue rejects new plans instead of silently dropping pending notices',async()=>{
  await seed();await schedule();const first=rows()[0],full=Array.from({length:500},(_,i)=>({...first,id:'test-pending-'+i,requestId:'unique-'+i}));await put(SCHEDULE_PATH,JSON.stringify(full),{allowOverwrite:true});
  assert.equal((await call('admin','sendOperationalNotification',payload({scheduledAt:future(120),requestId:'new-plan'}))).status,409);assert.equal(rows().length,500);assert.deepEqual(rows().map(r=>r.id),full.map(r=>r.id));
});
