# 検証

- 初期サーバ/許可/AgentStarter/配布テスト: 119成功。
- TaskAgentLauncher/Hostの境界: 10成功。
- Nodeパッケージ: 9成功。
- 自動依頼E2E: 1成功。偽Codexを実PTYで起動し、ブラウザ受信の出力にPJ cwdとtask.md初期指示を確認。制作UIの起動指示済み/重複ボタン無効、2端末、既存端末の変数保持を確認。
- 最終 `pnpm build` / `pnpm typecheck`: 成功。
- 全体Vitest: 557ファイル、10,401テスト成功（273.91秒）。
- 関連E2E: 5件成功。初回は既存の新規タブボタンの `.tab-bar-new` がビュー追加にも付いて2要素に一致し、既存Studioテスト2件が失敗。共有スタイルを `.tab-bar-action` へ移し、`.tab-bar-new` は新規タブだけに戻して再実行。Webビルドも成功。UI差分の独立再レビューは追加指摘なし。
- 起動確認: 作業フォルダ外 `/tmp` から smoke を実行し、実PTY・ブラウザ描画・入力往復を含めPASS。

## 配布と導入

- 配布物: `release/yukkuri-studio-0.4.0.sodaplugin`。
- SHA256: `81ce7fcf450318e24c107f195ba3645654f707e9f1096f3bcdb9b6472f558470`。
- 稼働サーバを `soda handoff` で更新。既存6ペインを全て保持したことを確認。
- `/workspaces/yukkuri-work` に0.4.0をinstall/enableし、`ext reload` 成功。PJ拡張は新しい `agent-start` 許可を含むため `pending` / 承認 `none`。ブラウザからの承認は利用者に依頼する（docs/extensions.md「承認は画面だけ」）。
- 制作台帳のskillDirと既存制作「関西のマイナーな観光地10選」IDを保持したことを確認。実エージェントへの制作依頼は行っていない。

## 負の対照

修正箇所だけ戻して対象回帰テストが失敗することを確認。finallyでbyte一致復元。

### negative-moved-pane

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/extensions/TaskAgentLauncher.test.ts (7 tests | 1 failed | 6 skipped) 16ms
   × refuses to write if the fresh pane moves during startup 15ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/TaskAgentLauncher.test.ts > refuses to write if the fresh pane moves during startup
AssertionError: promise resolved "{ paneId: 'new', kind: 'codex', …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "kind": "codex",
+   "name": "task-b18dacf61b184e248962",
+   "paneId": "new",
+   "status": "submitted",
  }

 ❯ src/extensions/TaskAgentLauncher.test.ts:44:53
     42| it("refuses to write if the fresh pane moves during startup",async()=>{
     43|  const s=await setup();s.start.mockImplementation(async(_p,accepted,o)…
     44|  await expect(s.launcher.start("u",params,s.target)).rejects.toMatchOb…
       |                                                     ^
     45| });
     46| it("rejects changing the kind of an inflight task and replaces a task …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  12:42:02
   Duration  382ms (transform 67%, import 27%, tests 5%, worker 1%)


```

### negative-retry-deadline

```text
✖ repaints an interrupted assignment when its retry deadline expires (1.547148ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 50.239161

✖ failing tests:

test at plugins/yukkuri-studio/studio.test.mjs:63:1
✖ repaints an interrupted assignment when its retry deadline expires (1.547148ms)
  AssertionError [ERR_ASSERTION]: Expected "actual" to be strictly unequal to:

  '[{"projects":[{"id":"a","assignment":{"status":"starting","paneId":null,"at":"1970-01-01T00:00:01.000Z"}}]},[],[],[]]'
      at TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/studio.test.mjs:66:9)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.start (node:internal/test_runner/test:1096:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '[{"projects":[{"id":"a","assignment":{"status":"starting","paneId":null,"at":"1970-01-01T00:00:01.000Z"}}]},[],[],[]]',
    expected: '[{"projects":[{"id":"a","assignment":{"status":"starting","paneId":null,"at":"1970-01-01T00:00:01.000Z"}}]},[],[],[]]',
    operator: 'notStrictEqual',
    diff: 'simple'
  }

```

### negative-write-guard

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/agent/AgentStarter.test.ts (41 tests | 1 failed | 40 skipped) 8ms
   × checks an optional task scope guard immediately before writing startup input 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/agent/AgentStarter.test.ts > checks an optional task scope guard immediately before writing startup input
AssertionError: promise resolved "{ paneId: 'p1', name: 'reviewer', …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "argv": [
+     "claude",
+     "--model",
+     "x y",
+   ],
+   "kind": "claude",
+   "name": "reviewer",
+   "paneId": "p1",
  }

 ❯ src/agent/AgentStarter.test.ts:370:145


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 40 skipped (41)
   Start at  12:42:03
   Duration  368ms (transform 69%, import 27%, tests 3%, worker 1%)


```
