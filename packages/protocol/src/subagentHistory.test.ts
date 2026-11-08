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
