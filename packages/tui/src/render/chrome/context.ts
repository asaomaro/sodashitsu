import type { DisplayState } from "@sodashitsu/protocol";
import type { ConnectionState, Mode } from "@sodashitsu/client-core";
import type { SessionModel } from "../../model/SessionModel.js";
import type { PrefsModel } from "../../model/PrefsModel.js";
import type { PackedColor, ThemeColors } from "../color.js";

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
