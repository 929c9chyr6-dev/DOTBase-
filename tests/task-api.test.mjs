import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,call,ok,create,start,record,read,put,today,tomorrow} from './task-fixture.mjs';
import {taskGroups} from '../lib/task-workflow.js';
import {get,head,BlobPreconditionFailedError} from './blob-mock.mjs';
import {mutateBlobJsonArray} from '../lib/blob-json.js';

async function accept(user,tasks){await ok(user,'tireTaskAccept',{taskId:tasks[0].id})}
async function finishFirstThree(tasks){for(const t of tasks.slice(0,-1)){await start('worker1',t.id);await record('worker1',t);await ok('worker1','tireTaskCompleteVehicle',{taskId:t.id})}}

test('acceptance notices follow explicit rights for admin, dispatch and workers, including revoked queued notices',async()=>{
  await seed();
  await ok('admin','adminUpdateUser',{userId:'worker2',taskNotifications:{accepted:true}});
  await ok('admin','adminUpdateUser',{userId:'admin',taskNotifications:{accepted:false}});
  const tasks=await create();await ok('worker1','taskData');assert.equal(read('tiretasks.json').some(t=>t.acceptedAt),false);
  await accept('worker1',tasks);
  const notice=read('notifications.json').find(n=>n.type==='task_accepted');assert.deepEqual(notice.recipientUserIds,['worker2']);
  for(const id of ['admin','dispatch','worker1']){
    const state=await ok(id,'state'),inbox=await ok(id,'notificationData');
    assert.equal(state.toastNotifications.some(n=>n.id===notice.id),false,id);
    assert.equal(inbox.notificationInbox.some(n=>n.id===notice.id),false,id);
  }
  assert.equal((await ok('worker2','state')).toastNotifications.some(n=>n.id===notice.id),true);
  await ok('admin','adminUpdateUser',{userId:'worker2',taskNotifications:{accepted:false}});
  const state=await ok('worker2','state'),inbox=await ok('worker2','notificationData');
  assert.equal(state.toastNotifications.some(n=>n.id===notice.id),false);
  assert.equal(state.notificationUnreadCount,0);assert.equal(inbox.notificationInbox.some(n=>n.id===notice.id),false);
  assert.equal((await call('worker2','notificationSeen',{notificationId:notice.id})).status,403);
});

test('a shared push device belongs only to the current profile; repeated binding does not write again',async()=>{
  await seed();const subscription={endpoint:'https://push.test.invalid/shared',keys:{auth:'test',p256dh:'test'}};
  await ok('admin','pushSubscribe',{subscription});await ok('worker1','pushBindDevice',{subscription});
  assert.equal(read('push.json').length,1);assert.equal(read('push.json')[0].userId,'worker1');
  const version=read('sync-version.json').version;
  await ok('worker1','pushBindDevice',{subscription});assert.equal(read('sync-version.json').version,version);
  await Promise.all(['worker1','worker2'].map(user=>ok(user,'pushBindDevice',{subscription:{...subscription,endpoint:'https://push.test.invalid/'+user}})));
  assert.equal(read('push.json').length,3);
  const cfg=read('config.json');cfg.system.mode='read_only';cfg.modules={settings:{visible:false,online:false}};await put('config.json',JSON.stringify(cfg),{allowOverwrite:true});
  await ok('worker2','pushBindDevice',{subscription});assert.equal(read('push.json').find(p=>p.subscription.endpoint===subscription.endpoint).userId,'worker2');
});

test('disabling general notifications stops TASK notices and detaches the preceding device owner, while work remains assigned',async()=>{
  await seed();const subscription={endpoint:'https://push.test.invalid/disabled'};
  await ok('admin','pushSubscribe',{subscription});await ok('admin','adminUpdateUser',{userId:'worker1',permissions:{notificationsReceive:false}});
  const tasks=await create();assert.equal(tasks.length,4);assert.ok(tasks.every(t=>t.assignedToUserId==='worker1'));
  assert.equal(read('notifications.json')?.some(n=>n.type==='task_assignment'&&n.recipientUserIds.includes('worker1'))||false,false);
  assert.equal((await ok('worker1','pushBindDevice',{subscription})).notificationsEnabled,false);
  assert.deepEqual(read('push.json'),[]);
  assert.equal((await call('worker1','pushSubscribe',{subscription})).status,403);
});

