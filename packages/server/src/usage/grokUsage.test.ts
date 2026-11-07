import{describe,expect,it}from'vitest';
import{grokSessionUsage}from'./grokUsage.js';
const fixture=()=>({sessionId:'owned-session',updatedAt:'2026-11-07T00:00:00Z',session:{inputTokens:100,outputTokens:20,cachedReadTokens:30,cacheCreationTokens:10,reasoningTokens:5,totalTokens:120,modelCalls:1,costUsdTicks:123456789,primaryModelId:'dominant-ledger-model'},turns:[{turnNumber:1,inputTokens:99999}],primaryModelId:'not-current'});
describe('Grok session usage ledger',()=>{
 it('reads the cumulative session once, separates cached input and converts only reported USD ticks',()=>{
  expect(grokSessionUsage(fixture(),'owned-session')).toEqual({model:null,source:'grok-usage',updatedAt:Date.parse('2026-11-07T00:00:00Z'),tokens:{basis:'cumulative',input:60,output:20,cacheRead:30,cacheWrite:10,reasoning:5,total:120},costUsd:0.0123456789,costBasis:'reported',costAsOf:Date.parse('2026-11-07T00:00:00Z')});
 });
 it('never fills missing accounting with zero',()=>{
  for(const key of ['inputTokens','outputTokens','cachedReadTokens','cacheCreationTokens','reasoningTokens','totalTokens','modelCalls']){
   const value=fixture();delete(value.session as Record<string,unknown>)[key];expect(grokSessionUsage(value,'owned-session')).toBeNull();
  }
 });
 it('preserves explicit zero tokens but treats zero or absent cost as unreported',()=>{
  const value=fixture();for(const key of Object.keys(value.session))(value.session as Record<string,unknown>)[key]=0;
  const result=grokSessionUsage(value,'owned-session');expect(result?.tokens).toMatchObject({input:0,output:0,total:0});expect(result).not.toHaveProperty('costUsd');
  const absent=fixture();delete(absent.session as Record<string,unknown>).costUsdTicks;expect(grokSessionUsage(absent,'owned-session')).not.toHaveProperty('costUsd');
 });
 it('marks partial cost and incomplete usage separately',()=>{
  const value={...fixture(),session:{...fixture().session,costIsPartial:true,usageIsIncomplete:true}};
  expect(grokSessionUsage(value,'owned-session')).toMatchObject({partial:true,costPartial:true,costUsd:0.0123456789});
 });
 it.each([{},null,{...fixture(),sessionId:'other-session'},{...fixture(),updatedAt:'bad'},{...fixture(),session:{...fixture().session,totalTokens:119}},{...fixture(),session:{...fixture().session,cachedReadTokens:101}},{...fixture(),session:{...fixture().session,costUsdTicks:-1}},{...fixture(),session:{...fixture().session,inputTokens:Number.MAX_SAFE_INTEGER+1}},{...fixture(),session:{...fixture().session,costIsPartial:'false'}}])('rejects wrong parent or invalid ledger',value=>expect(grokSessionUsage(value,'owned-session')).toBeNull());
 it('does not invent current model, context, effort, approval, quota or child breakdown',()=>{
  const result=grokSessionUsage({...fixture(),primaryModelId:'grok-current',modelUsage:{child:{inputTokens:999}},executionSettings:{reasoningEffort:'high'}},'owned-session');
  expect(result?.model).toBeNull();for(const key of ['contextTokens','contextWindowTokens','executionSettings','breakdown','credits','reasoningEffort'])expect(result).not.toHaveProperty(key);
 });
});
