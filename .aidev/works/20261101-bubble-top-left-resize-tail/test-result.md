# 検証結果

アシスタント221テスト成功。ブラウザで3方向だけのハンドル、実際のドラッグIPC、尻尾の枠外表示、400x640/400x540/320x480で入力欄・内部スクロールを確認。/tmp/soda-bubble-tail.pngで金色V字尻尾を目視。

## soda-bubble-anchor-tests.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  30 passed (30)
      Tests  221 passed (221)
   Start at  23:05:38
   Duration  2.93s (transform 52%, tests 29%, import 18%, worker 1%)

  Transform  |@sodashitsu/desktop-assistant| transforming modules took 12.75s · 52% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## soda-bubble-anchor-ui2.log

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, four-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS

```

## soda-bubble-anchor-build2.log

```text

> @sodashitsu/desktop-assistant@0.1.0 build:host /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> tsc -b && node scripts/build-host.mjs

assistant_internal_resources_built_no_execution

```

## soda-bubble-anchor-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (39 tests | 1 failed | 38 skipped) 1122ms
   × resizes only the current visible bubble from the native cursor, retains size, and rejects stale gestures 32ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > resizes only the current visible bubble from the native cursor, retains size, and rejects stale gestures
AssertionError: promise resolved "{ token: 'e921c89b-d397-46c0-9f5f-5f…' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "token": "e921c89b-d397-46c0-9f5f-5f028fe102f0",
  }

 ❯ src/main.test.ts:1257:127
    1255|     const original=bubble.getBounds();
    1256|     await expect(fixture.handlers.get("assistant:resize-start")!(event…
    1257|     for(const handle of ["s","e","ne","se","sw"])await expect(fixture.…
       |                                                                                                                               ^
    1258|     const {token}=await fixture.handlers.get("assistant:resize-start")…
    1259|     cursor.mockReturnValue({x:60,y:40});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 38 skipped (39)
   Start at  23:06:42
   Duration  1.33s (tests 90%, transform 8%, import 2%)


```

## soda-bubble-tail-negative.log

```text
PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

  assert.ok(tail.outside)

    at file:///workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:388:77 {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

```

逆検証: 許可ハンドルを旧8方向へ戻すと禁止方向のIPC拒否テストが失敗。尻尾をspeech内部へ戻すとブラウザ検証が失敗。各逆検証後に元ファイルとバイト単位一致を確認。
