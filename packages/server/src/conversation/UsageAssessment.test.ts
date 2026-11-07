import {expect,it} from "vitest";
import {usageAssessmentSummary,type UsageReportDocument} from "@sodashitsu/protocol";
import {usageAssessmentEvidence,validateUsageAssessment} from "./UsageAssessment.js";
const quote='目的を明示して検証結果を確認する';
const document=(ref='work.items.0.messages.0',evidenceQuote=quote):UsageReportDocument=>({summary:'生成',work:[],patterns:[],recommendations:[],limitations:[],assessment:{criteria:['direction','scope','verification'].map(id=>({id:id as 'direction',score:4,reason:'生成記録の根拠',evidenceRef:ref,evidenceQuote,improvement:'確認した結果を共有する',priority:'medium'}))}});
const data={work:{items:[{available:true,messages:[{role:'user',text:quote}]}]}};
it('retains only an exact provided excerpt reference and literal quote',()=>{
 const result=validateUsageAssessment(document(),data);expect(usageAssessmentSummary(result.assessment)).toMatchObject({score:100,grade:'A',assessed:3});
 for(const d of [document('work.items.1.messages.0'),document('work.items.0.messages.0','存在しない検証結果'),document('groups.0'),document('work.items.0.messages.0','')])expect(usageAssessmentSummary(validateUsageAssessment(d,data).assessment)).toMatchObject({score:null,grade:null,assessed:0});
});
it('never evaluates numeric-only, unavailable work, or stale saved summaries',()=>{
 for(const d of [{groups:[{tokens:999,tools:9999,cacheRatio:100,costUsd:0}]},{work:{items:[{available:false,messages:[{role:'user',text:quote}]}]}},{work:{items:[{available:true,summary:{stale:true,text:quote}}]}}])expect(usageAssessmentSummary(validateUsageAssessment(document(),d).assessment).score).toBeNull();
 expect(usageAssessmentEvidence({work:{items:[{available:true,summary:{stale:false,text:quote},todos:[{text:quote}]}]}}).size).toBe(2);
});
