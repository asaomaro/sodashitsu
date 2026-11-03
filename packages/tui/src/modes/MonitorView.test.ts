import { afterEach, expect, it, vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import type { UsageInsights, ResourceMonitorSnapshot } from "@sodashitsu/protocol";
import { MonitorView } from "./MonitorView.js";
import { UiState } from "../model/UiState.js";
import { SessionModel } from "../model/SessionModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";

import { insightsFixture, resourcesFixture } from "../testing/monitorFixtures.js";
const views:MonitorView[]=[];
afterEach(()=>{for(const v of views.splice(0))v.dispose();vi.useRealTimers();});
function make(mode:"analytics"|"resources",request=vi.fn(async()=>mode==="analytics"?insightsFixture():resourcesFixture())) {
 const ui = new UiState(new SessionModel());
 const v = new MonitorView(mode,ui,{request} as unknown as RequestPort,()=>{});views.push(v);
 const key=(s:string)=>v.handleKey(chordToKeyInput(s)!);
 const grid=(w=110,h=45)=>{const g=new Grid(w,h);v.render(g,{x:0,y:0,w,h},new ThemeColors("dracula"));return g;};
 const text=(w=110,h=45)=>{const g=grid(w,h);return Array.from({length:h},(_,y)=>g.ch.slice(y*w,(y+1)*w).join("")).join("\n");};
 return {v,ui,request,key,text,grid};
}
it("shows resource totals before filtering, unknown coverage and stops polling when inactive",async()=>{
 vi.useFakeTimers();const h=make("resources");h.v.sync(true);await vi.advanceTimersByTimeAsync(0);
 expect(h.text()).toContain("120.0% (1/2取得)");expect(h.text()).toContain("1.0 MiB (1/2取得)");
 h.key("g");expect(h.text()).toContain("対象: 操舵室本体");expect(h.text()).toContain("120.0% (1/2取得)");
 h.key("p");await vi.advanceTimersByTimeAsync(9000);expect(h.request).toHaveBeenCalledTimes(1);
 h.key("r");await vi.advanceTimersByTimeAsync(0);expect(h.request).toHaveBeenCalledTimes(2);
 h.key("p");await vi.advanceTimersByTimeAsync(3000);expect(h.request).toHaveBeenCalledTimes(4);
 h.v.sync(false);await vi.advanceTimersByTimeAsync(9000);expect(h.request).toHaveBeenCalledTimes(4);
});
it("analyses include parent ratios, nested tool basis, comparisons and coverage without invoking a model",async()=>{
 const h=make("analytics");h.v.sync(true);await vi.waitFor(()=>expect(h.text()).toContain("100"));
 h.key("2");expect(h.text()).toContain("前期間 80");expect(h.text()).toContain("project");
 h.key("3");expect(h.text()).toContain("60.0%");expect(h.text()).toContain("40.0%");expect(h.text()).toContain("bash 3回 100.0%");expect(h.text()).toContain("skill 2回 内訳");
 h.key("4");expect(h.text()).toContain("不足 1");
 h.key("5");expect(h.text()).toContain("gを押したときだけ");expect(h.request).toHaveBeenCalledTimes(1);
 h.key("d");await vi.waitFor(()=>expect(h.request).toHaveBeenCalledTimes(2));
 expect(h.request.mock.calls.at(-1)).toMatchObject(["agent.usage_insights",{from:expect.any(String),to:expect.any(String),timezone:expect.any(String)}]);
});
it("ignores an old host/range response and does not start duplicate polling while busy",async()=>{
 vi.useFakeTimers();let resolve!:(v:ResourceMonitorSnapshot)=>void;
 const request=vi.fn().mockImplementationOnce(()=>new Promise<ResourceMonitorSnapshot>(r=>{resolve=r;})).mockResolvedValue({...resourcesFixture(),system:{...resourcesFixture().system,hostname:"new-host"}});
 const h=make("resources",request);h.v.sync(true);await vi.advanceTimersByTimeAsync(9000);expect(request).toHaveBeenCalledTimes(1);
 h.v.sync(false);h.v.reset();h.v.sync(true);await vi.advanceTimersByTimeAsync(0);expect(h.text()).toContain("new-host");
 resolve(resourcesFixture());await vi.advanceTimersByTimeAsync(0);expect(h.text()).toContain("new-host");expect(h.text()).not.toContain("ホスト host");
});
it("renders safely at narrow sizes, scrolls and retains last data on failure",async()=>{
 const h=make("resources");h.v.sync(true);await vi.waitFor(()=>expect(h.text()).toContain("ホスト host"));
 h.request.mockRejectedValueOnce(new Error("offline"));h.key("r");await vi.waitFor(()=>expect(h.text()).toContain("最終取得値"));
 expect(()=>h.text(20,3)).not.toThrow();h.text(30,8);h.key("End");expect(h.text(30,8)).toContain("codex");
 h.key("Escape");expect(h.ui.screen).toBe("base");
});
it("only an explicit request generates an agent report with the selected history scope",async()=>{
 const request=vi.fn(async(method:string)=>method==="agent.usage_report"?{kind:"codex",model:"",updatedAt:1,text:"取り組み: 検証中"}:insightsFixture());
 const h=make("analytics",request as never);h.v.sync(true);await vi.waitFor(()=>expect(h.text()).toContain("100"));h.key("5");h.key("g");
 await vi.waitFor(()=>expect(h.text()).toContain("取り組み: 検証中"));expect(request).toHaveBeenCalledWith("agent.usage_report",expect.objectContaining({settings:{kind:"codex",model:""},history:{from:expect.any(String),to:expect.any(String)}}));
});
it("keeps token-unknown groups distinct from measured zero",async()=>{
 const data=insightsFixture();data.totals={...data.totals,calls:0,total:0,input:0};data.previous={...data.previous,calls:0,total:0};data.byKind=[{...groupForTest(),label:"Muse",calls:0,total:0}];data.sessions=data.sessions.map(s=>({...s,calls:0,total:0}));
 const h=make("analytics",vi.fn(async()=>data));h.v.sync(true);await vi.waitFor(()=>expect(h.text()).toContain("トークン 未取得"));
 expect(h.text()).toContain("Muse · 未取得 tok");h.key("2");expect(h.text()).toContain("差分 未取得 tok");h.key("3");expect(h.text()).toContain("未取得 tok");
});
function groupForTest(){return insightsFixture().totals;}
it("coalesces rapid filter changes until the outstanding collection finishes",async()=>{
 let resolve!:(v:UsageInsights)=>void;
 const request=vi.fn().mockImplementationOnce(()=>new Promise<UsageInsights>(r=>{resolve=r;})).mockResolvedValue(insightsFixture());
 const h=make("analytics",request);h.v.sync(true);h.key("d");h.key("k");h.key("m");expect(request).toHaveBeenCalledTimes(1);
 resolve(insightsFixture());await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(2));expect(request.mock.calls[1]).toMatchObject(["agent.usage_insights",{kind:"claude",role:"main"}]);
});

