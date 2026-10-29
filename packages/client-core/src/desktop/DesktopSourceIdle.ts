import {DesktopNativePlatformIdle,type DesktopNativePlatform} from "@sodashitsu/protocol";
type Context={backend:DesktopNativePlatform|undefined;ready:boolean;pending:number;seq:number};
/** Human-input liveness only. Never modifies a frame, capture time or agent proof. */
export class DesktopSourceIdle {
 private counter=0;private seq=0;private received:number|undefined;private observed=0;
 constructor(private clock=()=>performance.now()){}
 private now(){try{const now=this.clock();if(!Number.isFinite(now)||now<this.observed)throw Error("Invalid idle clock");this.observed=now;return now;}catch(error){this.received=undefined;throw error;}}
 receive(raw:unknown,context:Context){
  const value=DesktopNativePlatformIdle.parse(raw),now=this.now();
  if(context.backend!=="linux-portal")throw Error("Invalid native idle scope");
  if(value.counter<=this.counter)return;
  this.counter=value.counter;
  // Images and notices may use different physical sockets. A late/future
  // notice or an image awaiting its ACK is neither fresh proof nor a fault.
  if(!context.ready||context.pending!==0||context.seq<1||value.seq!==context.seq)return;
  this.seq=value.seq;this.received=now;return value;
 }
 fresh(context:Context){
  try{return context.backend==="linux-portal"&&context.ready&&context.pending===0&&this.received!==undefined&&this.seq===context.seq&&this.now()-this.received<1000;}catch{return false;}
 }
 frame(){this.received=undefined;}
}
