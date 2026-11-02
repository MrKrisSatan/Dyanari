import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ResourceManager} from './resources.mjs';
import {redact} from './development.mjs';

export const reaPackage={name:'rea-agents',version:'6.8.0',repository:'https://github.com/morluto/rea',integrity:'sha512-9QDeRnGqEDzABZyr04eLnBXBv/c6I9/TWu/6M0MD4pEfkySI/BIgwTODIbAReX3C1x6hjw9+Jlx4A2yUSPZ9ww=='};
export const linkedProjectDefinitions=[
 ['list_linked_projects','List linked local MCP projects, installation and connection state.',{}],
 ['install_linked_project','Request installing the pinned REA npm package in Dyanari storage. Requires Internet and a fresh execution approval.',{id:'string'}],
 ['start_linked_project','Request starting a linked local MCP server and discovering tools. Requires fresh approval.',{id:'string'}],
 ['list_linked_project_tools','Search a running project tool catalog; returns at most 20 matches. Use query="" for the first page. Results include input schemas and whether each tool is approved.',{id:'string',query:'string'}],
 ['call_linked_project_tool','Request calling an approved external MCP tool with a JSON object encoded as arguments_json. Nothing executes until the user approves the exact call.',{id:'string',tool:'string',arguments_json:'string'}],
 ['stop_linked_project','Stop a Dyanari-owned MCP server and its child processes.',{id:'string'}],
 ['list_linked_project_runs','Read recent actual external tool results, including errors and installation/connection runs.',{}],
];
const signature=p=>JSON.stringify([p.id,p.kind,p.path,p.tool,p.args]);
const compact=value=>{const json=JSON.stringify(value);return json.length>60000?{truncated:true,text:redact(json.slice(0,60000))}:JSON.parse(redact(json))};
function killTree(child){
 if(!child||child.exitCode!==null||child.dyanariTerminating)return;
 child.dyanariTerminating=true;
 if(process.platform==='win32'){
  const p=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});p.on('error',()=>child.kill());
 }else child.kill('SIGKILL');
}
export class StdioMcpClient {
 constructor(command,{cwd,roots=[],onChange=()=>{},onExit=()=>{}}={}){
  this.command=command;this.cwd=cwd;this.roots=roots;this.onChange=onChange;this.onExit=onExit;this.requests=new Map();this.nextId=1;this.log='';this.tools=[];this.alive=false;this.buffer='';this.stale=false;
 }
 start(){
  const env={...process.env};for(const key of Object.keys(env))if(/TOKEN|PASSWORD|SECRET|API_KEY|PRIVATE_KEY|^(NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONSTARTUP|GIT_|SSH_ASKPASS)/i.test(key))delete env[key];
  const inheritedPath=process.env.PATH||'';for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];env.PATH=path.dirname(this.command.file)+path.delimiter+inheritedPath;
  Object.assign(env,{REA_MCP_INPUT_SCHEMA_PROFILE:'compact',REA_MCP_OUTPUT_SCHEMA_PROFILE:'off',NO_COLOR:'1'});
  this.child=spawn(this.command.file,this.command.args,{cwd:this.cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});this.alive=true;
  this.child.stdin.on('error',()=>{});
  this.child.stderr.setEncoding('utf8').on('data',s=>{this.log=redact((this.log+s).slice(-100000))});
  this.child.stdout.setEncoding('utf8').on('data',chunk=>{
   this.buffer+=chunk;if(Buffer.byteLength(this.buffer)>8_000_000){this.fail(Error('MCP frame exceeds 8 MB'));return}
   let i;while((i=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);if(!line.trim())continue;
    try{this.message(JSON.parse(line))}catch(e){this.fail(Error('Invalid MCP stdout: '+e.message));return}
   }
  });
  this.child.on('error',e=>this.fail(e));this.child.on('close',(code)=>{this.alive=false;this.rejectAll(Error('MCP server stopped (exit '+code+')'));this.onExit()});
 }
 send(message){if(!this.alive)throw Error('MCP server is not running');this.child.stdin.write(JSON.stringify(message)+'\n')}
 message(m){
  if(!m||m.jsonrpc!=='2.0')throw Error('Expected JSON-RPC 2.0');
  if(m.method){
   if(m.id!==undefined){
    if(m.method==='roots/list')this.send({jsonrpc:'2.0',id:m.id,result:{roots:this.roots}});
    else if(m.method==='ping')this.send({jsonrpc:'2.0',id:m.id,result:{}});
    else this.send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Client-side sampling, elicitation and other server requests are unsupported'}});
   }else if(m.method==='notifications/tools/list_changed'){this.stale=true;this.onChange()}
   else if(m.method==='notifications/message')this.log=redact((this.log+JSON.stringify(m.params)+'\n').slice(-100000));
   return;
  }
  const request=this.requests.get(m.id);if(!request)return;
  if(m.error)request.reject(Error(redact(m.error.message||'MCP request failed')));else request.resolve(m.result);
 }
 request(method,params={},signal,timeout=30000){
  if(signal?.aborted)return Promise.reject(Error('Cancelled'));
  return new Promise((resolve,reject)=>{
   const id=this.nextId++;let timer;
   const finish=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.requests.delete(id);fn(value)};
   const abort=()=>{finish(reject,Error('Cancelled; linked server stopped'));this.stop()};
   this.requests.set(id,{resolve:v=>finish(resolve,v),reject:e=>finish(reject,e)});
   signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{finish(reject,Error('MCP request timed out; linked server stopped'));this.stop()},timeout);
   try{this.send({jsonrpc:'2.0',id,method,params})}catch(e){finish(reject,e)}
  });
 }
 async initialize(signal){
  const hello=await this.request('initialize',{protocolVersion:'2025-06-18',capabilities:{roots:{listChanged:false}},clientInfo:{name:'Dyanari',version:'0.5.0'}},signal);
  if(!['2024-11-05','2025-03-26','2025-06-18'].includes(hello?.protocolVersion))throw Error('Unsupported MCP protocol version: '+hello?.protocolVersion);
  this.serverInfo=hello.serverInfo;this.send({jsonrpc:'2.0',method:'notifications/initialized'});await this.discover(signal);return hello;
 }
 async discover(signal){
  const tools=[];let cursor;const cursors=new Set();
  for(let page=0;page<20;page++){
   const r=await this.request('tools/list',cursor?{cursor}:{},signal);
   if(!Array.isArray(r?.tools))throw Error('Invalid MCP tool catalog');
   for(const t of r.tools){if(typeof t.name!=='string'||t.name.length>250||!t.inputSchema||t.inputSchema.type!=='object')throw Error('Invalid MCP tool descriptor');tools.push(t)}
   if(tools.length>2000)throw Error('MCP tool catalog exceeds 2000 tools');
   if(!r.nextCursor){this.tools=tools;this.stale=false;return tools}
   if(cursors.has(r.nextCursor))throw Error('MCP cursor repeated');cursor=r.nextCursor;cursors.add(cursor);
  }throw Error('MCP tool catalog exceeds 20 pages');
 }
 rejectAll(error){for(const r of [...this.requests.values()])r.reject(error)}
 fail(error){this.log=redact((this.log+error.message+'\n').slice(-100000));this.rejectAll(error);this.stop()}
 stop(){this.alive=false;killTree(this.child);this.rejectAll(Error('Linked server stopped'))}
}

