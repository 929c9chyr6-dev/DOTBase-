import http from 'node:http';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {handler,seed,read,create,today,tomorrow} from './task-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
await seed();
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__test/state'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({tasks:read('tiretasks.json'),notifications:read('notifications.json'),records:read('records-index.json')}))}
    if(url.pathname==='/__test/seed-plans'){await seed();await create('worker1',today());await create('worker2',tomorrow(),['car5','car6','car7','car8']);return res.end('ok')}
    if(url.pathname==='/api'){
      let raw='';for await(const chunk of req)raw+=chunk;req.body=JSON.parse(raw||'{}');res.status=code=>{res.statusCode=code;return res};return handler(req,res);
    }
    const pathname=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','app.js','service-worker.js','manifest.webmanifest','icon-192.png'].includes(pathname)){res.statusCode=404;return res.end('Not found')}
    res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.html')?'text/html':pathname.endsWith('.png')?'image/png':'application/json');res.end(await fs.readFile(root+pathname));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}))}
});
server.listen(4173,'127.0.0.1',()=>console.log('Isolated test server http://127.0.0.1:4173'));
export default server;
