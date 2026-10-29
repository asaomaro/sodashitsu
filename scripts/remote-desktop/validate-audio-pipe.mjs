import {DesktopAudioPipeBinary} from '../../packages/client-core/dist/desktop/DesktopAudioPipeBinary.node.js';
import {DesktopAudioPipe} from '../../packages/client-core/dist/desktop/DesktopAudioPipe.node.js';
import {desktopOwnedChild} from '../../packages/client-core/dist/desktop/DesktopOwnedChild.node.js';
import {desktopWindowsPowerShell} from '../../packages/client-core/dist/desktop/DesktopWindowsPowerShell.node.js';
import {spawn} from 'node:child_process';import {once} from 'node:events';import {unlink,rmdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const binary=new DesktopAudioPipeBinary();let fixture;
const translate=async path=>process.platform==='win32'?path:(await desktopOwnedChild('/usr/bin/wslpath',['-u',path],'',{timeout:3000,limit:8192})).trim();
try{
 await binary.prepare();
 const scriptPath=new URL('./build-audio-pipe-fixture.ps1',import.meta.url);const {fileURLToPath}=await import('node:url');const script=process.platform==='win32'?fileURLToPath(scriptPath):(await desktopOwnedChild('/usr/bin/wslpath',['-w',fileURLToPath(scriptPath)],'',{timeout:3000,limit:8192})).trim();
 const built=JSON.parse((await desktopOwnedChild(process.platform==='win32'?desktopWindowsPowerShell(process.env.SystemRoot):'/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],'',{timeout:30000,limit:16384})).replace(/^\uFEFF/,''));
 assert.match(built.directory,/\\soda-audio-fixture-[a-f0-9]{32}$/);assert.equal(built.binary,built.directory+'\\audio-fixture.exe');fixture={binary:await translate(built.binary),directory:await translate(built.directory)};
 for(const mode of ['audio','microphone','audio-close','audio-reject','heartbeat-loss']){const kind=mode==='microphone'?'microphone':'audio';
  const server=spawn(fixture.binary,[['audio-reject','heartbeat-loss'].includes(mode)?'audio-close':mode],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});const serverClosed=once(server,'close');let lines='',readLine;
  server.stdout.on('data',b=>{lines+=b.toString();readLine?.();});server.stderr.resume();
  const line=async()=>{while(!lines.includes('\n'))await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture line timeout')),6000);readLine=()=>{clearTimeout(timer);resolve();};});const at=lines.indexOf('\n'),s=lines.slice(0,at).trim();lines=lines.slice(at+1);return s;};
  let bridge;
  try{
   const name=await line();bridge=new DesktopAudioPipe(binary,kind,()=>true);bridge.on('error',()=>{});const pid=await bridge.ready;assert(pid>0);server.stdin.write(pid+'\n');const bytes=[];let total=0;
   bridge.on('data',b=>{bytes.push(Buffer.from(b));total+=b.length;});assert(bridge.connect(name));
   const expected=Buffer.from(Array.from({length:kind==='audio'?16384:16},(_,i)=>i%256));
   const deadline=Date.now()+5000;while(total<expected.length){assert(Date.now()<deadline,'binary receive timed out');await new Promise(r=>setTimeout(r,10));}assert.deepEqual(Buffer.concat(bytes),expected);
   if(kind==='microphone')await new Promise((resolve,reject)=>bridge.write(Buffer.from(Array.from({length:1932},(_,i)=>i%256)),e=>e?reject(e):resolve()));
   assert.equal(await line(),'authenticated-binary-ok');if(['audio-close','audio-reject','heartbeat-loss'].includes(mode)){if(mode==='audio-close')bridge.destroy();else if(mode==='audio-reject')bridge.child.stdin.write(Buffer.concat([Buffer.from([2,140,7,0,0]),Buffer.alloc(1932)]));else clearInterval(bridge.heartbeat);assert.equal(await line(),'owner-close-ok');await bridge.childClosed;server.stdin.end();}else server.stdin.end('finish\n');assert.equal((await serverClosed)[0],0);bridge.destroy();await bridge.childClosed;console.log(mode+': actual Windows PID + partial binary transport/owned close PASS');
  }finally{bridge?.destroy();if(bridge)await bridge.childClosed;if(server.exitCode===null){server.kill();await serverClosed;}}
 }
}finally{await binary.close();if(fixture){await unlink(fixture.binary);await rmdir(fixture.directory);}}
