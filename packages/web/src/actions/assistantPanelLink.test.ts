import { expect, it } from "vitest";
import { assistantPanelTarget, assistantPanelPane } from "./assistantPanelLink.js";
import type { Pane, Tab } from "@sodashitsu/protocol";
const paneId = "00000000-0000-4000-8000-000000000001",
  workspaceId = "00000000-0000-4000-8000-000000000002",
  instanceId = "00000000-0000-4000-8000-000000000003";
it("accepts only a complete UUID target, never partial or duplicate parameters", () => {
  expect(assistantPanelTarget("#other")).toBeNull();
  expect(() => assistantPanelTarget(`#assistantPane=${paneId}`)).toThrow();
  expect(() =>
    assistantPanelTarget(
      `#assistantPane=${paneId}&assistantWorkspace=${workspaceId}&assistantInstance=${instanceId}&assistantInstance=${instanceId}`,
    ),
  ).toThrow();
});
it("opens only its original workspace and instance", () => {
  const target = assistantPanelTarget(
    `#assistantPane=${paneId}&assistantWorkspace=${workspaceId}&assistantInstance=${instanceId}`,
  )!;
  const pane = { id: paneId, tabId: "tab", agent: { instanceId } } as Pane;
  const tab = { id: "tab", workspaceId } as Tab;
  const panes = new Map([[paneId, pane]]),
    tabs = new Map([["tab", tab]]);
  expect(assistantPanelPane(target, panes, tabs)).toEqual({ pane, tab });
  pane.agent = { ...pane.agent!, instanceId: paneId };
  expect(() => assistantPanelPane(target, panes, tabs)).toThrow("変更");
  pane.agent = { ...pane.agent!, instanceId };
  tab.workspaceId = paneId;
  expect(() => assistantPanelPane(target, panes, tabs)).toThrow("変更");
});
