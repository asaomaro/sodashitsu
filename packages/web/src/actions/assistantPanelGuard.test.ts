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
