import { mkdtemp, readFile, writeFile, mkdir, symlink, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { changePlugin, listPlugins, packPlugin, validateBundle } from './pluginPackage.js';
import { parseArgs } from './cliArgs.js';
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir,{recursive:true,force:true}); });
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'soda-plugin-'));dirs.push(root);
  const source=join(root,'source'),state=join(root,'state'),bundle=join(root,'demo.sodaplugin');await mkdir(source);
  await writeFile(join(source,'main.mjs'),"throw new Error('must not execute during install');\n");
  await writeFile(join(source,'soda-plugin.json'),JSON.stringify({schemaVersion:1,id:'demo',version:'1.0.0',name:'Demo',description:'test',entry:'main.mjs',files:['main.mjs'],allow:[]}));
  return {root,source,state,bundle};
}
describe('portable plugins',()=>{
  it('packs, installs disabled without executing hooks, lists, and removes only registration',async()=>{
    const f=await fixture();await packPlugin(f.source,f.bundle);const installed=await changePlugin(f.state,'install',f.bundle);
    expect(installed).toMatchObject({id:'demo',enabled:false});expect(await listPlugins(f.state)).toMatchObject([{id:'demo',registered:true,enabled:false}]);
    await changePlugin(f.state,'remove','demo');expect(await listPlugins(f.state)).toEqual([]);
    const files=JSON.parse(await readFile(join(f.state,'extensions.json'),'utf8'));expect(files.extensions).toEqual([]);
  });
  it('rejects traversal and tampered file bytes',async()=>{
    const f=await fixture();const bundle=await packPlugin(f.source,f.bundle);
    expect(()=>validateBundle({...bundle,files:[{...bundle.files[0],path:'../main.mjs'}]})).toThrow();
    expect(()=>validateBundle({...bundle,files:[{...bundle.files[0],data:Buffer.from('modified').toString('base64')}]})).toThrow(/integrity/);
  });
  it('does not follow symlinks when packing',async()=>{
    const f=await fixture();await rm(join(f.source,'main.mjs'));await writeFile(join(f.root,'secret'),'secret');await symlink(join(f.root,'secret'),join(f.source,'main.mjs'));
    await expect(packPlugin(f.source,f.bundle)).rejects.toThrow(/symlink/);
  });
  it('preserves unrelated extensions and refuses to replace an unmanaged id',async()=>{
    const f=await fixture();await packPlugin(f.source,f.bundle);await mkdir(f.state);await writeFile(join(f.state,'extensions.json'),JSON.stringify({extensions:[{id:'demo',command:'echo mine'}]}));
    await expect(changePlugin(f.state,'install',f.bundle)).rejects.toThrow(/already in use/);
    expect(JSON.parse(await readFile(join(f.state,'extensions.json'),'utf8')).extensions[0].command).toBe('echo mine');
  });
  it('refuses removal when the installed command has been edited',async()=>{
    const f=await fixture();await packPlugin(f.source,f.bundle);await changePlugin(f.state,'install',f.bundle);await writeFile(join(f.state,'extensions.json'),JSON.stringify({extensions:[{id:'demo',command:'echo changed'}]}));
    await expect(changePlugin(f.state,'remove','demo')).rejects.toThrow(/edited/);
  });
  it('can reinstall identical bytes; each install disables execution',async()=>{
    const f=await fixture();await packPlugin(f.source,f.bundle);await changePlugin(f.state,'install',f.bundle);await changePlugin(f.state,'install',f.bundle);expect(await listPlugins(f.state)).toHaveLength(1);
  });
  it('rejects server-forbidden fullwidth whitespace before changing existing configuration',async()=>{
    const f=await fixture();await packPlugin(f.source,f.bundle);const bundle=JSON.parse(await readFile(f.bundle,'utf8'));bundle.manifest.description='全角　空白';await writeFile(f.bundle,JSON.stringify(bundle));await expect(changePlugin(f.state,'install',f.bundle)).rejects.toThrow(/manifest/);
  });
  it('enable verifies bytes before allowing execution, and disable preserves the registration',async()=>{
    const f=await fixture();await packPlugin(f.source,f.bundle);await changePlugin(f.state,'install',f.bundle);await changePlugin(f.state,'enable','demo');expect((await listPlugins(f.state))[0]?.enabled).toBe(true);await changePlugin(f.state,'disable','demo');expect((await listPlugins(f.state))[0]?.enabled).toBe(false);const rows=JSON.parse(await readFile(join(f.state,'plugins.json'),'utf8'));await writeFile(join(rows[0].path,'main.mjs'),'changed');await expect(changePlugin(f.state,'enable','demo')).rejects.toThrow(/integrity/);expect((await listPlugins(f.state))[0]?.enabled).toBe(false);
  });
  it('accepts reordered bundle files and verifies the same canonical bytes on enable',async()=>{
    const f=await fixture();await writeFile(join(f.source,'README.md'),'readme');const manifest=JSON.parse(await readFile(join(f.source,'soda-plugin.json'),'utf8'));manifest.files.push('README.md');await writeFile(join(f.source,'soda-plugin.json'),JSON.stringify(manifest));const bundle=await packPlugin(f.source,f.bundle);bundle.files.reverse();await writeFile(f.bundle,JSON.stringify(bundle));await changePlugin(f.state,'install',f.bundle);await changePlugin(f.state,'enable','demo');expect((await listPlugins(f.state))[0]?.enabled).toBe(true);
  });
  it('requires explicit local paths and does not accept shell options',()=>{
    expect(parseArgs(['plugin','pack','source','--out','bundle'],{})).toMatchObject({kind:'plugin',action:'pack',target:'source',out:'bundle'});
    expect(parseArgs(['plugin','install','bundle','--state-dir','state'],{})).toMatchObject({kind:'plugin',action:'install',stateDir:'state'});
    for(const argv of [['plugin','install','bundle'],['plugin','pack','source'],['plugin','list','--url','x'],['plugin','activate','demo']])expect(()=>parseArgs(argv,{})).toThrow();
  });
});

