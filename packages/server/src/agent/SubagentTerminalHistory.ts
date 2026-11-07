import { randomUUID } from "node:crypto";
import type { AgentSubagentHistoryParams, AgentSubagentHistoryResult, Pane, SubagentHistoryItem } from "@sodashitsu/protocol";

export interface SubagentHistorySource {paneId:string;instanceId:string;kind:string;sessionId:string}
interface Session {getPane(id:string):Pane|undefined;hasVerifiedAgentSession(pane:string,instance:string,session:string):boolean}
interface Entry {item:SubagentHistoryItem;eventId:string;verify:(current:()=>boolean)=>Promise<boolean>}
interface State {source:SubagentHistorySource;revision:string;items:Map<string,Entry>;omittedBefore:boolean;status:"ok"|"pending";incomplete:boolean}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const sameSource=(a:SubagentHistorySource,b:SubagentHistorySource|undefined)=>!!b&&a.paneId===b.paneId&&a.instanceId===b.instanceId&&a.kind===b.kind&&a.sessionId===b.sessionId;
const clean=(v:unknown,max:number):string|undefined=>typeof v==="string"&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f-\x9f]/.test(v)?v:undefined;

/** Small, private terminal collection. It does not mutate AgentInfo, usage,
 * active counts, graph controls or session data. Only trusted provider adapters
 * can note an entry; every public read separately revalidates its owned record. */
