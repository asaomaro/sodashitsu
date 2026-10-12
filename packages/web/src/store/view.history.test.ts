import { createPinia, setActivePinia } from "pinia";
import { expect, it } from "vitest";
import type { Tab, Workspace, Pane } from "@sodashitsu/protocol";
import { useSessionStore } from "./session.js";
import { useViewStore } from "./view.js";
it("workspace switches restore this browser selection rather than stale shared activeTab/focusedPane", () => {
  setActivePinia(createPinia());
  const session = useSessionStore(),
    view = useViewStore();
  view.setMachineScope("history-test");
  for (const [id, activeTabId, tabIds] of [
    ["a", "a1", ["a1", "a2"]],
    ["b", "b1", ["b1"]],
  ] as const)
    session.workspaces.set(id, { id, activeTabId, tabIds: [...tabIds] } as Workspace);
  for (const [id, workspaceId, focusedPaneId] of [
    ["a1", "a", "p1"],
    ["a2", "a", "p2"],
    ["b1", "b", "p4"],
  ])
    session.tabs.set(id!, { id, workspaceId, focusedPaneId } as Tab);
  for (const [id, tabId] of [
    ["p1", "a1"],
    ["p2", "a2"],
    ["p3", "a2"],
    ["p4", "b1"],
  ])
    session.panes.set(id!, { id, tabId } as Pane);
  view.setView("a", "a2");
  view.focusPane("p3");
  view.selectWorkspace("b");
  expect(view.tabId).toBe("b1");
  view.selectWorkspace("a");
  expect(view.tabId).toBe("a2");
  expect(view.focusedPaneId).toBe("p3");
  session.panes.delete("p3");
  view.selectWorkspace("b");
  view.selectWorkspace("a");
  expect(view.focusedPaneId).toBe("p2");
  view.setMachineScope("other-history-test");
  view.resetForMachineSwitch();
  view.selectWorkspace("a");
  expect(view.tabId).toBe("a1");
});
