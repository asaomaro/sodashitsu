import { RECOMMENDED_DIRECT } from "./assign.js";
import type { ActionId } from "./bindings.js";

/**
 * キーバインドのプリセット（20260922-keybinding-presets。design「`presets.ts`（新規）」）。
 * 各プリセットは `ActionDef.defaults` と同じ書式（`prefix+…` も可）の割り当て文字列の表を持ち、
 * `assign.ts` の `applyRecommended` へそのまま渡せる（表を 1 つ足すだけで新しいプリセットが増える。AC5）。
 */
export interface KeyPreset {
  readonly id: string;
  /** `<option>` の表示にも、案内文の中の呼び名にも使う（1 か所で決める）。 */
  readonly label: string;
  readonly bindings: ReadonlyArray<readonly [ActionId, string]>;
}

/**
 * tmux の DEFAULT KEY BINDINGS に倣う一式（design「依拠する既存の事実」。research F10。
 * tmux 公式 man page `tmux.1` を 2026-09-22 に取得して確認）。この製品に 1:1 で対応する操作だけを
 * 拾う——方向つきでない swap・resize の連続キー・0 始まりの window 番号選択などは対応が作れないため
 * 含めない（research F11・F12）。
 */
export const PRESET_TMUX: ReadonlyArray<readonly [ActionId, string]> = [
  ["split_vertical", "prefix+%"],
  ["split_horizontal", 'prefix+"'],
  ["focus_pane_left", "prefix+left"],
  ["focus_pane_down", "prefix+down"],
  ["focus_pane_up", "prefix+up"],
  ["focus_pane_right", "prefix+right"],
  ["close_pane", "prefix+x"],
  ["new_tab", "prefix+c"],
  ["next_tab", "prefix+n"],
  ["previous_tab", "prefix+p"],
  ["rename_tab", "prefix+,"],
  ["close_tab", "prefix+&"],
  ["zoom", "prefix+z"],
  ["detach", "prefix+d"],
];

export const KEY_PRESETS: readonly KeyPreset[] = [
  {
    id: "herdr-ctrl-alt",
    label: "herdr のおすすめの直接のキー（ctrl+alt）",
    bindings: RECOMMENDED_DIRECT,
  },
  { id: "tmux", label: "tmux 風", bindings: PRESET_TMUX },
];
