import { expect, it } from "vitest";
import { AgentSubagentHistoryParams } from "./subagentHistory.js";
const paneId="12345678-1234-4234-8234-123456789012";
it("accepts only bounded same-pane history pagination, never a filesystem path",()=>{
 expect(AgentSubagentHistoryParams.parse({paneId,offset:0,limit:64})).toEqual({paneId,offset:0,limit:64});
 for(const extra of [{offset:257},{offset:-1},{limit:65},{limit:0},{revision:"invalid"},{path:"/private/record"}])expect(AgentSubagentHistoryParams.safeParse({paneId,...extra}).success).toBe(false);
});