test('creating a TASK uses the storage ETag despite weak download ETags and preserves existing history',async()=>{
  await seed();
  const legacy={id:'old-task',carId:'car9',status:'closed',date:'2026-01-01',instructions:'Existing archived work'};
  await put('tiretasks.json',JSON.stringify([legacy]),{allowOverwrite:true});
  const metadata=await head('tiretasks.json'),download=await get('tiretasks.json');
  assert.equal(download.blob.etag,'W/'+metadata.etag);
  await assert.rejects(put('tiretasks.json','[]',{allowOverwrite:true,ifMatch:download.blob.etag}),BlobPreconditionFailedError);
  const tasks=await create();
  assert.equal(tasks.length,4);assert.equal(read('tiretasks.json').length,5);
  assert.deepEqual(read('tiretasks.json').find(t=>t.id===legacy.id),legacy);
  assert.equal(read('notifications.json').filter(n=>n.type==='task_assignment').length,1);
});

test('an overwrite between metadata and write retries against fresh state without losing the other update',async()=>{
  await seed();let attempts=0;
  await mutateBlobJsonArray('tiretasks.json',async rows=>{
    attempts++;
    if(attempts===1)await put('tiretasks.json',JSON.stringify([{id:'other-update'}]),{allowOverwrite:true});
    return {rows:[...rows,{id:'my-update'}],changed:true};
  });
  assert.equal(attempts,2);
  assert.deepEqual(read('tiretasks.json').map(x=>x.id),['other-update','my-update']);
});

test('two simultaneous first writes retry the real already-exists error and keep both entries',async()=>{
  await seed();
  await Promise.all(['first','second'].map(id=>mutateBlobJsonArray('new-array.json',rows=>({rows:[...rows,{id}],changed:true}))));
  assert.deepEqual(read('new-array.json').map(x=>x.id).sort(),['first','second']);
});

test('one daily TASK: accept once, explicitly finish each car, finish last car and group together',async()=>{
  await seed();const tasks=await create();await accept('worker1',tasks);await accept('worker1',tasks);
  let notices=read('notifications.json');assert.equal(notices.filter(n=>n.type==='task_accepted').length,1);
  assert.deepEqual(notices.find(n=>n.type==='task_accepted').recipientUserIds,['admin']);
  await finishFirstThree(tasks);const last=tasks.at(-1);await start('worker1',last.id);await start('worker1',last.id);
  await record('worker1',last,{splitDot:true,dot:'',dotFront:'0126',dotRear:'5325',mileage:0});
  assert.equal(read('tiretasks.json').find(t=>t.id===last.id).status,'in_progress','saving DOT must not close a new vehicle automatically');
  await ok('worker1','tireTaskClose',{taskId:tasks[0].id});await ok('worker1','tireTaskClose',{taskId:tasks[0].id});
  const groups=taskGroups(read('tiretasks.json'));assert.equal(groups.length,1);assert.equal(groups[0].systemCompleted,true);assert.equal(groups[0].workClosed,true);assert.equal(groups[0].completedCount,4);
  notices=read('notifications.json');assert.equal(notices.filter(n=>n.type==='task_vehicleStarted').length,4);assert.equal(notices.filter(n=>n.type==='task_vehicleCompleted').length,4);assert.equal(notices.filter(n=>n.type==='task_taskCompleted').length,1);
  assert.deepEqual(notices.find(n=>n.type==='task_vehicleStarted').recipientUserIds,['admin','dispatch']);
  assert.deepEqual(notices.find(n=>n.type==='task_vehicleCompleted').recipientUserIds,['admin']);
  const mine=await ok('worker1','taskData');assert.equal(mine.tireTaskGroups[0].workClosed,true,'worker without global archive permission still sees own history');
});

