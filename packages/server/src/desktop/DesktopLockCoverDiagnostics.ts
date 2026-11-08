/** Private helper metadata, never a viewer message, permission, or delivery acknowledgement. */
const stages=["dismiss_authorized","guard_changed_before","wake_selected","wake_returned","enter_selected","enter_guard_rejected","enter_result_invalid","dismiss_returned","guard_changed_after_error","dismiss_failed_guard_current","cover_changed_without_dismiss"] as const;
export type DesktopLockCoverRecord={stage:typeof stages[number]}|{stage:"enter_result";inserted:number};
export type DesktopLockCoverSink=(record:DesktopLockCoverRecord)=>void;
export class DesktopLockCoverDiagnostics {
 private remaining=128;
 constructor(private readonly sink:DesktopLockCoverSink=()=>{}){}
 channel(active:()=>boolean){
  let line="",dropping=false,closed=false,remaining=8;
  const live=()=>{try{return !closed&&active();}catch{return false;}};
  return{close:()=>{closed=true;line="";},push:(chunk:Buffer)=>{
   if(!live()||remaining<1||this.remaining<1){closed=true;line="";return;}
   if(chunk.length>65536){dropping=true;line="";return;}
   for(const character of chunk.toString("utf8")){
    if(character!=="\n"){if(!dropping){if(line.length>=128){line="";dropping=true;}else line+=character;}continue;}
    const value=line.endsWith("\r")?line.slice(0,-1):line;line="";if(dropping){dropping=false;continue;}
    const match=/^SODA_LOCK_COVER ([a-z_]+)(?: ([0-2]))?$/.exec(value);if(!match)continue;
    const stage=match[1]!,count=match[2];let record:DesktopLockCoverRecord;
    if(stage==="enter_result"){if(count===undefined)continue;record={stage,inserted:Number(count)};}
    else{if(count!==undefined||!(stages as readonly string[]).includes(stage))continue;record={stage:stage as typeof stages[number]};}
    if(!live()||remaining<1||this.remaining<1){closed=true;return;}remaining--;this.remaining--;
    try{this.sink(record);}catch{ /* Diagnostics cannot affect input or cleanup. */ }
   }
  }};
 }
}