export class LinkedProjectEngine {
 constructor(core){this.core=core;this.pending=new Map();this.clients=new Map();this.busy=new Set();core.db.exec('CREATE TABLE IF NOT EXISTS linked_project_runs(id TEXT PRIMARY KEY,value TEXT NOT NULL)');}
 allowed(){const s=this.core.settings;return s.tools&&s.runTools&&s.read&&s.linkedProjectsEnabled}
 require(){if(!this.allowed())throw Error('Linked projects, Tools, Read Files and Run Tools must be ON')}
 profile(id){const p=this.core.settings.linkedProjects.find(p=>p.id===id);if(!p)throw Error('Linked project not approved');this.core.resolve(p.path,true);return structuredClone(p)}
 installation(){return path.join(this.core.dir,'linked-projects','rea-'+reaPackage.version)}
 installed(){try{const root=this.installation();const pkg=JSON.parse(fs.readFileSync(path.join(root,'node_modules/rea-agents/package.json'),'utf8'));const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));return pkg.version===reaPackage.version&&lock.packages?.['node_modules/rea-agents']?.integrity===reaPackage.integrity&&fs.existsSync(path.join(root,'node_modules/rea-agents/scripts/rea.mjs'))}catch{return false}}
 command(p){
  if(p.kind==='rea'){if(!this.installed())throw Error('Install the pinned REA package first');return this.core.development.command({tool:'node',args:[path.join(this.installation(),'node_modules/rea-agents/scripts/rea.mjs'),'mcp']})}
  const entry=this.core.resolve(p.args[0]);if(!fs.statSync(entry).isFile())throw Error('MCP entry script is not a file');return this.core.development.command({tool:p.tool,args:[entry,...p.args.slice(1)]});
 }
 state(){return {reaPackage,projects:this.core.settings.linkedProjects.map(p=>{const c=this.clients.get(p.id);return {...p,installed:p.kind==='rea'?this.installed():true,connected:Boolean(c?.alive),toolCount:c?.tools.length||0,serverInfo:c?.serverInfo,log:c?.log||''}}),pending:[...this.pending.values()].filter(p=>p.expires>Date.now()).map(({id,summary,expires})=>({id,summary,expires})),runs:this.core.db.prepare('SELECT value FROM linked_project_runs ORDER BY rowid DESC LIMIT 12').all().map(r=>JSON.parse(r.value))}}
 reconcile(){
  const s=this.core.settings;
  for(const [id,c]of this.clients){const p=s.linkedProjects.find(p=>p.id===id);let valid=false;try{if(p){this.core.resolve(p.path,true);valid=true}}catch{};if(!s.tools||!s.runTools||!s.read||!s.linkedProjectsEnabled||!p||!valid||signature(p)!==c.signature||!s.workspaces.some(w=>w.write&&this.core.inside(w.path,p.path)))this.stop(id)}
 }
 cancel(){this.pending.clear();this.reconcile()}
 stop(id){const c=this.clients.get(id);if(c){c.stop();clearInterval(c.monitor);c.release?.();this.clients.delete(id)}for(const [key,p]of this.pending)if(p.profile.id===id)this.pending.delete(key);return {stopped:id}}
 stopAll(){this.pending.clear();for(const id of [...this.clients.keys()])this.stop(id)}
 async execute(name,args,signal){
  this.require();
  if(name==='list_linked_projects')return this.state().projects.map(({log,...p})=>p);
  if(name==='list_linked_project_runs')return this.state().runs;
  if(name==='stop_linked_project'){if(!this.core.settings.linkedProjects.some(p=>p.id===args.id))throw Error('Linked project not approved');return this.stop(args.id)}
  const profile=this.profile(args.id);
  if(name==='list_linked_project_tools'){
   const c=this.clients.get(args.id);if(!c?.alive)throw Error('Start this linked project first');if(c.stale)await c.discover(signal);
   const query=typeof args.query==='string'?args.query.toLowerCase():'';const tools=c.tools.filter(t=>(t.name+' '+(t.description||'')).toLowerCase().includes(query));
   return {total:c.tools.length,matches:tools.length,tools:tools.slice(0,20).map(t=>({name:t.name,description:(t.description||'').slice(0,1000),inputSchema:compact(t.inputSchema),approved:profile.approvedTools.includes(t.name)}))};
  }
  const p={name,profile,id:crypto.randomUUID(),expires:Date.now()+300000};
  if(name==='install_linked_project'){
   if(profile.kind!=='rea')throw Error('Local projects are installed using Development recipes, not this catalog installer');if(!this.core.settings.internet)throw Error('Internet Access must be ON to install packages');
   p.command=this.core.development.command({tool:'npm',args:['install','--prefix',this.installation(),'--ignore-scripts','--no-audit','--no-fund','--save-exact','--omit=dev','--registry=https://registry.npmjs.org',reaPackage.name+'@'+reaPackage.version]});
   p.summary=`Install REA ${reaPackage.version}\nSource: ${reaPackage.repository}\nNpm package: ${reaPackage.name}\nRegistry integrity: ${reaPackage.integrity}\nPrivate Dyanari package folder: ${this.installation()}\nPackage lifecycle scripts are disabled. This downloads dependencies but does not register REA in Codex, Claude or other apps.\n${p.command.file} ${JSON.stringify(p.command.args)}`;
  }else if(name==='start_linked_project'){
   if(this.clients.get(profile.id)?.alive)throw Error('Project is already connected');p.command=this.command(profile);p.digest=this.core.hash(fs.readFileSync(p.command.args[0]));
   p.summary=`Start linked MCP project: ${profile.name}\nWorking folder and advertised MCP root: ${profile.path}\nExecutable: ${p.command.file}\nArguments: ${JSON.stringify(p.command.args)}\nRuns external code with your Windows account permissions. It is not sandboxed. Credential-like environment variables are stripped. No target application is analysed merely by connecting.`;
  }else if(name==='call_linked_project_tool'){
   const c=this.clients.get(profile.id);if(!c?.alive)throw Error('Start this linked project first');if(c.stale)await c.discover(signal);
   if(!profile.approvedTools.includes(args.tool))throw Error('This external tool is not approved in Linked projects');
   const t=c.tools.find(t=>t.name===args.tool);if(!t)throw Error('External tool is unavailable');
   if(typeof args.arguments_json!=='string'||args.arguments_json.length>100000)throw Error('Provide arguments_json (JSON object, max 100 KB)');
   p.arguments=JSON.parse(args.arguments_json);if(!p.arguments||typeof p.arguments!=='object'||Array.isArray(p.arguments))throw Error('Tool arguments must be a JSON object');
   p.tool=args.tool;p.session=c.session;
   p.summary=`Call ${profile.name} / ${p.tool}\nServer working folder: ${profile.path}\nExact arguments:\n${JSON.stringify(p.arguments,null,2)}\nExternal tools can read/write files, launch processes and use the network with your Windows permissions. Workspace roots are guidance, not an OS sandbox.`;
  }else throw Error('Unknown linked project operation');
  if(this.pending.size>=20)throw Error('Resolve existing linked project approvals first');this.pending.set(p.id,p);return {pending:true,id:p.id,summary:p.summary,message:'Waiting for approval in Linked projects. Nothing has executed.'};
 }
 async confirm(id,signal){
  const p=this.pending.get(id);this.pending.delete(id);if(!p||p.expires<Date.now())throw Error('Approval missing, expired or already used');this.require();const current=this.profile(p.profile.id);if(JSON.stringify(current)!==JSON.stringify(p.profile))throw Error('Project configuration changed');
  if(this.busy.has(current.id))throw Error('Another operation is active for this project');this.busy.add(current.id);
  const operation=new AbortController();signal=signal?AbortSignal.any([signal,operation.signal]):operation.signal;
  this.core.agentTasks?.approvalStarted('linked',id,()=>operation.abort());let outcome;
  const run={id:crypto.randomUUID(),project:current.id,operation:p.name,tool:p.tool,started:new Date().toISOString(),status:'running',output:''};
  const save=()=>this.core.db.prepare('INSERT OR REPLACE INTO linked_project_runs VALUES(?,?)').run(run.id,JSON.stringify(run));save();
  try{
   let result;
   if(p.name==='install_linked_project'){
    if(!this.core.settings.internet)throw Error('Internet Access is OFF');if(this.clients.get(current.id)?.alive)throw Error('Stop REA before installing');
    const dir=this.installation();fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'package.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({name:'dyanari-linked-rea',version:'0.0.0',private:true}));
    const lock=new ResourceManager(this.core.dir,'linked-package-install.lock','package installation');const release=lock.acquire('REA '+reaPackage.version);
    try{result=await this.core.development.child(p.command.file,p.command.args,{cwd:dir,signal,timeout:1200000,env:{npm_config_cache:path.join(this.core.dir,'npm-cache')},onOutput:text=>{run.output=redact((run.output+text).slice(-100000));save()}})}finally{release()}
    if(!result.passed)throw Error('Package installation failed: '+result.stderr);if(!this.installed())throw Error('Installed REA version or integrity record did not match the pinned catalog');result={passed:true,installed:reaPackage.name,version:reaPackage.version,integrity:reaPackage.integrity,lifecycleScripts:false};
   }else if(p.name==='start_linked_project'){
    const command=this.command(current);if(JSON.stringify(command)!==JSON.stringify(p.command)||this.core.hash(fs.readFileSync(command.args[0]))!==p.digest)throw Error('Launch script changed; request a new preview');
    const lock=new ResourceManager(this.core.dir,'linked-'+this.core.hash(current.id).slice(0,16)+'.lock','linked project');const release=lock.acquire(current.name);
    const client=new StdioMcpClient(command,{cwd:current.path,roots:[{uri:pathToFileURL(current.path).href,name:current.name}],onChange:()=>{for(const [key,preview]of this.pending)if(preview.profile.id===current.id)this.pending.delete(key)},onExit:()=>{clearInterval(client.monitor);release()}});
    client.release=release;client.signature=signature(current);client.session=crypto.randomUUID();this.clients.set(current.id,client);
    try{client.start();client.monitor=setInterval(()=>{this.reconcile()},300);await client.initialize(signal)}catch(e){run.output=client.log;this.stop(current.id);throw e}
    result={passed:true,connected:current.id,serverInfo:client.serverInfo,toolCount:client.tools.length};
   }else{
    const c=this.clients.get(current.id);if(!c?.alive||c.session!==p.session||c.stale||!current.approvedTools.includes(p.tool))throw Error('Tool access or server session changed; request a fresh preview');
    const response=await c.request('tools/call',{name:p.tool,arguments:p.arguments},signal,current.timeoutSeconds*1000);result={passed:response?.isError!==true,isError:response?.isError===true,result:compact(response)};
   }
   run.status=result.passed===false?'failed':'passed';run.result=result;outcome=result;return result;
  }catch(e){run.status=signal?.aborted?'cancelled':'failed';run.error=redact(e.message);outcome={error:run.error};throw e}
  finally{run.finished=new Date().toISOString();save();this.busy.delete(current.id);this.core.log('linked-project-result',JSON.stringify({id:run.id,project:run.project,status:run.status,error:run.error}));try{this.core.agentTasks?.afterApproval('linked',id,outcome||{error:'Unknown execution outcome; inspect state'})}catch(e){this.core.log('task-error',e.message)}}
 }
}
