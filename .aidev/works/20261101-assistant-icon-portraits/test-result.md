# 検証

ビルド・型検査を通過。隔離したプロセス・state-dirで実行。既存コンテナは変更しない。

## soda-captain-unit-final.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  28 passed (28)
      Tests  209 passed (209)
   Start at  20:22:30
   Duration  3.20s (transform 55%, tests 26%, import 18%, worker 1%)

  Transform  |@sodashitsu/desktop-assistant| transforming modules took 15.14s · 55% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## soda-captain-ui-final.log

```text
PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, four-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS

```

## soda-anchor-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (33 tests | 1 failed | 32 skipped) 971ms
   × keeps the framed portrait anchor while saving preferences at a manual position 21ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > keeps the framed portrait anchor while saving preferences at a manual position
AssertionError: expected { width: 400, height: 640, …(2) } to deeply equal { width: 400, height: 640, …(2) }

- Expected
+ Received

  {
    "height": 640,
    "width": 400,
-   "x": 661,
+   "x": 792,
    "y": 162,
  }

 ❯ src/main.test.ts:1410:49


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 32 skipped (33)
   Start at  20:24:56
   Duration  1.19s (tests 89%, transform 9%, import 2%)


```

## 実機反映

2026-11-01: サーバhandoffで実PTY5件を保持、snapshotの7 pane IDを照合。アシスタントphase=running。既存characterId=plugin:yukkuri-work/kiritan、idleFloating=true、voiceProvider=coreを維持。Windowsアプリ4プロセスの報告を実サーバで確認。元voicevoxコンテナは稼働継続。隔離比較コンテナ/ワーカーは停止済み。

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
