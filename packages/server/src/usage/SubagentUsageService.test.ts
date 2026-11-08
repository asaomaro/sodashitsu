import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,writeFile,rm,appendFile,lstat,rename,utimes} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {openVerified} from "../agent/safeFile.js";
import {SubagentUsageService,type SubagentUsageTarget} from "./SubagentUsageService.js";
import {SubagentUsageRecordReader} from "./SubagentUsageRecordReader.js";
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const born=Date.parse("2026-11-08T00:00:00Z");
const response=(id="r")=>JSON.stringify({type:"token_usage_record",timestamp:"2026-11-08T00:00:01Z",payload:{thread_id:"child",response_id:id,usage:{input_tokens:100,cached_input_tokens:30,output_tokens:20,reasoning_output_tokens:5,total_tokens:120},thread_token_usage:{total_tokens:999999}}})+"\n";
async function fixture(text=response()){
 const dir=await mkdtemp(join(tmpdir(),"soda-own-child-usage-"));dirs.push(dir);const file=join(dir,"generated.jsonl");await writeFile(file,text);let valid=true;
 const open=async()=>{const value=await openVerified(file);if(!value)return undefined;const before=await value.fd.stat({bigint:true});return {...value,unchanged:async()=>{const path=await lstat(file,{bigint:true}).catch(()=>undefined),after=await value.fd.stat({bigint:true}).catch(()=>undefined);return [path,after].every(v=>!!v&&!v.isSymbolicLink()&&(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>before[k]===v[k]));}};};
 const target:SubagentUsageTarget={key:"owned-instance-parent-child",kind:"codex",recordId:"child",startedAt:born,current:()=>valid,openRecord:open};
 const service=new SubagentUsageService({resolve:()=>valid?target:undefined});return {file,open,target,service,set valid(v:boolean){valid=v;}};
}
it("increments only new child responses, then rejects cached values after source loss",async()=>{
 const f=await fixture();try{expect((await f.service.read("pane","child")).usage?.tokens?.total).toBe(120);await appendFile(f.file,response("next"));expect((await f.service.read("pane","child")).usage?.tokens?.total).toBe(240);f.valid=false;expect(await f.service.read("pane","child")).not.toHaveProperty("usage");}finally{f.service.close();}
});
it("continues large records within 4MiB/query, marking empty scans and skipped rows partial without synthetic zero",async()=>{
 const f=await fixture('{"type":"response_item","payload":{"content":"'+"x".repeat(10*1024*1024)+'"}}\n'+response()),reader=new SubagentUsageRecordReader();
 try{let value;for(let n=0;n<4;n++){const record=await f.open();try{value=await reader.read({key:"scope",kind:"codex",recordId:"child",startedAt:born},record!,()=>true);}finally{await record!.fd.close();}if(n<2){expect(value).toMatchObject({partial:true,scanning:true});expect(value).not.toHaveProperty("tokens");}}
  expect(value).toMatchObject({tokens:{total:120},partial:true});expect(value).not.toHaveProperty("scanning");
 }finally{reader.close();f.service.close();}
});
it("restarts on inode rotation, truncation, same-size ns rewrite and new instance without reusing old numbers",async()=>{
 const f=await fixture();try{
  expect((await f.service.read("pane","child")).usage?.tokens?.total).toBe(120);
  const before=await lstat(f.file);await writeFile(f.file,response().replace('"total_tokens":120','"total_tokens":220'));await utimes(f.file,before.atime,before.mtime);expect((await f.service.read("pane","child")).usage?.tokens?.total).toBe(220);
  await rename(f.file,f.file+".old");await writeFile(f.file,response("new"));expect((await f.service.read("pane","child")).usage?.tokens?.total).toBe(120);
  await writeFile(f.file,"");expect(await f.service.read("pane","child")).not.toHaveProperty("usage");
  await writeFile(f.file,response());f.target.key="new-instance";f.target.startedAt=born+10000;expect(await f.service.read("pane","child")).not.toHaveProperty("usage");
 }finally{f.service.close();}
});
it("projects only an exact child's Grok ledger with reported USD and subtree scope",async()=>{
 const ledger={sessionId:"child",updatedAt:"2026-11-08T00:00:01Z",session:{inputTokens:100,outputTokens:20,cachedReadTokens:30,cacheCreationTokens:10,reasoningTokens:5,totalTokens:120,modelCalls:1,costUsdTicks:123456789,costIsPartial:true}};
 const f=await fixture(JSON.stringify(ledger));f.target.kind="grok";try{
  const result=await f.service.read("pane","child");expect(result.usage).toMatchObject({consumptionScope:"subtree",source:"grok-usage",tokens:{basis:"cumulative",total:120},costUsd:0.0123456789,costBasis:"reported",costPartial:true});expect(result.usage).not.toHaveProperty("contextTokens");expect(result.usage).not.toHaveProperty("weeklyCostUsd");
  await writeFile(f.file,JSON.stringify({...ledger,sessionId:"parent"}));expect(await f.service.read("pane","child")).not.toHaveProperty("usage");
 }finally{f.service.close();}
});
it("does not open an unsupported child's parent record or substitute an account",async()=>{
 const f=await fixture();let opened=false;f.target.kind="cursor";f.target.openRecord=async()=>{opened=true;return undefined;};try{expect((await f.service.read("pane","child")).status).toBe("unavailable");expect(opened).toBe(false);}finally{f.service.close();}
});
it("a delayed old resolve cannot cross loss of ownership or leak the old result",async()=>{
 const f=await fixture();let release!:()=>void;const gate=new Promise<void>(r=>release=r),service=new SubagentUsageService({resolve:async()=>{await gate;return f.target;}});
 try{const pending=service.read("pane","child");f.valid=false;release();expect(await pending).not.toHaveProperty("usage");}finally{service.close();f.service.close();}
});
it("holds four physical slots and duplicate-request ownership through timeout until old opens finish",async()=>{
 const f=await fixture();let release!:()=>void;const gate=new Promise<void>(r=>release=r);f.target.openRecord=async()=>{await gate;return f.open();};
 try{
  const pending=Array.from({length:4},(_,n)=>f.service.read("pane",String(n)));expect((await f.service.read("pane","extra")).status).toBe("unavailable");
  await Promise.all(pending);expect((await f.service.read("pane","0")).reason).toContain("まだ確認");
  release();await vi.waitFor(()=>expect((f.service as unknown as {active:number}).active).toBe(0));
  expect((await f.service.read("pane","0")).usage?.tokens?.total).toBe(120);
 }finally{release?.();f.service.close();}
},6000);
it("accepts a freshly reproven append during a read without discarding earlier progress",async()=>{
 const f=await fixture(),safe=await import("../agent/safeFile.js"),original=safe.readRange;let entered=false,release!:()=>void;const gate=new Promise<void>(r=>release=r),spy=vi.spyOn(safe,"readRange").mockImplementationOnce(async(...args)=>{const value=await original(...args);entered=true;await gate;return value;});
 try{const pending=f.service.read("pane","child");await vi.waitFor(()=>expect(entered).toBe(true));await appendFile(f.file,response("late"));release();expect((await pending).usage).toMatchObject({tokens:{total:120},scanning:true,partial:true});expect((await f.service.read("pane","child")).usage?.tokens?.total).toBe(240);}finally{release?.();spy.mockRestore();f.service.close();}
});
it("rechecks the target after asynchronous descriptor cleanup before returning numbers",async()=>{
 const f=await fixture();let closing=false,release!:()=>void;const gate=new Promise<void>(r=>release=r);f.target.openRecord=async()=>{const record=await f.open();if(record){const close=record.fd.close.bind(record.fd);vi.spyOn(record.fd,"close").mockImplementationOnce(async()=>{closing=true;await gate;return close();});}return record;};
 try{const pending=f.service.read("pane","child");await vi.waitFor(()=>expect(closing).toBe(true));f.valid=false;release();expect(await pending).not.toHaveProperty("usage");}finally{release?.();f.service.close();}
});

