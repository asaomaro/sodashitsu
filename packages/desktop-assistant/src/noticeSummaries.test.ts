import {afterEach,expect,it,vi} from "vitest";
import {NoticeSummaries} from "./noticeSummaries.js";
import type {AssistantNotice} from "@sodashitsu/protocol";
const feeds:NoticeSummaries[]=[];afterEach(()=>{feeds.splice(0).forEach(f=>f.stop());vi.useRealTimers();});
const notice={id:"n1",key:"done:actor:1",source:{agentInstanceId:"actor"}} as AssistantNotice;
it("polls shared results with no captain and drops late results when a notification disappears",async()=>{
 let resolve!:(v:any)=>void;const request=vi.fn(()=>new Promise<any>(done=>resolve=done)),changed=vi.fn();
 const feed=new NoticeSummaries(request,changed);feeds.push(feed);
 feed.configure([notice],"server-model",true);expect(request).toHaveBeenCalledOnce();
 feed.configure([],"server-model",true);resolve({status:"ready",text:"old",message:""});await Promise.resolve();expect(feed.snapshot()).toEqual({});
});
it("uses the server result, retains it across inbox changes and clears it for a different setting",async()=>{
 const request=vi.fn(async()=>({status:"ready" as const,text:"共有要約",message:""}));
 const feed=new NoticeSummaries(request,()=>{});feeds.push(feed);
 feed.configure([notice],"model1",true);await vi.waitFor(()=>expect(feed.snapshot().n1?.text).toBe("共有要約"));
 feed.configure([notice],"model1",true);expect(request).toHaveBeenCalledOnce();
 feed.configure([notice],"model2",false);expect(feed.snapshot().n1?.status).toBe("disabled");
});

it("limits native RPC concurrency without losing a requested refresh",async()=>{
 vi.useFakeTimers();const release:Array<(v:any)=>void>=[],request=vi.fn(()=>new Promise<any>(done=>release.push(done)));
 const feed=new NoticeSummaries(request,()=>{});feeds.push(feed);
 const rows=Array.from({length:5},(_,i)=>({...notice,id:`n${i}`}));feed.configure(rows,"scope",true);expect(request).toHaveBeenCalledTimes(4);
 feed.retry("n4");expect(request).toHaveBeenCalledTimes(4);
 release.forEach(done=>done({status:"ready",text:"shared",message:""}));await vi.advanceTimersByTimeAsync(2000);
 expect(request).toHaveBeenCalledTimes(5);expect(request.mock.calls.at(-1)).toEqual([rows[4],true]);
 release[4]!({status:"ready",text:"refreshed",message:""});
});

it("retains real in-flight slots across repeated setting changes",async()=>{
 vi.useFakeTimers();const release:Array<(v:any)=>void>=[],request=vi.fn(()=>new Promise<any>(done=>release.push(done)));
 const feed=new NoticeSummaries(request,()=>{});feeds.push(feed);
 const rows=Array.from({length:4},(_,i)=>({...notice,id:`n${i}`}));feed.configure(rows,"first",true);expect(request).toHaveBeenCalledTimes(4);
 feed.configure(rows,"second",true);feed.configure(rows,"third",true);expect(request).toHaveBeenCalledTimes(4);
 release.slice(0,4).forEach(done=>done({status:"ready",text:"old",message:""}));await vi.advanceTimersByTimeAsync(2000);
 expect(feed.snapshot()).toEqual({});expect(request).toHaveBeenCalledTimes(8);
 release.slice(4).forEach(done=>done({status:"ready",text:"new",message:""}));await vi.advanceTimersByTimeAsync(0);expect(feed.snapshot().n0?.text).toBe("new");
});
