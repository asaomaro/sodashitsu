# 検証

- build/typecheck成功。Relay/sharedcapture/sharednative/sharedaudio4suite415件成功。追加protocol/features/非syntheticfactory3suite30件成功。独立交渉4件（音声許可OFFの動画のみを含む）も成功。
- Relayはdefault/UACの実交渉、1video/1audio source、先頭viewer離脱後PCM継続、scope失効、独立feature欠落を検査。
- 非synthetic windows-gdiの実factory分岐をfake化して、held import全退出→factory0、2member中audioOFF/先頭viewer退出→source維持、最後の消費者/physical source終了stop1を確認。missing/wrongQPC/privilegedaudio/localvideoFalseを公開前拒否する。
- Browser1件成功。2windowのactual H264 pixels/動画frame増分/Opus AudioDecoder output（virtual sink）、単一video/audio producer、先頭viewerを閉じた後も残りの動画と音声が増加し、scope変更で全Video/AudioDecoder閉鎖する。
- 私有Source copyでcancelled factory/QPC/localvideo/client featureの4guardを破壊→意図assertion失敗→復元成功。製品bytes不変。最初のbrowserは存在しないselectorを待ったため、browser受信capability messageと実DOM操作へ修正（製品退行の負例として数えない）。
- 独立taskcheck/crossで製品mustなし。non-synthetic分岐should対応、audioOFFとstale stopの区別も回帰へ追加。音声許可を動画の必須条件と読める文書shouldも修正し再点検で解消。
- 実SYSTEM worker/GPU/通常ユーザー音声/WSLの併用確認は別途必要。

## source guard負例の生出力

```text
NEGATIVE cancelled-factory
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-shared-protected-desktop-media

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts (7 tests | 1 failed | 6 skipped) 65ms
   × does not construct an ordinary-user source after all consumers leave during its lazy import 64ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts > does not construct an ordinary-user source after all consumers leave during its lazy import
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "active": [Function allowed],
        "id": "bfb122d2-30eb-4710-b187-8fd742a402d0",
        "send": [Function send],
        "state": [Function state],
        "synthetic": false,
        "videoTimestamp": [Function videoTimestamp],
        "write": [Function write],
      },
    ]


Number of calls: 1

 ❯ src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts:136:24
    134|   await new Promise<void>((resolve) => setImmediate(resolve));
    135|   await new Promise<void>((resolve) => setImmediate(resolve));
    136|   expect(f.create).not.toHaveBeenCalled();
       |                        ^
    137| });
    138| it("uses one ordinary-user source and preserves it through first-viewe…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  02:51:31
   Duration  950ms (transform 72%, import 20%, tests 8%)


RESTORED cancelled-factory
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-shared-protected-desktop-media


 Test Files  1 passed (1)
      Tests  1 passed | 6 skipped (7)
   Start at  02:51:33
   Duration  953ms (transform 73%, import 20%, tests 7%)


NEGATIVE private-qpc
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-shared-protected-desktop-media

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts (7 tests | 1 failed | 6 skipped) 1015ms
   × rejects missing-clock from the protected physical source before any ordinary audio factory 1014ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts > rejects missing-clock from the protected physical source before any ordinary audio factory
AssertionError: expected null to be +0 // Object.is equality

- Expected:
0

+ Received:
null

 ❯ src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts:165:247


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  02:51:35
   Duration  1.92s (tests 55%, transform 35%, import 9%)


RESTORED private-qpc
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-shared-protected-desktop-media


 Test Files  1 passed (1)
      Tests  1 passed | 6 skipped (7)
   Start at  02:51:37
   Duration  903ms (transform 77%, import 21%, tests 1%)


NEGATIVE local-video
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-shared-protected-desktop-media

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts (7 tests | 1 failed | 6 skipped) 1012ms
   × rejects local-video from the protected physical source before any ordinary audio factory 1011ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts > rejects local-video from the protected physical source before any ordinary audio factory
AssertionError: expected null to be +0 // Object.is equality

- Expected:
0

+ Received:
null

 ❯ src/desktop/DesktopSharedProtectedAudio.generatedNegative.test.ts:165:247


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  02:51:39
   Duration  1.92s (tests 55%, transform 35%, import 10%)


RESTORED local-video
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-shared-protected-desktop-media


 Test Files  1 passed (1)
      Tests  1 passed | 6 skipped (7)
   Start at  02:51:42
   Duration  906ms (transform 77%, import 21%, tests 1%, worker 1%)


NEGATIVE shared-client-feature
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-shared-protected-desktop-media

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.generatedNegative.test.ts (291 tests | 1 failed | 290 skipped) 1033ms
   × keeps shared protected media disabled when the independent shared feature is missing 1031ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.generatedNegative.test.ts > keeps shared protected media disabled when the independent shared feature is missing
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.generatedNegative.test.ts:1889:478


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.generatedNegative.test.ts:1889:418

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 290 skipped (291)
   Start at  02:51:43
   Duration  2.54s (transform 47%, tests 42%, import 10%)


RESTORED shared-client-feature
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-shared-protected-desktop-media


 Test Files  1 passed (1)
      Tests  1 passed | 290 skipped (291)
   Start at  02:51:46
   Duration  1.68s (transform 74%, import 17%, tests 8%)


shared_protected_media_4_source_negative_controls_and_restore_passed

```
