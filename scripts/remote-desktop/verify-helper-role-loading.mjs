// Compile the actual entry point in private fixtures; ValidateOnly returns before every desktop/device operation.
import {mkdtemp,mkdir,cp,rename,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
if(process.platform!=='win32')throw Error('Windows generated helper compilation only');
const run=promisify(execFile),source=dirname(fileURLToPath(import.meta.url)),root=await mkdtemp(join(process.env.LOCALAPPDATA,'hr-')),sdk=join(root,'sdk'),held=join(root,'held');await mkdir(sdk);await mkdir(held);
const groups={audio:['WindowsDesktopAudio.cs'],microphone:['WindowsDesktopMicrophone.cs'],pipe:['WindowsDesktopPipeKernel.cs'],richClipboard:['WindowsDesktopRichClipboard.cs'],codecs:['WindowsCodecProbe.cs'],virtualDisplay:['WindowsVirtualDisplay.cs','WindowsVirtualDisplayNative.cs','WindowsVirtualDisplayChannel.cs'],protectedDesktop:['WindowsProtectedEpoch.cs','WindowsProtectedScope.cs','WindowsProtectedScopeNative.cs','WindowsProtectedHandshake.cs','WindowsProtectedWorker.cs']};
const flags={audio:'SODA_DESKTOP_LOAD_AUDIO',microphone:'SODA_DESKTOP_LOAD_MICROPHONE',richClipboard:'SODA_DESKTOP_LOAD_RICH_CLIPBOARD',codecs:'SODA_DESKTOP_LOAD_CODECS'};
const checks=['validate-audio.ps1','validate-microphone.ps1','WindowsAudioChecks.cs','WindowsMicrophoneChecks.cs','EndpointAclPolicy.ps1','check-endpoint-acl.ps1'];
const core=['windows-helper.ps1','WindowsDesktopHost.cs','WindowsDesktopUnlock.cs','WindowsResourceFence.cs'],all=Object.keys(groups);
const cases=[['none',[]],['audio',['audio','pipe']],['microphone',['microphone','pipe']],['clipboard',['richClipboard']],['codecs',['codecs']],['virtual',['virtualDisplay']],['protected',['protectedDesktop']],['all',all],['invalid-env',[]]];
try{
 for(const name of [...core,...checks,...Object.values(groups).flat()])await cp(join(source,name),join(sdk,name));
 for(const [name,enabled] of cases){
  const missing=Object.entries(groups).filter(([role])=>!enabled.includes(role)).flatMap(([,files])=>files);
  for(const file of missing)await rename(join(sdk,file),join(held,file));
  try{
   const env={...process.env};for(const [role,flag] of Object.entries(flags))env[flag]=name==='invalid-env'?'true':enabled.includes(role)?'1':'0';
   const argv=['-NoLogo','-NoProfile','-NonInteractive','-STA','-File',join(sdk,'windows-helper.ps1'),'-ValidateOnly'];if(enabled.includes('virtualDisplay'))argv.push('-AllowVirtualDisplay');if(enabled.includes('protectedDesktop'))argv.push('-AllowElevated');
   const result=await run(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),argv,{env,timeout:30000,maxBuffer:16384,windowsHide:true,encoding:'utf8'});
   assert.ok(result.stdout.includes('desktop_helper_compiled'),name);const prefix='desktop_helper_roles:',line=result.stdout.split(/\r?\n/).find(line=>line.startsWith(prefix));assert.ok(line,name);const actual=JSON.parse(line.slice(prefix.length));assert.deepEqual(actual,Object.fromEntries(all.map(role=>[role,enabled.includes(role)])),name);
  }finally{for(const file of missing)await rename(join(held,file),join(sdk,file));}
 }
 for(const file of ['validate-audio.ps1','validate-microphone.ps1'])await run(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',join(sdk,file)],{timeout:45000,maxBuffer:16384,windowsHide:true,encoding:'utf8'});
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 const guard="$null=Get-Item -LiteralPath "+quote(root)+"; function global:Get-Acl { throw 'optional ACL cmdlet is unavailable' }; & "+quote(join(sdk,'check-endpoint-acl.ps1'))+" -Path "+quote(root);
 const acl=await run(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(guard,'utf16le').toString('base64')],{timeout:15000,maxBuffer:8192,windowsHide:true,encoding:'utf8'});assert.equal(acl.stdout.trim(),'endpoint_acl_valid');
 console.log(JSON.stringify({optionalAclCmdletRequired:false,generatedPipeChecks:true,cases:cases.length,unselectedSourcesPhysicallyAbsent:true,microphoneWithoutLoopbackAssembly:true,desktopAndDeviceCalls:false}));
}finally{await rm(root,{recursive:true,force:true});}
