# 未コミット変更の統合

ユーザーからローカルmain最新化、続いて既存未コミット変更のPR/mergeを指示された。mainを3cd00d39（#173）へfast-forwardし、保存していた変更を復元。script.htmlのfeatures宣言のみ競合したため、desktop-cdp部品と既存terminal、viewportMaximizeの双方を保持して解消。

対象は、指示本文とEnterの待ちを1000msにする変更、script-htmlの外部リンク中継・ブラウザ内最大化/復帰、LoginView selectの高さ揃え、テスト・文書。ユーザー状態の.claude/.sodaは対象外。

- build/typecheck成功。
- 関連7ファイル227件成功。旧DisplayFrame初期メッセージの完全一致期待をfeatures追加に合わせて更新。
- 実ブラウザでPopover幅・同じiframe/入力の保持・復帰・別タブ/opener=null・sandbox維持を確認。
- 独立レビューで全差分・競合解消・追加E2Eを確認、阻害事項なし。
- 外部接続画面の変更と併せた最新mainの全体検証を別worktreeで実施し、重複実行を避ける。

元ファイル・patch・stash IDは ~/.local/state/sodashitsu/dev-backups/main-update-20261017-224919 に保存。作業前のstashを保持。

## 負の対照

agentInput.tsの待機定数だけ300msに戻して既存テストを実行し、失敗を確認。その後元のbytesとSHA-256へ復元した。TS直接実行。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/agent/agentInput.test.ts (103 tests | 1 failed | 101 skipped) 13ms
   ❯ pastePayload（herdr の encode_api_text） (3)
     × 貼り付け処理の完了を待つため、Enter まで1000ms空ける 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/agent/agentInput.test.ts > pastePayload（herdr の encode_api_text） > 貼り付け処理の完了を待つため、Enter まで1000ms空ける
AssertionError: expected 300 to be 1000 // Object.is equality

- Expected
+ Received

- 1000
+ 300

 ❯ src/agent/agentInput.test.ts:33:42
     31|
     32|   it("貼り付け処理の完了を待つため、Enter まで1000ms空ける", () => {
     33|     expect(AGENT_PROMPT_SUBMIT_DELAY_MS).toBe(1000);
       |                                          ^
     34|   });
     35| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 101 skipped (103)
   Start at  22:55:41
   Duration  199ms (transform 48%, import 28%, tests 17%, worker 6%)
```
