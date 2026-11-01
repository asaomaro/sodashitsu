import {expect,it} from "vitest";
import {ResourceAppReportParams} from "./resourceMonitor.js";
it("accepts the persisted UUID device identity used by the native assistant",()=>{
 const report={deviceId:"eb2ccde0-1383-4842-97ba-1227fd099ee2",platform:"win32",hostId:null,processes:[{pid:123,startedAt:1000,name:"Browser",cpuPercent:null,rssBytes:1024}]};
 expect(ResourceAppReportParams.parse(report)).toMatchObject({deviceId:report.deviceId});
 expect(ResourceAppReportParams.safeParse({...report,deviceId:"a".repeat(32)}).success).toBe(false);
});
