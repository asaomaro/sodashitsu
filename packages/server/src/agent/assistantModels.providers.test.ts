import {expect,it,vi} from 'vitest';
vi.mock('./assistantModelProviders/codex.js',()=>({readCodexModelOptions:vi.fn(async()=>({models:[{id:'codex-generated',label:'Codex generated',efforts:['high']}],source:'cli',message:'Owned daemon'}))}));
vi.mock('./assistantModelProviders/claude.js',()=>({readClaudeModelOptions:vi.fn(async()=>({models:[{id:'claude-generated',label:'Claude generated',efforts:['xhigh']}],source:'cli',message:'SDK initialize'}))}));
vi.mock('./assistantModelProviders/copilot.js',()=>({readCopilotModelOptions:vi.fn(async()=>({models:[{id:'copilot-generated',label:'Copilot generated',efforts:[]}],source:'reference',message:'Installed SDK reference'}))}));
import {readAssistantModels} from './assistantModels.js';
import {readClaudeModelOptions} from './assistantModelProviders/claude.js';
it.each(['codex','claude','copilot'] as const)('routes %s to its typed read-only adapter and stamps observation time',async kind=>{
 const result=await readAssistantModels(kind);expect(result).toMatchObject({models:[{id:`${kind}-generated`}],source:kind==='copilot'?'reference':'cli',fetchedAt:expect.any(Number),cached:false});
});
it('does not substitute representative models when the live adapter fails',async()=>{
 vi.mocked(readClaudeModelOptions).mockRejectedValueOnce(Error('generated failure'));
 expect(await readAssistantModels('claude')).toMatchObject({models:[],source:'unavailable',cached:false});
});
