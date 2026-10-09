// Daily TASKs keep their vehicle rows in the existing store. Closed work and
// system completion are separate so an overnight handover never loses its origin.
export const TASK_ACTIONS = new Set(['tireTaskCreate','tireTaskCreateBatch','tireTaskUpdate','tireTaskAccept','tireTaskComment','tireTaskSetStatus','tireTaskCompleteVehicle','tireTaskClose','tireTaskHandover','tireTaskSaveDraft','tireTaskDelete']);
export const TASK_NOTICE_KEYS = ['accepted','vehicleStarted','vehicleCompleted','taskCompleted','handedOver'];
const done = t => ['completed','closed'].includes(t.status);
const text = (s,n=700) => String(s||'').trim().slice(0,n);

export class TaskError extends Error {
  constructor(code,message,status=409){super(message||code);this.code=code;this.status=status}
}
const fail = (code,message,status) => {throw new TaskError(code,message,status)};
export function taskGroupId(t){return t.batchId||t.id}
export function taskWorkClosed(t){return !!t.workClosedAt||['closed','handed_over','cancelled'].includes(t.status)}
export function taskIsActive(t){return !taskWorkClosed(t)}
export function taskDate(value){
  const s=String(value||'').trim(),d=new Date(s+'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:'';
}
export function nextTaskDate(date,today){
  const d=new Date((date>today?date:today)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
}
export function taskGroups(rows){
  const map=new Map();
  for(const t of rows||[]){const id=taskGroupId(t);if(!map.has(id))map.set(id,[]);map.get(id).push(t)}
  return [...map].map(([id,cars])=>{
    cars.sort((a,b)=>(a.batchIndex??0)-(b.batchIndex??0)||String(a.time||'23:59').localeCompare(String(b.time||'23:59')));
    const first=cars[0],closed=cars.every(taskWorkClosed),systemCompleted=cars.every(t=>t.status==='closed'),systemResolved=cars.every(t=>['closed','cancelled'].includes(t.status));
    const handedOver=cars.some(t=>t.handedOverAt||t.handoverTaskId||t.status==='handed_over'),remaining=cars.filter(t=>!done(t)&&!['handed_over','cancelled'].includes(t.status));
    const status=systemResolved?(systemCompleted?'closed':'cancelled'):closed&&handedOver?'waiting_handover':cars.some(t=>t.status==='problem')?'problem':cars.every(done)?'ready_to_close':cars.some(t=>t.startedAt)?'in_progress':'planned';
    return {id,date:first.date,time:first.time||'',assignedToUserId:first.assignedToUserId||null,assignedToName:first.assignedToName||'',instructions:first.batchInstructions??first.instructions??'',kind:first.kind||'daily',sourceTaskId:first.sourceTaskId||null,originBatchId:first.originBatchId||null,
      acceptedAt:cars.every(t=>t.acceptedAt&&t.acceptedById===t.assignedToUserId)?first.acceptedAt:null,acceptedBy:first.acceptedBy||'',status,workClosed:closed,workClosedAt:first.workClosedAt||(systemCompleted?first.closedAt:null),workClosedBy:first.workClosedBy||first.closedBy||'',workClosedById:first.workClosedById||first.closedById||null,workClosureReason:first.workClosureReason||(systemCompleted?'completed':null),systemCompleted,systemResolved,systemCompletedAt:first.systemCompletedAt||(systemCompleted?first.closedAt:null),systemCompletedBy:first.systemCompletedBy||first.closedBy||'',handedOver,cancelledCount:cars.filter(t=>t.status==='cancelled').length,completedCount:cars.filter(done).length,vehicleCount:cars.length,remainingCount:remaining.length,remainingVehicleId:remaining.length===1?remaining[0].id:null,cars};
  }).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||Number(a.kind!=='carryover')-Number(b.kind!=='carryover')||String(a.id).localeCompare(String(b.id)));
}
export function validTaskDotOrder(order){return Array.isArray(order)&&order.length===2&&order[0]!==order[1]&&order.every(s=>['summer','winter'].includes(s))}
export function taskDotOrder(task){return validTaskDotOrder(task.dotOrder)?task.dotOrder:task.targetSeason==='summer'?['winter','summer']:['summer','winter']}
export function taskRequiresBothRecords(task){return validTaskDotOrder(task.dotOrder)}
export function taskSeasonRecord(task,season){
  if(task.seasonRecords?.[season])return task.seasonRecords[season];
  if(season!==task.targetSeason||!task.completedRecordId)return null;
  return {recordId:task.completedRecordId,recordPath:task.completedRecordPath,dotSummary:task.completedDot,mileage:task.completedMileage,savedAt:task.recordSavedAt||task.completedAt,savedBy:task.recordSavedBy||task.completedBy,...(task.draft?.season===season?task.draft:{})};
}
export function taskSeasonRecordReady(task,season,records,validate){
  const saved=taskSeasonRecord(task,season),r=records.find(r=>r.id===saved?.recordId&&r.carId===task.carId&&r.season===season);
  if(!r||validate({id:task.carId},r.season,r.dot,r.mileage,!!r.splitDot,r.dotFront||'',r.dotRear||''))return false;
  const draft=task.drafts?.[season]||(task.draft?.season===season?task.draft:null);
  return !draft||!!draft.splitDot===!!r.splitDot&&String(draft.mileage)!==''&&Number(draft.mileage)===Number(r.mileage)&&(r.splitDot?draft.dotFront===r.dotFront&&draft.dotRear===r.dotRear:draft.dot===r.dot);
}
export function taskRecordReady(task,records,validate){
  return (taskRequiresBothRecords(task)?taskDotOrder(task):[task.targetSeason]).every(s=>taskSeasonRecordReady(task,s,records,validate));
}
export function normalizeTaskDraft(raw,season){
  const digits=(s,n)=>String(s??'').replace(/\D/g,'').slice(0,n);
  return {season,splitDot:!!raw?.splitDot,dot:digits(raw?.dot,4),dotFront:digits(raw?.dotFront,4),dotRear:digits(raw?.dotRear,4),mileage:digits(raw?.mileage,7)};
}
export function linkTaskRecord(rows,record,user,preferredTaskId,ctx){
  // An explicit TASK link must never fall back to a different employee's car.
  const open=t=>taskIsActive(t)&&!done(t)&&t.carId===record.carId&&['summer','winter'].includes(record.season)&&t.assignedToUserId===user.id&&t.acceptedById===user.id&&!!t.acceptedAt&&!!t.startedAt;
  let task=preferredTaskId?rows.find(t=>t.id===String(preferredTaskId)&&open(t)):null;
  if(!preferredTaskId){
    const candidates=rows.filter(t=>!t.workflowVersion&&t.targetSeason===record.season&&open(t)&&t.date===ctx.today);
    if(candidates.length===1)task=candidates[0];
  }
  if(!task)return null;
  const now=new Date(record.ts).toISOString();
  const linked=taskSeasonRecord(task,record.season);
  if(linked?.recordId===record.id||Date.parse(linked?.savedAt||'')>record.ts)return task;
  const draft={season:record.season,splitDot:!!record.splitDot,dot:record.dot,dotFront:record.dotFront||'',dotRear:record.dotRear||'',mileage:String(record.mileage)};
  task.seasonRecords={...(task.seasonRecords||{}),[record.season]:{...draft,recordId:record.id,recordPath:ctx.recordPath(record),dotSummary:ctx.recordDotSummary(record),mileage:record.mileage,savedAt:now,savedBy:user.name,savedById:user.id}};
  task.drafts={...(task.drafts||{}),[record.season]:draft};task.draftSavedAts={...(task.draftSavedAts||{}),[record.season]:now};task.lastMileage=record.mileage;
  task.recordSavedAt=now;task.recordSavedBy=user.name;task.draft=draft;task.draftSavedAt=now;
  if(record.season===task.targetSeason){task.completedRecordId=record.id;task.completedRecordPath=ctx.recordPath(record);task.completedDot=ctx.recordDotSummary(record);task.completedMileage=record.mileage}
  if(!task.workflowVersion&&record.season===task.targetSeason){task.status='completed';task.completedAt=now;task.completedBy=user.name;task.completedById=user.id}
  task.updatedAt=now;task.updatedBy=user.name;task.updatedById=user.id;
  task.activity=[...(task.activity||[]),{id:ctx.uid('ta'),type:'dot_linked',at:now,userId:user.id,userName:user.name,text:(record.season==='summer'?'Letní':'Zimní')+' PNEU/DOT uloženo · DOT '+ctx.recordDotSummary(record)+' · '+record.mileage+' km'}].slice(-200);
  return task;
}
export function applyTaskAction(original,body,ctx){
  const rows=structuredClone(original),{cfg,user,caps,uid,now,today,records=[],normalizeCategory,canAccess,validateRecord}=ctx;
  const events=[],audit=[];let changed=false;
  const activity=(t,type,message)=>{t.updatedAt=now;t.updatedBy=user.name;t.updatedById=user.id;t.activity=[...(t.activity||[]),{id:uid('ta'),type,at:now,userId:user.id,userName:user.name,text:message}].slice(-200);changed=true};
  const event=(key,t,members=[t])=>events.push({key,task:structuredClone(t),tasks:structuredClone(members)});
  const note=(type,message,data)=>audit.push({type,message,data});
  const result=data=>({rows,changed,events,audit,result:{ok:true,...data}});
  const assignee=id=>{
    if(!id)return null;const u=cfg.users.find(u=>u.id===id&&u.active!==false&&canAccess(u));
    if(!u)fail('USER','Vyber aktivního uživatele s přístupem do TASK.',400);return u;
  };
  const own=t=>{if(t.assignedToUserId!==user.id)fail('TIRETASK_NOT_ASSIGNED','Tento TASK není přiřazený tobě.',403)};
  const accepted=t=>{own(t);if(!t.acceptedAt||t.acceptedById!==user.id)fail('TIRETASK_NOT_ACCEPTED','Nejdřív přijmi celý TASK.')};
  const open=t=>{if(taskWorkClosed(t))fail('TIRETASK_CLOSED','Práce v tomto TASKu už byla ukončena.')};
  const ready=t=>{if(!taskRecordReady(t,records,validateRecord))fail('TIRETASK_NOT_COMPLETED','Doplň a ulož '+(taskRequiresBothRecords(t)?'letní i zimní PNEU/DOT':'platný PNEU/DOT')+' a stav kilometrů u '+(cfg.cars.find(c=>c.id===t.carId)?.plate||'vozidla')+'.')};
  const complete=t=>{
    if(done(t))return;accepted(t);if(!t.startedAt)fail('TIRETASK_NOT_STARTED','U vozidla nejdřív zvol Pracuji na tom.');ready(t);
    t.status='completed';t.problemNote='';t.problemAt=null;t.completedAt=now;t.completedBy=user.name;t.completedById=user.id;activity(t,'vehicle_completed','Vozidlo dokončeno');event('vehicleCompleted',t);
  };
  const stampClosed=(t,reason)=>{t.workClosedAt=now;t.workClosedBy=user.name;t.workClosedById=user.id;t.workClosureReason=reason};
  const normalAssignees=date=>[...new Set(rows.filter(t=>t.date===date&&t.kind!=='carryover'&&t.assignedToUserId&&taskIsActive(t)).map(t=>t.assignedToUserId))].filter(id=>cfg.users.some(u=>u.id===id&&u.active!==false&&canAccess(u)));
  const assignPending=(date,id,explicitIds=[])=>{
    const candidates=normalAssignees(date),auto=candidates.length===1&&candidates[0]===id;
    for(const t of rows.filter(t=>t.kind==='carryover'&&t.date===date&&!t.assignedToUserId&&taskIsActive(t))){
      if(!auto&&!explicitIds.includes(t.id))continue;
      t.assignedToUserId=id;activity(t,'assigned','Předané vozidlo přiřazeno: '+assignee(id).name);event('assigned',t);
    }
  };
  if(['tireTaskCreate','tireTaskCreateBatch'].includes(body.action)){
    if(!caps.create)fail('PERMISSION','Nemáš právo vytvářet TASKy.',403);
    const date=taskDate(body.date);if(!date)fail('TIRETASK_DATE','Zadej platné datum.',400);
    const entries=body.action==='tireTaskCreate'?[body]:body.entries;
    if(!Array.isArray(entries)||!entries.length||entries.length>20)fail('TIRETASK','Denní TASK musí obsahovat 1 až 20 vozidel.',400);
    const owner=assignee(text(body.assignedToUserId,80)),requestId=text(body.requestId,100);
    const previous=requestId&&rows.filter(t=>t.createRequestId===requestId&&t.createdById===user.id);
    if(previous?.length)return result({batchId:taskGroupId(previous[0]),count:previous.length,alreadyCreated:true});
    const batchId=uid('tb'),seen=new Set(),instructions=text(body.instructions);
    const created=entries.map((entry,index)=>{
      const car=cfg.cars.find(c=>c.id===entry.carId&&c.active!==false);if(!car)fail('CAR','Vyber existující aktivní vozidlo.',400);
      if(seen.has(car.id))fail('TIRETASK_DUPLICATE_CAR','Stejné vozidlo je v jednom TASKu vícekrát.',400);seen.add(car.id);
      const category=normalizeCategory(entry.category)||normalizeCategory(car.category);if(!category)fail('VEHICLE_CATEGORY','Vyber skupinu vozidla.',400);
      const time=text(entry.time,5);if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('TIRETASK_TIME','Zadej platný čas.',400);
      if(entry.dotOrder!==undefined&&!validTaskDotOrder(entry.dotOrder))fail('SEASON','Vyber pořadí Letní → Zimní nebo Zimní → Letní.',400);
      const dotOrder=entry.dotOrder,targetSeason=dotOrder?dotOrder[1]:entry.targetSeason;
      if(!['summer','winter'].includes(targetSeason))fail('SEASON','Vyber pořadí zápisu DOT.',400);
      return {id:uid('tt'),batchId,batchIndex:index,workflowVersion:dotOrder?3:2,...(dotOrder?{dotOrder}:{}),kind:'daily',date,time,carId:car.id,category,targetSeason,assignedToUserId:owner?.id||null,batchInstructions:instructions,instructions:text(entry.instructions),status:'planned',createRequestId:requestId||null,createdAt:now,createdBy:user.name,createdById:user.id,updatedAt:now,updatedBy:user.name,updatedById:user.id,comments:[],activity:[{id:uid('ta'),type:'created',at:now,userId:user.id,userName:user.name,text:'Vozidlo '+(index+1)+'/'+entries.length+' v denním TASKu'}]};
    });
    rows.push(...created);changed=true;if(owner){event('assigned',created[0],created);assignPending(date,owner.id,Array.isArray(body.carryoverIds)?body.carryoverIds:[])}
    note('tiretask_batch_create','Vytvořen denní TASK · '+date+' · '+created.length+' vozidel',{batchId,date,assignedToUserId:owner?.id||null,taskIds:created.map(t=>t.id)});
    return result({batchId,count:created.length});
  }
  const task=rows.find(t=>t.id===String(body.taskId||'')||taskGroupId(t)===String(body.batchId||''));
  if(!task)fail('TIRETASK','TASK nebyl nalezen.',404);
  const members=rows.filter(t=>taskGroupId(t)===taskGroupId(task)),group=taskGroups(members)[0];
  if(body.action==='tireTaskAccept'){
    own(task);if(group.workClosed)fail('TIRETASK_CLOSED','Tento TASK už je v historii.');
    if(group.acceptedAt)return result({alreadyAccepted:true,batchId:group.id});
    for(const t of members){t.acceptedAt=now;t.acceptedBy=user.name;t.acceptedById=user.id;activity(t,'accepted','Denní TASK přijat')}
    event('accepted',task,members);note('tiretask_accept','TASK přijal '+user.name,{batchId:group.id});return result({batchId:group.id});
  }
  if(body.action==='tireTaskUpdate'){
    if(!caps.edit)fail('PERMISSION','Nemáš právo upravovat TASK.',403);
    const reassign=body.assignedToUserId!==undefined&&String(body.assignedToUserId||'')!==(task.assignedToUserId||'');
    if(reassign&&(group.workClosed||members.some(t=>t.startedAt||done(t)))&&!members.every(t=>t.releasedAfterUserDeletion))fail('TIRETASK_STARTED','Pracovníka lze změnit jen před zahájením práce. Historie provedené práce zůstává přiřazená původnímu pracovníkovi.');
    const owner=body.assignedToUserId!==undefined?assignee(text(body.assignedToUserId,80)):null;
    const date=body.date!==undefined?taskDate(body.date):task.date;if(!date)fail('TIRETASK_DATE','Zadej platné datum.',400);
    const identityLocked=!!task.startedAt||done(task)||taskWorkClosed(task)||task.kind==='carryover'||!!task.sourceTaskId||!!task.completedRecordId||Object.keys(task.seasonRecords||{}).length>0;
    const identityChanged=body.carId!==undefined&&body.carId!==task.carId||body.targetSeason!==undefined&&body.targetSeason!==task.targetSeason||body.dotOrder!==undefined&&JSON.stringify(body.dotOrder)!==JSON.stringify(taskDotOrder(task));
    if(identityLocked&&identityChanged)fail('TIRETASK_STARTED','Vozidlo a pořadí DOT jsou navázané na zahájenou práci. Můžeš upravit datum, čas, skupinu a instrukce.');
    if(body.carId!==undefined){const car=cfg.cars.find(c=>c.id===body.carId&&c.active!==false);if(!car)fail('CAR','Vozidlo nebylo nalezeno.',400);if(members.some(t=>t.id!==task.id&&t.carId===car.id))fail('TIRETASK_DUPLICATE_CAR','Vozidlo už v tomto TASKu je.',400);task.carId=car.id}
    if(body.dotOrder!==undefined){if(!validTaskDotOrder(body.dotOrder))fail('SEASON','Vyber platné pořadí zápisu DOT.',400);if(!identityLocked){task.dotOrder=body.dotOrder;task.targetSeason=body.dotOrder[1];task.workflowVersion=3}}
    if(body.targetSeason!==undefined){if(!['summer','winter'].includes(body.targetSeason))fail('SEASON','Vyber platnou sezónu.',400);task.targetSeason=body.targetSeason;if(taskRequiresBothRecords(task))task.dotOrder=taskDotOrder({targetSeason:body.targetSeason})}
    if(body.category!==undefined){const c=normalizeCategory(body.category);if(!c)fail('VEHICLE_CATEGORY','Vyber skupinu vozidla.',400);task.category=c}
    if(body.time!==undefined){const v=text(body.time,5);if(v&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail('TIRETASK_TIME','Zadej platný čas.',400);task.time=v}
    if(body.instructions!==undefined)task.instructions=text(body.instructions);
    for(const t of members){t.date=date;if(body.batchInstructions!==undefined)t.batchInstructions=text(body.batchInstructions);if(body.assignedToUserId!==undefined)t.assignedToUserId=owner?.id||null;if(reassign){t.acceptedAt=null;t.acceptedBy=null;t.acceptedById=null;if(owner)delete t.releasedAfterUserDeletion}activity(t,'updated','Plán TASKu upraven')}
    if(reassign&&owner)event('assigned',task,members);if(!group.workClosed&&task.assignedToUserId)assignPending(date,task.assignedToUserId);
    note('tiretask_update','Upraven denní TASK',{batchId:group.id,before:original.filter(t=>taskGroupId(t)===group.id),after:members});return result({batchId:group.id});
  }
  if(body.action==='tireTaskDelete'){
    if(!caps.delete)fail('PERMISSION','Nemáš právo mazat TASKy.',403);
    const ids=new Set(members.map(t=>t.id)),byId=new Map(rows.map(t=>[t.id,t])),kept=rows.filter(t=>!ids.has(t.id)),repaired=[];
    const skipDeleted=(id,field)=>{const seen=new Set();while(id&&ids.has(id)&&!seen.has(id)){seen.add(id);id=byId.get(id)?.[field]}return id&&!ids.has(id)?id:null};
    const cancel=t=>{if(t.status!=='handed_over')return;t.status='cancelled';t.continuationCancelledAt=now;t.continuationCancelledBy=user.name;t.continuationCancelledById=user.id;activity(t,'continuation_cancelled','Dokončení předaného vozidla bylo zrušeno smazáním navazujícího TASKu');repaired.push(t.id)};
    for(const t of kept){
      let linked=false;
      if(ids.has(t.sourceTaskId)){const parent=skipDeleted(t.sourceTaskId,'sourceTaskId');t.sourceTaskId=parent;t.sourceTaskRemovedAt=now;if(!parent)t.originBatchId=null;linked=true}
      if(ids.has(t.handoverTaskId)){const child=skipDeleted(t.handoverTaskId,'handoverTaskId');if(child){t.handoverTaskId=child;t.handoverDate=byId.get(child)?.date||t.handoverDate}else{delete t.handoverTaskId;cancel(t)}linked=true}
      if(ids.has(t.finishedByContinuationId)){delete t.finishedByContinuationId;t.completionTaskRemovedAt=now;linked=true}
      if(linked){activity(t,'linked_task_deleted','Návaznost upravena po smazání jiného TASKu; zápisy PNEU/DOT zachovány');repaired.push(t.id)}
    }
    for(const t of kept){
      if(t.originBatchId===group.id){let root=t,seen=new Set();while(root.sourceTaskId&&!seen.has(root.id)){seen.add(root.id);const parent=byId.get(root.sourceTaskId);if(!parent||ids.has(parent.id))break;root=parent}t.originBatchId=root===t?null:taskGroupId(root)}
      if(t.status==='cancelled'){let id=t.sourceTaskId,seen=new Set();while(id&&!seen.has(id)){seen.add(id);const parent=byId.get(id);if(!parent||ids.has(id))break;cancel(parent);id=parent.sourceTaskId}}
    }
    note('tiretask_delete','Smazán '+(group.kind==='carryover'?'samostatný':'denní')+' TASK',{batchId:group.id,tasks:members,repairedTaskIds:[...new Set(repaired)]});changed=true;return {...result({batchId:group.id,deletedTaskIds:[...ids]}),rows:kept};
  }
  if(['tireTaskHandover','tireTaskClose'].includes(body.action))own(task);
  if(body.action==='tireTaskHandover'&&task.handoverTaskId)return result({alreadyHandedOver:true,continuationTaskId:task.handoverTaskId,batchId:group.id});
  if(body.action==='tireTaskClose'&&group.workClosed&&group.systemCompleted)return result({alreadyClosed:true,batchId:group.id});
  open(task);
  if(body.action==='tireTaskComment'){
    const value=text(body.text,500);if(!value)fail('MESSAGE','Doplň poznámku.',400);task.comments=[...(task.comments||[]),{id:uid('tc'),at:now,userId:user.id,userName:user.name,text:value}].slice(-100);activity(task,'comment','Přidána poznámka');note('tiretask_comment','Poznámka k vozidlu',{taskId:task.id});return result({});
  }
  accepted(task);
  if(body.action==='tireTaskSaveDraft'){
    if(ctx.canWriteDot===false)fail('PERMISSION','Nemáš právo zapisovat DOT.',403);
    if(!task.startedAt||done(task))fail('TIRETASK_NOT_STARTED','Rozpracované údaje lze ukládat po zahájení vozidla.');
    const season=body.draft?.season||task.targetSeason;if(!['summer','winter'].includes(season))fail('SEASON','Vyber platnou sadu pneumatik.',400);
    const clientId=text(body.draftClientId,80),sequence=Number(body.draftSequence)||0,version=task.draftVersions?.[season]||(task.draft?.season===season?{clientId:task.draftClientId,sequence:task.draftSequence}:{});
    if(clientId&&version.clientId===clientId&&sequence<=Number(version.sequence||0))return result({savedAt:task.draftSavedAts?.[season]||task.draftSavedAt,staleDraft:true});
    const draft=normalizeTaskDraft(body.draft,season),previous=task.drafts?.[season]||(task.draft?.season===season?task.draft:null);
    if(!clientId&&JSON.stringify(draft)===JSON.stringify(previous))return result({savedAt:task.draftSavedAts?.[season]||task.draftSavedAt});
    task.drafts={...(task.drafts||{}),[season]:draft};task.draftSavedAts={...(task.draftSavedAts||{}),[season]:now};task.draft=draft;task.draftSavedAt=now;task.draftSavedBy=user.name;if(clientId){task.draftVersions={...(task.draftVersions||{}),[season]:{clientId,sequence}};task.draftClientId=clientId;task.draftSequence=sequence}task.updatedAt=now;changed=true;return result({savedAt:now});
  }
  if(body.action==='tireTaskSetStatus'){
    if(done(task))fail('TIRETASK_COMPLETED','Vozidlo už je dokončené.');const status=String(body.status||'');
    if(!['in_progress','problem'].includes(status))fail('TIRETASK_STATUS','Vyber platný stav vozidla.',400);
    const problemNote=status==='problem'?text(body.problemNote,500):'';if(status==='problem'&&!problemNote)fail('MESSAGE','Popiš problém.',400);
    if(task.status===status&&task.problemNote===problemNote)return result({unchanged:true});
    const firstStart=status==='in_progress'&&!task.startedAt;task.status=status;task.problemNote=problemNote;task.problemAt=status==='problem'?now:null;
    if(firstStart){task.startedAt=now;task.startedBy=user.name;task.startedById=user.id}
    activity(task,'status',status==='in_progress'?'Pracuji na vozidle':'Problém: '+problemNote);if(firstStart)event('vehicleStarted',task);if(status==='problem')event('problem',task);
    note('tiretask_status','Změněn stav vozidla',{taskId:task.id,status});return result({taskId:task.id});
  }
  if(body.action==='tireTaskCompleteVehicle'){
    if(done(task))return result({alreadyCompleted:true,taskId:task.id});complete(task);note('tiretask_vehicle_complete','Vozidlo dokončeno',{taskId:task.id});return result({taskId:task.id});
  }
  if(body.action==='tireTaskClose'){
    const remaining=members.filter(t=>!done(t));if(remaining.length>1)fail('TIRETASK_INCOMPLETE','Nejdřív dokonči ostatní vozidla.');
    for(const t of members){ready(t);complete(t);t.status='closed';t.closedAt=now;t.closedBy=user.name;t.closedById=user.id;stampClosed(t,'completed');t.systemCompletedAt=now;t.systemCompletedBy=user.name;activity(t,'closed','Celý TASK ukončen')}
    event('taskCompleted',task,members);
    // Finish every origin in a possible chain of overnight stays. Personal work
    // closure is preserved; only system completion and final DOT are filled in.
    let child=task,seen=new Set();
    while(child.sourceTaskId&&!seen.has(child.sourceTaskId)){
      seen.add(child.sourceTaskId);const source=rows.find(t=>t.id===child.sourceTaskId);if(!source)break;
      source.status='closed';for(const k of ['completedRecordId','completedRecordPath','completedDot','completedMileage','completedAt','completedBy','completedById','recordSavedAt','recordSavedBy','seasonRecords','drafts','draftSavedAts','lastMileage'])source[k]=child[k]??null;
      source.closedAt=now;source.closedBy=user.name;source.closedById=user.id;source.finishedByContinuationId=task.id;activity(source,'handover_completed','Předané vozidlo dokončil '+user.name);
      const origin=rows.filter(t=>taskGroupId(t)===taskGroupId(source));if(origin.every(t=>t.status==='closed')){for(const t of origin){t.systemCompletedAt=now;t.systemCompletedBy=user.name}event('taskCompleted',source,origin)}
      child=source;
    }
    note('tiretask_close','Celý TASK dokončen',{batchId:group.id});return result({batchId:group.id});
  }
  if(body.action==='tireTaskHandover'){
    const remaining=members.filter(t=>!done(t));if(remaining.length!==1||remaining[0].id!==task.id)fail('TIRETASK_INCOMPLETE','Předat lze právě jedno zbývající vozidlo. Ostatní nejdřív dokonči.');
    if(!task.startedAt)fail('TIRETASK_NOT_STARTED','U předávaného vozidla nejdřív zvol Pracuji na tom.');
    if(body.staysAtService!==true)fail('TIRETASK_SERVICE','Potvrď, že toto vozidlo zůstává v servisu.',400);
    const date=nextTaskDate(task.date,today),candidates=normalAssignees(date),receiver=assignee(body.receiverId===undefined?(candidates.length===1?candidates[0]:''):text(body.receiverId,80));
    const next={...structuredClone(task),id:uid('tt'),batchId:uid('tb'),batchIndex:0,workflowVersion:taskRequiresBothRecords(task)?3:2,kind:'carryover',sourceTaskId:task.id,originBatchId:task.originBatchId||group.id,date,time:'',assignedToUserId:receiver?.id||null,status:'planned',handoverNote:text(body.handoverNote,500),handoverFrom:user.name,handoverAt:now,createdAt:now,createdBy:user.name,createdById:user.id,comments:[],activity:[]};
    for(const k of ['acceptedAt','acceptedBy','acceptedById','startedAt','startedBy','startedById','completedAt','completedBy','completedById','closedAt','closedBy','closedById','workClosedAt','workClosedBy','workClosedById','workClosureReason','systemCompletedAt','systemCompletedBy','handoverTaskId','finishedByContinuationId','problemNote','problemAt','createRequestId','createdFromConceptId'])delete next[k];
    activity(next,'handover_received','Samostatné dokončení předaného vozidla od '+user.name);rows.push(next);
    task.handoverTaskId=next.id;task.handoverDate=date;task.handoverNote=next.handoverNote;task.handedOverAt=now;task.handedOverBy=user.name;task.handedOverById=user.id;task.status='handed_over';
    for(const t of members){if(t!==task){ready(t);t.status='closed';t.closedAt=now;t.closedBy=user.name;t.closedById=user.id}stampClosed(t,'handover');activity(t,'handed_over',t===task?'Vozidlo zůstává v servisu · předáno na '+date:'Denní práce ukončena; poslední vozidlo předáno')}
    event('handedOver',task,members);if(receiver)event('assigned',next);note('tiretask_handover','Denní TASK ukončen s předáním vozidla',{batchId:group.id,taskId:task.id,continuationTaskId:next.id,date,receiverId:receiver?.id||null});
    return result({batchId:group.id,continuationTaskId:next.id,date,receiverId:receiver?.id||null});
  }
  fail('TIRETASK_ACTION','Neznámá operace TASK.',400);
}
