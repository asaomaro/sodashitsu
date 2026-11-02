import {join} from 'node:path';
import {expect,it} from 'vitest';
import {DefaultManifestStore} from './ManifestStore.js';
import {FsManifestSource} from '../infra/FsManifestSource.js';
import {MemoryLogger} from '../log/Logger.js';
import {evaluate} from './ManifestEngine.js';
it('recognizes the installed Muse 1.4 trust, working and new idle prompt without overwriting upstream rules',async()=>{
 const store=await DefaultManifestStore.load([new FsManifestSource(join(import.meta.dirname,'../../../../third_party/herdr/agent-detection')),new FsManifestSource(join(import.meta.dirname,'../../assets/agent-detection'))],new MemoryLogger());
 const manifest=store.get('muse')!;
 const check=(text:string)=>evaluate({lines:text.split('\n'),oscTitle:'',oscProgress:null},manifest);
 expect(check('Do you trust this workspace?\n⟩ 1 Trust and continue\nUse Up/Down or 1/2, then Enter.')).toMatchObject({state:'blocked',visibleBlocker:true});
 expect(check('◈ Thinking (0s · esc to interrupt)\n────────\n❯\n────────\necho · /tmp/generated · Auto-review')).toMatchObject({state:'working',visibleWorking:true});
 expect(check('◆ echo: complete\n────────\n❯\n────────\necho · /tmp/generated · Auto-review')).toMatchObject({state:'idle',visibleIdle:true,ruleId:'muse_1_4_idle_prompt'});
 expect(check('❯\nenter confirm · esc go back')).toBe('skip');
});
