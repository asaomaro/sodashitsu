import { afterEach, expect, it, vi } from "vitest";
import { BUILTIN_WORKSPACE_KEY, type TabViewInstance } from "@sodashitsu/protocol";
import { startedApp } from "../testing/appHarness.js";
import { snapshot, tab, pane, workspace, leaf } from "../testing/fixtures.js";
import type { LayoutResult } from "../layout/computeLayout.js";
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
it("restores docked file views beside the terminal, applies placement updates and routes panel input without PTY leakage", async () => {
  const view: TabViewInstance = {
    id: "files",
    extensionKey: BUILTIN_WORKSPACE_KEY,
    viewId: "files",
    target: "tab",
    placement: "left",
    paneId: "anchor",
    display: "files",
  };
  const t = tab("t1", "w1", leaf("p1"), { views: [view] });
  const h = await startedApp({
    cols: 120,
    snapshot: snapshot({
      workspaces: [workspace("w1", ["t1"], { projectDir: "/pj" })],
      tabs: [t],
      panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
    }),
    respond: {
      "workspace.tools": (p: { operation: string }) =>
        p.operation === "list"
          ? { entries: [{ name: "README.md", path: "README.md", directory: false, link: false }] }
          : { text: "hello\n", version: "a".repeat(64) },
    },
  });
  close = h.close;
  const layout = () => (h.app as unknown as { lastLayout: LayoutResult }).lastLayout;
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("README.md");
  });
  expect(h.app.ui.dialogContext).toBeNull();
  let panel = layout().panes.find((p) => p.paneId === "view:files")!,
    terminal = layout().panes.find((p) => p.paneId === "p1")!;
  expect(panel.frame.x).toBeLessThan(terminal.frame.x);
  expect(terminal.content.w).toBeLessThan(layout().paneArea.w);
  h.ws.event("tab.updated", { tab: { ...t, views: [{ ...view, placement: "right" }] } });
  h.app.renderNow();
  panel = layout().panes.find((p) => p.paneId === "view:files")!;
  terminal = layout().panes.find((p) => p.paneId === "p1")!;
  expect(panel.frame.x).toBeGreaterThan(terminal.frame.x);
  h.app.dockedViews.focus("files");
  h.io.type("\r");
  await vi.waitFor(() =>
    expect(
      h.ws
        .requests("workspace.tools")
        .some((r) => (r.params as { operation: string }).operation === "read"),
    ).toBe(true),
  );
  h.io.type("z");
  expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(0);
  h.io.type("\x1b");
  await vi.waitFor(() => expect(h.app.dockedViews.focusedId()).toBeNull());
  h.io.type("z");
  expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(1);
});
it("keeps unsaved dock edits across a transient disconnect and snapshot restore", async () => {
  const v: TabViewInstance = {
    id: "editor",
    extensionKey: BUILTIN_WORKSPACE_KEY,
    viewId: "file",
    target: "tab",
    placement: "right",
    paneId: "anchor",
    display: "editor",
  };
  const snap = snapshot({
    workspaces: [workspace("w1", ["t1"], { projectDir: "/pj" })],
    tabs: [tab("t1", "w1", leaf("p1"), { views: [v] })],
    panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
  });
  const h = await startedApp({
    cols: 120,
    snapshot: snap,
    respond: { "workspace.tools": { text: "hello\n", version: "a".repeat(64) } },
  });
  close = h.close;
  await vi.waitFor(() => expect(h.app.model.currentTab()?.views).toHaveLength(1));
  h.app.renderNow();
  await new Promise((r) => setTimeout(r, 0));
  h.app.dockedViews.focus("editor");
  h.io.type("pREADME.md\r");
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("hello");
  });
  h.io.type("eDRAFT");
  h.app.renderNow();
  expect(await h.screen()).toContain("DRAFT");
  h.ws.close(1006);
  h.app.model.applySnapshot(snap, "c2");
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("DRAFT");
  });
  expect(h.app.ui.dialogContext).toBeNull();
});
it("renders the native plugin display and replaces the document when its source identity changes", async () => {
  const v: TabViewInstance = {
    id: "native",
    extensionKey: "e",
    viewId: "note",
    display: "web",
    terminalDisplay: "native-a",
    terminal: { format: "markdown" },
    paneId: "anchor",
    target: "tab",
    placement: "right",
  };
  const t = tab("t1", "w1", leaf("p1"), { views: [v] });
  const contents: Record<string, string> = { a: "# Native first", b: "# Native second" };
  const infos = Object.entries(contents).map(([id, content]) => ({
    id,
    paneId: "anchor",
    name: "native-" + id,
    title: "Native",
    kind: "panel",
    format: "markdown",
    size: 320,
    rev: 1,
    bytes: Buffer.byteLength(content),
    updatedAt: "",
  }));
  const h = await startedApp({
    cols: 120,
    snapshot: snapshot({
      tabs: [t],
      panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
    }),
    respond: {
      "display.subscribe": { displays: infos },
      "display.get": (p: { id: string }) => ({
        id: p.id,
        rev: 1,
        format: "markdown",
        totalBytes: Buffer.byteLength(contents[p.id]!),
        offset: 0,
        base64: Buffer.from(contents[p.id]!).toString("base64"),
        eof: true,
      }),
    },
  });
  close = h.close;
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("Native first");
  });
  h.ws.event("tab.updated", { tab: { ...t, views: [{ ...v, terminalDisplay: "native-b" }] } });
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("Native second");
  });
  expect(await h.screen()).not.toContain("Native first");
});
it("schedule screen consumes input and sidebar terminal button returns to normal input", async () => {
  const h = await startedApp({ respond: { "schedule.list": { jobs: [], runs: [] } } });
  close = h.close;
  h.app.ui.setScreen("schedule");
  await vi.waitFor(() => expect(h.ws.requests("schedule.list")).toHaveLength(1));
  h.app.renderNow();
  expect(await h.screen()).toContain("予約");
  h.io.type("n");
  h.app.renderNow();
  expect(await h.screen()).toContain("登録・編集");
  h.io.type("input");
  expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(0);
  const b = (
    h.app as unknown as { sidebarHits: import("../render/chrome/sidebar.js").SidebarHit[] }
  ).sidebarHits.find((b) => b.kind === "control" && b.action === "base")!;
  h.io.type(
    `\x1b[<0;${(b as { x: number }).x + 1};${b.y + 1}M\x1b[<0;${(b as { x: number }).x + 1};${b.y + 1}m`,
  );
  await vi.waitFor(() => expect(h.app.ui.screen).toBe("base"));
});
it("opens the graph from the sidebar and draws it in the outer terminal without PTY input", async () => {
  const h = await startedApp({
    cols: 120,
    respond: {
      "graph.get": {
        rev: 1,
        paused: false,
        nodes: [{ key: "local:p1", x: 900, y: 900 }],
        links: [],
      },
    },
  });
  close = h.close;
  h.app.renderNow();
  const b = (
    h.app as unknown as { sidebarHits: import("../render/chrome/sidebar.js").SidebarHit[] }
  ).sidebarHits.find((b) => b.kind === "control" && b.action === "graph")!;
  h.io.type(
    `\x1b[<0;${(b as { x: number }).x + 1};${b.y + 1}M\x1b[<0;${(b as { x: number }).x + 1};${b.y + 1}m`,
  );
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("1ノード / 0線");
  });
  h.io.type("xyz");
  expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(0);
  h.io.type("\x1b");
  await vi.waitFor(() => expect(h.app.ui.screen).toBe("base"));
});
it("native headers fold into one row, reopen, show a view menu, drag and close without PTY leakage", async () => {
  const view: TabViewInstance = {
    id: "files",
    extensionKey: BUILTIN_WORKSPACE_KEY,
    viewId: "files",
    target: "tab",
    placement: "left",
    paneId: "anchor",
    display: "files",
  };
  const t = tab("t1", "w1", leaf("p1"), { views: [view] });
  const h = await startedApp({
    cols: 120,
    snapshot: snapshot({
      workspaces: [workspace("w1", ["t1"], { projectDir: "/pj" })],
      tabs: [t],
      panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
    }),
    respond: {
      "workspace.tools": () => ({
        entries: [{ name: "README.md", path: "README.md", directory: false, link: false }],
      }),
    },
  });
  close = h.close;
  const layout = () => (h.app as unknown as { lastLayout: LayoutResult }).lastLayout;
  const mouse = (b: number, x: number, y: number, up = false) =>
    h.io.type(`\x1b[<${b};${x + 1};${y + 1}${up ? "m" : "M"}`);
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("README.md");
  });
  let box = layout().panes.find((p) => p.paneId === "view:files")!.frame;
  mouse(0, box.x + box.w - 10, box.y);
  mouse(0, box.x + box.w - 10, box.y, true);
  await vi.waitFor(() =>
    expect(h.app.ui.contextMenu?.target).toEqual({ kind: "view", viewId: "files" }),
  );
  h.io.type("\x1b");
  await vi.waitFor(() => expect(h.app.ui.contextMenu).toBeNull());
  h.app.renderNow();
  await h.screen();
  const header = h.outer.term.buffer.active
    .getLine(box.y)!
    .translateToString(false, box.x, box.x + box.w);
  expect(header).not.toContain("[+]");
  expect(header).not.toContain("[│]");
  expect(header).not.toContain("view:files");
  expect(header).toContain("[-] [×]");
  mouse(0, box.x + box.w - 6, box.y);
  mouse(0, box.x + box.w - 6, box.y, true);
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("▸ ファイルツリー");
    expect(layout().panes.some((p) => p.paneId === "view:files")).toBe(false);
  });
  expect(h.ws.requests("tab.remove_view")).toHaveLength(0);
  mouse(0, layout().paneArea.x + 3, layout().paneArea.y - 1);
  mouse(0, layout().paneArea.x + 3, layout().paneArea.y - 1, true);
  await vi.waitFor(() => {
    h.app.renderNow();
    expect(layout().panes.some((p) => p.paneId === "view:files")).toBe(true);
  });
  box = layout().panes.find((p) => p.paneId === "view:files")!.frame;
  mouse(2, box.x + 2, box.y + 2);
  await vi.waitFor(() =>
    expect(h.app.ui.contextMenu?.target).toEqual({ kind: "view", viewId: "files" }),
  );
  expect(await h.screen()).toContain("配置: 上の帯");
  h.io.type("\x1b");
  await vi.waitFor(() => expect(h.app.ui.contextMenu).toBeNull());
  h.app.renderNow();
  box = layout().panes.find((p) => p.paneId === "view:files")!.frame;
  mouse(0, box.x + 2, box.y);
  const area = layout().paneArea;
  mouse(32, area.x + area.w - 1, area.y + Math.floor(area.h / 2));
  h.app.renderNow();
  expect(await h.screen()).toContain("右パネル · 離して確定");
  const previewY = area.y + Math.floor(area.h / 2);
  expect(h.outer.cellBg(area.x + area.w - 3, previewY)).not.toBe(
    h.outer.cellBg(area.x + 2, previewY),
  );
  mouse(0, area.x + area.w - 1, area.y + Math.floor(area.h / 2), true);
  await vi.waitFor(() =>
    expect(h.ws.requests("tab.move_view").at(-1)?.params).toMatchObject({
      viewInstanceId: "files",
      placement: "right",
    }),
  );
  h.ws.event("tab.updated", { tab: { ...t, views: [{ ...view, placement: "right" }] } });
  h.app.renderNow();
  box = layout().panes.find((p) => p.paneId === "view:files")!.frame;
  mouse(0, box.x + box.w - 2, box.y);
  mouse(0, box.x + box.w - 2, box.y, true);
  await vi.waitFor(() =>
    expect(h.ws.requests("tab.remove_view").at(-1)?.params).toMatchObject({
      tabId: "t1",
      viewInstanceId: "files",
    }),
  );
  expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(0);
});
it("bottom band grows from its upper boundary and Escape restores its height", async () => {
  const v: TabViewInstance = {
    id: "band",
    extensionKey: BUILTIN_WORKSPACE_KEY,
    viewId: "statusline",
    target: "tab",
    placement: "band-bottom",
    paneId: "anchor",
    display: "band",
  };
  const h = await startedApp({
    cols: 120,
    rows: 50,
    snapshot: snapshot({
      tabs: [tab("t1", "w1", leaf("p1"), { views: [v] })],
      panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
    }),
  });
  close = h.close;
  const box = () => {
    h.app.renderNow();
    return (h.app as unknown as { lastLayout: LayoutResult }).lastLayout.panes.find(
      (p) => p.paneId === "view:band",
    )!.frame;
  };
  await vi.waitFor(() => expect(box()).toBeDefined());
  const before = { ...box() };
  const m = (action: "down" | "move" | "up", y: number, x = before.x + 3) =>
    h.app.dockedViews.mouse({ action, button: action === "move" ? 32 : 0, x, y });
  m("down", before.y);
  m("move", before.y - 3);
  expect(box().h).toBeGreaterThan(before.h);
  m("up", before.y - 3);
  expect(box().h).toBeGreaterThan(before.h);
  const grown = { ...box() };
  m("down", grown.y);
  m("move", grown.y - 3);
  h.io.type("\x1b");
  await vi.waitFor(() => expect(box().h).toBe(grown.h));
  m("down", grown.y);
  m("move", 49);
  expect(box().h).toBe(1);
  expect(box().y).toBe(49);
  m("up", 49);
  expect(box().h).toBe(1);
  h.ws.event("prefs.changed", { prefs: { viewTitleVisible: false }, rev: 1 });
  m("down", 49, before.x + 25);
  m("move", 46, before.x + 25);
  expect(box().h).toBeGreaterThan(1);
  m("up", 46, before.x + 25);
  expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(0);
});
it.each(["left", "right"] as const)(
  "%s view visible borders resize live and Escape restores them",
  async (placement) => {
    const v: TabViewInstance = {
      id: "files",
      extensionKey: BUILTIN_WORKSPACE_KEY,
      viewId: "files",
      target: "tab",
      placement,
      paneId: "anchor",
      display: "files",
    };
    const h = await startedApp({
      cols: 120,
      snapshot: snapshot({
        tabs: [tab("t1", "w1", leaf("p1"), { views: [v] })],
        panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
      }),
      respond: { "workspace.tools": { entries: [] } },
    });
    close = h.close;
    const layout = () => {
      h.app.renderNow();
      return (h.app as unknown as { lastLayout: LayoutResult }).lastLayout;
    };
    await vi.waitFor(() =>
      expect(layout().dividers.some((d) => d.splitId === "view-split:files")).toBe(true),
    );
    const before = layout(),
      divider = before.dividers.find((d) => d.splitId === "view-split:files")!;
    const oldWidth = before.panes.find((p) => p.paneId === "view:files")!.frame.w;
    const x = divider.x - (placement === "right" ? 1 : 0),
      dx = placement === "right" ? -10 : 10;
    h.io.type(`\x1b[<0;${x + 1};${divider.y + 3}M`);
    h.io.type(`\x1b[<32;${x + dx + 1};${divider.y + 3}M`);
    expect(layout().panes.find((p) => p.paneId === "view:files")!.frame.w).toBeGreaterThan(
      oldWidth,
    );
    expect(layout().panes.find((p) => p.paneId === "p1")!.content.w).toBeLessThan(
      before.panes.find((p) => p.paneId === "p1")!.content.w,
    );
    h.io.type("\x1b");
    await vi.waitFor(() =>
      expect(layout().panes.find((p) => p.paneId === "view:files")!.frame.w).toBe(oldWidth),
    );
    expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(0);
  },
);
it.each(["band-bottom", "band-top"] as const)(
  "%s headers fold, move and close even when sharing a resize boundary",
  async (placement) => {
    const v: TabViewInstance = {
      id: "band",
      extensionKey: BUILTIN_WORKSPACE_KEY,
      viewId: "statusline",
      target: "tab",
      placement,
      paneId: "anchor",
      display: "status",
    };
    const t = tab("t1", "w1", leaf("p1"), { views: [v] });
    const h = await startedApp({
      cols: 120,
      rows: 20,
      snapshot: snapshot({
        tabs: [t],
        panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
      }),
      respond: { "tab.remove_view": {}, "tab.move_view": {} },
    });
    close = h.close;
    const layout = () => {
      h.app.renderNow();
      return (h.app as unknown as { lastLayout: LayoutResult }).lastLayout;
    };
    const box = () => layout().panes.find((p) => p.paneId === "view:band")!.frame;
    const mouse = (b: number, x: number, y: number, up = false) =>
      h.io.type(`\x1b[<${b};${x + 1};${y + 1}${up ? "m" : "M"}`);
    await vi.waitFor(() => expect(box()).toBeDefined());
    const before = { ...box() };
    await h.screen();
    expect(
      h.outer.term.buffer.active
        .getLine(before.y)!
        .translateToString(false, before.x + before.w - 7, before.x + before.w),
    ).toBe("[-] [×]");
    mouse(0, before.x + before.w - 6, before.y);
    mouse(0, before.x + before.w - 6, before.y, true);
    await vi.waitFor(() =>
      expect(layout().panes.some((p) => p.paneId === "view:band")).toBe(false),
    );
    expect(await h.screen()).toContain("▸ Statusline");
    const a = layout().paneArea;
    mouse(0, a.x + 3, a.y - 1);
    mouse(0, a.x + 3, a.y - 1, true);
    await vi.waitFor(() => expect(layout().panes.some((p) => p.paneId === "view:band")).toBe(true));
    h.ws.event("prefs.changed", { prefs: { viewTitleVisible: false }, rev: 1 });
    await vi.waitFor(async () => expect(await h.screen()).toContain("⠿"));
    const header = { ...box() },
      area = layout().paneArea,
      targetY = placement === "band-top" ? area.y + area.h - 1 : area.y;
    mouse(0, header.x, header.y);
    mouse(32, area.x + Math.floor(area.w / 2), targetY);
    h.app.renderNow();
    expect(await h.screen()).toContain(
      placement === "band-top" ? "下の帯 · 離して確定" : "上の帯 · 離して確定",
    );
    expect(box().h).toBe(header.h);
    mouse(0, area.x + Math.floor(area.w / 2), targetY, true);
    await vi.waitFor(() =>
      expect(h.ws.requests("tab.move_view").at(-1)?.params).toMatchObject({
        viewInstanceId: "band",
        placement: placement === "band-top" ? "band-bottom" : "band-top",
      }),
    );
    const final = { ...box() };
    mouse(0, final.x + final.w - 2, final.y);
    mouse(0, final.x + final.w - 2, final.y, true);
    await vi.waitFor(() =>
      expect(h.ws.requests("tab.remove_view").at(-1)?.params).toMatchObject({
        viewInstanceId: "band",
      }),
    );
    expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(0);
  },
);
it("renders band content on the first row and hides its name through shared settings", async () => {
  const v: TabViewInstance = {
    id: "status",
    extensionKey: BUILTIN_WORKSPACE_KEY,
    viewId: "statusline",
    target: "tab",
    placement: "band-bottom",
    paneId: "anchor",
    display: "status",
  };
  const text = '<div data-soda-statusline><span data-soda-color="good">FIRSTROW</span></div>';
  const info = {
    id: "d",
    paneId: "anchor",
    name: "status",
    title: "Statusline",
    kind: "band",
    format: "html",
    size: 24,
    rev: 1,
    bytes: Buffer.byteLength(text),
    updatedAt: "",
    source: { type: "builtin", id: "workspace", scope: "user" },
  };
  const h = await startedApp({
    cols: 120,
    rows: 20,
    snapshot: snapshot({
      tabs: [tab("t1", "w1", leaf("p1"), { views: [v] })],
      panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
    }),
    respond: {
      "display.subscribe": { displays: [info] },
      "display.get": {
        id: "d",
        rev: 1,
        format: "html",
        totalBytes: Buffer.byteLength(text),
        offset: 0,
        base64: Buffer.from(text).toString("base64"),
        eof: true,
      },
    },
  });
  close = h.close;
  const row = async () => {
    h.app.renderNow();
    const r = (h.app as unknown as { lastLayout: LayoutResult }).lastLayout.panes.find(
      (p) => p.paneId === "view:status",
    )!.frame;
    return (await h.screen()).split("\n")[r.y]!;
  };
  await vi.waitFor(async () => expect(await row()).toContain("FIRSTROW"));
  expect(await row()).toContain("Statusline");
  expect(await row()).toContain("⠿");
  h.ws.event("prefs.changed", { prefs: { viewTitleVisible: false }, rev: 1 });
  await vi.waitFor(async () => expect(await row()).not.toContain("Statusline"));
  expect(await row()).toContain("FIRSTROW");
  expect(await row()).toContain("⠿");
  expect(await row()).not.toContain("↕");
  expect(await row()).toContain("[⋮]");
});
