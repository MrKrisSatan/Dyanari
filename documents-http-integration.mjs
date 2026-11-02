import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-documents-http-'));
const workspace=path.join(root,'workspace');fs.mkdirSync(workspace);
for(const ext of ['pdf','docx','xlsx'])fs.copyFileSync(new URL(`./test-fixtures/documents/example.${ext}`,import.meta.url),path.join(workspace,'example.'+ext));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,DYANARI_PORT:String(port),DYANARI_DATA:path.join(root,'data')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let errors='';server.stderr.on('data',b=>errors+=b);await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error(errors)})]);
try {
  const html=await(await fetch(base)).text(),token=html.match(/name="token" content="([a-f0-9]+)"/)[1];
  const api=async(route,body)=>{const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'X-Dyanari-Token':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.json()};
  assert.equal((await fetch(base+'/api/tool',{method:'POST',body:'{}'})).status,403);
  const call=ext=>api('tool',{name:'read_document',arguments:{path:path.join(workspace,'example.'+ext)}});
  assert.ok((await call('pdf')).error); assert.ok(!(await api('settings',{tools:true,read:true,workspaces:[{path:workspace,write:false}]})).error);
  for(const ext of ['pdf','docx','xlsx']) {const result=await call(ext);assert.equal(result.error,undefined);assert.ok(result.records.some(r=>r.text.includes('42')));}
  assert.ok((await api('tool',{name:'read_document',arguments:{path:path.resolve('README.md')}})).error);
  await api('settings',{read:false});assert.ok((await call('pdf')).error);
  console.log(JSON.stringify({passed:true,authenticated:true,formats:3,defaultOff:true,scope:true,readRevocation:true}));
} finally {server.kill();await once(server,'exit')}