it('installs the same view bundle separately for user and PJ with a portable project command',async()=>{
 const f=await fixture();const manifest=JSON.parse(await readFile(join(f.source,'soda-plugin.json'),'utf8'));
 manifest.views=[{id:'history',title:'履歴',placements:['right','float'],requiresProject:false}];
 await writeFile(join(f.source,'soda-plugin.json'),JSON.stringify(manifest));await packPlugin(f.source,f.bundle);
 const project=join(f.root,'project');await mkdir(project);const base=join(project,'.soda');
 await changePlugin(f.state,'install',f.bundle);await changePlugin(base,'install',f.bundle,true);
 await changePlugin(f.state,'enable','demo');
 const config=JSON.parse(await readFile(join(base,'extensions.json'),'utf8'));
 expect(config.extensions[0].command).toMatch(/^node '\.soda\/plugins\//);
 expect(config.extensions[0].enabled).toBe(false);expect(config.extensions[0].views).toEqual(manifest.views);
 expect(await changePlugin(base,'enable','demo',true)).toMatchObject({approvalRequired:true});
 await changePlugin(base,'remove','demo',true);expect(await listPlugins(base)).toEqual([]);expect((await listPlugins(f.state))[0]?.enabled).toBe(true);
 expect(parseArgs(['plugin','install','bundle','--project-dir','project'],{})).toMatchObject({kind:'plugin',projectDir:'project'});
 expect(()=>parseArgs(['plugin','install','bundle','--project-dir','project','--state-dir','state'],{})).toThrow();
});

it('rejects duplicate or unsupported view definitions before installation',async()=>{
 const f=await fixture();const manifest=JSON.parse(await readFile(join(f.source,'soda-plugin.json'),'utf8'));
 manifest.views=[{id:'history',title:'履歴',placements:['right','right']}];await writeFile(join(f.source,'soda-plugin.json'),JSON.stringify(manifest));await expect(packPlugin(f.source,f.bundle)).rejects.toThrow();
 manifest.views=[{id:'history',title:'履歴',placements:['right']},{id:'history',title:'別の履歴',placements:['float']}];await writeFile(join(f.source,'soda-plugin.json'),JSON.stringify(manifest));await expect(packPlugin(f.source,f.bundle)).rejects.toThrow();
});

it('keeps PJ packages manageable after moving the project folder',async()=>{
 const f=await fixture();await packPlugin(f.source,f.bundle);const project=join(f.root,'project');await mkdir(project);
 await changePlugin(join(project,'.soda'),'install',f.bundle,true);
 const moved=join(f.root,'moved');await rename(project,moved);const base=join(moved,'.soda');
 expect((await listPlugins(base))[0]?.path.startsWith(join(base,'plugins')+'/')).toBe(true);
 expect(await changePlugin(base,'enable','demo',true)).toMatchObject({enabled:true,approvalRequired:true});
 await changePlugin(base,'disable','demo',true);expect((await listPlugins(base))[0]?.enabled).toBe(false);
 await changePlugin(base,'remove','demo',true);expect(await listPlugins(base)).toEqual([]);
});
