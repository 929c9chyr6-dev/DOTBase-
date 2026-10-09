import { get } from '@vercel/blob';
import { mutateBlobJsonArray } from './blob-json.js';
import { TaskError, taskDate, validTaskDotOrder } from './task-workflow.js';

export const TASK_CONCEPT_PATH = 'task-concepts.json';
export const TASK_CONCEPT_ACTIONS = new Set(['tireTaskConceptSave','tireTaskConceptPublish','tireTaskConceptDelete']);
const text = (value, max=700) => String(value || '').trim().slice(0,max);
const fail = (code,message,status=409) => { throw new TaskError(code,message,status); };
export async function getTaskConcepts() {
  const result=await get(TASK_CONCEPT_PATH,{access:'private',useCache:false});
  const rows=result?.statusCode===200?JSON.parse(await new Response(result.stream).text()):[];
  return Array.isArray(rows)?rows:[];
}
export function canEditTaskConcept(row,user,caps) { return caps.edit || (caps.create && row.createdById===user.id); }
export function publicTaskConcepts(cfg,rows,user,caps,tasks=[]) {
  if(!caps.create&&!caps.edit&&!caps.delete)return [];
  const published=new Set(tasks.map(t=>t.createdFromConceptId).filter(Boolean));
  return rows.filter(row=>['draft','publishing'].includes(row.status)&&!published.has(row.id)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(row=>{
    const assignee=cfg.users.find(u=>u.id===row.assignedToUserId);
    const editable=canEditTaskConcept(row,user,caps);
    return {id:row.id,version:row.version,status:row.status,date:row.date,assignedToUserId:row.assignedToUserId||'',assignedToName:assignee?.name||row.assignedToName||'',assignedToAvailable:!!assignee&&assignee.active!==false,
      instructions:row.instructions,carryoverIds:row.carryoverIds||[],createdAt:row.createdAt,createdBy:row.createdBy,createdById:row.createdById,updatedAt:row.updatedAt,updatedBy:row.updatedBy,
      entries:(row.entries||[]).map(entry=>{const car=cfg.cars.find(c=>c.id===entry.carId);return {...entry,carPlate:car?.plate||entry.carPlate||'',carName:car?.name||entry.carName||'',carAvailable:!!car&&car.active!==false}}),
      canEdit:editable&&row.status==='draft',canPublish:editable&&caps.create,canDelete:caps.delete&&row.status==='draft'};
  });
}
function conceptPayload(body,cfg) {
  const date=text(body.date,10);if(date&&!taskDate(date))fail('TIRETASK_DATE','Zadej platné datum, nebo ho nech v konceptu prázdné.',400);
  const assignedToUserId=text(body.assignedToUserId,80),owner=cfg.users.find(u=>u.id===assignedToUserId);
  if(assignedToUserId&&!owner)fail('USER','Vybraný pracovník už neexistuje. Vyber jiného, nebo přiřazení zatím vynech.',400);
  if(!Array.isArray(body.entries)||!body.entries.length||body.entries.length>20)fail('TIRETASK','Koncept musí obsahovat 1 až 20 řádků vozidel.',400);
  const seen=new Set();
  const entries=body.entries.map(entry=>{
    const carId=text(entry?.carId,80),car=cfg.cars.find(c=>c.id===carId);
    if(carId&&!car)fail('CAR','Vybrané vozidlo už neexistuje. Vyber jiné, nebo ho zatím vynech.',400);
    if(carId&&seen.has(carId))fail('TIRETASK_DUPLICATE_CAR','Stejné vozidlo je v jednom TASKu vícekrát.',400);if(carId)seen.add(carId);
    const time=text(entry?.time,5);if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('TIRETASK_TIME','Zadej platný čas.',400);
    const dotOrder=entry?.dotOrder??['summer','winter'];if(!validTaskDotOrder(dotOrder))fail('SEASON','Vyber pořadí Letní → Zimní nebo Zimní → Letní.',400);
    return {carId,carPlate:car?.plate||'',carName:car?.name||'',category:text(entry?.category,40),time,dotOrder,instructions:text(entry?.instructions),search:text(entry?.search,80)};
  });
  return {date,assignedToUserId,assignedToName:owner?.name||'',entries,instructions:text(body.instructions),carryoverIds:[...new Set((Array.isArray(body.carryoverIds)?body.carryoverIds:[]).map(id=>text(id,80)).filter(Boolean))].slice(0,100)};
}
export async function saveTaskConcept(body,{cfg,user,caps,uid,now}) {
  if(!caps.create&&!caps.edit||!body.conceptId&&!caps.create)fail('PERMISSION','Nemáš právo ukládat koncepty TASKů.',403);
  const payload=conceptPayload(body,cfg),requestId=text(body.requestId,100),signature=JSON.stringify(payload),id=text(body.conceptId,80);
  return mutateBlobJsonArray(TASK_CONCEPT_PATH,rows=>{
    let row=id?rows.find(row=>row.id===id):null;
    if(id&&!row)fail('TIRETASK_CONCEPT','Koncept nebyl nalezen. Obnov přehled.',404);
    if(row){
      if(!canEditTaskConcept(row,user,caps))fail('PERMISSION','Nemáš právo upravovat tento koncept.',403);
      if(row.status!=='draft'||row.version!==Number(body.version))fail('TIRETASK_CONCEPT_CONFLICT','Koncept mezitím změnil jiný uživatel nebo už byl odeslán. Obnov přehled.');
      Object.assign(row,payload,{version:row.version+1,updatedAt:now,updatedBy:user.name,updatedById:user.id});
    }else{
      if(!caps.create)fail('PERMISSION','Nemáš právo vytvářet TASKy.',403);
      const previous=requestId&&rows.find(row=>row.createdById===user.id&&row.createRequestId===requestId);
      if(previous){if(previous.createSignature!==signature)fail('TIRETASK_CONCEPT_CONFLICT','Tento požadavek už byl použit pro jiný koncept. Zkus uložení znovu.');return {rows,changed:false,row:previous}}
      if(rows.filter(row=>['draft','publishing'].includes(row.status)).length>=500)fail('TIRETASK_CONCEPT_LIMIT','Je uložených příliš mnoho konceptů. Nejdřív některé odešli nebo smaž.');
      row={id:uid('td'),...payload,status:'draft',version:1,createdAt:now,createdBy:user.name,createdById:user.id,updatedAt:now,updatedBy:user.name,updatedById:user.id,createRequestId:requestId,createSignature:signature};rows.push(row);
    }
    return {rows,changed:true,row:{...row}};
  });
}
export async function beginTaskConceptPublish(body,ctx,validate) {
  const {cfg,user,caps,now}=ctx;
  return mutateBlobJsonArray(TASK_CONCEPT_PATH,rows=>{
    const row=rows.find(row=>row.id===String(body.conceptId||''));if(!row)fail('TIRETASK_CONCEPT','Koncept nebyl nalezen. Obnov přehled.',404);
    if(!caps.create||!canEditTaskConcept(row,user,caps))fail('PERMISSION','Nemáš právo odeslat tento koncept.',403);
    if(row.status==='published')return {rows,changed:false,row:{...row}};
    if(row.status==='publishing')return {rows,changed:false,row:{...row}};
    if(row.status!=='draft'||row.version!==Number(body.version))fail('TIRETASK_CONCEPT_CONFLICT','Koncept mezitím změnil jiný uživatel. Obnov přehled.');
    const payload=body.entries!==undefined?conceptPayload(body,cfg):conceptPayload(row,cfg);
    if(!payload.date)fail('TIRETASK_DATE','Před odesláním doplň datum TASKu.',400);
    if(!payload.assignedToUserId)fail('USER','Před odesláním vyber pracovníka pro celý TASK.',400);
    validate(payload);
    Object.assign(row,payload,{status:'publishing',version:row.version+1,updatedAt:now,updatedBy:user.name,updatedById:user.id});
    return {rows,changed:true,row:{...row}};
  });
}
export async function finishTaskConceptPublish(conceptId,result,actor,now) {
  return mutateBlobJsonArray(TASK_CONCEPT_PATH,rows=>{
    const row=rows.find(row=>row.id===conceptId);
    if(!row||row.status==='published')return {rows,changed:false,row};
    if(!['publishing','draft'].includes(row.status))fail('TIRETASK_CONCEPT_CONFLICT','Stav konceptu se změnil. Obnov přehled.');
    Object.assign(row,{status:'published',version:row.version+1,publishedBatchId:result.batchId,publishedCount:result.count,publishedAt:now,publishedBy:actor?.name||row.updatedBy,publishedById:actor?.id||row.updatedById,updatedAt:now});
    // Keep a compact publication marker so late/repeated requests can never
    // recreate a TASK, including after that TASK has subsequently been deleted.
    delete row.entries;delete row.carryoverIds;delete row.instructions;
    return {rows,changed:true,row:{...row}};
  });
}
export async function releaseTaskConceptPublish(conceptId,version) {
  return mutateBlobJsonArray(TASK_CONCEPT_PATH,rows=>{
    const row=rows.find(row=>row.id===conceptId);if(!row||row.status!=='publishing'||row.version!==version)return {rows,changed:false};
    row.status='draft';row.version++;row.updatedAt=new Date().toISOString();return {rows,changed:true};
  });
}
export async function deleteTaskConcept(body,{user,caps,now}) {
  return mutateBlobJsonArray(TASK_CONCEPT_PATH,rows=>{
    if(!caps.delete)fail('PERMISSION','Nemáš právo mazat TASKy.',403);
    const row=rows.find(row=>row.id===String(body.conceptId||''));if(!row)fail('TIRETASK_CONCEPT','Koncept nebyl nalezen.',404);
    if(row.status==='deleted')return {rows,changed:false,row};
    if(row.status!=='draft'||row.version!==Number(body.version))fail('TIRETASK_CONCEPT_CONFLICT','Koncept se změnil nebo už začalo odesílání. Obnov přehled.');
    Object.assign(row,{status:'deleted',version:row.version+1,deletedAt:now,deletedBy:user.name,deletedById:user.id,updatedAt:now});delete row.entries;delete row.carryoverIds;delete row.instructions;
    return {rows,changed:true,row:{...row}};
  });
}
