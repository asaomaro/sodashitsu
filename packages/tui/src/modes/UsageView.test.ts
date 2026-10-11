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
