import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {seed,call,ok,read,handler,SECRET} from './task-fixture.mjs';
async function request(action,body={},token){
  let status,raw;const req={method:'POST',headers:{...(token?{authorization:'Bearer '+token}:{}),'user-agent':'isolated-pin-test'},body:{action,...body}};
  const res={setHeader(){},status(code){status=code;return this},end(value){raw=value}};
  await handler(req,res);return {status,body:JSON.parse(raw)};
}
const hash=pin=>crypto.createHmac('sha256',SECRET).update(pin).digest('hex');
const user=id=>read('config.json').users.find(u=>u.id===id);

test('admin changes own PIN directly, stores only its hash, keeps the admin session and logs no PIN values',async()=>{
  await seed();const before=user('admin'),others=read('config.json').users.filter(u=>u.id!=='admin').map(u=>u.pinHash);
  const changed=await ok('admin','changeOwnPin',{oldPin:'9001',newPin:'9011',confirmPin:'9011'});
  assert.equal(user('admin').pinHash,hash('9011'));assert.equal(user('admin').pinChangeRequired,null);assert.equal(user('admin').role,before.role);assert.ok(user('admin').pinChangedAt);
  assert.deepEqual(read('config.json').users.filter(u=>u.id!=='admin').map(u=>u.pinHash),others);
  assert.equal((await request('state',{},changed.token)).status,200);
  const audit=read('audit.json').find(a=>a.action==='user_pin_self_change');assert.equal(audit.details.changeMode,'admin_direct');assert.equal(audit.details.resetRequest,null);
  for(const secret of ['9001','9011',hash('9001'),hash('9011')])assert.equal(JSON.stringify(audit.details).includes(secret),false);
  assert.equal(read('audit.json').some(a=>a.action==='user_pin_reset_request'),false);
  assert.equal((await request('login',{userId:'admin',pin:'9011'})).status,200);assert.equal((await request('login',{userId:'admin',pin:'9001'})).body.error,'BAD_PIN');
});

test('admin direct PIN change validates the existing PIN, four digits, matching confirmation, uniqueness and own account',async()=>{
  await seed();const original=user('admin').pinHash;
  const cases=[
    [{newPin:'9011',confirmPin:'9011'},'PIN_OLD'],
    [{oldPin:'1111',newPin:'9011',confirmPin:'9011',requireOldPin:false},'PIN_OLD'],
    [{oldPin:'9001',newPin:'901',confirmPin:'901'},'PIN'],
    [{oldPin:'9001',newPin:'ab12',confirmPin:'ab12'},'PIN'],
    [{oldPin:'9001',newPin:'9011',confirmPin:'9012'},'PIN_MATCH'],
    [{oldPin:'9001',newPin:'9001',confirmPin:'9001'},'PIN_SAME'],
    [{oldPin:'9001',newPin:'9002',confirmPin:'9002'},'PIN_USED'],
    [{oldPin:'9001',newPin:'9011',confirmPin:'9011',userId:'worker1'},'PIN_SELF_ONLY']
  ];
  for(const [payload,error] of cases){const r=await call('admin','changeOwnPin',payload);assert.equal(r.body.error,error);assert.equal(user('admin').pinHash,original);assert.equal(user('worker1').pinHash,hash('9002'));assert.equal(read('audit.json')?.some(a=>a.action==='user_pin_self_change')||false,false)}
});

test('direct change requires authentication and the actual admin role; other accounts still require a PIN-change request',async()=>{
  await seed();const payload={oldPin:'9002',newPin:'9022',confirmPin:'9022',role:'admin',requireOldPin:false};
  assert.equal((await request('changeOwnPin',payload)).status,401);
  for(const id of ['worker1','worker2','dispatch'])assert.equal((await call(id,'changeOwnPin',payload)).body.error,'PIN_CHANGE_NOT_REQUIRED');
  assert.equal((await call('admin','beginPinReset',{userId:'admin'})).body.error,'ADMIN_PIN_RESET');
  assert.equal((await call('admin','adminRequestPinReset',{userId:'admin',requireOldPin:false})).body.error,'ADMIN_PIN_RESET');
  assert.equal((await call('admin','adminUpdateUser',{userId:'worker1',pin:'9022'})).body.error,'PIN_SELF_SERVICE');
  assert.equal(user('admin').pinHash,hash('9001'));assert.equal(user('worker1').pinHash,hash('9002'));
});

test('requested worker change with the old PIN still locks work until completion and returns a working normal session',async()=>{
  await seed();await ok('admin','adminRequestPinReset',{userId:'worker1',requireOldPin:true});
  assert.equal((await call('worker1','state')).body.error,'PIN_CHANGE_REQUIRED');
  assert.equal((await call('worker1','changeOwnPin',{oldPin:'1111',newPin:'9022',confirmPin:'9022'})).body.error,'PIN_OLD');
  const changed=await ok('worker1','changeOwnPin',{oldPin:'9002',newPin:'9022',confirmPin:'9022'});assert.equal(user('worker1').pinChangeRequired,null);
  assert.equal((await request('state',{},changed.token)).status,200);assert.equal((await request('login',{userId:'worker1',pin:'9022'})).status,200);
  const audit=read('audit.json').find(a=>a.action==='user_pin_self_change');assert.equal(audit.details.changeMode,'reset_request');assert.equal(audit.details.resetRequest.requireOldPin,true);
});

test('requested worker reset without the old PIN remains limited to changing PIN and cannot enable an admin reset',async()=>{
  await seed();assert.equal((await request('beginPinReset',{userId:'worker2'})).body.error,'PIN_RESET_NOT_AVAILABLE');
  await ok('admin','adminRequestPinReset',{userId:'worker2',requireOldPin:false});const limited=await request('beginPinReset',{userId:'worker2'});assert.equal(limited.status,200);
  assert.equal((await request('state',{},limited.body.token)).body.error,'PIN_RESET_ONLY');
  const changed=await request('changeOwnPin',{newPin:'9033',confirmPin:'9033'},limited.body.token);assert.equal(changed.status,200);assert.equal(user('worker2').pinHash,hash('9033'));
  assert.equal((await request('state',{},changed.body.token)).status,200);assert.equal((await request('changeOwnPin',{newPin:'9044',confirmPin:'9044'},limited.body.token)).status,401);
  assert.equal((await request('beginPinReset',{userId:'admin'})).body.error,'ADMIN_PIN_RESET');
});
