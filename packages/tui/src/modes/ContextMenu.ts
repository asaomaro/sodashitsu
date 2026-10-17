import { ScrollBar } from "./ScrollBar.js";
import { HEADER_ACTION_LABELS } from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import type { SessionModel } from "../model/SessionModel.js";
import { itemGroupIdOf } from "../model/sidebarTree.js";
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
  viewItems?: (id: string) => MenuItem[];
  conn?: import("../term/PaneRegistry.js").RequestPort;
}

/**
 * 右クリックのメニューの項目（web の `ContextMenu.vue` の `items` を写した）。pane・tab・workspace・グループ・「グループなし」・全体。
 */
export function menuItems(menu: ContextMenuState, deps: MenuDeps): MenuItem[] {
  const { model, actions } = deps;
  const target = menu.target;
  if(target.kind==="screens")return ([{id:"schedule",label:"予約"},{id:"history",label:"セッション履歴"},{id:"connections",label:"外部接続"+(deps.ui.pendingConnectionRequests?` (${deps.ui.pendingConnectionRequests})`:"")}] as const).map(item=>({label:item.label,run:()=>deps.ui.setScreen(item.id)}));
  if (target.kind === "view") return deps.viewItems?.(target.viewId) ?? [];
  if (target.kind === "agent-tools")
    return actions
      .agentActionsFor(target.paneId, true)
      .map((action) => ({
        label: HEADER_ACTION_LABELS[action] + (action === "usage" ? "（エージェント）" : ""),
        run: () => actions.agentPaneAction(target.paneId, action),
      }));
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

      ...actions.agentActionsFor(target.paneId, true)
        .filter((a) => a !== "fork")
        .map((action) => ({
          label: HEADER_ACTION_LABELS[action] + (action === "usage" ? "（エージェント）" : ""),
          run: () => actions.agentPaneAction(target.paneId, action),
        })),
      { label: "右へ分割", run: () => actions.splitPane(target.paneId, "right") },
      { label: "下へ分割", run: () => actions.splitPane(target.paneId, "down") },
      {
        label:
          model.tabs.get(pane?.tabId ?? "")?.zoomedPaneId === target.paneId
            ? "元のサイズに戻す"
            : "拡大表示",
        run: () => actions.zoomPane(target.paneId),
      },
      {
        label: pane?.rightClick === "pane" ? "herdr のメニューを使う" : "右クリックを pane に送る",
        run: () =>
          actions.setRightClickTarget(
            target.paneId,
            pane?.rightClick === "pane" ? "herdr" : "pane",
          ),
      },
      // エージェントが 1 件以上のサブエージェントを動かしているとき（20261004-subagent-display）。メニューを開くのは右クリックだけなので、これはマウス用の入口（キーボードは既定の prefix+shift+s）。
      ...((pane?.agent?.subagents?.count ?? 0) > 0
        ? [{ label: "サブエージェントの一覧", run: () => actions.showSubagentsOf(target.paneId) }]
        : []),
      ...(pane?.agent
        ? [
            ...(actions.agentActionsFor(target.paneId, true).includes("fork") ? [{ label: "エージェントを fork…", run: () => actions.openAgentFork(target.paneId) }] : []),
            { label: "Statuslineの設定…", run: () => deps.ui.openDialogWithContext({ kind: "statuslineSettings" }) },
            { label: "利用状況…", run: () => actions.showUsageOf(target.paneId) },
          ]
        : []),
      {
        label: "このペインにビューを追加…",
        run: () =>
          pane &&
          deps.ui.openDialogWithContext({
            kind: "workspaceView",
            tabId: pane.tabId,
            paneId: target.paneId,
          }),
      },
      {
        label: "表示ウィンドウ…",
        run: () => deps.ui.openDialogWithContext({ kind: "display", paneId: target.paneId }),
      },
      { label: "貼り付け", run: () => actions.pasteIntoPane(target.paneId) },
      { label: "閉じる", run: () => actions.closePaneById(target.paneId) },
    ];
  }
  if (target.kind === "tab") {
    const tab = model.tabs.get(target.tabId);
    return [
      ...(tab?.plugin?.terminalDisplay && deps.conn
        ? [
            {
              label: tab.perspective === "app" ? "端末画面へ" : "アプリ画面へ",
              run: () => {
                void deps
                  .conn!.request("tab.set_perspective", {
                    tabId: tab.id,
                    perspective: tab.perspective === "app" ? "terminal" : "app",
                  })
                  .catch(() => deps.ui.toast("画面を切り替えられません"));
              },
            },
          ]
        : []),
      {
        label: "ビューを追加…",
        run: () => deps.ui.openDialogWithContext({ kind: "workspaceView", tabId: target.tabId }),
      },
      ...(tab?.views ?? []).map((v) => ({
        label: `ビューを削除: ${v.viewId}`,
        run: () => {
          void deps.conn
            ?.request("tab.remove_view", { tabId: target.tabId, viewInstanceId: v.id })
            .catch(() => deps.ui.toast("ビューを削除できませんでした"));
        },
      })),
      { label: "名前の変更", run: () => actions.renameTabById(target.tabId) },
      { label: "閉じる", run: () => actions.closeTabById(target.tabId) },
    ];
  }
  if (target.kind === "workspace") {
    const ws = model.workspaces.get(target.workspaceId);
    const isGit = ws?.git != null;
    // 所属は項目で見る（worktree の子の行でも、操作は項目の全体に働く。web の `ContextMenu.vue` と同じ）。
    const currentGroupId = itemGroupIdOf(model, target.workspaceId);
    const inGroup = currentGroupId !== null;
    // 移し先に選べるグループがあるか（所属ありのときは今のグループを除く）。
    const hasOtherGroup =
      model.groups.size - (inGroup && model.groups.has(currentGroupId) ? 1 : 0) > 0;
    return [
      { label: "名前の変更", run: () => actions.renameWorkspaceById(target.workspaceId) },
      { label: "PJフォルダを設定…", run: () => actions.setProjectFolder(target.workspaceId) },
      { label: "閉じる", run: () => actions.closeWorkspaceById(target.workspaceId) },
      ...(isGit
        ? [
            { label: "新しい worktree", run: () => actions.newWorktree(target.workspaceId) },
            { label: "worktree を開く…", run: () => actions.openWorktree(target.workspaceId) },
          ]
        : []),
      // 所属なし: 追加・新規／所属あり: 移す・外す・新規（web と同じ並び）。
      ...(inGroup
        ? [
            ...(hasOtherGroup
              ? [
                  {
                    label: "別のグループへ移す…",
                    run: () => actions.openGroupPicker(target.workspaceId),
                  },
                ]
              : []),
            {
              label: "グループから外す",
              run: () => actions.removeWorkspaceFromGroup(target.workspaceId),
            },
          ]
        : hasOtherGroup
          ? [{ label: "グループへ追加…", run: () => actions.openGroupPicker(target.workspaceId) }]
          : []),
    ];
  }
  if (target.kind === "group") {
    return [
      { label: "名前の変更", run: () => actions.renameGroupById(target.groupId) },
      // 「上へ／下へ移動」は `item.move_by` が要る。`layout` の無い古いサーバには出さない。
      ...(model.hasServerLayout
        ? [
            { label: "上へ移動", run: () => actions.moveGroupBy(target.groupId, "previous") },
            { label: "下へ移動", run: () => actions.moveGroupBy(target.groupId, "next") },
          ]
        : []),
      { label: "グループを削除", run: () => actions.deleteGroupById(target.groupId) },
    ];
  }
  if (target.kind === "ungrouped") {
    // 「グループなし」の見出し：名前の変更・削除は無い。`layout` の無い古いサーバには出す項目が無い（そのときはメニュー自体を開かない）。
    return model.hasServerLayout
      ? [
          { label: "上へ移動", run: () => actions.moveUngroupedBy("previous") },
          { label: "下へ移動", run: () => actions.moveUngroupedBy("next") },
        ]
      : [];
  }
  if (target.kind === "new")
    return [
      { label: "workspace", run: () => actions.run({ type: "newWorkspace" }) },
      ...(deps.ui.screen === "base" && model.focusedPaneId
        ? [{ label: "pane", run: () => actions.run({ type: "split", dir: "right" }) }]
        : []),
      ...(model.workspaceId
        ? [{ label: "グループ…", run: () => actions.createGroupForWorkspace(model.workspaceId!) }]
        : []),
    ];
  target satisfies { kind: "global" };
  return [
    { label: "キー割り当て", run: () => actions.run({ type: "help" }) },
    { label: "移動", run: () => actions.run({ type: "goto" }) },
    {
      label: "プラグインパッケージ…",
      run: () => deps.ui.openDialogWithContext({ kind: "pluginPackages" }),
    },
    { label: "設定", run: () => actions.run({ type: "settings" }) },
    // 端末版だけ：未処理の知らせの一覧（design の「通知の一覧」。web は知らせのトーストが残るので一覧を持たない）。

    { label: "切り離し", run: () => actions.run({ type: "detach" }) },
  ];
}

