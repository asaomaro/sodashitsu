import {UsageAssessment,USAGE_ASSESSMENT_RUBRIC,type UsageReportDocument} from "@sodashitsu/protocol";
const record=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
/** Only existing bounded work excerpts are evidence; counters alone do not describe good usage. */
export function usageAssessmentEvidence(data:unknown):Map<string,string>{
 const result=new Map<string,string>(),work=record(record(data)?.work),items=work?.items;if(!Array.isArray(items))return result;
 for(const [i,value] of items.slice(0,12).entries()){
  const item=record(value);if(item?.available!==true)continue;
  if(Array.isArray(item.messages))for(const [j,value] of item.messages.slice(0,4).entries()){
   const message=record(value);if((message?.role==="user"||message?.role==="assistant")&&typeof message.text==="string")result.set(`work.items.${i}.messages.${j}`,message.text.slice(0,800));
  }
  if(Array.isArray(item.todos))for(const [j,value] of item.todos.slice(0,4).entries()){
   const todo=record(value);if(typeof todo?.text==="string")result.set(`work.items.${i}.todos.${j}`,todo.text.slice(0,300));
  }
  const summary=record(item.summary);if(summary?.stale===false&&typeof summary.text==="string")result.set(`work.items.${i}.summary`,summary.text.slice(0,1200));
 }
 return result;
}
export function validateUsageAssessment(document:UsageReportDocument,data:unknown):UsageReportDocument {
 const parsed=UsageAssessment.safeParse(document.assessment);if(!parsed.success)return document;
 const sources=usageAssessmentEvidence(data);
 return {...document,assessment:{criteria:parsed.data.criteria.map(c=>{
  if(c.score===null)return c;
  const source=c.evidenceRef?sources.get(c.evidenceRef):undefined,quote=c.evidenceQuote?.trim();
  return source&&quote&&quote.length>=4&&source.includes(quote)?{...c,evidenceQuote:quote}:{id:c.id,score:null,reason:"実際に渡した作業記録の参照・引用を確認できないため未評価です。",improvement:"",priority:"medium" as const};
 })}};
}
export const usageAssessmentInstruction = "\n同じ応答にassessment:{criteria:[{id,score,reason,evidenceRef,evidenceQuote,improvement,priority}]}を追加してください。エージェントの使い方を次の固定5項目で評価します: "+JSON.stringify(USAGE_ASSESSMENT_RUBRIC)+"。scoreは0〜4の整数またはnull。0は明示的な不適合、1は不十分、2は一部適合、3は適合、4は明確な適合と振り返りの根拠がある場合です。各項目は利用目的・制約と提供された作業記録を根拠に判断し、記録がないことを0点や失敗と扱わずnull/未評価にしてください。ツール数・サブエージェント数・キャッシュ率・安さ・エラーの少なさを単独の加点要因にしないでください。検証したという自己報告と独立した成果検証は区別します。根拠はwork.itemsのavailable=trueのmessages/todos、stale=falseのsummaryに限定し、evidenceRefはwork.items.0.messages.0、work.items.0.todos.0、work.items.0.summaryのような実配列位置、evidenceQuoteはその本文から4〜500文字の実引用としてください。異なる参照や引用を作らないでください。数値のみ・ラベルのみでは採点せずnullにしてください。reasonは判断理由、improvementは具体的な次の行動、priorityはhigh/medium/low。scoreやgradeの総合値は出力せず、各項目の根拠の有無だけを評価してください。reasonとimprovementは各800文字以内、assessment.criteriaは重複idなし最大5件。取得範囲や古い記録の限界はlimitationsにも記してください。これは作業成果の品質を実測した点数ではありません。\n";
