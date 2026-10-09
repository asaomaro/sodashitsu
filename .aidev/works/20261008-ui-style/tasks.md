# タスク: 画面の様式（クラシック／モダン）の切り替え

`design.md`（**末尾の追補 01 が優先**）の PR の分け方に従う。この文書は、**PR1a・PR1b・PR1c** のタスクを詳しく書く。PR2 以降は、着地の後に足す。

- ★ = タスクごとの独立点検（`aidev taskcheck`）を掛ける。
- **どの PR でも、クラシックの画面は、画素まで変わらない**（PR1a で作る道具で、差 0 を確かめる）。

## PR1a: 比べる道具（製品のコードは変えない）

- [x] T1: 画面を撮る E2E `packages/e2e/src/specs/ui-style-shots.spec.ts`。環境変数 `UI_STYLE_SHOTS_DIR` を渡したときだけ動く（ふだんの E2E では飛ばす）。撮る画面（暗い・明るいテーマ）: 基本画面（pane 2 つ・tab 2 つ・サイドバーにグループ）・設定のダイアログの各節・右クリックのメニュー・確認のダイアログ・ヘルプ・グラフの画面・表示の面（パネル〔4 つの側〕と帯）・ログインの画面・モバイルの 1 列の画面。撮るときの決まり（design 追補 01 D12）: トーストが消えるのを待つ・端末（`.xterm`）は `mask` で隠す・`animations: "disabled"`・`caret: "hide"`・`document.fonts.ready` と `client.view` の落ち着きを待つ。様式を選べる（`UI_STYLE=classic|modern`。PR1a の時点では、`modern` は設定が無いので classic と同じ）。
      依存: なし
      AC: AC2
- [x] T2: 比べるスクリプト `scripts/ui-style-compare.mjs`。引数は、比べる元のコミット（既定 `origin/main`）。元のコミットを `git worktree` で一時の場所に出し、`pnpm install --frozen-lockfile`・`pnpm build` して T1 を流す → いまの作業フォルダで T1 を流す → 画像を 1 枚ずつ、画素で比べる（`pngjs`・`pixelmatch` が E2E の依存にあれば使う。無ければ、Playwright の比較の関数）。差のある画像の名前・差の画素の数・差の画像の場所を出し、1 枚でも差があれば終了コード 1。一時の worktree は、最後に片づける。**同じコミットどうし（`HEAD` と `HEAD`）で、全部の画像が差 0 になること**を確かめ、結果に書く。差が出る画面があれば、撮り方を直す（隠す・待つ）。
      依存: T1
      AC: AC2
- [x] T3: 道具の使い方を `docs/verification.md` に書く（何を比べるか・同じ機械の上の前後の比較であること・時間）。
      依存: T2
      AC: AC11

## PR1b: 設定と当て方（どの部品も、まだトークンを読まない）

- [x] T4: 設定の型と保存（**独立点検あり**）。共有の設定に `uiStyle: "classic" | "modern"`（protocol の設定の型・`client-core` の `prefs` の読み込みと既定〔無い・読めない値は `classic`〕・`PrefsStore`・`PrefsSync`・`store/settings.ts` の `uiStyle` と `setUiStyle`）。値は、いつも書く（消さない）。端末版は、この項目を読まず、設定の画面にも出さないが、**`prefs.changed` で届いた `uiStyle` を、知らない項目として保ち、端末版が設定を書いても消えない**ことを、テストで確かめる。
      依存: なし
      AC: AC1, AC7
- [x] T5: 起動のときの当て方（**独立点検あり**）。`public/theme-boot.js` が、起動用の控え（`soda.themeBoot.v1`）から `data-ui-style` を当てる。控えの型（`BootCache`）・`ThemeController.writeBoot`・書く条件に `uiStyle` を足す。`themeBoot.test.ts` を合わせる。動いている間の切り替えは、`ThemeController`（か、その隣の 1 か所）が `document.documentElement.dataset.uiStyle` を書く。**属性が無い・控えが無い・壊れている、のときは、クラシック。** 再読み込みのとき、前の様式が一瞬見えないことを、E2E で確かめる（最初の描画の時点で、属性が当たっている）。
      依存: T4
      AC: AC1, AC7
