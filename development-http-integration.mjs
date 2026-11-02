// Isolated API acceptance test: no GitHub writes or user projects.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-development-http-'));
const project=path.join(root,'project');fs.mkdirSync(project);
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,DYANARI_PORT:String(port),DYANARI_DATA:path.join(root,'data')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let errors='';server.stderr.on('data',b=>errors+=b);await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error(errors)})]);
try{
 const html=await(await fetch(base)).text();assert.match(html,/id="development" class="page hidden"/);const token=html.match(/name="token" content="([a-f0-9]+)"/)[1];
 const api=async(route,body)=>{const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'X-Dyanari-Token':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.json()};
 assert.equal((await fetch(base+'/api/development/account',{method:'POST',body:'{}'})).status,403);
 assert.equal((await api('state')).settings.development,false);
 assert.match((await api('tool',{name:'run_project_recipe',arguments:{id:'test'}})).error,/permission/);
 const settings=await api('settings',{tools:true,runTools:true,development:true,workspaces:[{path:project,write:true}],projectRecipes:[{id:'test',name:'API test fixture',tool:'node',path:project,args:['-e','console.log("API execution verified")'],timeoutSeconds:5}]});assert.ok(!settings.error);
 const preview=await api('tool',{name:'run_project_recipe',arguments:{id:'test'}});assert.equal(preview.pending,true);
 assert.match((await api('development/confirm',{id:preview.id})).error,/Explicit/);
 assert.equal((await api('state')).development.runs.length,0);
 const result=await api('development/confirm',{id:preview.id,approved:true});assert.equal(result.passed,true);assert.match(result.stdout,/API execution verified/);
 assert.match((await api('development/confirm',{id:preview.id,approved:true})).error,/missing/);
 const p=await api('tool',{name:'run_project_recipe',arguments:{id:'test'}});await api('stop',{});assert.equal((await api('state')).development.pending.length,0);assert.match((await api('development/confirm',{id:p.id,approved:true})).error,/missing/);
 console.log(JSON.stringify({passed:true,checks:10,authenticatedApi:true,realCommandExecution:true,singleUseApproval:true,stopCancelsPending:true}));
}finally{server.kill();await once(server,'exit')}
