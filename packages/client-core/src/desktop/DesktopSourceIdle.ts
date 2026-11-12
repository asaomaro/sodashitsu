import {DesktopNativePlatformIdle,type DesktopNativePlatform} from "@sodashitsu/protocol";
type Context={backend:DesktopNativePlatform|undefined;ready:boolean;pending:number;seq:number};
/** Deduplicates informational idle notices against the displayed image.
 * This does not grant input or renew an agent observation. */
export class DesktopSourceIdle {
 private counter=0;
 receive(raw:unknown,context:Context){
  const value=DesktopNativePlatformIdle.parse(raw);
  if(context.backend!=="linux-portal")throw Error("Invalid native idle scope");
  if(value.counter<=this.counter)return;
  this.counter=value.counter;
  if(!context.ready||context.pending!==0||context.seq<1||value.seq!==context.seq)return;
  return value;
 }
}
