import type { Action } from "./actions.js";
import { RESIZE_STEP } from "./ResizeMode.js";

/**
 * 操作のカタログ（20260921-keybinding-customization。design「操作のカタログ」）。**利用者に見せる単位は「操作」**——名前は herdr の `[keys]` の項目名にそろえる
 * （`split_vertical`・`focus_pane_left`・`switch_tab`…。将来の設定ファイルとの相性。D1）。順序が表示（節「キー」・キー一覧）と衝突解決の順。
 *
 * 既定の割り当ては herdr の既定（`src/config/model.rs` の `KeysConfig`）と、本製品のこれまでの `DEFAULT_KEYMAP` に合わせる（20260918-web-terminal-multiplexer の decisions D56 で
 * herdr のソースと突き合わせて確定したもの）。文字列の書式は `chord.ts` の `parseBinding`。
 */
export type ActionGroup = "全体" | "workspace / tab" | "pane";

interface ActionDefBase {
  id: string;
  /** 画面に出す名前（キー一覧・節「キー」）。 */
  label: string;
  group: ActionGroup;
  /** 既定の割り当て（`prefix+v`・`prefix+shift+h`・`prefix+1..9`）。 */
  defaults: readonly string[];
  /** キー一覧に出さない（herdr のヘルプにも無い。編集は節「キー」でできる。20260918-web-terminal-multiplexer の decisions D76）。 */
  helpHidden?: true;
}

/**
 * 操作の定義。**範囲の操作（`indexed`。`switch_tab`・`focus_agent`）は `action` が数字から作る関数**で、それ以外は `Action` そのもの——判別共用体にして、
 * 「範囲の操作か」の判定（`indexed`）と `action` の形が食い違う定義を型で弾く。
 */
export type ActionDef = ActionDefBase &
  ({ indexed?: undefined; action: Action } | { indexed: true; action: (index: number) => Action });