it("forgets observed over-limit generations before a later smaller file resumes",async()=>{
 const f=await fixture(),reader=new SubagentUsageRecordReader();
 const query=async(large=false)=>{const record=await f.open();if(!record)return undefined;
  try{if(large){const stat=record.fd.stat.bind(record.fd);vi.spyOn(record.fd,"stat").mockImplementationOnce(async()=>({...await stat({bigint:true}),size:513n*1024n*1024n}) as never);}
   return await reader.read({key:"scope",kind:"codex",recordId:"child",startedAt:born},record,()=>true);
  }finally{await record.fd.close();}
 };
 try{expect((await query())?.tokens?.total).toBe(120);expect(await query(true)).toBeUndefined();
  await writeFile(f.file,response("changed-longer-id").replace('"total_tokens":120','"total_tokens":320'));
  expect((await query())?.tokens?.total).toBe(320);
 }finally{reader.close();f.service.close();}
});
it("omits ended Grok ledgers until the original attempt can be freshly reproven",async()=>{
 const f=await fixture(JSON.stringify({sessionId:"child",updatedAt:"2026-11-08T00:00:01Z",session:{inputTokens:100,outputTokens:20,cachedReadTokens:30,cacheCreationTokens:10,reasoningTokens:5,totalTokens:120,modelCalls:1}}));f.target.kind="grok";f.target.historyCurrent=()=>true;
 try{expect((await f.service.read("pane","child")).status).toBe("ok");f.valid=false;expect(await f.service.read("pane","child")).toMatchObject({status:"unavailable",reason:expect.stringContaining("attempt")});}
 finally{f.service.close();}
});
