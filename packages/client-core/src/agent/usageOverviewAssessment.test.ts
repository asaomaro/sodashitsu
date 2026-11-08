import { describe, it, expect } from "vitest";
import type { UsageInsights } from "@sodashitsu/protocol";
import { usageOverviewAssessment } from "./usageOverviewAssessment.js";
const scope = (tools:number,known:number,errors:number,partial=false,collecting=false) => ({totals:{tools,knownResults:known,errors} as UsageInsights["totals"],partial,collecting});
describe("overview numeric assessment",()=>{
 it("uses all formal known results, never a bounded tool breakdown or unrelated tokens/activity",()=>{
  const d={...scope(500,400,20),tools:[{calls:1,success:1}],activity:{started:1,completed:900},cacheRead:999999};
  expect(usageOverviewAssessment(d)).toMatchObject({score:95,grade:"A",success:380,failed:20,unknown:100,coveragePct:80});
 });
 it.each([[100,5,95,"A"],[100,6,94,"B"],[100,10,90,"B"],[100,11,89,"C"],[100,20,80,"C"],[100,21,79,"D"],[100,40,60,"D"],[100,41,59,"E"],[200,11,94,"B"],[100,43,57,"E"],[100,71,29,"E"]])("keeps threshold and displayed score coherent: %i / %i",(known,errors,score,grade)=>{
  expect(usageOverviewAssessment(scope(known,known,errors))).toMatchObject({score,grade});
 });
 it("does not turn missing results or low samples into success or an E grade",()=>{
  for(const d of [scope(0,0,0),scope(100,0,0),scope(100,9,0)])expect(usageOverviewAssessment(d)).toMatchObject({score:null,grade:null});
  expect(usageOverviewAssessment(scope(10,10,10))).toMatchObject({score:0,grade:"E"});
 });
 it.each([[1,2,0],[2,1,2],[-1,0,0],[10,10,NaN],[10,Infinity,0],[10,9.5,0],[Number.MAX_SAFE_INTEGER+1,10,0]])("rejects inconsistent or non-integral counters",(tools,known,failed)=>{
  expect(usageOverviewAssessment(scope(tools,known,failed))).toMatchObject({score:null,grade:null,tools:null,known:null,coveragePct:null});
 });
 it("marks partial/collecting scores without manufacturing completeness",()=>{
  for(const d of [scope(20,10,0,true),scope(20,10,0,false,true)])expect(usageOverviewAssessment(d)).toMatchObject({score:100,grade:"A",provisional:true,unknown:10,coveragePct:50});
 });
});
