# 音声受信・マイク転送の検証

初期差分は全体776 suites/11616件通過。その後、RTTがPCMの20msを超える場合の途切れを防ぐ送信windowを修正。初期全体結果を最終差分の通過とは扱わない。追加差分は生成browser（ACK120ms遅延）と既存音声を合わせ7件、unit7件、Windows生成sinkとhelper compile通過。最終main統合後の全体は別途追記する。

Windows負例の原本はCP932、他はUTF8。原本をevidence-microphone/にそのまま保存し、本文のWindowsログだけUTF8へ文字コード変換（改行・末尾空白は維持）。

## Negative permission

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone

 ❯ |@sodashitsu/server| src/desktop/DesktopMicrophone.test.ts (3 tests | 1 failed | 2 skipped) 7ms
   × never opens a pipe without local permission, and a stopped owner cannot restart 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopMicrophone.test.ts > never opens a pipe without local permission, and a stopped owner cannot restart
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 2 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "enabled": true,
        "id": "22222222-2222-4222-8222-222222222222",
        "pipeName": "SodaDesktopMicrophone-9821d5438aae4d99b03109699aa73bcb",
        "pipePath": "/tmp/SodaDesktopMicrophone-9821d5438aae4d99b03109699aa73bcb.sock",
        "type": "native_microphone",
      },
    ]

  2nd vi.fn() call:

    Array [
      Object {
        "enabled": false,
        "id": "22222222-2222-4222-8222-222222222222",
        "type": "native_microphone",
      },
    ]


Number of calls: 2

 ❯ src/desktop/DesktopMicrophone.test.ts:21:65


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  09:20:55
   Duration  759ms (transform 78%, import 21%, tests 1%)


```

## Negative rtc-audio

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (122 tests | 1 failed | 121 skipped) 1089ms
   × rejects system audio for both media paths when the separate local permission is off, and still accepts default silent media 1087ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > rejects system audio for both media paths when the separate local permission is off, and still accepts default silent media
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1109:150


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1109:78

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 121 skipped (122)
   Start at  09:20:56
   Duration  2.14s (tests 53%, transform 37%, import 10%)


```

## Negative late-gum

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone

 ❯ |@sodashitsu/web| src/desktop/microphoneClient.test.ts (3 tests | 1 failed | 2 skipped) 5ms
   × never captures until explicitly started, and stops a late getUserMedia result after close 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > never captures until explicitly started, and stops a late getUserMedia result after close
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/microphoneClient.test.ts:13:133


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  09:20:59
   Duration  887ms (transform 63%, environment 21%, import 15%, tests 1%)


```

## Negative native-prefix

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Microphone owner"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-microphone\scripts\remote-desktop\validate-microphone.ps1
:4 文字:1
+ [SodaMicrophoneChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : ArgumentException
 

```

## Negative native-pid

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Wrong PID activated endpoint"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-microphone\scripts\remote-desktop\validate-microphone.ps1
:4 文字:1
+ [SodaMicrophoneChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 

```

## Negative native-expiry

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Stale PCM played"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-microphone\scripts\remote-desktop\validate-microphone.ps1
:4 文字:1
+ [SodaMicrophoneChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 

```

## Negative window

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone

 ❯ |@sodashitsu/web| src/desktop/microphoneClient.test.ts (3 tests | 1 failed | 2 skipped) 9ms
   × bounds unacknowledged fresh frames across network RTT and stops capture on B failure 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > bounds unacknowledged fresh frames across network RTT and stops capture on B failure
AssertionError: expected "vi.fn()" to be called 13 times, but got 2 times
 ❯ src/desktop/microphoneClient.test.ts:21:95


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  09:31:21
   Duration  1.18s (transform 57%, environment 26%, import 15%, tests 1%)


```

## Negative burst

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone

 ❯ |@sodashitsu/server| src/desktop/DesktopMicrophone.test.ts (4 tests | 1 failed | 3 skipped) 1071ms
   × coalesces a burst behind a pipe write to the latest frame without stopping the stream 1070ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopMicrophone.test.ts > coalesces a burst behind a pipe write to the latest frame without stopping the stream
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopMicrophone.test.ts:33:95


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopMicrophone.test.ts:33:2

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  09:31:23
   Duration  2.19s (tests 52%, transform 36%, import 12%)


```

## Negative native-final-expiry

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "PCM expired during sink wait was played"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-microphone\scripts\remote-desktop\validate-microphone.ps1
:4 文字:1
+ [SodaMicrophoneChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 

```
