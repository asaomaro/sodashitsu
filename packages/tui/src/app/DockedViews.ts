import {
  BUILTIN_WORKSPACE_KEY,
  BUILTIN_VIEWS,
  type BuiltinViewId,
  type LayoutNode,
  type TabViewInstance,
  type Tab,
} from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { DisplayModel } from "../model/DisplayModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { LayoutResult, PaneBox, Divider } from "../layout/computeLayout.js";
import { Grid, type CursorState, type Rect } from "../render/Screen.js";
import { stringWidth } from "../render/width.js";
import type { ThemeColors } from "../render/color.js";
import { WorkspaceDialog } from "../modes/WorkspaceDialog.js";
import { DisplayDialog } from "../modes/DisplayDialog.js";
import { inside, type Overlay, type OverlayMouse } from "../modes/overlay.js";
import { viewHeaderButtons } from "../modes/viewHeader.js";
const idOf = (v: TabViewInstance) => "view:" + v.id;
/** ビューを端末の分割木に配置する。対象は情報の出どころ、placementは表示位置。 */
export function dockViewTree(layout: LayoutNode, views: TabViewInstance[]): LayoutNode {
  const wrap = (node: LayoutNode, v: TabViewInstance): LayoutNode => {
    const before = ["left", "top", "band-top"].includes(v.placement),
      vertical = ["top", "bottom", "band-top", "band-bottom"].includes(v.placement),
      band = v.placement.startsWith("band-");
    const leaf: LayoutNode = { type: "pane", paneId: idOf(v) };
    return {
      type: "split",
      id: "view-split:" + v.id,
      dir: vertical ? "down" : "right",
      ratio: before ? (band ? 0.15 : 0.35) : band ? 0.85 : 0.65,
      a: before ? leaf : node,
      b: before ? node : leaf,
    };
  };
  const insert = (node: LayoutNode, v: TabViewInstance): LayoutNode =>
    node.type === "pane"
      ? node.paneId === v.paneId
        ? wrap(node, v)
        : node
      : { ...node, a: insert(node.a, v), b: insert(node.b, v) };
  let result = layout;
  for (const v of views)
    if (v.viewId === "__app") result = { type: "pane", paneId: idOf(v) };
    else if (v.placement !== "float")
      result = v.target === "tab" ? wrap(result, v) : insert(result, v);
  return result;
}
/** Web専用ビューは端末で描画しない。アプリ用端末ビューはタブ全体を使う。 */
export function terminalViews(tab: Tab): TabViewInstance[] {
  const views = (tab.views ?? [])
    .filter((v) => v.extensionKey === BUILTIN_WORKSPACE_KEY || v.terminalDisplay)
    .map((v) => (v.terminalDisplay ? { ...v, display: v.terminalDisplay } : v));
  if (tab.perspective === "app" && tab.plugin?.terminalDisplay && tab.displayPaneId)
    views.unshift({
      id: "app-" + tab.id,
      viewId: "__app",
      extensionKey: tab.plugin.extensionKey,
      display: tab.plugin.terminalDisplay,
      paneId: tab.displayPaneId,
      target: "tab",
      placement: "right",
    });
  return views;
}
interface Entry {
  view: TabViewInstance;
  overlay?: Overlay;
  folder?: string | undefined;
}
export class DockedViews {
  private entries = new Map<string, Entry>();
  private boxes: PaneBox[] = [];
  private focused: string | null = null;
  private folded = new Set<string>();
  private ratios = new Map<string, number>();
  private area: Rect | null = null;
  private trayHits: { x: number; y: number; w: number; id: string }[] = [];
  private drag: {
    id: string;
    x: number;
    y: number;
    resize: boolean;
    allowed: readonly TabViewInstance["placement"][];
    zone: TabViewInstance["placement"] | null;
    active: boolean;
    ratio?: number | undefined;
    height?: number;
    divider?: Divider;
    pointer?: { x: number; y: number };
  } | null = null;
  private allowedCache = new Map<string, readonly TabViewInstance["placement"][]>();
  private pending = new Set<string>();
  isPending(id: string) {
    return this.pending.has(id);
  }
  view(id: string) {
    for (const tab of this.model.tabs.values()) {
      const view = terminalViews(tab).find((v) => v.id === id);
      if (view) return { view, tab };
    }
    return undefined;
  }
  private title(v: TabViewInstance) {
    return (
      BUILTIN_VIEWS.find((d) => d.id === v.viewId)?.title ??
      [...this.displays.infos.values()].find((d) => d.paneId === v.paneId && d.name === v.display)
        ?.title ??
      v.viewId
    );
  }
  private tray(views: TabViewInstance[]) {
    return views.filter(
      (v) =>
        this.folded.has(v.id) ||
        (v.placement === "float" &&
          (!("viewInstanceId" in (this.ui.dialogContext ?? {})) ||
            (this.ui.dialogContext as { viewInstanceId?: string }).viewInstanceId !== v.id)),
    );
  }
  async allowed(id: string): Promise<readonly TabViewInstance["placement"][]> {
    const found = this.view(id);
    if (!found) return [];
    if (found.view.extensionKey === BUILTIN_WORKSPACE_KEY)
      return BUILTIN_VIEWS.find((d) => d.id === found.view.viewId)?.placements ?? [];
    const list = await this.conn.request("extension.list", {});
    return (
      list.extensions
        .find((e) => e.key === found.view.extensionKey)
        ?.views?.find((d) => d.id === found.view.viewId)?.placements ?? []
    );
  }
  private canLeave(id: string) {
    return this.entries.get("view:" + id)?.overlay?.canLeave?.() !== false;
  }
  fold(id: string) {
    if (!this.canLeave(id)) return;
    if (!this.view(id)) return;
    this.folded.add(id);
    this.release();
  }
  open(id: string, forceFloat = false) {
    const found = this.view(id);
    if (!found) return;
    this.folded.delete(id);
    if (forceFloat || found.view.placement === "float") {
      const info = [...this.displays.infos.values()].find(
        (d) => d.paneId === found.view.paneId && d.name === found.view.display,
      );
      this.ui.openDialogWithContext(
        found.view.extensionKey === BUILTIN_WORKSPACE_KEY && found.view.viewId !== "statusline"
          ? {
              kind: "workspaceView",
              tabId: found.tab.id,
              viewId: found.view.viewId as BuiltinViewId,
              viewInstanceId: id,
            }
          : {
              kind: "display",
              paneId: found.view.paneId,
              ...(info ? { displayId: info.id } : {}),
              viewInstanceId: id,
            },
      );
    } else this.focus(id);
    this.redraw();
  }
  async close(id: string): Promise<boolean> {
    const found = this.view(id);
    if (!found || this.pending.has(id) || !this.canLeave(id)) return false;
    const focused = this.focused;
    this.pending.add(id);
    try {
      await this.conn.request("tab.remove_view", { tabId: found.tab.id, viewInstanceId: id });
      this.folded.delete(id);
      if (this.focused === focused) this.release();
      return true;
    } catch {
      this.ui.toast("ビューを閉じられませんでした");
      return false;
    } finally {
      this.pending.delete(id);
    }
  }
  async move(id: string, placement: TabViewInstance["placement"]) {
    const found = this.view(id);
    if (!found || !this.canLeave(id) || this.pending.has(id)) return;
    const tab = this.model.currentTab()?.id,
      focused = this.focused,
      dialog = this.ui.dialogContext;
    this.pending.add(id);
    try {
      if (!(await this.allowed(id)).includes(placement) || !this.canLeave(id)) return;
      await this.conn.request("tab.move_view", {
        tabId: found.tab.id,
        viewInstanceId: id,
        placement,
      });
      this.folded.delete(id);
      if (
        this.model.currentTab()?.id !== tab ||
        (this.focused !== focused && !(focused === "view:" + id && this.focused === null)) ||
        this.ui.dialogContext !== dialog
      )
        return;
      this.release();
      if (placement === "float") this.open(id, true);
      else if ((this.ui.dialogContext as { viewInstanceId?: string } | null)?.viewInstanceId === id)
        this.ui.closeDialog();
    } catch {
      this.ui.toast("この配置へ移動できません");
    } finally {
      this.pending.delete(id);
    }
  }
  async prepare(id: string) {
    try {
      this.allowedCache.set(id, await this.allowed(id));
    } catch {}
  }
  drawDropPreview(
    grid: Grid,
    theme: ThemeColors,
    id: string,
    x: number,
    y: number,
    allowed?: readonly TabViewInstance["placement"][],
  ) {
    const found = this.view(id);
    if (!found) return;
    const a =
      found.view.target === "pane"
        ? this.lastLayout?.panes.find((p) => p.paneId === found.view.paneId)?.frame
        : this.area;
    if (!a) return;
    const z = this.zone(
      id,
      x,
      y,
      allowed ??
        BUILTIN_VIEWS.find(
          (d) => d.id === found.view.viewId && found.view.extensionKey === BUILTIN_WORKSPACE_KEY,
        )?.placements ??
        this.allowedCache.get(id) ??
        [],
    );
    if (!z) {
      grid.text(
        a.x,
        a.y,
        "移動不可 · ここには置けません",
        theme.ui("--soda-accent"),
        theme.ground("--soda-bg"),
        0,
        a.w,
      );
      return;
    }
    const r = { ...a },
      horizontal = z === "left" || z === "right",
      band = z.startsWith("band-");
    if (z !== "float") {
      if (horizontal) r.w = Math.max(1, Math.floor(a.w * 0.35));
      else r.h = Math.max(1, Math.floor(a.h * (band ? 0.15 : 0.35)));
      if (z === "right") r.x = a.x + a.w - r.w;
      if (z === "bottom" || z === "band-bottom") r.y = a.y + a.h - r.h;
    } else {
      r.w = Math.max(1, Math.floor(a.w * 0.6));
      r.h = Math.max(1, Math.floor(a.h * 0.6));
      r.x += Math.floor((a.w - r.w) / 2);
      r.y += Math.floor((a.h - r.h) / 2);
    }
    for (let yy = Math.max(0, r.y); yy < Math.min(grid.h, r.y + r.h); yy++)
      for (let xx = Math.max(0, r.x); xx < Math.min(grid.w, r.x + r.w); xx++)
        grid.bg[yy * grid.w + xx] = theme.ui("--soda-accent");
    const labels = {
      left: "左パネル",
      right: "右パネル",
      top: "上パネル",
      bottom: "下パネル",
      float: "浮いた窓",
      "band-top": "上の帯",
      "band-bottom": "下の帯",
    };
    grid.text(
      r.x,
      r.y,
      `▶ ${labels[z]} · 離して確定`,
      theme.ground("--soda-bg"),
      theme.ui("--soda-accent"),
      0,
      r.w,
    );
  }
  height(id: string, delta: number) {
    const r = this.ratios.get(id) ?? 0.15;
    this.ratios.set(id, Math.max(0, Math.min(0.7, r + delta)));
    this.redraw();
  }
  menuItems(id: string) {
    if (id === "__more")
      return this.tray(this.model.currentTab() ? terminalViews(this.model.currentTab()!) : []).map(
        (v) => ({ label: this.title(v), run: () => this.open(v.id) }),
      );
    const found = this.view(id);
    if (!found) return [];
    return [
      {
        label: this.folded.has(id) ? "展開する" : "畳む",
        run: () => (this.folded.has(id) ? this.open(id) : this.fold(id)),
      },
      {
        label: "閉じる",
        run: () => {
          void this.close(id);
        },
      },
      ...(this.allowedCache.get(id) ?? []).map((p) => ({
        label: `配置: ${{ left: "左パネル", right: "右パネル", top: "上パネル", bottom: "下パネル", float: "浮いた窓", "band-top": "上の帯", "band-bottom": "下の帯" }[p]}`,
        run: () => {
          void this.move(id, p);
        },
      })),
      ...(found.view.placement.startsWith("band-")
        ? [
            { label: "帯を高くする", run: () => this.height(id, 0.05) },
            { label: "帯を低くする", run: () => this.height(id, -0.05) },
          ]
        : []),
    ];
  }
  async menu(id: string, x: number, y: number) {
    if (id === "__more") {
      this.ui.openContextMenu({ kind: "view", viewId: id }, { x, y });
      return;
    }
    try {
      const allowed = await this.allowed(id);
      if (!this.view(id)) return;
      this.allowedCache.set(id, allowed);
      this.ui.openContextMenu({ kind: "view", viewId: id }, { x, y });
    } catch {
      this.ui.toast("ビューのメニューを開けません");
    }
  }
  private zone(id: string, x: number, y: number, allowed: readonly TabViewInstance["placement"][]) {
    const found = this.view(id),
      a =
        found?.view.target === "pane"
          ? this.lastLayout?.panes.find((p) => p.paneId === found.view.paneId)?.frame
          : this.area;
    if (!a || !inside(a, x, y)) return null;
    const distances: [
      [TabViewInstance["placement"], number],
      [TabViewInstance["placement"], number],
      [TabViewInstance["placement"], number],
      [TabViewInstance["placement"], number],
    ] = [
      ["top", (y - a.y) / a.h],
      ["bottom", (a.y + a.h - 1 - y) / a.h],
      ["left", (x - a.x) / a.w],
      ["right", (a.x + a.w - 1 - x) / a.w],
    ];
    distances.sort((a, b) => a[1] - b[1]);
    let z: TabViewInstance["placement"] = "float";
    if (distances[0]![1] < 0.22) {
      z = distances[0]![0];
      if (
        (z === "top" || z === "bottom") &&
        allowed.includes(`band-${z}`) &&
        (distances[0]![1] < 0.08 || !allowed.includes(z))
      )
        z = `band-${z}`;
    }
    return allowed.includes(z) ? z : null;
  }
  async drop(id: string, x: number, y: number, canLeave?: () => boolean) {
    try {
      const allowed = await this.allowed(id),
        zone = this.zone(id, x, y, allowed);
      if (zone && canLeave?.() !== false) await this.move(id, zone);
    } catch {
      this.ui.toast("この配置へ移動できません");
    }
  }
  private lastLayout: LayoutResult | null = null;
  constructor(
    private model: SessionModel,
    private ui: UiState,
    private displays: DisplayModel,
    private conn: RequestPort,
    private redraw: () => void,
    private titlesVisible: () => boolean = () => true,
  ) {}
  private contentRect(r: Rect, v: TabViewInstance): Rect {
    if (!v.placement.startsWith("band-"))
      return { x: r.x, y: r.y + 1, w: r.w, h: Math.max(0, r.h - 1) };
    const buttons = viewHeaderButtons(r);
    const grip = Math.min(2, r.w);
    const room = Math.max(0, (buttons[0]?.x ?? r.x + r.w) - r.x - grip);
    const title = this.titlesVisible()
      ? Math.min(stringWidth(this.title(v)) + 1, Math.max(0, room - 8))
      : 0;
    return { x: r.x + grip + title, y: r.y, w: Math.max(0, room - title), h: r.h };
  }
  focus(id: string) {
    this.focused = "view:" + id;
    this.redraw();
  }
  private cancelDrag() {
    const d = this.drag;
    if (d?.resize) {
      if (d.ratio === undefined) this.ratios.delete(d.id);
      else this.ratios.set(d.id, d.ratio);
    }
    this.drag = null;
  }
  release() {
    this.focused = null;
    this.cancelDrag();
    this.redraw();
  }
  focusedId() {
    if (
      !(this.model.currentTab() ? terminalViews(this.model.currentTab()!) : []).some(
        (v) => idOf(v) === this.focused,
      )
    )
      this.focused = null;
    return this.focused;
  }
  tree(layout: LayoutNode, views: TabViewInstance[]) {
    const open = views.filter((v) => !this.folded.has(v.id));
    let tree = dockViewTree(layout, open);
    const resize = (n: LayoutNode): LayoutNode =>
      n.type === "pane"
        ? n
        : {
            ...n,
            ratio: this.ratios.has(n.id.replace("view-split:", ""))
              ? ["left", "top", "band-top"].includes(
                  views.find((v) => "view-split:" + v.id === n.id)?.placement ?? "",
                )
                ? this.ratios.get(n.id.replace("view-split:", ""))!
                : 1 - this.ratios.get(n.id.replace("view-split:", ""))!
              : n.ratio,
            a: resize(n.a),
            b: resize(n.b),
          };
    tree = resize(tree);

    return tree;
  }
  hasTray(views: TabViewInstance[]) {
    return this.tray(views).length > 0;
  }
  hasDocked(views: TabViewInstance[]) {
    return views.some((v) => v.placement !== "float" && !this.folded.has(v.id));
  }
  private sync() {
    const all = [...this.model.tabs.values()]
      .flatMap(terminalViews)
      .filter((v) => v.placement !== "float");
    const live = new Set(all.map(idOf));
    const ids = new Set([...this.model.tabs.values()].flatMap(terminalViews).map((v) => v.id));
    for (const id of this.folded) if (!ids.has(id)) this.folded.delete(id);
    if (this.drag && !ids.has(this.drag.id)) this.drag = null;
    for (const id of this.ratios.keys()) if (!ids.has(id)) this.ratios.delete(id);
    for (const id of this.allowedCache.keys()) if (!ids.has(id)) this.allowedCache.delete(id);
    for (const [id, e] of this.entries)
      if (!live.has(id)) {
        e.overlay?.dispose?.();
        this.entries.delete(id);
        if (this.focused === id) this.focused = null;
      }
    for (const view of all) {
      const tab =
        this.model.tabs.get(this.model.panes.get(view.paneId)?.tabId ?? "") ??
        [...this.model.tabs.values()].find((t) => t.views?.some((v) => v.id === view.id));
      const folder = this.model.workspaces.get(tab?.workspaceId ?? "")?.projectDir;
      const id = idOf(view);
      if (!this.entries.has(id)) this.entries.set(id, { view, folder });
      else {
        const entry = this.entries.get(id)!;
        if (
          entry.view.extensionKey !== BUILTIN_WORKSPACE_KEY &&
          (entry.view.paneId !== view.paneId || entry.view.display !== view.display)
        ) {
          entry.overlay?.dispose?.();
          delete entry.overlay;
        }
        entry.view = view;
      }
    }
  }
  private overlay(e: Entry): Overlay | undefined {
    if (e.overlay) return e.overlay;
    const tab = [...this.model.tabs.values()].find((t) =>
      terminalViews(t).some((v) => v.id === e.view.id),
    );
    if (!tab) return;
    const close = () => {
      if (this.focused === idOf(e.view)) this.release();
    };
    if (e.view.extensionKey === BUILTIN_WORKSPACE_KEY && e.view.viewId !== "statusline")
      e.overlay = new WorkspaceDialog(
        tab.id,
        undefined,
        this.model,
        this.ui,
        this.conn,
        this.redraw,
        e.view.viewId as BuiltinViewId,
        close,
      );
    else {
      const info = [...this.displays.infos.values()].find(
        (d) => d.paneId === e.view.paneId && d.name === e.view.display,
      );
      if (info)
        e.overlay = new DisplayDialog(
          e.view.paneId,
          info.id,
          this.displays,
          this.conn,
          this.ui,
          this.redraw,
          undefined,
          close,
        );
    }
    return e.overlay;
  }
  render(grid: Grid, layout: LayoutResult, theme: ThemeColors): CursorState | null {
    this.sync();
    this.area = layout.paneArea;
    this.lastLayout = layout;
    this.trayHits = [];
    const tray = this.hasTray(
      this.model.currentTab() ? terminalViews(this.model.currentTab()!) : [],
    )
      ? { frame: { ...layout.paneArea, y: layout.paneArea.y - 1, h: 1 } }
      : undefined;
    if (tray) {
      let x = tray.frame.x,
        count = 0;
      const views = this.tray(
          this.model.currentTab() ? terminalViews(this.model.currentTab()!) : [],
        ),
        overflow =
          views.reduce((n, v) => n + stringWidth(` ▸ ${this.title(v)} `), 0) > tray.frame.w;
      for (const v of views) {
        const text = ` ▸ ${this.title(v)} `,
          w = stringWidth(text);
        if (x + w > tray.frame.x + tray.frame.w - (overflow ? 8 : 0)) break;
        grid.text(x, tray.frame.y, text, theme.ui("--soda-fg"), theme.ground("--soda-bg"), 0, w);
        this.trayHits.push({ x, y: tray.frame.y, w, id: v.id });
        x += w;
        count++;
      }
      if (count < views.length) {
        const w = Math.min(8, tray.frame.x + tray.frame.w - x);
        grid.text(
          x,
          tray.frame.y,
          `… +${views.length - count}`,
          theme.ui("--soda-fg"),
          theme.ground("--soda-bg"),
          0,
          w,
        );
        this.trayHits.push({ x, y: tray.frame.y, w, id: "__more" });
      }
    }
    this.boxes = layout.panes.filter((b) => this.entries.has(b.paneId));
    let cursor: CursorState | null = null;
    if (this.focused && !this.boxes.some((b) => b.paneId === this.focused)) this.focused = null;
    for (const box of this.boxes) {
      const entry = this.entries.get(box.paneId)!,
        overlay = this.overlay(entry),
        r = box.frame;
      if (r.w < 1 || r.h < 1) continue;
      grid.fill(r, theme.ui("--soda-fg"), theme.ground("--soda-bg"));
      const content = this.contentRect(r, entry.view);
      const local = new Grid(content.w, content.h, theme.ground("--soda-bg"));
      const c =
        content.w > 0 && content.h > 0
          ? overlay?.render({ grid: local, theme, embedded: true })
          : null;
      if (!overlay)
        local.text(
          1,
          1,
          "ビューを待っています…",
          theme.ui("--soda-fg"),
          theme.ground("--soda-bg"),
          0,
          Math.max(0, r.w - 2),
        );
      for (let y = 0; y < Math.min(local.h, content.h); y++)
        for (let x = 0; x < local.w; x++) {
          const cell = local.cell(x, y);
          if (cell.width === 0) continue;
          grid.set(content.x + x, content.y + y, cell.ch, cell.width, cell.fg, cell.bg, cell.attrs);
        }
      grid.fill(
        { x: r.x, y: r.y, w: Math.max(0, content.y === r.y ? content.x - r.x : r.w), h: 1 },
        theme.ui("--soda-fg"),
        theme.ground("--soda-bg"),
      );
      const buttons = entry.view.viewId === "__app" ? [] : viewHeaderButtons(r);
      const resizeGrip = entry.view.viewId === "__app" ? 0 : Math.min(2, r.w);
      if (resizeGrip)
        grid.text(
          r.x,
          r.y,
          "⠿ ",
          theme.ui("--soda-accent"),
          theme.ground("--soda-bg"),
          0,
          Math.min(2, r.w),
        );
      grid.text(
        r.x + resizeGrip,
        r.y,
        this.titlesVisible() ? this.title(entry.view) : "",
        theme.ui("--soda-fg"),
        theme.ground("--soda-bg"),
        0,
        Math.max(
          0,
          (content.y === r.y ? content.x : (buttons[0]?.x ?? r.x + r.w)) - r.x - resizeGrip,
        ),
      );
      for (const button of buttons)
        grid.text(
          button.x,
          button.y,
          button.text,
          theme.ui("--soda-fg"),
          theme.ground("--soda-bg"),
          0,
          button.w,
        );
      if (
        this.focused === box.paneId &&
        c &&
        c.x >= 0 &&
        c.x < content.w &&
        c.y >= 0 &&
        c.y < content.h
      )
        cursor = { ...c, x: c.x + content.x, y: c.y + content.y };
    }
    if (this.drag?.active && !this.drag.resize)
      this.drawDropPreview(
        grid,
        theme,
        this.drag.id,
        this.drag.pointer?.x ?? this.drag.x,
        this.drag.pointer?.y ?? this.drag.y,
        this.drag.allowed,
      );
    return cursor;
  }
  key(k: KeyInput): boolean {
    if (this.drag) {
      if (k.key === "Escape") this.cancelDrag();
      this.redraw();
      return true;
    }
    const id = this.focusedId();
    if (!id) return false;
    const entry = this.entries.get(id);
    if (!entry) return true;
    if (!this.pending.has(entry.view.id)) this.overlay(entry)?.handleKey(k);
    this.redraw();
    return true;
  }
  paste(text: string): boolean {
    const id = this.focusedId();
    if (!id) return false;
    const entry = this.entries.get(id);
    if (!entry) return true;
    if (!this.pending.has(entry.view.id)) this.overlay(entry)?.handlePaste?.(text);
    this.redraw();
    return true;
  }
  mouse(e: OverlayMouse): boolean {
    if (this.drag) {
      const d = this.drag;
      if (e.action === "move" || e.action === "up") {
        d.pointer = { x: e.x, y: e.y };
        d.active ||= Math.abs(e.x - d.x) + Math.abs(e.y - d.y) >= 2;
        if (d.resize && d.active && d.divider) {
          const a = d.divider.area,
            v = this.view(d.id)?.view;
          const raw = d.divider.dir === "right" ? (e.x - a.x) / a.w : (e.y - a.y) / a.h;
          if (v)
            this.ratios.set(
              d.id,
              Math.max(
                v.placement.startsWith("band-") ? 0 : 0.05,
                Math.min(0.85, ["left", "top", "band-top"].includes(v.placement) ? raw : 1 - raw),
              ),
            );
        } else if (d.resize && d.active && this.area) {
          const v = this.view(d.id)?.view,
            box = this.boxes.find((b) => b.paneId === "view:" + d.id);
          if (v && box) {
            const cells =
              (d.height ?? box.frame.h) + (e.y - d.y) * (v.placement === "band-top" ? 1 : -1);
            const total =
              this.lastLayout?.dividers.find((x) => x.splitId === "view-split:" + d.id)?.area.h ??
              this.area.h;
            this.ratios.set(d.id, Math.max(0, Math.min(0.7, cells / total)));
          }
        } else d.zone = this.zone(d.id, e.x, e.y, d.allowed);
        if (e.action === "up") {
          this.drag = null;
          if (d.active && !d.resize && d.zone) void this.move(d.id, d.zone);
        }
        this.redraw();
      }
      return true;
    }
    if (e.action === "down" && e.button === 0) {
      const onViewHeader = this.boxes.some(
        (b) =>
          e.y === b.frame.y &&
          inside(b.frame, e.x, e.y) &&
          this.entries.get(b.paneId)?.view.viewId !== "__app",
      );
      const d = !onViewHeader
        ? this.lastLayout?.dividers.find(
            (d) =>
              d.splitId.startsWith("view-split:") &&
              (d.dir === "right"
                ? (e.x === d.x || e.x === d.x - 1) && e.y >= d.y && e.y < d.y + d.len
                : e.y === d.y && e.x >= d.x && e.x < d.x + d.len),
          )
        : undefined;
      if (d) {
        const id = d.splitId.slice("view-split:".length);
        if (this.pending.has(id)) return true;
        this.drag = {
          id,
          x: e.x,
          y: e.y,
          resize: true,
          allowed: [],
          zone: null,
          active: false,
          ratio: this.ratios.get(id),
          divider: d,
        };
        return true;
      }
    }
    const hit = this.trayHits.find((h) => e.y === h.y && e.x >= h.x && e.x < h.x + h.w);
    if (hit) {
      if (e.action === "down" && e.button === 0) {
        if (hit.id === "__more") void this.menu(hit.id, e.x, e.y);
        else this.open(hit.id);
      } else if (e.action === "down" && e.button === 2) void this.menu(hit.id, e.x, e.y);
      return true;
    }
    const box = this.boxes.find((b) => inside(b.frame, e.x, e.y));
    if (!box) {
      if (e.action === "down") this.release();
      return false;
    }
    const entry = this.entries.get(box.paneId);
    if (!entry || this.pending.has(entry.view.id)) return true;
    if (e.action === "down" && e.button === 2) {
      void this.menu(entry.view.id, e.x, e.y);
      return true;
    }
    if (e.action === "down" && e.button === 0) {
      this.focused = box.paneId;
      const r = box.frame;
      const button =
        e.y === r.y ? viewHeaderButtons(r).find((b) => e.x >= b.x && e.x < b.x + b.w) : undefined;
      if (button && entry.view.viewId !== "__app") {
        if (button.action === "close") void this.close(entry.view.id);
        else if (button.action === "fold") this.fold(entry.view.id);
        else void this.menu(entry.view.id, button.x, r.y + 1);
        return true;
      }
      if (
        entry.view.placement.startsWith("band-") &&
        ((e.y === r.y && e.x >= r.x + Math.min(2, r.w)) ||
          (entry.view.placement === "band-top" && r.h > 1 && e.y === r.y + r.h - 1))
      ) {
        this.drag = {
          id: entry.view.id,
          x: e.x,
          y: e.y,
          resize: true,
          allowed: [],
          zone: null,
          active: false,
          ratio: this.ratios.get(entry.view.id),
          height: r.h,
        };
        return true;
      }
      if (
        e.y === r.y &&
        entry.view.viewId !== "__app" &&
        (!entry.view.placement.startsWith("band-") || e.x < r.x + Math.min(2, r.w))
      ) {
        this.drag = {
          id: entry.view.id,
          x: e.x,
          y: e.y,
          resize: false,
          allowed: BUILTIN_VIEWS.find((d) => d.id === entry.view.viewId)?.placements ?? [],
          zone: null,
          active: false,
        };
        const drag = this.drag;
        void this.allowed(entry.view.id)
          .then((a) => {
            if (this.drag === drag) drag.allowed = a;
          })
          .catch(() => {});
        return true;
      }
    }
    const content = this.contentRect(box.frame, entry.view);
    if (inside(content, e.x, e.y))
      entry.overlay?.handleMouse?.({ ...e, x: e.x - content.x, y: e.y - content.y });
    this.redraw();
    return true;
  }
  dispose() {
    for (const e of this.entries.values()) e.overlay?.dispose?.();
    this.entries.clear();
    this.boxes = [];
    this.focused = null;
    this.folded.clear();
    this.ratios.clear();
    this.drag = null;
    this.trayHits = [];
    this.allowedCache.clear();
  }
}