/** 右クリックのメニュー（M3）。↑↓/j/k・Enter/Space・Esc。項目を選んだら閉じてから実行する（閉じた後に開く前の pane へ焦点が戻る）。 */
export class ContextMenu implements Overlay {
  private readonly scrollbar = new ScrollBar();
  handleScrollMouse(ev: OverlayMouse) {
    return this.scrollbar.handleMouse(ev);
  }
  cancelInteraction() {
    this.scrollbar.cancel();
  }
  private active = 0;
  private rect: Rect | null = null;
  private pressed = false;
  private scroll = 0;
  private visible = Number.MAX_SAFE_INTEGER;

  constructor(
    private readonly menu: ContextMenuState,
    private readonly deps: MenuDeps,
  ) {}

  private items(): MenuItem[] {
    return menuItems(this.menu, this.deps);
  }

  handleKey(k: KeyInput): void {
    this.scrollbar.cancel();
    const n = this.items().length;
    if (isEsc(k)) return this.cancel();
    if (isEnter(k) || k.key === " ") return this.activate(this.active);
    if (isDown(k) && n > 0) this.active = (this.active + 1) % n;
    else if (isUp(k) && n > 0) this.active = (this.active - 1 + n) % n;
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (this.handleScrollMouse(ev)) return true;
    if (!inside(this.rect, ev.x, ev.y)) return false;
    const index = ev.y - (this.rect!.y + 1);
    if (index >= this.visible) return true; // 枠の下の罫線
    const item = this.scroll + index;
    if (index >= 0 && item < this.items().length) {
      if (ev.action === "move") this.active = item;
      // 押して離したら実行する。開いた右クリックの離す事象（押したのはメニューの外）では実行しない。
      if (ev.action === "down" && ev.button === 0) {
        this.active = item;
        this.pressed = true;
      } else if (ev.action === "up" && this.pressed) {
        this.pressed = false;
        this.activate(item);
      }
    } else if (ev.action === "wheel") {
      const n = this.items().length;
      this.active = Math.max(0, Math.min(n - 1, this.active + (ev.button === 65 ? 1 : -1)));
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
    inner.w = Math.max(0, inner.w - 1);
    // 短い端末では見える分だけを出し、選んでいる項目が見えるようにずらす（見えない項目を選んで実行しない）。
    this.visible = Math.max(1, inner.h);
    if (this.active < this.scroll) this.scroll = this.active;
    if (this.active >= this.scroll + this.visible) this.scroll = this.active - this.visible + 1;
    items.slice(this.scroll, this.scroll + this.visible).forEach((item, i) => {
      const on = i + this.scroll === this.active;
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
    this.scrollbar.render(
      grid,
      { ...inner, w: inner.w + 1 },
      items.length,
      this.scroll,
      c,
      (offset) => {
        this.scroll = offset;
        this.active = Math.max(offset, Math.min(this.active, offset + this.visible - 1));
      },
    );
    return hiddenCursor();
  }
}
