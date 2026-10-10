import type { Component } from "vue";
import BaseScreen from "./BaseScreen.vue";
import DashboardScreen from "./DashboardScreen.vue";
import GraphScreen from "./GraphScreen.vue";

/**
 * 画面の一覧（20261008-graph-first の AC-S6）。**画面は 2 択の入れ替えではなく、並びとして持つ**: 切り替えの部品（`ScreenSwitcher`）も、主な領域での出し分け（`App.vue`）も、
 * ここから作る。3 つ目以降の画面（プラグインが差し込む、特定の作業に特化した画面）は、ここへ 1 行足し、`ScreenId` の候補が増える。
 * どの画面も、同じ実体（グループ・workspace・tab・pane）の見せ方であり、切り替えても実体は変わらない。
 *
 * - 最初の画面（`base`）は、いつでも描かれている（大きさを保ったまま見えなくするだけ。D11）。ほかの画面は、見えている間だけ中身を持つ。
 * - 3 つ目の画面（ダッシュボード）は 20261010-agent-usage PR3 で足した。差し込む仕組みは作らない。
 */
export interface ScreenDef {
  id: string;
  /** 切り替えの部品に出す名前。 */
  label: string;
  /** 切り替えの部品に出す、ごく短い名前（サイドバーをたたんだとき）。 */
  shortLabel: string;
  /** ボタンの `title`・読み上げの名前（無ければ `label`）。名前が短いボタンに、正式な名前を添える。 */
  title?: string;
  /** 主な領域に出す部品。 */
  component: Component;
}

export const SCREENS = [
  { id: "base", label: "基本画面", shortLabel: "基", component: BaseScreen },
  { id: "graph", label: "グラフ", shortLabel: "グ", component: GraphScreen },
  // 3 つ目の画面（20261010-agent-usage PR3）。起動しているエージェントの利用状況の一覧とアカウントの枠。
  // ボタンの名前は短く「利用状況」（既定の 240px のサイドバーで、前の 2 つと並んで切れない）。画面の中の見出し・文書・モバイルの入口は「ダッシュボード」。
  { id: "dashboard", label: "利用状況", shortLabel: "利", title: "利用状況（ダッシュボード）", component: DashboardScreen },
] as const satisfies readonly ScreenDef[];

export type ScreenId = (typeof SCREENS)[number]["id"];

/** 最初の画面（ログイン直後・窓を狭めてモバイルの画面になったときに戻る先）。 */
export const BASE_SCREEN: ScreenId = "base";
