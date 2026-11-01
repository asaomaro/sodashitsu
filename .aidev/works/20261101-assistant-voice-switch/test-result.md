# 検証

アシスタント型検査・ビルドを通過。

## soda-pop-voice-final-tests2.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  30 passed (30)
      Tests  217 passed (217)
   Start at  21:06:57
   Duration  3.31s (transform 53%, tests 29%, import 16%, worker 1%)

  Transform  |@sodashitsu/desktop-assistant| transforming modules took 13.37s · 53% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## soda-pop-voice-final-ui2.log

```text
PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, four-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS

```

## soda-voice-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/voicePermissions.test.ts (1 test | 1 failed) 6ms
   × allows voice matching only from the current settings main frame 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/voicePermissions.test.ts > allows voice matching only from the current settings main frame
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/voicePermissions.test.ts:6:54
      4|  for(const role of ["settings","bubble","character","notice"] as Local…
      5|   const sender={frameUrl:`soda-assistant://app/${role}.html`,mainFrame…
      6|   expect(authorizeLocalSender(sender,"voice-match")).toBe(role==="sett…
       |                                                      ^
      7|   expect(authorizeLocalSender({...sender,mainFrame:false},"voice-match…
      8|  }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  21:07:30
   Duration  135ms (transform 62%, import 18%, tests 13%, worker 6%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/voice.test.ts (8 tests | 1 failed | 7 skipped) 56ms
   × previews a draft voice for one utterance without changing the saved speaker 55ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/voice.test.ts > previews a draft voice for one utterance without changing the saved speaker
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/voice.test.ts:163:16
    161|  voice.configure(true);voice.say("preview","試聴",()=>true,draft);
    162|  await vi.waitFor(()=>expect(voice.snapshot().speaking).toBe(false));
    163|  expect(draft).toHaveBeenCalledOnce();expect(saved).not.toHaveBeenCall…
       |                ^
    164|  voice.say("notification","通常通知");await vi.waitFor(()=>expect(saved).t…
    165| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  21:07:31
   Duration  191ms (tests 50%, transform 36%, import 10%, worker 3%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (37 tests | 1 failed | 36 skipped) 1021ms
   × matches an unsaved character through settings IPC and ignores unused external URLs for PC speech 52ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > matches an unsaved character through settings IPC and ignores unused external URLs for PC speech
ZodError: [
  {
    "code": "invalid_format",
    "format": "url",
    "path": [
      "voicevoxOrigin"
    ],
    "message": "Invalid URL"
  },
  {
    "code": "custom",
    "path": [
      "voicevoxOrigin"
    ],
    "message": "このPCのVOICEVOX接続先を指定してください"
  }
]
 ❯ voiceDraftPreferences src/main.ts:234:37
    232|  const selected=voiceChoice.parse(input);
    233|
    234|  return DesktopAssistantPreferences.parse({...controller.preferences,.…
       |                                     ^
    235| }
    236| function voiceCharacterName(id:string):string {
 ❯ src/main.ts:986:68
 ❯ src/main.test.ts:1459:53

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 36 skipped (37)
   Start at  21:07:32
   Duration  1.24s (tests 89%, transform 9%, import 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (37 tests | 1 failed | 36 skipped) 987ms
   × synthesizes the draft automatic speaker, then a manual speaker, without overwriting saved voice settings 85ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > synthesizes the draft automatic speaker, then a manual speaker, without overwriting saved voice settings
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/main.test.ts:1476:82
    1474|   await fixture.handlers.get('assistant:voice-test')!(event,draft);
    1475|   await vi.waitFor(()=>expect(fixture.wavPlay).toHaveBeenCalledOnce());
    1476|   expect(fetcher.mock.calls.some(([url])=>url.includes('/synthesis?spe…
       |                                                                                  ^
    1477|   await fixture.handlers.get('assistant:voice-test')!(event,{...draft,…
    1478|   await vi.waitFor(()=>expect(fixture.wavPlay).toHaveBeenCalledTimes(2…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 36 skipped (37)
   Start at  21:07:34
   Duration  1.19s (tests 89%, transform 9%, import 2%)


```

## result.json

```text
{
  "settings": {
    "shows": 1,
    "textLength": 2668,
    "colors": 3034
  },
  "voiceMatch": {
    "id": 8,
    "label": "春日部つむぎ（ノーマル）"
  },
  "panel": {
    "shows": 1,
    "textLength": 47,
    "colors": 594
  },
  "iconEmpty": false
}
```

## 実機反映

2026-11-01: nativeアシスタントを再起動しphase=running。現在のつむぎ・内蔵CORE設定を保持、voiceFollowCharacter=trueで有効化。実CORE話者の照合結果はきりたん108・つむぎ8・ずん子107・めたん2・ずんだもん3。Windowsネイティブのsettings IPCでも、以前の108からつむぎ8への切替を確認。
