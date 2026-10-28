import type {Readable} from "node:stream";
type Input=Pick<Readable,'on'|'removeListener'|'resume'|'pause'>;
const frame=Buffer.from('signin_stop\n','ascii');
/** Parent-owned anonymous stdin pipe, one fixed stop record only. Never accepts
 * commands, paths, credentials or desktop input. Invalid/closed input revokes
 * the runtime too, and the host must not classify that exit as clean. */
export function desktopSigninStopSignal(input:Input,stop:()=>void):{failed():boolean;close():void}{
 let closed=false,failed=false,received=false,count=0;
 const revoke=()=>{try{stop();}catch{failed=true;}};
 const invalid=()=>{if(closed)return;failed=true;revoke();};
 const data=(bytes:unknown)=>{
  if(closed)return;if(!(bytes instanceof Uint8Array)||received||bytes.length>frame.length-count){invalid();return;}
  for(const byte of bytes){if(byte!==frame[count++]){invalid();return;}}
  if(count===frame.length){received=true;revoke();}
 };
 const end=()=>{if(!received)invalid();};
 input.on('error',invalid);input.on('end',end);input.on('close',end);input.on('data',data);input.resume();
 return {failed:()=>failed,close:()=>{if(closed)return;closed=true;input.removeListener('error',invalid);input.removeListener('end',end);input.removeListener('close',end);input.removeListener('data',data);input.pause();}};
}
