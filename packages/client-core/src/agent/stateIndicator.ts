import type { DisplayState } from "@sodashitsu/protocol";
import { STATE_PRIORITY } from "./agentState.js";

/**
 * エージェントの状態の**字形**と**読み上げの名前**（20260921-herdr-settings-gaps の D4）。
 *
 * **字形は herdr の `symbols` と同じ**（`herdrdev/herdr` `da6bcd5` の `src/client/shell.rs:177-196` の `status_icon`）。
 * どれも絵文字の属性を持たないので `color` を受け継ぎ、**色と併記できる**（絵文字は色を受け継がない）。
 *
 * **この表の唯一の置き場**——状態の点はサイドバー・goto・モバイルのピッカーの 3 か所に出る。字形を各所に書くと
 * 1 つだけが黙ってずれる（`store/paneName.ts` と同じ事情）。描くのは `components/StateIcon.vue`。
 */
/**
 * 表示状態を優先度の高い順に（設定の注記などが表を並べるのに使う）。**`STATE_PRIORITY` から導く**——手で並べると、状態が増えても
 * 型で落ちず、並びもコメントで合わせるだけになる（`STATE_PRIORITY` は `Record<DisplayState, number>` なので増えれば型で落ちる）。
 */
export const DISPLAY_STATES: readonly DisplayState[] = (Object.keys(STATE_PRIORITY) as DisplayState[]).sort(
  (a, b) => STATE_PRIORITY[b] - STATE_PRIORITY[a],
);

const GLYPHS: Record<DisplayState, string> = {
  blocked: "×",
  working: "◐",
  done: "✓",
  idle: "○",
  unknown: "·",
};

/**
 * 語は通知の文言に合わせる（トーストの「〜が入力待ちです」「〜が完了しました」。`notify/NotificationController.ts`）。
 * **色の点にも名前が無かった**（WCAG 1.1.1）ので、記号表示を切っていても付ける。
 */
const LABELS: Record<DisplayState, string> = {
  blocked: "入力待ち",
  working: "作業中",
  done: "完了",
  idle: "待機中",
  unknown: "状態不明",
};

/** 字形。**エージェントが居ない（`null`）ときは空**——居ない行に記号を出さない（AC8）。 */
export function stateGlyph(state: DisplayState | null): string {
  return state === null ? "" : GLYPHS[state];
}

/** 読み上げの名前。**エージェントが居ないときは `null`**（名前も出さない。部品の側で `aria-hidden` にする）。 */
export function stateLabel(state: DisplayState | null): string | null {
  return state === null ? null : LABELS[state];
}
