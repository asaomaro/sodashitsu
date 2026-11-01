import { expect,it } from "vitest";
import { linuxStat,ProcessResourceSampler,type ProcessSample } from "./ResourceProcesses.js";
const row=(pid:number,ppid:number,cpuMs=0,start="one"):ProcessSample=>({pid,ppid,cpuMs,start,name:`process${pid}`,rss:1234,threads:2});
it("parses Linux comm with embedded parentheses without shifting CPU and identity fields",()=>{
 const fields=Array.from({length:23},()=>"0");fields[0]="S";fields[1]="4";fields[11]="12";fields[12]="3";fields[17]="2";fields[19]="456";
 expect(linuxStat(`80 (strange ) process) ${fields.join(' ')}`)).toMatchObject({pid:80,ppid:4,name:"strange ) process",cpuMs:150,start:"456",threads:2});
});
it("includes server children and adopted panes, attributes agents, excludes unrelated processes and cycles",async()=>{
 const sampler=new ProcessResourceSampler(async()=>[row(10,1),row(20,10),row(21,20),row(30,1),row(31,30),row(40,1),row(50,51),row(51,50)],10);
 const result=await sampler.get([{pid:30,paneId:"pane",label:"実装担当",agent:true}]);
 expect(result.rows.map(p=>p.pid)).toEqual([10,20,21,30,31]);
 expect(result.rows.find(p=>p.pid===31)).toMatchObject({group:"agent",label:"実装担当",paneId:"pane"});
 expect(result.rows.find(p=>p.pid===20)?.group).toBe("service");
});
it("shares concurrent sampling, caches briefly, and resets CPU when a PID is reused",async()=>{
 let now=0,calls=0,cpu=100,start="first";
 const sampler=new ProcessResourceSampler(async()=>{calls++;return [row(10,1,cpu,start)];},10,()=>now);
 const first=await Promise.all([sampler.get([]),sampler.get([])]);expect(calls).toBe(1);expect(first[0].rows[0]?.cpuPercent).toBeNull();
 now=3000;cpu=1600;expect((await sampler.get([])).rows[0]?.cpuPercent).toBe(50);
 now=6000;start="replacement";cpu=2000;expect((await sampler.get([])).rows[0]?.cpuPercent).toBeNull();
});
it("reports collection failure without replaying stale process CPU",async()=>{
 let now=0,fail=false;const sampler=new ProcessResourceSampler(async()=>{if(fail)throw Error();return [row(10,1)];},10,()=>now);
 await sampler.get([]);now=3000;fail=true;const result=await sampler.get([]);expect(result.rows).toEqual([]);expect(result.warning).toBeTruthy();
});
