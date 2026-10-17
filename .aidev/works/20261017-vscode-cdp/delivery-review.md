# PR・merge前の統合差分: 独立レビュー

担当: resume_resize_design。対象worktree feature/vscode-cdpのみ読み取り、記録以外は編集しない。main/他worktree/Windows/liveへ操作していない。

## 対象

- 実装commit `c3b67a12` と、origin/main `24f2015b` の取込merge `01d1af95`。
- main側はremote-web-preview/Antigravity CLI対応。自動merge後のcomposeServer/protocol index/messagesを重点確認。
- 既存の実装全体レビューは各review記録にあり、今回はmergeによる脱落・干渉と着地時差分を確認する。

## コード確認

**追加blocking指摘なし。**

- `git diff 24f2015b..HEAD` の重点3ファイルは、CDP import/export・2つの限定RPC schema/result・Relay/launcher構築・upgrade/停止処理の追加だけ。preview/agyを置き換える変更はない。
- protocol indexはpreviewとdesktopCdpの両方をexport。METHOD_SCHEMASのPreviewMethods展開、MethodResultMap extends PreviewResults、vscode.cdp.open/sendを同時に保持し、名前衝突はない。agy enum/statusline結果等の追加も保持。
- composeServerはPreviewService構築/registerAllMethodsへのpreviews注入、通常/bridge両Gatewayのpreviews.clientGone、previews.disposeを保持。CDPは別のインスタンス/限定method登録であり、通常/bridge両Gatewayから同じsurfaceへ到達する。gateway connectionAuthorizedの機構も保持。
- agy statusline wrapper/usage adapter/intake、pane終了時forget、停止各経路のcloseを保持。CDP cleanupはそれらを置き換えず追加される。
- 01d1af95の重点3ファイルのcombined diffに競合解決の独自修正はなく、各親由来の追加が共存する。
- 未コミットの既存検証記録は `git diff --ignore-space-at-eol` で差分がなく、ログの行末空白除去だけと確認。deliver.mdは着地の新規記録。
- `git diff --check` 合格。

## 統合検証

親が同じworktreeでroot build/typecheck/full Vitestを実行中。後続のCDP関連5 E2E・remote web preview E2E・smokeの結果も合わせて最終判定する。現時点でcode review上は通過相当。実機への追加操作は行っていない。

## 統合検証の独立確認

ログを読み、次を確認した。

- root build再実行 `/tmp/vscode-cdp-pr-build-retry.log`: 各package Done。root typecheck再実行 `/tmp/vscode-cdp-pr-typecheck-retry.log`: 各package Done。
- 全Vitest `/tmp/vscode-cdp-pr-all-tests-retry.log`: **681ファイル・11013テスト合格、2ファイル・2テスト失敗**。全件合格とは扱わない。
- agent.test.tsの1000期待/実際300は、origin/mainをarchiveして作った隔離baselineでも同じ失敗（`/tmp/vscode-cdp-pr-baseline-tests.log`）。branch単独再実行も同じ（`/tmp/vscode-cdp-pr-focused-retry.log`）。今回変更していない既存の期待/実装の不一致と判断できる。
- GraphViewの1件は全体時5000ms timeout、main baseline/branchの単独実行ではともに通過。対象ファイルは本変更で編集していない。全体同時実行時だけの非再現timeoutとして記録し、「mainでも再現する既存失敗」とは断定しない。負荷影響という説明は推測に留める。単独2ファイルの結果は両方とも105合格・agentの1件だけ失敗。
- 作業フォルダ外からのsmoke `/tmp/vscode-cdp-pr-smoke.log`: **PASS**。
- コードの追加変更はなく、`git diff --check`合格。CDP関連5件＋remote web previewの計6 E2Eの最終結果を待つ。

## 最終判定: 通過

`/tmp/vscode-cdp-pr-e2e.log` を独立に読み、CDP関連5件＋remote web previewの **6件合格57.3s** を確認した。smokeもPASS。統合後コードにblocking指摘なし。

root build/typecheckの合格、全Vitestの11013合格と既存agent不一致/非再現GraphView timeout、隔離main baseline・branch単独での切り分けをPRへ明記する条件で着地可能。未完了試験を合格として隠さず、本変更で未編集の既存不一致を修正するためにscopeを拡大する必要はない。最後の `git diff --check` 合格。
