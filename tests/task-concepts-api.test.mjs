import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,call,ok,create,start,record,read,put,today,tomorrow} from './task-fixture.mjs';

const concepts=()=>read('task-concepts.json')||[];
const notices=()=>read('notifications.json')||[];
const entries=(ids=['car1','car2','car3','car4'])=>ids.map((carId,i)=>({carId,category:carId==='car1'?'VIP':'POOL',time:i?'':'08:30',dotOrder:i%2?['winter','summer']:['summer','winter'],instructions:'Klíče '+(i+1)}));
const plan=(extra={})=>({date:today(),assignedToUserId:'worker1',entries:entries(),instructions:'Plán přezutí',...extra});
async function save(payload=plan(),user='admin'){return ok(user,'tireTaskConceptSave',{requestId:crypto.randomUUID(),...payload})}
const publish=(row,payload={},user='admin')=>ok(user,'tireTaskConceptPublish',{conceptId:row.conceptId||row.id,version:row.version,...payload});
async function config(change){const c=read('config.json');change(c);await put('config.json',JSON.stringify(c),{allowOverwrite:true})}

test('a partial concept persists without date, worker or cars and never becomes work, DOT evidence or a notification',async()=>{
  await seed();const r=await save({date:'',assignedToUserId:'',entries:[{carId:'',category:'',search:'TEST',dotOrder:['winter','summer']}],instructions:'Doplnit plán'});
  const data=await ok('admin','taskData');assert.equal(data.tireTaskConcepts.length,1);assert.equal(data.tireTaskConcepts[0].date,'');assert.equal(data.tireTaskConcepts[0].entries[0].search,'TEST');
  assert.equal(data.tireTaskGroups.length,0);assert.equal(data.tireTasks.length,0);assert.equal(notices().length,0);
  for(const user of ['worker1','worker2']){
    assert.equal((await ok(user,'taskData')).tireTaskConcepts.length,0);
    assert.equal((await ok(user,'pneuData')).pneuTasks.length,0);
    const s=await ok(user,'state');assert.equal(s.myTaskCount,0);assert.equal(s.notificationUnreadCount,0);assert.equal(s.toastNotifications.length,0);
  }
  const backup=await ok('admin','adminBackup');assert.equal(backup.version,10);assert.equal(backup.tireTaskConcepts[0].id,r.conceptId);assert.deepEqual(backup.tireTasks,[]);
});

test('saving an assigned concept creates no work or assignment notice; malformed input changes nothing',async()=>{
  await seed();await save();assert.equal((await ok('worker1','taskData')).tireTaskGroups.length,0);assert.equal(notices().length,0);
  for(const invalid of [{date:'2027-02-30'},{assignedToUserId:'missing'},{entries:[]},{entries:Array.from({length:21},()=>({}))},{entries:[{carId:'missing'}]},{entries:[{time:'25:00'}]},{entries:[{dotOrder:['winter','winter']}]},{entries:entries(['car1','car1'])}]){
    assert.equal((await call('admin','tireTaskConceptSave',{...plan(invalid),requestId:crypto.randomUUID()})).status,400);
  }
  assert.equal(concepts().length,1);assert.equal(read('tiretasks.json').length,0);
});

