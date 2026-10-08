# テスト結果

作業フォルダ: worktree `tui-bg`（ブランチ `feature/tui-transparent-bg`）

## 流したコマンドと結果
- `pnpm build` → 成功（エラー 0）。
- `pnpm typecheck` → 全パッケージ Done（エラー 0）。
- `pnpm test` → Test Files 467 passed (467)、Tests 9176 passed (9176)。失敗 0。
- `packages/tui` だけ: `npx vitest run` → 578 passed (578)（足したテスト 7 件を含む）。
- E2E（`packages/e2e`、Playwright）は、ブラウザ版の画面の試験で端末版（`soda` 引数なし）を使うものが無いので流していない。

## 足したテスト
- `render/theme.test.ts`: `ThemeColors`（既定は変わらない／有効で既定の背景と画面の地が 0・ほかは同じ・key が変わる）。
- `render/Renderer.test.ts`: 無効の出力にテーマの背景がある／有効の出力に `48;2;<テーマの背景>`・`--soda-bg`・`--soda-menu-bg` が現れない・プログラムの背景と強調は残る／差分の描画で、外側の端末（xterm）の背景が RGB → 既定 → RGB と戻る（描き直しなし）。
- `model/PrefsModel.test.ts`: `transparentBg` の getter（共有の設定を見ない）・`tui-state.json` の読み書き（`true` だけ採る）。
- `modes/SettingsDialog.test.ts`: 設定の項目で入切でき、共有の設定へ送らず、切替のたびに `CSI 2J` で全体を描き直す。

## 否定の対照（回帰テストが修正を外すと落ちること）
`render/color.ts` の `ground()` と `paneGround` を、透過を無視する形（`this.ui(v)`・`this.paneBg`）に戻して `npx vitest run src/render` を流した。
```
× 有効のとき、pane の既定の背景・画面の地（空き・tab バー・枠・サイドバー）は RGB で塗らない。塗る所は塗ったまま
× 差分の描画: RGB の背景 ⇄ 既定の背景で前の色が残らない（AC5）
× 既定は透かさない。有効のとき、pane の既定の背景と画面の地だけが既定の背景（0）になり、ほかは変わらない
Tests  3 failed | 59 passed (62)
```
元に戻して `cmp` で一致を確かめ、全部通ることを再確認した（生の出力は上の抜粋。失敗の詳細全文は残していない）。

## 既存のテスト
書き換えていない。設定の項目は、既存の項目の位置がずれないよう「端末版」の節の最後に足した（`t7.test.ts` の「はじめの案内を開く」・色の出し方のテストが、そのまま通る）。
