/**
 * サーバが基準にするセルの画素の大きさ（20260926-kitty-graphics decisions D3）。
 *
 * サーバはブラウザのセルの画素を知らないので、Kitty graphics の画像のセル数の決定・画素の問い合わせ（`CSI 14 t`・`CSI 16 t`）への応答・
 * PTY の `ws_xpixel`/`ws_ypixel` に、この 1 つの値を使う。値は xterm.js の既定（`fontSize` 15・フォントの指定なし）のセルの目安
 * （実物のブラウザでは未計測）。画像はブラウザ側でセル数の指定どおりに拡縮されるので、ずれても画像のセル数は変わらない。
 */
export const CELL_PIXELS: Readonly<{ width: number; height: number }> = Object.freeze({
  width: 9,
  height: 17,
});

/** 端末の文字の領域の画素の大きさ（`cols`×`rows` のセル。PTY と同じく下限 1 に丸める）。 */
export function windowPixels(cols: number, rows: number): { width: number; height: number } {
  return {
    width: Math.max(1, cols) * CELL_PIXELS.width,
    height: Math.max(1, rows) * CELL_PIXELS.height,
  };
}
