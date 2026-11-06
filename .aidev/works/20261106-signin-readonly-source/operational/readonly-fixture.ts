import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {desktopSigninCycle} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/src/desktop/DesktopSigninRuntime.ts';
import {DesktopSigninSource} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/src/desktop/DesktopSigninSource.ts';
import {DesktopSigninIdentity} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/src/desktop/DesktopSigninIdentity.ts';
const owner='S-1-5-21-2255109513-3773794534-3440117263-1001';
const context={type:'signin_context',ownerSid:owner,packageRoot:"C:\\Program Files\\Sodashitsu\\.vault-readonly-e73e0d4e82394b39ac5695195050f69e",stateDir:"C:\\Program Files\\Sodashitsu\\DesktopSigninData\\68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d\\runtime"};
const root=context.packageRoot,stateDir=context.stateDir;
async function rejected(name,payload){return new Promise(resolve=>{
 const child=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',root+'\\scripts\\remote-desktop\\read-signin-enrollment.ps1','-OwnerSid',owner,'-ReadonlySource','-StateDir',stateDir],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:'C:\\Windows\\System32',env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
 let ready=false,tail='',invalid=false,timedOut=false;const started=performance.now();
 const timer=setTimeout(()=>{timedOut=true;child.kill();},8000),confirm=setTimeout(()=>process.exit(1),12000);
 child.stdout.on('data',bytes=>{try{tail+=bytes.toString('utf8');bytes.fill(0);if(tail.length>256)throw Error();if(!ready&&tail.includes('\n')){if(tail.trim()!=='{"ready":true}')throw Error();ready=true;tail='';child.stdin.write(payload);}else if(ready&&tail.length)invalid=true;}catch{invalid=true;child.kill();}});
 child.stderr.on('data',bytes=>bytes.fill(0));child.stdin.on('error',()=>{});child.on('error',()=>{invalid=true;});
 child.on('close',code=>{clearTimeout(timer);clearTimeout(confirm);resolve({name,ok:ready&&!invalid&&!timedOut&&code===1,code,ready,timedOut,ms:Math.round(performance.now()-started)});});
 });}

export async function main(){
 const controller=new AbortController(),began=performance.now(),traces=[];
 async function measured(operation,fn){const at=performance.now();try{const result=await fn();traces.push({operation,atMs:Math.round(at-began),ms:Math.round(performance.now()-at),ok:true});return result;}catch(e){traces.push({operation,atMs:Math.round(at-began),ms:Math.round(performance.now()-at),ok:false});throw e;}}
 let cancelled=false;const timer=setTimeout(()=>{cancelled=true;controller.abort();},20000);let ok=false,outcome='failure';
 try{
  outcome=await desktopSigninCycle(owner,controller.signal,{
   now:()=>performance.now(),unsafeStop:()=>process.exit(1),
   // Generated presence, finite nonnetwork endpoint/connector; readonly only.
   presence:()=>({ready:async()=>context,active:()=>!controller.signal.aborted,close(){},settled:async()=>{}}),
   source:(ctx,scope)=>{const s=new DesktopSigninSource(ctx,scope,{platform:'win32',shell:()=>process.env.SystemRoot+'\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',spawn:(...args)=>{const child=spawn(...args);child.stdout.on('data',bytes=>traces.push({operation:'stdout-size',size:bytes.length,atMs:Math.round(performance.now()-began)}));child.stderr.on('data',bytes=>traces.push({operation:'stderr-size',size:bytes.length,atMs:Math.round(performance.now()-began)}));child.on('close',code=>traces.push({operation:'child-close',code,atMs:Math.round(performance.now()-began)}));return child;}});return {ready:()=>measured('warmup',()=>s.ready()),enrollment:()=>measured('enrollment',()=>s.enrollment()),store:{status:()=>measured('status',()=>s.store.status()),verifiedEndpoint:(...args)=>s.store.verifiedEndpoint(...args),close:()=>s.store.close(),settled:()=>s.store.settled()},close:()=>s.close(),settled:()=>s.settled()};},
   enrollment:()=>Promise.reject(Error('Unused')),store:()=>{throw Error('Unused')},
   identity:options=>new DesktopSigninIdentity(options),endpoint:()=>({start:()=>Promise.reject(Error('Readonly fixture')),clientGone(){},close:async()=>{}}),connector:()=>({close(){}}),
  });ok=outcome==='ended'&&cancelled;
 }catch{}finally{clearTimeout(timer);controller.abort(); const cases=[];
 cases.push(await rejected('unknown-write-operation',JSON.stringify({seq:1,op:'protect',data:'AAAA'})+'\n'));
 cases.push(await rejected('foreign-acl-path',JSON.stringify({seq:1,op:'check-paths',paths:['C:\\Windows']})+'\n'));
 cases.push(await rejected('oversize-line','x'.repeat(90001)+'\n'));
await writeFile("C:\\Program Files\\Sodashitsu\\.vault-readonly-e73e0d4e82394b39ac5695195050f69e\\result.json",JSON.stringify({fixture:'readonly-shared-source-generated-presence',ok:ok&&cases.every(c=>c.ok),cases,outcome,elapsedMs:Math.round(performance.now()-began),traces})+'\n',{flag:'wx'});}
}