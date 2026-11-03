import type {AssistantNotice,NotificationWorkSummary} from "@sodashitsu/protocol";
/** Main-only polling of a shared server job. No captain session or model launch here. */
export class NoticeSummaries {
 private rows:readonly AssistantNotice[]=[];
 private values=new Map<string,NotificationWorkSummary>();
 private epoch=0;private scope="";private enabled=true;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private busy=new Set<string>();private requestedRefresh=new Set<string>();
 constructor(private readonly request:(notice:AssistantNotice,refresh:boolean)=>Promise<NotificationWorkSummary>,private readonly changed:()=>void){}
 snapshot():Record<string,NotificationWorkSummary>{return this.enabled?Object.fromEntries(this.values):Object.fromEntries(this.rows.map(n=>[n.id,{status:"disabled",text:"",message:"通知の作業要約は設定で無効です。"}]));}
 configure(rows:readonly AssistantNotice[],scope:string,enabled:boolean){
  if(scope!==this.scope||enabled!==this.enabled){this.epoch++;this.values.clear();this.requestedRefresh.clear();this.scope=scope;this.enabled=enabled;}
  this.rows=rows.slice(0,32);
  const ids=new Set(this.rows.map(n=>n.id));for(const id of this.requestedRefresh)if(!ids.has(id))this.requestedRefresh.delete(id);for(const id of this.values.keys())if(!ids.has(id))this.values.delete(id);
  if(this.timer)clearTimeout(this.timer);this.timer=null;
  if(enabled&&this.rows.length)this.poll();
 }
 reconnect(){for(const [id,value] of this.values)if(value.status==="error")this.values.delete(id);if(this.timer)clearTimeout(this.timer);this.timer=null;if(this.enabled&&this.rows.length)this.poll();}
 retry(id?:string){for(const n of this.rows)if(!id||n.id===id){this.requestedRefresh.add(n.id);this.values.delete(n.id);void this.read(n,true);}}
 stop(){this.epoch++;this.rows=[];this.values.clear();this.requestedRefresh.clear();if(this.timer)clearTimeout(this.timer);this.timer=null;}
 private poll(){
  const rows=[...this.rows].sort((a,b)=>Number(this.requestedRefresh.has(b.id))-Number(this.requestedRefresh.has(a.id)));
  for(const n of rows){const state=this.values.get(n.id);if(this.requestedRefresh.has(n.id)||!state||state.status==="waiting"||state.status==="summarizing")void this.read(n,false);}
  this.timer=setTimeout(()=>{this.timer=null;if(this.enabled&&this.rows.length)this.poll();},2000);this.timer.unref();
 }
 private async read(notice:AssistantNotice,refresh:boolean){
  const token=this.epoch+":"+notice.id;if(this.busy.has(token)||this.busy.size>=4||!this.enabled)return;
  refresh=refresh||this.requestedRefresh.has(notice.id);this.requestedRefresh.delete(notice.id);
  this.busy.add(token);const epoch=this.epoch;
  try{
   const result=await this.request(notice,refresh);
   if(epoch!==this.epoch||!this.rows.some(n=>n.id===notice.id&&n.key===notice.key&&n.source.agentInstanceId===notice.source.agentInstanceId))return;
   this.values.set(notice.id,result);this.changed();
  }catch{
   if(epoch===this.epoch&&this.rows.some(n=>n.id===notice.id)){this.values.set(notice.id,{status:"error",text:"",message:"要約を取得できません。原文を確認するか再試行してください。"});this.changed();}
  }finally{this.busy.delete(token);}
 }
}