test('overnight car becomes a separate solo TASK; completion finishes the original but preserves first worker closure',async()=>{
  await seed();const tasks=await create(),nextDay=await create('worker2',tomorrow(),['car5','car6','car7','car8']);await accept('worker1',tasks);await finishFirstThree(tasks);
  const last=tasks.at(-1);await start('worker1',last.id);await ok('worker1','tireTaskSaveDraft',{taskId:last.id,draft:{mileage:'123456',splitDot:true,dotFront:'12',dotRear:''}});
  const handed=await ok('worker1','tireTaskHandover',{taskId:last.id,staysAtService:true,handoverNote:'Klíče v servisu'});
  await ok('worker1','tireTaskHandover',{taskId:last.id,staysAtService:true});
  let rows=read('tiretasks.json'),solo=rows.find(t=>t.id===handed.continuationTaskId);assert.equal(rows.length,9);assert.equal(solo.kind,'carryover');assert.equal(solo.assignedToUserId,'worker2');assert.equal(solo.draft.mileage,'123456');assert.equal(solo.draft.dotFront,'12');assert.equal(solo.handoverNote,'Klíče v servisu');assert.equal(solo.sourceTaskId,last.id);
  const origin=taskGroups(rows).find(g=>g.id===tasks[0].batchId);assert.equal(origin.workClosed,true);assert.equal(origin.systemCompleted,false);assert.equal(origin.workClosedById,'worker1');
  let data=await ok('worker2','taskData');assert.equal(data.tireTaskGroups.filter(g=>g.assignedToUserId==='worker2'&&!g.workClosed).length,2);assert.equal(data.tireTaskGroups.find(g=>g.id===nextDay[0].batchId).vehicleCount,4);
  await accept('worker2',[solo]);await start('worker2',solo.id);await record('worker2',solo,{dot:'3226',mileage:0});await ok('worker2','tireTaskClose',{taskId:solo.id});
  rows=read('tiretasks.json');const finalOrigin=taskGroups(rows).find(g=>g.id===origin.id);assert.equal(finalOrigin.systemCompleted,true);assert.equal(finalOrigin.workClosedAt,origin.workClosedAt);assert.equal(finalOrigin.workClosedById,'worker1');assert.equal(finalOrigin.workClosureReason,'handover');
  const source=rows.find(t=>t.id===last.id);assert.equal(source.completedById,'worker2');assert.equal(source.completedDot,'3226');assert.equal(source.completedMileage,0);assert.equal(source.finishedByContinuationId,solo.id);
  assert.equal(taskGroups(rows).find(g=>g.id===nextDay[0].batchId).systemCompleted,false,'new daily TASK stays independent');
});

test('unknown next worker stays queued; a later unambiguous plan assigns a separate continuation',async()=>{
  await seed();const tasks=await create();await accept('worker1',tasks);await finishFirstThree(tasks);const last=tasks.at(-1);await start('worker1',last.id);
  const handover=await ok('worker1','tireTaskHandover',{taskId:last.id,staysAtService:true});assert.equal(handover.receiverId,null);
  const soloBefore=read('tiretasks.json').find(t=>t.id===handover.continuationTaskId);assert.equal(soloBefore.assignedToUserId,null);
  await create('worker2',tomorrow(),['car5','car6']);const solo=read('tiretasks.json').find(t=>t.id===soloBefore.id);assert.equal(solo.assignedToUserId,'worker2');assert.equal(taskGroups(read('tiretasks.json')).length,3);
});

test('ambiguous schedule does not select an arbitrary worker; dispatch can explicitly assign the solo',async()=>{
  await seed();await create('worker1',tomorrow(),['car5']);await create('worker2',tomorrow(),['car6']);const tasks=await create();await accept('worker1',tasks);await finishFirstThree(tasks);const last=tasks.at(-1);await start('worker1',last.id);
  const handover=await ok('worker1','tireTaskHandover',{taskId:last.id,staysAtService:true});assert.equal(handover.receiverId,null);
  await ok('dispatch','tireTaskUpdate',{taskId:handover.continuationTaskId,assignedToUserId:'worker2'});assert.equal(read('tiretasks.json').find(t=>t.id===handover.continuationTaskId).assignedToUserId,'worker2');
});

