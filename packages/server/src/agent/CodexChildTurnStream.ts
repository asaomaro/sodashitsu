import {ASSISTANT_EFFORTS,type SubagentInfo} from "@sodashitsu/protocol";
import {CodexRecordEnvelope} from "./CodexRecordEnvelope.js";
import {safeModel} from "../usage/claudeScan.js";
export type CodexTurnObservation=Pick<SubagentInfo,"model"|"modelBasis"|"reasoningEffort"|"reasoningEffortBasis">;
// Official rust-v0.166.0 history/src/rollout_payload.rs RolloutItemWire, except TurnContext.
const NON_TURN=new Set(["session_meta","dynamic_tools_updated","response_item","inter_agent_communication","inter_agent_communication_metadata","compacted","token_usage_record","world_state","retained_context","security_risk_score","event_msg","realtime_item"]);
/** Constant space, full JSON/UTF8/envelope validation. Never assembles an oversized row or retains body text. */
export class CodexChildTurnStream{
 private envelope=new CodexRecordEnvelope("turn");
 private lineBytes=0;
 invalid=false;
 seenTurn=false;
 lastTurnEnd=0;
 lastTurnTimestamp:number|undefined;
 value:CodexTurnObservation={};
 constructor(public offset:number,private readonly startedAt:number,private skipPartial=false){}
 get partial():boolean{return this.lineBytes!==0||this.skipPartial;}
 seed(value:CodexTurnObservation,end:number,timestamp?:number):void{this.value={...value};this.seenTurn=true;this.lastTurnEnd=end;this.lastTurnTimestamp=timestamp;}
 consume(bytes:Buffer):void{
  let at=0;
  while(at<bytes.length&&!this.invalid){
   const nl=bytes.indexOf(10,at),end=nl<0?bytes.length:nl,piece=bytes.subarray(at,end);
   this.offset+=piece.length;this.lineBytes+=piece.length;
   if(!this.skipPartial&&!this.envelope.feed(piece)){this.invalid=true;return;}
   if(nl<0)return;
   this.offset++;
   if(this.skipPartial)this.skipPartial=false;
   else if(this.lineBytes){
    if(!this.envelope.finishSyntax()){this.invalid=true;return;}
    const type=this.envelope.recordType;
    if(type==="turn_context"){
     const metadata=this.envelope.turnMetadata,at=Date.parse(metadata.timestamp??"");
     this.seenTurn=true;this.lastTurnEnd=this.offset;this.lastTurnTimestamp=Number.isFinite(at)?at:undefined;this.value={};
     if(Number.isFinite(at)&&at>=this.startedAt){const model=safeModel(metadata.model),effort=metadata.effort&&(ASSISTANT_EFFORTS.codex as readonly string[]).includes(metadata.effort)?metadata.effort:undefined;
      this.value={...(model?{model,modelBasis:"turn" as const}:{}),...(effort?{reasoningEffort:effort,reasoningEffortBasis:"turn" as const}:{})};}
    }else if(!type||!NON_TURN.has(type)){this.invalid=true;return;}
   }
   this.envelope=new CodexRecordEnvelope("turn");this.lineBytes=0;at=end+1;
  }
 }
}
