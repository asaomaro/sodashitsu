import type {AgentUsage} from '@sodashitsu/protocol';

type Usage=Omit<AgentUsage,'paneId'|'kind'>;
const object=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
/** Grok's persisted session ledger, never a sum of parent plus child ledgers or per-turn deltas. */
export function grokSessionUsage(value:unknown,sessionId:string):Usage|null {
 const file=object(value),session=object(file?.session);
 if(!file||file.sessionId!==sessionId||!session||typeof file.updatedAt!=='string'||file.updatedAt.length>64)return null;
 const at=Date.parse(file.updatedAt);
 if(!Number.isFinite(at)||at<0)return null;
 const fields=['inputTokens','outputTokens','cachedReadTokens','cacheCreationTokens','reasoningTokens','totalTokens','modelCalls'] as const;
 if(fields.some(key=>!count(session[key])))return null;
 if(['costIsPartial','usageIsIncomplete'].some(key=>session[key]!==undefined&&typeof session[key]!=='boolean'))return null;
 const input=session.inputTokens as number,output=session.outputTokens as number,cacheRead=session.cachedReadTokens as number,cacheWrite=session.cacheCreationTokens as number;
 if(!Number.isSafeInteger(input+output)||session.totalTokens!==input+output||!Number.isSafeInteger(cacheRead+cacheWrite)||cacheRead+cacheWrite>input)return null;
 if(session.costUsdTicks!==undefined&&!count(session.costUsdTicks))return null;
 const ticks=session.costUsdTicks as number|undefined;
 return{
  // primaryModelId is the ledger's dominant model, not proof of the last/current parent model.
  model:null,source:'grok-usage',updatedAt:at,
  tokens:{basis:'cumulative',input:input-cacheRead-cacheWrite,output,cacheRead,cacheWrite,reasoning:session.reasoningTokens as number,total:session.totalTokens as number},
  ...(session.usageIsIncomplete===true?{partial:true}:{}),
  ...(session.costIsPartial===true?{costPartial:true}:{}),
  // xAI normalizes 0 USD ticks to unreported; no price table or token-derived estimation.
  ...(ticks!==undefined&&ticks>0?{costUsd:ticks/1e10,costBasis:'reported',costAsOf:at}:{}),
 };
}
