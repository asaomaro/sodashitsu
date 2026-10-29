import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
import {Duplex} from "node:stream";
import {randomBytes} from "node:crypto";
import {z} from "zod";
const Descriptor=z.object({type:z.literal("audio_pipe"),version:z.literal(1),pid:z.number().int().min(1).max(0x7fffffff),nonce:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type DesktopAudioPipeKind="audio"|"microphone";
/** The executable comes only from DesktopAudioPipeBinary. No caller/viewer-selected command. */
export class DesktopAudioPipe extends Duplex {
 readonly ready:Promise<number>;
 readonly childClosed:Promise<void>;
 private child:ChildProcessWithoutNullStreams;
 private header=Buffer.alloc(0);private described=false;private connected=false;private ended=false;
 private deadline:ReturnType<typeof setTimeout>;private heartbeat:ReturnType<typeof setInterval>|undefined;
 private resolveReady!:(pid:number)=>void;private rejectReady!:(error:Error)=>void;private resolveClosed!:()=>void;
 private born:number;private observed:number;private packets=new Set<Buffer>();
 private nonce=randomBytes(32).toString("hex");private diagnostics=0;
 constructor(binary:{readonly executable:string},private kind:DesktopAudioPipeKind,private allowed:()=>boolean,launch:typeof spawn=spawn,private now:()=>number=()=>performance.now()){
  super({readableHighWaterMark:16384,writableHighWaterMark:1932});
  this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
  this.childClosed=new Promise(resolve=>{this.resolveClosed=resolve;});
  this.born=this.observed=this.now();
  this.child=launch(binary.executable,[],{stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false});
  this.deadline=setTimeout(()=>this.fail(),2500);this.deadline.unref();
  this.child.stdout.on("data",(bytes:Buffer)=>this.receive(bytes));
  this.child.stdout.on("end",()=>{if(!this.destroyed)this.fail();});
  this.child.stderr.on("data",(bytes:Buffer)=>{this.diagnostics+=bytes.length;if(this.diagnostics>8192)this.fail();});
  this.child.on("error",()=>this.fail());this.child.stdin.on("error",()=>this.fail());
  this.child.on("close",()=>{this.ended=true;for(const packet of this.packets)packet.fill(0);this.packets.clear();this.resolveClosed();if(!this.destroyed)this.fail();});
  this.child.stdin.write(JSON.stringify({nonce:this.nonce})+"\n");
 }
 private live(){try{
  const check=()=>{const at=this.now();if(!Number.isFinite(at)||at<this.observed||!Number.isFinite(this.born)||(!this.connected&&at-this.born>=2500)||this.destroyed||this.ended)return false;this.observed=at;return true;};
  return check()&&this.allowed()&&check();
 }catch{return false;}}
 private fail(){this.destroy(Error("音声中継が終了しました"));}
 private receive(bytes:Buffer){
  if(!this.live()){bytes.fill(0);this.fail();return;}
  if(!this.described){
   const newline=bytes.indexOf(10), count=newline<0?bytes.length:newline;
   if(this.header.length+count>512){bytes.fill(0);this.fail();return;}
   this.header=Buffer.concat([this.header,bytes.subarray(0,count)]);
   if(newline<0)return;
   try{const data=Descriptor.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(this.header)));if(data.nonce!==this.nonce||!this.live())throw Error();this.described=true;this.header.fill(0);this.header=Buffer.alloc(0);this.resolveReady(data.pid);}catch{bytes.fill(0);this.fail();return;}
   bytes=bytes.subarray(newline+1);
  }
  // The child must not emit PCM before the authenticated endpoint was requested.
  if(bytes.length){if(!this.connected){bytes.fill(0);this.fail();return;}if(!this.push(bytes))this.child.stdout.pause();}
 }
 /** Call only after the helper enable action has been written with the descriptor PID. */
 connect(name:string){
  if(!this.live()||!this.described||this.connected||/[\r\n\0]/.test(name)||!new RegExp(`^SodaDesktop${this.kind==="audio"?"Audio":"Microphone"}-[a-f0-9]{32}$`).test(name)){this.fail();return false;}
  clearTimeout(this.deadline);this.connected=true;this.child.stdin.write(JSON.stringify({kind:this.kind,name})+"\n");
  this.heartbeat=setInterval(()=>{if(!this.live()){this.fail();return;}if(this.child.stdin.writableLength>8192){this.fail();return;}this.child.stdin.write(Buffer.from([1,0,0,0,0]));},500);this.heartbeat.unref();return true;
 }
 override _read(){this.child?.stdout.resume();}
 override _write(bytes:Buffer,_encoding:BufferEncoding,done:(error?:Error|null)=>void){
  if(!this.live()||!this.connected||this.kind!=="microphone"||bytes.length!==1932){done(Error("音声中継の入力が不正です"));return;}
  const packet=Buffer.allocUnsafe(1937);packet[0]=2;packet.writeUInt32LE(1932,1);bytes.copy(packet,5);this.packets.add(packet);
  this.child.stdin.write(packet,error=>{packet.fill(0);this.packets.delete(packet);done(error??(!this.live()?Error("音声中継が終了しました"):undefined));});
 }
 override _destroy(error:Error|null,done:(error?:Error|null)=>void){
  clearTimeout(this.deadline);clearInterval(this.heartbeat);this.header.fill(0);this.header=Buffer.alloc(0);this.nonce="";this.pause();while(this.readableLength){const queued=super.read() as Buffer|null;queued?.fill(0);}
  this.rejectReady(error??Error("音声中継を停止しました"));this.child?.stdin.destroy();if(!this.ended)this.child?.kill();
  // Callers retain closed separately. Destroy is not native endpoint cleanup proof.
  done(error);
 }
}