/** 型を絞るための入れ物。`ActionId` はこの一覧の `id` から導く（一覧に無い名前を型で弾く）。 */
export const ACTIONS = [
  // 全体
  {
    id: "help",
    label: "キー一覧",
    group: "全体",
    defaults: ["prefix+?"],
    action: { type: "help" },
  },
  {
    id: "detach",
    label: "このブラウザを切り離す",
    group: "全体",
    defaults: ["prefix+q"],
    action: { type: "detach" },
  },
  {
    id: "settings",
    label: "設定",
    group: "全体",
    defaults: ["prefix+s"],
    action: { type: "settings" },
  },
  {
    id: "open_notification_target",
    label: "次の知らせへ移る",
    group: "全体",
    defaults: ["prefix+o"],
    action: { type: "nextNotification" },
  },
  {
    id: "reload_config",
    label: "設定を読み直す",
    group: "全体",
    // herdr の reload_config の既定と同じ chord。20260922-appearance-settings-rest まで
    // `NOT_YET_BINDINGS`（keymap.ts）の案内だった同じキーをそのまま引き継ぐ。
    defaults: ["prefix+shift+r"],
    action: { type: "reloadConfig" },
  },
  // 20260927-agent-graph（design D-7）。herdr の操作ではない（エージェントの連携のグラフ画面。本製品の追加）。既定の prefix+a は herdr・本製品のどちらの既定でも空いている。
  // 端末版では開けず「ブラウザで開けます」と知らせる（decisions D1-8。操作表は共有のまま）。
  {
    id: "open_graph",
    label: "連携（グラフ）を開く",
    group: "全体",
    defaults: ["prefix+a"],
    action: { type: "openGraph" },
  },
  // 20260927-cli-mode（design D-7）。herdr の操作ではない（端末版・画面からサーバを止める口として本製品が足した）。押し間違えると全ての pane が止まるので既定は無し・確認つき。
  {
    id: "stop_server",
    label: "サーバを止める",
    group: "全体",
    defaults: [],
    action: { type: "stopServer" },
  },
  // workspace / tab
  {
    id: "workspace_picker",
    label: "workspace の一覧へ（navigate モード）",
    group: "workspace / tab",
    defaults: ["prefix+w"],
    action: { type: "enterMode", mode: "navigate" },
  },
  {
    id: "goto",
    label: "goto（workspace・tab・pane から探す）",
    group: "workspace / tab",
    defaults: ["prefix+g"],
    action: { type: "goto" },
  },
  {
    id: "new_workspace",
    label: "新規 workspace",
    group: "workspace / tab",
    defaults: ["prefix+shift+n"],
    action: { type: "newWorkspace" },
  },
  {
    id: "rename_workspace",
    label: "workspace の名前を変更",
    group: "workspace / tab",
    defaults: ["prefix+shift+w"],
    action: { type: "renameWorkspace" },
  },
  {
    id: "close_workspace",
    label: "workspace を閉じる",
    group: "workspace / tab",
    defaults: ["prefix+shift+d"],
    action: { type: "closeWorkspace" },
  },
  // herdr の `new_worktree` の既定も prefix+shift+g（20260920-git-worktree-actions）。
  {
    id: "new_worktree",
    label: "新しい worktree",
    group: "workspace / tab",
    defaults: ["prefix+shift+g"],
    action: { type: "newWorktree" },
  },
  {
    id: "new_tab",
    label: "新規 tab",
    group: "workspace / tab",
    defaults: ["prefix+c"],
    action: { type: "newTab" },
  },
  {
    id: "next_tab",
    label: "次の tab",
    group: "workspace / tab",
    defaults: ["prefix+n"],
    action: { type: "tabDelta", delta: 1 },
  },
  {
    id: "previous_tab",
    label: "前の tab",
    group: "workspace / tab",
    defaults: ["prefix+p"],
    action: { type: "tabDelta", delta: -1 },
  },
  {
    id: "switch_tab",
    label: "tab を切り替え（1〜9）",
    group: "workspace / tab",
    defaults: ["prefix+1..9"],
    indexed: true,
    action: (index: number): Action => ({ type: "tabIndex", index }),
  },
  {
    id: "rename_tab",
    label: "tab の名前を変更",
    group: "workspace / tab",
    defaults: ["prefix+shift+t"],
    action: { type: "renameTab" },
  },
  {
    id: "close_tab",
    label: "tab を閉じる",
    group: "workspace / tab",
    defaults: ["prefix+shift+x"],
    action: { type: "closeTab" },
  },
  // 20260923-missing-keybinding-actions（herdr にあって本製品に操作自体が無かったもの。既定は herdr と
  // 同じく全て「割り当てなし」。research F1）。
  {
    id: "previous_workspace",
    label: "前の workspace",
    group: "workspace / tab",
    defaults: [],
    action: { type: "workspaceDelta", delta: -1 },
  },
  {
    id: "next_workspace",
    label: "次の workspace",
    group: "workspace / tab",
    defaults: [],
    action: { type: "workspaceDelta", delta: 1 },
  },
  {
    id: "move_tab_previous",
    label: "tab を前へ動かす",
    group: "workspace / tab",
    defaults: [],
    action: { type: "moveTab", direction: "previous" },
  },
  {
    id: "move_tab_next",
    label: "tab を後ろへ動かす",
    group: "workspace / tab",
    defaults: [],
    action: { type: "moveTab", direction: "next" },
  },
  // 20260923-workspace-grouping。`move_tab_previous`/`move_tab_next` と同じ「既定キー無し」の流儀。
  {
    id: "move_workspace_previous",
    label: "workspace を前へ動かす",
    group: "workspace / tab",
    defaults: [],
    action: { type: "moveWorkspace", direction: "previous" },
  },
  {
    id: "move_workspace_next",
    label: "workspace を後ろへ動かす",
    group: "workspace / tab",
    defaults: [],
    action: { type: "moveWorkspace", direction: "next" },
  },
  {
    id: "previous_agent",
    label: "前の agent へフォーカス",
    group: "workspace / tab",
    defaults: [],
    action: { type: "agentDelta", delta: -1 },
  },
  {
    id: "next_agent",
    label: "次の agent へフォーカス",
    group: "workspace / tab",
    defaults: [],
    action: { type: "agentDelta", delta: 1 },
  },
  {
    id: "focus_agent",
    label: "agent へフォーカス（1〜9）",
    group: "workspace / tab",
    defaults: [],
    indexed: true,
    action: (index: number): Action => ({ type: "focusAgentIndex", index: index - 1 }),
  },
  // 20260927-cli-mode（herdr にあって Web に無かった操作。design D-7・decisions D4）。既定は herdr と同じく全て「割り当てなし」。
  {
    id: "switch_workspace",
    label: "workspace を切り替え（1〜9）",
    group: "workspace / tab",
    defaults: [],
    indexed: true,
    action: (index: number): Action => ({ type: "workspaceIndex", index }),
  },
  {
    id: "open_worktree",
    label: "worktree を開く",
    group: "workspace / tab",
    defaults: [],
    action: { type: "openWorktree" },
  },
  {
    id: "remove_worktree",
    label: "この worktree を削除",
    group: "workspace / tab",
    defaults: [],
    action: { type: "removeWorktree" },
  },
  // pane
  {
    id: "split_vertical",
    label: "右へ分割",
    group: "pane",
    defaults: ["prefix+v"],
    action: { type: "split", dir: "right" },
  },
  {
    id: "split_horizontal",
    label: "下へ分割",
    group: "pane",
    defaults: ["prefix+-"],
    action: { type: "split", dir: "down" },
  },
  {
    id: "focus_pane_left",
    label: "左の pane へフォーカス",
    group: "pane",
    defaults: ["prefix+h"],
    action: { type: "focusDir", dir: "left" },
  },
  {
    id: "focus_pane_down",
    label: "下の pane へフォーカス",
    group: "pane",
    defaults: ["prefix+j"],
    action: { type: "focusDir", dir: "down" },
  },
  {
    id: "focus_pane_up",
    label: "上の pane へフォーカス",
    group: "pane",
    defaults: ["prefix+k"],
    action: { type: "focusDir", dir: "up" },
  },
  {
    id: "focus_pane_right",
    label: "右の pane へフォーカス",
    group: "pane",
    defaults: ["prefix+l"],
    action: { type: "focusDir", dir: "right" },
  },
  {
    id: "swap_pane_left",
    label: "pane を左と入れ替え",
    group: "pane",
    defaults: ["prefix+shift+h"],
    helpHidden: true,
    action: { type: "swap", dir: "left" },
  },
  {
    id: "swap_pane_down",
    label: "pane を下と入れ替え",
    group: "pane",
    defaults: ["prefix+shift+j"],
    helpHidden: true,
    action: { type: "swap", dir: "down" },
  },
  {
    id: "swap_pane_up",
    label: "pane を上と入れ替え",
    group: "pane",
    defaults: ["prefix+shift+k"],
    helpHidden: true,
    action: { type: "swap", dir: "up" },
  },
  {
    id: "swap_pane_right",
    label: "pane を右と入れ替え",
    group: "pane",
    defaults: ["prefix+shift+l"],
    helpHidden: true,
    action: { type: "swap", dir: "right" },
  },
  {
    id: "cycle_pane_next",
    label: "次の pane へ巡回",
    group: "pane",
    defaults: ["prefix+tab"],
    action: { type: "cyclePane", delta: 1 },
  },
  {
    id: "cycle_pane_previous",
    label: "前の pane へ巡回",
    group: "pane",
    defaults: ["prefix+shift+tab"],
    action: { type: "cyclePane", delta: -1 },
  },
  {
    id: "close_pane",
    label: "pane を閉じる",
    group: "pane",
    defaults: ["prefix+x"],
    action: { type: "closePane" },
  },
  {
    id: "zoom",
    label: "拡大表示",
    group: "pane",
    defaults: ["prefix+z"],
    action: { type: "zoom" },
  },
  {
    id: "resize_mode",
    label: "resize モード",
    group: "pane",
    defaults: ["prefix+r"],
    action: { type: "enterMode", mode: "resize" },
  },
  {
    id: "rename_pane",
    label: "pane の名前を変更",
    group: "pane",
    defaults: ["prefix+shift+p"],
    action: { type: "renamePane" },
  },
  {
    id: "copy_mode",
    label: "copy モード",
    group: "pane",
    defaults: ["prefix+["],
    action: { type: "enterMode", mode: "copy" },
  },
  {
    id: "edit_scrollback",
    label: "スクロールバックをエディタで開く",
    group: "pane",
    // herdr の edit_scrollback の既定と同じ chord。20260926-edit-scrollback まで「後続」の案内だったキー。
    defaults: ["prefix+e"],
    action: { type: "editScrollback" },
  },
  {
    id: "toggle_sidebar",
    label: "サイドバーの折りたたみ",
    group: "pane",
    defaults: ["prefix+b"],
    action: { type: "toggleSidebar" },
  },
  // 20260927-clipboard-image-paste（herdr の `remote_image_paste`。herdr は `herdr --remote` の既定が ctrl+v——ブラウザは常にサーバの外の
  // クライアントなので同じ既定にする。decisions D2・D6）。クリップボードに画像が無い・読めないときはそのキーの列（ctrl+v なら 0x16）をそのまま送る。
  // 端末にフォーカスがあるときだけ働く（入力欄の Ctrl+V はブラウザのまま）。Vim・Emacs の Ctrl+V を使う人は外せる。
  {
    id: "remote_image_paste",
    label: "クリップボードの画像を貼り付け",
    group: "pane",
    defaults: ["ctrl+v"],
    action: { type: "pasteImage" },
  },
  // 20260923-missing-keybinding-actions（herdr にあって本製品に操作自体が無かったもの。既定は herdr と
  // 同じく全て「割り当てなし」。research F1）。
  {
    id: "last_pane",
    label: "直前の pane へ戻る",
    group: "pane",
    defaults: [],
    action: { type: "lastPane" },
  },
  {
    id: "resize_pane_left",
    label: "pane を左へ広げる（直接）",
    group: "pane",
    defaults: [],
    action: { type: "resizeBy", dir: "left", amount: RESIZE_STEP },
  },
  {
    id: "resize_pane_down",
    label: "pane を下へ広げる（直接）",
    group: "pane",
    defaults: [],
    action: { type: "resizeBy", dir: "down", amount: RESIZE_STEP },
  },
  {
    id: "resize_pane_up",
    label: "pane を上へ広げる（直接）",
    group: "pane",
    defaults: [],
    action: { type: "resizeBy", dir: "up", amount: RESIZE_STEP },
  },
  {
    id: "resize_pane_right",
    label: "pane を右へ広げる（直接）",
    group: "pane",
    defaults: [],
    action: { type: "resizeBy", dir: "right", amount: RESIZE_STEP },
  },
  // 20260927-cli-mode（design D-7）。herdr では pane の右クリックのメニューの項目（キーの操作ではない）。キーから使うときは、焦点の pane と直前の pane を入れ替える。
  {
    id: "swap_with_focused",
    label: "焦点の pane と入れ替え",
    group: "pane",
    defaults: [],
    // herdr のヘルプにも出ない（キーの操作ではなくメニューの項目。swap_pane_* と同じ D76 の扱い）。
    helpHidden: true,
    action: { type: "swapWithFocused" },
  },
] as const satisfies readonly ActionDef[];

export type ActionId = (typeof ACTIONS)[number]["id"];

/** 既定の prefix（herdr の `keys.prefix` の既定と同じ）。 */
export const DEFAULT_PREFIX = "ctrl+b";

const BY_ID: ReadonlyMap<string, ActionDef> = new Map(ACTIONS.map((a) => [a.id, a]));

/** 操作の定義を引く。カタログに無い名前（壊れた保存値の項目）は undefined。 */
export function actionDef(id: string): ActionDef | undefined {
  return BY_ID.get(id);
}

/** 文字列がカタログの操作の id か。保存値・外からの入力を型に絞るのに使う。 */
export function isActionId(id: unknown): id is ActionId {
  return typeof id === "string" && BY_ID.has(id);
}

/**
 * 割り当てが引いたときに実行する `Action` を作る。**範囲の操作は `index`（1〜9）が要る**（省略は呼ぶ側の誤りなので例外）。範囲でない操作は `index` を見ない。
 */
export function actionFor(def: ActionDef, index?: number): Action {
  if (def.indexed !== true) return def.action;
  if (index === undefined)
    throw new Error(`actionFor: 範囲の操作 ${def.id} には数字（1〜9）が要ります`);
  return def.action(index);
}
