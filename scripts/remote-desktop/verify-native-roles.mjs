import {mkdtemp,mkdir,readFile,writeFile,cp,rm,readdir,unlink,stat,link} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
if(process.platform!=='win32')throw Error('Synthetic CLR verification requires Windows');
const run=promisify(execFile),source=dirname(fileURLToPath(import.meta.url)),base=await mkdtemp(join(process.env.LOCALAPPDATA,'nr-')),sdk=join(base,'sdk');await mkdir(sdk);
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const policy=await readFile(join(source,'EndpointAclPolicy.ps1'),'utf8'),builder=await readFile(join(source,'build-native-role.ps1'),'utf8'),marker='$base=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)';assert.equal(builder.split(marker).length,2);
// Install the fixture guards after JSON autoloads Utility (which exports Get-FileHash).
const requestMarker='$request=[Console]::In.ReadToEnd()|ConvertFrom-Json';assert.equal(builder.split(requestMarker).length,2);
const unavailable="function Get-Acl { throw 'optional ACL module is unavailable' }; function Get-FileHash { throw 'optional hash module is unavailable' }";
const code=policy+'\n'+builder.replace(marker,'$base='+quote(base)).replace(requestMarker,requestMarker+'\n'+unavailable),system=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
let selectedHost;
async function build(operation,role){
 const pending=execFile(system,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{timeout:65000,maxBuffer:65536,windowsHide:true,encoding:'utf8',env:{...process.env,PSModulePath:join(base,'unavailable-modules')}});
 pending.stdin.end(JSON.stringify({operation,role,source:sdk,...(operation==='module'?{expectedHost:selectedHost.directory.split(/[\\/]/).at(-1).slice(5),expectedHash:selectedHost.sha256}:{})}));const result=await new Promise((resolve,reject)=>{let stdout='',stderr='';pending.stdout.on('data',data=>stdout+=data);pending.stderr.on('data',data=>stderr+=data);pending.on('error',reject);pending.on('close',status=>status===0?resolve(stdout):reject(Error('Generated native builder failed: '+stderr)));});const parsed=JSON.parse(result.replace(/^\uFEFF/,''));if(operation==='host')selectedHost=parsed;return parsed;
}
const maps={'user-audio':{entry:'public static class SodaDesktopUserAudioRole',files:['WindowsUserAudioRole.cs','WindowsDesktopAudio.cs','WindowsDesktopPipeKernel.cs'],marker:'soda-user-audio-preflight-v1'},copy:{entry:'namespace Sodashitsu.NativeDrag {internal static class NativeDragWorker',files:['WindowsNativeDragLease.cs','WindowsNativeDragStreams.cs','WindowsNativeDragDataObject.cs','WindowsNativeDragPackets.cs','WindowsNativeDragPump.cs','WindowsNativeDragSlot.cs','WindowsNativeDragWorker.cs'],marker:'soda-native-copy-preflight-v1'},audio:{entry:'public static class SodaDesktopAudioPipeBridge',files:['WindowsAudioPipeBridge.cs'],marker:'soda-audio-pipe-preflight-v1'},selection:{entry:'namespace Sodashitsu.NativeDrag {public static class ExplorerSelectionWorker',files:['WindowsExplorerSelection.cs','WindowsExplorerSelectionWorker.cs'],marker:'soda-explorer-selection-preflight-v1'}};
const args=(role,built,extra=[])=>['--role',role,'--module',dirname(built.directory+'\\x').split(/[\\/]/).at(-1).slice(5),'--sha256',built.sha256,...extra];
try{
 await cp(join(source,'WindowsNativeRoleHost.cs'),join(sdk,'WindowsNativeRoleHost.cs'));
 for(const [role,map] of Object.entries(maps)){
  for(const file of map.files)await writeFile(join(sdk,file),'// Generated inert fixture');
  await writeFile(join(sdk,map.files.at(-1)),`using System;using System.Threading;${map.entry} {public static int Main(string[] args){Console.WriteLine("${role}:"+Thread.CurrentThread.GetApartmentState());return 0;}}${map.entry.startsWith('namespace')?'}':''}`);
 }
 const host=await build('host','copy');assert.deepEqual((await readdir(host.directory)).filter(name=>name.startsWith('role-')),[]);
 for(const [role,map] of Object.entries(maps)){
  const built=await build('module',role);assert.equal(built.binary,host.binary);assert.equal(built.hostSha256,host.sha256);
  const command=args(role,built),result=await run(host.binary,command,{timeout:10000,maxBuffer:8192,windowsHide:true});assert.equal(result.stdout.trim(),role+':'+((role==='audio'||role==='user-audio')?'MTA':'STA'));
  await assert.rejects(run(host.binary,args('unknown',built),{timeout:10000,maxBuffer:8192,windowsHide:true}));
  await assert.rejects(run(host.binary,[...command.slice(0,5),'0'.repeat(64)],{timeout:10000,maxBuffer:8192,windowsHide:true}));
  const module=join(built.directory,role+'.dll'),alias=join(base,role+'-linked.dll');await link(module,alias);await assert.rejects(run(host.binary,command,{timeout:10000,maxBuffer:8192,windowsHide:true}));await unlink(alias);const bytes=await readFile(module);bytes[bytes.length-1]^=1;await writeFile(module,bytes);await assert.rejects(run(host.binary,command,{timeout:10000,maxBuffer:8192,windowsHide:true}));
  for(const file of map.files)await cp(join(source,file),join(sdk,file));
  const actual=await build('module',role),preflight=await run(host.binary,args(role,actual,['--preflight']),{timeout:10000,maxBuffer:8192,windowsHide:true});assert.equal(preflight.stdout.trim(),map.marker);
 }
 await writeFile(join(host.directory,'host.sha256'),'0'.repeat(64));const repaired=await build('host','copy');assert.notEqual(repaired.binary,host.binary);assert.equal((await stat(host.binary)).isFile(),true);
 await unlink(join(dirname(repaired.directory),'host.current'));const afterInterruptedPointer=await build('host','copy');assert.notEqual(afterInterruptedPointer.binary,repaired.binary);assert.equal((await stat(repaired.binary)).isFile(),true);
 console.log(JSON.stringify({roles:4,apartments:'copy/selection STA; audio/user-audio MTA',unselectedModulesAbsentBeforeBuild:true,unknownRoleRejected:true,wrongDigestRejected:true,tamperingRejected:true,hardlinksRejected:true,immutableRepair:true,interruptedPointerRecovery:true,actualRolePreflightOnly:true,optionalAclAndHashCmdletsRequired:false,desktopOrAudioDeviceCalls:false}));
}finally{await rm(base,{recursive:true,force:true});}
