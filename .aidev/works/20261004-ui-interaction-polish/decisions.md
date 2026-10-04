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
- **既存の E2E の期待を直した（D2 の帰結）**: サイドバーの幅の境目が外へ 4px はみ出す（`right: -4px`）ので、pane の置き場の**左端の 4px の帯は境目が受ける**。`keys-mouse-dialogs.spec.ts` の「pane の枠の右クリック」「枠のホバー」は左端の帯を狙っていたので、上端・右端の帯に直した。Tab の順の期待には、区画の見出しのボタンと 2 つの境目を足した。左端の帯の右クリックのメニューは、キーボード（枠の Enter）と他の 3 辺から開ける。
- **既存 E2E の期待を直した（その 2）**: 開いたサイドバーの `.sidebar` が `overflow: visible` になり、外へ 4px はみ出す幅の境目が `scrollWidth` に入る。`workspace-tab-pane.spec.ts` の「横に溢れない」は、開いているときは中身の入れ物 `.sidebar-sections` で測る形に直した。畳んだ状態は境目を `right: 0` に戻し（`overflow-x: hidden` の nav で `scrollWidth` が増えるため）、測り方は今のまま。
- 元から落ちる E2E: `workspace-tab-pane.spec.ts`「新しい pane を作る操作の直後に打った文字…（D99）」は、作業ブランチ 2 回・main（fadc983）2 回とも同じ失敗（退行ではない）。`server/src/tui.integration.test.ts` の「端末版 2 つを同時に繋ぐ」は、サイドバーの内容が worktree のフォルダ名の長さに依存して落ちる環境依存（期待の `ui-interaction-polish` が 1 行に収まらない）で、main での確認は未了。
- **smoke(web) の `.xterm-helper-textarea` クリックが落ちた件は製品の退行ではない（smoke を直した）**: 実測（1280x720）で、落ちたときの補助要素は (816,-18,7x21)＝表示の上へ 18px はみ出し、中心が画面の外だった（xterm は補助要素を**カーソルの位置**へ動かす。`.xterm-screen` は main でも top=-60・高さ 840 で、カーソル行が上へはみ出すと補助要素も出る）。サイドバーの境目は (236,0,8x720)、pane の枠 `.pane-frame-edge` は (241,0,1039x720)で、境目は補助要素から約 580px 離れていて関係しない（枠は inset:0 の全面で、画面の外の点では枠が当たる先になるだけ）。main の同じ測定は補助要素 (1145,3)・境目 (234,0,6)——カーソル行が 1 行違うだけで、押せるかが変わっていた。利用者が押す端末の領域（`.xterm-screen` の中心）はこの work でも今まで通りフォーカスが入ることを smoke で確かめた。境目の当たり判定は pane の左端の 3〜4px の帯だけに重なる（上の「既存の E2E の期待を直した」の通り）。smoke は `.xterm-screen` を押し、押した後に `document.activeElement` が補助要素になることを待って確かめる形にした（`force` や `dispatchEvent` は使っていない）。

## D5: review ラウンド 1 で決めたこと
- **ダブルクリックは「動かさずに離した（クリックだった）直前の pointerdown から 350ms 以内」だけ**にした（`useResizeDrag`）。前は「前の pointerdown から 350ms 以内」だったので、素早く 2 回続けてドラッグすると 2 回目が reset になり、保存した値が消えた。動かして離した・Esc で取り消した・reset した後は、続く pointerdown を 1 回目として扱う。
- **既存の単体テストの期待を変えた（理由: 上）**: `Sidebar.test.ts` のサイドバーの幅の「ダブルクリックで既定幅へ戻す」「ダブルクリックで既定に戻したときも保存する」は、「動かしたドラッグの直後の pointerdown が reset」を前提にしていた。「動かしたドラッグ → 時間を置く → クリック → 350ms 以内にもう一度 pointerdown」に直した。E2E（実際のダブルクリック）は動かさないクリック 2 回なので変えていない。
- 区画の境目にフォーカスがある間に区画を畳むと、境目が DOM から消えてフォーカスが `body` へ落ちる（単体で確認）。畳んだ区画の見出しのボタンへ移す（既存の移す処理の隣）。
