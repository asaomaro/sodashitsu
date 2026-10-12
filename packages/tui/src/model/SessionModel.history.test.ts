import { expect, it } from "vitest";
import type { Tab, Workspace, Pane } from "@sodashitsu/protocol";
import { SessionModel } from "./SessionModel.js";
it("workspace switches restore terminal local tab/pane and explicit agent selection takes priority", () => {
  const model = new SessionModel();
  for (const [id, activeTabId, tabIds] of [
    ["a", "a1", ["a1", "a2"]],
    ["b", "b1", ["b1"]],
  ] as const)
    model.workspaces.set(id, { id, activeTabId, tabIds: [...tabIds] } as Workspace);
  for (const [id, workspaceId, focusedPaneId] of [
    ["a1", "a", "p1"],
    ["a2", "a", "p2"],
    ["b1", "b", "p4"],
  ])
    model.tabs.set(id!, { id, workspaceId, focusedPaneId } as Tab);
  for (const [id, tabId] of [
    ["p1", "a1"],
    ["p2", "a2"],
    ["p3", "a2"],
    ["p4", "b1"],
  ])
    model.panes.set(id!, { id, tabId } as Pane);
  model.setView("a", "a2", "p3");
  model.selectWorkspace("b");
  model.selectWorkspace("a");
  expect(model.tabId).toBe("a2");
  expect(model.focusedPaneId).toBe("p3");
  model.focusPane("p1");
  model.selectWorkspace("b");
  model.selectWorkspace("a");
  expect(model.tabId).toBe("a1");
  expect(model.focusedPaneId).toBe("p1");
});
