// Direct fixed compiler; no PowerShell/ExecutionPolicy changes, execution or device calls.
import {spawn} from 'node:child_process';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function compileFixture(output){
 if(process.platform!=='win32')throw Error('compile-requires-approved-Windows-slot');
 const root=dirname(fileURLToPath(import.meta.url)),sources=['Receiver.cs','Endpoint.cs','Probe.cs','DetectorChecks.cs'].map(f=>join(root,f));
 const native=resolve(root,'..');for(const f of ['WindowsDesktopPipeKernel.cs','WindowsDesktopMicrophone.cs','WindowsUserMicrophonePolicy.cs','WindowsUserMicrophoneRole.cs'])sources.push(join(native,f));
 await mkdir(output,{recursive:false,mode:0o700});const source={};for(const p of sources)source[p]=hash(await readFile(p));
 const compiler=join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe'),results=[];
 for(const [name,main] of [['receiver.exe','Phase3Receiver'],['probe.exe','Phase3Probe'],['generated-checks.exe','Phase3GeneratedChecks']]){
  const args=['/nologo','/noconfig','/warnaserror+','/target:winexe','/main:'+main,'/out:'+join(output,name),'/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Management.dll','/r:System.Web.Extensions.dll',...sources];
  // probe needs stdout; receiver is hidden even when elevated.
  if(name!=='receiver.exe')args[3]='/target:exe';
  const exitCode=await new Promise((resolve,reject)=>{const child=spawn(compiler,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let count=0;const timer=setTimeout(()=>{child.kill();reject(Error('compile-timeout'));},30000);for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{count+=b.length;if(count>32768)child.kill();});child.once('error',reject);child.once('close',code=>{clearTimeout(timer);resolve(code);});});
  results.push({name,exitCode});if(exitCode!==0)throw Error('fixture-compile-failed');
 }
 for(const p of sources)if(hash(await readFile(p))!==source[p])throw Error('source-changed-during-compile');
 const binaries={};for(const name of ['receiver.exe','probe.exe','generated-checks.exe'])binaries[name]=hash(await readFile(join(output,name)));
 await writeFile(join(output,'compile-receipt.json'),JSON.stringify({source,binaries,results,rawAudioStored:false,executed:false},null,2),{flag:'wx',mode:0o600});return{source,binaries};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error('one-new-output-directory-required');await compileFixture(resolve(process.argv[2]));}
