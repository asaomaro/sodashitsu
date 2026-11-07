import {expect,it} from 'vitest';
import type {AgentUsage,Pane} from '@sodashitsu/protocol';
import {observedAgentModel,subagentEffortLabel,subagentModelLabel} from './observedAgentModel.js';
const pane={id:'p',label:'Generated',agent:{kind:'codex',state:'idle',label:'Codex'}} as Pane;
const usage:AgentUsage={paneId:'p',kind:'codex',model:'gpt-observed',source:'rollout',tokens:{basis:'context'},updatedAt:1};
it('appends same-kind observed effort and keeps its basis/source tooltip',()=>{
 const value=observedAgentModel(pane,{...usage,executionSettings:{reasoningEffort:{value:'high',basis:'turn',source:'rollout',observedAt:1}}});
 expect(value?.text).toBe('gpt-observed high');expect(value?.title).toContain('ターンの記録 / rollout');
});
it('keeps model only when effort is absent and rejects wrong-kind observations',()=>{
 expect(observedAgentModel(pane,usage)?.text).toBe('gpt-observed');expect(observedAgentModel(pane,{...usage,kind:'claude'})).toBeUndefined();
});
it('retains a legacy observed effort with explicit unknown timing',()=>{
 expect(observedAgentModel(pane,{...usage,reasoningEffort:'low'})?.title).toContain('設定の範囲・時点は未取得');
});
it('shows child effort without a timing suffix while retaining observation validation',()=>{
 const child={id:'c',type:'role',model:'child-model',modelBasis:'turn' as const,startedAt:1,reasoningEffort:'low',reasoningEffortBasis:'creation' as const};expect(subagentModelLabel(child)).toBe('child-model low');expect(subagentEffortLabel(child)?.title).toContain('effort low');
});
it('omits invalid child observations and labels effort without a model explicitly',()=>{
 expect(subagentModelLabel({id:'c',startedAt:1,type:'child',reasoningEffort:'high'})).toBeUndefined();expect(subagentEffortLabel({id:'c',startedAt:1,reasoningEffort:'a\nb',reasoningEffortBasis:'turn'})).toBeUndefined();expect(subagentModelLabel({id:'c',startedAt:1,reasoningEffort:'high',reasoningEffortBasis:'turn'})).toBe('effort high');
});

it('shows effort alone without manufacturing a model, while rejecting another pane',()=>{
 expect(observedAgentModel(pane,{...usage,model:null,reasoningEffort:'high'})?.text).toBe('effort high');expect(observedAgentModel(pane,{...usage,paneId:'foreign'})).toBeUndefined();
});

it('uses only turn-observed models, preserves role identity separately and supports session-default effort',()=>{
 const child={id:'c',startedAt:1,type:'Explore',model:'observed-model',modelBasis:'turn' as const,reasoningEffort:'low',reasoningEffortBasis:'session' as const};
 expect(subagentModelLabel(child)).toBe('observed-model low');expect(subagentModelLabel({id:'c',startedAt:1,type:'Explore',reasoningEffort:'low',reasoningEffortBasis:'session'})).toBe('effort low');
 expect(subagentModelLabel({id:'c',startedAt:1,type:'gpt-started-model'})).toBeUndefined();
});
