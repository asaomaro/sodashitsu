# 検証結果

225単体テスト成功。toolsのrole/権限、1窓再利用、draft転送と旧ACK防止、無効化時破棄、録音許可/close時失効を確認。ブラウザは実際のtools.htmlで既存の標準ツール全体を操作し、別ページの会話入力欄への文面転送（非送信）、録音停止の固定表示、OCR・画面取得・プラグイン・予約編集、会話側リマインダー確認、短い会話画面の内部スクロールを確認。

Windows実機は隔離userData（認証情報・会話なし）で、実画面撮影（DPI補正済み）によりtools初回表示を確認。再利用、会話入力欄への転送とACK、toolsを閉じた後も会話が残ることを確認。実マイク/実音声認識は試していない。

## soda-tools-window-unit3.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  30 passed (30)
      Tests  225 passed (225)
   Start at  00:11:33
   Duration  3.02s (transform 50%, tests 29%, import 20%, worker 1%)

  Transform  |@sodashitsu/desktop-assistant| transforming modules took 12.96s · 50% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## soda-tools-window-final-ui.log

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools in their own window
PASS: generated settings keyboard flow, four-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS

```

## soda-tools-window-build.log

```text

> @sodashitsu/desktop-assistant@0.1.0 build:host /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> tsc -b && node scripts/build-host.mjs

assistant_internal_resources_built_no_execution

```

## soda-tools-window-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (42 tests | 1 failed | 41 skipped) 968ms
   × opens reusable tools separately, transfers drafts without sending, and revokes media on close 33ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > opens reusable tools separately, transfers drafts without sending, and revokes media on close
AssertionError: expected { revision: 3, text: '未受領の文面' } to match object { text: null }
(1 matching property omitted from actual)

- Expected
+ Received

  {
-   "text": null,
+   "text": "未受領の文面",
  }

 ❯ src/main.test.ts:1498:137
    1496|  await fixture.handlers.get("assistant:save")!(event,{enabled:true,mod…
    1497|  await fixture.handlers.get("assistant:chat")!(event);const nextChat=f…
    1498|  expect(await fixture.handlers.get("assistant:draft-state")!({sender:n…
       |                                                                                                                                         ^
    1499|  await fixture.handlers.get("assistant:save")!(event,{enabled:false});
    1500| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 41 skipped (42)
   Start at  00:14:03
   Duration  1.21s (tests 87%, transform 11%, import 2%)


```

## Windows実機

```json
{
  "inlineTools": false,
  "screenColors": 1960,
  "reused": true,
  "draftTransferred": true,
  "pendingDraft": {
    "revision": 2,
    "text": null
  },
  "chatSurvives": true
}
```

逆検証では無効化時のdraft破棄だけを戻すと旧文面復活のテストが失敗。バイト列一致で復元。