test('server enforces ownership, acceptance, start, valid record, and one remaining vehicle',async()=>{
  await seed();const tasks=await create(),last=tasks.at(-1);
  assert.equal((await call('worker2','tireTaskAccept',{taskId:tasks[0].id})).status,403);
  assert.equal((await call('worker1','tireTaskSetStatus',{taskId:tasks[0].id,status:'in_progress'})).body.error,'TIRETASK_NOT_ACCEPTED');
  await accept('worker1',tasks);
  assert.equal((await call('worker1','tireTaskClose',{taskId:tasks[0].id})).body.error,'TIRETASK_INCOMPLETE');
  assert.equal((await call('worker1','tireTaskHandover',{taskId:last.id,staysAtService:true})).body.error,'TIRETASK_INCOMPLETE');
  assert.equal((await call('worker2','tireTaskSetStatus',{taskId:tasks[0].id,status:'in_progress'})).status,403);
  await start('worker1',tasks[0].id);
  assert.equal((await call('worker1','tireTaskCompleteVehicle',{taskId:tasks[0].id})).body.error,'TIRETASK_NOT_COMPLETED');
  assert.equal((await call('worker1','addRecord',{carId:tasks[0].carId,season:'winter',dot:'0026',mileage:123,tireTaskId:tasks[0].id})).body.error,'DOT');
  assert.equal((await call('worker1','addRecord',{carId:last.carId,season:'winter',dot:'2426',mileage:123,tireTaskId:tasks[0].id})).status,409);
  assert.equal((await call('admin','tireTaskUpdate',{taskId:tasks[0].id,assignedToUserId:'worker2'})).body.error,'TIRETASK_STARTED');
});

test('creation and record retries are idempotent; dates and duplicate cars are validated',async()=>{
  await seed();const payload={date:today(),assignedToUserId:'worker1',requestId:'retry-plan',entries:[{carId:'car1',category:'VIP',targetSeason:'winter'}]};
  await ok('admin','tireTaskCreateBatch',payload);await ok('admin','tireTaskCreateBatch',payload);assert.equal(read('tiretasks.json').length,1);
  assert.equal((await call('admin','tireTaskCreateBatch',{...payload,requestId:'wrong-date',date:'2026-02-30'})).body.error,'TIRETASK_DATE');
  assert.equal((await call('admin','tireTaskCreateBatch',{...payload,requestId:'duplicate',entries:[payload.entries[0],payload.entries[0]]})).body.error,'TIRETASK_DUPLICATE_CAR');
  const t=read('tiretasks.json')[0];await accept('worker1',[t]);await start('worker1',t.id);await record('worker1',t,{requestId:'retry-record'});await record('worker1',t,{requestId:'retry-record'});
  const recs=read('records-index.json').rows;assert.equal(recs.length,1);
});

test('simultaneous vehicle changes retain both starts and both drafts',async()=>{
  await seed();const tasks=await create();await accept('worker1',tasks);
  await Promise.all([start('worker1',tasks[0].id),start('worker1',tasks[1].id)]);
  await Promise.all(tasks.slice(0,2).map((t,i)=>ok('worker1','tireTaskSaveDraft',{taskId:t.id,draft:{dot:'2'+i,mileage:String(100+i)}})));
  const rows=read('tiretasks.json');assert.equal(rows.filter(t=>t.startedAt).length,2);assert.equal(rows.find(t=>t.id===tasks[0].id).draft.mileage,'100');assert.equal(rows.find(t=>t.id===tasks[1].id).draft.mileage,'101');
  assert.equal(read('notifications.json').filter(n=>n.type==='task_vehicleStarted').length,2,'concurrent starts retain both notifications');
});

test('late autosave cannot overwrite newer draft, and marking a notification seen retains a concurrent new event',async()=>{
  await seed();const tasks=await create();await accept('worker1',tasks);await start('worker1',tasks[0].id);
  await ok('worker1','tireTaskSaveDraft',{taskId:tasks[0].id,draftClientId:'device-1',draftSequence:2,draft:{dot:'2426',mileage:'200'}});
  await ok('worker1','tireTaskSaveDraft',{taskId:tasks[0].id,draftClientId:'device-1',draftSequence:1,draft:{dot:'12',mileage:'100'}});
  assert.equal(read('tiretasks.json')[0].draft.mileage,'200');const accepted=read('notifications.json').find(n=>n.type==='task_accepted');
  await Promise.all([ok('admin','notificationSeen',{notificationId:accepted.id}),start('worker1',tasks[1].id)]);
  const notices=read('notifications.json');assert.equal(notices.filter(n=>n.type==='task_vehicleStarted').length,2);assert.equal(notices.find(n=>n.id===accepted.id).seen[0].userId,'admin');
});

