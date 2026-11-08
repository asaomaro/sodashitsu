import { afterEach,beforeEach,describe, expect, it, vi } from "vitest";
import type { AgentUsage } from "@sodashitsu/protocol";
import { UsageDialog, usageLines } from "./UsageView.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import type { UsageModel } from "../model/UsageModel.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { snapshot } from "../testing/fixtures.js";
it("shows context as a gauge and preserves unknown data instead of implying zero", () => {
  const usage = {
    paneId: "p1",
    kind: "codex",
    model: "m",
    tokens: { basis: "cumulative" },
    contextTokens: 40,
    contextWindowTokens: 100,
    updatedAt: 0,
    source: "rollout",
  } as AgentUsage;
  expect(usageLines(usage).join("\n")).toContain("[####------] 40.0% · 40 / 100");
  const unknown = {
    ...usage,
    contextTokens: undefined,
    contextWindowTokens: undefined,
  } as unknown as AgentUsage;
  expect(usageLines(unknown).join("\n")).toContain("[??????????] —");
});
it("renders both 5-hour and weekly limit gauges in the account window", () => {
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const ui = new UiState(model, vi.fn());
  const usage = {
    status: "ready",
    data: {
      panes: {},
      accounts: [
        {
          label: "account",
          windows: [
            { label: "5h", usedPct: 20 },
            { label: "週", usedPct: 70 },
          ],
        },
      ],
    },
  } as unknown as UsageModel;
  const dialog = new UsageDialog(null, model, ui, usage),
    grid = new Grid(100, 25);
  dialog.render({ grid, theme: new ThemeColors("dracula") });
  const text = Array.from({ length: 25 }, (_, y) => grid.rowText(y)).join("\n");
  expect(text).toContain("5h: [##--------] 20.0%");
  expect(text).toContain("週: [#######---] 70.0%");
});
it("separates account limits and agents with ruled titles and keeps agent clicks aligned", async () => {
  const { UsageDashboard } = await import("./UsageView.js");
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const p = model.panes.get("p1")!;
  model.panes.set("p1", {
    ...p,
    agent: { kind: "codex", state: "idle", instanceId: "i" } as typeof p.agent,
  });
  const ui = new UiState(model),
    focus = vi.fn();
  const usage = {
    status: "ready",
    data: {
      panes: {},
      accounts: [{ label: "TestAccount", asOf: 0, windows: [{ label: "5h", usedPct: 20 }] }],
    },
  } as unknown as UsageModel;
  const view = new UsageDashboard(model, ui, usage, focus),
    grid = new Grid(100, 24);
  view.render(grid, { x: 0, y: 0, w: 100, h: 24 }, new ThemeColors("dracula"));
  const lines = Array.from({ length: grid.h }, (_, y) => grid.rowText(y));
  const account = lines.findIndex((s) => s.includes("アカウントの利用枠"));
  const agents = lines.findIndex((s) => s.includes("─ エージェント"));
  expect(lines[account]).toContain("──");
  expect(lines[agents]).toContain("──");
  expect(account).toBeLessThan(lines.findIndex((s) => s.includes("TestAccount")));
  expect(agents).toBeGreaterThan(lines.findIndex((s) => s.includes("5h:")));
  view.handleMouse({ action: "down", button: 0, x: 10, y: agents + 1 });
  expect(focus).toHaveBeenCalledWith("p1");
});

it("dashboard shows live colored sidebar symbols in compact and full rows", async () => {
  const { UsageDashboard } = await import("./UsageView.js");
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const p = model.panes.get("p1")!;
  p.label = "Worker";
  p.agent = {
    kind: "codex",
    state: "working",
    instanceId: "i",
    since: 0,
    label: "Codex",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
  };
  let symbols = true;
  const usage = {
    status: "ready",
    data: {
      panes: { p1: { kind: "codex", tokens: { basis: "cumulative", total: 10 }, updatedAt: 0 } },
      accounts: [],
    },
  } as unknown as UsageModel;
  const theme = new ThemeColors("dracula");
  const view = new UsageDashboard(model, new UiState(model), usage, vi.fn(), () => symbols);
  const render = (height: number) => {
    const grid = new Grid(100, height);
    view.render(grid, { x: 0, y: 0, w: 100, h: height }, theme);
    return grid;
  };
  for (const height of [6, 24]) {
    const grid = render(height);
    const y = Array.from({ length: height }, (_, y) => grid.rowText(y)).findIndex((s) =>
      s.includes("◐ Worker"),
    );
    expect(y).toBeGreaterThanOrEqual(0);
    expect(grid.cell(1, y)?.fg).toBe(theme.ui("--soda-state-working"));
    if (height === 24) expect(grid.rowText(y + 1)).toContain("codex ·");
  }
  symbols = false;
  expect(Array.from({ length: 24 }, (_, y) => render(24).rowText(y)).join("\n")).toContain(
    "● Worker",
  );
  symbols = true;
  p.agent!.state = "blocked";
  expect(Array.from({ length: 24 }, (_, y) => render(24).rowText(y)).join("\n")).toContain(
    "× Worker",
  );
});

