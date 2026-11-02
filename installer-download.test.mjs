import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

// Exercise the actual installer function in Windows PowerShell/.NET Framework,
// including streaming transport failures; no installer UI or real dependencies.
test('installer streaming download, cache, integrity, truncation and cancellation', {skip:process.platform!=='win32',timeout:60000}, async()=>{
  const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-download-'));
  const source=fs.readFileSync(new URL('./installer/setup.ps1',import.meta.url),'utf8');
  const functions=source.slice(source.indexOf('function Download('),source.indexOf('function Run('));
  assert.ok(functions.includes('CopyToAsync'));
  const script=path.join(root,'download.ps1');
  fs.writeFileSync(script,`param([string]$Url,[string]$Target,[string]$Hash,[long]$Expected,[switch]$Cancel)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Net.Http
$status=@{Text=''};$progress=@{Value=0};$script:pumps=0
function Pump {$script:pumps++;if($Cancel -and $script:pumps -ge 4){throw 'Cancelled fixture'}}
function Check-Hash($file,$sha){if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $sha){throw 'Download verification failed'}}
${functions}
try{Download $Url $Target $Hash $Expected;Write-Output 'DOWNLOAD_OK'}catch{Write-Output $_.Exception.Message;exit 1}
`);
  const bytes=crypto.randomBytes(4*1024*1024),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  let requests=0;
  const server=http.createServer((req,res)=>{
    requests++;
    res.writeHead(200,{'Content-Length':bytes.length});
    if(req.url==='/complete'){res.end(bytes);return;}
    let offset=0;
    const timer=setInterval(()=>{
      res.write(bytes.subarray(offset,offset+8192));offset+=8192;
      if(req.url==='/broken'&&offset>=16384){res.destroy();clearInterval(timer);}
      else if(offset>=bytes.length){res.end();clearInterval(timer);}
    },10);
    res.on('close',()=>clearInterval(timer));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const run=(route,target,expected=bytes.length,digest=hash,cancel=false)=>new Promise((resolve,reject)=>{
    const env={...process.env,PSModulePath:path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/Modules')};
    const child=spawn(ps,['-NoProfile','-NonInteractive','-File',script,'-Url',`http://127.0.0.1:${server.address().port}/${route}`,'-Target',target,'-Hash',digest,'-Expected',String(expected),...(cancel?['-Cancel']:[])],{windowsHide:true,env});
    let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
    const timer=setTimeout(()=>{child.kill();reject(Error('Download test timed out: '+output));},15000);
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{clearTimeout(timer);resolve({code,output})});
  });
  try{
    const target=path.join(root,'download.bin');
    assert.deepEqual(await run('complete',target),{code:0,output:'DOWNLOAD_OK\r\n'});
    assert.deepEqual(fs.readFileSync(target),bytes);
    assert.equal(fs.existsSync(target+'.partial'),false);
    const before=requests;
    assert.equal((await run('broken',target)).code,0);
    assert.equal(requests,before,'verified cache must not contact server');
    for(const [name,route,size,digest,cancel] of [
      ['size','complete',bytes.length+1,hash,false],
      ['hash','complete',bytes.length,'0'.repeat(64),false],
      ['broken','broken',bytes.length,hash,false],
      ['cancel','slow',bytes.length,hash,true],
    ]){
      const destination=path.join(root,name+'.bin');
      fs.writeFileSync(destination,'existing file');
      const result=await run(route,destination,size,digest,cancel);
      assert.equal(result.code,1,result.output);
      assert.equal(fs.readFileSync(destination,'utf8'),'existing file','failed download must not replace destination');
      if(cancel)assert.match(result.output,/Cancelled fixture/);
    }
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('GUI installer drains child stdout and stderr and reports nonzero exits', {skip:process.platform!=='win32',timeout:30000}, async()=>{
  const root=fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-installer-child-'));
  const source=fs.readFileSync(new URL('./installer/setup.ps1',import.meta.url),'utf8');
  const run=source.slice(source.indexOf('function Run('),source.indexOf('Add-Type -AssemblyName System.Net.Http'));
  const childFile=path.join(root,'child.mjs');
  fs.writeFileSync(childFile,"process.stdout.write('OUT'.repeat(100000));process.stderr.write('ERR'.repeat(100000));process.exitCode=Number(process.argv[2]);");
  const script=path.join(root,'run.ps1');
  fs.writeFileSync(script,`param([string]$Node,[string]$Child,[int]$Code)
$ErrorActionPreference='Stop'
function Pump {}
${run}
try{Run $Node ('"'+$Child+'" '+$Code);Write-Output 'CHILD_OK'}catch{Write-Output $_.Exception.Message;exit 1}
`);
  for(const code of [0,7]){
    const result=await new Promise((resolve,reject)=>{
      const p=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-File',script,'-Node',process.execPath,'-Child',childFile,'-Code',String(code)],{windowsHide:true});
      let text='';p.stdout.on('data',b=>text+=b);p.stderr.on('data',b=>text+=b);
      const timer=setTimeout(()=>{p.kill();reject(Error('Hidden child failed to finish'))},10000);
      p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',exit=>{clearTimeout(timer);resolve({exit,text})});
    });
    assert.equal(result.exit,code===0?0:1,result.text.slice(-1000));
    assert.ok(result.text.includes('OUT'.repeat(100000)));
    assert.ok(result.text.includes('ERR'.repeat(100000)));
    assert.match(result.text,code===0?/CHILD_OK/:/exited with code 7/);
  }
});
