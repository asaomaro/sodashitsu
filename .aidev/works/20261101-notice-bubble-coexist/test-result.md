# 検証結果

223単体テスト成功。通知Aへの遅い返答が通知Bを閉じないこと、返答失敗で残ること、表示更新前の古い×/開くで新通知を閉じないこと、読了後の遅い全画面判定で再表示しないことを確認。ブラウザで右向き尻尾、通知確認ボタン、3種の短い画面で会話/入力欄/通知操作が収まることを確認。

## soda-notice-coexist-final-unit.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  30 passed (30)
      Tests  223 passed (223)
   Start at  23:33:53
   Duration  3.01s (transform 52%, tests 29%, import 18%, worker 1%)

  Transform  |@sodashitsu/desktop-assistant| transforming modules took 12.96s · 52% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## soda-notice-coexist-ui2.log

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, four-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS

```

## soda-notice-coexist-build2.log

```text

> @sodashitsu/desktop-assistant@0.1.0 build:host /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> tsc -b && node scripts/build-host.mjs

assistant_internal_resources_built_no_execution

```

## soda-notice-coexist-negative.log

```text

NEGATIVE: opens the exact notice / function showCompact(payload: { id?: string; title: string; message: string }): void {
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (41 tests | 1 failed | 40 skipped) 995ms
   × opens the exact notice in chat, keeps compact notices beside chat, and dismisses only matching notices 69ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > opens the exact notice in chat, keeps compact notices beside chat, and dismisses only matching notices
AssertionError: expected 3 to be 4 // Object.is equality

- Expected
+ Received

- 4
+ 3

 ❯ src/main.test.ts:1305:33
    1303|  expect(chat.url).toContain("/bubble.html");const count=fixture.window…
    1304|  connection.options.changed([{...first,id:"second",at:2}],true);
    1305|  expect(fixture.windows.length).toBe(count+1);
       |                                 ^
    1306|  const second=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(seco…
    1307|  const local={sender:chat.webContents,senderFrame:chat.webContents.mai…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 40 skipped (41)
   Start at  23:32:57
   Duration  1.21s (tests 88%, transform 10%, import 2%)


NEGATIVE: opens the exact notice / owner.window!==compact||revision!==compactRevision
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (41 tests | 1 failed | 40 skipped) 997ms
   × opens the exact notice in chat, keeps compact notices beside chat, and dismisses only matching notices 124ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > opens the exact notice in chat, keeps compact notices beside chat, and dismisses only matching notices
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/main.test.ts:1311:117
    1309|  const stale=(await fixture.handlers.get("assistant:notice-state")!(se…
    1310|  connection.options.changed([{...first,id:"second",message:"新しい詳細",at:…
    1311|  await fixture.handlers.get("assistant:notice-dismiss")!(secondEvent,{…
       |                                                                                                                     ^
    1312|  await fixture.handlers.get("assistant:notice-open")!(secondEvent,{rev…
    1313|  expect(await fixture.handlers.get("assistant:inbox")!(local)).toMatch…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 40 skipped (41)
   Start at  23:32:59
   Duration  1.22s (tests 88%, transform 10%, import 2%)


NEGATIVE: keeps newer notifications / dismissCompact(notice.id);
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (41 tests | 1 failed | 40 skipped) 997ms
   × keeps newer notifications when an older reply completes and retains failed replies 75ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > keeps newer notifications when an older reply completes and retains failed replies
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/main.test.ts:1344:176
    1342|  const second={...first,id:"00000000-0000-4000-8000-000000000172",at:2…
    1343|  finish({ok:true});await pending;expect(compact.isDestroyed()).toBe(fa…
    1344|  rpc.request.mockResolvedValueOnce({ok:true});await fixture.handlers.g…
       |                                                                                                                                                                                ^
    1345|  await fixture.handlers.get("assistant:save")!(event,{enabled:false});
    1346| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 40 skipped (41)
   Start at  23:33:00
   Duration  1.21s (tests 89%, transform 9%, import 2%)


```

逆検証では会話中抑止・revision無照合・成功時dismissなしへ各修正だけ戻すと該当テストが失敗。各ファイルを保存したバイト列へ復元し一致確認。
