import { expect, it } from "vitest";
import { AgentSubagentHistoryParams,AgentSubagentHistoryTranscriptParams,AgentSubagentHistoryUsageParams } from "./subagentHistory.js";
const paneId="12345678-1234-4234-8234-123456789012";
it("accepts only bounded same-pane history pagination, never a filesystem path",()=>{
 expect(AgentSubagentHistoryParams.parse({paneId,offset:0,limit:64})).toEqual({paneId,offset:0,limit:64});
 for(const extra of [{offset:257},{offset:-1},{limit:65},{limit:0},{revision:"invalid"},{path:"/private/record"}])expect(AgentSubagentHistoryParams.safeParse({paneId,...extra}).success).toBe(false);
});

it("requires an exact server-issued history selection and rejects missing selectors or current-route extras",()=>{
 const params={paneId,agentId:"child",entryId:"12345678-1234-4234-8234-123456789013"};
 expect(AgentSubagentHistoryTranscriptParams.parse({...params,offset:0})).toEqual({...params,offset:0});expect(AgentSubagentHistoryUsageParams.parse(params)).toEqual(params);
 for(const schema of [AgentSubagentHistoryTranscriptParams,AgentSubagentHistoryUsageParams])for(const extra of [{entryId:undefined},{entryId:"bad"},{path:"/outside"},{current:true},{agentId:"../child"}])expect(schema.safeParse({...params,...extra}).success).toBe(false);
});
it("keeps formal tool call IDs opaque while requiring exact history selectors",()=>{
 const entryId="12345678-1234-4234-8234-123456789013";
 for(const schema of [AgentSubagentHistoryTranscriptParams,AgentSubagentHistoryUsageParams]){
  for(const agentId of ['call:1','call.part:1','call_1-2',':event.1'])expect(schema.parse({paneId,agentId,entryId}).agentId).toBe(agentId);
  for(const agentId of ['../child','child/1','child\\1','child%2F1','child 1','child\n1','x'.repeat(129)])expect(schema.safeParse({paneId,agentId,entryId}).success).toBe(false);
  expect(schema.safeParse({paneId,agentId:'call:1'}).success).toBe(false);
 }
});
