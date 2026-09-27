import type { Action, KeyInput } from "./actions.js";
import type { SubModeInterpreter } from "./KeyRouter.js";

/** 1 回のキーで動かす比率（D56 の訂正 3。herdr の既定と同じ 0.05）。 */
export const RESIZE_STEP = 0.05;

/**
 * resize モード（`prefix+r`）の解釈（architecture.md「keys/ResizeMode.ts」）。副作用を持たない。
 * 境界をどう探すか（フォーカス中の pane からどの split を動かすか）はサーバ側の責務（D61）——ここは
 * キー→方向の変換だけを行う。`Esc`・`Enter`・素の `r`（herdr の実測。D56 の訂正 3）で抜ける。
 */
export class ResizeMode implements SubModeInterpreter {
  handle(k: KeyInput): { action?: Action; exit?: boolean } {
    switch (k.key) {
      case "h":
      case "ArrowLeft":
        return { action: { type: "resizeBy", dir: "left", amount: RESIZE_STEP } };
      case "j":
      case "ArrowDown":
        return { action: { type: "resizeBy", dir: "down", amount: RESIZE_STEP } };
      case "k":
      case "ArrowUp":
        return { action: { type: "resizeBy", dir: "up", amount: RESIZE_STEP } };
      case "l":
      case "ArrowRight":
        return { action: { type: "resizeBy", dir: "right", amount: RESIZE_STEP } };
      case "Escape":
      case "Enter":
      case "r":
        return { exit: true };
      default:
        return {};
    }
  }
}
