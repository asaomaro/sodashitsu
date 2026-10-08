# レビュー: main で落ちていた E2E と、製品の不具合 2 件の修正

調査・実装とは別のエージェント（sodactl で別の pane に起動した Claude Code〔Sonnet〕）が、読むだけの独立レビューを掛けた。

## 経緯

各 PR の実装とレビューが「main でも落ちるので退行ではない」と切り分けてきた E2E の失敗について、main の失敗そのものが先の PR の退行でないかを、だれも確かめていなかった。調べた結果、**#93〜#100 で落ち始めたものは 1 件も無く**、それ以前（2026-09-23〜09-28）からの失敗だった。12 件のうち 2 件が製品の不具合、ほかはテストが古い・環境に依る、だった。

## 1 回目（origin/main...acda271）

must 0・should 2・nit 4。判断は「直してから（軽い直し）」。**製品の修正（A1・A2）に、直すべき点は無し。**

- **A1（アプリ本体の CSP に `script-src 'self' 'wasm-unsafe-eval'`）**: レビューの側が、実ブラウザで 11 通り（`eval`・`new Function`・`setTimeout("文字列")`・インラインの `<script>`・`data:`/`blob:`/外の origin のスクリプト・`javascript:` の URL・インラインのイベント属性・`blob:`/`data:` のワーカー）を試し、すべて拒まれることを確かめた。以前より緩んだのは WebAssembly の組み立てだけ。`/ask-view/*`・`/display-view/*` の CSP は変わっていない。アプリ本体で WebAssembly を使うのは `@xterm/addon-image` の Sixel の復号の 1 か所で、組み立てるのは addon に埋め込まれた固定のバイト列（利用者の制御しない入力から組み立てる経路は無い）。画素は、スクリーンショットの赤の画素を数える方法で、描かれていることを確かめた。
- **A2（`undefined` → `null` で送り、サーバが最上位の `null` を消す）**: `null` を値として持つ共有の項目は `themeLight`・`themeDark` だけで、読み込みは `null` も欠けた値も同じ既定に落とすので、意味は変わらない。入れ子の中の `null` には触らない。`displayScriptEnabled` が意図せず有効になる経路は無い（`=== true` のときだけ有効）。

| 重さ | 指摘 | 対応 |
|---|---|---|
| should | `key-bindings.spec` の Tab の上限 400 は、届くまでの回数が増える退行（いま 66 回）を見逃す | 直した（上限を実際の回数に近い値に。main の取り込みの後は 67 回・上限 75） |
| should | docs の更新漏れ（`docs/herdr-parity.md` の H13「実物のブラウザでの描画は未検証」） | 直した（81eb8d9。CSP の記述も `docs/sodactl.md` に） |
| nit | 画像の E2E が、画像の層の有無までしか見ていない | 直した（Sixel を帯 5 本にして、赤の画素の数も判定に） |
| nit | 初回の移行で、ほかの画面で既定へ戻した値が戻りうる限界 | docs に記載 |
| nit | `settings.spec` の共有の項目の壊れた値のテストは、「検証が効く」と「サーバが勝つ」を区別できない／`theme-settings:392` は、作業フォルダのパスが長い環境で落ちる | 直さない（記録） |

1 回目の後の修正（Tab の上限・docs・画素の確かめ）と、main の取り込み（#101・#102。衝突なし）の後の直し（`key-bindings.spec` のモバイルの節の一覧に、#102 で足された節「拡張」が入っていなかった）は、テストと文書だけの差分で、監督のセッションが結果と差分を確かめた（別のエージェントの再レビューは掛けていない）。

## 確かめたこと（main の取り込みの後。a37af1c）

- `pnpm build`・`pnpm typecheck`: 通過
- **`pnpm test`: 467 ファイル・9168 件、失敗 0**（前から落ちていた `tui.integration.test.ts` の 3 件も通る）
- E2E（`--workers=1`）: 対象の 6 つの spec と `csp-wasm-images`・`prefs-reset-sync`・`settings-menu`・`extensions-settings`・`display-layout-state` の 139 件、失敗 0（1 回目に落ちた `key-bindings` の 1 件を直した後）
- `aidev smoke`（監督のセッション）: pass

## 別の不具合・課題の候補（直していない）

- 高さが 1 行以下の小さな Sixel は、画像の層はできるのに、画素が見えない
- キーの設定の節で、衝突の「こちらへ移す」まで、Tab で 67 回かかる
- `theme-settings:392` ほか、プロンプトの折り返しに左右される待ち方の E2E が残っているかもしれない