- [x] T6: `packages/web/src/styles/uiStyle.css`。角のトークン 3 つ（`--soda-shape-radius-s`・`--soda-shape-radius`・`--soda-shape-radius-l`）を、`:root` にクラシックの値（3px・4px・6px）、`:root[data-ui-style="modern"]` にモダンの値（6px・8px・12px。仮置き）で定義する。`main.ts` で読み込む。**この PR では、どの部品も、まだ読まない。** テスト: このファイルに、色の値（`#`・`rgb(`・`rgba(`・色の名前）と、守りの部品のクラス名が、出ない。
      依存: なし
      AC: AC3, AC4
- [x] T7: 設定の画面。節「表示」の、pane の枠の項目の近くに、ラジオ「画面の様式」（クラシック／モダン）。選ぶと、再読み込みなしで `data-ui-style` が変わる。ほかの画面（同じ利用者の別のブラウザ）にも反映される（E2E。`theme-settings.spec.ts` と同じ形）。モバイルの設定の節の一覧のテスト（`key-bindings.spec.ts`）に影響が無いか。
      依存: T4, T5
      AC: AC1, AC7
- [x] T8: PR1b の確かめ。PR1a の道具で、`origin/main` との差が 0（クラシック）。モダンを選んでも、まだ差が 0（どの部品も読まないので）。`pnpm build`・`typecheck`・`pnpm test`。
      依存: T5, T6, T7
      AC: AC2, AC9

## PR1c: 角の置き換え

- [x] T9: 置き換える行の一覧を作る（`decisions.md` に表で残す）。`border-radius` の全部の行（約 94）を、「`4px` → `--soda-shape-radius`」「`3px` → `-s`」「`6px` → `-l`」「置き換えない（`2px`・`999px`・`50%`・片側だけの丸・`em`・`9px`・`7px`・`10px`・守りのファイルの中）」に仕分ける。片側だけの丸（`4px 4px 0 0` など）は、`var(--soda-shape-radius) var(--soda-shape-radius) 0 0` にしてよいか、1 つずつ決める。
      依存: T8
      AC: AC3
- [x] T10: 置き換える（機械的）。守りのファイル（`DisplayFrame.vue`・`DisplayScriptMark.vue`・`focusDrop.ts` ほか・`packages/web/public/display-view/*`・`MobileShell.vue`）と、`third_party/` は、変えない。
      依存: T9
      AC: AC3
- [x] T11: PR1c の確かめ。PR1a の道具で、`origin/main` との差が 0（クラシック）。モダンで全画面を撮り、角だけが変わっていることを、目で見る（撮った画像の場所を、結果に書く。**利用者に見せる絵になる**）。モダンで、基本の経路の E2E（分割・tab・設定・表示の面）と、PR3 のフォーカスの E2E 3 本（1 本ずつ単独）を流す（design 追補 01 D13）。固定の部品（印「スクリプト」ほか）が、モダンでも切れない。`pnpm test`。
      依存: T10
      AC: AC2, AC3, AC5

## PR2 以降（骨子。着地の後に、詳しく足す）

- [ ] T12: PR2 pane のすき間と、基本画面の枠組み（下の T12a〜T12e に分ける。この行は、まとめ）
      依存: T11
      AC: AC3, AC5, AC6

### PR2: pane のすき間と、基本画面の枠組み（詳しいタスク）

設計は `design.md` 追補 01（D7・D11・D13）。**クラシックは、画素まで変わらない**（比べる道具で、差 0）。モダンの数値は仮置きで、この PR の絵を利用者に見せて決める——**数値は、`uiStyle.css` の 1 か所と、太さの表の 1 か所に集め、後から変えやすくする**。