it("opens cost detail by account click and renders shared model/effort totals", async () => {
  const { UsageDashboard, AccountCostDialog } = await import("./UsageView.js");
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const ui = new UiState(model),
    theme = new ThemeColors("dracula"),
    grid = new Grid(110, 28);
  const accountCost = vi
    .fn()
    .mockResolvedValue({
      accountKey: "k",
      totalUsd: 12,
      sessions: 2,
      unpricedSessions: 0,
      byModel: [{ label: "sonnet", usd: 12, sessions: 2 }],
      byEffort: [{ label: "不明", usd: 12, sessions: 2 }],
      partial: false,
      asOf: 0,
    });
  const usage = {
    status: "ready",
    data: {
      panes: {},
      accounts: [{ accountKey: "k", label: "CostAccount", windows: [], asOf: 0 }],
    },
    accountCost,
    refresh: vi.fn(),
  } as unknown as UsageModel;
  const dashboard = new UsageDashboard(model, ui, usage, vi.fn());
  dashboard.render(grid, { x: 0, y: 0, w: 110, h: 28 }, theme);
  const y = Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).findIndex((x) =>
    x.includes("CostAccount"),
  );
  dashboard.handleMouse({ action: "down", button: 0, x: 5, y });
  expect(ui.dialogContext).toEqual({ kind: "accountCost", accountKey: "k" });
  const dialog = new AccountCostDialog("k", ui, usage);
  await Promise.resolve();
  dialog.render({ grid, theme });
  const text = Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).join("\n");
  expect(accountCost).toHaveBeenCalledWith("k");
  expect(text).toContain("$12.0000");
  expect(text).toContain("モデル別");
  expect(text).toContain("エフォート別");
  expect(text).toContain("sonnet");
  dialog.handleKey({ key: "Escape" } as never);
  expect(ui.dialogContext).toBeNull();
});

it("account list supports Tab then Enter and ignores a replaced overflow hint", async () => {
 const { UsageDashboard }=await import("./UsageView.js"); const model=new SessionModel(); model.applySnapshot(snapshot(),"client");
 const ui=new UiState(model), theme=new ThemeColors("dracula");
 const usage={status:"ready",data:{panes:{},accounts:[{accountKey:"a",label:"First",asOf:0,windows:[{label:"5h",usedPct:10}]},{accountKey:"b",label:"Second",asOf:0,windows:[]}]}} as unknown as UsageModel;
 const list=new UsageDialog(null,model,ui,usage); list.handleKey({key:"Tab"} as never); list.handleKey({key:"Enter"} as never);
 expect(ui.dialogContext).toEqual({kind:"accountCost",accountKey:"b"}); ui.closeDialog();
 const dashboard=new UsageDashboard(model,ui,usage,vi.fn()),grid=new Grid(80,8); dashboard.render(grid,{x:0,y:0,w:80,h:8},theme);
 const y=Array.from({length:grid.h},(_,y)=>grid.rowText(y)).findIndex(s=>s.includes("アカウント枠: ほか"));
 expect(y).toBeGreaterThanOrEqual(0); dashboard.handleMouse({action:"down",button:0,x:5,y}); expect(ui.dialogContext).toBeNull();
});

// 20261016-agent-usage-bob-copilot
it("shows non-USD credits and premium requests on the cost line", () => {
  const usage = { paneId: "p1", kind: "copilot", model: "m", tokens: { basis: "transcript" }, credits: { amount: 0.166003, unit: "aic" }, premiumRequests: 2, updatedAt: 0, source: "copilot-events" } as AgentUsage;
  expect(usageLines(usage).join("\n")).toContain("コスト 0.1660 AIC · プレミアムリクエスト 2");
});

