import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-research-http-'));
let modelCalls=0;
const model=http.createServer((req,res)=>{modelCalls++;res.writeHead(500);res.end('Research failure must not reach the model');});
await new Promise(r=>model.listen(0,'127.0.0.1',r));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{windowsHide:true,env:{...process.env,DYANARI_DESKTOP:'1',DYANARI_PORT:String(port),DYANARI_DATA:path.join(root,'data'),DYANARI_OLLAMA:'http://127.0.0.1:'+model.address().port},stdio:['ignore','pipe','pipe']});
try{
 await once(server.stdout,'data');const html=await(await fetch(base)).text(),token=html.match(/name="token" content="([a-f0-9]+)"/)[1],headers={'X-Dyanari-Token':token,'Content-Type':'application/json'};
 const api=async(route,body)=>await(await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined})).json();
 const chat=async text=>await(await fetch(base+'/api/chat',{method:'POST',headers,body:JSON.stringify({text,private:true,history:[]})})).text();
 assert.match(await chat('Research Iron Warriors'),/Internet Access is OFF/);
 assert.equal(modelCalls,0);
 await api('settings',{internet:true});
 const pending=chat('Research Iron Warriors');let job;
 for(let i=0;i<50&&!job;i++){job=(await api('research/pending')).job;if(!job)await new Promise(r=>setTimeout(r,20));}
 assert.ok(job);await api('research/result',{id:job.id,result:{error:'Search requires human verification'}});
 assert.match(await pending,/human verification/);assert.equal(modelCalls,0);
 assert.equal((await api('research/state')).notes.length,0);
 assert.equal((await api('state')).memory.storedMessages,0);
 console.log(JSON.stringify({passed:true,failedResearchCannotInventAnswer:true,permissionGate:true,privateOmission:true}));
}finally{server.kill();await once(server,'exit');await new Promise(r=>model.close(r));}
