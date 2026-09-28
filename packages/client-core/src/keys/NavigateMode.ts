import type { Action, KeyInput } from "./actions.js";
import { chordOf } from "./chord.js";
import type { SubModeInterpreter } from "./KeyRouter.js";
import { DEFAULT_NAVIGATE_KEYMAP, type ResolvedNavigateKeymap } from "./navigateKeymap.js";

/**
 * navigate モード（`prefix+w`）の解釈（architecture.md「keys/NavigateMode.ts」。
 * 20260923-navigate-mode-keys で6つの移動操作を表から引く形にした。design「NavigateMode.ts の変更」）。
 * 副作用は持たない（`keymap` の差し替えは `setKeymap` で行うが、差し替え後の `handle` は純粋）。
 *
 * `Enter`（決定）・`Escape`（取消）はこの work の対象外（今回変更可能にした6操作に含まれない）ので、
 * 固定 case のまま。**bare な**（修飾キーの無い）`ArrowLeft`/`ArrowRight` も固定——`left`/`right` は
 * herdr の予約キー（`navigateKeys.ts` の `NAVIGATE_RESERVED_CHORDS`）で表に登録できないため、
 * pane 左右移動という**既存の挙動**を落とさないよう、表の割り当てに関わらず常に効く固定動作として残す
 * （decisions D3）。**修飾付きの矢印（`ctrl+left` 等）は予約されていない**——`NAVIGATE_RESERVED_CHORDS`
 * は bare な `left`/`right` だけを予約するので、`ctrl+left` 等は他の5操作へ正当に割り当てられる
 * （`validateNavigateAssignment` が通す）。固定 case を bare だけに絞らないと、割り当てたのに
 * 常に pane 左右移動が起きる「幽霊バインディング」になる（60 review ラウンド1で発見。修飾の有無は
 * `chordOf` の判定と同じ4フラグ＝`ctrl`/`alt`/`shift`/`meta` で見る）。それ以外のキーは `chordOf` で
 * 正規化し、`ResolvedNavigateKeymap`（既定は `DEFAULT_NAVIGATE_KEYMAP`。節「キー」で変更すると
 * `setKeymap` で即時に差し替わる）を引く。
 * `1-9` の直接切替・prefix 割り当ての prefix 無しでの実行は実装しない（D62。意図的な簡略化）。
 */
export class NavigateMode implements SubModeInterpreter {
  constructor(private keymap: ResolvedNavigateKeymap = DEFAULT_NAVIGATE_KEYMAP) {}

  /** 割り当てが変わったときに差し替える（`KeyRouter.setKeymap`・`store/settings.ts` と同じ流儀）。 */
  setKeymap(keymap: ResolvedNavigateKeymap): void {
    this.keymap = keymap;
  }

  handle(k: KeyInput): { action?: Action; exit?: boolean } {
    if (k.key === "Enter") return { action: { type: "navigate", op: "activate" }, exit: true };
    if (k.key === "Escape") return { action: { type: "navigate", op: "cancel" }, exit: true };
    const bare = !k.ctrl && !k.alt && !k.shift && !k.meta;
    if (bare && k.key === "ArrowLeft") return { action: { type: "navigate", op: "paneDir", dir: "left" } };
    if (bare && k.key === "ArrowRight") return { action: { type: "navigate", op: "paneDir", dir: "right" } };
    const chord = chordOf(k);
    const action = chord === null ? undefined : this.keymap.actionFor(chord);
    return action ? { action } : {};
  }
}