it("renders Antigravity current usage and quota in the TUI without invented currency", async () => {
  const { UsageDashboard } = await import("./UsageView.js");
  const model = new SessionModel(); model.applySnapshot(snapshot(), "client");
  const pane = model.panes.get("p1")!;
  model.panes.set("p1", { ...pane, agent: { instanceId: "instance", kind: "agy", label: "Antigravity CLI", state: "idle", since: 0, completionSeq: 0, serverSeenSeq: 0, verified: false } });
  const ui = new UiState(model, vi.fn());
  const usage = { status: "ready", data: { panes: { p1: { paneId: "p1", kind: "agy", model: "Gemini 3.5 Flash", tokens: { basis: "context", input: 1234 }, contextUsedPct: 25, updatedAt: Date.now(), source: "statusline" } }, accounts: [{ kind: "agy", accountKey: "a", label: "Antigravity CLI", windows: [{ label: "gemini-weekly", usedPct: 30, resetsAt: Date.now() + 3600000 }], source: "statusline", asOf: Date.now() }] } } as unknown as UsageModel;
  const grid = new Grid(140, 35); new UsageDashboard(model, ui, usage, vi.fn()).render(grid, { x: 0, y: 0, w: 140, h: 35 }, new ThemeColors("dracula"));
  const text = Array.from({ length: 35 }, (_, y) => grid.rowText(y)).join("\n");
  expect(text).toContain("Antigravity CLI"); expect(text).toContain("gemini-weekly");
  expect(text).toContain("30.0%"); expect(text).toContain("Gemini 3.5 Flash");
  expect(text).toContain("文脈内 1,234");
  expect(text).not.toContain("$0");
});

it.each(["agy", "bob"])("shows known token subtotals for %s and sorts by them", async (kind) => {
  const { UsageDashboard } = await import("./UsageView.js");
  const model = new SessionModel(); model.applySnapshot(snapshot(), "client");
  const pane = model.panes.get("p1")!;
  const agent = { instanceId: "instance", kind, label: kind, state: "idle", since: 0, completionSeq: 0, serverSeenSeq: 0, verified: false } as const;
  model.panes.set("p1", { ...pane, label: "alpha", agent });
  model.panes.set("p2", { ...pane, id: "p2", label: "zeta", agent: { ...agent, instanceId: "other" } });
  const u = { paneId: "p1", kind, model: "test-model", tokens: { basis: "context", input: 80000, output: 1000, cacheRead: 4000 }, updatedAt: 0, source: "statusline" } as AgentUsage;
  expect(usageLines(u).join("\n")).toContain("トークン 合計 85,000");
  expect(usageLines({ ...u, tokens: { basis: "context", input: 0 } }).join("\n")).toContain("トークン 合計 0");
  expect(usageLines({ ...u, tokens: { basis: "context" } }).join("\n")).toContain("トークン 合計 —");
  expect(usageLines({ ...u, tokens: { ...u.tokens, total: 7 } }).join("\n")).toContain("トークン 合計 7");
  const usage = { status: "ready", data: { panes: { p1: { ...u, tokens: { basis: "context", input: 100 } }, p2: { ...u, paneId: "p2" } }, accounts: [] } } as unknown as UsageModel;
  const view = new UsageDashboard(model, new UiState(model), usage, vi.fn());
  view.handleKey({ key: "s" } as never);
  const grid = new Grid(140, 35); view.render(grid, { x: 0, y: 0, w: 140, h: 35 }, new ThemeColors("dracula"));
  const text = Array.from({ length: 35 }, (_, y) => grid.rowText(y)).join("\n");
  expect(text).toContain("文脈内 85,000");
  expect(text.indexOf("zeta")).toBeLessThan(text.indexOf("alpha"));
});

it("keeps child metadata in information without conversation controls",()=>{
 const model=new SessionModel();model.applySnapshot(snapshot(),"client");const p=model.panes.get("p1")!;
 model.panes.set("p1",{...p,agent:{kind:"codex",instanceId:"parent",state:"idle",subagents:{count:1,items:[{id:"child",description:"Generated Child",startedAt:1,hasTranscript:true,model:"observed-model",modelBasis:"turn",reasoningEffort:"medium",reasoningEffortBasis:"turn"}]}} as NonNullable<typeof p.agent>});
 const ui=new UiState(model),usage={status:"ready",data:{panes:{},accounts:[]}} as unknown as UsageModel,dialog=new UsageDialog("p1",model,ui,usage),grid=new Grid(100,30);
 dialog.handleKey({key:"Tab"} as never);dialog.handleKey({key:"Enter"} as never);dialog.render({grid,theme:new ThemeColors("dracula")});
 const text=Array.from({length:grid.h},(_,y)=>grid.rowText(y)).join("\n");expect(text).toContain("Generated Child");expect(text).toContain("observed-model medium");expect(text).not.toContain("[会話]");expect(text).not.toContain("Enter:会話");
});

