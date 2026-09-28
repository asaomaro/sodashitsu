/**
 * ブラウザの端末が持つ scrollback の行数を決める（20260921-herdr-settings-gaps の D5）。
 *
 * **上限はサーバが決める**（`--scrollback`。snapshot の `limits.scrollbackLines`）。サーバは求められた行数を
 * 明示的には切らないが、SNAPSHOT はミラーにある分しか作れない——**上限を超えて求めてもエラーは出ず、
 * 黙って上限分しか届かない**。だから利用者には上限を超える値を選ばせない（`scrollbackChoices`）。
 */

/** このブラウザの設定。`"auto"` は「端末の種類に任せる」＝**この work より前の振る舞いそのまま**。 */
export type ScrollbackPref = "auto" | number;

/** モバイルの「自動」の行数（design「WebSocket の通信」：モバイルは 1000 を申告する）。 */
export const MOBILE_SCROLLBACK_LINES = 1000;

/** 選べる段階。サーバの上限を超えるものは `scrollbackChoices` が落とす。 */
const STEPS = [1000, 2000, 5000, 10000] as const;

/**
 * 保存された値を読む。**`"auto"` か非負の整数**だけを受け、それ以外（壊れた値・負・小数・文字列）は `"auto"`（AC3）。
 *
 * **サーバの上限は検査しない**——上限は起動のたびに変わりうる実行時の値で、保存した値の正しさではない。
 * 上限を超えた値は使うとき（`effectiveScrollback`）に押さえ、保存値は書き換えない（上限が戻れば元の選択が効く）。
 * 0 を受けるのはサーバが `--scrollback 0` を受け付けるため（受けないと、上限 0 のサーバで 0 を選んでも
 * 読み直すと「自動」に戻る）。
 */
export function loadScrollbackPref(raw: unknown): ScrollbackPref {
  if (raw === "auto") return "auto";
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  return "auto";
}

/**
 * 設定に出す選択肢（昇順・重複なし）。段階のうち**サーバの上限以下**、**上限そのもの**、
 * **上限以下の保存値**（段階に無くても）。
 *
 * 上限は必ず入るので、上限を超えた保存値を押さえた行（＝上限）は必ずある。上限以下で段階に無い保存値
 * （例: 上限 3000 のサーバで選んだ 3000 を、上限 10000 のサーバで開いた）も足すので、
 * **ダイアログではいつもちょうど 1 つの行が選ばれている**。
 */
export function scrollbackChoices(limit: number, saved?: number): number[] {
  const choices = new Set<number>();
  for (const step of STEPS) if (step <= limit) choices.add(step);
  choices.add(limit);
  if (saved !== undefined && saved <= limit) choices.add(saved);
  return [...choices].sort((a, b) => a - b);
}

/**
 * 実際に使う行数。
 *
 * - `"auto"`: デスクトップはサーバの上限、モバイルは 1000。**以前の `main.ts` と同じで、モバイルの 1000 は上限で押さえない**
 *   （何も設定していない利用者の見え方を変えない）。
 * - 数: 選んだ値を**サーバの上限で押さえる**。
 */
export function effectiveScrollback(
  pref: ScrollbackPref,
  kind: "desktop" | "mobile",
  limit: number,
): number {
  if (pref === "auto") return kind === "mobile" ? MOBILE_SCROLLBACK_LINES : limit;
  return Math.min(pref, limit);
}
