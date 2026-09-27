# レビューガイド: 端末内の画像表示（Kitty graphics。herdr H13）

## 変更概要 / 目的

pane の中のプログラムが Kitty graphics protocol で出した画像を、ブラウザの pane に表示する（Sixel・iTerm2 形式も表示する）。
xterm.js 6.0.0 は APC を捨て、Kitty を描ける addon は beta（xterm.js 6.1 beta が必要）なので、**サーバで Kitty を解釈し、安定版の
`@xterm/addon-image` 0.9.0 が描ける iTerm2 形式に作り直して送る**（decisions D1）。応答（`a=q` 等）はサーバだけが 1 回返す（D17 を保つ）。

## 重要ポイント

- **画像のセル数はサーバが決める**（`c`/`r`、無ければ基準のセル 9×17 px から。D3）。ブラウザには `width=<c>;height=<r>;preserveAspectRatio=0` で送り、
  ミラーには同じだけのカーソル移動（IND×(r-1)＋CUF c、`C=1` なら CUU）を送るので、画像の後のカーソルがブラウザ同士・ミラーで一致する（D12 で LF → IND）。
- **応答の順序**: Kitty の応答は `mirror.write("", cb)` の `cb` で PTY へ書く（同じ出力で先に来た DA1 などへのミラーの応答を追い越さない。D6）。
- **出力の境目**: 末尾の `ESC` / `ESC _` はそのまま流し、続きが Kitty なら CAN を流して打ち消す（時間切れの仕組みが要らない。D7）。
- **ブラウザの握りつぶしの順序**: xterm.js のハンドラは LIFO なので、`installQueryFilter` を addon の読み込みの後へ移した（addon は DA1・XTSMGRAPHICS に自分で答える。D8）。
- **ミラーの `CSI 14/16 t`**: headless は `windowOptions` が無効な Ps の公開ハンドラを呼ばないので、`getWinSizePixels`/`getCellSizePixels` を有効にした。
- **信頼できない出力**: `t=f/t/s` は開かずにエラー、ブラウザへ埋め込むのはサーバが作り直した base64 と数値だけ、上限（D5。ブラウザへ送る PNG 1.25 MiB を含む）。

## 処理フロー

```mermaid
sequenceDiagram
  participant P as PTY
  participant H as TerminalHost
  participant K as KittyGraphicsTranslator
  participant M as Mirror（headless）
  participant B as ブラウザ（xterm.js＋addon-image）
  P->>H: 出力 "…ESC _ G a=T,f=100,i=1;<b64> ESC \\…"
  H->>K: process(chunk)
  K-->>H: text / image / response の区切り
  H->>M: text・image.mirror（IND×(r-1)＋CUF）
  H->>B: text・image.client（OSC 1337 File=…;width=c;height=r…＋CUF）
  H->>M: write("", cb)
  M-->>H: cb（前の出力を処理済み）
  H->>P: ESC _ G i=1;OK ESC \\
```

## 主要な変更箇所

- `packages/server/src/terminal/KittyGraphics.ts:117` `process` — 出力の読み分け（状態機械・境目・上限）。
- `packages/server/src/terminal/KittyGraphics.ts:280` `execute` — Kitty のコマンド（`a=q/t/T/p/d`・`i`/`I`/`q`・応答）。
- `packages/server/src/terminal/KittyGraphics.ts:348` `buildImage`・`:399` `display`・`:413` `placement` — PNG の検査・生の画素の PNG 化・セル数・送る文字列。
- `packages/server/src/terminal/png.ts` — PNG の検査（署名・チャンク・CRC）と生成（各行 Paeth・level 6。D14）。
- `packages/server/src/terminal/TerminalHost.ts:89`・`:115` `deliver` — 区切りの配信と応答の順序。`resize` で画素（D9）。
- `packages/server/src/terminal/Mirror.ts:107`・`:280` — `windowOptions` と `CSI 14/16 t`。
- `packages/web/src/term/TerminalRegistry.ts:221`・`:233` — addon の読み込みと握りつぶしの順序。`packages/web/src/term/imageAddon.ts` — addon の設定。

## リスク / 確認したい点

- **実物のブラウザでの描画は未検証**（E2E を走らせない指示。happy-dom で `createImageBitmap` を差し替えてカーソル位置までは確かめた）。手元で `kitten icat` 等を試してほしい。
- 既知の制約: 再接続で画像が消える・削除（`a=d`）で表示が消えない・ブラウザへ送る PNG は 1.25 MiB まで・続けて出る大きな画像は配信の滞りで消えうる・
  ブラウザで画像を置けなかったとき／DECSDM でサーバの画面のカーソルだけ下がる（D13・D14。backlog に残した）。
- 生の画素の PNG 化は主スレッドで同期に走る（4 MP で約 0.4 秒の 1 回の実測。D14）。
- 基準のセル 9×17 px は目安（未計測。D3）。
