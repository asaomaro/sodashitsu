import {expect,it} from "vitest";
import {cursorChildLineage,cursorChildStop,cursorChildStopMatches} from "./CursorChildMetadata.js";
const parent="12345678-1234-4234-8234-123456789012",child="12345678-1234-4234-8234-123456789013";
const metadata=(overrides:Record<string,unknown>={})=>Buffer.from(JSON.stringify({agentId:child,createdAt:1000,subagentInfo:{parentAgentId:parent,rootParentAgentId:parent,toolCallId:"tool-generated",typeName:"Explore"},lastUsedModel:"must-not-infer",blobEncryptionKey:"generated-not-returned",...overrides})).toString("hex");
const stop=(extra:Record<string,unknown>={})=>({hook_event_name:"subagentStop",subagent_id:"logical-child",subagent_type:"Explore",parent_conversation_id:parent,child_conversation_id:child,conversation_id:parent,status:"completed",model_id:"parent-model",model_params:[{id:"effort",value:"high"}],...extra});
it("decodes exact installed metadata schema but returns only direct-child lineage",()=>{
 expect(cursorChildLineage(metadata(),parent,child)).toEqual({id:child,parentId:parent,rootParentId:parent,toolCallId:"tool-generated",type:"Explore",createdAt:1000});
 expect(cursorChildLineage(metadata(),parent,child)).not.toHaveProperty("model");
});
it("rejects wrong parent/root/child, malformed/oversized metadata and unsafe labels",()=>{
 for(const value of [metadata({agentId:parent}),metadata({subagentInfo:{parentAgentId:parent,rootParentAgentId:child,toolCallId:"tool",typeName:"Explore"}}),metadata({subagentInfo:{parentAgentId:parent,rootParentAgentId:parent,toolCallId:"tool",typeName:"bad\u001b"}}),"ff", "nothex", "aa".repeat(131073)])expect(cursorChildLineage(value,parent,child)).toBeUndefined();
});
it("records completion without attributing common parent model/effort to the child",()=>{
 expect(cursorChildStop(stop())).toMatchObject({parentId:parent,childId:child,status:"completed",settings:{}});
 expect(cursorChildStop(stop())?.settings).not.toHaveProperty("model");expect(cursorChildStop(stop())?.settings).not.toHaveProperty("reasoningEffort");
});
it("accepts only explicit child-self settings and replaces missing fields rather than inventing defaults",()=>{
 expect(cursorChildStop(stop({conversation_id:child}))?.settings).toEqual({model:"parent-model",modelBasis:"session",reasoningEffort:"high",reasoningEffortBasis:"session"});
 expect(cursorChildStop(stop({conversation_id:child,model_id:undefined,model:undefined,model_params:[]}))?.settings).toEqual({});
 expect(cursorChildStop(stop({conversation_id:child,session_id:parent}))?.settings).toEqual({});
 expect(cursorChildStop(stop({conversation_id:child,model_params:[{id:"effort",value:"low"},{id:"effort",value:"high"}]}))?.settings).not.toHaveProperty("reasoningEffort");
});
it("never treats Start permission hook, unbound children or unknown terminal status as completion",()=>{
 for(const value of [stop({hook_event_name:"subagentStart"}),stop({child_conversation_id:undefined}),stop({child_conversation_id:parent}),stop({status:"running"})])expect(cursorChildStop(value)).toBeUndefined();
});
it("requires Stop, exact direct lineage and the actual child terminal marker to agree",()=>{
 const report=cursorChildStop(stop())!,lineage=cursorChildLineage(metadata(),parent,child)!;
 expect(cursorChildStopMatches(report,lineage,"completed")).toBe(true);
 for(const other of [{...lineage,id:parent},{...lineage,parentId:child},{...lineage,rootParentId:child},{...lineage,type:"different-role"}])expect(cursorChildStopMatches(report,other,"completed")).toBe(false);
 expect(cursorChildStopMatches(report,lineage,"aborted")).toBe(false);expect(cursorChildStopMatches(report,lineage,undefined)).toBe(false);
});
