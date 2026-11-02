import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const localVoiceEngines=['omnivoice','omnivoice-subprocess','omnivoice-gguf','voxcpm2','cosyvoice','cosyvoice-gguf','kittentts','moss-tts-nano','mlx-audio','gpt-sovits','sherpa-onnx','pocket-tts','supertonic3','indextts'];

export const dyanariVoice=Object.freeze({name:'Dyanari — Velvet British',engine:'omnivoice',seed:424242,speed:0.92,sampleText:"Here's a quick sample of this voice so you can hear how it sounds.",instruct:'female, young adult, low pitch, whisper, british accent',description:'An adult British woman with a warm, velvety low voice, intimate, confident and sultry delivery; softly breathy, unhurried and clearly articulated.',picks:{Gender:'female',Age:'young adult',Pitch:'low pitch',Style:'whisper',EnglishAccent:'british accent',ChineseDialect:'Auto'}});
export function validateStudio(s){
 if(typeof s.voiceStudioEnabled!=='boolean')throw Error('Invalid VoiceStudio permission');
 if(!Number.isInteger(s.voiceStudioPort)||s.voiceStudioPort<1024||s.voiceStudioPort>65535)throw Error('Invalid VoiceStudio loopback port');
 if(!localVoiceEngines.includes(s.voiceStudioEngine))throw Error('Choose a supported local VoiceStudio engine');
 if(typeof s.voiceStudioProfile!=='string'||!/^[a-z0-9_-]{0,100}$/i.test(s.voiceStudioProfile))throw Error('Invalid VoiceStudio profile id');
 if(!Number.isFinite(s.voiceStudioSpeed)||s.voiceStudioSpeed<0.5||s.voiceStudioSpeed>1.5)throw Error('Voice speed must be 0.5–1.5');
 if(!['windows','voicestudio'].includes(s.speechProvider))throw Error('Invalid speech provider');
}
export function waveInfo(b){
 if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('VoiceStudio returned invalid WAV audio');
 let samples=0,rate=0;for(let i=12;i+8<=b.length;){const n=b.readUInt32LE(i+4),tag=b.toString('ascii',i,i+4);if(i+8+n>b.length)throw Error('Truncated WAV audio');if(tag==='fmt '&&n>=16)rate=b.readUInt32LE(i+16);if(tag==='data')samples+=n;i+=8+n+(n%2)}
 if(!samples||!rate)throw Error('VoiceStudio returned empty WAV audio');return {bytes:b.length,duration:samples/rate};
}
export class VoiceStudio {
 constructor(core,{home=process.env.DYANARI_HOME||path.dirname(fileURLToPath(import.meta.url)),fetcher=fetch}={}){this.core=core;this.home=home;this.fetcher=fetcher;this.child=null;this.active=null;this.lastError='';this.root=path.join(process.env.USERPROFILE||home,'.dyanari','voicestudio');this.watchTimer=setInterval(()=>{if(this.child||this.installer){try{this.reconcile()}catch{this.stop()}}},1000);this.watchTimer.unref();}
 get url(){return `http://127.0.0.1:${this.core.settings.voiceStudioPort}`}
 require(){if(!this.core.settings.voiceStudioEnabled)throw Error('VoiceStudio is OFF')}
 async request(route,{method='GET',body,signal,audio=false,timeout=30000}={}){
  this.require();const combined=AbortSignal.any([AbortSignal.timeout(timeout),...(signal?[signal]:[])]);
  const r=await this.fetcher(this.url+route,{method,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,headers:body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:undefined,redirect:'error',signal:combined});
  const max=audio?32*1024*1024:4*1024*1024;let total=0;const parts=[];for await(const p of r.body){total+=p.length;if(total>max){await r.body.cancel?.().catch(()=>{});throw Error('VoiceStudio response too large')}parts.push(p)}const data=Buffer.concat(parts);
  if(!r.ok)throw Error(`VoiceStudio ${r.status}: ${data.toString('utf8').slice(0,1200)}`);
  this.require();if(audio){waveInfo(data);return data}return JSON.parse(data.toString('utf8'));
 }
 async state(){const base={enabled:this.core.settings.voiceStudioEnabled,url:this.url,installed:fs.existsSync(path.join(this.root,'INSTALL.json')),owned:!!this.child,installing:!!this.installer,active:!!this.active,identity:dyanariVoice,lastError:this.lastError};if(!base.enabled)return {...base,ready:false};try{return {...base,ready:true,health:await this.request('/health',{timeout:4000})}}catch(e){return {...base,ready:false,error:e.message}}}
 async catalog(){this.require();const profiles=await this.request('/profiles'),raw=await this.request('/engines',{timeout:60000});const rows=raw.tts?.backends||raw.backends||raw.engines||(Array.isArray(raw)?raw:[]);return {profiles,engines:rows.filter(e=>localVoiceEngines.includes(e.id)).map(e=>({...e,name:e.name||e.display_name||e.id}))}}
 async start(){
  this.require();if((await this.state()).ready)return {started:false,connected:true};
  const source=path.join(this.root,'source'),python=path.join(source,'.venv','Scripts','python.exe');if(!fs.existsSync(python))throw Error('Run setup-voicestudio.ps1 first; see VOICESTUDIO.md');
  if(this.child)throw Error('VoiceStudio is starting; refresh its status');
  const data=path.join(this.core.dir,'voicestudio');fs.mkdirSync(data,{recursive:true});const log=fs.openSync(path.join(data,'service.log'),'a');
  try{this.child=spawn(python,[path.join(path.dirname(fileURLToPath(import.meta.url)),'voicestudio-launch.py'),source],{cwd:source,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,OMNIVOICE_DATA_DIR:data,OMNIVOICE_CACHE_DIR:path.join(this.root,'models'),HF_HUB_CACHE:path.join(this.root,'models'),HF_HUB_DISABLE_SYMLINKS:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',OMNIVOICE_MODEL:path.join(this.root,'models','models--k2-fsa--OmniVoice','snapshots','c5fdb5ccb189668d56333f77ba2629f4cd7535f4'),OMNIVOICE_ASR_BACKEND:'faster-whisper',ASR_MODEL_FASTER:'Systran/faster-whisper-base',OMNIVOICE_DEVICE:'cpu',OMNIVOICE_HOST:'127.0.0.1',OMNIVOICE_PORT:String(this.core.settings.voiceStudioPort),OMNIVOICE_FRONTEND_DIST:path.join(source,'frontend','dist')}});const p=this.child;p.once('error',e=>{this.lastError=e.message;if(this.child===p)this.child=null});p.once('exit',()=>{if(this.child===p)this.child=null});}finally{fs.closeSync(log)}return {starting:true};
 }
 install({approved=false,acceptTerms=false}={}){
  this.require();if(!this.core.settings.internet)throw Error('Internet is OFF; enable it for VoiceStudio setup downloads');if(approved!==true)throw Error('Approve the pinned VoiceStudio installation first');if(this.installer||this.child||this.active)throw Error('Stop the owned voice service/operation before setup');
  const script=fs.existsSync(path.join(this.home,'setup-voicestudio.ps1'))?path.join(this.home,'setup-voicestudio.ps1'):path.join(path.dirname(fileURLToPath(import.meta.url)),'setup-voicestudio.ps1');if(!fs.existsSync(script))throw Error('VoiceStudio setup script is missing');const dir=path.join(this.core.dir,'voicestudio');fs.mkdirSync(dir,{recursive:true});const log=fs.openSync(path.join(dir,'setup.log'),'a');const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Data',this.core.dir];if(acceptTerms===true)args.push('-DownloadVoiceModel','-AcceptNoncommercialTerms');
  try{const p=spawn('powershell.exe',args,{windowsHide:true,stdio:['ignore',log,log]});this.installer=p;this.lastError='';p.once('error',e=>{this.lastError=e.message;if(this.installer===p)this.installer=null});p.once('exit',code=>{if(code!==0)this.lastError=`VoiceStudio setup exited ${code}; see voicestudio/setup.log`;if(this.installer===p)this.installer=null});}finally{fs.closeSync(log)}return {installing:true,termsAcceptedForLocalModel:acceptTerms===true};
 }
 open(){this.require();const p=spawn('explorer.exe',[this.url],{windowsHide:true,stdio:'ignore'});p.on('error',e=>{this.lastError=e.message});return {requestedBrowserOpen:true,url:this.url}}
 kill(p){if(!p)return;if(process.platform==='win32'){const k=spawn('taskkill.exe',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});k.on('error',()=>p.kill())}else p.kill()}
 reconcile(){const s=this.core.settings;if(!s.voiceStudioEnabled)this.stop();else if(!s.internet&&this.installer){this.kill(this.installer);this.installer=null;this.lastError='Setup stopped: Internet permission revoked'}}
 async operation(fn){this.require();if(this.active)throw Error('Another voice operation is active');const c=new AbortController();this.active=c;c.signal.addEventListener('abort',()=>{if(this.child)this.stop()},{once:true});this.core.controllers.add(c);try{return await fn(c.signal)}finally{this.core.controllers.delete(c);if(this.active===c)this.active=null}}
 async design(){const p=await this.operation(async signal=>{const f=new FormData();for(const [k,v] of Object.entries({name:dyanariVoice.name,ref_text:dyanariVoice.sampleText,kind:'design',language:'en',seed:String(dyanariVoice.seed),instruct:dyanariVoice.instruct,vd_states:JSON.stringify(dyanariVoice.picks),engine:dyanariVoice.engine,design_recipe:JSON.stringify({version:1,description:dyanariVoice.description,picks:dyanariVoice.picks})}))f.set(k,v);const p=await this.request('/profiles',{method:'POST',body:f,signal,timeout:300000});if(!/^[a-z0-9_-]{1,100}$/i.test(p.id||''))throw Error('VoiceStudio did not return a profile id');return p});this.core.save({voiceStudioProfile:p.id,voiceStudioEngine:dyanariVoice.engine,voiceStudioSpeed:dyanariVoice.speed,speechProvider:'voicestudio'});return p}
 async sample(){return this.operation(signal=>{const id=this.core.settings.voiceStudioProfile;if(!id)throw Error('Create or select Dyanari’s saved voice first');return this.request(`/profiles/${encodeURIComponent(id)}/audio`,{audio:true,signal,timeout:300000})})}
 async speak(text,signal){if(typeof text!=='string'||!text.trim()||text.length>4096)throw Error('VoiceStudio speech requires 1–4096 characters');return this.operation(own=>{const s=this.core.settings;if(!s.voiceStudioProfile)throw Error('Create or select a saved VoiceStudio identity first');return this.request('/v1/audio/speech',{method:'POST',body:{model:s.voiceStudioEngine,voice:s.voiceStudioProfile,input:text,response_format:'wav',speed:s.voiceStudioSpeed,language:'en',denoise:true},audio:true,signal:AbortSignal.any([own,...(signal?[signal]:[])]),timeout:300000})})}
 async transcribe(base64){if(typeof base64!=='string'||base64.length>900000)throw Error('Choose a short audio clip under 650 KB');return this.operation(signal=>{const b=Buffer.from(base64,'base64');waveInfo(b);const f=new FormData();f.set('file',new Blob([b],{type:'audio/wav'}),'recording.wav');f.set('model','whisper-1');f.set('language','en');return this.request('/v1/audio/transcriptions',{method:'POST',body:f,signal,timeout:180000})})}
 cancel(){this.active?.abort();}
 stop(){this.cancel();const p=this.child;this.child=null;this.kill(p);this.kill(this.installer);this.installer=null;return {stoppedOwnedService:!!p,externalServiceUntouched:!p}}
}
