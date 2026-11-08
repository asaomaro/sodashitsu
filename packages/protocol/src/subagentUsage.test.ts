import {expect,it} from "vitest";
import {AgentSubagentUsageParams,type AgentSubagentUsageResult} from "./subagentUsage.js";
it("accepts only child identifiers, never a client path or parent usage selection",()=>{
 expect(AgentSubagentUsageParams.parse({paneId:"owned-pane",agentId:"owned-child"})).toEqual({paneId:"owned-pane",agentId:"owned-child"});
 for(const extra of [{file:"/outside"},{sessionId:"parent"},{offset:0}])expect(AgentSubagentUsageParams.safeParse({paneId:"pane",agentId:"child",...extra}).success).toBe(false);
 expect(AgentSubagentUsageParams.safeParse({paneId:"pane",agentId:""}).success).toBe(false);
});
it("keeps an unavailable value distinct from an explicitly reported zero",()=>{
 const unavailable:AgentSubagentUsageResult={status:"unavailable"};
 const zero:AgentSubagentUsageResult={status:"ok",usage:{source:"rollout",consumptionScope:"self",tokens:{basis:"transcript",total:0}}};
 expect(unavailable).not.toHaveProperty("usage");expect(zero.usage?.tokens?.total).toBe(0);
});