it("separates cards and headings, keeps composition shares neutral and marks resource warnings",async()=>{
 const h=make("analytics");h.v.sync(true);await vi.waitFor(()=>expect(h.text()).toContain("利用サマリー"));h.key("3");
 const grid=h.grid();const theme=new ThemeColors("dracula");
 expect(h.text()).toContain("╭─ 利用サマリー");expect(h.text()).toContain("╰");
 expect(h.text()).toContain("╭─ ツールの利用");
 const percentages=grid.ch.map((ch,i)=>ch==="%"?grid.fg[i]:null).filter(x=>x!==null);
 expect(percentages.length).toBeGreaterThan(0);expect(percentages.every(c=>c===theme.ui("--soda-accent"))).toBe(true);
 const bars=grid.ch.map((ch,i)=>ch==="#"?grid.fg[i]:null).filter(x=>x!==null);
 expect(bars.length).toBeGreaterThan(0);expect(new Set(bars)).toEqual(new Set([theme.ui("--soda-accent")]));
 const r=make("resources");r.v.sync(true);await vi.waitFor(()=>expect(r.text()).toContain("使用量サマリー"));const g=r.grid();const warning=g.ch.indexOf("注");expect(warning).toBeGreaterThan(0);expect(g.fg[warning]).toBe(theme.ui("--soda-warn-fg"));
 const noteY=Array.from({length:g.h},(_,y)=>y).find(y=>g.rowText(y).includes("CPUは1コア"))!;
 const notePercent=g.ch.slice(noteY*g.w,(noteY+1)*g.w).indexOf("%");expect(notePercent).toBeGreaterThan(0);expect(g.fg[noteY*g.w+notePercent]).not.toBe(theme.ui("--soda-error-fg"));
});
