import {expect,it} from "vitest";
import {usageAssessmentSummary,USAGE_ASSESSMENT_RUBRIC} from "./usageAssessment.js";
const row=(id:string,score:number|null)=>({id,score,reason:'生成記録からの観測',evidenceRef:'work.items.0.messages.0',evidenceQuote:'生成した作業記録',improvement:'結果の根拠を共有',priority:'high'});
it('keeps legacy, absent, insufficient and malformed assessments ungraded rather than zero or E',()=>{
 for(const v of [undefined,null,{}, {criteria:[row('direction',4),row('scope',4)]},{criteria:[row('direction',4),row('direction',0)]},{criteria:[row('direction',5)]}])expect(usageAssessmentSummary(v)).toMatchObject({score:null,grade:null});
 expect(usageAssessmentSummary({criteria:[row('direction',4),row('scope',null),row('verification',null)]}).assessed).toBe(1);
});
it.each([[20,100,'A'],[16,80,'A'],[15,75,'B'],[12,60,'B'],[11,55,'C'],[8,40,'C'],[7,35,'D'],[4,20,'D'],[3,15,'E'],[0,0,'E']])('derives fixed grade from known rubric scores sum=%s',(sum,score,grade)=>{
 let left=Number(sum);const criteria=USAGE_ASSESSMENT_RUBRIC.map(r=>{const v=Math.min(left,4);left-=v;return row(r.id,v);});expect(usageAssessmentSummary({criteria,score:999,grade:'A'})).toMatchObject({assessed:5,total:5,score,grade});
});
it('normalizes the observed three criteria and explicitly retains unknown coverage',()=>{
 const a=usageAssessmentSummary({criteria:[row('direction',4),row('scope',3),row('verification',2)]});expect(a).toMatchObject({assessed:3,total:5,score:75,grade:'B'});expect(a.criteria.filter(c=>c.score===null)).toHaveLength(2);
});
