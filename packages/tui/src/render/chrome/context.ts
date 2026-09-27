import type { DisplayState } from "@sodashitsu/protocol";
import { stateGlyph, type ConnectionState, type Mode } from "@sodashitsu/client-core";
import type { SessionModel } from "../../model/SessionModel.js";
import type { PrefsModel } from "../../model/PrefsModel.js";
import type { PackedColor, ThemeColors } from "../color.js";
import type { SidebarScroll } from "./sidebar.js";
import type { TabScroll } from "./tabBar.js";

/** chrome（サイドバー・tab バー・枠）を描くのに要るもの。 */
export interface ChromeContext {
  model: SessionModel;
  prefs: PrefsModel;
  theme: ThemeColors;
  /** キーのモード（prefix 待ちなら tab バーに `PREFIX`）。 */
  mode: Mode;
  connection: ConnectionState;
  /** 右上に出す知らせ（初回の token 等。無ければ null）。 */
  notice: string | null;
  /** navigate モードで選んでいる workspace（サイドバーで強調する）。 */
  navigateSelection?: string | null;
  /** 短い警告（未接続で打鍵を送れない等）。接続の状態より優先して出す。 */
  alert?: string | null;
  session?: string | undefined;
  /** サイドバーの区画の表示の位置（描くたびに収まる範囲へ寄せ直す。持ち主は `TuiApp`）。 */
  sidebarScroll?: SidebarScroll;
  /** tab バーのあふれたときの表示の位置（同上）。 */
  tabScroll?: TabScroll;
}

/**
 * 状態の記号（共有の設定 `statusSymbols` が切なら形を出さず色の点だけ。web の `StateIcon` が記号を消して色の点だけにするのと同じ。
 * herdr の `ui.status_indicators = "dots"`）。
 */
export function glyphFor(state: DisplayState | null, symbols: boolean): string {
  const g = stateGlyph(state);
  return g === "" || symbols ? g : "●";
}

/** 状態の記号の色（web の `--soda-state-*`。unknown は idle と同じ）。 */
export function stateColor(theme: ThemeColors, state: DisplayState | null): PackedColor {
  switch (state) {
    case "blocked":
      return theme.ui("--soda-state-blocked");
    case "working":
      return theme.ui("--soda-state-working");
    case "done":
      return theme.ui("--soda-state-done");
    default:
      return theme.ui("--soda-state-idle");
  }
}