export class SubagentTerminalHistory {
  private readonly states=new Map<string,State>();
  private closed=false;
  private checks=0;
  constructor(private readonly session:Session){}
  source(paneId:string):SubagentHistorySource|undefined {
    if(this.closed)return;
    const p=this.session.getPane(paneId),a=p?.agent,ref=p?.agentSession;
    if(p?.id!==paneId||!a||!ref||ref.kind!==a.kind||!this.session.hasVerifiedAgentSession(paneId,a.instanceId,ref.sessionId))return;
    return{paneId,instanceId:a.instanceId,kind:a.kind,sessionId:ref.sessionId};
  }
  current(source:SubagentHistorySource):boolean{return !this.closed&&sameSource(source,this.source(source.paneId));}
  forget(paneId:string):void{this.states.delete(paneId);}
  close():void{this.closed=true;this.states.clear();}
  /** Known formal activity may be pending; missing observations are not zero. */
  mark(source:SubagentHistorySource,status:"ok"|"pending",incomplete=true):void{
    if(!this.current(source))return;
    const state=this.state(source);state.status=status;state.incomplete=incomplete;
  }
  private state(source:SubagentHistorySource):State{
    let state=this.states.get(source.paneId);
    if(!state||!sameSource(state.source,source)){
      state={source:{paneId:source.paneId,instanceId:source.instanceId,kind:source.kind,sessionId:source.sessionId},revision:randomUUID(),items:new Map(),omittedBefore:false,status:"pending",incomplete:true};
      this.states.delete(source.paneId);this.states.set(source.paneId,state);
      while(this.states.size>64)this.states.delete(this.states.keys().next().value!);
    }
    return state;
  }
  note(source:SubagentHistorySource,item:SubagentHistoryItem,eventId:string,verify:(current:()=>boolean)=>Promise<boolean>):boolean{
    if(!this.current(source)||!clean(eventId,256)||!clean(item.id,128)||!["completed","aborted","error"].includes(item.terminalStatus))return false;
    const publicItem:SubagentHistoryItem={id:item.id,terminalStatus:item.terminalStatus};
    for(const key of ["type","description","model","reasoningEffort"] as const){const v=clean(item[key],key==="description"?2000:key==="type"?200:128);if(v)publicItem[key]=v;}
    if(publicItem.model&&(item.modelBasis==="turn"||item.modelBasis==="creation"||item.modelBasis==="session"))publicItem.modelBasis=item.modelBasis;else delete publicItem.model;
    if(publicItem.reasoningEffort&&(item.reasoningEffortBasis==="turn"||item.reasoningEffortBasis==="creation"||item.reasoningEffortBasis==="session"))publicItem.reasoningEffortBasis=item.reasoningEffortBasis;else delete publicItem.reasoningEffort;
    for(const key of ["startedAt","endedAt"] as const)if(typeof item[key]==="number"&&Number.isSafeInteger(item[key])&&item[key]!>=0)publicItem[key]=item[key];
    if(item.hasTranscript===true)publicItem.hasTranscript=true;
    const state=this.state(source),previous=state.items.get(item.id);
    if(previous?.eventId===eventId&&same(previous.item,publicItem)){previous.verify=verify;return true;}
    state.items.delete(item.id);state.items.set(item.id,{item:publicItem,eventId,verify});state.revision=randomUUID();state.status="ok";
    while(state.items.size>256){state.items.delete(state.items.keys().next().value!);state.omittedBefore=true;}
    return true;
  }
  private async verify(entry:Entry,current:()=>boolean):Promise<boolean>{
    if(this.checks>=4||!current())return false;
    this.checks++;
    try{return await entry.verify(current)&&current();}catch{return false;}finally{this.checks--;}
  }
  async grant(paneId:string,id:string,allowed:()=>boolean=()=>true):Promise<{source:SubagentHistorySource;item:SubagentHistoryItem;current:()=>boolean}|undefined>{
    const source=this.source(paneId),state=this.states.get(paneId),entry=state?.items.get(id);
    if(!source||!state||!entry||!sameSource(source,state.source))return;
    let active=true,timer:ReturnType<typeof setTimeout>|undefined;
    const current=()=>active&&allowed()&&this.current(source)&&this.states.get(paneId)===state&&state.items.get(id)===entry;
    try{
      const valid=await Promise.race([this.verify(entry,current),new Promise<false>(resolve=>{timer=setTimeout(()=>{active=false;resolve(false);},1500);})]);
      if(valid&&current())return{source,item:{...entry.item},current:()=>allowed()&&this.current(source)&&this.states.get(paneId)===state&&state.items.has(id)};
    }finally{active=false;if(timer)clearTimeout(timer);}
  }
  async read(params:AgentSubagentHistoryParams,allowed:()=>boolean=()=>true):Promise<AgentSubagentHistoryResult>{
    const source=this.source(params.paneId),state=this.states.get(params.paneId);
    const unavailable=():AgentSubagentHistoryResult=>({status:"unavailable",items:[],offset:0,reset:true,more:false,omittedBefore:false,incomplete:true});
    if(!source||!state||!sameSource(source,state.source)||!allowed())return unavailable();
    const revision=state.revision,all=[...state.items.values()].reverse(),reset=!!params.revision&&params.revision!==revision;
    const requested=Number.isSafeInteger(params.offset)&&params.offset!>=0?Math.min(256,params.offset!):0;
    const start=reset||requested>all.length?0:requested,limit=Number.isSafeInteger(params.limit)&&params.limit!>=1?Math.min(64,params.limit!):32,end=Math.min(all.length,start+limit);
    let active=true,position=start,failed=false,timer:ReturnType<typeof setTimeout>|undefined;const items:SubagentHistoryItem[]=[];
    const current=()=>active&&allowed()&&this.current(source)&&this.states.get(params.paneId)===state&&state.revision===revision;
    const work=async()=>{
      while(position<end&&current()){
        const entry=all[position]!;const valid=await this.verify(entry,current);
        if(!current())return;
        if(valid)items.push({...entry.item});else failed=true;
        position++;
      }
    };
    try{
      await Promise.race([work(),new Promise<void>(resolve=>{timer=setTimeout(()=>{active=false;failed=true;resolve();},1500);})]);
      if(!allowed()||!this.current(source)||this.states.get(params.paneId)!==state)return unavailable();
      if(state.revision!==revision)return{status:"pending",items:[],offset:0,revision:state.revision,reset:true,more:state.items.size>0,omittedBefore:state.omittedBefore,incomplete:true};
      return{status:failed||state.status==="pending"?"pending":"ok",items:items.map(i=>({...i})),offset:position,revision,reset:reset||requested>all.length,more:position<all.length,omittedBefore:state.omittedBefore,incomplete:state.incomplete||failed};
    }finally{active=false;if(timer)clearTimeout(timer);}
  }
}
