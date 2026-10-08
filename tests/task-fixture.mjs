import crypto from 'node:crypto';
import {reset,put,read} from './blob-mock.mjs';
export const SECRET='autoprovoz-isolated-test-secret';
process.env.SESSION_SECRET=SECRET;process.env.VAPID_PUBLIC_KEY='';process.env.VAPID_PRIVATE_KEY='';process.env.BLOB_READ_WRITE_TOKEN='';
export const handler=(await import('../api/index.js')).default;
export function token(id){const b=Buffer.from(JSON.stringify({uid:id,sg:0,exp:Date.now()+3600000})).toString('base64url');return b+'.'+crypto.createHmac('sha256',SECRET).update(b).digest('base64url')}
export async function seed(){
  reset();const now=new Date().toISOString(),hash=pin=>crypto.createHmac('sha256',SECRET).update(pin).digest('hex');
  const worker=(id,name,pin)=>({id,name,role:'driver',pinHash:hash(pin),active:true,createdAt:now,permissions:{dotCreate:true,dotView:true,notificationsReceive:true},taskNotifications:{accepted:false,vehicleStarted:false,vehicleCompleted:false,taskCompleted:false,handedOver:false}});
  const users=[{id:'admin',name:'Test Admin',role:'admin',active:true,pinHash:hash('9001'),createdAt:now,taskNotifications:{accepted:true,vehicleStarted:true,vehicleCompleted:true,taskCompleted:true,handedOver:true}},worker('worker1','Test Pracovník 1','9002'),worker('worker2','Test Pracovník 2','9003'),{...worker('dispatch','Test Dispatch','9004'),role:'dispatch',permissions:{tireTaskCreate:true,tireTaskEdit:true,notificationsReceive:true},taskNotifications:{accepted:false,vehicleStarted:true,vehicleCompleted:false,taskCompleted:true,handedOver:false}}];
  const cars=Array.from({length:9},(_,i)=>({id:'car'+(i+1),plate:'TEST '+(100+i),name:'Testovací vozidlo '+(i+1),category:i===0?'VIP':'POOL',active:true,createdAt:now}));
  await put('config.json',JSON.stringify({version:25,sessionGeneration:0,users,cars,vehicleCategories:['POOL','VIP','MANAŽER'],system:{mode:'normal'}}),{allowOverwrite:true});
  await put('tiretasks.json','[]',{allowOverwrite:true});return {users,cars};
}
export async function call(user,action,p={}){
  let status,raw;const req={method:'POST',headers:{authorization:'Bearer '+token(user),'user-agent':'isolated-test'},body:{action,...p}};
  const res={setHeader(){},status(code){status=code;return this},end(value){raw=value}};
  await handler(req,res);return {status,body:JSON.parse(raw)};
}
export async function ok(user,action,p={}){const r=await call(user,action,p);if(r.status!==200)throw new Error(action+': '+r.status+' '+JSON.stringify(r.body));return r.body}
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function tomorrow(date=today()){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
export async function create(owner='worker1',date=today(),ids=['car1','car2','car3','car4'],extra={}){
  const r=await ok('admin','tireTaskCreateBatch',{date,assignedToUserId:owner,entries:ids.map(carId=>({carId,category:carId==='car1'?'VIP':'POOL',targetSeason:'winter'})),requestId:crypto.randomUUID(),...extra});
  return read('tiretasks.json').filter(t=>t.batchId===r.batchId);
}
export async function start(user,id){return ok(user,'tireTaskSetStatus',{taskId:id,status:'in_progress'})}
export async function record(user,t,extra={}){return ok(user,'addRecord',{carId:t.carId,season:t.targetSeason,dot:'2426',mileage:120000,tireTaskId:t.id,requestId:crypto.randomUUID(),...extra})}
export {read,put};