- [ ] T12a: pane のすき間（**独立点検あり**）。`App.vue` が `paneFrameThickness`（thin・default・thick）から `--soda-pane-gap` を配る所で、様式ごとの値の表を引く（クラシック: 今の値のまま。モダン: thin 4・default 8・thick 12 px。仮置き）。表は 1 か所（`paneFrame` の定数の隣）。**いまある 4 つの設定（`paneBorders`・`paneGaps`・`paneFrameThickness`・`paneOuterBorders`）は、モダンでも、今と同じ意味で効く**（すべての組み合わせを、単体テストで）。モバイルの 1 列の画面は、pane の枠が無いので、変わらない。様式を切り替えたとき、端末の桁と行は、すき間の分だけ変わってよいが、`client.view` は、pane ごとに 1 回で落ち着く（E2E で、切り替えの後に送られた回数と、最後の桁・行が、箱の大きさと合うことを確かめる）。分割の比率は変わらない。分割の境目のつかめる幅・pane の D&D の落とせる場所・表示の面（4 つの側・帯・浮いた窓があれば）の割り付けが、モダンのすき間でも壊れない。
      依存: なし
      AC: AC3, AC5, AC6
- [ ] T12b: モダンの pane の枠。フォーカスのある pane が、枠の色で分かる（色は今の変数）。pane の角を丸くする（`-l` のトークン。端末の中身が、角からはみ出さない——端末の入れ物を切るときは、**端末の文字の升目の大きさを変えない**・表示の面の枠〔守りのファイル〕を切らない）。クラシックでは、何も変わらない（規則は `:root[data-ui-style="modern"]` か、変数のフォールバック）。
      依存: T12a
      AC: AC3, AC5
- [ ] T12c: サイドバー・tab バー・pane の名前の行の、高さと余白。トークン（`--soda-shape-row-h`・`--soda-shape-control-h`・`--soda-shape-pad-x`。クラシックでは**定義しない**）を足し、部品の側を `min-height: var(--soda-shape-row-h, <今の値>)`・`padding-inline: var(--soda-shape-pad-x, <今の値>)` の形に直す（D11。外から部品のクラスを選ぶ規則は、最小に）。モダン: 行 36px・押せる部品 32px 以上・左右の余白 12px（仮置き）。対象: サイドバーの行（workspace・エージェント・グループの見出し・区画の見出し・下のボタン）・画面の切り替えの部品・tab バーの tab と「＋」・pane の名前の行・表示の面の見出し（`DisplayPanelHead`。守りのファイルではない）と帯の行。**高さが変わると、tab バー・名前の行の分、端末の行が減る**（T12a と同じ確かめ）。サイドバーの幅の記憶・たたんだサイドバー・tab があふれたときのスクロール・tab の D&D・サイドバーの D&D が、壊れない。固定の部品（印「スクリプト」ほか）が、切れない。
      依存: T12a
      AC: AC3, AC5
- [ ] T12d: E2E と比較。比べる道具で、クラシック 32/32 差 0（揺れを除く）。モダンで撮った全画面と、クラシックと並べた画像（基本画面〔分割あり・tab 複数・サイドバーにグループ〕・表示の面・グラフ・設定）を作り、置き場所を結果に書く（**利用者が、数値を決めるための絵**。太さの 3 段〔thin・default・thick〕も並べる）。モダンで流す E2E（`UI_STYLE_E2E=modern`）: 基本の経路（分割・tab・設定・表示の面）・tab の D&D・pane の D&D・分割の境目・PR3 のフォーカスの 3 本（単独）。様式の切り替えの E2E（T12a の `client.view`）。
      依存: T12b, T12c
      AC: AC2, AC5, AC6
- [ ] T12e: 文書（`docs/` の、設定の説明に「画面の様式」。クラシックとモダンの違い・いまの段階で変わる所・対象外〔端末版・端末の中身・表示の面の枠の中・モバイルの骨組み〕）。`pnpm build`・`typecheck`・`pnpm test`。
      依存: T12d
      AC: AC11
- [ ] T13: PR3 重なる部品（ダイアログ・メニュー・設定の画面・トースト・ログイン・再接続の、高さ・余白・影）
      依存: T12
      AC: AC3, AC8, AC10
- [ ] T14: PR4 グラフ・モバイルの中の部品・文書
      依存: T13
      AC: AC3, AC11
