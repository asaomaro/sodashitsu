import { expect, it } from "vitest";
import { SessionModel } from "./SessionModel.js";
import type { SessionFileWorkspace } from "../persist/SessionFile.js";
it("migrates old statusline views and only removes unused virtual anchors", () => {
  const view = (id: string, paneId: string, viewId = "statusline", target = "tab") => ({
    id,
    paneId,
    viewId,
    target,
    extensionKey: "builtin:workspace",
    display: id,
    placement: "band-bottom",
  });
  const data = {
    id: "w",
    label: "PJ",
    cwd: "/pj",
    activeTabId: "t",
    tabs: [
      {
        id: "t",
        label: "1",
        displayPaneId: "unused",
        focusedPaneId: "real",
        zoomedPaneId: null,
        layout: { type: "pane", paneId: "real" },
        views: [
          view("old", "unused"),
          view("pinned", "real", "statusline", "pane"),
          view("shared-old", "shared"),
          view("kept", "shared", "files"),
        ],
        panes: [
          { id: "real", label: null, cwd: "/pj", shell: "sh" },
          ...["unused", "shared"].map((id) => ({
            id,
            label: null,
            cwd: "/pj",
            shell: "sh",
            virtual: true,
          })),
        ],
      },
    ],
  } as SessionFileWorkspace;
  const model = new SessionModel();
  model.restoreWorkspace(data, false);
  expect(model.getTab("t")!.views!.map((v) => v.id)).toEqual(["kept"]);
  expect(model.getPane("unused")).toBeUndefined();
  expect(model.getTab("t")!.displayPaneId).toBeUndefined();
  expect(model.getPane("real")).toBeDefined();
  expect(model.getPane("shared")).toBeDefined();
  expect(data.tabs[0]!.views).toHaveLength(4); // migration does not mutate the restore input
});

it("keeps the display anchor used by an app perspective when removing only its statusline", () => {
  const data = {
    id: "w",
    label: "PJ",
    cwd: "/pj",
    activeTabId: "t",
    tabs: [
      {
        id: "t",
        label: "1",
        displayPaneId: "app",
        plugin: { extensionKey: "plugin:studio", display: "studio" },
        focusedPaneId: "real",
        zoomedPaneId: null,
        layout: { type: "pane", paneId: "real" },
        views: [
          {
            id: "old",
            paneId: "app",
            viewId: "statusline",
            target: "tab",
            extensionKey: "builtin:workspace",
            display: "old",
            placement: "band-bottom",
          },
        ],
        panes: [
          { id: "real", label: null, cwd: "/pj", shell: "sh" },
          { id: "app", label: null, cwd: "/pj", shell: "sh", virtual: true },
        ],
      },
    ],
  } as SessionFileWorkspace;
  const model = new SessionModel();
  model.restoreWorkspace(data, false);
  expect(model.getPane("app")?.virtual).toBe(true);
  expect(model.getTab("t")!.displayPaneId).toBe("app");
  expect(model.getTab("t")!.views).toEqual([]);
});
