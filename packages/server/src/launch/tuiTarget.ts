/**
 * 引数なしの `soda` が端末版へ渡す「繋ぎ先と認証の仕方」（20260927-cli-mode の architecture「インターフェース / データモデル」の `TuiTarget`）。
 * 型は端末版（`@sodashitsu/tui`）が持つ（二重に定義しない。型だけの import なので端末版の読み込みの費用は無い）。
 */
import type { TuiTarget } from "@sodashitsu/tui";

export type { TuiTarget };

/** 端末版の入口（`import("@sodashitsu/tui").runTui` と同じ形）。終了コードを返す。 */
export type TuiEntry = (target: TuiTarget) => Promise<number>;
