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

- [ ] T12: PR2 pane のすき間（モダンの太さの表。**独立点検あり**）と、基本画面の枠組み（サイドバー・tab バー・pane の名前の行の、高さと余白）
      依存: T11
      AC: AC3, AC5, AC6
- [ ] T13: PR3 重なる部品（ダイアログ・メニュー・設定の画面・トースト・ログイン・再接続の、高さ・余白・影）
      依存: T12
      AC: AC3, AC8, AC10
- [ ] T14: PR4 グラフ・モバイルの中の部品・文書
      依存: T13
      AC: AC3, AC11
