import { expect, it } from "vitest";
import type { Pane } from "@sodashitsu/protocol";
import { resolveVerifiedSubagentTarget } from "./VerifiedSubagentTarget.js";
it("separates current verified membership from transcript/usage permission and preserves original start time",()=>{
 const p={id:"p",agent:{kind:"muse",instanceId:"instance",subagents:{count:1,items:[{id:"child",startedAt:17,depth:1,hasTranscript:false}]}},agentSession:{kind:"muse",sessionId:"parent"}} as Pane;
 let verified=true;const session={getPane:()=>p,hasVerifiedAgentSession:()=>verified};
 const target=resolveVerifiedSubagentTarget(session,"p","child");expect(target).toMatchObject({kind:"muse",recordId:"child",startedAt:17});expect(target?.current()).toBe(true);
 expect(resolveVerifiedSubagentTarget(session,"p","parent")).toBeUndefined();expect(resolveVerifiedSubagentTarget(session,"p","absent")).toBeUndefined();
 verified=false;expect(target?.current()).toBe(false);expect(resolveVerifiedSubagentTarget(session,"p","child")).toBeUndefined();verified=true;
 p.agentSession!.kind="claude";expect(target?.current()).toBe(false);p.agentSession!.kind="muse";
 p.agent!.instanceId="new";expect(target?.current()).toBe(false);p.agent!.instanceId="instance";
 p.agent!.subagents!.items![0]!.startedAt=18;expect(target?.current()).toBe(false);
 p.agent!.subagents!.items=[];expect(target?.current()).toBe(false);
});
