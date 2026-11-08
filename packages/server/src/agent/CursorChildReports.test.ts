import {expect,it} from "vitest";
import {cursorChildReport} from "./CursorChildReports.js";
const parent="10000000-0000-4000-8000-000000000001",child="10000000-0000-4000-8000-000000000002";
const stop={type:"cursor_child",phase:"stop",kind:"cursor",paneId:"p",sessionId:parent,parentId:parent,childId:child,contextSessionId:parent,logicalId:"task",childType:"Explore",status:"completed",model:"parent-model",reasoningEffort:"high"};
it("keeps terminal identity but never promotes parent-common model/effort",()=>{
 const report=cursorChildReport({...stop,settingsObserved:true,prompt:"SECRET",summary:"SECRET",path:"/SECRET",model_params:[{id:"effort",value:"high"}]});
 expect(report).toMatchObject({phase:"stop",settingsObserved:false,parentId:parent,childId:child});expect(report).not.toHaveProperty("model");expect(report).not.toHaveProperty("reasoningEffort");expect(JSON.stringify(report)).not.toContain("SECRET");
});
it("only explicit child-self context provides a whole settings snapshot, including missing-field clearing",()=>{
 expect(cursorChildReport({...stop,contextSessionId:child})).toMatchObject({settingsObserved:true,model:"parent-model",reasoningEffort:"high"});
 const missing=cursorChildReport({...stop,contextSessionId:child,model:undefined,reasoningEffort:undefined});expect(missing).toMatchObject({settingsObserved:true});expect(missing).not.toHaveProperty("model");expect(missing).not.toHaveProperty("reasoningEffort");
});
it("rejects parent observation context, malformed ownership and arbitrary IPC data",()=>{
 const event={type:"cursor_child",phase:"observation",kind:"cursor",paneId:"p",sessionId:child,childId:child,contextSessionId:child,generationId:"generation-1",model:"explicit-child"};
 expect(cursorChildReport(event)).toMatchObject({phase:"observation",model:"explicit-child"});
 for(const extra of [{contextSessionId:parent},{sessionId:parent},{childId:"../x"},{parentId:child},{agentPid:-1},{generationId:""},{kind:"claude"}])expect(cursorChildReport({...event,...extra})).toBeUndefined();
});
