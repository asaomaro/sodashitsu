import {decodeDesktopDatagram,decodeDesktopH264Packet} from "@sodashitsu/protocol";
type Frame={at:number;total:number;noticed:boolean;parts:(Uint8Array|undefined)[];received:number};
/** Three access units, a 150ms deadline, no retransmit wait or unbounded map. */
export class DesktopDatagramFrames {
 private frames=new Map<number,Frame>();
 private next=1;private noticeSeq=0;private key=true;private dead=false;
 constructor(private hooks:{now():number;frame(seq:number,bytes:Uint8Array):void;drop(seq:number):void;keyframe():void},private ready=true){}
 reset(baseSeq:number){if(this.dead||!Number.isInteger(baseSeq)||baseSeq<0||baseSeq>=0xffffffff)throw Error("Native sequence base");this.frames.clear();this.next=baseSeq+1;this.noticeSeq=baseSeq;this.key=true;}
 start(){this.ready=true;this.tick();}
 private entry(seq:number,total:number,count:number){
  if(this.dead||seq<this.next)return;
  if(seq>=this.next+3)throw Error("Datagram receive window");
  let frame=this.frames.get(seq);
  if(frame){if(frame.total!==total||frame.parts.length!==count)throw Error("Conflicting native fragments");}
  else{frame={at:this.hooks.now(),total,noticed:false,parts:Array(count),received:0};this.frames.set(seq,frame);}
  return frame;
 }
 notice(seq:number,total:number){
  if(this.dead)return;if(seq!==this.noticeSeq+1)throw Error("Native notice order");this.noticeSeq=seq;
  // Encoding is bounded by the protocol parser before this method is called.
  const frame=this.entry(seq,total,Math.ceil(total/(16384-20)));if(frame)frame.noticed=true;this.tick();
 }
 fragment(bytes:Uint8Array){
  const p=decodeDesktopDatagram(bytes),frame=this.entry(p.seq,p.total,p.count);if(!frame)return;
  const prior=frame.parts[p.part];
  if(prior){if(prior.length!==p.data.length||!prior.every((v,i)=>v===p.data[i]))throw Error("Conflicting native fragment");return;}
  frame.parts[p.part]=p.data.slice();frame.received+=p.data.length;this.tick();
 }
 tick(){
  while(!this.dead&&this.ready){
   const frame=this.frames.get(this.next);
   if(!frame){
    // A later authenticated fragment proves a whole earlier access unit is
    // missing, even if the reliable notice is delayed on its separate path.
    const arrivals=[...this.frames.entries()].filter(([seq])=>seq>this.next).map(([,f])=>f.at);
    if(!arrivals.length||this.hooks.now()-Math.min(...arrivals)<150)return;
    const seq=this.next++;this.key=true;this.hooks.drop(seq);this.hooks.keyframe();continue;
   }
   if(this.hooks.now()-frame.at>=150){const seq=this.next++;this.frames.delete(seq);this.key=true;this.hooks.drop(seq);this.hooks.keyframe();}
   else if(frame.received===frame.total){
    const bytes=new Uint8Array(frame.total);let offset=0;for(const part of frame.parts){if(!part)throw Error("Incomplete native frame");bytes.set(part,offset);offset+=part.length;}
    const h264=decodeDesktopH264Packet(bytes),seq=this.next++;this.frames.delete(seq);
    if(this.key&&!h264.key){this.hooks.drop(seq);this.hooks.keyframe();continue;}
    this.key=false;this.hooks.frame(seq,bytes);
   }else return;
  }
 }
 stop(){this.dead=true;this.frames.clear();}
}
