import { ImageAddon } from "@xterm/addon-image";
import type { ITerminalAddon } from "@xterm/xterm";

/**
 * 端末内の画像（Sixel・iTerm2 のインライン画像）を描く `@xterm/addon-image` 0.9.0 の設定（20260926-kitty-graphics design「6. ブラウザ」・decisions D5・D8）。
 * Kitty graphics はサーバが iTerm2 形式に作り直して送る（`packages/server/src/terminal/KittyGraphics.ts`）ので、ここでは扱わない。
 *
 * - `enableSizeReports: false`: 真だと xterm.js 本体が画素・文字数の問い合わせ（`CSI 14/16/18 t`）に答える。応答はサーバだけが出す（D17）。
 * - `storageLimit`（MB）: 端末 1 つが保持する画像の総量（復号後の画素×4 バイト）。既定 128 から下げる。超えると古い画像から捨てるが、
 *   **新しい 1 枚はこれを超えていても保持する**（addon 0.9.0 の `ImageStorage.addImage`）。端末 1 つの最悪は 16MB＋1 枚
 *   （`pixelLimit` まで＝約 67MB。サーバが送る画像は表示の箱 4,194,304 画素＝約 16MB まで。約 67MB に届くのはプログラムが直接出す Sixel・
 *   iTerm2 の画像）。端末はデスクトップで最大 24 個を保つ（LRU）。端末を捨てると addon も捨てる（`term.dispose()`）。
 * - `pixelLimit`: 1 枚の画素数（既定のまま）。サーバが送る画像の表示の箱の上限（4,194,304）の 4 倍の余裕。
 * - `sixelSizeLimit`・`iipSizeLimit`: 1 枚のバイト数。`iipSizeLimit` はサーバが送る PNG（1.25 MiB 以下。`maxPngBytes`）より十分大きい既定のまま。
 */
export const IMAGE_ADDON_OPTIONS = Object.freeze({
  enableSizeReports: false,
  storageLimit: 16,
  pixelLimit: 16_777_216,
  sixelSupport: true,
  sixelSizeLimit: 12_000_000,
  iipSupport: true,
  iipSizeLimit: 20_000_000,
} as const);

export function createImageAddon(): ITerminalAddon {
  return new ImageAddon({ ...IMAGE_ADDON_OPTIONS });
}
