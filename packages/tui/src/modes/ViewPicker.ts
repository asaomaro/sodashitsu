import {
  BUILTIN_TERMINAL_VIEWS,
  BUILTIN_WORKSPACE_KEY,
  viewSupportsTarget,
  type ExtensionViewDefinition,
  type TabViewInstance,
} from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isDown,
  isUp,
  isEnter,
  isEsc,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import type { Rect } from "../render/Screen.js";
interface Choice {
  extensionKey: string;
  def: ExtensionViewDefinition;
}
const labels: Record<TabViewInstance["placement"], string> = {
  left: "左パネル",
  right: "右パネル",
  top: "上パネル",
  bottom: "下パネル",
  float: "浮いた窓",
  "band-top": "上の帯",
  "band-bottom": "下の帯",
};
/** 情報対象と配置を分けて選ぶ。ペイン対象では標準のPJビューを出さない。 */
export class ViewPicker implements Overlay {
  private choices: Choice[] = [];
  private selected = 0;
  private placement = false;
  private busy = true;
  private error = "";
  private dead = false;
  private rect: Rect | null = null;
  private hits = new Map<number, number>();
  constructor(
    private tabId: string,
    private paneId: string | undefined,
    private model: SessionModel,
    private ui: UiState,
    private conn: RequestPort,
    private redraw: () => void,
    private added: (view: TabViewInstance) => void,
  ) {
    void this.load();
  }
  private target() {
    return this.paneId ? "pane" : ("tab" as const);
  }
  private async load() {
    const tab = this.model.tabs.get(this.tabId);
    if (!tab) return;
    this.choices = BUILTIN_TERMINAL_VIEWS.filter((d) => viewSupportsTarget(d, this.target())).map((def) => ({
      extensionKey: BUILTIN_WORKSPACE_KEY,
      def: { ...def, placements: [...def.placements], requiresProject: def.id !== "statusline" },
    }));
    try {
      const list = await this.conn.request("extension.list", {});
      if (!this.dead)
        for (const ext of list.extensions)
          if (
            ext.state === "running" &&
            (ext.scope === "user" || ext.workspaceIds?.includes(tab.workspaceId))
          )
            for (const def of ext.views ?? [])
              if (def.terminal && viewSupportsTarget(def, this.target()))
                this.choices.push({ extensionKey: ext.key, def });
    } catch {
      this.error = "プラグインの候補を取得できません";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  handleKey(k: KeyInput) {
    if (isEsc(k)) return this.cancel();
    if (this.busy) return;
    const n = this.placement
      ? (this.choices[this.selectedChoice()]?.def.placements.length ?? 0)
      : this.choices.length;
    if (isUp(k)) this.selected = Math.max(0, this.selected - 1);
    else if (isDown(k)) this.selected = Math.min(Math.max(0, n - 1), this.selected + 1);
    else if (isEnter(k) || k.key === " ") void this.choose();
  }
  private choiceIndex = 0;
  private selectedChoice() {
    return this.placement ? this.choiceIndex : this.selected;
  }
  private async choose() {
    const choice = this.choices[this.selectedChoice()];
    if (!choice) return;
    if (!this.placement) {
      const tab = this.model.tabs.get(this.tabId);
      if (
        choice.def.requiresProject !== false &&
        !this.model.workspaces.get(tab?.workspaceId ?? "")?.projectDir
      ) {
        this.error = "先にワークスペースのPJフォルダを設定してください";
        return;
      }
      this.choiceIndex = this.selected;
      this.selected = 0;
      this.placement = true;
      return;
    }
    this.busy = true;
    try {
      const view = await this.conn.request("tab.add_view", {
        tabId: this.tabId,
        extensionKey: choice.extensionKey,
        viewId: choice.def.id,
        target: this.target(),
        placement: choice.def.placements[this.selected]!,
        ...(this.paneId ? { paneId: this.paneId } : {}),
      });
      if (!this.dead) this.added(view);
    } catch (e) {
      this.error = e instanceof Error ? e.message : "追加できません";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  handleMouse(e: OverlayMouse) {
    if (!inside(this.rect, e.x, e.y)) return false;
    if (e.action === "down" && e.button === 0 && !this.busy && this.rect) {
      const i = this.hits.get(e.y);
      if (i !== undefined) {
        this.selected = i;
        void this.choose();
      }
    }
    return true;
  }
  private items() {
    return this.placement
      ? (this.choices[this.choiceIndex]?.def.placements ?? []).map((p) => labels[p])
      : this.choices.map((c) => c.def.title);
  }
  render({ grid, theme }: OverlayRenderContext) {
    const c = dialogColors(theme),
      r = centeredRect(
        grid,
        Math.min(64, grid.w - 2),
        Math.min(grid.h - 2, this.items().length + 5),
      );
    this.rect = r;
    const area = drawBox(
      grid,
      r,
      c,
      `情報の対象: ${this.paneId ? "このペイン" : "タブ全体"} · ${this.placement ? "配置" : "ビューを追加"}`,
    );
    grid.text(
      area.x,
      area.y,
      this.busy
        ? "読込中…"
        : this.error || (this.choices.length ? "" : "対応するビューがありません"),
      c.warn,
      c.bg,
      0,
      area.w,
    );
    const count = Math.max(0, area.h - 2),
      start = Math.max(0, this.selected - count + 1);
    this.hits.clear();
    this.items()
      .slice(start, start + count)
      .forEach((text, i) => {
        this.hits.set(area.y + 1 + i, start + i);
        grid.text(
          area.x,
          area.y + 1 + i,
          `${start + i === this.selected ? "▶" : " "} ${text}`,
          c.fg,
          start + i === this.selected ? c.active : c.bg,
          0,
          area.w,
        );
      });
    return hiddenCursor();
  }
  cancel() {
    this.ui.closeDialog();
  }
  dispose() {
    this.dead = true;
  }
}
