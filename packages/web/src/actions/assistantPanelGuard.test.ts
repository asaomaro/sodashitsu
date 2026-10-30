import { afterEach, expect, it, vi } from "vitest";
import { assistantPanelGuard } from "./assistantPanelGuard.js";
import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
const p = "00000000-0000-4000-8000-000000000001",
  w = "00000000-0000-4000-8000-000000000002",
  a = "00000000-0000-4000-8000-000000000003";
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
it("blocks before connection, re-reads replaced maps and synchronously fences stale input", () => {
  document.body.innerHTML = '<div id="app"><input id="terminal"></div>';
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
  let connected = false,
    model = {
      panes: new Map<string, Pane>(),
      tabs: new Map<string, Tab>(),
      workspaces: new Map<string, Workspace>(),
    };
  const focus = vi.fn();
  const update = assistantPanelGuard(
    { model: () => model, connected: () => connected, focus },
    `#assistantPane=${p}&assistantWorkspace=${w}&assistantInstance=${a}`,
  );
  expect((document.getElementById("app") as HTMLElement).inert).toBe(true);
  const early = new KeyboardEvent("keydown", { key: "y", bubbles: true, cancelable: true });
  document.getElementById("terminal")!.dispatchEvent(early);
  expect(early.defaultPrevented).toBe(true);
  model = {
    panes: new Map([[p, { id: p, tabId: "t", agent: { instanceId: a } } as Pane]]),
    tabs: new Map([["t", { id: "t", workspaceId: w } as Tab]]),
    workspaces: new Map([[w, { id: w, cwd: "/original", projectDir: "/original" } as Workspace]]),
  };
  connected = true;
  update();
  expect(focus).toHaveBeenCalledTimes(1);
  expect((document.getElementById("app") as HTMLElement).inert).toBe(false);
  model.workspaces.get(w)!.projectDir = "/replaced";
  const late = new KeyboardEvent("keydown", { key: "y", bubbles: true, cancelable: true });
  document.getElementById("terminal")!.dispatchEvent(late);
  expect(late.defaultPrevented).toBe(true);
  expect((document.getElementById("app") as HTMLElement).inert).toBe(true);
  update.dispose();
});
it("never accepts matching pane UUIDs on the wrong machine", async () => {
  document.body.innerHTML = '<div id="app"><input id="terminal"></div>';
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
  let machine = "local";
  const remote = "a".repeat(32),
    focus = vi.fn(),
    switchMachine = vi.fn(),
    model = {
      panes: new Map([[p, { id: p, tabId: "t", agent: { instanceId: a } } as Pane]]),
      tabs: new Map([["t", { id: "t", workspaceId: w } as Tab]]),
      workspaces: new Map([[w, { id: w, cwd: "/same", projectDir: "/same" } as Workspace]]),
    };
  const update = assistantPanelGuard(
    { model: () => model, connected: () => true, machine: () => machine, switchMachine, focus },
    `#assistantPane=${p}&assistantWorkspace=${w}&assistantInstance=${a}&assistantMachine=${remote}`,
  );
  update();
  expect(focus).not.toHaveBeenCalled();
  expect((document.getElementById("app") as HTMLElement).inert).toBe(true);
  expect(switchMachine).toHaveBeenCalledWith(remote);
  machine = remote;
  update();
  expect(focus).toHaveBeenCalledTimes(1);
  update.dispose();
});
it("rejects restored foreign focus before input and returns to the pinned pane", () => {
  document.body.innerHTML = '<div id="app"><input id="terminal"></div>';
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
  let focused: string | null = null;
  const model = {
    panes: new Map([[p, { id: p, tabId: "t", agent: { instanceId: a } } as Pane]]),
    tabs: new Map([["t", { id: "t", workspaceId: w } as Tab]]),
    workspaces: new Map([[w, { id: w, cwd: "/same", projectDir: "/same" } as Workspace]]),
  };
  const focus = vi.fn((pane: Pane) => {
    focused = pane.id;
  });
  const update = assistantPanelGuard(
    { model: () => model, connected: () => true, focusedPane: () => focused, focus },
    `#assistantPane=${p}&assistantWorkspace=${w}&assistantInstance=${a}`,
  );
  try {
    update();
    expect(focused).toBe(p);
    focused = "other-pane";
    const event = new KeyboardEvent("keydown", { key: "y", bubbles: true, cancelable: true });
    document.getElementById("terminal")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    update();
    expect(focused).toBe(p);
    expect(focus).toHaveBeenCalledTimes(2);
  } finally {
    update.dispose();
  }
});
