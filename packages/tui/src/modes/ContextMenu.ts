import type { KeyInput } from "@sodashitsu/client-core";
import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { ContextMenuState, UiState } from "../model/UiState.js";
import { ATTR } from "../render/color.js";
import type { CursorState, Rect } from "../render/Screen.js";
import { stringWidth } from "../render/width.js";
import {
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isDown,
  isEnter,
  isEsc,
  isUp,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";

export interface MenuItem {
  label: string;
  run: () => void;
}

export interface MenuDeps {
  ui: UiState;
  model: SessionModel;
  actions: TuiDispatcher;
}

/**
 * 右クリックのメニューの項目（web の `ContextMenu.vue` の `items` を写した）。pane・tab・workspace・手動グループ・全体。
 */
export function menuItems(menu: ContextMenuState, deps: MenuDeps): MenuItem[] {
  const { model, actions } = deps;
  const target = menu.target;
  if (target.kind === "pane") {
    const pane = model.panes.get(target.paneId);
    const focused = model.focusedPaneId;
    const swappable =
      focused !== null &&
      focused !== target.paneId &&
      pane !== undefined &&
      pane.tabId === model.panes.get(focused)?.tabId;
    return [
      { label: "名前の変更", run: () => actions.renamePaneById(target.paneId) },
      ...(pane?.label
        ? [{ label: "名前の消去", run: () => actions.clearPaneName(target.paneId) }]
        : []),
      ...(swappable
        ? [{ label: "焦点の pane と入れ替え", run: () => actions.swapWithFocused(target.paneId) }]
        : []),
      { label: "右へ分割", run: () => actions.splitPane(target.paneId, "right") },
      { label: "下へ分割", run: () => actions.splitPane(target.paneId, "down") },
      { label: "拡大表示", run: () => actions.zoomPane(target.paneId) },
      {
        label: pane?.rightClick === "pane" ? "herdr のメニューを使う" : "右クリックを pane に送る",
        run: () =>
          actions.setRightClickTarget(
            target.paneId,
            pane?.rightClick === "pane" ? "herdr" : "pane",
          ),
      },
      { label: "貼り付け", run: () => actions.pasteIntoPane(target.paneId) },
      { label: "閉じる", run: () => actions.closePaneById(target.paneId) },
    ];
  }
  if (target.kind === "tab") {
    const tab = model.tabs.get(target.tabId);
    return [
      { label: "新規", run: () => tab && actions.newTabInWorkspace(tab.workspaceId) },
      { label: "名前の変更", run: () => actions.renameTabById(target.tabId) },
      { label: "閉じる", run: () => actions.closeTabById(target.tabId) },
    ];
  }
  if (target.kind === "workspace") {
    const ws = model.workspaces.get(target.workspaceId);
    const isGit = ws?.git != null;
    const inGroup = ws?.groupId != null;
    return [
      { label: "名前の変更", run: () => actions.renameWorkspaceById(target.workspaceId) },
      { label: "閉じる", run: () => actions.closeWorkspaceById(target.workspaceId) },
      ...(isGit
        ? [
            { label: "新しい worktree", run: () => actions.newWorktree(target.workspaceId) },
            { label: "worktree を開く…", run: () => actions.openWorktree(target.workspaceId) },
          ]
        : []),
      {
        label: "新しいグループを作る…",
        run: () => actions.createGroupForWorkspace(target.workspaceId),
      },
      ...(inGroup
        ? [
            {
              label: "グループから外す",
              run: () => actions.removeWorkspaceFromGroup(target.workspaceId),
            },
          ]
        : model.groups.size > 0
          ? [{ label: "グループへ追加…", run: () => actions.openGroupPicker(target.workspaceId) }]
          : []),
    ];
  }
  if (target.kind === "group") {
    return [
      { label: "名前の変更", run: () => actions.renameGroupById(target.groupId) },
      { label: "グループを削除", run: () => actions.deleteGroupById(target.groupId) },
    ];
  }
  target satisfies { kind: "global" };
  return [
    { label: "キー割り当て", run: () => actions.run({ type: "help" }) },
    { label: "移動", run: () => actions.run({ type: "goto" }) },
    { label: "設定", run: () => actions.run({ type: "settings" }) },
    { label: "切り離し", run: () => actions.run({ type: "detach" }) },
  ];
}

/** 右クリックのメニュー（M3）。↑↓/j/k・Enter/Space・Esc。項目を選んだら閉じてから実行する（閉じた後に開く前の pane へ焦点が戻る）。 */
export class ContextMenu implements Overlay {
  private active = 0;
  private rect: Rect | null = null;
  private pressed = false;

  constructor(
    private readonly menu: ContextMenuState,
    private readonly deps: MenuDeps,
  ) {}

  private items(): MenuItem[] {
    return menuItems(this.menu, this.deps);
  }

  handleKey(k: KeyInput): void {
    const n = this.items().length;
    if (isEsc(k) || k.key === "q") return this.cancel();
    if (isEnter(k) || k.key === " ") return this.activate(this.active);
    if (isDown(k) && n > 0) this.active = (this.active + 1) % n;
    else if (isUp(k) && n > 0) this.active = (this.active - 1 + n) % n;
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    const index = ev.y - (this.rect!.y + 1);
    if (index >= 0 && index < this.items().length) {
      if (ev.action === "move") this.active = index;
      // 押して離したら実行する。開いた右クリックの離す事象（押したのはメニューの外）では実行しない。
      if (ev.action === "down" && ev.button === 0) {
        this.active = index;
        this.pressed = true;
      } else if (ev.action === "up" && this.pressed) {
        this.pressed = false;
        this.activate(index);
      }
    }
    return true;
  }

  cancel(): void {
    this.deps.ui.closeContextMenu();
  }

  private activate(index: number): void {
    const item = this.items()[index];
    if (!item) return;
    this.deps.ui.closeContextMenu();
    item.run();
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const items = this.items();
    const w = Math.min(grid.w, Math.max(...items.map((i) => stringWidth(i.label))) + 6);
    const h = Math.min(grid.h, items.length + 2);
    const x = Math.max(0, Math.min(this.menu.at.x, grid.w - w));
    const y = Math.max(0, Math.min(this.menu.at.y, grid.h - h));
    const r = { x, y, w, h };
    this.rect = r;
    const inner = drawBox(grid, r, c);
    items.slice(0, inner.h).forEach((item, i) => {
      const on = i === this.active;
      grid.fill({ x: r.x + 1, y: inner.y + i, w: r.w - 2, h: 1 }, c.fg, on ? c.active : c.bg);
      grid.text(
        inner.x,
        inner.y + i,
        item.label,
        c.fg,
        on ? c.active : c.bg,
        on ? ATTR.bold : 0,
        inner.w,
      );
    });
    return hiddenCursor();
  }
}
