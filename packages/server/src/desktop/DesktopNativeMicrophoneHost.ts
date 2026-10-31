import {spawn,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {DesktopNativePlatform} from '@sodashitsu/protocol';
import {DesktopNativePcmPaths,type DesktopNativePcmPath} from './DesktopNativePcmPath.js';
export interface NativeMicrophoneLease {path:string;verify():Promise<void>;close():Promise<void>;}
/** One optional output process. No OS/library/device work before open(). */
export class DesktopNativeMicrophoneHost {
 private suspended=false;
 private current:{child:ChildProcess;closed:Promise<void>;closing?:Promise<void>;path?:DesktopNativePcmPath}|undefined;
 constructor(private paths=new DesktopNativePcmPaths(),private launch:typeof spawn=spawn,
  private command:(backend:DesktopNativePlatform)=>string[]=backend=>{
   if(backend==='linux-portal'&&process.platform==='linux')return ['/usr/bin/python3','-I',fileURLToPath(new URL('../../../../scripts/remote-desktop/linux-native-microphone.py',import.meta.url))];
   if(backend==='macos-sck'&&process.platform==='darwin')return [fileURLToPath(new URL('../../../../scripts/remote-desktop/macos-desktop-helper',import.meta.url)),'--microphone-worker'];
   throw Error('Native microphone unavailable');
  }){}
 async open(backend:DesktopNativePlatform,endpoint:string,pipeName:string,active:()=>boolean):Promise<NativeMicrophoneLease>{
  if(this.suspended||this.current||!active()||!endpoint||Buffer.byteLength(endpoint)>2048||/[\x00-\x1f\x7f]/.test(endpoint)||!/^SodaDesktopMicrophone-[a-f0-9]{32}$/.test(pipeName))throw Error('Native microphone unavailable');
  const command=this.command(backend),env:NodeJS.ProcessEnv={};
  for(const key of ['HOME','USER','LOGNAME','LANG','LC_ALL','XDG_RUNTIME_DIR','XDG_SESSION_ID','DISPLAY','WAYLAND_DISPLAY','DBUS_SESSION_BUS_ADDRESS','PATH','TMPDIR']){const value=process.env[key];if(value!==undefined)env[key]=value;}
  const child=this.launch(command[0]!,command.slice(1),{shell:false,windowsHide:true,env,stdio:['pipe','ignore','ignore']});
  let closed=false,complete!:()=>void;
  const state={child,closed:new Promise<void>(resolve=>{complete=resolve;})} as NonNullable<DesktopNativeMicrophoneHost['current']>;this.current=state;
  child.on('error',()=>{});child.stdin?.on('error',()=>{void this.stop(state).catch(()=>{});});
  child.once('close',()=>{closed=true;if(this.current===state)this.current=undefined;complete();});
  try{
   const path=state.path=await this.paths.create({closed:state.closed,exited:()=>closed||child.exitCode!==null||child.signalCode!==null},pipeName);
   if(!active()||closed||this.current!==state)throw Error('Native microphone unavailable');
   if(!child.stdin)throw Error('Native microphone unavailable');
   child.stdin.write(JSON.stringify({version:1,pipeName,pipePath:path.path,clientPid:process.pid,endpoint})+'\n');
   return{path:path.path,verify:()=>path.verify(),close:()=>this.stop(state)};
  }catch(error){await this.stop(state);throw error;}
 }
 private stop(state:NonNullable<DesktopNativeMicrophoneHost['current']>):Promise<void>{
  if(state.closing)return state.closing;
  state.closing=(async()=>{
   let terminate:ReturnType<typeof setTimeout>|undefined,kill:ReturnType<typeof setTimeout>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
   try{
    state.child.stdin?.end();terminate=setTimeout(()=>{try{state.child.kill();}catch{}},1000);kill=setTimeout(()=>{try{state.child.kill('SIGKILL');}catch{}},3000);
    await Promise.race([state.closed,new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(Error('Native microphone retirement not confirmed')),5000);})]);
    await state.path?.retire();
   }finally{clearTimeout(terminate);clearTimeout(kill);clearTimeout(deadline);}
  })();return state.closing;
 }
 suspend(){this.suspended=true;return this.close();}
 resume(){this.suspended=false;}
 close(){return this.current?this.stop(this.current):Promise.resolve();}
}
