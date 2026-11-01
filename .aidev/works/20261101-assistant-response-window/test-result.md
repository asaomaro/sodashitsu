# デスクトップアシスタントの応答先選択・検証

## 対応内容

通知に「小窓で応答」「操舵室で開く」を追加。小窓は元の端末だけを表示し、質問通知は指定された既存のaskフォームを表示する。通常の操舵室は管理中のElectron窓を再利用して前面化し、対象選択後は通常の画面操作へ戻る。回答済みの質問から別の質問へ自動で切り替えない。対象の確認をDOMイベント時と最終の端末入力送信時に行う。

システムブラウザの既存タブ探索・OS前面化は対象外。独自UIはsodactl askの既存フォームが対象。新しいエージェントは起動しない。

## 検証

- pnpm build: pass。その後のWeb変更についてweb buildもpass。
- pnpm typecheck: pass（最終差分）。
- 関連単体: 5ファイル・50件pass。
- 既存の生成UI verify-ui: pass。通知の両ボタン、入力、短い画面、ツール開閉を含む。
- 新規ブラウザE2E: 4件pass。既存端末への送受信、通常UIでの操作継続、指定フォームと別画面への回答共有・質問終了後の固定、古い小窓からの通常UIへの復帰、非同期clipboard完了時の入力防止。
- 端末の文字とフォームのスクリーンショットを目視確認。端末は受信と2フレームの描画完了後に撮影。
- 独立レビュー: 最終ソケット送信の検証と通常UIへの復帰URLに指摘あり、修正後に再レビュー承認。

全体テストの結果（生の出力）:

```text
 Test Files  1 failed | 932 passed | 1 skipped (934)
      Tests  1 failed | 13461 passed | 1 skipped (13463)
   Start at  12:06:08
   Duration  364.95s (tests 82%, import 10%, transform 4%, environment 4%)

Environment  |@sodashitsu/web| happy-dom was created 243 times · 51.62s total, 27% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments

```

上記の1件はWsGatewayのPTY往復・終了のタイムアウト。変更なしで同ファイルを単独再実行し19件すべてpass（/tmp/assistant-response-ws-recheck.log）。全体の二重実行はしていない。

この環境のChromium revision1243は、アプリ無しでもタイマーが動く一方requestAnimationFrameが0回で止まることを独立に確認した。導入済みのrevision1223は500msで33フレーム進むため、一時的なローカルPlaywright configでその実行ファイルを指定して検証した。リポジトリの実行設定やブラウザの版は変更していない。

## 送信前確認の無効化対照

最終送信の対象確認canInputを無条件trueにした状態で、対象違いと遅延した送信の検証が失敗することを確認。修正済みファイルをbyte-for-byteで復元後、関連50件を再実行しpass。

生の出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts (5 tests | 2 failed | 3 skipped) 17ms
   × blocks before connection, re-reads replaced maps and synchronously fences stale input 13ms
   × rejects a delayed terminal write after its agent changes, even before another DOM event 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts > blocks before connection, re-reads replaced maps and synchronously fences stale input
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/actions/assistantPanelGuard.test.ts:48:43
     46|   expect((document.getElementById("app") as HTMLElement).inert).toBe(f…
     47|   expect(update.canInput(p)).toBe(true);
     48|   expect(update.canInput("foreign-pane")).toBe(false);
       |                                           ^
     49|   model.workspaces.get(w)!.projectDir = "/replaced";
     50|   expect(update.canInput(p)).toBe(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts > rejects a delayed terminal write after its agent changes, even before another DOM event
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "late clipboard result",
    ]


Number of calls: 1

 ❯ src/actions/assistantPanelGuard.test.ts:163:20
    161|   pane.agent={...pane.agent!,instanceId:w};
    162|   await delayed;
    163|   expect(send).not.toHaveBeenCalled();
       |                    ^
    164|   update.dispose();
    165| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 3 skipped (5)
   Start at  12:16:10
   Duration  903ms (transform 61%, environment 20%, import 16%, tests 2%)

```

ログ: /tmp/assistant-response-build.log、/tmp/assistant-response-final-typecheck.log、/tmp/assistant-response-final-focused.log、/tmp/assistant-response-ui.log、/tmp/assistant-response-browser-pass.log。

## 実行中の版への反映

2026-11-01、アシスタントの無効化→停止確認→有効化で再起動。assistant.settings.getがenabled:true、phase:runningであることを確認。Windows側のapp-e8ce4f6a48aed75373c42740723c6a6f2dd9971102524e0e59504c17fe3d8907のbubble.html/bubble.js/style.cssが修正済みソースと一致し、main.mjsもビルド済み素材と一致。実行中SodaのHTMLが最終Webビルドの/assets/index-CI-bzdiu.jsを配信していることを確認。実Windowsでの各通知ボタンの操作往復は未実施。
