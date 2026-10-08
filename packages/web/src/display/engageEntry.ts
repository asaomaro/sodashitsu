/**
 * スクリプトが動く面で、利用者が「操作を始める」入口の決まり（20261007-soda-extensions の design「(b) 利用者が操作するまでは、元の場所へ戻す」。決定 D28 の 4）。**入口の決まりは、このファイルの 1 か所**。
 *
 * 今の決まり（案 B。`ENGAGE_ENTRY = "button"`）: 入口は 2 つだけ——枠の外の固定の［操作する］ボタンと、キーの操作 `focus_display`（`prefix+i`）。
 * **枠の中・覆いを押しても、始まらない**（覆いを押すと、［操作する］ボタンを 1 秒だけ強調して場所を教える）。
 *
 * **始めた操作の残りのイベントを、枠へ届けない**ために、始める時機を遅らせる:
 * - ［操作する］をポインタで押したときは、`click`（＝ポインタが上がった後。`pointerup`・`mouseup`・`touchend` は親に届いた後）で始める。
 * - `Enter`/`Space` で押したとき・`prefix+i` のときは、**そのキーが上がる（`keyup`）のを親が受け、その処理が済んでから**始める。
 *
 * 案 A（覆いを押して始める。覆いは、その押下の `click` が終わるまで外さない）へ差し替えるときは、**このファイルだけ**を変える:
 * `ENGAGE_ENTRY` を `"cover"` にし、`coverStartsEngage()` が真を返すようにし、`startFromCover()` の分岐を使う。どちらの案でも、上の「残りのイベントを届けない」は同じ関数が担う。
 */
export type EngageEntry = "button" | "cover";
export const ENGAGE_ENTRY: EngageEntry = "button";

/** 覆いを押したら操作を始めるか（案 A）。案 B では始めず、［操作する］を強調する。 */
export function coverStartsEngage(): boolean {
  return ENGAGE_ENTRY === "cover";
}

/** キーが上がるのを待つ上限（ウィンドウがフォーカスを失った等で `keyup` が来ないときの保険）。 */
export const ENGAGE_KEYUP_WAIT_MS = 1000;

/**
 * ［操作する］ボタンの `click`。`ev.detail === 0` はキーボードから起きた `click`（`Enter`/`Space`）なので、そのキーの `keyup` の後に始める。
 * ポインタから起きた `click` は、ポインタが上がった後なので、すぐ始めてよい。
 */
export function startFromButton(ev: Pick<MouseEvent, "detail">, start: () => void, doc: Document = document): void {
  if (ev.detail === 0) startAfterKeyup(start, doc);
  else start();
}

/** キーの操作（`prefix+i`）から。最後に押したキーの `keyup` を親が受けてから始める。 */
export function startFromKey(start: () => void, doc: Document = document): void {
  startAfterKeyup(start, doc);
}

/** 案 A の入口: 覆いの `click`（押下が終わった後）で始める。案 B では呼ばれない。 */
export function startFromCover(start: () => void): void {
  if (coverStartsEngage()) start();
}

function startAfterKeyup(start: () => void, doc: Document): void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const go = (): void => {
    if (done) return;
    done = true;
    doc.removeEventListener("keyup", onKeyup, true);
    if (timer !== null) clearTimeout(timer);
    start();
  };
  // 捕捉段階で受ける。親が受けたあとに始めるので、この keyup は枠に届かない。
  // **始めるのは、この keyup の処理が全部済んだあと**（`setTimeout 0`）: 端末（xterm.js）は keyup の中で自分へフォーカスを戻す（`focus()`）ので、
  // その場で枠へ移すと、すぐ端末に取り返される（実測。prefix+i で起きた）。
  const onKeyup = (): void => {
    doc.removeEventListener("keyup", onKeyup, true);
    setTimeout(go, 0);
  };
  doc.addEventListener("keyup", onKeyup, true);
  timer = setTimeout(go, ENGAGE_KEYUP_WAIT_MS);
}