it("expands dashboard child rows with unchanged parent usage and routes selected children to their own conversation",async()=>{
 const {UsageDashboard}=await import('./UsageView.js'),model=new SessionModel();model.applySnapshot(snapshot(),"client");const p=model.panes.get('p1')!;
 model.panes.set('p1',{...p,label:'Generated Parent',agent:{kind:'codex',instanceId:'i',name:'parent-agent',state:'idle',subagents:{count:2,countBasis:'alive',items:[{id:'c1',description:'Generated Child',startedAt:1,state:'unknown',model:'child-model',modelBasis:'turn',reasoningEffort:'medium',reasoningEffortBasis:'turn'},{id:'c2',description:'Other Child',startedAt:1,state:'idle'}]}} as NonNullable<typeof p.agent>});
 const ui=new UiState(model),focus=vi.fn(),usage={status:'ready',data:{panes:{p1:{paneId:'p1',kind:'codex',model:'parent-model',tokens:{basis:'cumulative',total:12345},costUsd:7.25,source:'rollout',updatedAt:1}},accounts:[]}} as unknown as UsageModel,view=new UsageDashboard(model,ui,usage,focus);
 const text=()=>{const grid=new Grid(140,35);view.render(grid,{x:0,y:0,w:140,h:35},new ThemeColors('dracula'));return Array.from({length:grid.h},(_,y)=>grid.rowText(y)).join('\n');};expect(text()).not.toContain('Generated Child');expect(text()).toContain('▸2');view.handleKey({key:' '} as never);let display=text();expect(display).toContain('Generated Child');expect(display).toContain('child-model medium');expect(display).toContain('1 エージェント');expect(display.match(/12,345/g)).toHaveLength(1);expect(display.match(/7\.2500/g)).toHaveLength(1);
 view.handleKey({key:'ArrowDown'} as never);view.handleKey({key:'Enter'} as never);expect(ui.dialogContext).toMatchObject({kind:'childConversation',paneId:'p1',agentId:'c1',instanceId:'i'});expect(focus).not.toHaveBeenCalled();
});

it("keeps expanded children navigable when their variable-height rows exceed the viewport and caps at 64",async()=>{
 const {UsageDashboard}=await import('./UsageView.js'),model=new SessionModel();model.applySnapshot(snapshot(),"client");const p=model.panes.get('p1')!;
 model.panes.set('p1',{...p,agent:{kind:'codex',instanceId:'i',state:'idle',subagents:{count:70,countBasis:'alive',items:Array.from({length:70},(_,i)=>({id:`c${i}`,description:`Generated child ${i}`,startedAt:1,state:'unknown' as const,model:'actual-model',modelBasis:'turn' as const}))}} as NonNullable<typeof p.agent>});const ui=new UiState(model),usage={status:'ready',data:{panes:{},accounts:[]}} as unknown as UsageModel,view=new UsageDashboard(model,ui,usage,vi.fn());
 view.handleKey({key:' '} as never);for(let i=0;i<64;i++)view.handleKey({key:'ArrowDown'} as never);const grid=new Grid(100,25);view.render(grid,{x:0,y:0,w:100,h:25},new ThemeColors('dracula'));const text=Array.from({length:grid.h},(_,y)=>grid.rowText(y)).join('\n');expect(text).toContain('Generated child 63');expect(text).not.toContain('Generated child 64');view.handleKey({key:'Enter'} as never);expect(ui.dialogContext).toMatchObject({agentId:'c63'});
});

