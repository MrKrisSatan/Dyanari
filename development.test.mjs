import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Core} from './core.mjs';
import {redact} from './development.mjs';
function setup(){
 const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-development-'));const workspace=path.join(root,'project');fs.mkdirSync(workspace);const c=new Core(path.join(root,'data'));
 c.save({tools:true,runTools:true,read:true,create:true,edit:true,gitAccess:true,development:true,workspaces:[{path:workspace,write:true}]});
 return {c,workspace,root,close(){c.db.close()}};
}
async function repository(t){const s=setup();t.after(()=>s.close());await s.c.development.git(s.workspace,['init','-b','main']);await s.c.development.git(s.workspace,['config','user.name','Dyanari Tests']);await s.c.development.git(s.workspace,['config','user.email','tests@dyanari.invalid']);fs.writeFileSync(path.join(s.workspace,'hello.txt'),'original');await s.c.development.git(s.workspace,['add','hello.txt']);await s.c.development.git(s.workspace,['commit','-m','initial']);return s}
function recipe(s,args=['-e','console.log("tests passed")']){s.c.save({projectRecipes:[{id:'test',name:'Owned fixture tests',path:s.workspace,tool:'node',args,timeoutSeconds:5}]});}
test('development tools default OFF and enforce each independent permission',async t=>{
 const s=await repository(t);s.c.save({gitAccess:false});await assert.rejects(s.c.tool('git_status',{path:s.workspace}),/permission/);s.c.save({gitAccess:true,runTools:false});await assert.rejects(s.c.tool('git_status',{path:s.workspace}),/permission/);s.c.save({runTools:true});assert.match((await s.c.tool('git_status',{path:s.workspace})).output,/main/);
 await assert.rejects(s.c.tool('github_repos',{}),/permission/);
});
test('real Git branch and explicit commit require single-use approval; hooks never execute',async t=>{
 const s=await repository(t);const d=s.c.development;const hook=path.join(s.workspace,'.git/hooks/pre-commit');fs.writeFileSync(hook,'#!/bin/sh\necho unsafe > hook-ran.txt\nexit 1\n');
 let p=await s.c.tool('git_branch',{path:s.workspace,branch:'feature/test'});assert.equal(p.pending,true);assert.match((await d.git(s.workspace,['branch','--show-current'])).stdout,/main/);await d.confirm(p.id);await assert.rejects(d.confirm(p.id),/missing/);
 fs.writeFileSync(path.join(s.workspace,'hello.txt'),'fixed');fs.writeFileSync(path.join(s.workspace,'leave.txt'),'not staged');
 p=await s.c.tool('git_commit',{path:s.workspace,files:['hello.txt'],message:'Fix owned fixture'});const result=await d.confirm(p.id);assert.equal(result.passed,true);assert.match(result.commit,/^[0-9a-f]{40}$/);assert.ok(!fs.existsSync(path.join(s.workspace,'hook-ran.txt')));assert.match((await d.git(s.workspace,['status','--porcelain'])).stdout,/leave.txt/);
});
test('commit previews reject file changes, pathspec tricks and pre-existing staged content',async t=>{
 const s=await repository(t),d=s.c.development;fs.writeFileSync(path.join(s.workspace,'hello.txt'),'one');let p=await d.execute('git_commit',{path:s.workspace,files:['hello.txt'],message:'one'});fs.writeFileSync(path.join(s.workspace,'hello.txt'),'two');await assert.rejects(d.confirm(p.id),/changed/);
 for(const file of ['../escape.txt',':(glob)**','-A','.git/config'])await assert.rejects(d.execute('git_commit',{path:s.workspace,files:[file],message:'bad'}));
 await d.git(s.workspace,['add','hello.txt']);await assert.rejects(d.execute('git_commit',{path:s.workspace,files:['hello.txt'],message:'bad'}),/staged/);
});
test('GitHub destinations require repository grants, HTTPS origin, Internet and a clean tree',async t=>{
 const s=await repository(t),d=s.c.development;s.c.save({internet:true,githubAccess:true,githubRepositories:['owner/project']});await d.git(s.workspace,['remote','add','origin','https://github.com/other/private.git']);await assert.rejects(d.execute('git_push',{path:s.workspace}),/not approved/);
 await d.git(s.workspace,['remote','set-url','origin','ssh://github.com/owner/project']);await assert.rejects(d.execute('git_push',{path:s.workspace}),/HTTPS/);
 await d.git(s.workspace,['remote','set-url','origin','https://github.com/owner/project.git']);fs.writeFileSync(path.join(s.workspace,'untracked.txt'),'x');await assert.rejects(d.execute('git_pull',{path:s.workspace}),/local changes/);
 s.c.save({internet:false});await assert.rejects(d.execute('git_push',{path:s.workspace}),/permission/);
});
test('Git rejects dangerous local configuration and workspace escapes',async t=>{
 const s=await repository(t);await s.c.development.git(s.workspace,['config','filter.evil.clean','anything']);await assert.rejects(s.c.tool('git_status',{path:s.workspace}),/unsupported/);
 await assert.rejects(s.c.tool('git_status',{path:s.root}),/Outside approved/);
});
test('saved recipes execute real argv without shell interpretation and persist actual pass/fail logs',async t=>{
 const s=setup();t.after(()=>s.close());recipe(s,['-e','console.log(process.argv[1]);process.exit(0)','hello & echo unsafe']);let p=await s.c.tool('run_project_recipe',{id:'test'});let r=await s.c.development.confirm(p.id);assert.equal(r.passed,true);assert.match(r.stdout,/hello & echo unsafe/);
 recipe(s,['-e','console.error("expected failure");process.exit(7)']);p=await s.c.tool('run_project_recipe',{id:'test'});r=await s.c.development.confirm(p.id);assert.equal(r.passed,false);assert.equal(r.exitCode,7);assert.equal(s.c.development.state().runs[0].status,'failed');assert.match(s.c.development.state().runs[0].output,/expected failure/);
});
test('recipe approval becomes stale after source edits, settings changes or expiry',async t=>{
 const s=setup();t.after(()=>s.close());recipe(s);let p=await s.c.tool('run_project_recipe',{id:'test'});fs.writeFileSync(path.join(s.workspace,'new.js'),'changed');await assert.rejects(s.c.development.confirm(p.id),/changed/);
 p=await s.c.tool('run_project_recipe',{id:'test'});s.c.development.pending.get(p.id).expires=0;await assert.rejects(s.c.development.confirm(p.id),/expired/);
 p=await s.c.tool('run_project_recipe',{id:'test'});s.c.save({development:false});await assert.rejects(s.c.development.confirm(p.id),/missing/);
});
test('runner times out and cancels subprocess descendants on Windows',async t=>{
 const s=setup();t.after(()=>s.close());recipe(s,['-e','const {spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});console.log(c.pid);setInterval(()=>{},1000)']);
 const controller=new AbortController();s.c.controllers.add(controller);const p=await s.c.tool('run_project_recipe',{id:'test'});const run=s.c.development.confirm(p.id,controller.signal);setTimeout(()=>controller.abort(),400);await assert.rejects(run,/Cancelled/);
 const pid=Number(s.c.development.state().runs[0].output.trim());assert.ok(pid>0);assert.throws(()=>process.kill(pid,0));
 const r=s.c.settings.projectRecipes[0];s.c.save({projectRecipes:[{...r,args:['-e','setInterval(()=>{},1000)'],timeoutSeconds:1}]});const next=await s.c.tool('run_project_recipe',{id:'test'});await assert.rejects(s.c.development.confirm(next.id),/timed out/);
});
test('permissions changed by another Core cancel an active runner',async t=>{
 const s=setup();t.after(()=>s.close());recipe(s,['-e','setInterval(()=>{},1000)']);const other=new Core(path.join(s.root,'data'));t.after(()=>other.db.close());const controller=new AbortController();s.c.controllers.add(controller);const p=await s.c.tool('run_project_recipe',{id:'test'});const run=s.c.development.confirm(p.id,controller.signal);setTimeout(()=>other.save({development:false}),400);await assert.rejects(run,/Cancelled/);
});
test('GitHub writes remain pending, bind exact payloads and honour revocation',async t=>{
 const s=setup();t.after(()=>s.close());s.c.save({githubAccess:true,internet:true,githubRepositories:['owner/project']});let calls=[];s.c.development.github=async(...a)=>{calls.push(a);return {url:'https://github.com/owner/project/issues/1'}};
 const p=await s.c.tool('github_create_pull_request',{repository:'owner/project',head:'feature',base:'main',title:'Fix bug',body:'Exact reviewed body'});assert.equal(calls.length,0);await s.c.development.confirm(p.id);assert.equal(calls[0][0],'/repos/owner/project/pulls');assert.equal(calls[0][2].body,'Exact reviewed body');
 const next=await s.c.tool('github_create_issue',{repository:'owner/project',title:'Title',body:'Body'});s.c.save({githubAccess:false});await assert.rejects(s.c.development.confirm(next.id));assert.equal(calls.length,1);
});
test('invalid recipes and secret output are rejected or redacted',t=>{
 const s=setup();t.after(()=>s.close());assert.throws(()=>s.c.save({projectRecipes:[{id:'x',name:'bad',path:s.workspace,tool:'cmd',args:[],timeoutSeconds:5}]}),/tool/);
 assert.equal(redact('ghp_'+'a'.repeat(36)),'[REDACTED]');assert.match(redact('https://name:secret@github.com/owner/repo'),/REDACTED/);
});
