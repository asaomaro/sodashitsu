import { expect, it } from "vitest";
import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { ViewHistory } from "./ViewHistory.js";
it("remembers local tab and pane per workspace, ignoring shared focus and rejecting removed/moved targets", () => {
  const session = {
    workspaces: new Map([
      ["a", { id: "a", activeTabId: "a1", tabIds: ["a1", "a2"] } as Workspace],
      ["b", { id: "b", activeTabId: "b1", tabIds: ["b1"] } as Workspace],
    ]),
    tabs: new Map([
      ["a1", { id: "a1", workspaceId: "a", focusedPaneId: "p1" } as Tab],
      ["a2", { id: "a2", workspaceId: "a", focusedPaneId: "p2" } as Tab],
      ["b1", { id: "b1", workspaceId: "b", focusedPaneId: "p4" } as Tab],
    ]),
    panes: new Map([
      ["p1", { id: "p1", tabId: "a1" } as Pane],
      ["p2", { id: "p2", tabId: "a2" } as Pane],
      ["p3", { id: "p3", tabId: "a2" } as Pane],
      ["p4", { id: "p4", tabId: "b1" } as Pane],
    ]),
  };
  const history = new ViewHistory();
  history.remember("a", "a2", "p3", session);
  history.remember("b", "b1", "p4", session);
  expect(history.tab("a", session)).toBe("a2");
  expect(history.pane("a2", session)).toBe("p3");
  session.panes.delete("p3");
  expect(history.pane("a2", session)).toBe("p2");
  session.tabs.get("a2")!.workspaceId = "b";
  expect(history.tab("a", session)).toBe("a1");
  history.clear();
  expect(history.tab("a", session)).toBe("a1");
});
