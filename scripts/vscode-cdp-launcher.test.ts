import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { launcherOptions, discover } = await import(pathToFileURL(resolve(import.meta.dirname,"../plugins/vscode-desktop/cdp-launcher.mjs")).href);
const argv = ['--code','C:/VSCode/Code.exe','--user-data-dir','C:/temp/soda-test','--soda','https://soda.example'];
const options=()=>launcherOptions(argv);
const absent=()=>new Error('unreachable',{cause:new Error('fetch failed',{cause:{code:'ECONNREFUSED'}})});
it('requires operator-fixed profile, origin and loopback; grants remain opt-in',()=>{
  expect(options()).toMatchObject({allowInput:false,allowFit:false,cdp:'http://127.0.0.1:9222/'});
  expect(()=>launcherOptions(['--code','code'])).toThrow();
  expect(()=>launcherOptions([...argv,'--cdp','http://remote:9222'])).toThrow();
  expect(()=>launcherOptions([...argv,'--soda','http://remote'])).toThrow();
  expect(()=>launcherOptions([...argv,'--allow-fit'])).toThrow();
});
it('reuses existing workbench without starting or stopping VSCode',async()=>{
  const found=[{id:'chosen',title:'Existing'}],launch=vi.fn();
  expect(await discover(options(),{list:async()=>found,launch})).toEqual(found);
  expect(launch).not.toHaveBeenCalled();
});
it('starts only the configured dedicated VSCode when connection is refused',async()=>{
  let calls=0;
  const unref=vi.fn(),kill=vi.fn();
  const launch=vi.fn(()=>{const child=Object.assign(new EventEmitter(),{unref,kill});queueMicrotask(()=>child.emit('spawn'));return child;});
  const found=[{id:'new-window'}];
  expect(await discover(options(),{list:async()=>{if(calls++===0)throw absent();return found;},launch,pause:async()=>{}})).toEqual(found);
  expect(launch).toHaveBeenCalledWith('C:/VSCode/Code.exe',expect.arrayContaining(['--user-data-dir','C:/temp/soda-test','--remote-debugging-port=9222']),expect.objectContaining({shell:false}));
  expect(unref).toHaveBeenCalledOnce();expect(kill).not.toHaveBeenCalled();
});
it('does not start VSCode for malformed/other HTTP failures or a cancelled request',async()=>{
  const launch=vi.fn();
  await expect(discover(options(),{list:async()=>{throw new Error('invalid JSON');},launch})).rejects.toThrow('invalid JSON');
  const controller=new AbortController();controller.abort();
  await expect(discover(options(),{signal:controller.signal,list:async()=>{throw absent();},launch})).rejects.toThrow();
  expect(launch).not.toHaveBeenCalled();
});
