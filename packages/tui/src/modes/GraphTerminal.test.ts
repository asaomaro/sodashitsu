import { expect, it, vi } from "vitest";
import { chordToKeyInput, type TerminalSinkPort } from "@sodashitsu/client-core";
import { GraphTerminal } from "./GraphTerminal.js";
import { WindowOverlay } from "./WindowOverlay.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { snapshot } from "../testing/fixtures.js";
import type { RequestPort } from "../term/PaneRegistry.js";
function setup(
  request: ReturnType<typeof vi.fn<(method: string) => Promise<unknown>>> = vi.fn(
    async (method: string) => (method === "pane.attach" ? { cols: 70, rows: 15 } : {}),
  ),
) {
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const ui = new UiState(model);
  ui.setScreen("graph");
  ui.openDialogWithContext({ kind: "graphTerminal", paneId: "p1" });
  let sink: TerminalSinkPort | undefined;
  const remove = vi.fn(),
    input = vi.fn(),
    focus = vi.fn();
  const deps = {
    ui,
    model,
    conn: { request } as unknown as RequestPort,
    sendInput: input,
    focus,
    redraw: vi.fn(),
    attachExternal: (_: string, s: TerminalSinkPort) => {
      sink = s;
      return remove;
    },
  };
  const dialog = new GraphTerminal("p1", deps),
    window = new WindowOverlay(dialog, { w: 80, h: 23 });
  const render = () => {
    const grid = new Grid(100, 30);
    window.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  return { dialog, window, render, request, ui, input, focus, remove, sink: () => sink, deps };
}
it("shows live terminal output, routes raw keys/paste to its pane, resizes, and detaches before normal navigation", async () => {
  const k = setup();
  k.render();
  await vi.waitFor(() =>
    expect(k.request).toHaveBeenCalledWith("pane.subscribe", {
      paneId: "p1",
      scrollbackLines: 2000,
    }),
  );
  k.sink()!.onSnapshot("p1", 72, 17, "LIVE OUTPUT");
  await vi.waitFor(() =>
    expect(Array.from({ length: 30 }, (_, y) => k.render().rowText(y)).join("\n")).toContain(
      "LIVE OUTPUT",
    ),
  );
  k.window.handleKeyEvent({ key: chordToKeyInput("a")!, raw: "a" });
  k.window.handlePaste("paste");
  expect(k.input).toHaveBeenCalledWith("p1", "a");
  expect(k.input).toHaveBeenCalledWith("p1", "paste");
  k.window.handleKey({ ...chordToKeyInput("Left")!, alt: true });
  k.render();
  await vi.waitFor(() =>
    expect(k.request).toHaveBeenCalledWith("pane.attach_resize", {
      paneId: "p1",
      cols: 72,
      rows: 17,
    }),
  );
  k.window.handleKeyEvent({ key: { ...chordToKeyInput("Enter")!, ctrl: true }, raw: "" });
  await vi.waitFor(() => expect(k.focus).toHaveBeenCalledWith("p1"));
  expect(k.ui.screen).toBe("base");
  expect(k.remove).toHaveBeenCalledOnce();
  expect(k.request).toHaveBeenCalledWith("pane.detach", { paneId: "p1" });
  expect(k.request).toHaveBeenCalledWith("pane.unsubscribe", { paneId: "p1" });
  expect(k.request).not.toHaveBeenCalledWith("pane.close", expect.anything());
});
it("closing while attach is pending releases the eventual lease and never sends input", async () => {
  let resolve!: (value: unknown) => void;
  const request = vi.fn((method: string) =>
    method === "pane.attach" ? new Promise((r) => (resolve = r)) : Promise.resolve({}),
  );
  const k = setup(request);
  k.render();
  await vi.waitFor(() => expect(resolve).toBeDefined());
  k.dialog.handleKey(chordToKeyInput("a")!);
  k.dialog.handlePaste("blocked");
  k.dialog.cancel();
  resolve({ cols: 70, rows: 15 });
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("pane.detach", { paneId: "p1" }));
  expect(k.input).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalledWith("pane.subscribe", expect.anything());
});
it("failed or stolen attachment cannot send input, and close does not steal a lease", async () => {
  const request = vi.fn(async () => {
    throw Object.assign(new Error("busy"), { code: "pane_attached" });
  });
  const k = setup(request);
  k.render();
  await new Promise((r) => setTimeout(r, 0));
  k.dialog.handleKey(chordToKeyInput("a")!);
  k.dialog.handlePaste("blocked");
  k.dialog.cancel();
  await new Promise((r) => setTimeout(r, 0));
  expect(k.input).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalledWith("pane.detach", expect.anything());
  const other = setup();
  other.render();
  await vi.waitFor(() =>
    expect(other.request).toHaveBeenCalledWith("pane.subscribe", expect.anything()),
  );
  other.dialog.onAttachChanged("other-client");
  other.dialog.handlePaste("blocked");
  expect(other.ui.dialogContext).toBeNull();
  expect(other.input).not.toHaveBeenCalled();
});
it("rapid reopening waits until the predecessor has detached and unsubscribed", async () => {
  const k = setup();
  k.render();
  await vi.waitFor(() =>
    expect(k.request).toHaveBeenCalledWith("pane.subscribe", expect.anything()),
  );
  k.dialog.dispose();
  const next = new GraphTerminal("p1", k.deps);
  next.render({ grid: new Grid(80, 23), theme: new ThemeColors("dracula") });
  await vi.waitFor(() =>
    expect(k.request.mock.calls.filter(([m]) => m === "pane.attach")).toHaveLength(2),
  );
  const methods = k.request.mock.calls.map(([m]) => m);
  expect(methods.lastIndexOf("pane.attach")).toBeGreaterThan(methods.indexOf("pane.unsubscribe"));
  next.dispose();
});
it("Escape belongs to the terminal; delayed navigation never overwrites another dialog", async () => {
  let detachResolve!: () => void;
  const request = vi.fn((method: string) =>
    method === "pane.detach"
      ? new Promise<void>((resolve) => (detachResolve = resolve))
      : Promise.resolve({ cols: 70, rows: 15 }),
  );
  const k = setup(request);
  k.render();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("pane.subscribe", expect.anything()));
  k.window.handleKeyEvent({ key: chordToKeyInput("Esc")!, raw: "\x1b" });
  expect(k.input).toHaveBeenCalledWith("p1", "\x1b");
  expect(k.ui.dialogContext?.kind).toBe("graphTerminal");
  k.window.handleKeyEvent({ key: { ...chordToKeyInput("Enter")!, ctrl: true }, raw: "" });
  await vi.waitFor(() => expect(detachResolve).toBeDefined());
  k.ui.openDialogWithContext({ kind: "help" });
  detachResolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(k.focus).not.toHaveBeenCalled();
  expect(k.ui.dialogContext?.kind).toBe("help");
  expect(k.ui.screen).toBe("graph");
});
it("keeps both footer buttons visible and clickable at the minimum window width", async () => {
  const k = setup();
  const window = new WindowOverlay(k.dialog, { w: 24, h: 12 });
  const grid = new Grid(24, 12);
  window.render({ grid, theme: new ThemeColors("dracula") });
  const lines = Array.from({ length: grid.h }, (_, y) => grid.rowText(y));
  expect(lines.join("\n")).toContain("[ 端末へ移動 ]");
  expect(lines.join("\n")).toContain("[ 閉じる ]");
  const y = lines.findIndex((s) => s.includes("[ 閉じる ]"));
  window.handleMouse({ action: "down", button: 0, x: 4, y });
  expect(k.ui.dialogContext).toBeNull();
});
