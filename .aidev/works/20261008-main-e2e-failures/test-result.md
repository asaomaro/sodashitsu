# テスト結果: main e2e failures（2026-10-08）

## 直す前で落ちることの確かめ（回帰テストの負の対照）
### A1 CSP（`HttpServer.ts` を直す前に、足した E2E `csp-wasm-images.spec.ts` を流した）
```
1) csp-wasm-images.spec.ts:48 ページを開いても WebAssembly の例外（CSP 違反）が出ない
   - Expected  - 1 / + Received  + 3
   +   "CompileError: WebAssembly.instantiate(): Compiling or instantiating WebAssembly module violates the following Content Security policy directive because 'unsafe-eval' is not an allowed source ...
2) :56 Sixel を端末に出すと、画像の層ができる     Error: Sixel の画像の層ができる   Expected: 1  Received: 0
3) :64 iTerm2 形式（OSC 1337）の画像を出すと、画像の層ができる   Expected: 1  Received: 0
4) :72 Kitty graphics（直接転送の PNG）…              Expected: 1  Received: 0
5) eval の検査（最初の版は page.evaluate が CDP 経由で CSP を受けず「許された」と出た → 同じ origin の script として動かす形に直した。直した版の直す前の結果）
   Error: WebAssembly の組み立ては許される   Expected: "許された"  Received: "CompileError"   （eval・new Function は直す前も EvalError で拒まれる）
```
直した後: 5 件すべて通過。

### A2 消す（`PrefsSync.ts`・`PrefsStore.ts` を元に戻して、ビルドし直してから流した）
```
  1) src/specs/prefs-reset-sync.spec.ts:42:1 › キーの割り当てを「すべて既定に戻す」と、サーバの共有の設定から keys が消え、再読み込みしても戻らない 
    Error: サーバの keys が消える
    Expected value: not "keys"
    Received array:     ["keys"]
  2) src/specs/prefs-reset-sync.spec.ts:64:1 › テーマの色の上書きを「すべて既定に戻す」と、サーバの共有の設定から themeOverrides が消え、別のブラウザにも
    Error: サーバの themeOverrides が消える
    Expected value: not "themeOverrides"
    Received array:     ["themeOverrides"]
  3) src/specs/theme-settings.spec.ts:528:1 › すべての上書きを既定に戻す：確認を挟み、戻すとすべて消え、再読み込みしても既定のまま（AC7） ─────�
    Error: 再読み込みしても既定の値のまま
    Expected: "#6070a1"
    Received: "#222222"
    Error: expect(locator).toHaveValue(expected) failed
    Expected: ""
    Received: "#222222"
  3 failed
```
単体（直す前）: `PrefsSync.test.ts` 3 件（キーが落ちる・`undefined`）・`PrefsStore.test.ts` 1 件（null で消えない）が落ちた。
直した後: すべて通過。元に戻した後のファイルは `cmp` で一致を確認した。

## 全体
- `pnpm build`: 通過。`pnpm typecheck`: 通過。
- `pnpm test`: 458 ファイル・9006 件すべて通過。
- E2E（`--workers=1`）: 対象の 6 つの spec（`settings.spec`・`appearance-settings`・`theme-settings`・`key-bindings`・`workspace-tab-pane`・`mobile.spec`）と、足した 2 つ（`csp-wasm-images`・`prefs-reset-sync`）で **85 件通過・失敗 0**。
- CSP に関わる既存の E2E（`ask*` 9 ファイル・`display*` 全部）: **280 件通過・1 件スキップ（Chart.js の UMD を渡したときだけ動く `display-script.spec`。環境変数が無いため）・失敗 0**。
- `tui.integration.test.ts`: 作業フォルダ名が 47 文字の worktree で 3 回とも 5 件通過。直す前のテストを同じ場所で流すと 1 件落ちた。
- `HttpServer.ts` の差分は、アプリ本体の CSP の 1 行（`script-src 'self' 'wasm-unsafe-eval'` を足した）とコメントだけ。`/ask-view/*`・`/display-view/*` の CSP は変えていない（`HttpServer.integration.test.ts` の該当の検査が変わらず通る）。
