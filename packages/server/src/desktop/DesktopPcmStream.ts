import {DESKTOP_PCM_BYTES,DESKTOP_PCM_HELLO} from "@sodashitsu/protocol";
export type DesktopPcmFrame={seq:number;timestamp:number;pcm:Buffer};
/** Fixed buffers. At most two completed frames need be retained by the encoder. */
export class DesktopPcmStream {
 private bytes=Buffer.alloc(16+DESKTOP_PCM_BYTES);private offset=0;private hello=false;private seq=0;private timestamp=-1;
 constructor(private ready:()=>void,private frame:(frame:DesktopPcmFrame)=>void){}
 push(chunk:Uint8Array){
  let offset=0;
  while(offset<chunk.length){
   const size=this.hello?(this.offset<16?16:16+DESKTOP_PCM_BYTES):16,count=Math.min(size-this.offset,chunk.length-offset);
   this.bytes.set(chunk.subarray(offset,offset+count),this.offset);offset+=count;this.offset+=count;
   if(!this.hello&&this.offset===16){if(!DESKTOP_PCM_HELLO.every((v,i)=>this.bytes[i]===v))throw Error("Invalid PCM format");this.hello=true;this.offset=0;this.ready();}
   else if(this.hello&&this.offset===16){if(this.bytes.readUInt32LE(0)!==DESKTOP_PCM_BYTES)throw Error("Invalid PCM frame size");}
   else if(this.hello&&this.offset===16+DESKTOP_PCM_BYTES){
    const seq=this.bytes.readUInt32LE(4),timestamp=Number(this.bytes.readBigUInt64LE(8));
    if(seq!==this.seq+1||!Number.isSafeInteger(timestamp)||timestamp<=this.timestamp)throw Error("Invalid PCM frame order");
    this.seq=seq;this.timestamp=timestamp;const pcm=Buffer.alloc(DESKTOP_PCM_BYTES);this.bytes.copy(pcm,0,16);this.offset=0;this.frame({seq,timestamp,pcm});
   }
  }
 }
 clear(){this.bytes.fill(0);this.offset=0;}
}
