import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { codexSubagentInput, type CodexSubagentInputState } from "./CodexSubagentControl.js";
import type { VerifiedSubagentTarget } from "./VerifiedSubagentTarget.js";
function fixture(options:{active?:boolean;capability?:boolean|null|"missing";lost?:boolean;changed?:boolean;close?:boolean;turn?:string;foreignPath?:boolean}={}){
 const parent=randomUUID(),child=randomUUID(),requests:Array<{method:string;params:any}>=[];
 let current=true,closed=false,fdclosed=false;
 const target={kind:"codex",parentId:parent,recordId:child,current:()=>current} as VerifiedSubagentTarget;
 const channel={identity:"generation",initialized:()=>{},unchanged:async()=>!options.changed,close:async()=>{closed=true;return options.close!==false;},request:async(method:string,params:object)=>{
   requests.push({method,params});
   if(method==="initialize")return {userAgent:"generated-0.166"};
   if(method==="thread/loaded/list")return {data:[parent,child]};
   if(method==="thread/read")return {thread:{id:child,path:options.foreignPath?"/generated/foreign-record":"/generated/child-record",...(options.capability==="missing"?{}:{canAcceptDirectInput:options.capability===undefined?true:options.capability}),status:options.active?{type:"active",activeFlags:[]}:{type:"idle"}}};
   if(method==="thread/turns/list")return {data:[{id:options.turn??"active-turn",status:"inProgress"}]};
   if(options.lost)throw Error("lost ack");return method==="turn/steer"?{turnId:"active-turn"}:{turn:{id:"new-turn"}};
 }};
 const config={open:async()=>channel,record:async()=>({file:"/generated/child-record",fd:{close:async()=>{fdclosed=true;}},unchanged:async()=>true}) as any};
 return {target,requests,config,get closed(){return closed&&fdclosed;},expire:()=>current=false};
}
it.each([false,true])("uses exact existing child, direct capability and %s active turn without overrides",async active=>{
 const f=fixture({active}),signal=new AbortController().signal;
 const ready=await codexSubagentInput({target:f.target,signal,current:()=>true},f.config);expect(ready.status).toBe("ready");if(ready.status!=="ready")throw Error();
 const sent=await codexSubagentInput({target:f.target,signal,current:()=>true,send:{state:ready.state,text:"generated",requestId:randomUUID()}},f.config);
 expect(sent.status).toBe("accepted");const writes=f.requests.filter(r=>r.method.startsWith("turn/"));expect(writes).toHaveLength(1);
 expect(writes[0]!.method).toBe(active?"turn/steer":"turn/start");expect(writes[0]!.params.threadId).toBe(f.target.recordId);
 expect(Object.keys(writes[0]!.params).sort()).toEqual((active?["threadId","expectedTurnId","input","clientUserMessageId"]:["threadId","input","clientUserMessageId"]).sort());expect(f.closed).toBe(true);
});
it.each([false,null,"missing"] as const)("does not treat %s direct capability as permission",async capability=>{
 const f=fixture({capability});expect((await codexSubagentInput({target:f.target,signal:new AbortController().signal,current:()=>true},f.config)).status).toBe("unavailable");expect(f.requests.some(r=>r.method.startsWith("turn/"))).toBe(false);expect(f.closed).toBe(true);
});
it("refuses a loaded thread from another record despite matching UUID and direct capability",async()=>{
 const f=fixture({foreignPath:true});expect((await codexSubagentInput({target:f.target,signal:new AbortController().signal,current:()=>true,send:{state:{daemon:"generation",mode:"start"},text:"generated",requestId:randomUUID()}},f.config)).status).toBe("unavailable");expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it.each(["generation","turn"])("rejects changed %s between lease and mutation",async change=>{
 const f=fixture({active:true});const state:CodexSubagentInputState={daemon:change==="generation"?"old":"generation",mode:"steer",turnId:change==="turn"?"old":"active-turn"};
 expect((await codexSubagentInput({target:f.target,signal:new AbortController().signal,current:()=>true,send:{state,text:"generated",requestId:randomUUID()}},f.config)).status).toBe("unavailable");expect(f.requests.some(r=>r.method==="turn/steer")).toBe(false);
});
it.each(["lost","close"])("never retries %s uncertain delivery and physically closes both resources",async failure=>{
 const f=fixture({lost:failure==="lost",close:failure!=="close"});const result=await codexSubagentInput({target:f.target,signal:new AbortController().signal,current:()=>true,send:{state:{daemon:"generation",mode:"start"},text:"generated",requestId:randomUUID()}},f.config);
 expect(result.status).toBe("delivery-unknown");expect(f.requests.filter(r=>r.method==="turn/start")).toHaveLength(1);expect(f.closed).toBe(true);
});
