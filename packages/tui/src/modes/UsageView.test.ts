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
