import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Core} from './core.mjs';
import {chatFeatures} from './chat-features.mjs';
import {exportMesh} from './mesh-export.mjs';

test('every existing application panel is reachable through chat, without granting permissions',async t=>{
 const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-chat-features-')),core=new Core(path.join(root,'data'));t.after(()=>core.db.close());
 const html=fs.readFileSync('public/index.html','utf8'),panels=[...html.matchAll(/<section id="([^"]+)" class="page(?: hidden)?"/g)].map(m=>m[1]).filter(id=>id!=='chat');
 assert.deepEqual(chatFeatures.map(f=>f.id).sort(),panels.sort());
 const before=JSON.stringify(core.settings),catalog=await core.tool('list_capabilities',{});
 assert.equal(catalog.features.length,panels.length);assert.ok(!catalog.enabled_tools.includes('generate_stl'));
 for(const feature of chatFeatures)assert.equal((await core.tool('open_feature',{feature:feature.id})).open_feature,feature.id);
 await assert.rejects(core.tool('open_feature',{feature:'../server'}),/Unknown/);assert.equal(JSON.stringify(core.settings),before);
 core.save({creative:true,meshEnabled:true});assert.ok((await core.tool('list_capabilities',{})).enabled_tools.includes('generate_stl'));
});
test('spoken replies default on, explicit mute persists across model changes and restart',t=>{
 const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-chat-voice-')),core=new Core(root);
 assert.equal(core.settings.speakReplies,true);assert.equal(core.settings.voiceStudioEnabled,false);
 core.save({speakReplies:false});core.save({model:'different-local-model'});core.db.close();
 const reopened=new Core(root);t.after(()=>reopened.db.close());assert.equal(reopened.settings.speakReplies,false);
});
function triangle(){const b=Buffer.alloc(134);b.writeUInt32LE(1,80);const values=[0,0,1,0,0,0,60,0,0,0,30,0];values.forEach((n,i)=>b.writeFloatLE(n,84+i*4));return b}
test('OBJ and binary PLY preserve actual STL coordinates, triangle winding and millimetre scale',async t=>{
 const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-mesh-export-')),file=path.join(root,'model.stl');fs.writeFileSync(file,triangle());
 const engine={asset(id,format){assert.equal(id,'saved');assert.equal(format,'stl');return file}};
 const read=async format=>{const chunks=[];for await(const chunk of await exportMesh(engine,'saved',format))chunks.push(Buffer.from(chunk));return Buffer.concat(chunks)};
 const obj=(await read('obj')).toString();assert.match(obj,/v 60 0 0\nv 0 30 0\nf 1 2 3/);
 const ply=await read('ply'),offset=ply.indexOf('end_header\n')+11;assert.ok(offset>11);assert.equal(ply.readFloatLE(offset+12),60);assert.equal(ply.readFloatLE(offset+28),30);assert.equal(ply[offset+36],3);assert.equal(ply.readInt32LE(offset+45),2);
 assert.deepEqual(await read('stl'),triangle());await assert.rejects(exportMesh(engine,'saved','../../exe'),/Supported/);
 const bad=triangle();bad.writeUInt32LE(2,80);fs.writeFileSync(file,bad);await assert.rejects(exportMesh(engine,'saved','obj'),/Invalid/);
});
test('nonfinite geometry fails conversion and an aborted export closes its file',async()=>{
 const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-mesh-cancel-')),file=path.join(root,'model.stl'),b=triangle();b.writeFloatLE(NaN,96);fs.writeFileSync(file,b);
 const engine={asset(){return file}},stream=await exportMesh(engine,'id','obj');await assert.rejects(async()=>{for await(const chunk of stream)void chunk},/Invalid mesh vertex/);
 fs.writeFileSync(file,triangle());const cancelled=await exportMesh(engine,'id','obj');cancelled.destroy();await new Promise(r=>cancelled.once('close',r));fs.renameSync(file,path.join(root,'renamed.stl'));
});
