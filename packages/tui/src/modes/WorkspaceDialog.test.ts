import { expect, it, vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
const tick = () => new Promise((r) => setTimeout(r, 0));
it("terminal window browses a file, preserves newlines while editing and sends versioned save", async () => {
  const model = new SessionModel();
  model.tabs.set("t", {
    id: "t",
    workspaceId: "w",
    label: "t",
    layout: { type: "pane", paneId: "p" },
    focusedPaneId: "p",
    zoomedPaneId: null,
    sizeOwnerClientId: null,
  });
  const ui = new UiState(model);
  const request = vi.fn(
    async (_method: string, p: { operation: string; path?: string; content?: string }) =>
      p.operation === "list"
        ? { entries: [{ name: "file", path: "file", directory: false, link: false }] }
        : p.operation === "read"
          ? { text: "first\nsecond\n", version: "a".repeat(64) }
          : { version: "b".repeat(64) },
  );
  const dialog = new WorkspaceDialog(
    "t",
    undefined,
    model,
    ui,
    { request } as unknown as RequestPort,
    () => {},
    "files",
  );
  await tick();
  dialog.handleKey(chordToKeyInput("Enter")!);
  await tick();
  dialog.handleKey(chordToKeyInput("e")!);
  dialog.handleKey(chordToKeyInput("Home")!);
  dialog.handlePaste("new\n");
  dialog.handleKey(chordToKeyInput("Esc")!);
  dialog.handleKey(chordToKeyInput("p")!);
  dialog.handlePaste("other");
  dialog.handleKey(chordToKeyInput("Enter")!);
  expect(request.mock.calls.filter(([, p]) => p.operation === "read")).toHaveLength(1);
  dialog.handleKey(chordToKeyInput("Ctrl+s")!);
  await tick();
  expect(request).toHaveBeenCalledWith(
    "workspace.tools",
    expect.objectContaining({
      operation: "write",
      path: "file",
      content: "new\nfirst\nsecond\n",
      version: "a".repeat(64),
    }),
  );
  dialog.dispose();
});
it("Grep uses the same bounded search API with content mode", async () => {
  const model = new SessionModel();
  model.tabs.set("t", {
    id: "t",
    workspaceId: "w",
    label: "t",
    layout: { type: "pane", paneId: "p" },
    focusedPaneId: "p",
    zoomedPaneId: null,
    sizeOwnerClientId: null,
  });
  const request = vi.fn(async () => ({ matches: [] }));
  const dialog = new WorkspaceDialog(
    "t",
    "p",
    model,
    new UiState(model),
    { request } as unknown as RequestPort,
    () => {},
  );
  dialog.handleKey(chordToKeyInput("Ctrl+g")!);
  dialog.handlePaste("needle");
  dialog.handleKey(chordToKeyInput("Enter")!);
  await tick();
  expect(request).toHaveBeenCalledWith(
    "workspace.tools",
    expect.objectContaining({ operation: "search", query: "needle", grep: true }),
  );
  dialog.dispose();
});
it("colors added, removed and hunk rows independently in a native diff view", async () => {
  const model = new SessionModel();
  model.tabs.set("t", {
    id: "t",
    workspaceId: "w",
    label: "t",
    layout: { type: "pane", paneId: "p" },
    focusedPaneId: "p",
    zoomedPaneId: null,
    sizeOwnerClientId: null,
  });
  const request = vi.fn(async (_m: string, p: { operation: string }) =>
    p.operation === "git-status" ? { files: [] } : { text: "@@ -1 +1 @@\n-removed\n+added" },
  );
  const d = new WorkspaceDialog(
    "t",
    undefined,
    model,
    new UiState(model),
    { request } as unknown as RequestPort,
    () => {},
    "git-diff",
  );
  await tick();
  const { Grid } = await import("../render/Screen.js"),
    { ThemeColors, paletteColor } = await import("../render/color.js");
  const grid = new Grid(80, 24);
  d.render({ grid, theme: new ThemeColors("dracula") });
  const color = (text: string) => {
    for (let y = 0; y < grid.h; y++) {
      const x = grid.rowText(y).indexOf(text);
      if (x >= 0) return grid.cell(x, y).fg;
    }
    return undefined;
  };
  expect(color("+added")).toBe(paletteColor(2));
  expect(color("-removed")).toBe(paletteColor(1));
  expect(color("@@")).toBe(paletteColor(6));
  d.dispose();
});
it("embedded two-row file lists retain both rows and clicking the first opens that file", async () => {
  const { Grid } = await import("../render/Screen.js"),
    { ThemeColors } = await import("../render/color.js");
  const model = new SessionModel();
  model.tabs.set("t", {
    id: "t",
    workspaceId: "w",
    label: "t",
    layout: { type: "pane", paneId: "p" },
    focusedPaneId: "p",
    zoomedPaneId: null,
    sizeOwnerClientId: null,
  });
  const request = vi.fn(async (_method: string, p: { operation: string }) =>
    p.operation === "list"
      ? {
          entries: [
            { name: "first", path: "first", directory: false, link: false },
            { name: "second", path: "second", directory: false, link: false },
          ],
        }
      : { text: "hello", version: "a".repeat(64) },
  );
  const dialog = new WorkspaceDialog(
    "t",
    undefined,
    model,
    new UiState(model),
    { request } as unknown as RequestPort,
    vi.fn(),
    "files",
  );
  await tick();
  const grid = new Grid(40, 2);
  dialog.render({ grid, theme: new ThemeColors("dracula"), embedded: true });
  expect(grid.rowText(0)).toContain("first");
  expect(grid.rowText(1)).toContain("second");
  dialog.handleMouse({ action: "down", button: 0, x: 2, y: 0 });
  await tick();
  expect(request).toHaveBeenCalledWith(
    "workspace.tools",
    expect.objectContaining({ operation: "read", path: "first" }),
  );
  dialog.dispose();
});
