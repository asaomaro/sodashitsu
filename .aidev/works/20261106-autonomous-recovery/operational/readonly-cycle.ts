import {execFile} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {desktopSigninCycle} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/src/desktop/DesktopSigninRuntime.ts';
import {DesktopEndpointStore} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/client-core/src/desktop/DesktopEndpointStore.node.ts';
import {DesktopSigninIdentity} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/src/desktop/DesktopSigninIdentity.ts';
import {readDesktopSigninEnrollment} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/src/desktop/DesktopSigninVault.node.ts';
const owner='S-1-5-21-2255109513-3773794534-3440117263-1001';
const context={type:'signin_context',ownerSid:owner,packageRoot:"C:\\Program Files\\Sodashitsu\\DesktopSignin-68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d",stateDir:"C:\\Program Files\\Sodashitsu\\DesktopSigninData\\68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d\\runtime"};
export async function main(){
 const controller=new AbortController(),began=performance.now(),traces=[];
 async function measured(operation,fn){const at=performance.now();try{const result=await fn();traces.push({operation,atMs:Math.round(at-began),ms:Math.round(performance.now()-at),ok:true});return result;}catch(e){traces.push({operation,atMs:Math.round(at-began),ms:Math.round(performance.now()-at),ok:false});throw e;}}
 let cancelled=false;const timer=setTimeout(()=>{cancelled=true;controller.abort();},12000);let ok=false,outcome='failure';
 try{
  outcome=await desktopSigninCycle(owner,controller.signal,{
   now:()=>performance.now(),unsafeStop:()=>process.exit(1),
   // This is a readonly timing fixture: no real presence authorization, endpoint,
   // connector, socket, pixels, input, or enrollment mutation is created.
   presence:()=>({ready:async()=>context,active:()=>!controller.signal.aborted,close(){},settled:async()=>{}}),
   enrollment:(sid,scope)=>measured('enrollment',()=>readDesktopSigninEnrollment(sid,scope)),
   store:()=>{const s=new DesktopEndpointStore({stateDir:context.stateDir,writeAllowed:()=>false,checkWindowsPaths:paths=>new Promise((resolve,reject)=>{execFile('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',"C:\\Program Files\\Sodashitsu\\.vault-readonly-f39904f8c6d443e8b169fe76a23f3d5f\\check-endpoint-acl.ps1",'-PathsBase64',Buffer.from(JSON.stringify(paths),'utf8').toString('base64')],{timeout:5000,maxBuffer:128,windowsHide:true,env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}},(error,stdout)=>{if(error||stdout.trim()!=='endpoint_acl_valid'){traces.push({operation:'batch-rejected',code:typeof error?.code==='number'?error.code:typeof error?.code==='string'?error.code:'marker'});reject(Error('Batch ACL unavailable'));}else resolve();});})});return {status:()=>measured('status',()=>s.status()),verifiedEndpoint:(...args)=>s.verifiedEndpoint(...args),close:()=>s.close(),settled:()=>s.settled()};},
   identity:options=>new DesktopSigninIdentity(options),
   endpoint:()=>({start:()=>Promise.reject(Error('Readonly fixture')),clientGone(){},close:async()=>{}}),
   connector:()=>({close(){}}),
  });ok=outcome==='ended'&&cancelled;
 }catch{}finally{clearTimeout(timer);controller.abort();await writeFile("C:\\Program Files\\Sodashitsu\\.vault-readonly-f39904f8c6d443e8b169fe76a23f3d5f\\result.json",JSON.stringify({fixture:'readonly-cycle-with-generated-presence',ok,outcome,elapsedMs:Math.round(performance.now()-began),traces})+'\n',{flag:'wx'});}
}
