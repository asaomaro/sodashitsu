import { expect, it, vi } from "vitest";
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
    if (height === 24) expect(grid.rowText(y + 1)).toContain(" codex ·");
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
