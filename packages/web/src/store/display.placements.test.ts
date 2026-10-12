import { createPinia, setActivePinia } from "pinia";
import { expect, it, vi } from "vitest";
import type { Tab, Pane, DisplayInfo, ExtensionListResult } from "@sodashitsu/protocol";
import { useSessionStore } from "./session.js";
import { useExtensionsStore } from "./extensions.js";
import { useDisplayStore } from "./display.js";
it("band-only views reject panel drops and persist allowed top/bottom moves through the server", async () => {
  setActivePinia(createPinia());
  const session = useSessionStore();
  session.panes.set("p", { id: "p", tabId: "t" } as Pane);
  session.tabs.set("t", {
    id: "t",
    workspaceId: "w",
    views: [
      {
        id: "12345678-1234-4123-8123-123456789012",
        viewId: "band",
        display: "view-band",
        paneId: "p",
        target: "tab",
        placement: "band-top",
        extensionKey: "e",
      },
    ],
  } as Tab);
  useExtensionsStore().setList({
    extensions: [
      {
        key: "e",
        views: [{ id: "band", targets: ["pane"], placements: ["band-top", "band-bottom"] }],
      },
    ],
  } as unknown as ExtensionListResult);
  const store = useDisplayStore(),
    mover = vi.fn().mockResolvedValue({});
  store.setViewMover(mover);
  const info = {
    id: "d",
    name: "view-band",
    paneId: "p",
    kind: "band",
    edge: "top",
    format: "text",
    title: "Band",
    size: 3,
    rev: 1,
    bytes: 0,
    updatedAt: "",
  } as DisplayInfo;
  expect(store.canPlace(info, "left")).toBe(false);
  expect(store.canPlace(info, "float")).toBe(false);
  store.setFaceDock(info, "left");
  expect(mover).not.toHaveBeenCalled();
  store.setFaceEdge(info, "bottom");
  await Promise.resolve();
  expect(mover).toHaveBeenCalledWith({
    tabId: "t",
    viewInstanceId: "12345678-1234-4123-8123-123456789012",
    placement: "band-bottom",
  });
});
it("reveals a registered band moved to float when its new panel info arrives after the RPC response", async () => {
  setActivePinia(createPinia());
  const session = useSessionStore();
  session.panes.set("p", { id: "p", tabId: "t" } as Pane);
  session.tabs.set("t", {
    id: "t",
    workspaceId: "w",
    views: [
      {
        id: "v",
        paneId: "p",
        display: "status",
        viewId: "statusline",
        extensionKey: "builtin:workspace",
        target: "tab",
        placement: "band-top",
      },
    ],
  } as Tab);
  const store = useDisplayStore();
  store.setViewMover(vi.fn().mockResolvedValue({}));
  const before = {
    id: "old",
    name: "status",
    paneId: "p",
    kind: "band",
    edge: "top",
    format: "text",
    size: 24,
    rev: 1,
    bytes: 0,
    updatedAt: "",
  } as DisplayInfo;
  store.upsert(before);
  store.setViewPlacement(before, "float");
  await Promise.resolve();
  store.remove("old");
  const after = { ...before, id: "new", kind: "panel", dock: "float", size: 240 } as DisplayInfo;
  store.upsert(after);
  expect(store.effectiveOf(after)).toMatchObject({ dock: "float", collapsed: false });
});
it("band height preferences persist within the supported range and ignore non-finite sizes", () => {
  setActivePinia(createPinia());
  const store = useDisplayStore(),
    info = {
      id: "band",
      name: "band",
      paneId: "p",
      kind: "band",
      edge: "top",
      size: 32,
    } as DisplayInfo;
  store.setBandHeight(info, 80);
  expect(store.bandHeightOf(info)).toBe(80);
  store.setBandHeight(info, Infinity);
  expect(store.bandHeightOf(info)).toBe(80);
  store.setBandHeight(info, 1);
  expect(store.bandHeightOf(info)).toBe(24);
  store.setBandHeight(info, 999);
  expect(store.bandHeightOf(info)).toBe(96);
});

it("a registered floating view opens initially but respects a user's later fold", () => {
  setActivePinia(createPinia());
  const session = useSessionStore();
  session.panes.set("p", { id: "p", tabId: "t" } as Pane);
  session.tabs.set("t", {
    id: "t",
    workspaceId: "w",
    views: [
      {
        id: "v",
        paneId: "p",
        display: "view-files",
        viewId: "files",
        extensionKey: "builtin:workspace",
        target: "tab",
        placement: "float",
      },
    ],
  } as Tab);
  const store = useDisplayStore();
  const info = {
    id: "d",
    paneId: "p",
    name: "view-files",
    kind: "panel",
    dock: "float",
    format: "text",
    title: "ファイルツリー",
    size: 280,
    rev: 1,
    bytes: 0,
    updatedAt: "",
  } as DisplayInfo;
  store.upsert(info);
  expect(store.effectiveOf(info)).toMatchObject({ dock: "float", collapsed: false });
  store.setFaceRect(info, { x: 20, y: 30, w: 500, h: 400 });
  expect(store.effectiveOf(info).collapsed).toBe(false);
  store.setFaceCollapsed(info, true);
  expect(store.effectiveOf(info).collapsed).toBe(true);
  store.upsert({ ...info, rev: 2 });
  expect(store.effectiveOf(info).collapsed).toBe(true);
});