test('a second overnight handover retains the chain and completes every origin',async()=>{
  await seed();const first=await create('worker1',today(),['car1']);await accept('worker1',first);await start('worker1',first[0].id);
  const h1=await ok('worker1','tireTaskHandover',{taskId:first[0].id,staysAtService:true,receiverId:'worker2'}),middle=read('tiretasks.json').find(t=>t.id===h1.continuationTaskId);
  await accept('worker2',[middle]);await start('worker2',middle.id);const h2=await ok('worker2','tireTaskHandover',{taskId:middle.id,staysAtService:true,receiverId:'worker1'}),last=read('tiretasks.json').find(t=>t.id===h2.continuationTaskId);
  await accept('worker1',[last]);await start('worker1',last.id);await record('worker1',last);await ok('worker1','tireTaskClose',{taskId:last.id});
  assert.equal(taskGroups(read('tiretasks.json')).every(g=>g.systemCompleted),true);assert.equal(read('tiretasks.json').find(t=>t.id===middle.id).workClosedById,'worker2');
});

test('existing closed legacy batches remain readable without rewriting storage',async()=>{
  await seed();const tasks=await create();const rows=tasks.map((t,i)=>({...t,workflowVersion:undefined,status:'closed',closedAt:new Date(Date.now()+i).toISOString(),closedBy:'Legacy pracovník'}));await put('tiretasks.json',JSON.stringify(rows),{allowOverwrite:true});
  const before=JSON.stringify(read('tiretasks.json')),data=await ok('admin','taskData');assert.equal(data.tireTaskGroups.length,1);assert.equal(data.tireTaskGroups[0].systemCompleted,true);assert.equal(data.tireTaskGroups[0].vehicleCount,4);assert.equal(JSON.stringify(read('tiretasks.json')),before);
});

test('deleting the original worker preserves handover history and the next worker can finish it',async()=>{
  await seed();const tasks=await create('worker1',today(),['car1']);await accept('worker1',tasks);await start('worker1',tasks[0].id);
  const h=await ok('worker1','tireTaskHandover',{taskId:tasks[0].id,staysAtService:true,receiverId:'worker2'}),before=read('tiretasks.json').find(t=>t.id===tasks[0].id);
  await ok('admin','adminDeleteUser',{userId:'worker1'});const after=read('tiretasks.json').find(t=>t.id===tasks[0].id);assert.equal(after.assignedToUserId,before.assignedToUserId);assert.equal(after.workClosedAt,before.workClosedAt);
  const solo=read('tiretasks.json').find(t=>t.id===h.continuationTaskId);await accept('worker2',[solo]);await start('worker2',solo.id);await record('worker2',solo);await ok('worker2','tireTaskClose',{taskId:solo.id});assert.equal(taskGroups(read('tiretasks.json')).every(g=>g.systemCompleted),true);
});

test('deleting an active worker releases the whole daily TASK, including finished rows, for reassignment',async()=>{
  await seed();const tasks=await create();await accept('worker1',tasks);await start('worker1',tasks[0].id);await record('worker1',tasks[0]);await ok('worker1','tireTaskCompleteVehicle',{taskId:tasks[0].id});await start('worker1',tasks[1].id);
  const deletion=await ok('admin','adminDeleteUser',{userId:'worker1'});assert.equal(deletion.releasedTasks,1);assert.equal(read('tiretasks.json').every(t=>!t.assignedToUserId),true);
  await ok('admin','tireTaskUpdate',{taskId:tasks[0].id,assignedToUserId:'worker2'});await accept('worker2',tasks);await start('worker2',tasks[1].id);assert.equal(read('tiretasks.json').find(t=>t.id===tasks[0].id).completedById,'worker1');assert.equal(read('tiretasks.json').every(t=>t.assignedToUserId==='worker2'),true);
});
