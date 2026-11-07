import { describe, it, expect, vi, afterEach } from "vitest";
import { cpuList, linuxPhysicalCores, windowsPhysicalCores, detectPhysicalCores, CpuTopologyCache } from "./CpuTopology.js";
afterEach(()=>vi.unstubAllEnvs());
const pathValue=(values:Record<string,string>)=>async(path:string)=>{const value=values[path.replace('/sys/devices/system/cpu/','')];if(value===undefined)throw Error('missing');return value;};
function topology(groups:number[][],packages?:number[]) {
 const values:Record<string,string>={online:groups.flat().sort((a,b)=>a-b).join(',')};
 groups.forEach((members,core)=>members.forEach(cpu=>{
  values[`cpu${cpu}/topology/physical_package_id`]=String(packages?.[core]??0);
  values[`cpu${cpu}/topology/core_id`]=String(packages?core%2:core);
  values[`cpu${cpu}/topology/core_cpus_list`]=members.join(',');
 }));return values;
}
describe('explicit CPU topology',()=>{
 it('parses bounded non-contiguous masks and rejects malformed/duplicated/oversized masks',()=>{
  expect(cpuList('0-2,7,9-10\n')).toEqual([0,1,2,7,9,10]);
  for(const value of ['', '1-0','0-99999999','0,0','0-3,1','-1','1x'])expect(cpuList(value)).toBeNull();
 });
 it('counts SMT, no-SMT and hybrid cores without a fixed thread ratio',async()=>{
  expect(await linuxPhysicalCores(6,pathValue(topology([[0,1],[2,3],[4],[5]])))).toBe(4);
  expect(await linuxPhysicalCores(3,pathValue(topology([[0],[1],[2]])))).toBe(3);
  expect(await linuxPhysicalCores(4,pathValue(topology([[0,1],[2,3]])))).toBe(2);
 });
 it('keeps equal core IDs on different packages separate',async()=>{
  expect(await linuxPhysicalCores(4,pathValue(topology([[0],[1],[2],[3]],[0,0,1,1])))).toBe(4);
 });
 it('returns unknown for missing/default/contradictory topology or incomplete CPU coverage',async()=>{
  const values=topology([[0,1],[2,3]]);
  expect(await linuxPhysicalCores(3,pathValue(values))).toBeNull();
  delete values['cpu3/topology/core_id'];expect(await linuxPhysicalCores(4,pathValue(values))).toBeNull();
  const missing=topology([[0,1]]);missing['cpu0/topology/physical_package_id']='-1';expect(await linuxPhysicalCores(2,pathValue(missing))).toBeNull();
  const defaults=topology([[0],[1]]);defaults['cpu1/topology/core_id']='0';expect(await linuxPhysicalCores(2,pathValue(defaults))).toBeNull();
  const wrong=topology([[0,1]]);wrong['cpu1/topology/core_cpus_list']='1';expect(await linuxPhysicalCores(2,pathValue(wrong))).toBeNull();
 });
 it('rejects topology changed during a read',async()=>{
  const values=topology([[0,1]]);let calls=0;
  const read=pathValue(values);expect(await linuxPhysicalCores(2,async path=>path.endsWith('/online')&&++calls>1?'0':read(path))).toBeNull();
 });
 it('sums only explicit Windows CIM socket counts and matches visible logical count',()=>{
  expect(windowsPhysicalCores(JSON.stringify([{NumberOfCores:8,NumberOfLogicalProcessors:16},{NumberOfCores:4,NumberOfLogicalProcessors:4}]),20)).toBe(12);
  expect(windowsPhysicalCores('{"NumberOfCores":6,"NumberOfLogicalProcessors":6}',6)).toBe(6);
  for(const raw of ['bad','[]','{}','{"NumberOfCores":null,"NumberOfLogicalProcessors":8}','{"NumberOfCores":8,"NumberOfLogicalProcessors":4}','{"NumberOfCores":"4","NumberOfLogicalProcessors":8}'])expect(windowsPhysicalCores(raw,8)).toBeNull();
  expect(windowsPhysicalCores('{"NumberOfCores":4,"NumberOfLogicalProcessors":8}',4)).toBeNull();
 });
 it('coalesces async queries and caches success/failure instead of spawning every poll',async()=>{
  let now=0;const detect=vi.fn(async():Promise<number|null>=>4);const cache=new CpuTopologyCache(detect,()=>now);
  expect(cache.get(8)).toBeNull();cache.get(8);await vi.waitFor(()=>expect(cache.get(8)).toBe(4));expect(detect).toHaveBeenCalledTimes(1);
  now=299999;expect(cache.get(8)).toBe(4);expect(detect).toHaveBeenCalledTimes(1);
  detect.mockResolvedValue(null);now=300001;cache.get(8);await vi.waitFor(()=>expect(cache.get(8)).toBeNull());expect(detect).toHaveBeenCalledTimes(2);
  now=320000;cache.get(8);expect(detect).toHaveBeenCalledTimes(2);
 });
 it('invalidates old pending results when the logical count changes',async()=>{
  let done:(n:number)=>void=()=>{};const detect=vi.fn(()=>new Promise<number>(resolve=>{done=resolve}));const cache=new CpuTopologyCache(detect);
  cache.get(8);expect(cache.get(4)).toBeNull();expect(cache.get(8)).toBeNull();done(4);await Promise.resolve();await Promise.resolve();expect(cache.get(8)).toBeNull();
 });
});

it("Windows probe is hidden, bounded, no-profile and never bypasses execution policy",async()=>{
 vi.stubEnv("SystemRoot","C:\\Windows");
 const run=vi.fn((file:string,args:string[],options:unknown,callback:(error:Error|null,text:string)=>void)=>{callback(null,'{"NumberOfCores":6,"NumberOfLogicalProcessors":8}');});
 expect(await detectPhysicalCores(8,"win32",run as unknown as typeof import("node:child_process").execFile)).toBe(6);
 expect(run.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["-NoProfile","-NonInteractive"]));
 expect(run.mock.calls[0]?.[1].join(" ")).not.toMatch(/Bypass|ExecutionPolicy/);
 expect(run.mock.calls[0]?.[2]).toMatchObject({windowsHide:true,timeout:3000,maxBuffer:65536});
 const fail=vi.fn((_file:string,_args:string[],_options:unknown,callback:(error:Error|null,text:string)=>void)=>callback(Error("not available"),""));
 expect(await detectPhysicalCores(8,"win32",fail as unknown as typeof import("node:child_process").execFile)).toBeNull();
});
