import {expect,it,vi} from "vitest";
import {isWslHost,parseHostResources,readWslHostResources,WslHostResourcesCache} from "./WslHostResources.js";
it("identifies only a Linux WSL kernel; native Windows and WSL env-like strings on other systems do not probe",async()=>{
 expect(isWslHost("linux","6.6.87.2-microsoft-standard-WSL2")).toBe(true);expect(isWslHost("linux","4.4.0-Microsoft")).toBe(true);
 for(const [os,kernel] of [["win32","Microsoft"],["linux","6.8.0-generic"],["darwin","Darwin"]] as const){expect(isWslHost(os,kernel)).toBe(false);const detect=vi.fn();const cache=new WslHostResourcesCache(detect,()=>0,false);expect(cache.get()).toBeUndefined();await Promise.resolve();expect(detect).not.toHaveBeenCalled();}
});
it("uses explicit CIM KiB values without coercing missing, malformed or unsafe values",()=>{
 expect(parseHostResources('\uFEFF{"TotalVisibleMemorySize":16384,"FreePhysicalMemory":4096}')).toEqual({hostMemoryTotalBytes:16777216,hostMemoryAvailableBytes:4194304});
 for(const row of ['bad','[]','{}','{"TotalVisibleMemorySize":"16384","FreePhysicalMemory":4096}','{"TotalVisibleMemorySize":0,"FreePhysicalMemory":0}','{"TotalVisibleMemorySize":10,"FreePhysicalMemory":11}','{"TotalVisibleMemorySize":10,"FreePhysicalMemory":-1}',JSON.stringify({TotalVisibleMemorySize:Number.MAX_SAFE_INTEGER,FreePhysicalMemory:0})])expect(parseHostResources(row)).toBeUndefined();
 expect(parseHostResources('{"TotalVisibleMemorySize":1,"FreePhysicalMemory":0}')).toEqual({hostMemoryTotalBytes:1024,hostMemoryAvailableBytes:0});
});
it("uses the established fixed WSL Windows executable, a hidden profile-free bounded script and no policy bypass",async()=>{
 const run=vi.fn(async()=>'{"TotalVisibleMemorySize":16384,"FreePhysicalMemory":4096}');expect(await readWslHostResources(run)).toHaveProperty("hostMemoryTotalBytes",16777216);
 const [file,args,input,options]=run.mock.calls[0] as unknown as [string,string[],string,{timeout:number;limit:number}];expect(file).toBe('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');expect(args).toEqual(expect.arrayContaining(['-NoProfile','-NonInteractive','-WindowStyle','Hidden']));expect(args.join(' ')).not.toMatch(/Bypass|ExecutionPolicy/);expect(input).toBe('');expect(options).toMatchObject({timeout:6000,limit:4096});
 const script=Buffer.from(args.at(-1)!,'base64').toString('utf16le');expect(script).toContain('Win32_OperatingSystem');expect(script).toContain("TotalVisibleMemorySize");expect(script).toContain("Win32_PerfFormattedData_PerfOS_Processor");expect(script).toContain(`-Filter "Name='_Total'"`);
 expect(await readWslHostResources(async()=>{throw Error('Interop disabled');})).toBeUndefined();
});
it("coalesces asynchronous polling, caches ten seconds, clears failed host values and retries only after thirty seconds",async()=>{
 let at=0;const detect=vi.fn(async()=>({hostMemoryTotalBytes:4096,hostMemoryAvailableBytes:1024}));const cache=new WslHostResourcesCache(detect,()=>at,true);
 expect(cache.get()).toBeUndefined();cache.get();await vi.waitFor(()=>expect(cache.get()).toHaveProperty('hostMemoryTotalBytes',4096));expect(detect).toHaveBeenCalledTimes(1);expect(cache.get()).toHaveProperty('hostMetricsSampledAt',0);
 at=9999;cache.get();expect(detect).toHaveBeenCalledTimes(1);detect.mockRejectedValue(Error('Unavailable'));at=10000;cache.get();await vi.waitFor(()=>expect(cache.get()).toBeUndefined());expect(detect).toHaveBeenCalledTimes(2);
 at=39999;cache.get();expect(detect).toHaveBeenCalledTimes(2);at=40000;cache.get();await vi.waitFor(()=>expect(detect).toHaveBeenCalledTimes(3));
});
it("retains a single pending child rather than starting another when a read has not retired",async()=>{
 let resolve!:(value:undefined)=>void;let at=0;const detect=vi.fn(()=>new Promise<undefined>(done=>resolve=done));const cache=new WslHostResourcesCache(detect,()=>at,true);
 cache.get();await Promise.resolve();at=60000;cache.get();cache.get();expect(detect).toHaveBeenCalledTimes(1);resolve(undefined);await vi.waitFor(()=>expect(cache.get()).toBeUndefined());expect(detect).toHaveBeenCalledTimes(1);
});

it("accepts only an explicit total CPU counter including zero, and preserves either partial metric independently",()=>{
 expect(parseHostResources('{"ProcessorName":"_Total","PercentProcessorTime":0}')).toEqual({hostCpuPercent:0});
 expect(parseHostResources('{"ProcessorName":"_Total","PercentProcessorTime":62.5,"TotalVisibleMemorySize":16384,"FreePhysicalMemory":4096}')).toMatchObject({hostCpuPercent:62.5,hostMemoryTotalBytes:16777216});
 for(const cpu of [{PercentProcessorTime:20},{ProcessorName:"0",PercentProcessorTime:20},{ProcessorName:"_Total",PercentProcessorTime:"20"},{ProcessorName:"_Total",PercentProcessorTime:-1},{ProcessorName:"_Total",PercentProcessorTime:101}]){expect(parseHostResources(JSON.stringify(cpu))).toBeUndefined();expect(parseHostResources(JSON.stringify({...cpu,TotalVisibleMemorySize:16384,FreePhysicalMemory:4096}))).toHaveProperty("hostMemoryTotalBytes",16777216);}
 expect(parseHostResources('{"ProcessorName":"_Total","PercentProcessorTime":20,"TotalVisibleMemorySize":1,"FreePhysicalMemory":2}')).toEqual({hostCpuPercent:20});
});
