import { expect, it } from "vitest";
import { AgentSubagentControlParams, AgentSubagentSendParams } from "./subagentControl.js";
const paneId="10000000-0000-4000-8000-000000000001", id="10000000-0000-4000-8000-000000000002";
it("accepts only bounded IDs/text and client request identity, never endpoint/path/model overrides",()=>{
  const input={paneId,agentId:id,leaseId:id,requestId:id,text:"generated instruction"};
  expect(AgentSubagentSendParams.parse(input)).toEqual(input);
  for(const extra of [{path:"/tmp/x"},{model:"other"},{endpoint:"http://example.test"},{approvalPolicy:"never"}])
    expect(AgentSubagentSendParams.safeParse({...input,...extra}).success).toBe(false);
  for(const text of ["", " ", "a\0b", "x".repeat(16_385)]) expect(AgentSubagentSendParams.safeParse({...input,text}).success).toBe(false);
  expect(AgentSubagentControlParams.safeParse({paneId,agentId:"../other"}).success).toBe(false);
});
