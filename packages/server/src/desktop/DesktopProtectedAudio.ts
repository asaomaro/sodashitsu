import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {DesktopNativeRoleBinary} from '@sodashitsu/client-core/desktop/DesktopNativeRoleBinary.node';
import {DesktopNativeAudio,type DesktopNativeAudioHooks,type DesktopAudioLease} from './DesktopNativeAudio.js';
/** One ordinary-user producer; ownership survives OFF until the actual child close. */
export class DesktopProtectedAudio {
 private active:DesktopAudioLease|undefined;private retiring:Promise<void>|undefined;
 open(hooks:DesktopNativeAudioHooks):DesktopAudioLease {
  if(this.active||this.retiring||!hooks.active()||this.active||this.retiring){hooks.state('unavailable');return {stop(){}};}
  const binary=new DesktopNativeRoleBinary('user-audio'),nonce=randomBytes(32).toString('hex'),deadline=performance.now()+45000;
  let dead=false,ready=false,running=false,audioRequested=false,receipt=false,child:ChildProcessWithoutNullStreams|undefined,audio:DesktopNativeAudio|undefined,closed:Promise<void>|undefined,buffer='',bytes=0,diagnostics=0;
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  const alive=()=>{if(dead)return false;const active=hooks.active();return !dead&&active&&(running||performance.now()<deadline);};
  const write=(value:unknown)=>{if(!child||child.stdin.destroyed||child.stdin.writableLength>4096)throw Error('Audio role input closed');child.stdin.write(JSON.stringify(value)+'\n');};
  const lease:DesktopAudioLease={stop:(notify=true)=>{
   if(dead)return;dead=true;clearTimeout(timer);clearInterval(heartbeat);const preparationRetired=binary.retirePreparation();try{audio?.stop(false);}catch{/* A broken control pipe cannot interrupt device/process retirement. */}
   child?.stdin.end();const kill=child?setTimeout(()=>child?.kill(),1500):undefined;kill?.unref();
   if(notify)hooks.state('stopped');
   this.retiring=(async()=>{await preparing.catch(()=>{});await preparationRetired;await closed;if(audioRequested&&!receipt)await new Promise<void>(()=>{});if(kill)clearTimeout(kill);await binary.close();})().catch(()=>{}).finally(()=>{if(this.active===lease)this.active=undefined;this.retiring=undefined;});
  }};
  const fail=()=>{if(dead)return;lease.stop(false);hooks.state('unavailable');};
  const timer=setTimeout(fail,45000);timer.unref();this.active=lease;
  const preparing=Promise.resolve().then(async()=>{
   if(dead)return;await binary.prepare();if(!alive()){fail();return;}
   child=spawn(binary.executable,[...binary.arguments],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
   closed=new Promise<void>(resolve=>child!.once('close',()=>{resolve();if(!dead)fail();}));
   child.on('error',fail);child.stdin.on('error',fail);
   child.stderr.on('data',(data:Buffer)=>{diagnostics+=data.length;if(diagnostics>8192)fail();});
   child.stdout.on('data',(data:Buffer)=>{
    bytes+=data.length;if(bytes>4096){fail();return;}buffer+=data.toString('utf8');
    try{while(buffer.includes('\n')){const at=buffer.indexOf('\n'),m=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);
     if(m.type==='user_audio_closed'&&m.id===hooks.id&&m.nonce===nonce){receipt=true;if(!dead)fail();continue;}
     if(ready||m.type!=='user_audio_ready'||m.id!==hooks.id||m.nonce!==nonce||m.clock!=='windows-qpc-v1'||Object.keys(m).length!==4||!alive())throw Error('Audio role proof');
     ready=true;
     audio=new DesktopNativeAudio({...hooks,write:raw=>{const m=raw as any;if(m.type!=='native_audio'||m.id!==hooks.id)throw Error('Audio role stream');if(m.enabled){if(!alive())throw Error("Audio source ended");audioRequested=true;}write({...m,...(m.enabled&&!m.clientPid?{clientPid:process.pid}:{})});},active:alive,send:(bytes,receivedAt)=>alive()&&hooks.send(bytes,receivedAt),state:state=>{if(dead)return;if(state==='running'){if(performance.now()>=deadline){fail();return;}running=true;clearTimeout(timer);}hooks.state(state);if(state==='unavailable')lease.stop(false);}});
    }}catch{fail();}
   });
   write({id:hooks.id,nonce});
   heartbeat=setInterval(()=>{if(!alive()){fail();return;}try{write({type:'heartbeat'});}catch{fail();}},500);heartbeat.unref();
  });void preparing.catch(fail);hooks.state('starting');
  return lease;
 }
 stop(){this.active?.stop();}
}

const producer=new DesktopProtectedAudio();
export const createProtectedAudio=(hooks:DesktopNativeAudioHooks)=>producer.open(hooks);
