import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Core} from './core.mjs';
import {readableResearchPage} from './research.mjs';
const source={url:'https://example.com/iron-warriors',title:'Iron Warriors reference',snippet:'A source result'};
const excerpt='Source text: armour, insignia and history are described here. '.repeat(10);
test('video metadata, navigation and challenge screens are not read evidence',()=>{
 assert.equal(readableResearchPage('Iron Warriors explained - Video. About Press Copyright Contact us Creator Advertise Developers Terms Privacy Policy & Safety'),false);
 assert.equal(readableResearchPage('Just a moment '+('browser verification '.repeat(40))),false);
 assert.equal(readableResearchPage(excerpt),true);
});
function setup(t){const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-research-')),core=new Core(root);core.save({internet:true});core.web=async(url,signal)=>{assert.equal(signal.aborted,false);return{url,text:excerpt}};t.after(()=>core.db.close());return{core,root}}
test('research saves dated source excerpts and recalls them after model switch/restart',async t=>{
 const {core,root}=setup(t);core.research.search=async()=>[source];const result=await core.tool('research_web',{query:'Iron Warriors appearance'});
 assert.equal(result.saved,true);assert.equal(result.sources[0].excerpt,excerpt.trim());core.save({model:'another-local-model'});assert.equal(core.research.recall('Create Iron Warriors image')[0].id,result.id);
 const reopened=new Core(root);assert.equal(reopened.research.recall('Iron Warriors')[0].sources[0].url,source.url);reopened.db.close();
});
test('private research and disabled retention do not save research or query activity',async t=>{
 const {core}=setup(t);core.research.search=async()=>[source];assert.equal((await core.tool('research_web',{query:'private topic'},undefined,{privateMode:true})).saved,false);assert.equal(core.research.list().length,0);
 assert.ok(!core.db.prepare('SELECT detail FROM activity').all().some(r=>r.detail.includes('private topic')));
 core.save({retainResearch:false});assert.equal((await core.tool('research_web',{query:'no retention'})).saved,false);assert.equal(core.research.list().length,0);
});
test('failed source reads return honest snippets, not learned facts',async t=>{
 const {core}=setup(t);core.research.search=async()=>[source];core.web=async()=>{throw Error('HTTP 403')};const result=await core.tool('research_web',{query:'unreadable source'});assert.equal(result.saved,false);assert.equal(result.failures.length,1);assert.match(result.warning,/no source/);assert.equal(core.research.list().length,0);
});
test('a supplied source is read directly without replacing it with a Google search',async t=>{
 const {core}=setup(t);core.research.search=async()=>{throw Error('Search should not run')};
 const result=await core.tool('research_web',{query:'Read https://example.com/iron-warriors'});
 assert.equal(result.sources[0].url,source.url);assert.equal(result.provider,'Provided sources');assert.equal(result.saved,true);
});
test('research removes request wording, retries a narrower topic and revalidates redirects',async t=>{
 const {core}=setup(t),queries=[],visited=[];
 core.research.search=async q=>{queries.push(q);return [{...source,url:q==='Iron Warriors'?'https://example.com/redirect':'https://example.com/blocked'}]};
 core.web=async(url,signal,options)=>{visited.push(url);assert.equal(options.inspectRedirect,true);assert.equal(options.maxBytes,8000000);if(url.endsWith('blocked'))throw Error('HTTP 403');if(url.endsWith('redirect'))return{redirect:source.url};return{url,text:excerpt}};
 const result=await core.tool('research_web',{query:'research Iron Warriors Space Marines'});
 assert.deepEqual(queries,['Iron Warriors Space Marines','Iron Warriors']);assert.equal(result.sources[0].url,source.url);assert.equal(result.saved,true);assert.equal(visited.length,3);
});
test('Google bridge uses single-use claims and rejects cancelled results',async t=>{
 const {core}=setup(t);const previous=process.env.DYANARI_DESKTOP;process.env.DYANARI_DESKTOP='1';t.after(()=>{if(previous===undefined)delete process.env.DYANARI_DESKTOP;else process.env.DYANARI_DESKTOP=previous});
 const pending=core.tool('research_web',{query:'Iron Warriors'}),job=core.research.claim();assert.equal(job.query,'Iron Warriors');assert.equal(core.research.claim(),null);assert.equal(core.research.status(job.id).active,true);
 core.research.complete(job.id,{results:[source]});assert.equal((await pending).saved,true);assert.throws(()=>core.research.complete(job.id,{results:[source]}),/expired/);
 const controller=new AbortController(),cancelled=core.tool('research_web',{query:'cancel me'},controller.signal),cancelJob=core.research.claim();controller.abort();await assert.rejects(cancelled,/cancelled/);assert.equal(core.research.status(cancelJob.id).active,false);
});
test('Internet OFF, cross-host revocation, project isolation and forgetting',async t=>{
 const {core,root}=setup(t);core.save({internet:false});await assert.rejects(core.tool('research_web',{query:'blocked'}),/OFF/);core.save({internet:true,activeProject:'project-a'});core.research.search=async()=>[source];await core.tool('research_web',{query:'Iron Warriors'});assert.equal(core.research.recall('Iron Warriors','project-b').length,0);
 const note=core.research.list()[0];assert.equal(core.research.forget(note.id).removed,1);assert.equal(core.research.recall('Iron Warriors').length,0);
 core.research.search=async(query,signal)=>await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));
 const work=core.tool('research_web',{query:'in progress'}),other=new Core(root);other.save({internet:false});await assert.rejects(work,/cancelled/);other.db.close();assert.equal(core.research.list().length,0);
});
test('research backup preserves identities and rejects malformed source data',async t=>{
 const {core}=setup(t);core.research.search=async()=>[source];await core.tool('research_web',{query:'Iron Warriors'});const rows=core.research.export();core.research.forget(rows[0].id);core.research.restore(rows);assert.equal(core.research.list()[0].id,rows[0].id);assert.throws(()=>core.research.restore([{...rows[0],sources:'not JSON'}]));
});
