# 判断の記録

## D1: 範囲を分けた
D&D の表現とタブの並べ替えは別の作業（`split-dnd.md`）。`AGENTS.md`「差分を小さく切る」。

## D2: 設計の独立点検で決めたこと（19 件。must 1・should 8・nit 10。CSS とブラウザの動きは実測）
- ドラッグ中のキーは `preventDefault` と `stopPropagation` の両方で止める（`stopPropagation` だけでは xterm へ漏れる。実測）。
- 当たり判定: pane の間は `.pane-layout-side` に `isolation: isolate`（xterm のスクロールバーが z 11 で奪う）。サイドバーの幅の境目は nav の外へ `right: -4px`・幅 8px・nav は `overflow: visible`。
- 畳んだ区画は `min-height: 0`。spaces の最小にはフッタを足す。区画の padding は body に付ける。
- 色は新しい変数 `--soda-resize-line`（17 のテーマのうち 4 つで `--soda-accent` が 3:1 を割るため、`uiTokens()` が accent か fg を選ぶ）。
- Splitter の取り消し・リセットは、ためていた送信を捨てる。
- 端末版: agents が 0 件のときは区切りの行を出さない（今のまま）。navigate に入ると畳んだ spaces を開く。
- 利用者の決定（見本を見て OK）: 線は 3px・強調色・乗せて 0.15 秒で出る。畳んだ見出しは件数と入力待ちの印。
- 既定のキー（利用者の決定）: `prefix+shift+b`＝spaces、`prefix+shift+a`＝agents（どちらも空き）。
