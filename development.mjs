import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ResourceManager } from './resources.mjs';
import { fileURLToPath } from 'node:url';

export const developmentDefinitions = [
 ['git_status','Read status of an approved local Git repository.',{path:'string'}],
 ['git_diff','Read working and staged changes without external diff programs.',{path:'string'}],
 ['git_log','Read the last ten commits.',{path:'string'}],
 ['git_branch','Request creating a new branch. Requires a fresh user approval.',{path:'string',branch:'string'}],
 ['git_commit','Preview and request committing explicit relative files. Never stages all files implicitly. Requires user approval.',{path:'string',files:'array',message:'string'}],
 ['git_clone','Request cloning an approved GitHub repository to a NEW workspace folder.',{path:'string',repository:'string'}],
 ['git_pull','Request a fast-forward-only pull from the approved GitHub origin. Requires a clean working tree.',{path:'string'}],
 ['git_push','Request a non-force push of the current branch and exact HEAD to the approved GitHub origin.',{path:'string'}],
 ['github_repos','List repositories accessible through the connected GitHub account.',{}],
 ['github_issues','List open issues in an approved GitHub repository.',{repository:'string'}],
 ['github_pull_requests','List open pull requests in an approved GitHub repository.',{repository:'string'}],
 ['github_create_issue','Request an issue with an exact title/body in an approved repository.',{repository:'string',title:'string',body:'string'}],
 ['github_comment_issue','Request posting an exact issue/PR comment.',{repository:'string',number:'number',body:'string'}],
 ['github_create_pull_request','Request a pull request for an already-pushed branch.',{repository:'string',head:'string',base:'string',title:'string',body:'string'}],
 ['list_project_recipes','List user-approved build and test recipes; never invent a command.',{}],
 ['list_development_runs','Read recent real execution results after the user approves operations in Development.',{}],
 ['run_project_recipe','Request running a saved build/test recipe by its id. Requires fresh user approval. Inspect passed and exitCode; a request is not an execution.',{id:'string'}],
];
const readGit = new Set(['git_status','git_diff','git_log']);
const githubOps = new Set(developmentDefinitions.map(([n])=>n).filter(n=>n.startsWith('github_')));
export function redact(value) {
 return String(value).replace(/github_pat_[\w]+|gh[pousr]_[\w]+/g,'[REDACTED]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[REDACTED]@').replace(/(authorization\s*[:=]\s*)(?:bearer|token)\s+\S+/gi,'$1[REDACTED]');
}
function executable(name, home) {
 const candidates = name==='node' ? [process.execPath] : name==='git' ? [path.join(home,'runtime/git/cmd/git.exe')] : name==='gh' ? [path.join(home,'runtime/gh/bin/gh.exe')] : [];
 for(const folder of (process.env.PATH||'').split(path.delimiter)) if(folder) candidates.push(path.join(folder.replace(/^"|"$/g,''),name+(process.platform==='win32'?'.exe':'')));
 if(name==='dotnet' && process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles,'dotnet/dotnet.exe'));
 const found=candidates.find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
 if(!found) throw Error(`${name} is not installed. Install it or rerun Dyanari Setup.`);
 return fs.realpathSync(found);
}
export class DevelopmentEngine {
 constructor(core) {
  this.core=core;this.pending=new Map();this.running=false;
  this.home=process.env.DYANARI_HOME||path.dirname(fileURLToPath(import.meta.url));
  this.home=path.resolve(this.home);
  this.lock=new ResourceManager(core.dir,'development-task.lock','development');
  this.emptyHooks=path.join(core.dir,'disabled-git-hooks');fs.mkdirSync(this.emptyHooks,{recursive:true});
  core.db.exec('CREATE TABLE IF NOT EXISTS development_runs(id TEXT PRIMARY KEY, value TEXT NOT NULL)');
 }
 state() {
  const available={};for(const name of ['git','gh','node','dotnet','python'])try{available[name]=executable(name,this.home)}catch{available[name]=null}
  return {available,pending:[...this.pending.values()].filter(p=>p.expires>Date.now()).map(({id,summary,expires})=>({id,summary,expires})),running:this.running,
   runs:this.core.db.prepare('SELECT value FROM development_runs ORDER BY rowid DESC LIMIT 20').all().map(x=>JSON.parse(x.value))};
 }
 cancel(){this.pending.clear()}
 allowed(name) {
  const s=this.core.settings;
  if(!s.tools||!s.runTools||!s.read) return false;
  if(name==='list_development_runs')return s.development||s.gitAccess||s.githubAccess;
  if(name==='list_project_recipes'||name==='run_project_recipe')return s.development;
  if(githubOps.has(name))return s.githubAccess&&s.internet;
  if(name.startsWith('git_'))return s.gitAccess && (readGit.has(name)|| (name==='git_clone'?s.create:s.edit)) && (!['git_clone','git_pull','git_push'].includes(name)||(s.githubAccess&&s.internet));
  return false;
 }
 require(name){if(!this.allowed(name))throw Error('Development permission denied or Internet Access is OFF')}
 async child(file,args,{cwd,signal,timeout=30000,input='',env={},onOutput,sensitive=false}={}) {
  if(signal?.aborted)throw Error('Cancelled');
  const clean={...process.env,...env};
  const inheritedPath=env.PATH||env.Path||process.env.PATH||'';
  for(const key of Object.keys(clean))if(key.toLowerCase()==='path')delete clean[key];
  clean.PATH=[path.join(this.home,'runtime/gh/bin'),path.join(this.home,'runtime/git/cmd'),inheritedPath].join(path.delimiter);
  for(const key of Object.keys(clean))if(/^(NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONSTARTUP|GIT_CONFIG|GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_EXEC_PATH|GIT_ASKPASS|SSH_ASKPASS|GIT_TRACE|GIT_CURL_VERBOSE)/.test(key))delete clean[key];
  Object.assign(clean,{GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',GH_PROMPT_DISABLED:'1',GIT_PAGER:'cat',PAGER:'cat',GH_NO_UPDATE_NOTIFIER:'1',GIT_CONFIG_NOSYSTEM:'0',NO_COLOR:'1'});
  return new Promise((resolve,reject)=>{
   const child=spawn(file,args,{cwd,env:clean,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
   let stdout='',stderr='',bytes=0,done=false,aborting=false,stopError;
   const stop=reason=>{if(done||aborting)return;aborting=true;stopError=Error(reason);if(process.platform==='win32'){
    const killer=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());
   }else child.kill('SIGKILL');};
   const abort=()=>stop('Cancelled');signal?.addEventListener('abort',abort,{once:true});
   const timer=setTimeout(()=>stop('Command timed out'),timeout);
   const monitor=setInterval(()=>{try{this.core.settings;this.core.agentTasks?.watch()}catch{stop('Permission monitor failed')}},300);
   const finish=(error,code)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(monitor);signal?.removeEventListener('abort',abort);child.stdin.destroy();if(error)reject(error);else resolve({exitCode:code,passed:code===0,stdout:sensitive?stdout:redact(stdout),stderr:redact(stderr)})};
   child.on('error',e=>finish(e));
   for(const [stream,key]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.setEncoding('utf8').on('data',chunk=>{
    bytes+=Buffer.byteLength(chunk);if(bytes>2_000_000){stop('Command exceeded the 2 MB output limit');return}
    const text=sensitive?chunk:redact(chunk);if(key==='stdout')stdout=(stdout+text).slice(-100000);else stderr=(stderr+text).slice(-100000);if(!sensitive)onOutput?.(text);
   });
   child.on('close',code=>finish(stopError,code));child.stdin.on('error',()=>{});child.stdin.end(input);
  });
 }
 async git(root,args,signal,{network=false,check=true,input=''}={}) {
  const config=['-c','core.hooksPath='+this.emptyHooks,'-c','core.fsmonitor=false','-c','core.pager=cat','-c','diff.external=','-c','credential.interactive=false','-c','protocol.allow=never','-c','protocol.https.allow='+(network?'always':'never'),'-c','http.followRedirects=false','-c','push.recurseSubmodules=no','-c','submodule.recurse=false'];
  if(network){let gh;try{gh=executable('gh',this.home)}catch{};if(gh&&(await this.child(gh,['auth','status','--hostname','github.com'],{signal})).passed){const quoted="'"+gh.replaceAll('\\','/').replaceAll("'","'\\''")+"'";config.push('-c','credential.helper=','-c','credential.helper=!'+quoted+' auth git-credential');}}
  const result=await this.child(executable('git',this.home),[...config,...args],{cwd:root,signal,timeout:network?180000:30000,input});
  if(check&&!result.passed)throw Error(result.stderr||result.stdout||'Git command failed');return result;
 }
 repo(root,write=false) {
  const resolved=this.core.resolve(root,write);
  const dot=path.join(resolved,'.git');if(!fs.existsSync(dot)||!fs.lstatSync(dot).isDirectory()||fs.lstatSync(dot).isSymbolicLink()||!this.core.inside(resolved,fs.realpathSync(dot)))throw Error('Select a normal Git repository root (linked worktrees are not supported yet)');
  const config=fs.readFileSync(path.join(dot,'config'),'utf8');
  if(/\[(?:filter|include|includeif|credential|url|http)(?:\s|\])/i.test(config)||/^\s*worktree\s*=/mi.test(config)||fs.existsSync(path.join(dot,'commondir')))throw Error('Repository has unsupported filter, include, credential, URL, HTTP or linked-worktree configuration. Use a normal reviewed clone.');
  return resolved;
 }
 repository(value) {
  if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(value)||value.endsWith('.git'))throw Error('Use owner/repository');
  if(!this.core.settings.githubRepositories.some(x=>x.toLowerCase()===value.toLowerCase()))throw Error('GitHub repository is not approved');return value;
 }
 branch(value){if(typeof value!=='string'||value.length>150||! /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(value)||/\.\.|\/\/|\.lock(?:\/|$)|\.$|\/$/.test(value))throw Error('Invalid branch name');return value}
 async origin(root,signal) {
  // Multiple URLs, pushurl and url rewrites could silently change the destination.
  const urls=(await this.git(root,['remote','get-url','--all','origin'],signal)).stdout.trim().split(/\r?\n/);
  const pushes=(await this.git(root,['remote','get-url','--push','--all','origin'],signal)).stdout.trim().split(/\r?\n/);
  if(urls.length!==1||pushes.length!==1||urls[0]!==pushes[0])throw Error('Use one matching HTTPS origin fetch/push URL');
  const match=/^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(urls[0]);
  if(!match)throw Error('Only approved HTTPS github.com origins are supported');
  return this.repository(match[1]);
 }
 async fingerprint(root,signal) {
  const head=await this.git(root,['rev-parse','--verify','HEAD'],signal,{check:false});
  const branch=await this.git(root,['symbolic-ref','--short','HEAD'],signal,{check:false});
  const status=await this.git(root,['status','--porcelain=v1','--untracked-files=all'],signal);
  const diff=await this.git(root,['diff','--no-ext-diff','--no-textconv','HEAD','--'],signal,{check:false});
  const staged=await this.git(root,['diff','--cached','--no-ext-diff','--no-textconv','--'],signal);
  return this.core.hash(JSON.stringify([head.stdout,branch.stdout,status.stdout,diff.stdout,staged.stdout]));
 }
 files(root,files){
  if(!Array.isArray(files)||!files.length||files.length>100)throw Error('Choose 1–100 explicit files');
  return files.map(file=>{if(typeof file!=='string'||file.startsWith('-')||file.includes('\0')||path.isAbsolute(file)||file.split(/[\\/]/).some(p=>p==='..'||p==='.git'||p==='.env'||p==='.ssh'))throw Error('Invalid or protected commit file');
   this.core.resolve(path.join(root,file),true);return file.replaceAll('\\','/');});
 }
 async snapshot(root) {
  const hash=crypto.createHash('sha256');let count=0,bytes=0;
  const walk=folder=>{for(const item of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   if(['.git','node_modules','bin','obj','.venv','venv','runtime','data'].includes(item.name))continue;
   const file=path.join(folder,item.name);if(item.isSymbolicLink())throw Error('Linked source files require a separate reviewed workspace');
   if(item.isDirectory())walk(file);else if(item.isFile()){
    if(++count>15000||(bytes+=fs.statSync(file).size)>100_000_000)throw Error('Workspace source snapshot exceeds 15,000 files / 100 MB');
    hash.update(path.relative(root,file));hash.update(fs.readFileSync(file));
   }
  }};walk(root);return hash.digest('hex');
 }
 recipe(id) {const r=this.core.settings.projectRecipes.find(r=>r.id===id);if(!r)throw Error('Recipe not approved');return structuredClone(r)}
 command(recipe) {
  if(recipe.tool==='npm') {
   const bundled=path.join(this.home,'runtime/node/node_modules/npm/bin/npm-cli.js');
   if(fs.existsSync(bundled))return {file:executable('node',this.home),args:[bundled,...recipe.args]};
   // Invoke npm's JS entry directly; never cmd.exe or shell command interpolation.
   for(const folder of (process.env.PATH||'').split(path.delimiter)){
    for(const relative of ['node_modules/npm/bin/npm-cli.js','../lib/node_modules/npm/bin/npm-cli.js']){const cli=path.resolve(folder,relative);if(fs.existsSync(cli))return {file:executable('node',this.home),args:[cli,...recipe.args]};}
   }throw Error('npm is unavailable. Install Node.js with npm.');
  }
  return {file:executable(recipe.tool,this.home),args:recipe.args};
 }
 async execute(name,args,signal) {
  this.require(name);
  if(name==='list_project_recipes')return this.core.settings.projectRecipes;
  if(name==='list_development_runs')return this.state().runs.map(r=>({id:r.id,name:r.name,status:r.status,exitCode:r.result?.exitCode,error:r.error,output:r.output.slice(-12000),result:r.name.startsWith('github_')?r.result:undefined}));
  if(name==='github_repos')return this.github('/user/repos?per_page=50&sort=updated','GET',null,signal);
  if(name==='github_issues'||name==='github_pull_requests')return this.github(`/repos/${this.repository(args.repository)}/${name==='github_issues'?'issues':'pulls'}?state=open&per_page=30`,'GET',null,signal);
  if(readGit.has(name)) {
   const root=this.repo(args.path);let commands=name==='git_status'?[['status','--short','--branch']]:name==='git_log'?[['log','-10','--format=%h %s']]:[['diff','--no-ext-diff','--no-textconv','--stat'],['diff','--no-ext-diff','--no-textconv','--'],['diff','--cached','--no-ext-diff','--no-textconv','--']];
   const output=[];for(const cmd of commands)output.push((await this.git(root,cmd,signal)).stdout);return {path:root,output:output.join('\n')};
  }
  const plan={name,args:structuredClone(args)};
  if(name==='run_project_recipe') {
   plan.recipe=this.recipe(args.id);plan.root=this.core.resolve(plan.recipe.path,true);plan.command=this.command(plan.recipe);plan.fingerprint=await this.snapshot(plan.root);
   plan.summary=`Run ${plan.recipe.name}\nFolder: ${plan.root}\nExecutable: ${plan.command.file}\nArguments: ${JSON.stringify(plan.command.args)}\nTimeout: ${plan.recipe.timeoutSeconds}s\nExecutes project code with your Windows account permissions, including network access. Source digest: ${plan.fingerprint}`;
  } else if(name==='git_clone') {
   plan.repository=this.repository(args.repository);plan.root=this.core.resolve(args.path,true,true);if(fs.existsSync(plan.root))throw Error('Clone destination must not exist');plan.summary=`Clone https://github.com/${plan.repository}.git\nInto NEW folder: ${plan.root}`;
  } else if(name.startsWith('git_')) {
   plan.root=this.repo(args.path,true);plan.fingerprint=await this.fingerprint(plan.root,signal);
   if(name==='git_branch')this.branch(args.branch);
   if(name==='git_commit'){
    plan.files=this.files(plan.root,args.files);if(typeof args.message!=='string'||!args.message.trim()||args.message.length>4000)throw Error('Commit message required (max 4000 characters)');
    plan.contents=plan.files.map(f=>this.core.hash(fs.readFileSync(path.join(plan.root,f))));
    const staged=await this.git(plan.root,['diff','--cached','--name-only','-z'],signal);if(staged.stdout)throw Error('Index already contains staged changes. Commit or unstage them outside Dyanari first.');
   }
   if(['git_pull','git_push'].includes(name)){
    plan.repository=await this.origin(plan.root,signal);plan.branch=this.branch((await this.git(plan.root,['symbolic-ref','--short','HEAD'],signal)).stdout.trim());
    plan.head=(await this.git(plan.root,['rev-parse','HEAD'],signal)).stdout.trim();
    if((await this.git(plan.root,['status','--porcelain'],signal)).stdout.trim())throw Error('Commit or resolve local changes before pull/push');
   }
   const changes=(await this.git(plan.root,['diff','--no-ext-diff','--no-textconv','--stat'],signal)).stdout;
   plan.summary=`${name}\nFolder: ${plan.root}\n${JSON.stringify(args)}\n${plan.repository?`Destination: https://github.com/${plan.repository} | branch ${plan.branch} | HEAD ${plan.head}\n`:''}${changes}`;
  } else if(githubOps.has(name)) {
   plan.repository=this.repository(args.repository);
   if(name==='github_create_pull_request'){this.branch(args.head);this.branch(args.base)}
   if(['github_create_issue','github_create_pull_request'].includes(name)&& (typeof args.title!=='string'||!args.title.trim()||args.title.length>250))throw Error('Title required (max 250 characters)');
   if(typeof args.body!=='string'||args.body.length>20000)throw Error('Body must be text (max 20,000 characters)');
   if(name==='github_comment_issue'&&(!Number.isSafeInteger(args.number)||args.number<1))throw Error('Invalid issue number');
   plan.summary=`${name}\nRepository: ${plan.repository}\n${JSON.stringify(args,null,2)}`;
  }else throw Error('Unknown development action');
  plan.id=crypto.randomUUID();plan.expires=Date.now()+300000;
  if(this.pending.size>=20)throw Error('Resolve existing pending development approvals first');
  this.pending.set(plan.id,plan);this.core.log('development-preview',plan.summary);
  return {pending:true,id:plan.id,summary:plan.summary,message:'Waiting for user approval in Development. Nothing has executed.'};
 }
 async confirm(id,signal) {
  const p=this.pending.get(id);this.pending.delete(id);
  if(!p||p.expires<Date.now())throw Error('Approval missing, expired or already used');
  if(p.taskId&&!this.core.agentTasks?.acceptsApproval(p.taskId,id,'development'))throw Error('Project task approval was invalidated; request a fresh preview');
  this.require(p.name);if(this.running)throw Error('Another development operation is active');
  this.running=true;let release;
  const operation=new AbortController();signal=signal?AbortSignal.any([signal,operation.signal]):operation.signal;
  this.core.agentTasks?.approvalStarted('development',id,()=>operation.abort());let outcome;
  const run={id:crypto.randomUUID(),name:p.name,summary:p.summary,started:new Date().toISOString(),status:'running',output:''};
  const save=()=>this.core.db.prepare('INSERT OR REPLACE INTO development_runs VALUES(?,?)').run(run.id,JSON.stringify(run));
  try{
   release=this.lock.acquire(p.name);save();
   if(p.root){if(p.name==='git_clone'){this.core.resolve(p.root,true,true);if(fs.existsSync(p.root))throw Error('Clone target now exists')}
    else{this.core.resolve(p.root,true);const current=p.name==='run_project_recipe'?await this.snapshot(p.root):await this.fingerprint(p.root,signal);if(current!==p.fingerprint)throw Error('Project or Git state changed; request a fresh preview');}}
   let result;
   if(p.name==='run_project_recipe'){
    if(JSON.stringify(this.recipe(p.recipe.id))!==JSON.stringify(p.recipe))throw Error('Recipe changed');
    result=await this.child(p.command.file,p.command.args,{cwd:p.root,signal,timeout:p.recipe.timeoutSeconds*1000,onOutput:text=>{run.output=redact((run.output+text).slice(-100000));save()}});
   }else if(p.name==='git_branch')result=await this.git(p.root,['switch','-c',p.args.branch],signal);
   else if(p.name==='git_commit'){
    this.files(p.root,p.files);if(p.files.some((f,i)=>this.core.hash(fs.readFileSync(path.join(p.root,f)))!==p.contents[i]))throw Error('Commit file changed; request a fresh preview');
    await this.git(p.root,['--literal-pathspecs','add','--',...p.files],signal);
    const identity=this.core.settings.gitAuthorName?['-c','user.name='+this.core.settings.gitAuthorName,'-c','user.email='+this.core.settings.gitAuthorEmail]:[];
    result=await this.git(p.root,[...identity,'-c','commit.gpgsign=false','commit','--no-verify','-m',p.args.message],signal);
    result.commit=(await this.git(p.root,['rev-parse','HEAD'],signal)).stdout.trim();
   }else if(p.name==='git_clone'){this.repository(p.repository);result=await this.git(path.dirname(p.root),['clone','--no-recurse-submodules','--','https://github.com/'+p.repository+'.git',p.root],signal,{network:true});}
   else if(p.name==='git_pull'||p.name==='git_push'){
    if(await this.origin(p.root,signal)!==p.repository)throw Error('Origin changed');
    result=await this.git(p.root,p.name==='git_pull'?['pull','--ff-only','--no-rebase','origin',p.branch]:['push','--no-verify','origin',p.head+':refs/heads/'+p.branch],signal,{network:true});
   }else {
    this.repository(p.repository);const a=p.args;
    const endpoint=`/repos/${p.repository}/`+(p.name==='github_create_pull_request'?'pulls':p.name==='github_create_issue'?'issues':`issues/${a.number}/comments`);
    const body=p.name==='github_create_pull_request'?{title:a.title,body:a.body,head:a.head,base:a.base}:p.name==='github_create_issue'?{title:a.title,body:a.body}:{body:a.body};
    result=await this.github(endpoint,'POST',body,signal);
   }
   run.status=result.passed===false?'failed':'passed';run.result=result;if(p.name!=='run_project_recipe')run.output=redact(((result.stdout||'')+(result.stderr||'')).slice(-100000));outcome=result;return result;
  }catch(e){run.status=signal?.aborted?'cancelled':'failed';run.error=redact(e.message);outcome={error:run.error};throw e}
  finally{run.finished=new Date().toISOString();save();this.core.log('development-result',JSON.stringify({id:run.id,name:run.name,status:run.status,error:run.error}));release?.();this.running=false;try{this.core.agentTasks?.afterApproval('development',id,outcome||{error:'Unknown execution outcome; inspect state'})}catch(e){this.core.log('task-error',e.message)}}
 }
 async credential(signal) {
  // Credential-helper response remains in memory and is never returned to the model, logs or settings.
  const result=await this.child(executable('git',this.home),['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',signal,sensitive:true});
  const match=/^password=(.+)$/m.exec(result.stdout);if(!result.passed||!match)throw Error('Connect GitHub using Git Credential Manager, or install GitHub CLI and run gh auth login / gh auth setup-git.');return match[1].trim();
 }
 async github(endpoint,method='GET',body=null,signal) {
  if(!this.core.settings.internet||!this.core.settings.githubAccess||!this.core.settings.tools||!this.core.settings.runTools)throw Error('GitHub/Internet permission denied');
  let gh;try{gh=executable('gh',this.home)}catch{}
  if(gh){
   const args=['api','--hostname','github.com','--method',method,endpoint];if(body)args.push('--input','-');
   const r=await this.child(gh,args,{input:body?JSON.stringify(body):'',signal,timeout:60000});if(r.passed)return this.githubResult(JSON.parse(r.stdout));
   if(!/auth login|not logged|authentication|GH_TOKEN/i.test(r.stderr))throw Error('GitHub CLI request failed. Check account access and repository/branch details.');
   // A configured Git Credential Manager may be available even when gh is not signed in.
  }
  const token=await this.credential(signal);
  const response=await fetch('https://api.github.com'+endpoint,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(60000)]),redirect:'error'});
  if(!response.ok)throw Error('GitHub request failed (HTTP '+response.status+'). Check account access.');
  return this.githubResult(await response.json());
 }
 githubResult(value) {
  const compact=x=>({number:x.number,name:x.full_name||x.name,title:x.title,url:x.html_url,private:x.private,state:x.state,login:x.login,defaultBranch:x.default_branch});
  return Array.isArray(value)?value.map(compact):compact(value);
 }
}