it("dragging the variable-height child scrollbar to the bottom reveals and selects the final child",async()=>{
 const {UsageDashboard}=await import('./UsageView.js'),model=new SessionModel();model.applySnapshot(snapshot(),"client");const p=model.panes.get('p1')!;
 model.panes.set('p1',{...p,agent:{kind:'codex',instanceId:'i',state:'idle',subagents:{count:64,countBasis:'alive',items:Array.from({length:64},(_,i)=>({id:`c${i}`,description:`Generated child ${i}`,startedAt:1,state:'unknown' as const,model:'actual-model',modelBasis:'turn' as const}))}} as NonNullable<typeof p.agent>});const ui=new UiState(model),usage={status:'ready',data:{panes:{},accounts:[]}} as unknown as UsageModel,view=new UsageDashboard(model,ui,usage,vi.fn()),grid=new Grid(100,25),theme=new ThemeColors('dracula'),area={x:0,y:0,w:100,h:25};
 view.handleKey({key:' '} as never);view.render(grid,area,theme);
 const track=Array.from({length:grid.h},(_,y)=>y).filter(y=>['█','░'].includes(grid.cell(99,y).ch)),thumb=track.find(y=>grid.cell(99,y).ch==='█')!;expect(track.length).toBeGreaterThan(1);
 view.handleMouse({action:'down',button:0,x:99,y:thumb});view.handleMouse({action:'move',button:0,x:99,y:track.at(-1)!+5});view.handleMouse({action:'up',button:0,x:99,y:track.at(-1)!+5});view.render(grid,area,theme);
 const text=Array.from({length:grid.h},(_,y)=>grid.rowText(y)).join('\n');expect(text).toContain('Generated child 63');view.handleKey({key:'Enter'} as never);expect(ui.dialogContext).toMatchObject({agentId:'c63'});
});

describe("child usage inside information",()=>{
 beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
 const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
 function childInfo(reply:()=>unknown|Promise<unknown>){
   const model=new SessionModel();model.applySnapshot(snapshot(),"client");const original=model.panes.get("p1")!;
   const pane={...original,agent:{...original.agent!,kind:"codex",instanceId:"i",subagents:{count:2,items:[{id:"a",description:"Child A",startedAt:1},{id:"b",description:"Child B",startedAt:2}]}},agentSession:{kind:"codex" as const,sessionId:"s",reportedAt:1}};model.panes.set("p1",pane);
   const request=vi.fn(async(_m:string,_p:unknown)=>reply());let outer:string|null="machine-client";
   const ui=new UiState(model),usage={status:"ready",data:{panes:{},accounts:[]}} as unknown as UsageModel;
   const dialog=new UsageDialog("p1",model,ui,usage,{port:{request} as never,outer:()=>outer,redraw:vi.fn()});
   const render=()=>{const grid=new Grid(110,40);dialog.render({grid,theme:new ThemeColors("dracula")});return Array.from({length:grid.h},(_,y)=>grid.rowText(y)).join("\n");};
   return{dialog,request,model,pane,render,disconnect:()=>{outer=null;}};
 }
 const response={status:"ok",usage:{source:"grok-usage",consumptionScope:"subtree",costUsd:0.0031,costBasis:"reported",partial:true}};
 it("selects one child with Tab/U and restores parent information with Esc without mixing totals",async()=>{
   const f=childInfo(()=>response);expect(f.request).not.toHaveBeenCalled();f.dialog.handleKey({key:"Tab"} as never);f.dialog.handleKey({key:"u"} as never);await flush();expect(f.render()).toContain("子: Child B");expect(f.render()).toContain("この子と配下");expect(f.render()).toContain("$0.0031");expect(f.request.mock.calls[0]).toEqual(["agent.subagent_usage",{paneId:"p1",agentId:"b"}]);f.dialog.handleKey({key:"Escape"} as never);await vi.advanceTimersByTimeAsync(30000);expect(f.request).toHaveBeenCalledTimes(1);expect(f.render()).not.toContain("$0.0031");f.dialog.dispose();
 });
 it("opens numeric details from the rendered child row by mouse",async()=>{
   const f=childInfo(()=>response);const y=f.render().split("\n").findIndex(row=>row.includes("Child A"));expect(y).toBeGreaterThan(0);f.dialog.handleMouse({action:"down",button:0,x:8,y});await flush();expect(f.render()).toContain("子: Child A");expect(f.request.mock.calls[0]).toEqual(["agent.subagent_usage",{paneId:"p1",agentId:"a"}]);f.dialog.dispose();
 });
 it("discards late child data after the parent connection changes",async()=>{
   let finish!:(v:unknown)=>void;const f=childInfo(()=>new Promise(r=>{finish=r;}));f.dialog.handleKey({key:"u"} as never);f.disconnect();finish(response);await flush();expect(f.render()).not.toContain("$0.0031");expect(f.render()).toContain("親の参照が無効");await vi.advanceTimersByTimeAsync(30000);expect(f.request).toHaveBeenCalledTimes(1);f.dialog.dispose();
 });
});
