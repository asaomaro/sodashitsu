import { expect, it, vi } from "vitest";
import { GraphView } from "./GraphView.js";
import { UsageDashboard, UsageDialog } from "./UsageView.js";
import { ScheduleView } from "./ScheduleView.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import type { UsageModel } from "../model/UsageModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { Grid } from "../render/Screen.js";
import { DEFAULT_COLOR, ThemeColors } from "../render/color.js";

it.each(["graph", "usage", "schedules"] as const)(
  "%s uses the terminal default background when transparency is toggled, preserving highlights",
  (screen) => {
    const model = new SessionModel(),
      ui = new UiState(model);
    const usage = { status: "ready", data: { panes: {}, accounts: [] } } as unknown as UsageModel;
    const conn = { request: vi.fn() } as unknown as RequestPort;
    const view =
      screen === "graph"
        ? new GraphView(
            model,
            ui,
            conn,
            () => {},
            () => {},
          )
        : screen === "usage"
          ? new UsageDashboard(model, ui, usage, () => {})
          : new ScheduleView(model, ui, conn, () => {});
    const area = { x: 2, y: 2, w: 96, h: 24 };
    for (const transparent of [false, true, false]) {
      const theme = new ThemeColors("dracula", undefined, transparent);
      const grid = new Grid(100, 30);
      view.render(grid, area, theme);
      const bg = transparent ? DEFAULT_COLOR : theme.ui("--soda-menu-bg");
      // Both blank space and the screen title must use the setting.
      expect(grid.cell(2, 25).bg).toBe(bg);
      expect(grid.cell(3, 2).bg).toBe(bg);
      if (screen === "graph") {
        expect(grid.cell(96, 2).bg).toBe(theme.ui("--soda-menu-active-bg"));
      }
      // Overlay windows remain solid even while the main screen is transparent.
      const dialogGrid = new Grid(100, 30);
      new UsageDialog(null, model, ui, usage).render({ grid: dialogGrid, theme });
      const titleRow = Array.from({ length: 30 }, (_, y) => y).find((y) =>
        dialogGrid.rowText(y).includes("アカウント"),
      );
      expect(titleRow).toBeDefined();
      expect(dialogGrid.cell(50, titleRow!).bg).toBe(theme.ui("--soda-menu-bg"));
    }
  },
);
