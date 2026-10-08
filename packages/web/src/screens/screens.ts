/**
 * 画面の一覧（20261008-graph-first の AC-S6）。**画面は 2 択の入れ替えではなく、並びとして持つ**: 切り替えの部品（`ScreenSwitcher`）も、主な領域での出し分け（`App.vue`）も、
 * ここから作る。3 つ目以降の画面（プラグインが差し込む、特定の作業に特化した画面）は、ここへ 1 行足し、`ScreenId` の候補が増える。
 * どの画面も、同じ実体（グループ・workspace・tab・pane）の見せ方であり、切り替えても実体は変わらない。
 *
 * - 最初の画面（`base`）は、いつでも描かれている（大きさを保ったまま見えなくするだけ。D11）。ほかの画面は、見えている間だけ中身を持つ。
 * - 3 つ目の画面と、差し込む仕組みは、この作業では作らない。
 */
export interface ScreenDef {
  id: string;
  /** 切り替えの部品に出す名前。 */
  label: string;
  /** 切り替えの部品に出す、ごく短い名前（サイドバーをたたんだとき）。 */
  shortLabel: string;
}

export const SCREENS = [
  { id: "base", label: "基本画面", shortLabel: "基" },
  { id: "graph", label: "グラフ", shortLabel: "グ" },
] as const satisfies readonly ScreenDef[];

export type ScreenId = (typeof SCREENS)[number]["id"];

/** 最初の画面（ログイン直後・窓を狭めてモバイルの画面になったときに戻る先）。 */
export const BASE_SCREEN: ScreenId = "base";
