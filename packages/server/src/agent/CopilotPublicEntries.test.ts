import {expect,it} from "vitest";
import {copilotPublicMessage} from "./CopilotPublicEntries.js";
import {NativeSubagentRecords} from "./NativeSubagentRecords.js";
import {copilotTerminalBindings} from "./CopilotTerminalBindings.js";
const start=(id="start")=>({id,type:"custom_agent.started",timestamp:"2026-11-08T00:00:00Z",data:{toolCallId:"call:1",agentName:"child"}});
const end=(id="end")=>({...start(id),type:"custom_agent.completed"});
const message=(text="public",id="message")=>({id,type:"assistant.message",timestamp:"2026-11-08T00:00:00Z",data:{parentToolCallId:"call:1",messageId:"m1",content:text}});
it("captures exact event-bounded public rows independently of equal millisecond timestamps and reused tool IDs",()=>{
 const fold=new NativeSubagentRecords("copilot","parent");fold.consume(message("before"));fold.consume(start());fold.consume(message("first"));fold.consume(end());fold.consume(message("after"));const first=fold.copilotTerminals()![0]!;
 fold.consume(start("start2"));fold.consume(message("second"));fold.consume(end("end2"));const second=fold.copilotTerminals()![0]!;
 expect(first.publicMessages).toEqual([copilotPublicMessage(message("first"))!.fingerprint]);expect(second.publicMessages).toEqual([copilotPublicMessage(message("second"))!.fingerprint]);expect(second.eventId).not.toBe(first.eventId);expect(fold.snapshot()).toEqual({count:0,items:[]});
 const binding=copilotTerminalBindings({source:{paneId:"p",instanceId:"i",kind:"copilot",sessionId:"s"},namespace:"n",facts:[second],current:()=>true,verify:async()=>true}).bindings[0]!;
 expect(binding.item.hasTranscript).toBe(true);expect(binding.entries(message("first"))).toEqual([]);expect(binding.entries(message("second"))).toMatchObject([{kind:"say",text:"second"}]);expect(binding.entries(message("tampered"))).toEqual([]);
});
it("rejects parent/foreign/missing/nontext/private/ephemeral/tool and numeric-only payloads",async()=>{
 const good=message();for(const bad of [{...good,data:{...good.data,parentToolCallId:undefined}},{...good,data:{...good.data,content:7}},{...good,data:{...good.data,content:undefined,totalTokens:123}},{...good,data:{...good.data,phase:"reasoning"}},{...good,ephemeral:true},{...good,hidden:true},{...good,type:"tool.execution_complete"},{...good,data:{...good.data,messageId:null}}])expect(copilotPublicMessage(bad)).toBeUndefined();
 const fold=new NativeSubagentRecords("copilot","parent");fold.consume(start());fold.consume({...good,data:{...good.data,parentToolCallId:"other"}});fold.consume(end());expect(fold.copilotTerminals()![0]!.publicMessages).toEqual([]);
 const binding=copilotTerminalBindings({source:{paneId:"p",instanceId:"i",kind:"copilot",sessionId:"s"},namespace:"n",facts:fold.copilotTerminals()!,current:()=>true,verify:async()=>true}).bindings[0]!;expect(binding.item.hasTranscript).toBeUndefined();await expect(binding.openRecord("usage",()=>true)).resolves.toBeUndefined();
});
it("bounds retained fingerprints to 64 per run and 4096 globally without inventing current work or numbers",()=>{
 const fold=new NativeSubagentRecords("copilot","parent");for(let run=0;run<65;run++){const id="c"+run;fold.consume({...start("s"+run),data:{toolCallId:id}});for(let n=0;n<65;n++)fold.consume({...message("public","m"+run+"_"+n),data:{...message().data,parentToolCallId:id}});fold.consume({...end("e"+run),data:{toolCallId:id}});}
 const facts=fold.copilotTerminals()!;expect(facts.reduce((n,f)=>n+(f.publicMessages?.length??0),0)).toBe(4096);expect(facts[0]!.publicOmitted).toBe(true);expect(facts[64]!.publicMessages).toEqual([]);expect(facts[64]!.publicOmitted).toBe(true);expect(fold.snapshot()).toEqual({count:0,items:[]});
});
it("clips public text while retaining its full-content fingerprint",()=>{const row=message("x".repeat(5000));expect(copilotPublicMessage(row)!.entry).toMatchObject({text:"x".repeat(4000),truncated:true});expect(copilotPublicMessage({...row,data:{...row.data,content:row.data.content+"y"}})!.fingerprint).not.toBe(copilotPublicMessage(row)!.fingerprint);});

it("rejects conflicting duplicate event IDs within a run without changing terminal counts; identical replay is deduplicated",()=>{
 const fold=new NativeSubagentRecords("copilot","parent");fold.consume(start());fold.consume(message("same"));fold.consume(message("same"));fold.consume(end());expect(fold.copilotTerminals()![0]!.publicMessages).toHaveLength(1);
 const conflict=new NativeSubagentRecords("copilot","parent");conflict.consume(start());conflict.consume(message("first"));conflict.consume(message("conflicting"));conflict.consume(message("later","later"));conflict.consume(end());expect(conflict.copilotTerminals()![0]).toMatchObject({publicMessages:[],publicOmitted:true});expect(conflict.snapshot()).toEqual({count:0,items:[]});
});
