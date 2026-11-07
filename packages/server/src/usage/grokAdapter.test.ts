import{afterEach,describe,expect,it}from'vitest';
import{mkdtemp,writeFile,rm,rename}from'node:fs/promises';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{openVerified}from'../agent/safeFile.js';
import{GrokUsageAdapter}from'./grokAdapter.js';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
const source={paneId:'parent-pane',sessionId:'parent-session',transcriptPath:undefined};
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'soda-grok-usage-test-'));dirs.push(dir);const file=join(dir,'usage.json');
 const value={sessionId:'parent-session',updatedAt:'2026-11-07T00:00:00Z',session:{inputTokens:10,outputTokens:2,cachedReadTokens:3,cacheCreationTokens:1,reasoningTokens:1,totalTokens:12,modelCalls:1}};
 await writeFile(file,JSON.stringify(value));let proof:string|undefined='verified-instance-session';let reads=0;
 const adapter=new GrokUsageAdapter({openUsage:async()=>{reads++;return openVerified(file);},currentProof:()=>proof});
 return{adapter,file,value,setProof:(v:string|undefined)=>{proof=v;},reads:()=>reads};
}
describe('GrokUsageAdapter scoped ledger read',()=>{
 it('reads cumulative values once and does not add the same file twice',async()=>{
  const{adapter}=await setup();const first=await adapter.usageFor(source),second=await adapter.usageFor(source);
  expect(first).toEqual(second);expect(first?.tokens).toMatchObject({basis:'cumulative',input:6,output:2,total:12});
 });
 it('does not read unverified source or publish after proof changes',async()=>{
  const s=await setup();s.setProof(undefined);expect(await s.adapter.usageFor(source)).toBeNull();expect(s.reads()).toBe(0);
  let proof='verified',reads=0;const adapter=new GrokUsageAdapter({openUsage:async()=>{reads++;proof='new-instance';return openVerified(s.file);},currentProof:()=>proof});
  expect(await adapter.usageFor(source)).toBeNull();expect(reads).toBe(1);
 });
 it.each(['forget','close','new-instance','unverified'])('invalidates an in-flight read on %s',async mode=>{
  const s=await setup();let proof:string|undefined='old-instance',release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const adapter=new GrokUsageAdapter({openUsage:async()=>{await gate;return openVerified(s.file);},currentProof:()=>proof});
  const pending=adapter.usageFor(source);
  if(mode==='forget')adapter.forget(source.paneId);if(mode==='close')adapter.close();if(mode==='new-instance')proof='new-instance';if(mode==='unverified')proof=undefined;
  release();expect(await pending).toBeNull();
 });
 it('does not retain previously known values after the usage file is missing or malformed',async()=>{
  const s=await setup();expect(await s.adapter.usageFor(source)).not.toBeNull();await writeFile(s.file,'{');expect(await s.adapter.usageFor(source)).toBeNull();await rm(s.file);expect(await s.adapter.usageFor(source)).toBeNull();
 });
 it('rejects wrong parent, oversized file and invalid UTF8',async()=>{
  const s=await setup();await writeFile(s.file,JSON.stringify({...s.value,sessionId:'foreign-session'}));expect(await s.adapter.usageFor(source)).toBeNull();
  await writeFile(s.file,Buffer.alloc(2*1024*1024+1));expect(await s.adapter.usageFor(source)).toBeNull();
  await writeFile(s.file,Buffer.from([0xc3,0x28]));expect(await s.adapter.usageFor(source)).toBeNull();
 });
 it('rejects a leaf replacement between the descriptor read and final path recheck',async()=>{
  const s=await setup();let calls=0;
  const adapter=new GrokUsageAdapter({openUsage:async()=>{if(++calls===2){await rename(s.file,s.file+'.old');await writeFile(s.file,JSON.stringify(s.value));}return openVerified(s.file);},currentProof:()=> 'verified'});
  expect(await adapter.usageFor(source)).toBeNull();
 });
 it('requires a valid final safe-open even if the first descriptor was readable',async()=>{
  const s=await setup();let calls=0;const adapter=new GrokUsageAdapter({openUsage:async()=>++calls===1?openVerified(s.file):null,currentProof:()=> 'verified'});
  expect(await adapter.usageFor(source)).toBeNull();
 });
});
