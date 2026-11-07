import {z} from "zod";
export const USAGE_ASSESSMENT_RUBRIC = [
 {id:"direction",label:"目的・受入条件",rule:"達成したい目的と、結果を判断する条件を具体的に共有しているか"},
 {id:"scope",label:"作業範囲と委譲",rule:"目的に合う作業範囲・役割・引継ぎを定めているか。委譲件数そのものは評価しない"},
 {id:"verification",label:"検証と結果確認",rule:"作業に合う検証を依頼し、報告と未確認事項を区別して次の判断に使っているか"},
 {id:"adaptation",label:"障害への対応・再計画",rule:"記録された障害や変更に対して原因確認・修正・再計画を具体的に行っているか。障害がなければ未評価でよい"},
 {id:"resources",label:"資源選択の理由",rule:"目的と制約に対してモデル・ツール・実行方法の選択理由や取捨選択を説明しているか。安さ・多ツール・高キャッシュを無条件加点しない"},
] as const;
const id=z.enum(["direction","scope","verification","adaptation","resources"]);
export const UsageAssessment=z.object({criteria:z.array(z.object({
 id,score:z.number().int().min(0).max(4).nullable(),reason:z.string().min(1).max(800),
 evidenceRef:z.string().max(128).optional(),evidenceQuote:z.string().max(500).optional(),
 improvement:z.string().max(800).default(""),priority:z.enum(["high","medium","low"]).default("medium"),
})).max(5)}).refine(value=>new Set(value.criteria.map(c=>c.id)).size===value.criteria.length,"評価項目が重複しています");
export type UsageAssessment=z.infer<typeof UsageAssessment>;
/** Invalid/legacy assessment is absent, never an inferred zero. Grade is always computed here. */
export function usageAssessmentSummary(value:unknown){
 const parsed=UsageAssessment.safeParse(value),known=parsed.success?parsed.data.criteria:[];
 const criteria=USAGE_ASSESSMENT_RUBRIC.map(r=>({...r,...known.find(c=>c.id===r.id),score:known.find(c=>c.id===r.id)?.score??null,reason:known.find(c=>c.id===r.id)?.reason??"この項目の評価根拠は未取得です。"}));
 const assessed=criteria.filter(c=>c.score!==null),score=assessed.length>=3?Math.round(assessed.reduce((sum,c)=>sum+c.score!,0)/assessed.length/4*100):null;
 return {criteria,assessed:assessed.length,total:USAGE_ASSESSMENT_RUBRIC.length,score,grade:score===null?null:score>=80?"A":score>=60?"B":score>=40?"C":score>=20?"D":"E"};
}
