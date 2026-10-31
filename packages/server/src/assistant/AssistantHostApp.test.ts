import {mkdtemp,rm,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it,vi,type Mock} from 'vitest';
import {prepareAssistantHostApp} from './AssistantHostApp.js';
async function fixture(run:(f:{root:{path:string;assert:Mock<()=>Promise<void>>};source:string})=>Promise<void>){
 const base=await mkdtemp(join(tmpdir(),'soda-host-app-')),source=join(base,'source'),path=join(base,'private');await mkdir(source);await mkdir(path);const files={'package.json':'{"main":"dist/main.mjs"}','dist/main.mjs':'// generated inert data','dist/preload.cjs':'// generated inert data','assets/character.html':'generated UI'};const entries=[];
 for(const [name,text] of Object.entries(files)){const parts=name.split('/');parts.pop();if(parts.length)await mkdir(join(source,...parts),{recursive:true});await writeFile(join(source,name),text);entries.push({path:name,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')});}
 await writeFile(join(source,'host-manifest.json'),JSON.stringify({version:1,entries}));try{await run({root:{path,assert:vi.fn(async()=>{})},source});}finally{await rm(base,{recursive:true,force:true});}
}
it('prepares and verifies every bundled file without executing it or adding node_modules',()=>fixture(async f=>{const app=await prepareAssistantHostApp(f.root,()=>{},f.source);expect(await readFile(join(app,'dist/main.mjs'),'utf8')).toContain('inert');expect(await prepareAssistantHostApp(f.root,()=>{},f.source)).toBe(app);expect(await readdir(f.root.path)).toEqual([app.split(/[\\/]/).at(-1)]);}));
it('refuses changed or unlisted content instead of reusing an unverified app',()=>fixture(async f=>{const app=await prepareAssistantHostApp(f.root,()=>{},f.source);await mkdir(join(app,'node_modules'));await expect(prepareAssistantHostApp(f.root,()=>{},f.source)).rejects.toThrow(/一致/);}));
it('permission loss during copy retires and removes owned staging',()=>fixture(async f=>{let calls=0;f.root.assert.mockImplementation(async()=>{if(++calls>=4)throw Error('generated permission loss');});await expect(prepareAssistantHostApp(f.root,()=>{},f.source)).rejects.toThrow(/permission loss/);expect(await readdir(f.root.path)).toEqual([]);}));
it('refuses a damaged bundled source before publishing anything',()=>fixture(async f=>{await writeFile(join(f.source,'dist/main.mjs'),'changed');await expect(prepareAssistantHostApp(f.root,()=>{},f.source)).rejects.toThrow(/素材/);expect(await readdir(f.root.path)).toEqual([]);}));
