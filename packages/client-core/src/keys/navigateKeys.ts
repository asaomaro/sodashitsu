import type { Action } from "./actions.js";

/**
 * navigate モード（`prefix+w`）の中の、キーでカスタマイズできる操作のカタログ
 * （20260923-navigate-mode-keys。design「インターフェース / データ構造 > カタログ」）。
 * 当初は6つの移動操作のみだったが、20260925-sidebar-keyboard-menu で7つ目
 * （`navigate_open_menu`。移動ではなくメニューを開く操作）を追加した——このカタログ機構自体は
 * 移動専用ではなく汎用（`NavigateKeyDef.action` は任意の `Action` を持てる）。
 * 既存操作の `bindings.ts` の `ACTIONS`（2026-09-23 時点で35個）とは**独立した別の表**
 * （decisions D2）——prefix 概念が無く、bare な単一文字も許す点が既存操作の検証規則
 * （`assign.ts` の `isDirectChord` の modifier 必須規則）と相容れないため。
 *
 * 当初6件の既定は現行の `NavigateMode.ts` の固定キーと 1:1（`navigate_pane_left`/
 * `navigate_pane_right` の `left`/`right` は予約キーのため表に載らない——`ArrowLeft`/
 * `ArrowRight` は `NavigateMode` 側の固定 case として別途維持する。decisions D3）。
 */
export interface NavigateKeyDef {
  /** herdr の `[keys]` の項目名と同じ id（`navigate_workspace_up` 等）。 */
  readonly id: string;
  /** 画面に出す名前（節「キー」の新セクション）。 */
  readonly label: string;
  /** 素の chord（`chord.ts` の正規形。prefix なし）の既定一覧。 */
  readonly defaults: readonly string[];
  /** 常に固定の `Action`（既存操作の `indexed`＝範囲指定のような仕組みは無い）。 */
  readonly action: Action;
}

export const NAVIGATE_KEYS = [
  {
    id: "navigate_workspace_up",
    label: "workspace を上へ選ぶ",
    defaults: ["up"],
    action: { type: "navigate", op: "up" },
  },
  {
    id: "navigate_workspace_down",
    label: "workspace を下へ選ぶ",
    defaults: ["down"],
    action: { type: "navigate", op: "down" },
  },
  {
    id: "navigate_pane_left",
    label: "pane を左へ選ぶ",
    defaults: ["h"],
    action: { type: "navigate", op: "paneDir", dir: "left" },
  },
  {
    id: "navigate_pane_down",
    label: "pane を下へ選ぶ",
    defaults: ["j"],
    action: { type: "navigate", op: "paneDir", dir: "down" },
  },
  {
    id: "navigate_pane_up",
    label: "pane を上へ選ぶ",
    defaults: ["k"],
    action: { type: "navigate", op: "paneDir", dir: "up" },
  },
  {
    id: "navigate_pane_right",
    label: "pane を右へ選ぶ",
    defaults: ["l"],
    action: { type: "navigate", op: "paneDir", dir: "right" },
  },
  {
    id: "navigate_open_menu",
    label: "選択した workspace のメニューを開く",
    defaults: ["space"],
    action: { type: "navigate", op: "openMenu" },
  },
] as const satisfies readonly NavigateKeyDef[];

export type NavigateKeyId = (typeof NAVIGATE_KEYS)[number]["id"];

const BY_ID: ReadonlyMap<string, NavigateKeyDef> = new Map(NAVIGATE_KEYS.map((d) => [d.id, d]));

/** 操作の定義を引く。カタログに無い名前（壊れた保存値の項目）は undefined。 */
export function navigateKeyDef(id: string): NavigateKeyDef | undefined {
  return BY_ID.get(id);
}

/** 文字列がカタログの操作の id か。保存値・外からの入力を型に絞るのに使う。 */
export function isNavigateKeyId(id: unknown): id is NavigateKeyId {
  return typeof id === "string" && BY_ID.has(id);
}

/**
 * herdr の予約キー（research F7。`herdr:src/config/keybinds.rs:729-749`）。navigate の6操作の表には
 * これらの chord を登録できない（既定・利用者の上書きのどちらでも）。`esc`/`enter`/`tab`/`shift+tab` は
 * `NavigateMode` 自身の確定/取消・将来の herdr 追随機能のため、`left`/`right` は pane 左右移動の固定
 * フォールバック（`NavigateMode` の bare な `ArrowLeft`/`ArrowRight` の分岐。修飾付き〔`ctrl+left` 等〕
 * は予約されないので、他の5操作へ正当に割り当てられる）のため、`1`〜`9`（修飾無し）は将来の番号選択
 * 機能のために、それぞれ予約する。**`ctrl+shift+v` も予約する**——`KeyInputController.ts` の
 * `isManualPasteShortcut` がモードに関わらず `router.handle()` より手前で必ず横取りするため、
 * navigate の表へ割り当てても発火しない（既存34〜35操作向けの `RESERVED_DIRECT`/
 * `RESERVED_AFTER_PREFIX`〔`keymap.ts`〕と同じ理由。60 review ラウンド1で発見）。
 * `chord.ts` の正規形（`formatChord`）で持つ。
 */
export const NAVIGATE_RESERVED_CHORDS: ReadonlySet<string> = new Set([
  "esc",
  "enter",
  "tab",
  "shift+tab",
  "left",
  "right",
  "ctrl+shift+v",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
]);
