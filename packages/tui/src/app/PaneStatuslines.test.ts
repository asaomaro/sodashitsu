import { expect, it, vi } from "vitest";
import { PaneStatuslines } from "./PaneStatuslines.js";
import { SessionModel } from "../model/SessionModel.js";
import { PrefsModel } from "../model/PrefsModel.js";
import { UiState } from "../model/UiState.js";
import { agent, pane, snapshot } from "../testing/fixtures.js";
import { computeLayout } from "../layout/computeLayout.js";
import type { UsageModel } from "../model/UsageModel.js";
import type { SettingsWriter } from "../settings/SettingsWriter.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { loadStatuslineSettings } from "@sodashitsu/protocol";
it("reserves the bottom terminal row and clamps live resizing to the available information", () => {
  const model = new SessionModel();
  model.applySnapshot(
    snapshot({
      panes: [
        pane("p1", "t1", { label: "Alpha", agent: agent({ kind: "codex", label: "Codex" }) }),
        pane("p2", "t1"),
      ],
    }),
    "client",
  );
  const prefs = new PrefsModel(),
    ui = new UiState(model),
    setShared = vi.fn();
  const controller = new PaneStatuslines(
    model,
    prefs,
    { data: { panes: {}, accounts: [] } } as unknown as UsageModel,
    ui,
    { setShared } as unknown as SettingsWriter,
    vi.fn(),
  );
  const layout = () =>
    computeLayout({
      cols: 120,
      rows: 30,
      sidebarVisible: false,
      sidebarCols: 20,
      narrowThreshold: 40,
      tab: model.currentTab()!,
      focusedPaneId: "p1",
    });
  const original = layout(),
    before = original.panes[0]!.content.h;
  controller.adjust(original);
  const box = original.panes[0]!;
  expect(box.content.h).toBe(before - 1);
  expect(original.panes[1]!.content.h).toBe(before);
  const y = box.content.y + box.content.h;
  const max = Math.min(box.content.w, "Alpha · codex · idle".length + 3),
    x = box.content.x + max - 1;
  const ev = (action: "down" | "move" | "up", xx: number) => ({
    kind: "mouse" as const,
    action,
    button: 0,
    x: xx,
    y,
    mods: { ctrl: false, alt: false, shift: false, meta: false },
  });
  expect(controller.handle(ev("down", x))).toBe(true);
  controller.handle(ev("move", x + 1000));
  controller.adjust(layout());
  controller.handle(ev("up", x + 1000));
  expect(setShared).toHaveBeenLastCalledWith({
    statuslineSettings: { ...loadStatuslineSettings(undefined), columns: max },
  });
  controller.handle(ev("down", x));
  controller.handle(ev("move", x - 1000));
  controller.adjust(layout());
  controller.handle(ev("up", x - 1000));
  expect(setShared.mock.calls.at(-1)![0].statuslineSettings.columns).toBe(8);
  prefs.apply({ statuslineSettings: { ...loadStatuslineSettings(undefined), enabled: false } }, 1);
  const hidden = layout();
  controller.adjust(hidden);
  expect(hidden.panes[0]!.content.h).toBe(before);
});

it("scrolls in both directions and stops at the first full-width character that will not fit", () => {
  const model = new SessionModel();
  model.applySnapshot(
    snapshot({
      panes: [pane("p1", "t1", { label: "1234日本abc", agent: agent({ kind: "codex" }) })],
    }),
    "client",
  );
  const prefs = new PrefsModel();
  prefs.apply({ statuslineSettings: loadStatuslineSettings({ columns: 8 }) }, 1);
  const controller = new PaneStatuslines(
    model,
    prefs,
    { data: { panes: {}, accounts: [] } } as unknown as UsageModel,
    new UiState(model),
    {} as SettingsWriter,
    vi.fn(),
  );
  const layout = computeLayout({
    cols: 100,
    rows: 30,
    sidebarVisible: false,
    sidebarCols: 20,
    narrowThreshold: 40,
    tab: model.currentTab()!,
    focusedPaneId: "p1",
  });
  controller.adjust(layout);
  const box = layout.panes[0]!,
    y = box.content.y + box.content.h;
  const screen = () => {
    const grid = new Grid(100, 30);
    controller.render(grid, new ThemeColors("dracula"));
    return grid.rowText(y).slice(box.content.x, box.content.x + 8);
  };
  const first = screen();
  expect(first).toContain("1234");
  expect(first).not.toContain("a");
  controller.handle({
    kind: "mouse",
    action: "wheel",
    button: 65,
    x: box.content.x + 2,
    y,
    mods: { ctrl: false, alt: false, shift: false, meta: false },
  });
  expect(screen()).not.toBe(first);
  controller.handle({
    kind: "mouse",
    action: "wheel",
    button: 64,
    x: box.content.x + 2,
    y,
    mods: { ctrl: false, alt: false, shift: false, meta: false },
  });
  expect(screen()).toBe(first);
  for (let i = 0; i < 20; i++)
    controller.handle({
      kind: "mouse",
      action: "wheel",
      button: 65,
      x: box.content.x + 2,
      y,
      mods: { ctrl: false, alt: false, shift: false, meta: false },
    });
  model.panes.get("p1")!.label = "Hi";
  prefs.apply(
    {
      statuslineSettings: loadStatuslineSettings({
        columns: 8,
        fields: { agent: false, state: false },
      }),
    },
    2,
  );
  const short = computeLayout({
    cols: 100,
    rows: 30,
    sidebarVisible: false,
    sidebarCols: 20,
    narrowThreshold: 40,
    tab: model.currentTab()!,
    focusedPaneId: "p1",
  });
  controller.adjust(short);
  expect(screen()).toContain("Hi");
});
