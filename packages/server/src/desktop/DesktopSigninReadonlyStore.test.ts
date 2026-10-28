import {mkdtemp,chmod,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import type {DesktopEndpointStore} from '@sodashitsu/client-core/desktop/DesktopEndpointStore.node';
import {desktopSigninReadonlyStore} from './DesktopSigninRuntime.js';
it('physically refuses accidental identity initialization through the readonly service store',async()=>{const root=await mkdtemp(join(tmpdir(),'soda-signin-readonly-'));await chmod(root,0o700);const store=desktopSigninReadonlyStore({type:'signin_context',ownerSid:'S-1-5-21-1-2-3-1001',packageRoot:'generated',stateDir:root});try{await expect((store as DesktopEndpointStore).initialize()).rejects.toThrow();await store.settled();expect(await readdir(root)).toEqual([]);}finally{store.close();await store.settled();await rm(root,{recursive:true,force:true});}});
