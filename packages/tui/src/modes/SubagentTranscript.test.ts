import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentSubagentTranscriptResult } from "@sodashitsu/protocol";
import type { RequestPort } from "../term/PaneRegistry.js";
import { SubagentTranscript } from "./SubagentTranscript.js";
const opened: SubagentTranscript[]=[];
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{for(const view of opened.splice(0))view.dispose();vi.useRealTimers();});
const result=(over:Partial<AgentSubagentTranscriptResult>={}):AgentSubagentTranscriptResult=>({status:"ok",entries:[{kind:"say",text:"Generated child reply"}],offset:10,reset:false,omittedBefore:false,running:false,...over});
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function open(request:ReturnType<typeof vi.fn>,scope:()=>string|null=()=>"scope"){
 const view=new SubagentTranscript("child","Child task","parent",{request} as unknown as RequestPort,scope,"scope",vi.fn());opened.push(view);return view;
}
it("reads only transcript RPC with offsets, never overlaps and clears on dispose",async()=>{
 let resolve!:(value:AgentSubagentTranscriptResult)=>void;const request=vi.fn(()=>new Promise<AgentSubagentTranscriptResult>(r=>{resolve=r}));
 const view=open(request);await vi.advanceTimersByTimeAsync(4500);expect(request).toHaveBeenCalledTimes(1);
 resolve(result());await flush();expect(view.lines(80).join("\n")).toContain("Generated child reply");
 await vi.advanceTimersByTimeAsync(1500);expect(request.mock.calls).toEqual([["agent.subagent_transcript",{paneId:"parent",agentId:"child"}],["agent.subagent_transcript",{paneId:"parent",agentId:"child",offset:10}]]);
 view.dispose();resolve(result({entries:[{kind:"say",text:"LATE"}]}));await flush();await vi.advanceTimersByTimeAsync(4500);expect(request).toHaveBeenCalledTimes(2);expect(view.lines(80).join("\n")).not.toContain("LATE");
});
it.each(["scope change","close"])("discards a late read after %s",async reason=>{
 let scope:string|null="scope",resolve!:(value:AgentSubagentTranscriptResult)=>void;
 const request=vi.fn(()=>new Promise<AgentSubagentTranscriptResult>(r=>{resolve=r})),view=open(request,()=>scope);
 if(reason==="close")view.dispose();else scope=null;
 resolve(result());await flush();await vi.advanceTimersByTimeAsync(4500);expect(request).toHaveBeenCalledTimes(1);expect(view.lines(80).join("\n")).not.toContain("Generated child reply");
});
it("bounds retained rows/text, sanitizes terminal controls, and replaces reset data",async()=>{
 const request=vi.fn().mockResolvedValueOnce(result({entries:Array.from({length:900},(_,i)=>({kind:"say",text:`generated-${i}`}))})).mockResolvedValueOnce(result({reset:true,entries:[{kind:"tool",name:"Safe\u001bname",text:"generated\u0007text"}]}));
 const view=open(request);await flush();let text=view.lines(80).join("\n");expect(text).not.toContain("generated-99\n");expect(text).toContain("generated-899");expect(text).toContain("省いて");
 await vi.advanceTimersByTimeAsync(1500);text=view.lines(80).join("\n");expect(text).not.toContain("generated-899");expect(text).not.toMatch(/[\u001b\u0007]/);expect(text).toContain("Safe name");
 request.mockResolvedValue(result({reset:true,entries:[{kind:"say",text:"x".repeat(1024*1024+1)}]}));await vi.advanceTimersByTimeAsync(1500);expect(view.lines(80).join("\n").length).toBeLessThan(200);
});
it("stops after not_found and keeps unprovided records distinct from an empty history",async()=>{
 const request=vi.fn().mockRejectedValue({code:"not_found"}),view=open(request);await flush();await vi.advanceTimersByTimeAsync(4500);expect(request).toHaveBeenCalledTimes(1);expect(view.lines(80).join("\n")).toContain("無効");
});
