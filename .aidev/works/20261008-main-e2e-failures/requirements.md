# 要件: main で落ちている既存の E2E の原因（製品の不具合 2 件と、古い E2E）を直す

## 背景 / 課題
調査（`.claude/briefs/main-e2e-bisect-result.md`。コミットしない）で、main と `d40298a` の両方で同じ 12 件の E2E が落ちることが分かった。原因は、製品の不具合 2 件と、テストの前提が古いものだった。

## 範囲
### A. 製品の不具合
- A1: アプリ本体の CSP（`packages/server/src/http/HttpServer.ts`）が WebAssembly の組み立てを拒む。`@xterm/addon-image` の Sixel の復号が動かず、ページを開くたびに `CompileError: WebAssembly.instantiate()` の例外が出る。
- A2: テーマの色の上書きを「既定に戻す」と、サーバの共有の設定に削除が伝わらず、再読み込みで戻る（`writePrefs({ key: undefined })` が JSON 化でキーごと落ちる）。同じ形の箇所は洗い出して、同じ直しで直す。
### B. 古い E2E・単体テスト（製品は正しい。検査は弱めず、いまの仕様の期待に書き直す）
`settings.spec`（:167・:187）・`theme-settings.spec`（:193・:271・:354）・`appearance-settings.spec:113`・`key-bindings.spec:632`・`mobile.spec:203`・`workspace-tab-pane.spec:305`・`packages/server/src/tui.integration.test.ts`（3 件）。
### 対象外
ほかの不具合の修正（見つけたら報告のみ）。push・PR・マージ。

## 受け入れ基準
- AC1: アプリのページを開いても WebAssembly の pageerror が出ない。Sixel を端末に出すと `xterm-image-layer` の canvas ができる。
- AC2: アプリのページで `eval`・`new Function` は引き続き CSP で拒まれる（`'unsafe-eval'` を足していない）。
- AC3: 別の経路（`/ask-view/*`・`/display-view/*`）の CSP は変わらない。
- AC4: iTerm2 形式・Kitty graphics の画像が出るかを確かめ、出ないなら原因を報告する。
- AC5: 上書きを入れて「すべて既定に戻す」→ サーバの `prefs.get` にそのキーが無い → 再読み込み・別の画面でも戻らない。
- AC6: ほかの設定にも同じ形があれば、同じ直しで直る。
- AC7: 回帰テスト（AC1・AC5）は、直す前に落ちることを確かめる。
- AC8: 対象の 6 つの spec が失敗 0 件。`tui.integration.test.ts` は長い・短い作業フォルダ名のどちらでも通る。
- AC9: `pnpm build`・`typecheck`・`test` と、CSP に関わる既存の E2E（ask・display）が退行しない。
