import type { UsageInsights, InsightGroup, ResourceMonitorSnapshot } from "@sodashitsu/protocol";
const group = (key:string,total:number):InsightGroup => ({key,label:key,total,input:total,output:0,cacheRead:0,cacheWrite:0,calls:3,tools:2,errors:0,knownResults:2});
export const insightsFixture = ():UsageInsights => ({
 from:"2026-10-05",to:"2026-11-03",asOf:1,timezone:"UTC",partial:true,collecting:false,retainedFrom:"2026-01-01",
 activity:{started:3,completed:2,aborted:0,failed:1},totals:group("all",100),previous:group("previous",80),
 byDay:[group("2026-11-03",100)],byDayRole:[],previousByDay:[],byKind:[group("codex",100)],byModel:[group("model",100)],byProject:[group("project",100)],byAccount:[group("account",100)],byRole:[group("main",60),group("sub",40)],byHour:[],
 tools:[{name:"bash",category:"shell",basis:"direct",calls:3,success:2,failed:1,unknown:0},{name:"skill",category:"skill",basis:"inferred",nested:true,calls:2,success:0,failed:0,unknown:2}],
 sessions:[{...group("session",100),kind:"codex",parent:null,role:"main",project:"project",account:"account",firstAt:1,lastAt:2}],
 coverage:[{kind:"codex",files:2,pending:0,missing:1,invalid:0,oversized:0,firstAt:1,lastAt:2,limited:false}],options:{kinds:["codex"],models:["model"],projects:[],accounts:[]},
});
export const resourcesFixture = ():ResourceMonitorSnapshot => ({sampledAt:1,system:{sampledAt:1,cpuPercent:25,cpuCount:4,memoryTotalBytes:8*1024**3,memoryAvailableBytes:2*1024**3,serverRssBytes:1024,uptimeSeconds:1,loadAverage:null,hostname:"host"},warnings:["アプリの一部は取得不能"],processes:[
 {id:"1",startIdentity:null,pid:1,parentPid:null,name:"soda",group:"server",label:"本体",source:"server",platform:"linux",cpuPercent:120,rssBytes:1048576,threads:3},
 {id:"2",startIdentity:null,pid:2,parentPid:1,name:"codex",group:"agent",label:"作業",source:"server",platform:"linux",cpuPercent:null,rssBytes:null,threads:null},
]});
