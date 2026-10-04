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

## D3: tasks の独立点検で決めたこと（15 件）
- `--soda-resize-line` は色の上書きの対象にする（`CSS_VAR_LABELS` に「境目の線」を足す。利用者が線の色を変えられる）。
- T7（サイドバーの幅の境目）は nav の内側のまま・`overflow` も今のままにし、外へ出す（`right: -4px`・`overflow: visible`）のは区画のスクロールが入る T8 で行う。
- golden は `.sidebar-row` の outerHTML だけなので更新しない。
- 区画の見出しは T9 から T15 に分けた。独立点検は T3・T4・T6・T8・T10・T11・T15。

## D4: coding で決めたこと
- 畳んだ区画の中にあったフォーカスを見出しのボタンへ移す処理は、`spacesFolded`／`agentsFolded` の watch（`flush: "pre"`）に置いた。クリックでも操作 `toggleSidebarSection`（キー）でも同じに働く（design は操作はフォーカスを動かさないとしているが、それは端末の pane へフォーカスを動かさない、の意味に読み、区画の中のフォーカスが宙に浮くのは防ぐ）。区画の外のフォーカスは動かさない。
- 区画の最小の高さ（区画の境目の `box.minTop`／`minBottom`）は、定数を二重に持たず、CSS の `min-height` を `getComputedStyle` で実測する。
- 区画の境目を出すのは、サイドバーを開いていて両方の区画を開いているときだけ。出ている間は agents の `border-top` を外し、境目の 1px がその代わりをする。
- T15 の独立点検（4 件）: 畳んだサイドバーから開き直して畳んだ区画が現れる経路のフォーカスは `nextTick` 後に見出しへ移す・畳んだ見出しに `aria-label`（件数）を足した。navigate で spaces を開く watch はサイドバーを畳んでいる間も保存する（畳んだマシンのまとまりと同じ扱い。仕様どおり）。他マシンの件数の枝と SubagentListDialog の差し込みの DOM は、全体の点検（cross）で見る。
- 端末版の spaces の見出しが「▾ Spaces」と 2 桁広がったので、既定の狭さ（`Renderer.test.ts` の幅）では spaces の並び順が出なくなった（design の「狭い幅では印と題だけ」に従う。`Renderer.test.ts` の期待を直した）。
