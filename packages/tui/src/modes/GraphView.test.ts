import { expect, it, vi } from "vitest";
import { GraphView } from "./GraphView.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { pane, tab, workspace, leaf } from "../testing/fixtures.js";
import { chordToKeyInput } from "@sodashitsu/client-core";
import type { RequestPort } from "../term/PaneRegistry.js";
it("draws box and connection glyphs, drags native nodes without writing Web coordinates, and opens the worker", async () => {
  const model = new SessionModel();
  model.panes.set("a", pane("a", "t", { label: "Alpha" }));
  model.panes.set("b", pane("b", "t", { label: "Beta" }));
  model.tabs.set("t", tab("t", "w", leaf("a")));
  model.workspaces.set("w", workspace("w", ["t"]));
  const graph = {
    rev: 2,
    paused: false,
    nodes: [
      { key: "local:a", x: 1000, y: 2000 },
      { key: "local:b", x: -1000, y: -2000 },
    ],
    links: [
      {
        id: "l",
        kind: "supervise",
        from: "local:a",
        to: "local:b",
        limit: 10,
        count: 0,
        paused: null,
      },
    ],
  };
  const request = vi.fn(async () => graph),
    ui = new UiState(model),
    focus = vi.fn(),
    view = new GraphView(model, ui, { request } as unknown as RequestPort, () => {}, focus);
  ui.setScreen("graph");
  view.sync(true);
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("graph.get", {}));
  await new Promise((r) => setTimeout(r, 0));
  const render = () => {
    const grid = new Grid(100, 30);
    view.render(grid, { x: 0, y: 0, w: 100, h: 30 }, new ThemeColors("dracula"));
    return grid;
  };
  let grid = render();
  expect(grid.rowText(5)).toContain("Alpha");
  expect(grid.rowText(5)).toContain("Beta");
  expect(grid.rowText(2)).toContain("┌");
  expect(grid.rowText(1)).toContain("監督 0/10");
  expect(grid.rowText(7)).toContain("[t]");
  expect(grid.rowText(5)).toContain("▶");
  const minimum = new Grid(27, 11);
  view.render(minimum, { x: 0, y: 0, w: 27, h: 11 }, new ThemeColors("dracula"));
  expect(Array.from({ length: minimum.h }, (_, y) => minimum.rowText(y)).join("\n")).toContain(
    "Alpha",
  );
  view.handleMouse({ action: "down", button: 0, x: 3, y: 5 });
  view.handleMouse({ action: "move", button: 0, x: 8, y: 8 });
  view.handleMouse({ action: "up", button: 0, x: 8, y: 8 });
  grid = render();
  expect(grid.rowText(8)).toContain("Alpha");
  expect(grid.rowText(5)).not.toContain("Alpha");
  expect(focus).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalledWith("graph.update", expect.anything());
  expect(graph.nodes[0]).toMatchObject({ x: 1000, y: 2000 });

  view.handleKey(chordToKeyInput("Enter")!);
  expect(focus).toHaveBeenCalledWith("a");
  expect(ui.screen).toBe("graph");
  focus.mockClear();
  view.handleMouse({ action: "down", button: 0, x: 8, y: 8 });
  view.handleMouse({ action: "up", button: 0, x: 9, y: 8 });
  expect(focus).toHaveBeenCalledWith("a");
  expect(ui.screen).toBe("graph");
  view.dispose();
});
it("a pending fetch from an old screen does not block a later reopen", async () => {
  const model = new SessionModel(),
    ui = new UiState(model);
  let resolve!: (value: unknown) => void;
  const request = vi.fn(() => new Promise((r) => (resolve = r)));
  const view = new GraphView(
    model,
    ui,
    { request } as unknown as RequestPort,
    () => {},
    () => {},
  );
  view.sync(true);
  view.sync(false);
  view.sync(true);
  expect(request).toHaveBeenCalledTimes(2);
  resolve({ rev: 0, paused: false, nodes: [], links: [] });
  view.dispose();
});
it("new nodes avoid existing workspace nodes after the initial native layout", async () => {
  const model = new SessionModel(),
    ui = new UiState(model);
  for (const [id, t, w] of [
    ["a", "ta", "wa"],
    ["b", "tb", "wb"],
  ]) {
    model.panes.set(id!, pane(id!, t!, { label: id! }));
    model.tabs.set(t!, tab(t!, w!, leaf(id!)));
    model.workspaces.set(w!, workspace(w!, [t!]));
  }
  const graph = {
    rev: 0,
    paused: false,
    nodes: [
      { key: "local:a", x: 0, y: 0 },
      { key: "local:b", x: 0, y: 0 },
    ],
    links: [],
  };
  const request = vi.fn(async () => graph);
  const view = new GraphView(
    model,
    ui,
    { request } as unknown as RequestPort,
    () => {},
    () => {},
  );
  view.sync(true);
  await new Promise((r) => setTimeout(r, 0));
  const render = () => {
    const grid = new Grid(28, 70);
    view.render(grid, { x: 0, y: 0, w: 28, h: 70 }, new ThemeColors("dracula"));
    return grid;
  };
  render();
  model.panes.set("c", pane("c", "ta", { label: "NewNode" }));
  graph.nodes.push({ key: "local:c", x: 0, y: 0 });
  view.handleKey(chordToKeyInput("r")!);
  await new Promise((r) => setTimeout(r, 0));
  const grid = render();
  const rows = Array.from({ length: grid.h }, (_, y) => grid.rowText(y));
  const y = rows.findIndex((r) => r.includes("NewNode"));
  expect(y).toBeGreaterThan(0);
  const b = rows.findIndex((r) => r.includes("b") && r.includes("│"));
  expect(Math.abs(y - b)).toBeGreaterThanOrEqual(5);
  view.dispose();
});

it("graph uses live sidebar state symbols and dot preferences", async () => {
  const model = new SessionModel(),
    ui = new UiState(model);
  model.panes.set(
    "a",
    pane("a", "t", {
      label: "Worker",
      agent: {
        kind: "codex",
        state: "working",
        instanceId: "i",
        since: 0,
        label: "Codex",
        completionSeq: 0,
        serverSeenSeq: 0,
        verified: true,
      },
    }),
  );
  model.tabs.set("t", tab("t", "w", leaf("a")));
  model.workspaces.set("w", workspace("w", ["t"]));
  let symbols = true;
  const view = new GraphView(
    model,
    ui,
    {
      request: async () => ({
        rev: 1,
        paused: false,
        nodes: [{ key: "local:a", x: 0, y: 0 }],
        links: [],
      }),
    } as unknown as RequestPort,
    () => {},
    () => {},
    () => symbols,
  );
  view.sync(true);
  const theme = new ThemeColors("dracula");
  const render = () => {
    const grid = new Grid(100, 30);
    view.render(grid, { x: 0, y: 0, w: 100, h: 30 }, theme);
    return grid;
  };
  try {
    await vi.waitFor(() => expect(render().rowText(5)).toContain("◐ Worker"));
    const grid = render(),
      x = grid.rowText(5).indexOf("◐");
    expect(grid.cell(x, 5)?.fg).toBe(theme.ui("--soda-state-working"));
    symbols = false;
    expect(render().rowText(5)).toContain("● Worker");
    model.panes.get("a")!.agent!.state = "blocked";
    symbols = true;
    expect(render().rowText(5)).toContain("× Worker");
  } finally {
    view.dispose();
  }
});
