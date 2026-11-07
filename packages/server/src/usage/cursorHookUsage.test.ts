import{describe,expect,it}from'vitest';
import{CursorHookUsageAdapter,cursorTurnFields,type CursorTurnUsageReport}from'./cursorHookUsage.js';
const source={paneId:'pane',sessionId:'parent-session',transcriptPath:undefined};
const report=(id='generation-1'):CursorTurnUsageReport=>({paneId:'pane',sessionId:'parent-session',generationId:id,inputTokens:100,outputTokens:20,cacheReadTokens:30,cacheWriteTokens:10,model:'model-id',reasoningEffort:'high'});
describe('Cursor numeric hook observations',()=>{
 it('is unknown before a report and accumulates only reported complete generations',async()=>{
  const a=new CursorHookUsageAdapter(()=> 'verified',()=>123);expect(await a.usageFor(source)).toBeNull();a.note(report());a.note(report('generation-2'));
  expect(await a.usageFor(source)).toEqual({model:'model-id',tokens:{basis:'transcript',input:120,output:40,cacheRead:60,cacheWrite:20,total:240},source:'hook',updatedAt:123,partial:true,reasoningEffort:'high',executionSettings:{reasoningEffort:{value:'high',source:'hook',basis:'hook'}}});
 });
 it('deduplicates a generation without refreshing receipt time or fabricating context',async()=>{
  let now=1;const a=new CursorHookUsageAdapter(()=> 'verified',()=>now);a.note(report());now=2;a.note(report());const u=await a.usageFor(source);expect(u?.tokens.total).toBe(120);expect(u?.updatedAt).toBe(1);
  for(const key of ['contextTokens','contextWindowTokens','contextUsedPct','costUsd','credits','breakdown'])expect(u).not.toHaveProperty(key);
 });
 it('does not sum conflicting reports for the same generation',async()=>{
  const a=new CursorHookUsageAdapter(()=> 'verified');a.note(report());a.note({...report(),outputTokens:21});expect((await a.usageFor(source))?.tokens).toEqual({basis:'transcript'});
 });
 it('keeps missing token metadata unknown and permits later complete data once',async()=>{
  const a=new CursorHookUsageAdapter(()=> 'verified');a.note({paneId:'pane',sessionId:'parent-session',generationId:'generation-1',model:'grok'});expect((await a.usageFor(source))?.tokens).toEqual({basis:'transcript'});
  a.note(report());a.note(report());expect((await a.usageFor(source))?.tokens.total).toBe(120);
 });
 it('does not infer effort from model suffix or preserve stale effort absent in a later hook',async()=>{
  const a=new CursorHookUsageAdapter(()=> 'verified');a.note(report());const second=report('generation-2');delete second.reasoningEffort;second.model='model-high';a.note(second);const u=await a.usageFor(source);expect(u?.model).toBe('model-high');expect(u).not.toHaveProperty('reasoningEffort');expect(u).not.toHaveProperty('executionSettings');
 });
 it('requires parent current proof and resets on instance/session changes',async()=>{
  let current:string|undefined;const a=new CursorHookUsageAdapter(s=>s.sessionId==='parent-session'?current:undefined);
  a.note(report());expect(await a.usageFor(source)).toBeNull();current='instance-1';a.note(report());expect((await a.usageFor(source))?.tokens.total).toBe(120);
  current='instance-2';expect(await a.usageFor(source)).toBeNull();a.note(report());expect((await a.usageFor(source))?.tokens.total).toBe(120);
  a.note({...report('generation-child'),sessionId:'child-session'});expect((await a.usageFor(source))?.tokens.total).toBe(120);current=undefined;expect(await a.usageFor(source)).toBeNull();
 });
 it('drops state on forget/close',async()=>{
  const a=new CursorHookUsageAdapter(()=> 'verified');a.note(report());a.forget('pane');expect(await a.usageFor(source)).toBeNull();a.note(report());a.close();a.note(report('later'));expect(await a.usageFor(source)).toBeNull();
 });
 it('never evicts old generation IDs and re-adds them after reaching the cap',async()=>{
  const a=new CursorHookUsageAdapter(()=> 'verified');for(let i=0;i<4097;i++)a.note(report(`generation-${i}`));a.note(report('generation-0'));expect((await a.usageFor(source))?.tokens).toEqual({basis:'transcript'});
 });
 it('rejects numeric overflow rather than emitting an imprecise total',async()=>{
  const a=new CursorHookUsageAdapter(()=> 'verified');a.note({...report(),inputTokens:Number.MAX_SAFE_INTEGER,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0});a.note(report('next'));expect((await a.usageFor(source))?.tokens).toEqual({basis:'transcript'});
 });
 it.each([{generationId:''},{inputTokens:-1},{inputTokens:39},{outputTokens:undefined},{inputTokens:Number.MAX_SAFE_INTEGER+1},{cacheReadTokens:Infinity}])('ignores incomplete or invalid numeric shape without initial zero',async bad=>{
  const a=new CursorHookUsageAdapter(()=> 'verified');a.note({...report(),...bad} as CursorTurnUsageReport);expect(await a.usageFor(source)).toBeNull();
 });
 it('whitelists only numeric/model/effort fields',()=>{
  const r=cursorTurnFields({...report(),text:'secret',task:'secret',user_email:'secret',approvalMode:'never',model_params:[{id:'effort',value:'max'}]});expect(r).toEqual({generationId:'generation-1',inputTokens:100,outputTokens:20,cacheReadTokens:30,cacheWriteTokens:10,model:'model-id',reasoningEffort:'high'});
 });
});
