# 検証

ビルド・型検査を通過。隔離したプロセス・state-dirで実行。既存コンテナは変更しない。

## soda-resource-unit-final.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  2 passed (2)
      Tests  6 passed (6)
   Start at  20:28:35
   Duration  2.20s (tests 93%, transform 4%, import 3%)


```

## soda-resource-e2e-dedup.log

```text

Running 1 test using 1 worker

(node:2780572) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-11-01T11:26:57.656Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-11-01T11:26:57.657Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-11-01T11:26:57.657Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-11-01T11:26:57.660Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-sId5JQ/commands.json","count":0}
  ✓  1 src/specs/resource-monitor.spec.ts:3:1 › opens the resource monitor from Other, observes live processes, filters and pauses (5.6s)

  1 passed (6.9s)

```

## 実機反映

2026-11-01: サーバhandoffで実PTY5件を保持、snapshotの7 pane IDを照合。アシスタントphase=running。既存characterId=plugin:yukkuri-work/kiritan、idleFloating=true、voiceProvider=coreを維持。Windowsアプリ4プロセスの報告を実サーバで確認。元voicevoxコンテナは稼働継続。隔離比較コンテナ/ワーカーは停止済み。

### soda-resource-final-tests.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  3 passed (3)
      Tests  7 passed (7)
   Start at  20:32:15
   Duration  2.23s (tests 88%, transform 6%, import 5%)


```

### soda-resource-e2e-uuid.log

```text

Running 1 test using 1 worker

(node:2790394) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-11-01T11:32:19.674Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-11-01T11:32:19.675Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-11-01T11:32:19.675Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-11-01T11:32:19.677Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-GuBvlg/commands.json","count":0}
  ✓  1 src/specs/resource-monitor.spec.ts:3:1 › opens the resource monitor from Other, observes live processes, filters and pauses (5.6s)

  1 passed (7.0s)

```

### soda-resource-live-final.log

```text
Existing panes retained: 7
{"sample":0,"processCount":20,"appProcessCount":0,"appPlatforms":[],"warnings":[]}
{"sample":1,"processCount":24,"appProcessCount":4,"appPlatforms":["win32"],"warnings":[]}

```

### soda-final-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/protocol| src/resourceMonitor.test.ts (1 test | 1 failed) 6ms
   × accepts the persisted UUID device identity used by the native assistant 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/resourceMonitor.test.ts > accepts the persisted UUID device identity used by the native assistant
ZodError: [
  {
    "origin": "string",
    "code": "invalid_format",
    "format": "regex",
    "pattern": "/^[a-f0-9]{32}$/",
    "path": [
      "deviceId"
    ],
    "message": "Invalid string: must match pattern /^[a-f0-9]{32}$/"
  }
]
 ❯ src/resourceMonitor.test.ts:5:33
      3| it("accepts the persisted UUID device identity used by the native assi…
      4|  const report={deviceId:"eb2ccde0-1383-4842-97ba-1227fd099ee2",platfor…
      5|  expect(ResourceAppReportParams.parse(report)).toMatchObject({deviceId…
       |                                 ^
      6|  expect(ResourceAppReportParams.safeParse({...report,deviceId:"a".repe…
      7| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  20:32:14
   Duration  175ms (import 53%, transform 37%, tests 7%, worker 3%)

F
======================================================================
FAIL: test_imported_dictionary_metadata_survives_export (__main__.CompatibilityTests.test_imported_dictionary_metadata_survives_export)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-main-live-assistant-agents/scripts/voice-core/test_worker.py", line 34, in test_imported_dictionary_metadata_survives_export
    self.assertEqual(exported['accent_associative_rule'],'C1')
AssertionError: '*' != 'C1'
- *
+ C1


----------------------------------------------------------------------
Ran 1 test in 0.009s

FAILED (failures=1)

```

## 起動確認

```text
smoke: starting server on 127.0.0.1:44941 (state dir /tmp/soda-smoke-n9oDLs)
{"ts":"2026-11-01T11:29:51.266Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-11-01T11:29:51.267Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-11-01T11:29:51.267Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-11-01T11:29:51.271Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-smoke-n9oDLs/commands.json","count":1}
smoke: agent manifests ok (23/23)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane aa3fefb9-56df-47ba-b87f-f5eebdfce17b)
smoke: pane.subscribe ok
smoke: echo round trip ok
{"ts":"2026-11-01T11:29:52.102Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"b1f58a20-af8d-4a59-aa17-6aa79d1bba5e","paneId":"aa3fefb9-56df-47ba-b87f-f5eebdfce17b"}
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke(web): typed into pane aa3fefb9-56df-47ba-b87f-f5eebdfce17b
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS

```
