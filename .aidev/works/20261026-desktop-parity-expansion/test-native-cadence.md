# native cadence test result

- pnpm build / pnpm typecheck: pass。
- pnpm exec vitest run --maxWorkers=4: 766 suites / 11,500 tests pass (362.05s)。
- native video / UDP / audio Playwright: 17 pass / 2 skip (1.9m)。自動試験はgenerated H264/PCMのみ、実ユーザー入力/clipboard/desktop captureなし。
- 独立worktree（native-resolution、6836d674時点）のpnpm build / pnpm smoke: pass。
- A Windows: combined helper compile + validate-video-rate pure checks pass。B Windows: branch archiveをTEMPへ展開しcombined helper compile + pure rate checks pass。B稼働repo HEAD 2a1c6efbのまま、tracked status clean。
- review_transfer / review_pointer: 独立レビュー、修正再レビューとも追加必須指摘なし（review-native-cadence.md）。
- 負例は修正箇所のみ外し、失敗後に元のbyte列へ一致を確認して復元。FPS-onlyのC#負例後にも復元したcompile/pure check pass。

転送解像度の自動変更は次差分であり、task 4は未完了。下の負例logはstdout/stderrを保存した原文。Windows stderrはcp932から表示用UTF-8へ変換し、raw byteも/tmpに保持。

## negative native-gate

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-adaptive

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeVideo.test.ts (13 tests | 1 failed) 54ms
   × changes cadence without restarting video, input or image policy only when opted in (false/true) 9ms

 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
   Start at  16:56:55
   Duration  1.14s (transform 73%, import 21%, tests 5%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeVideo.test.ts > changes cadence without restarting video, input or image policy only when opted in (false/true)
AssertionError: expected [ [ { type: 'native_rate', …(3) } ] ] to deeply equal []

- Expected
+ Received

- []
+ [
+   [
+     {
+       "fps": 17,
+       "id": "810f8fdc-3f4a-4e1f-bf8d-c96d3d9b4c3f",
+       "kbps": 2500,
+       "type": "native_rate",
+     },
+   ],
+ ]

 ❯ src/desktop/DesktopNativeVideo.test.ts:232:24
    230|   const updates=write.mock.calls.filter(([m])=>m.type==='native_rate');
    231|   if(cadence&&adaptive)expect(updates).toEqual([[{type:'native_rate',i…
    232|   else expect(updates).toEqual([]);
       |                        ^
    233|   expect(policy.mock.calls).toEqual([[true]]);expect(write.mock.calls.…
    234|   expect(send.mock.calls.filter(([m])=>m.type==='media_stream')).toHav…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## negative recovery-floor

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-adaptive

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeQuality.test.ts (5 tests | 2 failed) 25ms
   × never lowers cadence in recovery near a low cap (1) 9ms
   × never lowers cadence in recovery near a low cap (5) 2ms

 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
   Start at  16:56:57
   Duration  259ms (transform 48%, tests 26%, import 21%, worker 5%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeQuality.test.ts > never lowers cadence in recovery near a low cap (1)
AssertionError: expected { fps: +0, kbps: 2500 } to be undefined

- Expected:
undefined

+ Received:
{
  "fps": 0,
  "kbps": 2500,
}

 ❯ src/desktop/DesktopNativeQuality.test.ts:29:61
     27|  const q=new DesktopNativeQuality({fps,kbps:2500,window:1},0);
     28|  const edge={...clean,ack:850/(fps*.98)};
     29|  for(let now=0;now<50000;now+=4000)expect(step(q,now,edge)).toBeUndefi…
       |                                                             ^
     30| });
     31|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeQuality.test.ts > never lowers cadence in recovery near a low cap (5)
AssertionError: expected { fps: 4, kbps: 2500 } to be undefined

- Expected:
undefined

+ Received:
{
  "fps": 4,
  "kbps": 2500,
}

 ❯ src/desktop/DesktopNativeQuality.test.ts:29:61
     27|  const q=new DesktopNativeQuality({fps,kbps:2500,window:1},0);
     28|  const edge={...clean,ack:850/(fps*.98)};
     29|  for(let now=0;now<50000;now+=4000)expect(step(q,now,edge)).toBeUndefi…
       |                                                             ^
     30| });
     31|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


```

## negative fps-only-bitrate

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "FPS-only called bitrate API"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-adaptive\scripts\remote-desktop\validate-video-rat
e.ps1:4 文字:1
+ [SodaDesktopTests.VideoRateChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```