test('concurrent saves are idempotent; concurrent edits require the original version and retain the winning data',async()=>{
  await seed();const input=plan({requestId:'one-concept'}),both=await Promise.all([ok('admin','tireTaskConceptSave',input),ok('admin','tireTaskConceptSave',input)]);
  assert.equal(both[0].conceptId,both[1].conceptId);assert.equal(concepts().length,1);
  const r=both[0],responses=await Promise.all([call('admin','tireTaskConceptSave',{...plan({instructions:'Admin'}),conceptId:r.conceptId,version:r.version}),call('dispatch','tireTaskConceptSave',{...plan({instructions:'Dispatch'}),conceptId:r.conceptId,version:r.version})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(concepts()[0].version,2);assert.ok(['Admin','Dispatch'].includes(concepts()[0].instructions));
  assert.equal((await call('admin','tireTaskConceptSave',{...input,instructions:'Different request'})).status,409);
});

test('create, edit, publish and delete rights are independent and are checked again after revocation',async()=>{
  await seed();const admin=await save();assert.equal((await call('worker1','tireTaskConceptSave',plan())).status,403);
  await ok('admin','adminUpdateUser',{userId:'worker2',permissions:{tireTaskCreate:true,tireTaskEdit:false,tireTaskDelete:false}});
  const own=await save(plan(),'worker2'),data=await ok('worker2','taskData');assert.equal(data.tireTaskConcepts.find(c=>c.id===own.conceptId).canEdit,true);assert.equal(data.tireTaskConcepts.find(c=>c.id===admin.conceptId).canEdit,false);
  assert.equal((await call('worker2','tireTaskConceptSave',{...plan(),conceptId:admin.conceptId,version:1})).status,403);
  assert.equal((await call('worker2','tireTaskConceptPublish',{conceptId:admin.conceptId,version:1})).status,403);
  assert.equal((await call('dispatch','tireTaskConceptDelete',{conceptId:own.conceptId,version:1})).status,403);
  await ok('admin','adminUpdateUser',{userId:'worker2',permissions:{tireTaskCreate:false,tireTaskEdit:true}});
  const edited=await ok('worker2','tireTaskConceptSave',{...plan({instructions:'Editor'}),conceptId:admin.conceptId,version:1});assert.equal(edited.version,2);
  assert.equal((await call('worker2','tireTaskConceptPublish',{conceptId:admin.conceptId,version:2})).status,403);
  await ok('admin','adminUpdateUser',{userId:'worker2',permissions:{tireTaskEdit:false,tireTaskDelete:true}});
  const deleteOnly=(await ok('worker2','taskData')).tireTaskConcepts.find(c=>c.id===admin.conceptId);assert.equal(deleteOnly.canDelete,true);assert.equal(deleteOnly.canEdit,false);assert.equal(deleteOnly.canPublish,false);
  await ok('worker2','tireTaskConceptDelete',{conceptId:admin.conceptId,version:2});assert.equal(concepts().find(c=>c.id===admin.conceptId).status,'deleted');
  await ok('admin','adminUpdateUser',{userId:'worker2',permissions:{tireTaskDelete:false}});assert.equal((await call('worker2','tireTaskConceptDelete',{conceptId:own.conceptId,version:1})).status,403);
});

test('publishing needs a complete plan, valid groups and active cars/worker; errors retain an editable concept',async()=>{
  await seed();const r=await save({date:'',entries:[{}]});
  for(const p of [{},{date:today()},{date:today(),assignedToUserId:'worker1'},{...plan(),entries:entries().map(e=>({...e,category:''}))},{...plan(),entries:entries().map(e=>({...e,category:'missing'}))}]){
    assert.equal((await call('admin','tireTaskConceptPublish',{conceptId:r.conceptId,version:1,...p})).status,400);
    assert.equal(concepts()[0].status,'draft');assert.equal(concepts()[0].version,1);
  }
  await config(c=>{c.users.find(u=>u.id==='worker1').active=false});assert.equal((await call('admin','tireTaskConceptPublish',{conceptId:r.conceptId,version:1,...plan()})).status,400);
  await config(c=>{c.users.find(u=>u.id==='worker1').active=true;c.cars[0].active=false});assert.equal((await call('admin','tireTaskConceptPublish',{conceptId:r.conceptId,version:1,...plan()})).status,400);
  assert.equal(read('tiretasks.json').length,0);assert.equal(notices().length,0);
});

test('concurrent publication by admin and dispatch creates one four-car TASK with one assignment; retries after deletion cannot recreate it',async()=>{
  await seed();const r=await save(),both=await Promise.all([publish(r),publish(r,{},'dispatch'),publish(r)]);
  assert.equal(new Set(both.map(p=>p.batchId)).size,1);const tasks=read('tiretasks.json');assert.equal(tasks.length,4);assert.equal(new Set(tasks.map(t=>t.batchId)).size,1);
  assert.deepEqual(tasks.map(t=>t.dotOrder),entries().map(t=>t.dotOrder));assert.equal(tasks.every(t=>t.workflowVersion===3&&!t.acceptedAt&&t.createdFromConceptId===r.conceptId),true);
  assert.equal(notices().filter(n=>n.type==='task_assignment').length,1);assert.deepEqual(notices()[0].recipientUserIds,['worker1']);assert.equal((await ok('worker1','taskData')).tireTaskGroups[0].vehicleCount,4);
  assert.equal((await ok('admin','taskData')).tireTaskConcepts.length,0);assert.equal(concepts()[0].status,'published');
  await ok('admin','tireTaskDelete',{batchId:both[0].batchId});await publish(r);assert.equal(read('tiretasks.json').length,0);assert.equal(notices().length,1);
  assert.equal((await call('admin','tireTaskConceptSave',{...plan(),conceptId:r.conceptId,version:r.version})).status,409);
});

test('edits can be submitted and published in one action; stale publication and deletion cannot discard newer edits',async()=>{
  await seed();const r=await save(),edit=await ok('dispatch','tireTaskConceptSave',{...plan({instructions:'Nové instrukce'}),conceptId:r.conceptId,version:1});
  for(const action of ['tireTaskConceptDelete','tireTaskConceptPublish'])assert.equal((await call('admin',action,{conceptId:r.conceptId,version:1})).status,409);
  await publish({...r,version:edit.version},plan({date:tomorrow(),assignedToUserId:'worker2',entries:entries(['car5']),instructions:'Poslední úprava'}));
  const [t]=read('tiretasks.json');assert.equal(t.date,tomorrow());assert.equal(t.assignedToUserId,'worker2');assert.equal(t.carId,'car5');assert.equal(t.batchInstructions,'Poslední úprava');assert.deepEqual(notices()[0].recipientUserIds,['worker2']);
});

test('reassignment of a published concept TASK still notifies each new assignment, including a return to the original worker',async()=>{
  await seed();const r=await save(),p=await publish(r);await ok('admin','tireTaskUpdate',{batchId:p.batchId,assignedToUserId:'worker2'});await ok('admin','tireTaskUpdate',{batchId:p.batchId,assignedToUserId:'worker1'});
  const assigned=notices().filter(n=>n.type==='task_assignment');assert.equal(assigned.length,3);assert.deepEqual(assigned.map(n=>n.recipientUserIds[0]),['worker1','worker2','worker1']);
  await publish(r);assert.equal(notices().length,3);
});

test('an interrupted publication freezes its payload, can resume, and does not lose an assignment notice',async()=>{
  await seed();const r=await save(),rows=concepts();rows[0].status='publishing';rows[0].version=2;await put('task-concepts.json',JSON.stringify(rows),{allowOverwrite:true});
  assert.equal((await call('admin','tireTaskConceptSave',{...plan(),conceptId:r.conceptId,version:2})).status,409);
  assert.equal((await call('admin','tireTaskConceptDelete',{conceptId:r.conceptId,version:2})).status,409);
  await publish(r,plan({assignedToUserId:'worker2',entries:entries(['car5'])}));assert.equal(read('tiretasks.json').length,4);assert.equal(read('tiretasks.json')[0].assignedToUserId,'worker1');assert.equal(notices().length,1);
  // Simulate TASK storage succeeding before the concept marker/notice step.
  await seed();const next=await save(),tasks=await create();for(const t of tasks)t.createdFromConceptId=next.conceptId;await put('tiretasks.json',JSON.stringify(tasks),{allowOverwrite:true});await put('notifications.json','[]',{allowOverwrite:true});
  const pending=concepts();pending[0].status='publishing';pending[0].version=2;await put('task-concepts.json',JSON.stringify(pending),{allowOverwrite:true});
  assert.equal((await ok('admin','taskData')).tireTaskConcepts.length,0);
  await publish(next);assert.equal(read('tiretasks.json').length,4);assert.equal(concepts()[0].status,'published');assert.equal(notices().length,1);await publish(next);assert.equal(notices().length,1);
});

test('delete finalizes an interrupted concept before deleting its TASK, preventing a pending concept from returning',async()=>{
  await seed();const r=await save(),tasks=await create();for(const t of tasks)t.createdFromConceptId=r.conceptId;await put('tiretasks.json',JSON.stringify(tasks),{allowOverwrite:true});
  const pending=concepts();pending[0].status='publishing';pending[0].version=2;await put('task-concepts.json',JSON.stringify(pending),{allowOverwrite:true});
  await ok('admin','tireTaskDelete',{batchId:tasks[0].batchId});assert.equal(concepts()[0].status,'published');assert.equal((await ok('admin','taskData')).tireTaskConcepts.length,0);await publish(r);assert.equal(read('tiretasks.json').length,0);
});

test('saving concepts never assigns overnight work; sending preserves separate carryover workflow and both DOT records',async()=>{
  await seed();const [origin]=await create('worker1',today(),['car9']);await ok('worker1','tireTaskAccept',{taskId:origin.id});await start('worker1',origin.id);await ok('worker1','tireTaskHandover',{taskId:origin.id,receiverId:'',staysAtService:true});
  const solo=read('tiretasks.json').find(t=>t.kind==='carryover'),r=await save(plan({date:tomorrow(),assignedToUserId:'worker2'}));assert.equal(read('tiretasks.json').find(t=>t.id===solo.id).assignedToUserId,null);
  await publish(r);const work=read('tiretasks.json'),daily=work.filter(t=>t.createdFromConceptId===r.conceptId);assert.equal(daily.length,4);assert.equal(work.find(t=>t.id===solo.id).assignedToUserId,'worker2');assert.equal((await ok('worker2','taskData')).tireTaskGroups.filter(g=>g.assignedToUserId==='worker2').length,2);
  const t=daily[0];await ok('worker2','tireTaskAccept',{taskId:t.id});await start('worker2',t.id);await record('worker2',t,{season:'summer'});await record('worker2',t,{season:'winter'});await ok('worker2','tireTaskCompleteVehicle',{taskId:t.id});assert.equal(read('tiretasks.json').find(row=>row.id===t.id).status,'completed');
});

test('publication lineage does not leak into subsequent solo TASKs and saved concepts leave existing records untouched',async()=>{
  await seed();const r=await save(plan({entries:entries(['car1'])}));await publish(r);const [t]=read('tiretasks.json');await ok('worker1','tireTaskAccept',{taskId:t.id});await start('worker1',t.id);await record('worker1',t,{season:'summer'});
  const records=JSON.stringify(read('records-index.json'));await save(plan({entries:[{}]}));assert.equal(JSON.stringify(read('records-index.json')),records);
  await ok('worker1','tireTaskHandover',{taskId:t.id,receiverId:'',staysAtService:true});assert.equal(read('tiretasks.json').find(row=>row.kind==='carryover').createdFromConceptId,undefined);
});

test('read-only and offline controls apply to all concept actions before any write',async()=>{
  await seed();const r=await save(plan(),'dispatch');await config(c=>{c.system.mode='read_only'});
  const before=JSON.stringify(concepts());for(const action of ['tireTaskConceptSave','tireTaskConceptPublish','tireTaskConceptDelete'])assert.equal((await call('dispatch',action,{...plan(),conceptId:r.conceptId,version:1})).status,423);
  assert.equal(JSON.stringify(concepts()),before);await config(c=>{c.system.mode='normal';c.modules={tiretask:{online:false}}});assert.equal((await call('dispatch','tireTaskConceptSave',plan())).status,423);assert.equal(JSON.stringify(concepts()),before);
});
