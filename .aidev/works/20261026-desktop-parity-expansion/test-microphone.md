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

## 最終main統合後の全体検証

品質PR228を含むHEAD49b995baを固定し、build/typecheck/全体777 suites・11619件通過。独立worktreeのbuild/smoke、GitHub Windows boundaries（helper entry-point compile/生成microphone含む）通過。独立最終レビュー2件で追加mustなし。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone

{"ts":"2026-10-27T00:44:14.079Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.081Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.081Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:14.088Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-agent-it-iAIOHv/a/commands.json","count":0}
{"ts":"2026-10-27T00:44:14.131Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.134Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.134Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:14.137Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.140Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.140Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:14.142Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-display-state-cNR6v8/commands.json","count":0}
{"ts":"2026-10-27T00:44:14.164Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-prompt-it-ceYB1v/state/commands.json","count":0}
{"ts":"2026-10-27T00:44:14.176Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.195Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.195Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:14.204Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-start-it-QnPsiC/state/commands.json","count":0}
{"ts":"2026-10-27T00:44:14.584Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.585Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:14.585Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:14.590Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-agent-it-iAIOHv/b/commands.json","count":0}
{"ts":"2026-10-27T00:44:14.873Z","level":"info","msg":"display script enabled","byClientId":"a9f977b5-b6a7-4e5e-b449-8978016ece63","byKind":"external"}
{"ts":"2026-10-27T00:44:14.901Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:44:14.919Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"main","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:44:14.920Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:44:14.924Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"main","kind":"panel","format":"text","bytes":1,"rev":2}
{"ts":"2026-10-27T00:44:14.924Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:44:14.926Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:44:14.928Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"main","reason":"closed"}
{"ts":"2026-10-27T00:44:14.929Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T00:44:14.931Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T00:44:14.932Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:7","code":"ok"}
{"ts":"2026-10-27T00:44:14.933Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:8","code":"ok"}
{"ts":"2026-10-27T00:44:14.941Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:9","code":"ok"}
{"ts":"2026-10-27T00:44:14.964Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:10","code":"ok"}
{"ts":"2026-10-27T00:44:14.998Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"quotes","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T00:44:14.999Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:11","code":"ok"}
{"ts":"2026-10-27T00:44:15.011Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"quotes","reason":"closed"}
{"ts":"2026-10-27T00:44:15.011Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:12","code":"ok"}
{"ts":"2026-10-27T00:44:15.041Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"viaws","kind":"band","format":"markdown","bytes":4,"rev":1}
{"ts":"2026-10-27T00:44:15.081Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"viaws","reason":"closed"}
{"ts":"2026-10-27T00:44:15.124Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:13","code":"ok"}
{"ts":"2026-10-27T00:44:15.537Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:14","code":"ok"}
{"ts":"2026-10-27T00:44:15.538Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:15","code":"ok"}
{"ts":"2026-10-27T00:44:15.580Z","level":"info","msg":"display set","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","name":"m","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T00:44:15.581Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:17","code":"ok"}
{"ts":"2026-10-27T00:44:15.683Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:16","code":"ok"}
{"ts":"2026-10-27T00:44:15.736Z","level":"info","msg":"display closed","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","name":"m","reason":"dismissed"}
{"ts":"2026-10-27T00:44:15.737Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:18","code":"ok"}
{"ts":"2026-10-27T00:44:15.742Z","level":"info","msg":"display set","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","name":"n","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:44:15.742Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:20","code":"ok"}
{"ts":"2026-10-27T00:44:15.745Z","level":"info","msg":"display reported","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","name":"n","problem":"navigated","format":"text"}
{"ts":"2026-10-27T00:44:15.745Z","level":"info","msg":"display closed","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","name":"n","reason":"navigated"}
{"ts":"2026-10-27T00:44:15.745Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:19","code":"ok"}
{"ts":"2026-10-27T00:44:15.748Z","level":"info","msg":"display set","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","name":"o","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:44:15.748Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:22","code":"ok"}
{"ts":"2026-10-27T00:44:15.749Z","level":"info","msg":"display closed","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","name":"o","reason":"closed"}
{"ts":"2026-10-27T00:44:15.749Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:21","code":"ok"}
{"ts":"2026-10-27T00:44:15.749Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:23","code":"ok"}
{"ts":"2026-10-27T00:44:15.801Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"95d5e8e7-eaa7-4908-b554-c42ef5396fab","connId":"pane-socket:24","code":"not_found"}
{"ts":"2026-10-27T00:44:15.807Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:95d5e8e7-eaa7-4908-b554-c42ef5396fab"]}
{"ts":"2026-10-27T00:44:16.432Z","level":"info","msg":"display set","paneId":"63633963-ab2b-4774-98fe-7f6cac03d891","name":"m","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T00:44:16.432Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"63633963-ab2b-4774-98fe-7f6cac03d891","connId":"pane-socket:25","code":"ok"}
{"ts":"2026-10-27T00:44:16.434Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"63633963-ab2b-4774-98fe-7f6cac03d891","connId":"pane-socket:26","code":"ok"}
{"ts":"2026-10-27T00:44:16.435Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"63633963-ab2b-4774-98fe-7f6cac03d891","connId":"pane-socket:27","code":"ok"}
{"ts":"2026-10-27T00:44:16.460Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"63633963-ab2b-4774-98fe-7f6cac03d891","connId":"pane-socket:28","code":"ok"}
{"ts":"2026-10-27T00:44:16.521Z","level":"info","msg":"display closed","paneId":"63633963-ab2b-4774-98fe-7f6cac03d891","name":"m","reason":"pane_closed"}
{"ts":"2026-10-27T00:44:16.522Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"63633963-ab2b-4774-98fe-7f6cac03d891","connId":"pane-socket:29","code":"not_found"}
{"ts":"2026-10-27T00:44:16.530Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:63633963-ab2b-4774-98fe-7f6cac03d891"]}
{"ts":"2026-10-27T00:44:17.253Z","level":"info","msg":"display set","paneId":"d122cf1c-babb-4a37-ae3d-d4e8d4e5de00","name":"w","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T00:44:17.441Z","level":"info","msg":"display closed","paneId":"d122cf1c-babb-4a37-ae3d-d4e8d4e5de00","name":"w","reason":"pane_closed"}
{"ts":"2026-10-27T00:44:17.451Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:d122cf1c-babb-4a37-ae3d-d4e8d4e5de00"]}
{"ts":"2026-10-27T00:44:17.922Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"829f1043-7577-492b-85a9-39efe6052036","connId":"pane-socket:30","code":"ok"}
{"ts":"2026-10-27T00:44:17.923Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"829f1043-7577-492b-85a9-39efe6052036","connId":"pane-socket:31","code":"ok"}
{"ts":"2026-10-27T00:44:18.066Z","level":"info","msg":"machine link closed","machine":"062bc46d8c8ea2a35d41059693c8fe0b","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:44:18.926Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"829f1043-7577-492b-85a9-39efe6052036","connId":"pane-socket:32","code":"ok"}
{"ts":"2026-10-27T00:44:18.928Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"829f1043-7577-492b-85a9-39efe6052036","connId":"pane-socket:33","code":"ok"}
{"ts":"2026-10-27T00:44:18.929Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"829f1043-7577-492b-85a9-39efe6052036","connId":"pane-socket:34","code":"ok"}
{"ts":"2026-10-27T00:44:19.180Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"829f1043-7577-492b-85a9-39efe6052036","connId":"pane-socket:35","code":"not_found"}
{"ts":"2026-10-27T00:44:19.188Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:829f1043-7577-492b-85a9-39efe6052036"]}
{"ts":"2026-10-27T00:44:19.195Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:36","code":"ok"}
{"ts":"2026-10-27T00:44:19.197Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:37","code":"ok"}
{"ts":"2026-10-27T00:44:19.199Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:38","code":"ok"}
{"ts":"2026-10-27T00:44:19.200Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"b0","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:44:19.201Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:39","code":"ok"}
{"ts":"2026-10-27T00:44:19.202Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"b1","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:44:19.202Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:40","code":"ok"}
{"ts":"2026-10-27T00:44:19.204Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:41","code":"display_limit"}
{"ts":"2026-10-27T00:44:19.206Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:42","code":"ok"}
{"ts":"2026-10-27T00:44:19.207Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"b0","reason":"closed"}
{"ts":"2026-10-27T00:44:19.207Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"b1","reason":"closed"}
{"ts":"2026-10-27T00:44:19.207Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:43","code":"ok"}
{"ts":"2026-10-27T00:44:19.247Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:44","code":"ok"}
{"ts":"2026-10-27T00:44:19.248Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"sg","kind":"panel","format":"script-html","bytes":47,"rev":1}
{"ts":"2026-10-27T00:44:19.248Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:45","code":"ok"}
{"ts":"2026-10-27T00:44:19.250Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:46","code":"ok"}
{"ts":"2026-10-27T00:44:19.251Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:47","code":"ok"}
{"ts":"2026-10-27T00:44:19.276Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:49","code":"ok"}
{"ts":"2026-10-27T00:44:19.278Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:50","code":"ok"}
{"ts":"2026-10-27T00:44:19.305Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"sg2","kind":"band","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T00:44:19.309Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"st","kind":"panel","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:44:19.309Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:51","code":"ok"}
{"ts":"2026-10-27T00:44:19.312Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:52","code":"ok"}
{"ts":"2026-10-27T00:44:19.314Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:53","code":"invalid_params"}
{"ts":"2026-10-27T00:44:19.316Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:48","code":"ok"}
{"ts":"2026-10-27T00:44:19.318Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"sg","reason":"closed"}
{"ts":"2026-10-27T00:44:19.319Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"sg2","reason":"closed"}
{"ts":"2026-10-27T00:44:19.319Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"st","reason":"closed"}
{"ts":"2026-10-27T00:44:19.319Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:54","code":"ok"}
{"ts":"2026-10-27T00:44:19.319Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:55","code":"ok"}
{"ts":"2026-10-27T00:44:19.324Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:57","code":"ok"}
{"ts":"2026-10-27T00:44:19.327Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"lay","kind":"panel","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:44:19.327Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:58","code":"ok"}
{"ts":"2026-10-27T00:44:19.346Z","level":"info","msg":"display set","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"lay2","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:44:19.352Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:59","code":"ok"}
{"ts":"2026-10-27T00:44:19.356Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:60","code":"ok"}
{"ts":"2026-10-27T00:44:19.357Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"lay","reason":"closed"}
{"ts":"2026-10-27T00:44:19.358Z","level":"info","msg":"display closed","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","name":"lay2","reason":"closed"}
{"ts":"2026-10-27T00:44:19.358Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"0fad9508-93b0-4734-9190-511435cfc6b4","connId":"pane-socket:61","code":"ok"}
{"ts":"2026-10-27T00:44:19.883Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","connId":"pane-socket:62","code":"ok"}
{"ts":"2026-10-27T00:44:19.884Z","level":"info","msg":"display set","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","name":"cg","kind":"panel","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T00:44:19.884Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","connId":"pane-socket:63","code":"ok"}
{"ts":"2026-10-27T00:44:19.888Z","level":"info","msg":"display reported","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:44:19.891Z","level":"info","msg":"display reported","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:44:19.908Z","level":"info","msg":"display reported","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:44:19.908Z","level":"info","msg":"display closed","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","name":"cg","reason":"focus_steal"}
{"ts":"2026-10-27T00:44:19.909Z","level":"info","msg":"display script cooldown","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","reason":"focus_steal","closed":1,"ms":300000}
{"ts":"2026-10-27T00:44:19.918Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","connId":"pane-socket:64","code":"ok"}
{"ts":"2026-10-27T00:44:19.920Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","connId":"pane-socket:65","code":"display_busy"}
{"ts":"2026-10-27T00:44:19.922Z","level":"info","msg":"display set","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","name":"cg","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:44:19.922Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"d3b0b2ad-de37-4d88-99f1-386e3b799d2d","connId":"pane-socket:66","code":"ok"}
{"ts":"2026-10-27T00:44:20.465Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"9c4b46ab-c96b-4647-b4fe-b72c6aae012e","connId":"pane-socket:67","code":"ok"}
{"ts":"2026-10-27T00:44:20.468Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"9c4b46ab-c96b-4647-b4fe-b72c6aae012e","connId":"pane-socket:68","code":"ok"}
{"ts":"2026-10-27T00:44:20.469Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"9c4b46ab-c96b-4647-b4fe-b72c6aae012e","connId":"pane-socket:69","code":"ok"}
{"ts":"2026-10-27T00:44:20.473Z","level":"info","msg":"display set","paneId":"9c4b46ab-c96b-4647-b4fe-b72c6aae012e","name":"dg","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:44:20.473Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"9c4b46ab-c96b-4647-b4fe-b72c6aae012e","connId":"pane-socket:70","code":"ok"}
{"ts":"2026-10-27T00:44:20.512Z","level":"info","msg":"display script enabled","byClientId":"86278edd-6cf4-4569-a09d-4ccbba10bd08","byKind":"external"}
{"ts":"2026-10-27T00:44:20.518Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"9c4b46ab-c96b-4647-b4fe-b72c6aae012e","connId":"pane-socket:71","code":"ok"}
{"ts":"2026-10-27T00:44:20.520Z","level":"info","msg":"display set","paneId":"9c4b46ab-c96b-4647-b4fe-b72c6aae012e","name":"dg","kind":"panel","format":"script-html","bytes":8,"rev":2}
{"ts":"2026-10-27T00:44:20.521Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"9c4b46ab-c96b-4647-b4fe-b72c6aae012e","connId":"pane-socket:72","code":"ok"}
{"ts":"2026-10-27T00:44:21.111Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"062bc46d8c8ea2a35d41059693c8fe0b","requestId":"3997e5dc-54fd-4437-8e35-e5fc82ba455c","paneId":"c8a63abc-7e71-42bb-8ceb-6bc0a3d050c9","cause":"channel_unavailable"}
{"ts":"2026-10-27T00:44:21.112Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"062bc46d8c8ea2a35d41059693c8fe0b","requestId":"3997e5dc-54fd-4437-8e35-e5fc82ba455c","paneId":"c8a63abc-7e71-42bb-8ceb-6bc0a3d050c9","cause":"connect_failed"}
{"ts":"2026-10-27T00:44:21.729Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:21.732Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:21.732Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:21.741Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-JGg1sB/commands.json","count":0}
{"ts":"2026-10-27T00:44:22.898Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:22.899Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:22.900Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:22.906Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-oedv9F/commands.json","count":0}
{"ts":"2026-10-27T00:44:23.327Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:23.327Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:23.328Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:23.333Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-D7AR3C/commands.json","count":0}
{"ts":"2026-10-27T00:44:23.653Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"062bc46d8c8ea2a35d41059693c8fe0b","requestId":"3997e5dc-54fd-4437-8e35-e5fc82ba455c","paneId":"c8a63abc-7e71-42bb-8ceb-6bc0a3d050c9","cause":"connect_failed"}
{"ts":"2026-10-27T00:44:23.844Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:23.845Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:23.845Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:23.856Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-O6hdtB/commands.json","count":0}
{"ts":"2026-10-27T00:44:24.300Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:24.301Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:24.301Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:24.313Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-rHc6pZ/commands.json","count":0}
{"ts":"2026-10-27T00:44:24.762Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:24.763Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:24.763Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:24.771Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-l2MHiK/commands.json","count":0}
{"ts":"2026-10-27T00:44:24.826Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:24.828Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:24.829Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:24.837Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-state-Dr0Eim/commands.json","count":0}
{"ts":"2026-10-27T00:44:25.232Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:25.233Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:25.233Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:25.241Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-WhSJYD/commands.json","count":0}
{"ts":"2026-10-27T00:44:25.674Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnected","machineId":"062bc46d8c8ea2a35d41059693c8fe0b","requestId":"3997e5dc-54fd-4437-8e35-e5fc82ba455c","paneId":"c8a63abc-7e71-42bb-8ceb-6bc0a3d050c9","elapsedMs":4563}
{"ts":"2026-10-27T00:44:25.762Z","level":"info","msg":"machine link closed","machine":"062bc46d8c8ea2a35d41059693c8fe0b","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:44:26.087Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:26.089Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:26.089Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:26.100Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-BWMSEL/commands.json","count":0}
{"ts":"2026-10-27T00:44:26.130Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"062bc46d8c8ea2a35d41059693c8fe0b","requestId":"3997e5dc-54fd-4437-8e35-e5fc82ba455c","paneId":"c8a63abc-7e71-42bb-8ceb-6bc0a3d050c9","cause":"channel_unavailable"}
{"ts":"2026-10-27T00:44:26.130Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"062bc46d8c8ea2a35d41059693c8fe0b","requestId":"3997e5dc-54fd-4437-8e35-e5fc82ba455c","paneId":"c8a63abc-7e71-42bb-8ceb-6bc0a3d050c9","cause":"connect_failed"}
{"ts":"2026-10-27T00:44:26.506Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:26.507Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:26.507Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:26.513Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-follow-state-g5IBcX/commands.json","count":0}
{"ts":"2026-10-27T00:44:26.591Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:26.592Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:26.592Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:26.602Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-IAb3Ah/commands.json","count":0}
{"ts":"2026-10-27T00:44:26.991Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnected","machineId":"062bc46d8c8ea2a35d41059693c8fe0b","requestId":"3997e5dc-54fd-4437-8e35-e5fc82ba455c","paneId":"c8a63abc-7e71-42bb-8ceb-6bc0a3d050c9","elapsedMs":861}
{"ts":"2026-10-27T00:44:27.678Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:27.679Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:27.679Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:27.689Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-watch-state-UaGFkL/commands.json","count":0}
{"ts":"2026-10-27T00:44:28.153Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:28.157Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:28.157Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:28.165Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-it-yA0PW3/a/commands.json","count":0}
{"ts":"2026-10-27T00:44:28.745Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:28.746Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:28.746Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:28.751Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-it-yA0PW3/b/commands.json","count":0}
{"event":"graph.changed","data":{"graph":{"rev":2,"paused":false,"nodes":[{"key":"local:ca6009aa-042e-4e46-9a58-1200a726d681","x":40,"y":60},{"key":"local:bec27c77-d458-4a71-9d6a-dadfc76d31d1","x":40,"y":-100}],"links":[]},"byClientId":"graph"}}
{"ts":"2026-10-27T00:44:28.921Z","level":"warn","msg":"origin rejected","path":"/ws","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:33917","allowed":["localhost:33917","127.0.0.1:33917","[::1]:33917"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-27T00:44:29.884Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:29.887Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:29.887Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:29.911Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-paneenv-state-ttOPw0/commands.json","count":0}
{"ts":"2026-10-27T00:44:33.168Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:33.169Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:33.169Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:33.177Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-paneenv-named-LF6VeP/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:44:34.338Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:34.342Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:34.342Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:34.351Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-stream-it-Vtghca/state/commands.json","count":0}
{"ts":"2026-10-27T00:44:34.889Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:34.893Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:34.893Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:34.904Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-panecurrent-state-C8Cko5/commands.json","count":0}
{"ts":"2026-10-27T00:44:36.030Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:18c82642-a837-4281-963d-70ebe955277c"]}
{"ts":"2026-10-27T00:44:36.764Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:88472754-3437-4294-86ee-9f4ac41ef884"]}
{"ts":"2026-10-27T00:44:37.283Z","level":"info","msg":"work agent proxy lifecycle","event":"closed","machineId":"062bc46d8c8ea2a35d41059693c8fe0b","requestId":"3997e5dc-54fd-4437-8e35-e5fc82ba455c","paneId":"c8a63abc-7e71-42bb-8ceb-6bc0a3d050c9","reason":"target_validation_failed"}
{"ts":"2026-10-27T00:44:37.336Z","level":"info","msg":"machine link closed","machine":"062bc46d8c8ea2a35d41059693c8fe0b","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:44:37.849Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:df79eda9-c7eb-481a-976e-0ab539698433"]}
{"ts":"2026-10-27T00:44:39.129Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:39.132Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:39.132Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:39.148Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-attach-it-k0KrgX/state/commands.json","count":0}
{"ts":"2026-10-27T00:44:39.412Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:39.415Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:39.415Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:39.424Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-graph-it-state-g32e8C/commands.json","count":0}
{"ts":"2026-10-27T00:44:42.587Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:b1942889-6d59-4440-82e8-34874b92d0ee"]}
{"ts":"2026-10-27T00:44:42.588Z","level":"warn","msg":"origin rejected","path":"/ws","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:36087","allowed":["localhost:36087","127.0.0.1:36087","[::1]:36087"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-27T00:44:43.588Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:43.592Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:43.592Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:43.601Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-exec-it-4dATqk/a/commands.json","count":0}
{"ts":"2026-10-27T00:44:44.082Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:44.083Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:44.083Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:44.090Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-exec-it-4dATqk/b/commands.json","count":0}
{"ts":"2026-10-27T00:44:45.198Z","level":"info","msg":"machine link closed","machine":"4e9b969a7b72c0c214605660a1f089aa","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:44:46.174Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:44:46.176Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:44:46.176Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:44:46.185Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-agent-it-state-ZjaWkx/commands.json","count":0}
{"ts":"2026-10-27T00:45:10.262Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:10.268Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:10.274Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:10.275Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:10.276Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:10.276Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:10.286Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-t7CX04/commands.json","count":0}
{"ts":"2026-10-27T00:45:10.286Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-zozfyr/commands.json","count":0}
{"ts":"2026-10-27T00:45:10.849Z","level":"info","msg":"extension started","extension":"user:env","run":"ffa9fd5b-63eb-4e42-82a2-4baaab9de8a8","state":"running"}
{"ts":"2026-10-27T00:45:11.216Z","level":"info","msg":"agent session attached","paneId":"ffe88c1f-1e04-42d6-a88a-6fde4142f774","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:45:11.349Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:11.350Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:11.350Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:11.359Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-l3bBZB/commands.json","count":0}
{"ts":"2026-10-27T00:45:11.380Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:11.382Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:11.383Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:11.391Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-gPq2qq/commands.json","count":0}
{"ts":"2026-10-27T00:45:11.784Z","level":"info","msg":"extension started","extension":"user:a","run":"31568822-3bcb-4c2a-8862-c1726bcefdf1","state":"running"}
{"ts":"2026-10-27T00:45:11.804Z","level":"info","msg":"extension started","extension":"user:b","run":"5ebf6bf2-0214-4662-9d86-5ae6e5e17fd4","state":"running"}
{"ts":"2026-10-27T00:45:12.157Z","level":"info","msg":"extension started","extension":"user:c","run":"4063d268-965a-4d6e-b99e-f3db7b012b3b","state":"running"}
{"ts":"2026-10-27T00:45:12.329Z","level":"info","msg":"extension started","extension":"user:a","run":"4d237496-f9e0-4a76-b525-d5a0fb9221ee","state":"running"}
{"ts":"2026-10-27T00:45:12.555Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:12.556Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:12.556Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:12.563Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-o6TMqZ/commands.json","count":0}
{"ts":"2026-10-27T00:45:12.779Z","level":"info","msg":"agent session attached","paneId":"05625701-6859-43ff-ac41-a4048a31d9e3","kind":"claude","session":"conv-KIL","source":"hook"}
{"ts":"2026-10-27T00:45:12.962Z","level":"info","msg":"extension started","extension":"user:basic","run":"41ddcfa6-f37a-46d7-b677-47764539cfda","state":"running"}
{"ts":"2026-10-27T00:45:13.010Z","level":"info","msg":"display set","paneId":"eb974b80-80e7-45bd-b91c-00d04afade6c","name":"m","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:45:13.016Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"eb974b80-80e7-45bd-b91c-00d04afade6c","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:45:13.057Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:13.058Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:13.058Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:13.063Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-gPq2qq/commands.json","count":0}
{"ts":"2026-10-27T00:45:13.131Z","level":"info","msg":"display set","paneId":"eb974b80-80e7-45bd-b91c-00d04afade6c","name":"w","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:45:13.394Z","level":"info","msg":"agent resume command written","paneId":"05625701-6859-43ff-ac41-a4048a31d9e3","kind":"claude","session":"conv-KIL"}
{"ts":"2026-10-27T00:45:13.472Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:13.473Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:13.473Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:13.478Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-nY4Vcb/commands.json","count":0}
{"ts":"2026-10-27T00:45:13.741Z","level":"info","msg":"display closed","paneId":"eb974b80-80e7-45bd-b91c-00d04afade6c","name":"m","reason":"closed"}
{"ts":"2026-10-27T00:45:13.896Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:13.897Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:13.898Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:13.907Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-ranadg/commands.json","count":0}
{"ts":"2026-10-27T00:45:14.353Z","level":"info","msg":"extension started","extension":"user:own","run":"74c2fa42-7c73-4243-a94d-fc8a19ef18b7","state":"running"}
{"ts":"2026-10-27T00:45:14.422Z","level":"info","msg":"display set","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","name":"mine","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:45:14.491Z","level":"info","msg":"display set","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","name":"theirs","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:45:14.491Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:45:14.693Z","level":"info","msg":"agent session attached","paneId":"ee495353-4a0f-42ce-99a1-363a5d76bb67","kind":"claude","session":"conv-TER","source":"hook"}
{"ts":"2026-10-27T00:45:14.927Z","level":"info","msg":"agent session attached","paneId":"a4b9fa6d-9aa3-4327-898b-5cbadf28727a","kind":"claude","session":"c06ef5bd","source":"hook"}
{"ts":"2026-10-27T00:45:14.991Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:14.992Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:14.992Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:15.000Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-nY4Vcb/commands.json","count":0}
{"ts":"2026-10-27T00:45:15.045Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:45:15.046Z","level":"info","msg":"display closed","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","name":"mine","reason":"closed"}
{"ts":"2026-10-27T00:45:15.047Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:45:15.049Z","level":"info","msg":"display set","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","name":"mine","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:45:15.052Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:45:15.069Z","level":"info","msg":"extension exited","extension":"user:own","run":"74c2fa42-7c73-4243-a94d-fc8a19ef18b7","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:45:15.097Z","level":"info","msg":"extension started","extension":"user:own","run":"606343c3-bc91-4373-941a-386e285e1ae9","state":"running"}
{"ts":"2026-10-27T00:45:15.148Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"f12b35ed-2619-4b33-b542-5166ac681467","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T00:45:15.277Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:15.278Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:15.278Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:15.287Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-sHd6LK/commands.json","count":0}
{"ts":"2026-10-27T00:45:15.320Z","level":"info","msg":"agent resume command written","paneId":"ee495353-4a0f-42ce-99a1-363a5d76bb67","kind":"claude","session":"conv-TER"}
{"ts":"2026-10-27T00:45:15.412Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:15.414Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:15.415Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:15.445Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-pNfbIM/commands.json","count":0}
{"ts":"2026-10-27T00:45:15.728Z","level":"info","msg":"extension started","extension":"user:crash","run":"bae2e0ce-5b2a-46ed-a6de-10a6bf6bfb5e","state":"running"}
{"ts":"2026-10-27T00:45:15.804Z","level":"info","msg":"extension exited","extension":"user:crash","run":"bae2e0ce-5b2a-46ed-a6de-10a6bf6bfb5e","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:45:15.883Z","level":"info","msg":"extension started","extension":"user:crash","run":"c0f1e618-8a8c-4e94-b414-3d7e34d74dee","state":"running"}
{"ts":"2026-10-27T00:45:15.928Z","level":"info","msg":"extension exited","extension":"user:crash","run":"c0f1e618-8a8c-4e94-b414-3d7e34d74dee","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:45:15.976Z","level":"info","msg":"extension started","extension":"user:crash","run":"b6fdbd81-f2bd-4879-a625-ec873b4c8967","state":"running"}
{"ts":"2026-10-27T00:45:16.017Z","level":"info","msg":"extension exited","extension":"user:crash","run":"b6fdbd81-f2bd-4879-a625-ec873b4c8967","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:45:16.058Z","level":"info","msg":"agent session attached","paneId":"5ed8f9a7-7755-4694-b2f0-efe86f407aee","kind":"claude","session":"conv-HUP","source":"hook"}
{"ts":"2026-10-27T00:45:16.106Z","level":"info","msg":"extension started","extension":"user:crash","run":"b8631fe2-b32a-4000-9d23-d1e0b46b90ea","state":"running"}
{"ts":"2026-10-27T00:45:16.140Z","level":"info","msg":"extension exited","extension":"user:crash","run":"b8631fe2-b32a-4000-9d23-d1e0b46b90ea","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:45:16.228Z","level":"info","msg":"extension started","extension":"user:crash","run":"6f619b05-3dc7-414c-8649-cbb0ff58bdf2","state":"running"}
{"ts":"2026-10-27T00:45:16.266Z","level":"info","msg":"extension exited","extension":"user:crash","run":"6f619b05-3dc7-414c-8649-cbb0ff58bdf2","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:45:16.266Z","level":"warn","msg":"extension failed","extension":"user:crash","state":"failed","failures":5}
{"ts":"2026-10-27T00:45:16.289Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:16.290Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:16.291Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:16.300Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-pNfbIM/commands.json","count":0}
{"ts":"2026-10-27T00:45:16.475Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:16.476Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:16.477Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:16.485Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-r1xHiR/commands.json","count":0}
{"ts":"2026-10-27T00:45:16.619Z","level":"info","msg":"agent resume command written","paneId":"5ed8f9a7-7755-4694-b2f0-efe86f407aee","kind":"claude","session":"conv-HUP"}
{"ts":"2026-10-27T00:45:16.687Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:16.688Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:16.688Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:16.697Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-EnwiJw/commands.json","count":0}
{"ts":"2026-10-27T00:45:16.898Z","level":"info","msg":"extension started","extension":"user:a","run":"1e08bdb0-f787-4b62-92e9-76b29e88cafd","state":"running"}
{"ts":"2026-10-27T00:45:16.907Z","level":"info","msg":"extension started","extension":"user:b","run":"ef844d2f-9f48-4f76-81fc-44d1c46f130a","state":"running"}
{"ts":"2026-10-27T00:45:17.254Z","level":"info","msg":"extension exited","extension":"user:b","run":"ef844d2f-9f48-4f76-81fc-44d1c46f130a","code":0,"signal":null,"reason":"exited"}
{"ts":"2026-10-27T00:45:17.356Z","level":"info","msg":"agent session attached","paneId":"c8e588b2-1577-476f-8965-da4e689862d8","kind":"claude","session":"conv-gra","source":"hook"}
{"ts":"2026-10-27T00:45:19.385Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:19.386Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:19.386Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:19.394Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-u4AWVC/commands.json","count":0}
{"ts":"2026-10-27T00:45:19.536Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:19.537Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:19.537Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:19.561Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-mkIj3m/commands.json","count":0}
{"ts":"2026-10-27T00:45:19.857Z","level":"info","msg":"extension started","extension":"user:noisy","run":"37460043-f28a-4422-827d-06a0f348ac73","state":"running"}
{"ts":"2026-10-27T00:45:20.217Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:20.218Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:20.218Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:20.229Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-miy6DM/commands.json","count":0}
{"ts":"2026-10-27T00:45:20.287Z","level":"info","msg":"agent session attached","paneId":"3737dc25-7652-4a4c-be5b-859311f2b480","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:45:20.647Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:20.648Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:20.648Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:20.650Z","level":"info","msg":"extension started","extension":"user:once","run":"482a73ba-9d1f-4308-b1df-e0f1124d0e9f","state":"running"}
{"ts":"2026-10-27T00:45:20.655Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-EnwiJw/commands.json","count":0}
{"ts":"2026-10-27T00:45:20.863Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:20.864Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:20.864Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:20.875Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-miy6DM/commands.json","count":0}
{"ts":"2026-10-27T00:45:20.979Z","level":"info","msg":"agent resume command written","paneId":"c8e588b2-1577-476f-8965-da4e689862d8","kind":"claude","session":"conv-gra"}
{"ts":"2026-10-27T00:45:21.059Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:21.060Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:21.060Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:21.067Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-nu2IaP/commands.json","count":0}
{"ts":"2026-10-27T00:45:21.271Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:21.272Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:21.272Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:21.280Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-3VwTuL/commands.json","count":0}
{"ts":"2026-10-27T00:45:21.760Z","level":"info","msg":"extension started","extension":"user:four","run":"fc18143a-b8a6-43fa-83eb-93a55be62501","state":"running"}
{"ts":"2026-10-27T00:45:21.801Z","level":"info","msg":"display set","paneId":"d9b7c9bc-c87c-4bd3-997e-4ccb7af8ef95","name":"e1","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T00:45:21.802Z","level":"info","msg":"display set","paneId":"d9b7c9bc-c87c-4bd3-997e-4ccb7af8ef95","name":"e2","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T00:45:21.901Z","level":"info","msg":"display set","paneId":"d9b7c9bc-c87c-4bd3-997e-4ccb7af8ef95","name":"p1","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:45:21.901Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"d9b7c9bc-c87c-4bd3-997e-4ccb7af8ef95","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:45:21.903Z","level":"info","msg":"display set","paneId":"d9b7c9bc-c87c-4bd3-997e-4ccb7af8ef95","name":"p2","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:45:21.903Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"d9b7c9bc-c87c-4bd3-997e-4ccb7af8ef95","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:45:22.424Z","level":"info","msg":"agent session attached","paneId":"af5562f4-a206-4f89-b5d0-4b7402d4cb8d","kind":"claude","session":"conv-lat","source":"hook"}
{"ts":"2026-10-27T00:45:22.611Z","level":"info","msg":"display closed","paneId":"d9b7c9bc-c87c-4bd3-997e-4ccb7af8ef95","name":"e1","reason":"closed"}
{"ts":"2026-10-27T00:45:22.612Z","level":"info","msg":"display closed","paneId":"d9b7c9bc-c87c-4bd3-997e-4ccb7af8ef95","name":"e2","reason":"closed"}
{"ts":"2026-10-27T00:45:22.723Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:22.724Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:22.724Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:22.732Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-rNsljD/commands.json","count":0}
{"ts":"2026-10-27T00:45:23.174Z","level":"info","msg":"extension started","extension":"user:bad","run":"1e7dbb15-4de7-47e8-943d-aca189d5915b","state":"running"}
{"ts":"2026-10-27T00:45:23.185Z","level":"info","msg":"extension started","extension":"user:big","run":"c39f9e75-f90d-400d-9007-21160e857bbc","state":"running"}
{"ts":"2026-10-27T00:45:23.278Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"1e7dbb15-4de7-47e8-943d-aca189d5915b","reason":"bad_lines"}
{"ts":"2026-10-27T00:45:23.346Z","level":"info","msg":"extension exited","extension":"user:bad","run":"1e7dbb15-4de7-47e8-943d-aca189d5915b","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T00:45:23.404Z","level":"info","msg":"extension started","extension":"user:bad","run":"a8f36029-0994-4a4b-bd41-bf75d1f2333b","state":"running"}
{"ts":"2026-10-27T00:45:23.436Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"a8f36029-0994-4a4b-bd41-bf75d1f2333b","reason":"bad_lines"}
{"ts":"2026-10-27T00:45:23.439Z","level":"info","msg":"extension exited","extension":"user:bad","run":"a8f36029-0994-4a4b-bd41-bf75d1f2333b","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T00:45:23.487Z","level":"info","msg":"extension started","extension":"user:bad","run":"1439f9f4-5c19-477d-acc6-408c5235423c","state":"running"}
{"ts":"2026-10-27T00:45:23.538Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"1439f9f4-5c19-477d-acc6-408c5235423c","reason":"bad_lines"}
{"ts":"2026-10-27T00:45:23.539Z","level":"info","msg":"extension exited","extension":"user:bad","run":"1439f9f4-5c19-477d-acc6-408c5235423c","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T00:45:23.679Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:23.680Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:23.680Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:23.690Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-VcCgSC/commands.json","count":0}
{"ts":"2026-10-27T00:45:23.777Z","level":"info","msg":"agent session attached","paneId":"56912bba-5247-4f55-a25d-e576fb26ecdb","kind":"claude","session":"b57505b2","source":"hook"}
{"ts":"2026-10-27T00:45:24.105Z","level":"info","msg":"extension started","extension":"user:plain","run":"d1fb7535-e550-4c61-9ab9-afb0adcc5604","state":"running"}
{"ts":"2026-10-27T00:45:24.114Z","level":"info","msg":"extension started","extension":"user:allowed","run":"f3d376c8-7c4e-4c17-bf33-36a27ff89548","state":"running"}
{"ts":"2026-10-27T00:45:24.313Z","level":"info","msg":"display script enabled","byClientId":"35c175b9-0648-4a00-8180-75ae555d957b","byKind":"external"}
{"ts":"2026-10-27T00:45:24.428Z","level":"info","msg":"display script enabled","byClientId":"35c175b9-0648-4a00-8180-75ae555d957b","byKind":"external"}
{"ts":"2026-10-27T00:45:24.433Z","level":"info","msg":"display set","paneId":"9b0b48b5-85f6-4792-a2de-75d0ff333fc7","name":"g","kind":"panel","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T00:45:24.533Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"9b0b48b5-85f6-4792-a2de-75d0ff333fc7","connId":"pane-socket:1","code":"display_closed"}
{"ts":"2026-10-27T00:45:24.588Z","level":"info","msg":"display closed","paneId":"9b0b48b5-85f6-4792-a2de-75d0ff333fc7","name":"g","reason":"script_disabled"}
{"ts":"2026-10-27T00:45:24.681Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:24.682Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:24.682Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:24.691Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-EDH6Ks/commands.json","count":0}
{"ts":"2026-10-27T00:45:25.245Z","level":"info","msg":"extension started","extension":"user:hello","run":"112f782e-f392-4808-839f-107de45a66a0","state":"running"}
{"ts":"2026-10-27T00:45:25.286Z","level":"info","msg":"display set","paneId":"a1d438e7-8912-46df-95ce-6180d16bfad7","name":"hello","kind":"band","format":"text","bytes":33,"rev":1}
{"ts":"2026-10-27T00:45:25.371Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"a1d438e7-8912-46df-95ce-6180d16bfad7","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:45:25.424Z","level":"info","msg":"display closed","paneId":"a1d438e7-8912-46df-95ce-6180d16bfad7","name":"hello","reason":"closed"}
{"ts":"2026-10-27T00:45:25.501Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"a1d438e7-8912-46df-95ce-6180d16bfad7","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:45:25.542Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:25.543Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:25.543Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:25.551Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-4vJ0wG/commands.json","count":0}
{"ts":"2026-10-27T00:45:25.982Z","level":"info","msg":"extension started","extension":"user:t10","run":"729918b0-5439-4d40-8b6c-a0cdeb575acd","state":"running"}
{"ts":"2026-10-27T00:45:26.412Z","level":"info","msg":"extension started","extension":"user:t10","run":"0965723f-f7f2-4523-84c5-dcacc3fb9d22","state":"running"}
{"ts":"2026-10-27T00:45:26.589Z","level":"info","msg":"pane socket: request","op":"extension.list","paneId":"a78b8cc5-68b9-4948-855a-7174c841a422","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:45:26.592Z","level":"info","msg":"pane socket: request","op":"extension.setEnabled","paneId":"a78b8cc5-68b9-4948-855a-7174c841a422","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:45:26.593Z","level":"info","msg":"pane socket: request","op":"extension.reload","paneId":"a78b8cc5-68b9-4948-855a-7174c841a422","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T00:45:26.631Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:26.632Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:26.632Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:26.640Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-bDHiq7/commands.json","count":0}
{"ts":"2026-10-27T00:45:29.004Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:3737dc25-7652-4a4c-be5b-859311f2b480"]}
{"ts":"2026-10-27T00:45:29.150Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:29.151Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:29.151Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:29.177Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-2UL46t/commands.json","count":0}
{"ts":"2026-10-27T00:45:29.224Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:29.226Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:29.226Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:29.238Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-8EfxlB/commands.json","count":0}
{"ts":"2026-10-27T00:45:29.692Z","level":"info","msg":"extension started","extension":"user:slow","run":"f55f71af-4d7d-43c9-99a2-d34317870ee1","state":"running"}
{"ts":"2026-10-27T00:45:29.999Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:30.000Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:30.000Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:30.010Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-RFFItK/commands.json","count":0}
{"ts":"2026-10-27T00:45:30.026Z","level":"info","msg":"agent session attached","paneId":"caae936a-1b12-49b3-ba66-35ac19098861","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:45:31.930Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:31.931Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:31.931Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:31.939Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-RFFItK/commands.json","count":0}
{"ts":"2026-10-27T00:45:32.270Z","level":"info","msg":"agent resume skipped","paneId":"bc4a5ab9-5fb4-47c2-861b-d2d3f0f71bc6","reason":"no-session-ref"}
{"ts":"2026-10-27T00:45:32.578Z","level":"info","msg":"agent resume skipped","paneId":"0754889e-a890-4b1c-bfc6-fcd90ab26761","reason":"no-session-ref"}
{"ts":"2026-10-27T00:45:33.269Z","level":"info","msg":"agent session attached","paneId":"fe5a8d83-0189-4749-bd0b-a0af955979c1","kind":"claude","session":"cdb536b5","source":"hook"}
{"ts":"2026-10-27T00:45:33.800Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:33.801Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:33.801Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:33.810Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-uZEO7O/commands.json","count":0}
{"ts":"2026-10-27T00:45:34.776Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:34.777Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:34.777Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:34.786Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-QrcaCi/commands.json","count":0}
{"ts":"2026-10-27T00:45:35.382Z","level":"info","msg":"agent session attached","paneId":"2c38932f-e529-48ef-903c-d32864f7a276","kind":"claude","session":"conv-qui","source":"hook"}
{"ts":"2026-10-27T00:45:35.977Z","level":"info","msg":"agent session attached","paneId":"101555b8-961b-4842-b21a-0e2f79c36ae3","kind":"claude","session":"be164ec3","source":"hook"}
{"ts":"2026-10-27T00:45:36.919Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:36.919Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:36.920Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:36.928Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-o6PAXd/commands.json","count":0}
{"ts":"2026-10-27T00:45:37.964Z","level":"info","msg":"pane socket: request","op":"extension.approve","paneId":"d29c8dc5-a7cb-4cc6-93ca-156467359d60","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:45:37.966Z","level":"info","msg":"pane socket: request","op":"extension.deny","paneId":"d29c8dc5-a7cb-4cc6-93ca-156467359d60","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:45:37.967Z","level":"info","msg":"pane socket: request","op":"extension.revoke","paneId":"d29c8dc5-a7cb-4cc6-93ca-156467359d60","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T00:45:38.323Z","level":"info","msg":"extension started","extension":"project:b552b2199dbc445bb474d88ec6b1ad86c6e090c4065df20da6f0814b64338da6:p2","run":"02d73c70-52ed-4c7a-9dfd-7ec08483d289","state":"running"}
{"ts":"2026-10-27T00:45:38.601Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:38.601Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:38.601Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:38.609Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-o6PAXd/commands.json","count":0}
{"ts":"2026-10-27T00:45:38.932Z","level":"info","msg":"agent resume skipped","paneId":"d29c8dc5-a7cb-4cc6-93ca-156467359d60","reason":"no-session-ref"}
{"ts":"2026-10-27T00:45:39.237Z","level":"info","msg":"agent resume skipped","paneId":"1c1e9b38-0ffa-4751-bf5a-e9ecdd0bc51a","reason":"no-session-ref"}
{"ts":"2026-10-27T00:45:39.279Z","level":"info","msg":"extension started","extension":"project:b552b2199dbc445bb474d88ec6b1ad86c6e090c4065df20da6f0814b64338da6:p2","run":"5a3bf4a3-46ec-47a6-9d45-709cf9f51ccc","state":"running"}
{"ts":"2026-10-27T00:45:39.869Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:39.870Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:39.870Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:39.889Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-o6PAXd/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T00:45:40.097Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:40.098Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:40.098Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:40.108Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-je6bxb/commands.json","count":0}
{"ts":"2026-10-27T00:45:40.773Z","level":"info","msg":"agent session attached","paneId":"9b33d194-2df4-449d-ba48-f0d49f777546","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:45:40.831Z","level":"info","msg":"extension started","extension":"project:b552b2199dbc445bb474d88ec6b1ad86c6e090c4065df20da6f0814b64338da6:p2","run":"0fc2f1ae-b14d-4369-92ce-02c22ec71f19","state":"running"}
{"ts":"2026-10-27T00:45:41.025Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:41.026Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:41.026Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:41.035Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-lBq88w/commands.json","count":0}
{"ts":"2026-10-27T00:45:41.704Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:41.705Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:41.705Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:41.714Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-yBhKua/commands.json","count":0}
{"ts":"2026-10-27T00:45:42.244Z","level":"info","msg":"extension started","extension":"project:058afc13a86517e80ab7e0ba284c6469bf36b2526a969e12ff7606b9b65ba835:a","run":"98f5382e-351d-4887-a863-32a9ae58bc11","state":"running"}
{"ts":"2026-10-27T00:45:42.315Z","level":"info","msg":"extension started","extension":"project:058afc13a86517e80ab7e0ba284c6469bf36b2526a969e12ff7606b9b65ba835:b","run":"8c1becbe-8b7f-49c0-939b-a9b7ab1498c8","state":"running"}
{"ts":"2026-10-27T00:45:42.336Z","level":"info","msg":"agent session attached","paneId":"bdcb6b51-3303-4a12-a538-b3b41378d994","kind":"claude","session":"../../et","source":"hook"}
{"ts":"2026-10-27T00:45:42.608Z","level":"info","msg":"extension started","extension":"project:058afc13a86517e80ab7e0ba284c6469bf36b2526a969e12ff7606b9b65ba835:a","run":"088be45d-eb51-49dd-9796-935c32830310","state":"running"}
{"ts":"2026-10-27T00:45:43.100Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:43.101Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:43.101Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:43.112Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-MYe6D5/commands.json","count":0}
{"ts":"2026-10-27T00:45:43.159Z","level":"info","msg":"extension started","extension":"project:058afc13a86517e80ab7e0ba284c6469bf36b2526a969e12ff7606b9b65ba835:a","run":"258d323a-cbe3-4d32-a2e8-017996099453","state":"running"}
{"ts":"2026-10-27T00:45:43.429Z","level":"info","msg":"extension started","extension":"project:058afc13a86517e80ab7e0ba284c6469bf36b2526a969e12ff7606b9b65ba835:a","run":"4c4ff8a7-0e9e-4b09-8ca3-90c17159d8c5","state":"running"}
{"ts":"2026-10-27T00:45:43.702Z","level":"info","msg":"agent session attached","paneId":"87a0f30c-f4a0-4c60-a59c-6bc0cbd32997","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:45:43.723Z","level":"info","msg":"extension started","extension":"project:058afc13a86517e80ab7e0ba284c6469bf36b2526a969e12ff7606b9b65ba835:a","run":"ae2942ab-f3df-4a8b-a0a9-4d537174cc38","state":"running"}
{"ts":"2026-10-27T00:45:44.527Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:44.528Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:44.528Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:44.537Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-5QIceA/commands.json","count":0}
{"ts":"2026-10-27T00:45:44.919Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:87a0f30c-f4a0-4c60-a59c-6bc0cbd32997"]}
{"ts":"2026-10-27T00:45:45.600Z","level":"info","msg":"extension started","extension":"project:c7aa3e3bc4869d5e4cd5fec42b845ca0c16e0efd94ec490274ab1d31d3c2eb5c:p4","run":"75563c1e-c5bb-4e3a-a385-7c20d10f252a","state":"running"}
{"ts":"2026-10-27T00:45:45.649Z","level":"info","msg":"extension exited","extension":"project:c7aa3e3bc4869d5e4cd5fec42b845ca0c16e0efd94ec490274ab1d31d3c2eb5c:p4","run":"75563c1e-c5bb-4e3a-a385-7c20d10f252a","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:45:46.590Z","level":"info","msg":"agent session dropped (agent gone, shell alive)","paneId":"2c38932f-e529-48ef-903c-d32864f7a276","graceMs":10000,"kind":"claude","session":"conv-qui","reason":"agent ended"}
{"ts":"2026-10-27T00:45:46.767Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:46.769Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:46.769Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:46.776Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-QrcaCi/commands.json","count":0}
{"ts":"2026-10-27T00:45:47.100Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:865b3994-e474-4f80-a73e-5a6ddf918b82"]}
{"ts":"2026-10-27T00:45:47.101Z","level":"info","msg":"agent resume skipped","paneId":"2c38932f-e529-48ef-903c-d32864f7a276","reason":"no-session-ref"}
{"ts":"2026-10-27T00:45:47.154Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:47.156Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:47.156Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:47.187Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-rioqj4/commands.json","count":0}
{"ts":"2026-10-27T00:45:47.367Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:47.368Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:47.368Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:47.380Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-8G8bg1/commands.json","count":0}
{"ts":"2026-10-27T00:45:47.899Z","level":"info","msg":"agent session attached","paneId":"a93257c8-9b4b-4551-9c27-6071ab49ba49","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:45:48.862Z","level":"info","msg":"extension started","extension":"project:a57359541047f43a23e8d7dce89603c46912c00303409dbc5772028a18b337eb:p5","run":"6ca655ce-5d89-4c01-93d5-6de0454774b8","state":"running"}
{"ts":"2026-10-27T00:45:49.115Z","level":"info","msg":"extension started","extension":"project:a57359541047f43a23e8d7dce89603c46912c00303409dbc5772028a18b337eb:p5","run":"d803ab2a-9f40-4e6f-aa77-1bfe5f19003a","state":"running"}
{"ts":"2026-10-27T00:45:49.163Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:49.164Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:49.164Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:49.170Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-ED6oOS/commands.json","count":0}
{"ts":"2026-10-27T00:45:49.179Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:49.180Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:49.180Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:49.189Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-8G8bg1/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T00:45:49.867Z","level":"info","msg":"extension started","extension":"project:a57359541047f43a23e8d7dce89603c46912c00303409dbc5772028a18b337eb:p5","run":"3f7b2e12-5f3d-421f-91bb-338bde83f088","state":"running"}
{"ts":"2026-10-27T00:45:49.927Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:7f655181-1280-4b03-8ba1-25aa303f9f37"]}
{"ts":"2026-10-27T00:45:50.217Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:50.219Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:50.219Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:50.227Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-rHHrsG/commands.json","count":0}
{"ts":"2026-10-27T00:45:50.407Z","level":"info","msg":"agent session attached","paneId":"8acd7877-31fe-408e-b6e3-cf579941a02e","kind":"claude","session":"conv-bc","source":"hook"}
{"ts":"2026-10-27T00:45:50.446Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:50.447Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:50.447Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:50.472Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-ED6oOS/commands.json","count":0}
{"ts":"2026-10-27T00:45:50.807Z","level":"info","msg":"agent resume command written","paneId":"8acd7877-31fe-408e-b6e3-cf579941a02e","kind":"claude","session":"conv-bc"}
{"ts":"2026-10-27T00:45:50.880Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:50.881Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:50.881Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:50.888Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-nfo9Qa/state-ED6oOS/commands.json","count":0}
{"ts":"2026-10-27T00:45:50.953Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:50.954Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:50.954Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:50.965Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-5qHk5Q/commands.json","count":0}
{"ts":"2026-10-27T00:45:51.208Z","level":"info","msg":"agent resume command written","paneId":"8acd7877-31fe-408e-b6e3-cf579941a02e","kind":"claude","session":"conv-bc"}
{"ts":"2026-10-27T00:45:52.076Z","level":"info","msg":"extension started","extension":"project:ef948bb416fafd17d8ded9917f3e8b8cd40fdbbfaca33c49778852999b54fbfa:p5b","run":"50b7362c-8a53-452d-a00e-36ceed2adaf4","state":"running"}
{"ts":"2026-10-27T00:45:52.141Z","level":"info","msg":"extension exited","extension":"project:ef948bb416fafd17d8ded9917f3e8b8cd40fdbbfaca33c49778852999b54fbfa:p5b","run":"50b7362c-8a53-452d-a00e-36ceed2adaf4","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:45:52.210Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:52.212Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:52.213Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:52.219Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-YIkkPJ/commands.json","count":0}
{"ts":"2026-10-27T00:45:52.256Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:52.257Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:52.257Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:52.264Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-nTo8sU/commands.json","count":0}
{"ts":"2026-10-27T00:45:53.704Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:53.705Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:53.705Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:53.715Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-VxA5Cs/commands.json","count":0}
{"ts":"2026-10-27T00:45:53.756Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:53.757Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:53.757Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:53.762Z","level":"warn","msg":"subagents: too many, not counting more","paneId":"047d822c-efe0-4ed4-a7d7-39575772f63c","limit":256}
{"ts":"2026-10-27T00:45:53.773Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-2w0f63/commands.json","count":0}
{"ts":"2026-10-27T00:45:53.862Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:53.863Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:53.863Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:53.869Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-PKG8zx/commands.json","count":0}
{"ts":"2026-10-27T00:45:54.576Z","level":"info","msg":"agent session attached","paneId":"9909ff5a-dec8-4611-a488-95e407ee1a48","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:45:55.046Z","level":"info","msg":"extension started","extension":"project:09e541031699582fca9550d1944e8ebe56604d617707e4524ec6b42c5ea9f0fc:p6","run":"0fc3a325-eab1-4eb0-ad16-596f0ee84acb","state":"running"}
{"ts":"2026-10-27T00:45:55.877Z","level":"info","msg":"display set","paneId":"a01a44c9-8f51-42e8-835c-b3d16cb7e00b","name":"m","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T00:45:55.929Z","level":"info","msg":"display closed","paneId":"a01a44c9-8f51-42e8-835c-b3d16cb7e00b","name":"m","reason":"closed"}
{"ts":"2026-10-27T00:45:56.117Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:56.119Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:56.119Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:56.139Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Gt4wb3/commands.json","count":0}
{"ts":"2026-10-27T00:45:56.269Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:56.275Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:56.275Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:56.286Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-2vJrbp/commands.json","count":0}
{"ts":"2026-10-27T00:45:57.342Z","level":"info","msg":"display script enabled","byClientId":"6ab0c34e-d9d7-4f18-ab26-4c79ab0b1837","byKind":"desktop"}
{"ts":"2026-10-27T00:45:57.408Z","level":"info","msg":"extension started","extension":"project:1b1ef6f350b183d1c14bdf08140d9c4b71dbd346f1ec087b7275b0e3a52c5a09:p7","run":"d60401b7-18b5-45db-ade1-9f16a2ea870e","state":"running"}
{"ts":"2026-10-27T00:45:58.176Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:45:58.177Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:45:58.177Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:45:58.203Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-FzoNW8/commands.json","count":0}
{"ts":"2026-10-27T00:45:58.559Z","level":"info","msg":"extension started","extension":"project:1b1ef6f350b183d1c14bdf08140d9c4b71dbd346f1ec087b7275b0e3a52c5a09:p7","run":"32ba1c1c-4451-4184-983a-5843ad5620d4","state":"running"}
{"ts":"2026-10-27T00:45:59.429Z","level":"info","msg":"display set","paneId":"0d341aea-5cd5-4bc3-ae6b-5fc713d4efc9","name":"s","kind":"panel","format":"script-html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:45:59.470Z","level":"info","msg":"display closed","paneId":"0d341aea-5cd5-4bc3-ae6b-5fc713d4efc9","name":"s","reason":"script_disabled"}
{"ts":"2026-10-27T00:45:59.595Z","level":"info","msg":"extension started","extension":"project:1b1ef6f350b183d1c14bdf08140d9c4b71dbd346f1ec087b7275b0e3a52c5a09:p7","run":"2c2ce756-b445-4d55-b8fe-d0a897eb11fc","state":"running"}
{"ts":"2026-10-27T00:46:00.665Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:00.666Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:00.666Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:00.678Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-NobAiK/commands.json","count":0}
{"ts":"2026-10-27T00:46:00.825Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:00.825Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:00.825Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:00.834Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-BWTub2/commands.json","count":0}
{"ts":"2026-10-27T00:46:01.131Z","level":"info","msg":"extension started","extension":"user:p10u","run":"3ae11caa-1ab7-4f12-869f-251e47d4149a","state":"running"}
{"ts":"2026-10-27T00:46:01.821Z","level":"info","msg":"extension started","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"9a7c8a31-b3e7-43e5-81aa-6886847d5d2e","state":"running"}
{"ts":"2026-10-27T00:46:02.008Z","level":"info","msg":"extension exited","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"9a7c8a31-b3e7-43e5-81aa-6886847d5d2e","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:02.041Z","level":"info","msg":"extension started","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"60c8713a-faa8-4e01-aaf7-f7728ed839e5","state":"running"}
{"ts":"2026-10-27T00:46:02.147Z","level":"info","msg":"extension exited","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"60c8713a-faa8-4e01-aaf7-f7728ed839e5","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:02.200Z","level":"info","msg":"extension started","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"2d554604-bd43-45e4-b67e-f67846849605","state":"running"}
{"ts":"2026-10-27T00:46:02.355Z","level":"info","msg":"extension exited","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"2d554604-bd43-45e4-b67e-f67846849605","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:02.419Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:02.420Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:02.420Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:02.429Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-iGzay0/commands.json","count":0}
{"ts":"2026-10-27T00:46:02.449Z","level":"info","msg":"extension started","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"6bda9ade-6555-4196-936a-c1cf98cb9e8a","state":"running"}
{"ts":"2026-10-27T00:46:02.573Z","level":"info","msg":"extension exited","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"6bda9ade-6555-4196-936a-c1cf98cb9e8a","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:02.717Z","level":"info","msg":"extension started","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"049d70e3-4c36-422f-9c66-7523aa2ccb0d","state":"running"}
{"ts":"2026-10-27T00:46:02.882Z","level":"info","msg":"extension exited","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","run":"049d70e3-4c36-422f-9c66-7523aa2ccb0d","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:02.883Z","level":"warn","msg":"extension failed","extension":"project:9da1162dc1d61d33a9eaa9fad48f6481e42021b5d0b02b882a9d2b14af9d1668:p10","state":"failed","failures":5}
[graph-perf] {"case":"single-change","panes":16,"links":32,"limitMs":2000,"results":[{"source":0,"toStartMs":[13,13],"toSentMs":[1105,1105]},{"source":5,"toStartMs":[377,377],"toSentMs":[1317,1317]},{"source":10,"toStartMs":[72,107],"toSentMs":[1217,1217]}]}
{"ts":"2026-10-27T00:46:03.441Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:03.442Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:03.442Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:03.454Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-N8Yu8b/commands.json","count":0}
{"ts":"2026-10-27T00:46:03.964Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:03.965Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:03.965Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:03.978Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-BDvQsb/commands.json","count":0}
{"ts":"2026-10-27T00:46:04.712Z","level":"info","msg":"extension started","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"ae3cfec9-d259-4a82-b6cc-c59fc2b82da7","state":"running"}
{"ts":"2026-10-27T00:46:04.713Z","level":"info","msg":"extension exited","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"ae3cfec9-d259-4a82-b6cc-c59fc2b82da7","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:04.792Z","level":"info","msg":"extension started","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"963ed86c-63cb-4423-adde-5b29cabe645d","state":"running"}
{"ts":"2026-10-27T00:46:04.800Z","level":"info","msg":"extension exited","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"963ed86c-63cb-4423-adde-5b29cabe645d","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:04.864Z","level":"info","msg":"extension started","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"85092cb7-c121-44d8-bbd5-613b53f411c1","state":"running"}
{"ts":"2026-10-27T00:46:04.866Z","level":"info","msg":"extension exited","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"85092cb7-c121-44d8-bbd5-613b53f411c1","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:04.963Z","level":"info","msg":"extension started","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"1bda50c5-822e-488b-8ec9-229ef0c82f3a","state":"running"}
{"ts":"2026-10-27T00:46:04.965Z","level":"info","msg":"extension exited","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"1bda50c5-822e-488b-8ec9-229ef0c82f3a","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:04.970Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:04.970Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:04.971Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:04.981Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-qtCBqn/commands.json","count":0}
{"ts":"2026-10-27T00:46:05.059Z","level":"info","msg":"extension started","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"a0bbf8ca-1d9d-4bcc-8592-17443ff6f3fd","state":"running"}
{"ts":"2026-10-27T00:46:05.061Z","level":"info","msg":"extension exited","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","run":"a0bbf8ca-1d9d-4bcc-8592-17443ff6f3fd","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:46:05.061Z","level":"warn","msg":"extension failed","extension":"project:30c01f5fef6e64adedfc6a8fa81c3cc6d913c4b15a5cda92c0f3a0da78e08e73:p10b","state":"failed","failures":5}
{"ts":"2026-10-27T00:46:06.253Z","level":"info","msg":"agent session attached","paneId":"eb0c1b27-304b-4a42-bcc6-61963db33546","kind":"claude","session":"resume-m","source":"hook"}
{"ts":"2026-10-27T00:46:06.266Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:06.267Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:06.267Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:06.292Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-OqvKJq/commands.json","count":0}
{"ts":"2026-10-27T00:46:06.425Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:06.427Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:06.427Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:06.438Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-lVoKFs/commands.json","count":0}
{"ts":"2026-10-27T00:46:09.021Z","level":"info","msg":"extension started","extension":"project:9dd876476d3cdbf15e7d6f3292f178a5153cdda17acd407966b9f86709b30288:p9","run":"b2c91dbd-3fe7-4bda-9f1f-b46901374b78","state":"running"}
{"ts":"2026-10-27T00:46:10.345Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:10.348Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:10.348Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:10.358Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-nggtOy/commands.json","count":0}
{"ts":"2026-10-27T00:46:10.668Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:10.669Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:10.669Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:10.679Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-VlxbVG/commands.json","count":0}
{"ts":"2026-10-27T00:46:11.707Z","level":"info","msg":"agent session attached","paneId":"fd50e2b7-a519-414d-b64a-0ac31b7076fb","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T00:46:12.178Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:12.179Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:12.179Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:12.205Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-xGQrjh/commands.json","count":0}
{"ts":"2026-10-27T00:46:12.287Z","level":"info","msg":"agent session attached","paneId":"fd50e2b7-a519-414d-b64a-0ac31b7076fb","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T00:46:12.395Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:12.396Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:12.396Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:12.402Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-zYJ3HI/commands.json","count":0}
{"ts":"2026-10-27T00:46:12.648Z","level":"info","msg":"agent session attached","paneId":"ab27fd17-7ee7-4d49-9522-cc280df78a5d","kind":"grok","session":"grok-1","source":"hook"}
{"ts":"2026-10-27T00:46:12.651Z","level":"info","msg":"agent session attached","paneId":"ab27fd17-7ee7-4d49-9522-cc280df78a5d","kind":"qodercli","session":"qodercli","source":"hook"}
{"ts":"2026-10-27T00:46:12.652Z","level":"info","msg":"agent session attached","paneId":"ab27fd17-7ee7-4d49-9522-cc280df78a5d","kind":"devin","session":"devin-1","source":"hook"}
{"ts":"2026-10-27T00:46:12.691Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:12.692Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:12.692Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:12.702Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-T0ci4p/commands.json","count":0}
{"ts":"2026-10-27T00:46:13.451Z","level":"info","msg":"agent session attached","paneId":"ab6d4b07-d5c5-40d8-bf0c-7c55c6d7e23d","kind":"codex","session":"marker-b","source":"hook"}
{"ts":"2026-10-27T00:46:13.491Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:13.492Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:13.492Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:13.500Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-4h48Lj/commands.json","count":0}
{"ts":"2026-10-27T00:46:14.232Z","level":"info","msg":"agent session attached","paneId":"ade6ea34-2151-440d-b482-6bdcd321460f","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T00:46:14.234Z","level":"info","msg":"agent report ignored","paneId":"ade6ea34-2151-440d-b482-6bdcd321460f","kind":"claude","session":"conv-dae","reason":"the reporting process is not a descendant of the pane's shell","agentPid":1244217}
{"ts":"2026-10-27T00:46:14.951Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:14.952Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:14.952Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:14.958Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-trZlxO/commands.json","count":0}
{"ts":"2026-10-27T00:46:15.228Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:15.229Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:15.229Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:15.239Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-EcwFua/commands.json","count":0}
[graph-perf] {"case":"blocked","panes":16,"links":32,"holdMs":1000,"limitMs":2000,"results":[{"source":0,"triggerStartMs":1357,"approvalStartMs":1484},{"source":5,"triggerStartMs":1334,"approvalStartMs":1388},{"source":10,"triggerStartMs":1363,"approvalStartMs":1422}]}
{"ts":"2026-10-27T00:46:16.071Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:16.072Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:16.072Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:16.081Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-dXFkPz/commands.json","count":0}
{"ts":"2026-10-27T00:46:16.159Z","level":"info","msg":"agent session attached","paneId":"a0646054-b99a-4c85-ae6e-8184ae4666a4","kind":"claude","session":"conv-nop","source":"hook"}
{"ts":"2026-10-27T00:46:16.213Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:16.213Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:16.214Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:16.221Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-A03piM/commands.json","count":0}
{"ts":"2026-10-27T00:46:17.087Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:17.087Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:17.088Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:17.096Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-uuN4Td/commands.json","count":0}
{"ts":"2026-10-27T00:46:17.592Z","level":"info","msg":"agent session attached","paneId":"d5f91bdf-7be9-40c7-84c7-132e3dd8ba83","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T00:46:17.593Z","level":"info","msg":"agent report ignored","paneId":"d5f91bdf-7be9-40c7-84c7-132e3dd8ba83","kind":"claude","reason":"the reporting process is not the pane's front agent (a nested or unrelated process)","agentPid":1244718}
{"ts":"2026-10-27T00:46:18.335Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:18.336Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:18.336Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:18.342Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-zwrRrV/commands.json","count":0}
{"ts":"2026-10-27T00:46:18.519Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:18.520Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:18.520Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:18.542Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-RoYcqP/commands.json","count":0}
{"ts":"2026-10-27T00:46:20.039Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:20.040Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:20.040Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:20.048Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-9z1GN5/commands.json","count":0}
{"ts":"2026-10-27T00:46:20.178Z","level":"info","msg":"agent session attached","paneId":"d6f5766f-6065-4d94-90d0-f59979ed2866","kind":"claude","session":"conv-fir","source":"hook"}
{"ts":"2026-10-27T00:46:20.969Z","level":"info","msg":"agent session dropped (a different agent started without reporting)","paneId":"d6f5766f-6065-4d94-90d0-f59979ed2866","kind":"claude","session":"conv-fir","sinceGoneMs":610.0293259999999}
{"ts":"2026-10-27T00:46:21.071Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:21.073Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:21.073Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:21.081Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-oN9OYq/commands.json","count":0}
{"ts":"2026-10-27T00:46:21.827Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:21.828Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:21.828Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:21.836Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-dYJQ8O/commands.json","count":0}
{"ts":"2026-10-27T00:46:22.291Z","level":"info","msg":"agent session attached","paneId":"e9a99489-e0d6-4788-afd9-75f6db187c81","kind":"codex","session":"01a1235d","source":"sole-codex"}
{"ts":"2026-10-27T00:46:22.380Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:22.380Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:22.381Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:22.402Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-Z3kuRI/commands.json","count":0}
{"ts":"2026-10-27T00:46:22.970Z","level":"info","msg":"agent report ignored","paneId":"74ae01a9-b8c8-448a-89ce-92e8ed08a259","kind":"codex","session":"01a1235d","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): its cwd is not the pane's","agentPid":1244217}
{"ts":"2026-10-27T00:46:22.971Z","level":"info","msg":"agent report ignored","paneId":"74ae01a9-b8c8-448a-89ce-92e8ed08a259","kind":"codex","session":"01a1235d","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): the report carries no cwd","agentPid":1244217}
{"ts":"2026-10-27T00:46:23.475Z","level":"info","msg":"agent session attached","paneId":"74ae01a9-b8c8-448a-89ce-92e8ed08a259","kind":"codex","session":"01a1235d","source":"sole-codex"}
{"ts":"2026-10-27T00:46:23.588Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:23.589Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:23.589Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:23.597Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-bc3gqZ/commands.json","count":0}
{"ts":"2026-10-27T00:46:24.100Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:24.101Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:24.101Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:24.112Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-yI0fKd/commands.json","count":0}
[graph-perf] {"case":"burst","panes":16,"links":32,"limitMs":2000,"maxFirstStartMs":111,"firstStartMs":[111,111,111,111,111,111,111,111,111,111,111,111,111,111,111,111]}
{"ts":"2026-10-27T00:46:25.544Z","level":"info","msg":"agent report ignored","paneId":"944faf85-f9ab-40e5-8aa9-1e9245bb33e1","kind":"codex","session":"codex-tw","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1244217}
{"ts":"2026-10-27T00:46:25.546Z","level":"info","msg":"agent report ignored","paneId":"71958764-f355-4dc5-b061-382f0d16d670","kind":"codex","session":"codex-tw","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1244217}
{"ts":"2026-10-27T00:46:26.062Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:26.063Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:26.063Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:26.072Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-pvD57w/state-zNb6gZ/commands.json","count":0}
{"ts":"2026-10-27T00:46:26.150Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:26.188Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:26.188Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:26.213Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-SafAVv/state-maQ11U/commands.json","count":0}
{"ts":"2026-10-27T00:46:26.250Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:26.251Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:26.251Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:26.260Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-1WqDKe/commands.json","count":0}
{"ts":"2026-10-27T00:46:26.762Z","level":"info","msg":"agent session attached","paneId":"a9191a17-be6e-4d40-983c-f218caa6b597","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:46:27.680Z","level":"info","msg":"pane socket: request","op":"agent.subagent_transcript","paneId":"4a77daaf-6631-4560-938a-568c6237ab0a","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:46:27.915Z","level":"info","msg":"agent session attached","paneId":"5219001c-3e25-4a57-ae57-ad428f00d050","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T00:46:28.066Z","level":"info","msg":"agent session attached","paneId":"ad3d7b9c-3e81-46be-b16f-6f2e0e3cde36","kind":"codex","session":"01a1234a","source":"first-turn"}
{"ts":"2026-10-27T00:46:28.125Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:28.128Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:28.128Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:28.151Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-8V69HU/commands.json","count":0}
{"ts":"2026-10-27T00:46:28.271Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:28.271Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:28.272Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:28.297Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-GjGW2X/commands.json","count":0}
{"ts":"2026-10-27T00:46:28.576Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:28.578Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:28.579Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:28.586Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-ObGNed/commands.json","count":0}
{"ts":"2026-10-27T00:46:29.244Z","level":"info","msg":"agent session attached","paneId":"970b1e31-ef5c-4588-9ad1-1cab87806f33","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:46:30.013Z","level":"info","msg":"agent report ignored","paneId":"31455913-10d8-45e7-98c1-2f59390114af","kind":"codex","session":"01a12341","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 2 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1244217}
{"ts":"2026-10-27T00:46:30.382Z","level":"info","msg":"graph.auto: added","child":"f10e7aec-318a-43b0-bc0b-f22cb587ed32","parent":"25c6c1ae-abf9-49fd-a33b-45706e658bdd","links":2}
{"ts":"2026-10-27T00:46:30.912Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:30.913Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:30.913Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:30.921Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-bdh4iJ/commands.json","count":0}
{"ts":"2026-10-27T00:46:31.648Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:31.649Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:31.649Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:31.658Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-jDzxNe/commands.json","count":0}
{"ts":"2026-10-27T00:46:32.462Z","level":"info","msg":"agent report ignored","paneId":"2a13b687-0e39-49c2-8a01-5abaae78cd9d","kind":"codex","session":"01a12326","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1244217}
{"ts":"2026-10-27T00:46:33.087Z","level":"info","msg":"agent session attached","paneId":"6389e682-9b71-40a8-84f3-719302a729b0","kind":"claude","session":"85911f3a","source":"hook"}
{"ts":"2026-10-27T00:46:34.118Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:34.119Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:34.119Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:34.126Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-PYZtjn/commands.json","count":0}
{"ts":"2026-10-27T00:46:34.453Z","level":"info","msg":"graph.auto: added","child":"43647fda-a0fd-4cea-af5f-8dd661fc5418","parent":"76a9c83a-f8c4-4e94-a970-24aacf0c553f","links":2}
{"ts":"2026-10-27T00:46:34.582Z","level":"info","msg":"agent report ignored","paneId":"2a13b687-0e39-49c2-8a01-5abaae78cd9d","kind":"codex","session":"01a1234a","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): the session record could not be checked","agentPid":1244217}
{"ts":"2026-10-27T00:46:35.397Z","level":"info","msg":"agent session attached","paneId":"2e20576d-144b-40a4-9bbc-739cba298058","kind":"codex","session":"01a12341","source":"argv"}
{"ts":"2026-10-27T00:46:35.460Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:35.461Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:35.461Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:35.470Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-aoVqWH/commands.json","count":0}
{"ts":"2026-10-27T00:46:37.104Z","level":"info","msg":"agent session attached","paneId":"7c12916a-6370-47ef-9e64-79f891d2455f","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T00:46:37.207Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:37.209Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:37.209Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:37.219Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-GAerBL/commands.json","count":0}
{"ts":"2026-10-27T00:46:38.035Z","level":"info","msg":"agent session dropped (a different agent started without reporting)","paneId":"7c12916a-6370-47ef-9e64-79f891d2455f","kind":"codex","session":"01a12341","sinceGoneMs":704.6016630000013}
{"ts":"2026-10-27T00:46:38.035Z","level":"info","msg":"agent session attached","paneId":"7c12916a-6370-47ef-9e64-79f891d2455f","kind":"codex","session":"01a1234a","source":"argv"}
{"ts":"2026-10-27T00:46:38.126Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:38.127Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:38.127Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:38.135Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-Wrq08z/commands.json","count":0}
{"ts":"2026-10-27T00:46:38.468Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:38.469Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:38.469Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:38.483Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-batwSg/commands.json","count":0}
{"ts":"2026-10-27T00:46:39.697Z","level":"info","msg":"graph.auto: added","child":"845bbce8-12b1-495d-a6da-4e8079d6a2ab","parent":"384bce71-222a-46d7-9ddf-378cd0602b9c","links":2}
{"ts":"2026-10-27T00:46:39.713Z","level":"info","msg":"agent session attached","paneId":"d2157161-3ee0-4341-bbc7-dd19c93189cb","kind":"codex","session":"01a12326","source":"exit-text"}
{"ts":"2026-10-27T00:46:39.731Z","level":"info","msg":"agent session attached","paneId":"80eb5ff3-a263-43a9-94e8-57b06ce03d3f","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:46:39.799Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:39.800Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:39.801Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:39.823Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-w7S09K/commands.json","count":0}
{"ts":"2026-10-27T00:46:39.896Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:39.898Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:39.899Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:39.914Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-0ybr2s/commands.json","count":0}
{"ts":"2026-10-27T00:46:41.433Z","level":"info","msg":"agent session attached","paneId":"571a21da-42d6-4878-883b-212fcf0e62ca","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T00:46:41.485Z","level":"info","msg":"agent session attached","paneId":"3152236f-b3f4-4d29-b8c7-cb3b50e64ed3","kind":"codex","session":"01a1234a","source":"first-turn"}
{"ts":"2026-10-27T00:46:41.638Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:41.639Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:41.639Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:41.649Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-2VuJSy/state-w7S09K/commands.json","count":0}
{"ts":"2026-10-27T00:46:41.980Z","level":"info","msg":"agent resume command written","paneId":"3152236f-b3f4-4d29-b8c7-cb3b50e64ed3","kind":"codex","session":"01a1234a"}
{"ts":"2026-10-27T00:46:42.285Z","level":"info","msg":"agent resume command written","paneId":"571a21da-42d6-4878-883b-212fcf0e62ca","kind":"codex","session":"01a12341"}
{"ts":"2026-10-27T00:46:43.324Z","level":"info","msg":"agent session attached","paneId":"d1b3b17f-3278-4cf3-8f9f-5cd8cd9e26ed","kind":"claude","session":"0682dda0","source":"hook"}
{"ts":"2026-10-27T00:46:44.019Z","level":"info","msg":"graph.auto: added","child":"bacbb894-2398-419f-9e90-7c1b633bb7ab","parent":"77506bcb-a32e-43f3-b446-d3f8791b2e07","links":2}
{"ts":"2026-10-27T00:46:44.065Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:44.066Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:44.066Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:44.076Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-ZOvE8b/commands.json","count":0}
{"ts":"2026-10-27T00:46:44.945Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:44.947Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:44.948Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:44.958Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-IQXGxh/commands.json","count":0}
{"ts":"2026-10-27T00:46:45.754Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:45.755Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:45.756Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:45.760Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-6cJpme/commands.json","count":0}
{"ts":"2026-10-27T00:46:46.530Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:46.531Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:46.531Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:46.540Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-ZQwVGx/commands.json","count":0}
{"ts":"2026-10-27T00:46:46.625Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:46.626Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:46.627Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:46.632Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-6cJpme/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:46:47.829Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:47.830Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:47.830Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:47.835Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-6cJpme/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:46:47.862Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:47.863Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:47.863Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:47.870Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-6cJpme/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T00:46:48.106Z","level":"info","msg":"graph.auto: added","child":"7faf7955-da9c-4fe5-ae44-97ad54f73c4f","parent":"3f16802f-fb11-4c95-a359-50b9e13fb320","links":2}
{"ts":"2026-10-27T00:46:48.508Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:48.510Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:48.510Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:48.525Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-BqACoN/commands.json","count":0}
{"ts":"2026-10-27T00:46:48.706Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:48.707Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:48.707Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:48.714Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-DnbQfq/commands.json","count":0}
{"ts":"2026-10-27T00:46:49.200Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.201Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.201Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:49.209Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-1q7Fbi/commands.json","count":0}
{"ts":"2026-10-27T00:46:49.244Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.245Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.245Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:49.252Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-Hg8H6X/commands.json","count":0}
{"ts":"2026-10-27T00:46:49.304Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.305Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.305Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:49.314Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-Hg8H6X/commands.json","count":0}
{"ts":"2026-10-27T00:46:49.552Z","level":"info","msg":"graph.auto: added","child":"77d933b3-7755-44fb-b052-23775b3bf066","parent":"3f16802f-fb11-4c95-a359-50b9e13fb320","links":2}
{"ts":"2026-10-27T00:46:49.661Z","level":"info","msg":"agent session attached","paneId":"2b25b8e3-3eba-4355-9095-db3e782bd9b0","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:46:49.682Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.683Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.683Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:49.710Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-T9y6X0/commands.json","count":0}
{"ts":"2026-10-27T00:46:49.754Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.755Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:49.755Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:49.765Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-wGkCQI/commands.json","count":0}
{"ts":"2026-10-27T00:46:50.138Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:50.141Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:50.141Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:50.155Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-SafAVv/state-DkptA0/commands.json","count":0}
{"ts":"2026-10-27T00:46:50.510Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:50.511Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:50.511Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:50.517Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-wGkCQI/commands.json","count":0}
{"ts":"2026-10-27T00:46:50.736Z","level":"info","msg":"agent session attached","paneId":"ba61c556-876b-43da-9e61-745a56dba972","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:46:51.186Z","level":"info","msg":"graph.auto: skipped","child":"87613296-75a0-44bc-a6c3-15e2edfe0044","parent":"aa51ce03-678e-4e8a-ba8b-fcc70a85a22b","reason":"duplicate_link"}
{"ts":"2026-10-27T00:46:51.187Z","level":"info","msg":"graph.auto: added","child":"87613296-75a0-44bc-a6c3-15e2edfe0044","parent":"aa51ce03-678e-4e8a-ba8b-fcc70a85a22b","links":1}
{"ts":"2026-10-27T00:46:51.336Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:51.338Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:51.338Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:51.358Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-s2Cs04/commands.json","count":0}
{"ts":"2026-10-27T00:46:51.371Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:51.372Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:51.372Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:51.379Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-PIxwH5/commands.json","count":0}
{"ts":"2026-10-27T00:46:52.327Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:52.328Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:52.328Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:52.336Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-PIxwH5/commands.json","count":0}
{"ts":"2026-10-27T00:46:53.217Z","level":"info","msg":"graph.auto: skipped","child":"e0009f48-c3e4-4254-ac72-211877cbf8c6","parent":"d17c47c2-89fa-44f2-90aa-f714d2535fd5","reason":"supervisor_taken"}
{"ts":"2026-10-27T00:46:53.217Z","level":"info","msg":"graph.auto: added","child":"e0009f48-c3e4-4254-ac72-211877cbf8c6","parent":"d17c47c2-89fa-44f2-90aa-f714d2535fd5","links":1}
{"ts":"2026-10-27T00:46:53.245Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:53.246Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:53.246Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:53.254Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-PIxwH5/commands.json","count":0}
{"ts":"2026-10-27T00:46:53.281Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:53.282Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:53.283Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:53.294Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-N37r3Z/commands.json","count":0}
{"ts":"2026-10-27T00:46:53.407Z","level":"info","msg":"agent session attached","paneId":"c0dd11a4-57c8-4d7d-a794-12e822c2851a","kind":"claude","session":"8614dbd9","source":"hook"}
{"ts":"2026-10-27T00:46:53.583Z","level":"info","msg":"agent resume skipped","paneId":"a3cae60a-e6f3-41a5-8774-e1de608c8ae7","reason":"no-session-ref"}
{"ts":"2026-10-27T00:46:53.889Z","level":"info","msg":"agent resume skipped","paneId":"51ca0fb5-585b-4c8d-85e6-e4acb52a1a1d","reason":"no-session-ref"}
{"ts":"2026-10-27T00:46:54.041Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:54.042Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:54.042Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:54.048Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-V2pcIG/commands.json","count":0}
{"ts":"2026-10-27T00:46:54.736Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:54.737Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:54.737Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:54.744Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-a4rq3z/commands.json","count":0}
{"ts":"2026-10-27T00:46:54.773Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:54.775Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:54.775Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:54.783Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-3H7Wik/commands.json","count":0}
{"ts":"2026-10-27T00:46:54.898Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:54.899Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:54.900Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:54.910Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-PfFbwa/commands.json","count":0}
{"ts":"2026-10-27T00:46:54.996Z","level":"info","msg":"graph.auto: added","child":"ecd95070-3e69-4c3c-b217-d5085cc1bfa9","parent":"9866f056-42c3-47d5-be69-d3a7208c6a12","links":2}
{"ts":"2026-10-27T00:46:55.397Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:55.398Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:55.398Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:55.408Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-qY5mUj/commands.json","count":0}
{"ts":"2026-10-27T00:46:55.855Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:55.856Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:55.856Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:55.864Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-mCA39J/commands.json","count":0}
{"ts":"2026-10-27T00:46:56.025Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:56.026Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:56.026Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:56.037Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-SafAVv/state-MXw602/commands.json","count":0}
{"ts":"2026-10-27T00:46:56.506Z","level":"info","msg":"agent session attached","paneId":"1b5a00b0-5454-4424-928e-93a0f6054a68","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:46:56.508Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:56.509Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:56.509Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:56.519Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-5xFwAF/commands.json","count":0}
{"ts":"2026-10-27T00:46:57.297Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:57.298Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:57.298Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:57.308Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-JBUVj5/commands.json","count":0}
{"ts":"2026-10-27T00:46:57.703Z","level":"info","msg":"graph.auto: added","child":"d9126208-30fe-48d1-a2c5-fb00e1d1d0dd","parent":"9866f056-42c3-47d5-be69-d3a7208c6a12","links":2}
{"ts":"2026-10-27T00:46:57.747Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:57.748Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:57.748Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:57.758Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-ASjPKi/state-gJADcp/commands.json","count":0}
{"ts":"2026-10-27T00:46:57.937Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:57.938Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:57.938Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:57.949Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-BRbse3/commands.json","count":0}
{"ts":"2026-10-27T00:46:58.347Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:58.348Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:58.348Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:58.356Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-5liN0P/commands.json","count":0}
{"ts":"2026-10-27T00:46:58.727Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:58.729Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:58.729Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:58.736Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-LlAR4W/commands.json","count":0}
{"ts":"2026-10-27T00:46:59.156Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:59.157Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:59.157Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:59.167Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-5liN0P/commands.json","count":0}
{"ts":"2026-10-27T00:46:59.202Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:21af9bca-21dd-4d92-9501-71d9082cb065"]}
{"ts":"2026-10-27T00:46:59.362Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:59.362Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:59.363Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:59.369Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-R0Is3k/commands.json","count":0}
{"ts":"2026-10-27T00:46:59.486Z","level":"info","msg":"agent resume skipped","paneId":"4ff676a9-c794-4708-ba6e-42c0ae3d3ced","reason":"no-session-ref"}
{"ts":"2026-10-27T00:46:59.798Z","level":"info","msg":"agent resume skipped","paneId":"285ded49-9397-43ab-a196-09053e5bb83f","reason":"no-session-ref"}
{"ts":"2026-10-27T00:46:59.869Z","level":"info","msg":"graph.auto: skipped","child":"5c7b7b71-a5f6-4f88-ba8d-b2caf000bdb2","parent":"21af9bca-21dd-4d92-9501-71d9082cb065","reason":"parent_gone"}
{"ts":"2026-10-27T00:46:59.919Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:46:59.920Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:46:59.920Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:46:59.929Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-e2e-x6dKDL/commands.json","count":0}
{"ts":"2026-10-27T00:47:00.476Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:249cd799-cffd-40a9-bb88-9f101f538832"]}
{"ts":"2026-10-27T00:47:00.479Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:00.480Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:00.480Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:00.488Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-wtdir-RNqfWB/commands.json","count":0}
{"ts":"2026-10-27T00:47:00.519Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:00.520Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:00.520Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:00.528Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-kjbbDx/commands.json","count":0}
{"ts":"2026-10-27T00:47:00.616Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:00.618Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:00.618Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:00.627Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-T0PKP1/state-spOmhz/commands.json","count":0}
{"ts":"2026-10-27T00:47:01.389Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:01.390Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:01.390Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:01.402Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-qS2hpk/commands.json","count":0}
{"ts":"2026-10-27T00:47:01.480Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:01.480Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:01.480Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:01.488Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-gitnow-Mxt1eP/commands.json","count":0}
{"ts":"2026-10-27T00:47:01.534Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:01.535Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:01.535Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:01.543Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-2W2mvg/commands.json","count":0}
{"ts":"2026-10-27T00:47:01.992Z","level":"info","msg":"agent session attached","paneId":"bedee1a6-49e4-4d4c-9816-92139e5f41c7","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:02.157Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.157Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.158Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:02.168Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-2W2mvg/commands.json","count":0}
{"ts":"2026-10-27T00:47:02.404Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.404Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.405Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:02.427Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-T0PKP1/state-bjdtEB/commands.json","count":0}
{"ts":"2026-10-27T00:47:02.458Z","level":"info","msg":"agent session attached","paneId":"225e694e-b8eb-404d-9c84-d668cba2d029","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:02.474Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.475Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.475Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:02.483Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-shutdown-BxQ0rA/commands.json","count":0}
{"ts":"2026-10-27T00:47:02.493Z","level":"info","msg":"agent resume skipped","paneId":"fc3a7618-d0f5-4654-87fb-5c5adc32f538","reason":"no-session-ref"}
{"ts":"2026-10-27T00:47:02.662Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.680Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.680Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:02.689Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-0faWSB/commands.json","count":0}
{"ts":"2026-10-27T00:47:02.958Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.971Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:02.971Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:02.984Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-agent-7LUV9W/commands.json","count":0}
{"ts":"2026-10-27T00:47:03.138Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:03.139Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:03.139Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:03.147Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-0faWSB/commands.json","count":0}
{"ts":"2026-10-27T00:47:03.161Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-graph-it-0faWSB/session-backups/2026-10-27T00-47-03-158Z.json"}
{"ts":"2026-10-27T00:47:03.475Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:1c562fcd-bffe-4fdc-bd79-523fd33bbbbf"]}
{"ts":"2026-10-27T00:47:03.475Z","level":"info","msg":"graph.json had nodes of closed panes; removed them","nodes":1}
{"ts":"2026-10-27T00:47:03.750Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:03.751Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:03.751Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:03.764Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-y7ZmHh/commands.json","count":0}
{"ts":"2026-10-27T00:47:04.067Z","level":"info","msg":"agent session attached","paneId":"43d56993-c2d7-4900-ab69-3929951a256c","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:04.211Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:04.212Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:04.212Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:04.221Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-GPiF0I/commands.json","count":0}
{"ts":"2026-10-27T00:47:04.499Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:04.501Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:04.501Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:04.509Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-fUnlEb/commands.json","count":0}
{"ts":"2026-10-27T00:47:05.436Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:05.437Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:05.437Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:05.446Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-fUnlEb/commands.json","count":0}
{"ts":"2026-10-27T00:47:05.774Z","level":"info","msg":"agent resume skipped","paneId":"35c4ffc7-f1aa-46f8-9db2-ab036a04504d","reason":"no-session-ref"}
{"ts":"2026-10-27T00:47:06.080Z","level":"info","msg":"agent resume skipped","paneId":"b35a7d32-2446-4fdd-a467-83b1a1ec3d00","reason":"no-session-ref"}
{"ts":"2026-10-27T00:47:06.265Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:06.267Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:06.267Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:06.278Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-bT26D1/commands.json","count":0}
{"ts":"2026-10-27T00:47:06.476Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:06.477Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:06.477Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:06.484Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-1efh6x/commands.json","count":0}
{"ts":"2026-10-27T00:47:07.284Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:07.286Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:07.286Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:07.295Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-4gcdR8/commands.json","count":0}
{"ts":"2026-10-27T00:47:07.746Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:07.747Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:07.747Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:07.770Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-4gcdR8/commands.json","count":0}
{"ts":"2026-10-27T00:47:07.784Z","level":"info","msg":"removed session-history.json","reason":"pane history disabled"}
{"ts":"2026-10-27T00:47:08.094Z","level":"info","msg":"agent resume skipped","paneId":"bfc5df17-25d1-44ab-8090-5a670ab407b1","reason":"no-session-ref"}
{"ts":"2026-10-27T00:47:08.210Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:08.211Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:08.211Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:08.222Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-riB5JA/commands.json","count":0}
{"ts":"2026-10-27T00:47:08.264Z","level":"info","msg":"removed session-history.json","reason":"session.json was not restored"}
{"ts":"2026-10-27T00:47:08.651Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:08.651Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:08.652Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:08.659Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-kUG1hk/commands.json","count":0}
{"ts":"2026-10-27T00:47:08.698Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-history-it-kUG1hk/session-backups/2026-10-27T00-47-08-696Z.json"}
{"ts":"2026-10-27T00:47:08.699Z","level":"info","msg":"removed session-history.json","reason":"session.json was not restored"}
{"ts":"2026-10-27T00:47:09.085Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:09.086Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:09.086Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:09.095Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-Ll3UWX/commands.json","count":0}
{"ts":"2026-10-27T00:47:09.276Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:09.277Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:09.277Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:09.287Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-hECJdL/commands.json","count":0}
{"ts":"2026-10-27T00:47:09.499Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:09.499Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:09.499Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:09.507Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-Ll3UWX/commands.json","count":0}
{"ts":"2026-10-27T00:47:09.517Z","level":"warn","msg":"session-history.json was corrupt; restoring without pane history","reason":"invalid JSON"}
{"ts":"2026-10-27T00:47:09.823Z","level":"info","msg":"agent resume skipped","paneId":"1dafb665-d423-4aad-933d-ed7af3423c33","reason":"no-session-ref"}
{"ts":"2026-10-27T00:47:09.974Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:09.975Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:09.975Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:09.985Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-ihbHww/commands.json","count":0}
{"ts":"2026-10-27T00:47:10.406Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:10.407Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:10.407Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:10.421Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-ihbHww/commands.json","count":0}
{"ts":"2026-10-27T00:47:10.436Z","level":"warn","msg":"session-history.json was corrupt; restoring without pane history","reason":"panes: invalid_type"}
{"ts":"2026-10-27T00:47:10.750Z","level":"info","msg":"agent resume skipped","paneId":"f8b488fd-e618-4897-81dd-c3aa8be700dc","reason":"no-session-ref"}
{"ts":"2026-10-27T00:47:10.936Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:10.937Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:10.937Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:10.940Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:10.941Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:10.941Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:10.947Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-AsAOyv/commands.json","count":0}
{"ts":"2026-10-27T00:47:10.948Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-74ywsY/commands.json","count":0}
{"ts":"2026-10-27T00:47:11.634Z","level":"warn","msg":"pane history save failed","path":"/tmp/soda-history-it-74ywsY/session-history.json","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-history-it-74ywsY/.tmp-9RqaAL/write' -> '/tmp/soda-history-it-74ywsY/session-history.json'"}
{"ts":"2026-10-27T00:47:11.664Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:11.664Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:11.664Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:11.672Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-gm3ka5/commands.json","count":0}
{"ts":"2026-10-27T00:47:12.105Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:12.106Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:12.106Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:12.114Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-gm3ka5/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:12.120Z","level":"info","msg":"agent session attached","paneId":"4dc273b4-934d-4205-89d1-4280a0b28713","kind":"claude","session":"2d68b0ee","source":"hook"}
{"ts":"2026-10-27T00:47:12.775Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:12.776Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:12.776Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:12.784Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-kUlmBO/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:13.126Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:13.127Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:13.127Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:13.137Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-TO6np4/commands.json","count":0}
{"ts":"2026-10-27T00:47:13.191Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:13.192Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:13.192Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:13.199Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-kUlmBO/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:13.517Z","level":"info","msg":"agent resume skipped","paneId":"4ec3b93b-0de6-4064-a576-ba85d46f902a","reason":"no-session-ref"}
{"ts":"2026-10-27T00:47:13.586Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:13.587Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:13.587Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:13.596Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-kUlmBO/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:13.914Z","level":"info","msg":"agent resume skipped","paneId":"4ec3b93b-0de6-4064-a576-ba85d46f902a","reason":"no-session-ref"}
{"ts":"2026-10-27T00:47:13.980Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:13.981Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:13.981Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:13.989Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-6YS0kI/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:14.029Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.030Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.030Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:14.031Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.032Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.032Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:14.041Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-6YS0kI/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:14.042Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-qjxzRV/commands.json","count":0}
{"ts":"2026-10-27T00:47:14.063Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.064Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.064Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:14.072Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-6YS0kI/commands.json","count":0}
{"ts":"2026-10-27T00:47:14.092Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.093Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.093Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:14.100Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-6YS0kI/commands.json","count":0}
{"ts":"2026-10-27T00:47:14.123Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.124Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.124Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:14.131Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-mOCSNF/commands.json","count":0}
{"ts":"2026-10-27T00:47:14.532Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.533Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:14.533Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:14.542Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-FiKKap/commands.json","count":0}
{"ts":"2026-10-27T00:47:14.550Z","level":"warn","msg":"cannot write serve.json","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-compose-named-ui-FiKKap/.tmp-AmJP7M/write' -> '/tmp/soda-compose-named-ui-FiKKap/serve.json'"}
{"ts":"2026-10-27T00:47:15.018Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:15.019Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:15.019Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:15.027Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-yvmFjY/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:15.036Z","level":"info","msg":"agent session attached","paneId":"8d4039c7-8c2a-40a7-a563-de4d2d15bbcd","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:15.422Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:15.423Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:15.423Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:15.429Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-yvmFjY/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:15.446Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:15.447Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:15.447Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:15.455Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-yvmFjY/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:47:16.140Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:16.142Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:16.143Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:16.150Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-1MqVsm/commands.json","count":0}
{"ts":"2026-10-27T00:47:16.638Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:16.639Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:16.639Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:16.647Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-T0PKP1/state-xv07nQ/commands.json","count":0}
{"ts":"2026-10-27T00:47:16.949Z","level":"info","msg":"agent session attached","paneId":"f81a7d62-745f-4bfa-b9e8-92a8d47adbcd","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:17.600Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:17.600Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:17.600Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:17.606Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-0Asktn/commands.json","count":0}
{"ts":"2026-10-27T00:47:18.157Z","level":"info","msg":"agent session attached","paneId":"b20b0e93-d9a8-49bc-b3c5-364c88a5a9bf","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:18.274Z","level":"info","msg":"agent session attached","paneId":"51148201-b5db-4b49-b708-6204eb90d362","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:18.322Z","level":"info","msg":"usage report ignored","paneId":"51148201-b5db-4b49-b708-6204eb90d362","kind":"claude","reason":"the reporting process is not a descendant of the pane's shell"}
{"ts":"2026-10-27T00:47:18.846Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:18.847Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:18.848Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:18.855Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-knZ0tF/commands.json","count":0}
{"ts":"2026-10-27T00:47:19.501Z","level":"info","msg":"agent session attached","paneId":"ee597455-a31d-45fe-895e-fb96eb90e233","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:19.579Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:19.580Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:19.580Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:19.589Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-URJlWH/commands.json","count":0}
{"ts":"2026-10-27T00:47:19.870Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:19.871Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:19.873Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:19.895Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-T0PKP1/state-K7ITfh/commands.json","count":0}
{"ts":"2026-10-27T00:47:20.531Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:20.532Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:20.532Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:20.540Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-URJlWH/commands.json","count":0}
{"ts":"2026-10-27T00:47:20.570Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-graph-run-URJlWH/session-backups/2026-10-27T00-47-20-569Z.json"}
{"ts":"2026-10-27T00:47:20.881Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:5dd0dd36-a5f6-447d-baef-43e2e2269515","local:33b2188c-c5b2-4420-ae9c-2a953ba4779d"]}
{"ts":"2026-10-27T00:47:20.882Z","level":"info","msg":"graph.json had nodes of closed panes; removed them","nodes":2}
{"ts":"2026-10-27T00:47:21.496Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:21.497Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:21.497Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:21.506Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-dpbh19/commands.json","count":0}
{"ts":"2026-10-27T00:47:22.453Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:22.454Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:22.454Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:22.463Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-fP3zKU/commands.json","count":0}
{"ts":"2026-10-27T00:47:23.090Z","level":"info","msg":"agent session attached","paneId":"370eb3bd-42e4-4afe-b2e7-d1313dc66480","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:23.239Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:23.240Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:23.240Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:23.266Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-3gpapl/commands.json","count":0}
{"ts":"2026-10-27T00:47:23.332Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T00:47:23.341Z","level":"info","msg":"handoff: replacing this server with the version on disk","id":"8a8f5a6105ca162f","panes":2}
{"ts":"2026-10-27T00:47:23.342Z","level":"error","msg":"handoff: execve failed; keeping the current server","error":"execve refused by the test"}
{"ts":"2026-10-27T00:47:23.870Z","level":"info","msg":"agent session attached","paneId":"38df5893-3e68-4168-a42e-676b0a8f8360","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:24.630Z","level":"info","msg":"agent session attached","paneId":"cecc9f4d-911d-4472-ad26-a1f422bd4129","kind":"claude","session":"0e6dc508","source":"hook"}
{"ts":"2026-10-27T00:47:26.091Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:26.093Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:26.094Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:26.101Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-z3u4Kx/commands.json","count":0}
{"ts":"2026-10-27T00:47:26.231Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:26.231Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:26.231Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:26.242Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-SaQ9I8/commands.json","count":0}
{"ts":"2026-10-27T00:47:26.562Z","level":"info","msg":"display script enabled","byClientId":"77e5f267-d7f8-46c0-9470-d746a2dcbce5","byKind":"external"}
{"ts":"2026-10-27T00:47:26.743Z","level":"info","msg":"display set","paneId":"150b8fe1-bd37-41c8-9bc2-34c188a40837","name":"main","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:26.744Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"150b8fe1-bd37-41c8-9bc2-34c188a40837","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:26.775Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"150b8fe1-bd37-41c8-9bc2-34c188a40837","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:26.839Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"150b8fe1-bd37-41c8-9bc2-34c188a40837","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:47:26.853Z","level":"info","msg":"display closed","paneId":"150b8fe1-bd37-41c8-9bc2-34c188a40837","name":"main","reason":"closed"}
{"ts":"2026-10-27T00:47:26.854Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"150b8fe1-bd37-41c8-9bc2-34c188a40837","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:47:26.885Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"150b8fe1-bd37-41c8-9bc2-34c188a40837","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T00:47:26.895Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"150b8fe1-bd37-41c8-9bc2-34c188a40837","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T00:47:26.953Z","level":"info","msg":"agent session attached","paneId":"5004db6e-61fe-481b-8840-e9ab630a4d99","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:26.974Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:26.975Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:26.975Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:26.982Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-TFDP8N/commands.json","count":0}
{"ts":"2026-10-27T00:47:27.426Z","level":"info","msg":"display script enabled","byClientId":"f0c7fc84-7306-4b85-b87b-bed2517e2f72","byKind":"external"}
{"ts":"2026-10-27T00:47:27.440Z","level":"info","msg":"display set","paneId":"0b6897b1-72e9-4c6b-b37d-1216689e795e","name":"big","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:27.440Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0b6897b1-72e9-4c6b-b37d-1216689e795e","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:27.454Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0b6897b1-72e9-4c6b-b37d-1216689e795e","connId":"pane-socket:2","code":"invalid_display"}
{"ts":"2026-10-27T00:47:27.580Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:27.581Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:27.581Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:27.588Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-HS9Pyb/commands.json","count":0}
{"ts":"2026-10-27T00:47:27.983Z","level":"info","msg":"agent session attached","paneId":"5004db6e-61fe-481b-8840-e9ab630a4d99","kind":"claude","session":"7c0a3f2e","source":"hook"}
{"ts":"2026-10-27T00:47:28.031Z","level":"info","msg":"display script enabled","byClientId":"ff751477-19d7-4f8d-ae57-d384b58ceb9e","byKind":"external"}
{"ts":"2026-10-27T00:47:28.167Z","level":"info","msg":"display set","paneId":"8cbc910c-3981-4c68-9d62-11806ab74e13","name":"q","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T00:47:28.167Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"8cbc910c-3981-4c68-9d62-11806ab74e13","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:28.183Z","level":"info","msg":"pane socket: request","connId":"pane-socket:2","code":"bad_request"}
{"ts":"2026-10-27T00:47:28.217Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:28.218Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:28.218Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:28.227Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-1fSRxE/commands.json","count":0}
{"ts":"2026-10-27T00:47:28.692Z","level":"info","msg":"display script enabled","byClientId":"3a4631f3-9816-4c86-b7c7-af923cb6ee1a","byKind":"external"}
{"ts":"2026-10-27T00:47:29.271Z","level":"info","msg":"display set","paneId":"e8ad647b-78fc-41a0-b282-1ad982e8eafd","name":"secret","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:29.273Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:29.274Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:29.275Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:47:29.276Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T00:47:29.277Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T00:47:29.278Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:6","code":"invalid_params"}
{"ts":"2026-10-27T00:47:29.278Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:7","code":"invalid_params"}
{"ts":"2026-10-27T00:47:29.279Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:8","code":"invalid_params"}
{"ts":"2026-10-27T00:47:30.284Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"5a3b338d-9ef5-40ca-9908-88f9dbedcaf3","connId":"pane-socket:9","code":"ok"}
{"ts":"2026-10-27T00:47:30.327Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:30.328Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:30.328Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:30.332Z","level":"info","msg":"agent session attached","paneId":"23c783e6-92f4-429b-b1b6-19a6831449e6","kind":"claude","session":"67d888c3","source":"hook"}
{"ts":"2026-10-27T00:47:30.338Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-W4bH1q/commands.json","count":0}
{"ts":"2026-10-27T00:47:30.529Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:30.530Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:30.530Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:30.541Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-mz1H9R/commands.json","count":0}
{"ts":"2026-10-27T00:47:30.832Z","level":"info","msg":"display script enabled","byClientId":"ea95b85a-d45b-41c6-9c6b-e42d551c53f5","byKind":"external"}
{"ts":"2026-10-27T00:47:30.935Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:30.936Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"c5f45503-9019-4699-af9d-424f596ac467","connId":"pane-socket:5","code":"display_busy"}
{"ts":"2026-10-27T00:47:30.936Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:30.937Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:30.948Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-AfsDuA/commands.json","count":0}
{"ts":"2026-10-27T00:47:31.274Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:31.275Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:31.275Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:31.283Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-HPoce7/commands.json","count":0}
{"ts":"2026-10-27T00:47:31.557Z","level":"info","msg":"agent session attached","paneId":"2a85d0e3-9c30-419b-8ddc-e97026587fa3","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:31.576Z","level":"info","msg":"agent session attached","paneId":"f736989c-e8a9-4a2e-a574-5a52174b8b79","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:31.743Z","level":"info","msg":"display script enabled","byClientId":"eef6a1e8-b578-454f-ae9f-1b56e19d35d2","byKind":"external"}
{"ts":"2026-10-27T00:47:31.942Z","level":"info","msg":"display set","paneId":"b66a988a-efe6-41da-af32-76431319f284","name":"big","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:32.097Z","level":"info","msg":"display closed","paneId":"b66a988a-efe6-41da-af32-76431319f284","name":"big","reason":"dismissed"}
{"ts":"2026-10-27T00:47:32.101Z","level":"info","msg":"display set","paneId":"b66a988a-efe6-41da-af32-76431319f284","name":"again","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:32.105Z","level":"info","msg":"display reported","paneId":"b66a988a-efe6-41da-af32-76431319f284","name":"again","problem":"navigated","format":"html"}
{"ts":"2026-10-27T00:47:32.105Z","level":"info","msg":"display closed","paneId":"b66a988a-efe6-41da-af32-76431319f284","name":"again","reason":"navigated"}
{"ts":"2026-10-27T00:47:32.138Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:32.139Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:32.139Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:32.149Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-NhKKkp/commands.json","count":0}
{"ts":"2026-10-27T00:47:32.203Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:32.204Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:32.204Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:32.213Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-NtWWWs/commands.json","count":0}
{"ts":"2026-10-27T00:47:32.408Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:32.409Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:32.409Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:32.419Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-SUi5k5/commands.json","count":0}
{"ts":"2026-10-27T00:47:32.721Z","level":"info","msg":"display script enabled","byClientId":"647e1cea-387f-4c41-b86b-74830477f13e","byKind":"external"}
{"ts":"2026-10-27T00:47:32.787Z","level":"info","msg":"display set","paneId":"d0797f9e-dff8-4c69-ab19-f7ff5de7e02b","name":"m","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:32.922Z","level":"info","msg":"agent session attached","paneId":"e0c96604-2545-4c49-b963-9ade636d94b8","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:32.934Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:32.935Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:32.935Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:32.945Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-dQJtcD/commands.json","count":0}
{"ts":"2026-10-27T00:47:33.317Z","level":"info","msg":"agent session attached","paneId":"abc929d4-133b-4860-8524-454a4f73e188","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:33.417Z","level":"info","msg":"display script enabled","byClientId":"91fba57b-83d5-4eec-8a0b-ee5b35c795fc","byKind":"external"}
{"ts":"2026-10-27T00:47:33.466Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:33.468Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:33.468Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:33.477Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-cLNduG/commands.json","count":0}
{"ts":"2026-10-27T00:47:33.593Z","level":"info","msg":"display set","paneId":"d4ad35ba-7326-4929-9f91-ef6abbfa1253","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:33.629Z","level":"info","msg":"display set","paneId":"d4ad35ba-7326-4929-9f91-ef6abbfa1253","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:33.659Z","level":"info","msg":"display set","paneId":"d4ad35ba-7326-4929-9f91-ef6abbfa1253","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:33.691Z","level":"info","msg":"display set","paneId":"d4ad35ba-7326-4929-9f91-ef6abbfa1253","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:34.086Z","level":"info","msg":"agent session attached","paneId":"afb80cf6-b97c-4804-bd51-914847bee10f","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:35.012Z","level":"info","msg":"display set","paneId":"bc1ad184-0c22-4df3-90cc-5eef95ab23ad","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.044Z","level":"info","msg":"display set","paneId":"bc1ad184-0c22-4df3-90cc-5eef95ab23ad","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.139Z","level":"info","msg":"display set","paneId":"bc1ad184-0c22-4df3-90cc-5eef95ab23ad","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.187Z","level":"info","msg":"display set","paneId":"bc1ad184-0c22-4df3-90cc-5eef95ab23ad","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.239Z","level":"info","msg":"display set","paneId":"77153ddc-a3a7-4ae6-b9ae-0f66f0e35219","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.395Z","level":"info","msg":"display set","paneId":"77153ddc-a3a7-4ae6-b9ae-0f66f0e35219","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.426Z","level":"info","msg":"display set","paneId":"77153ddc-a3a7-4ae6-b9ae-0f66f0e35219","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.454Z","level":"info","msg":"display set","paneId":"77153ddc-a3a7-4ae6-b9ae-0f66f0e35219","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.487Z","level":"info","msg":"display set","paneId":"b3b57ca8-1164-4c73-a0f5-987a7d710490","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.520Z","level":"info","msg":"display set","paneId":"b3b57ca8-1164-4c73-a0f5-987a7d710490","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.569Z","level":"info","msg":"display set","paneId":"b3b57ca8-1164-4c73-a0f5-987a7d710490","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.604Z","level":"info","msg":"display set","paneId":"b3b57ca8-1164-4c73-a0f5-987a7d710490","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:35.732Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:35.733Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:35.733Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:35.742Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-8BvMrx/commands.json","count":0}
{"ts":"2026-10-27T00:47:35.960Z","level":"info","msg":"display closed","paneId":"bc1ad184-0c22-4df3-90cc-5eef95ab23ad","name":"p0","reason":"closed"}
{"ts":"2026-10-27T00:47:35.960Z","level":"info","msg":"display closed","paneId":"bc1ad184-0c22-4df3-90cc-5eef95ab23ad","name":"p1","reason":"closed"}
{"ts":"2026-10-27T00:47:35.960Z","level":"info","msg":"display closed","paneId":"bc1ad184-0c22-4df3-90cc-5eef95ab23ad","name":"p2","reason":"closed"}
{"ts":"2026-10-27T00:47:35.960Z","level":"info","msg":"display closed","paneId":"bc1ad184-0c22-4df3-90cc-5eef95ab23ad","name":"p3","reason":"closed"}
{"ts":"2026-10-27T00:47:35.965Z","level":"info","msg":"display set","paneId":"d895966b-5b8f-470e-8234-791e56897aec","name":"one","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T00:47:35.996Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:35.996Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:35.996Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:36.009Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-gqq90b/commands.json","count":0}
{"ts":"2026-10-27T00:47:36.382Z","level":"info","msg":"agent session attached","paneId":"e9488968-b108-4c55-9f20-b50b1f70ced8","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:36.474Z","level":"info","msg":"display script enabled","byClientId":"8ade18cd-221f-47d3-b157-fb63ce0860c4","byKind":"external"}
{"ts":"2026-10-27T00:47:36.943Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:36.944Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:36.944Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:36.966Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-j0t8oK/commands.json","count":0}
{"ts":"2026-10-27T00:47:37.067Z","level":"info","msg":"agent report ignored","paneId":"e9488968-b108-4c55-9f20-b50b1f70ced8","kind":"claude","session":"3e81f9a7","reason":"the reporting process is not a descendant of the pane's shell","agentPid":1250267}
{"ts":"2026-10-27T00:47:37.122Z","level":"info","msg":"display set","paneId":"2bef3f92-6628-4347-bc03-068d7646986e","name":"x","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:37.180Z","level":"info","msg":"display closed","paneId":"2bef3f92-6628-4347-bc03-068d7646986e","name":"x","reason":"pane_closed"}
{"ts":"2026-10-27T00:47:37.188Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:2bef3f92-6628-4347-bc03-068d7646986e"]}
{"ts":"2026-10-27T00:47:37.288Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:37.292Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:37.292Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:37.315Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-SBfVEU/commands.json","count":0}
{"ts":"2026-10-27T00:47:37.479Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:37.480Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:37.480Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:37.504Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-Y2uyqu/state-NXVJOs/commands.json","count":0}
{"ts":"2026-10-27T00:47:37.751Z","level":"info","msg":"display script enabled","byClientId":"21fe43e0-acda-4954-929d-5f8045d957be","byKind":"external"}
{"ts":"2026-10-27T00:47:37.928Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:37.928Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:37.928Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:37.939Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-oC6HSP/commands.json","count":0}
{"ts":"2026-10-27T00:47:38.089Z","level":"info","msg":"agent session attached","paneId":"358c7a83-67b3-4d65-9eff-7d462582521e","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:47:38.384Z","level":"info","msg":"display script enabled","byClientId":"259f0e9d-c3d2-491b-bd57-717a5c23d638","byKind":"external"}
{"ts":"2026-10-27T00:47:38.527Z","level":"info","msg":"display set","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:47:38.527Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:38.529Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:38.560Z","level":"info","msg":"display set","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:38.560Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:47:38.563Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T00:47:38.565Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T00:47:38.566Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","connId":"pane-socket:6","code":"display_closed"}
{"ts":"2026-10-27T00:47:38.570Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","connId":"pane-socket:7","code":"ok"}
{"ts":"2026-10-27T00:47:38.574Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"914bbbbb-8a4c-4292-8db0-7f7adfa27c6e","connId":"pane-socket:8","code":"ok"}
{"ts":"2026-10-27T00:47:38.608Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:38.609Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:38.609Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:38.622Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-4tCr5X/commands.json","count":0}
{"ts":"2026-10-27T00:47:38.687Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:38.689Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:38.689Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:38.697Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-iuw3dV/commands.json","count":0}
{"ts":"2026-10-27T00:47:39.066Z","level":"info","msg":"display script enabled","byClientId":"ad76b0a7-0cec-4e91-8365-fcec3863fca8","byKind":"external"}
{"ts":"2026-10-27T00:47:39.264Z","level":"info","msg":"display set","paneId":"e7e4e677-54eb-4d50-acab-7ee37e0b00ec","name":"lay","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:39.264Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e7e4e677-54eb-4d50-acab-7ee37e0b00ec","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:39.286Z","level":"info","msg":"display set","paneId":"e7e4e677-54eb-4d50-acab-7ee37e0b00ec","name":"bd","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:47:39.286Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e7e4e677-54eb-4d50-acab-7ee37e0b00ec","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:39.288Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e7e4e677-54eb-4d50-acab-7ee37e0b00ec","connId":"pane-socket:3","code":"invalid_display"}
{"ts":"2026-10-27T00:47:39.290Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e7e4e677-54eb-4d50-acab-7ee37e0b00ec","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T00:47:39.395Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:39.396Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:39.396Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:39.408Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-vYaO8f/commands.json","count":0}
{"ts":"2026-10-27T00:47:39.440Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:39.441Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:39.441Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:39.447Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-qRpTcu/commands.json","count":0}
{"ts":"2026-10-27T00:47:39.834Z","level":"info","msg":"display script enabled","byClientId":"5151ac07-0448-452f-869d-340922d22de5","byKind":"external"}
{"ts":"2026-10-27T00:47:39.965Z","level":"info","msg":"display set","paneId":"1234ef06-ff28-47c8-a772-8f0782a4dcbe","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:47:40.117Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:40.118Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:40.118Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:40.143Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-k516yw/commands.json","count":0}
{"ts":"2026-10-27T00:47:40.715Z","level":"info","msg":"display script enabled","byClientId":"fa69bd20-f5d3-4e89-9c2a-ff915c5ea4c0","byKind":"external"}
{"ts":"2026-10-27T00:47:40.864Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:40.902Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:40.902Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:40.902Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:40.908Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-8LPYzH/commands.json","count":0}
{"ts":"2026-10-27T00:47:41.217Z","level":"info","msg":"display set","paneId":"de38bbda-74bf-4b74-8fd5-2d1da4de1e41","name":"secret","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:47:41.219Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"c69fcf85-9d43-47d6-b799-7c555db0e125","connId":"pane-socket:1","code":"display_closed"}
{"ts":"2026-10-27T00:47:41.222Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"c69fcf85-9d43-47d6-b799-7c555db0e125","connId":"pane-socket:2","code":"invalid_params"}
{"ts":"2026-10-27T00:47:41.255Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:41.256Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:41.256Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:41.268Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-oqBR6i/commands.json","count":0}
{"ts":"2026-10-27T00:47:41.312Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:41.313Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:41.313Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:41.319Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-KAJeTV/commands.json","count":0}
{"ts":"2026-10-27T00:47:41.724Z","level":"info","msg":"display script enabled","byClientId":"c4d987c8-b4db-4405-be5d-6ba96e8d3310","byKind":"external"}
{"ts":"2026-10-27T00:47:41.851Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:47:41.912Z","level":"info","msg":"display set","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:47:41.915Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:41.959Z","level":"info","msg":"display reported","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:47:41.965Z","level":"info","msg":"display reported","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:47:41.973Z","level":"info","msg":"display closed","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","name":"g","reason":"closed"}
{"ts":"2026-10-27T00:47:41.974Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:41.977Z","level":"info","msg":"display set","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:47:41.977Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:47:42.031Z","level":"info","msg":"display reported","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:47:42.032Z","level":"info","msg":"display closed","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","name":"g","reason":"focus_steal"}
{"ts":"2026-10-27T00:47:42.032Z","level":"info","msg":"display script cooldown","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","reason":"focus_steal","closed":1,"ms":300000}
{"ts":"2026-10-27T00:47:42.032Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:47:42.035Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","connId":"pane-socket:5","code":"display_busy"}
{"ts":"2026-10-27T00:47:42.036Z","level":"info","msg":"display set","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","name":"h","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:42.037Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T00:47:42.038Z","level":"info","msg":"display reported","paneId":"e452f2db-d0f4-4b9e-baef-7b38e81a69dc","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:47:42.051Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:42.052Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:42.052Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:42.060Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-bQY2fG/commands.json","count":0}
{"ts":"2026-10-27T00:47:42.072Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:42.073Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:42.073Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:42.086Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-8UL8gn/commands.json","count":0}
{"ts":"2026-10-27T00:47:42.477Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:42.478Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:42.478Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:42.486Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-J2OZpS/commands.json","count":0}
{"ts":"2026-10-27T00:47:42.517Z","level":"info","msg":"display script enabled","byClientId":"0a526852-1eca-482b-84ac-154853d7198d","byKind":"external"}
{"ts":"2026-10-27T00:47:42.640Z","level":"info","msg":"display set","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:47:42.640Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:42.642Z","level":"info","msg":"display reported","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:47:42.645Z","level":"info","msg":"display reported","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:47:42.646Z","level":"info","msg":"display closed","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","name":"g","reason":"closed"}
{"ts":"2026-10-27T00:47:42.647Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:42.655Z","level":"info","msg":"display reported","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:47:42.655Z","level":"info","msg":"display script cooldown","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","reason":"focus_steal","closed":0,"ms":300000}
{"ts":"2026-10-27T00:47:42.657Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ce2b6356-54ae-4ec1-85d7-d6eddcdc9897","connId":"pane-socket:3","code":"display_busy"}
{"ts":"2026-10-27T00:47:42.690Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:42.691Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:42.691Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:42.703Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-tFrxOy/commands.json","count":0}
{"ts":"2026-10-27T00:47:42.956Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:47:43.110Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"63096070-878b-4267-9bfa-50710b6869c8","connId":"pane-socket:1","code":"display_script_disabled"}
{"ts":"2026-10-27T00:47:43.111Z","level":"info","msg":"display set","paneId":"63096070-878b-4267-9bfa-50710b6869c8","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:43.112Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"63096070-878b-4267-9bfa-50710b6869c8","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:43.113Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"63096070-878b-4267-9bfa-50710b6869c8","connId":"pane-socket:3","code":"display_script_disabled"}
{"ts":"2026-10-27T00:47:43.114Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"63096070-878b-4267-9bfa-50710b6869c8","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:47:43.151Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:43.152Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:43.152Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:43.161Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-cRGCsJ/commands.json","count":0}
{"ts":"2026-10-27T00:47:43.620Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","connId":"pane-socket:1","code":"display_script_disabled"}
{"ts":"2026-10-27T00:47:43.623Z","level":"info","msg":"display script enabled","byClientId":"44a77026-d653-4ff5-82da-09c7a7c60f21","byKind":"external"}
{"ts":"2026-10-27T00:47:43.625Z","level":"info","msg":"display set","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:47:43.625Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:43.626Z","level":"info","msg":"display set","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:47:43.626Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:47:43.731Z","level":"info","msg":"display closed","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","name":"g","reason":"script_disabled"}
{"ts":"2026-10-27T00:47:43.731Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:47:43.735Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T00:47:43.736Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"67ecb33d-40b3-4839-94ec-7561fcf9d225","connId":"pane-socket:6","code":"display_script_disabled"}
{"ts":"2026-10-27T00:47:43.781Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:43.782Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:43.782Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:43.793Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-nBXTny/commands.json","count":0}
{"ts":"2026-10-27T00:47:44.064Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:44.100Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:44.101Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:44.101Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:44.109Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-iKn0bH/commands.json","count":0}
{"ts":"2026-10-27T00:47:44.183Z","level":"info","msg":"pane socket: request","op":"prefs.set","paneId":"5d15b284-24da-4932-9a35-4de87001285b","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:47:44.184Z","level":"info","msg":"pane socket: request","op":"prefs.get","paneId":"5d15b284-24da-4932-9a35-4de87001285b","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:47:44.185Z","level":"info","msg":"pane socket: request","op":"client.hello","paneId":"5d15b284-24da-4932-9a35-4de87001285b","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T00:47:44.186Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"5d15b284-24da-4932-9a35-4de87001285b","connId":"pane-socket:4","code":"display_script_disabled"}
{"ts":"2026-10-27T00:47:44.187Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"5d15b284-24da-4932-9a35-4de87001285b","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T00:47:44.537Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:44.538Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:44.538Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:44.546Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-wBgzJg/commands.json","count":0}
{"ts":"2026-10-27T00:47:44.797Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:44.799Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:44.799Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:44.804Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-luCoEV/commands.json","count":0}
{"ts":"2026-10-27T00:47:44.975Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:47:45.220Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:45.221Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:45.221Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:45.224Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-iNmDeo/commands.json","count":0}
{"ts":"2026-10-27T00:47:45.694Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:45.695Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:45.696Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:45.701Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-OSVIj3/commands.json","count":0}
{"ts":"2026-10-27T00:47:45.976Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"attention","reason":"リモートで soda serve が動いていません（リモートで起動してください）（soda: no running soda serve for session default）"}
{"ts":"2026-10-27T00:47:46.051Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:46.052Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:46.052Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:46.070Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-dTMIXL/commands.json","count":0}
{"ts":"2026-10-27T00:47:46.154Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:46.154Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:46.154Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:46.159Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-u30qP4/commands.json","count":0}
{"ts":"2026-10-27T00:47:46.484Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:46.485Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:46.485Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:46.492Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-NTQp8W/commands.json","count":0}
{"ts":"2026-10-27T00:47:46.620Z","level":"info","msg":"ask opened","askId":"d4b0650022e07c4437404f6ace2ef5d3","paneId":"9bc2217c-40b3-4b7d-9dbb-72af24f2dcbe","questions":1,"media":0}
{"ts":"2026-10-27T00:47:46.803Z","level":"info","msg":"ask closed","askId":"d4b0650022e07c4437404f6ace2ef5d3","paneId":"9bc2217c-40b3-4b7d-9dbb-72af24f2dcbe","status":"answered"}
{"ts":"2026-10-27T00:47:46.803Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"9bc2217c-40b3-4b7d-9dbb-72af24f2dcbe","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:46.844Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:46.845Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:46.845Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:46.850Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-85VWlv/commands.json","count":0}
{"ts":"2026-10-27T00:47:47.251Z","level":"info","msg":"ask opened","askId":"075996acb4d31dc6cc91b530ed96e1a9","paneId":"99b4456a-2edf-496e-bd0d-c59c63b3ca09","questions":1,"media":0}
{"ts":"2026-10-27T00:47:47.272Z","level":"info","msg":"ask closed","askId":"075996acb4d31dc6cc91b530ed96e1a9","paneId":"99b4456a-2edf-496e-bd0d-c59c63b3ca09","status":"answered"}
{"ts":"2026-10-27T00:47:47.272Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"99b4456a-2edf-496e-bd0d-c59c63b3ca09","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:47.320Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:47.321Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:47.321Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:47.327Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-NZlnrj/commands.json","count":0}
{"ts":"2026-10-27T00:47:47.772Z","level":"info","msg":"ask opened","askId":"c03b341184ed4741cc3adb6c8ff2b2fe","paneId":"ab16d704-51ec-4336-9594-0f0d3d9e3e5e","questions":1,"media":0}
{"ts":"2026-10-27T00:47:47.807Z","level":"info","msg":"ask closed","askId":"c03b341184ed4741cc3adb6c8ff2b2fe","paneId":"ab16d704-51ec-4336-9594-0f0d3d9e3e5e","status":"cancelled"}
{"ts":"2026-10-27T00:47:47.807Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"ab16d704-51ec-4336-9594-0f0d3d9e3e5e","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:47.940Z","level":"info","msg":"ask opened","askId":"0ee6e8df04f9a7b1bfd72337d7b89bf4","paneId":"ab16d704-51ec-4336-9594-0f0d3d9e3e5e","questions":1,"media":0}
{"ts":"2026-10-27T00:47:48.241Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:48.242Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:48.242Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:48.250Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-fnFBD5/commands.json","count":0}
{"ts":"2026-10-27T00:47:48.681Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:48.682Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:48.682Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:48.689Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-lsCjg3/commands.json","count":0}
{"ts":"2026-10-27T00:47:48.940Z","level":"info","msg":"ask closed","askId":"0ee6e8df04f9a7b1bfd72337d7b89bf4","paneId":"ab16d704-51ec-4336-9594-0f0d3d9e3e5e","status":"timeout"}
{"ts":"2026-10-27T00:47:48.940Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"ab16d704-51ec-4336-9594-0f0d3d9e3e5e","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:48.995Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:48.996Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:48.996Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:49.002Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-nxY5vc/commands.json","count":0}
{"ts":"2026-10-27T00:47:49.282Z","level":"info","msg":"ask opened","askId":"59fe50f66034cc87555591c10e92d7d5","paneId":"919a7d89-30cd-4e98-a693-e423e31339cc","questions":1,"media":0}
{"ts":"2026-10-27T00:47:49.345Z","level":"info","msg":"ask closed","askId":"59fe50f66034cc87555591c10e92d7d5","paneId":"919a7d89-30cd-4e98-a693-e423e31339cc","status":"answered"}
{"ts":"2026-10-27T00:47:49.345Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:49.349Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:49.394Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.395Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.395Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:49.401Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"b25c4cef-a6a9-47b1-bdd4-020155ccc708","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:49.404Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-AVFdjc/commands.json","count":0}
{"ts":"2026-10-27T00:47:49.439Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"b25c4cef-a6a9-47b1-bdd4-020155ccc708","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:47:49.469Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.470Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.470Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:49.476Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-sfcoyX/commands.json","count":0}
{"ts":"2026-10-27T00:47:49.515Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.515Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.516Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:49.522Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-LpNlGn/commands.json","count":0}
{"ts":"2026-10-27T00:47:49.784Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.784Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.784Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:49.793Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-O1qeDp/commands.json","count":0}
{"ts":"2026-10-27T00:47:49.932Z","level":"info","msg":"ask opened","askId":"6516586e678a074003c4b439d5b8d260","paneId":"c8784695-d74b-4865-b953-05e29f23320f","questions":1,"media":0}
{"ts":"2026-10-27T00:47:49.935Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.936Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:49.936Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:49.941Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-USQxBM/commands.json","count":0}
{"ts":"2026-10-27T00:47:49.980Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"c8784695-d74b-4865-b953-05e29f23320f","connId":"pane-socket:1","code":"ask_busy"}
{"ts":"2026-10-27T00:47:50.008Z","level":"info","msg":"ask closed","askId":"6516586e678a074003c4b439d5b8d260","paneId":"c8784695-d74b-4865-b953-05e29f23320f","status":"cancelled"}
{"ts":"2026-10-27T00:47:50.012Z","level":"info","msg":"ask opened","askId":"89edb6a81b094f2bcc9961b252e56f88","paneId":"c8784695-d74b-4865-b953-05e29f23320f","questions":1,"media":0}
{"ts":"2026-10-27T00:47:50.036Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"c8784695-d74b-4865-b953-05e29f23320f","connId":"pane-socket:3","code":"ask_busy"}
{"ts":"2026-10-27T00:47:50.038Z","level":"info","msg":"ask closed","askId":"89edb6a81b094f2bcc9961b252e56f88","paneId":"c8784695-d74b-4865-b953-05e29f23320f","status":"cancelled"}
{"ts":"2026-10-27T00:47:50.067Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:50.068Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:50.068Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:50.074Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-Bww6yP/commands.json","count":0}
{"ts":"2026-10-27T00:47:50.465Z","level":"info","msg":"display set","paneId":"e928bb8c-7dea-458e-b56b-7076ca527dbd","name":"two","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:47:50.499Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"p99","connId":"pane-socket:1","code":"not_found"}
{"ts":"2026-10-27T00:47:50.503Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"1f5bd6bc-ce6f-4653-bf45-a3567e5d1a26","connId":"pane-socket:2","code":"invalid_params"}
{"ts":"2026-10-27T00:47:50.507Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"1f5bd6bc-ce6f-4653-bf45-a3567e5d1a26","connId":"pane-socket:3","code":"invalid_params"}
{"ts":"2026-10-27T00:47:50.509Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"1f5bd6bc-ce6f-4653-bf45-a3567e5d1a26","connId":"pane-socket:4","code":"invalid_ask_spec"}
{"ts":"2026-10-27T00:47:50.514Z","level":"info","msg":"ask opened","askId":"e7a8dd1b6457961e86e400e374ed7e53","paneId":"1f5bd6bc-ce6f-4653-bf45-a3567e5d1a26","questions":1,"media":0}
{"ts":"2026-10-27T00:47:50.537Z","level":"info","msg":"ask closed","askId":"e7a8dd1b6457961e86e400e374ed7e53","paneId":"1f5bd6bc-ce6f-4653-bf45-a3567e5d1a26","status":"cancelled"}
{"ts":"2026-10-27T00:47:50.567Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:50.568Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:50.568Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:50.576Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-Qi2PpD/commands.json","count":0}
{"ts":"2026-10-27T00:47:50.598Z","level":"info","msg":"display set","paneId":"e928bb8c-7dea-458e-b56b-7076ca527dbd","name":"quotes","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T00:47:50.761Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:50.788Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:50.789Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:50.789Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:50.798Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-fJlucf/commands.json","count":0}
{"ts":"2026-10-27T00:47:50.984Z","level":"info","msg":"ask opened","askId":"f829acadda89655ce7039a16dea46dc3","paneId":"8b792bd4-f710-4bb8-ab23-58f3171fcfc1","questions":1,"media":0}
{"ts":"2026-10-27T00:47:51.004Z","level":"info","msg":"ask closed","askId":"f829acadda89655ce7039a16dea46dc3","paneId":"8b792bd4-f710-4bb8-ab23-58f3171fcfc1","status":"cancelled"}
{"ts":"2026-10-27T00:47:51.027Z","level":"info","msg":"ask opened","askId":"ed234fde196c69024c7eb3d4adbc0108","paneId":"8b792bd4-f710-4bb8-ab23-58f3171fcfc1","questions":1,"media":0}
{"ts":"2026-10-27T00:47:51.052Z","level":"info","msg":"ask closed","askId":"ed234fde196c69024c7eb3d4adbc0108","paneId":"8b792bd4-f710-4bb8-ab23-58f3171fcfc1","status":"cancelled"}
{"ts":"2026-10-27T00:47:51.190Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:51.191Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:51.191Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:51.199Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-RhYGHT/commands.json","count":0}
{"ts":"2026-10-27T00:47:51.242Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:51.243Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:51.244Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:51.255Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-cxE09h/commands.json","count":0}
{"ts":"2026-10-27T00:47:51.425Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:47:51.589Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.590Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.591Z","level":"info","msg":"pane socket: request","op":"agent.send_keys","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.592Z","level":"info","msg":"pane socket: request","op":"workspace.create","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:4","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.593Z","level":"info","msg":"pane socket: request","op":"pane.rename","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:5","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.593Z","level":"info","msg":"pane socket: request","op":"ask.subscribe","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:6","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.594Z","level":"info","msg":"pane socket: request","op":"agent.fork","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:7","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.595Z","level":"info","msg":"pane socket: request","op":"agent.fork_preview","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:8","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.595Z","level":"info","msg":"pane socket: request","op":"agent.usage","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:9","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.596Z","level":"info","msg":"pane socket: request","op":"agent.usage_watch","paneId":"800279f6-ef89-4841-85e8-271eec9a4c5f","connId":"pane-socket:10","code":"unknown_op"}
{"ts":"2026-10-27T00:47:51.845Z","level":"info","msg":"ask opened","askId":"58ca35706daba177bb47c42eca90e365","paneId":"c20fb559-7d90-4c93-bb22-a2bb4758d661","questions":1,"media":2}
{"ts":"2026-10-27T00:47:51.898Z","level":"info","msg":"ask closed","askId":"58ca35706daba177bb47c42eca90e365","paneId":"c20fb559-7d90-4c93-bb22-a2bb4758d661","status":"cancelled"}
{"ts":"2026-10-27T00:47:51.901Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:51.929Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:51.930Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:51.930Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:51.938Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-GVNnP1/commands.json","count":0}
{"ts":"2026-10-27T00:47:52.192Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:52.193Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:52.193Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:52.202Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-NGvgf5/commands.json","count":0}
{"ts":"2026-10-27T00:47:52.351Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:52.352Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:52.352Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:52.361Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-E0VxdL/commands.json","count":0}
{"ts":"2026-10-27T00:47:52.579Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:52.579Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:52.579Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:52.586Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-2DZd03/commands.json","count":0}
{"ts":"2026-10-27T00:47:53.066Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:53.596Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"81320525-5627-48cb-b961-af0b3792b784","connId":"pane-socket:1","code":"not_found"}
{"ts":"2026-10-27T00:47:53.641Z","level":"info","msg":"ask opened","askId":"dabbbbbccd590d6cfbcc2410928f9cd0","paneId":"81320525-5627-48cb-b961-af0b3792b784","questions":1,"media":0}
{"ts":"2026-10-27T00:47:53.663Z","level":"info","msg":"ask closed","askId":"dabbbbbccd590d6cfbcc2410928f9cd0","paneId":"81320525-5627-48cb-b961-af0b3792b784","status":"cancelled"}
{"ts":"2026-10-27T00:47:53.693Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:53.693Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:53.693Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:53.700Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-LAGcC7/commands.json","count":0}
{"ts":"2026-10-27T00:47:54.134Z","level":"info","msg":"ask opened","askId":"901732a9db2c6fb268527dc6c0764f7b","paneId":"444134b5-3b83-425a-bb69-3185b835f3a3","questions":1,"media":0}
{"ts":"2026-10-27T00:47:54.155Z","level":"info","msg":"ask closed","askId":"901732a9db2c6fb268527dc6c0764f7b","paneId":"444134b5-3b83-425a-bb69-3185b835f3a3","status":"cancelled"}
{"ts":"2026-10-27T00:47:54.177Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:54.178Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:54.178Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:54.184Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-4DDL1F/commands.json","count":0}
{"ts":"2026-10-27T00:47:54.312Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:54.358Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:54.359Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:54.359Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:54.368Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-7iYGIG/commands.json","count":0}
{"ts":"2026-10-27T00:47:54.544Z","level":"warn","msg":"cannot start the pane socket; `sodactl ask` in a pane needs a login","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-psock-4DDL1F/.p-3Pxywf/s' -> '/tmp/soda-psock-4DDL1F/pane.sock'"}
{"ts":"2026-10-27T00:47:54.610Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:54.610Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:54.611Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:54.617Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-cWR27c/commands.json","count":0}
{"ts":"2026-10-27T00:47:54.768Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:54.769Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:54.769Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:54.775Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-CgXbTD/commands.json","count":0}
{"ts":"2026-10-27T00:47:55.067Z","level":"info","msg":"ask opened","askId":"44e8f0c4f05a8b35b66796c0efaa29d3","paneId":"07bb2311-5998-4d05-9371-64654e90748d","questions":1,"media":0}
{"ts":"2026-10-27T00:47:55.106Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"07bb2311-5998-4d05-9371-64654e90748d","connId":"pane-socket:2","code":"invalid_ask_spec"}
{"ts":"2026-10-27T00:47:55.138Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"07bb2311-5998-4d05-9371-64654e90748d","connId":"pane-socket:3","code":"invalid_params"}
{"ts":"2026-10-27T00:47:55.141Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"07bb2311-5998-4d05-9371-64654e90748d","connId":"pane-socket:4","code":"unknown_op"}
{"ts":"2026-10-27T00:47:55.142Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"p99","connId":"pane-socket:5","code":"not_found"}
{"ts":"2026-10-27T00:47:55.144Z","level":"info","msg":"ask closed","askId":"44e8f0c4f05a8b35b66796c0efaa29d3","paneId":"07bb2311-5998-4d05-9371-64654e90748d","status":"answered"}
{"ts":"2026-10-27T00:47:55.144Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"07bb2311-5998-4d05-9371-64654e90748d","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:47:55.674Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:55.676Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:55.676Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:55.681Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-aFeel5/commands.json","count":0}
{"ts":"2026-10-27T00:47:56.137Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:56.137Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:56.137Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:56.141Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-wt8KgU/commands.json","count":0}
{"ts":"2026-10-27T00:47:58.069Z","level":"info","msg":"machine link closed","machine":"d44e6654d425690fad55b7c0d314258b","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:59.093Z","level":"info","msg":"machine link closed","machine":"d44e6654d425690fad55b7c0d314258b","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:47:59.133Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:47:59.738Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:59.738Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:59.739Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:59.747Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-9yKse9/commands.json","count":0}
{"ts":"2026-10-27T00:47:59.833Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:47:59.835Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:47:59.835Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:47:59.840Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-DvL44p/commands.json","count":0}
{"ts":"2026-10-27T00:48:00.169Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:00.170Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:00.170Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:00.188Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-7OzsYn/commands.json","count":0}
{"ts":"2026-10-27T00:48:00.781Z","level":"info","msg":"machine link closed","machine":"8635cf42b19cebd4faa96018a98135c0","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:48:01.303Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:01.304Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:01.304Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:01.312Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-7OzsYn/commands.json","count":0}
{"ts":"2026-10-27T00:48:01.678Z","level":"info","msg":"agent resume skipped","paneId":"aefd19c6-2bbb-4b50-8771-c858ab9eef20","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:01.778Z","level":"info","msg":"machine link closed","machine":"8635cf42b19cebd4faa96018a98135c0","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:48:01.817Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:01.817Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:01.817Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:01.826Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-vvUlgz/commands.json","count":0}
{"ts":"2026-10-27T00:48:02.188Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:02.188Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:02.188Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:02.192Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-p2QMFd/commands.json","count":0}
{"ts":"2026-10-27T00:48:02.258Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:02.259Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:02.259Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:02.267Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-CdLi9s/commands.json","count":0}
{"ts":"2026-10-27T00:48:02.856Z","level":"info","msg":"machine link closed","machine":"b893abbdf9bf75e9793fb7988c937c38","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:48:02.890Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:02.891Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:02.891Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:02.899Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-TxXcel/commands.json","count":0}
{"ts":"2026-10-27T00:48:03.323Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:03.324Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:03.324Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:03.331Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-MeHnIJ/commands.json","count":0}
{"ts":"2026-10-27T00:48:03.846Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:03.846Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:03.846Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:03.854Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-tPRlPk/commands.json","count":0}
{"ts":"2026-10-27T00:48:03.989Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:03.990Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:03.990Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:03.994Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-8zUWaX/commands.json","count":0}
{"ts":"2026-10-27T00:48:04.269Z","level":"info","msg":"machine link closed","machine":"bd6ef02ece3c55ddfcf8fddfdc8f5b20","kind":"transient","reason":"接続が切れました（ssh: connect to host 127.0.0.1 port 1: Connection refused）"}
{"ts":"2026-10-27T00:48:04.857Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:04.859Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:04.859Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:04.865Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-8JxheW/commands.json","count":0}
{"ts":"2026-10-27T00:48:04.872Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:04.874Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:04.875Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:04.882Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-GUIo2q/commands.json","count":0}
{"ts":"2026-10-27T00:48:05.373Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.374Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.374Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:05.379Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-dYQdaI/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:48:05.474Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.475Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.476Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:05.483Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-nrLsis/commands.json","count":0}
{"ts":"2026-10-27T00:48:05.517Z","level":"info","msg":"ask opened","askId":"596b89b1fd6697708f50d05de557dc94","paneId":"943f6715-3337-455a-9f28-d4f67c55f89c","questions":1,"media":0}
{"ts":"2026-10-27T00:48:05.540Z","level":"info","msg":"ask closed","askId":"596b89b1fd6697708f50d05de557dc94","paneId":"943f6715-3337-455a-9f28-d4f67c55f89c","status":"answered"}
{"ts":"2026-10-27T00:48:05.620Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.621Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.621Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:05.629Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-msr0ys/commands.json","count":0}
{"ts":"2026-10-27T00:48:05.792Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.793Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.793Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.793Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:05.798Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:05.798Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:05.799Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-7Pp83f/commands.json","count":0}
{"ts":"2026-10-27T00:48:05.805Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-7Pp83f/commands.json","count":0}
{"ts":"2026-10-27T00:48:06.236Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:06.237Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:06.237Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:06.242Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-epeBWg/commands.json","count":0}
{"ts":"2026-10-27T00:48:06.252Z","level":"info","msg":"ask opened","askId":"c192463c89f2f4cde0e4c54d8263ed14","paneId":"817269e5-05ca-4280-a2ab-bfaf76a57bab","questions":13,"media":0}
{"ts":"2026-10-27T00:48:06.292Z","level":"info","msg":"ask closed","askId":"c192463c89f2f4cde0e4c54d8263ed14","paneId":"817269e5-05ca-4280-a2ab-bfaf76a57bab","status":"answered"}
{"ts":"2026-10-27T00:48:06.334Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:06.335Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:06.336Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:06.342Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-4Xpwu5/commands.json","count":0}
{"ts":"2026-10-27T00:48:07.041Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.042Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.043Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:07.051Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-flp7Jx/commands.json","count":0}
{"ts":"2026-10-27T00:48:07.133Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.134Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.134Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:07.141Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-hkMHnF/commands.json","count":0}
{"ts":"2026-10-27T00:48:07.585Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.586Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.587Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:07.593Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-FJ2O12/commands.json","count":0}
{"ts":"2026-10-27T00:48:07.617Z","level":"info","msg":"ask opened","askId":"5196009eb7189dba55cf175cc2f6e397","paneId":"92b0ad7e-df08-4b28-baad-7b74019c5e6f","questions":1,"media":0}
{"ts":"2026-10-27T00:48:07.642Z","level":"info","msg":"ask closed","askId":"5196009eb7189dba55cf175cc2f6e397","paneId":"92b0ad7e-df08-4b28-baad-7b74019c5e6f","status":"cancelled"}
{"ts":"2026-10-27T00:48:07.672Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.672Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.672Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:07.681Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-xkUVAs/commands.json","count":0}
{"ts":"2026-10-27T00:48:07.755Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.757Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:07.757Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:07.765Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-yu6GLk/commands.json","count":0}
{"ts":"2026-10-27T00:48:08.272Z","level":"info","msg":"ask opened","askId":"2e31c9bf16aeba4c6b440ce4e50d833c","paneId":"23c0f844-ca90-414e-95f2-8382baea4c0a","questions":1,"media":0}
{"ts":"2026-10-27T00:48:08.341Z","level":"info","msg":"ask closed","askId":"2e31c9bf16aeba4c6b440ce4e50d833c","paneId":"23c0f844-ca90-414e-95f2-8382baea4c0a","status":"cancelled"}
{"ts":"2026-10-27T00:48:08.375Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:08.376Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:08.376Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:08.388Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-DejqWe/commands.json","count":0}
{"ts":"2026-10-27T00:48:08.575Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:08.576Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:08.576Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:08.581Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-prch8Y/commands.json","count":0}
{"ts":"2026-10-27T00:48:08.984Z","level":"info","msg":"ask opened","askId":"3ad134ec8c09128fa570bf7b2ff82544","paneId":"c67831ff-7b1b-4637-9585-7107e9e528b5","questions":3,"media":0}
{"ts":"2026-10-27T00:48:09.001Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:09.002Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:09.002Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:09.011Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-B7ckzE/commands.json","count":0}
{"ts":"2026-10-27T00:48:09.059Z","level":"info","msg":"ask closed","askId":"3ad134ec8c09128fa570bf7b2ff82544","paneId":"c67831ff-7b1b-4637-9585-7107e9e528b5","status":"answered"}
{"ts":"2026-10-27T00:48:09.091Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:09.092Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:09.092Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:09.100Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-QcfXCt/commands.json","count":0}
{"ts":"2026-10-27T00:48:09.445Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:09.446Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:09.446Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:09.453Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-TCzqhT/commands.json","count":0}
{"ts":"2026-10-27T00:48:09.696Z","level":"info","msg":"ask opened","askId":"3f849d3d265f771c9b0bba3581a98268","paneId":"9b567f38-94a9-4904-9f30-b425f3cbb712","questions":1,"media":0}
{"ts":"2026-10-27T00:48:09.768Z","level":"info","msg":"ask closed","askId":"3f849d3d265f771c9b0bba3581a98268","paneId":"9b567f38-94a9-4904-9f30-b425f3cbb712","status":"answered"}
{"ts":"2026-10-27T00:48:09.804Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:09.805Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:09.805Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:09.814Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-4IlhMp/commands.json","count":0}
{"ts":"2026-10-27T00:48:10.307Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:10.308Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:10.308Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:10.315Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-whBb3P/commands.json","count":0}
{"ts":"2026-10-27T00:48:10.367Z","level":"info","msg":"ask opened","askId":"39eb1b1049b19b43ef9f727b0c3fc093","paneId":"9ed4ffbe-5950-44fe-b6ef-2776bcb120cf","questions":1,"media":0}
{"ts":"2026-10-27T00:48:10.388Z","level":"info","msg":"ask closed","askId":"39eb1b1049b19b43ef9f727b0c3fc093","paneId":"9ed4ffbe-5950-44fe-b6ef-2776bcb120cf","status":"cancelled"}
{"ts":"2026-10-27T00:48:10.872Z","level":"info","msg":"ask opened","askId":"134b2ff8d15a03c1b1225404138abe45","paneId":"8a6cb1ad-a2b6-45bf-acde-9643888ee43d","questions":1,"media":0}
{"ts":"2026-10-27T00:48:10.904Z","level":"info","msg":"ask closed","askId":"134b2ff8d15a03c1b1225404138abe45","paneId":"8a6cb1ad-a2b6-45bf-acde-9643888ee43d","status":"cancelled"}
{"ts":"2026-10-27T00:48:10.913Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:8a6cb1ad-a2b6-45bf-acde-9643888ee43d"]}
{"ts":"2026-10-27T00:48:10.949Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:10.949Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:10.950Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:10.957Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-Ez3MDS/commands.json","count":0}
{"ts":"2026-10-27T00:48:11.153Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:11.154Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:11.154Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:11.159Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-oYcysk/commands.json","count":0}
{"ts":"2026-10-27T00:48:11.584Z","level":"info","msg":"ask opened","askId":"d6551b58eb551d33136f2e780b6ef432","paneId":"16c25280-08c3-43b5-8324-09d9643323f3","questions":1,"media":0}
{"ts":"2026-10-27T00:48:11.643Z","level":"info","msg":"ask closed","askId":"d6551b58eb551d33136f2e780b6ef432","paneId":"16c25280-08c3-43b5-8324-09d9643323f3","status":"cancelled"}
{"ts":"2026-10-27T00:48:11.678Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:11.679Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:11.679Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:11.689Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-DeRQff/commands.json","count":0}
{"ts":"2026-10-27T00:48:11.728Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:11.729Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:11.729Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:11.740Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-kVmtiC/state-HvfgKL/commands.json","count":0}
{"ts":"2026-10-27T00:48:11.767Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:11.768Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:11.768Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:11.776Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-l1mP9e/commands.json","count":0}
{"ts":"2026-10-27T00:48:12.159Z","level":"info","msg":"ask opened","askId":"dccd2059fd56dbea5ce44fe9c219d446","paneId":"137c3a86-bce8-43b7-8bf8-672c421aa61e","questions":1,"media":0}
{"ts":"2026-10-27T00:48:12.235Z","level":"info","msg":"ask closed","askId":"dccd2059fd56dbea5ce44fe9c219d446","paneId":"137c3a86-bce8-43b7-8bf8-672c421aa61e","status":"answered"}
{"ts":"2026-10-27T00:48:12.250Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:12.251Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:12.251Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:12.261Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-9cgtZO/commands.json","count":0}
{"ts":"2026-10-27T00:48:12.821Z","level":"info","msg":"agent session attached","paneId":"40060e2b-8f8e-45df-95f7-9e27289927db","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:48:16.597Z","level":"info","msg":"agent session attached","paneId":"16d39eb1-1780-4f84-a781-9d8e02470221","kind":"claude","session":"21dd037c","source":"hook"}
{"ts":"2026-10-27T00:48:16.939Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:16.942Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:16.942Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:16.949Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-vipn9H/commands.json","count":0}
{"ts":"2026-10-27T00:48:17.743Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:17.744Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:17.744Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:17.751Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-euDiGo/commands.json","count":0}
{"ts":"2026-10-27T00:48:18.407Z","level":"info","msg":"display script enabled","byClientId":"c653c549-32f6-4493-be09-b04a14ad54c6","byKind":"external"}
{"ts":"2026-10-27T00:48:18.487Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:18.489Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:18.489Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:18.498Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-fHdZ9l/commands.json","count":0}
{"ts":"2026-10-27T00:48:19.134Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:19.135Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:19.135Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:19.143Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-oO9Tvx/commands.json","count":0}
{"ts":"2026-10-27T00:48:19.654Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:19.655Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:19.655Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:19.661Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-oO9Tvx/commands.json","count":0}
{"ts":"2026-10-27T00:48:19.990Z","level":"info","msg":"agent resume skipped","paneId":"987a812d-03d9-4dc1-b194-2ea9c53be268","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:20.113Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:20.113Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:20.113Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:20.136Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-RoafYa/commands.json","count":0}
{"ts":"2026-10-27T00:48:20.373Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:20.376Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:20.376Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:20.398Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-IhyZ9e/commands.json","count":0}
{"ts":"2026-10-27T00:48:20.663Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:20.665Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:20.665Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:20.673Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-IPNunx/commands.json","count":0}
{"ts":"2026-10-27T00:48:21.088Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:21.088Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:21.088Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:21.097Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-yMp1Q2/commands.json","count":0}
{"ts":"2026-10-27T00:48:21.367Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:21.368Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:21.368Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:21.376Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-v4NRdu/commands.json","count":0}
{"ts":"2026-10-27T00:48:21.588Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:21.590Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:21.590Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:21.615Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-u9M3A8/commands.json","count":0}
{"ts":"2026-10-27T00:48:21.989Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:21.991Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:21.991Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:21.999Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-2SWHJU/commands.json","count":0}
{"ts":"2026-10-27T00:48:22.029Z","level":"warn","msg":"origin rejected","path":"/api/local-login","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:35079","allowed":["localhost:35079","127.0.0.1:35079","[::1]:35079"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-27T00:48:22.079Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:22.080Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:22.080Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:22.088Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-LaBxtx/commands.json","count":0}
{"ts":"2026-10-27T00:48:22.315Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:22.316Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:22.316Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:22.323Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-d8hZuJ/commands.json","count":0}
{"ts":"2026-10-27T00:48:22.589Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:22.590Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:22.590Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:22.601Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-HgejOB/commands.json","count":0}
{"ts":"2026-10-27T00:48:23.089Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:23.090Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:23.090Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:23.159Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-2B3F48/commands.json","count":0}
{"ts":"2026-10-27T00:48:23.876Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:23.877Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:23.877Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:23.883Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-2SWHJU/commands.json","count":0}
{"ts":"2026-10-27T00:48:24.140Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:24.141Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:24.141Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:24.148Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-BJ5iEX/commands.json","count":0}
{"ts":"2026-10-27T00:48:24.209Z","level":"info","msg":"agent resume skipped","paneId":"c0ef0c3a-c365-4a55-9a06-47c9fcc3dcdc","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:24.513Z","level":"info","msg":"agent resume skipped","paneId":"b2f65bfd-5500-4fb9-a745-e9548365d2b7","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:24.818Z","level":"info","msg":"agent resume skipped","paneId":"5417d43c-d26c-4803-9db7-4b51ace51f0a","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:25.086Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:25.087Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:25.087Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:25.095Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-TnfoVr/commands.json","count":0}
{"ts":"2026-10-27T00:48:25.122Z","level":"info","msg":"agent resume skipped","paneId":"6bc91141-5d82-4366-b505-6b8a0c2ae6e1","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:25.433Z","level":"info","msg":"agent resume skipped","paneId":"9efd5f3c-ac91-4c11-851f-9b6b1b4e9b2d","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:25.449Z","level":"info","msg":"graph.json was migrated to schema 2 (a copy of the old file is in graph-backups/)"}
{"ts":"2026-10-27T00:48:25.530Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:25.531Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:25.531Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:25.537Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-2SWHJU/commands.json","count":0}
{"ts":"2026-10-27T00:48:25.870Z","level":"info","msg":"agent resume skipped","paneId":"c0ef0c3a-c365-4a55-9a06-47c9fcc3dcdc","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:26.180Z","level":"info","msg":"agent resume skipped","paneId":"b2f65bfd-5500-4fb9-a745-e9548365d2b7","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:26.484Z","level":"info","msg":"agent resume skipped","paneId":"5417d43c-d26c-4803-9db7-4b51ace51f0a","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:26.716Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:26.719Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:26.719Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:26.727Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-tdjE24/commands.json","count":0}
{"ts":"2026-10-27T00:48:26.790Z","level":"info","msg":"agent resume skipped","paneId":"6bc91141-5d82-4366-b505-6b8a0c2ae6e1","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:27.107Z","level":"info","msg":"agent resume skipped","paneId":"9efd5f3c-ac91-4c11-851f-9b6b1b4e9b2d","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:27.207Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.208Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.208Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:27.214Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-tdjE24/commands.json","count":0}
{"ts":"2026-10-27T00:48:27.219Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":46417}
{"ts":"2026-10-27T00:48:27.235Z","level":"info","msg":"handoff: complete","id":"abcdef01","adopted":1,"dropped":0}
{"ts":"2026-10-27T00:48:27.322Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.323Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.323Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:27.327Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-l9QdcS/commands.json","count":0}
{"ts":"2026-10-27T00:48:27.749Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.749Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.749Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:27.754Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-l9QdcS/commands.json","count":0}
{"ts":"2026-10-27T00:48:27.758Z","level":"warn","msg":"handoff: closed terminals that were not part of the handoff","closed":1}
{"ts":"2026-10-27T00:48:27.758Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":44487}
{"ts":"2026-10-27T00:48:27.769Z","level":"info","msg":"handoff: complete","id":"abcdef04","adopted":1,"dropped":0}
{"ts":"2026-10-27T00:48:27.794Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.796Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.797Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:27.806Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-81d9Mo/commands.json","count":1}
{"ts":"2026-10-27T00:48:27.826Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.827Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:27.827Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:27.832Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-rKvY23/commands.json","count":0}
{"ts":"2026-10-27T00:48:28.241Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:28.241Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:28.242Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:28.247Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-rKvY23/commands.json","count":0}
{"ts":"2026-10-27T00:48:28.251Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":44761}
{"ts":"2026-10-27T00:48:28.497Z","level":"info","msg":"custom command run","commandId":"cat","type":"popup","clientId":"f7c28029-ff0b-465f-955f-6c944d946200","paneId":"ee14f26a-7db3-4746-afce-2e26b29a0e3a"}
{"ts":"2026-10-27T00:48:28.567Z","level":"info","msg":"agent resume skipped","paneId":"f8c0241b-46eb-4e1f-b04a-9082dd420814","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:28.567Z","level":"warn","msg":"handoff: some handed-off panes were not usable and were closed","reason":"written by pid 1259559, not 1259558","panes":["f8c0241b-46eb-4e1f-b04a-9082dd420814"]}
{"ts":"2026-10-27T00:48:28.567Z","level":"info","msg":"handoff: complete","id":"abcdef02","adopted":0,"dropped":1}
{"ts":"2026-10-27T00:48:28.734Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:28.735Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:28.735Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:28.740Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-zPvH9Y/commands.json","count":1}
{"ts":"2026-10-27T00:48:28.915Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:28.916Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:28.916Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:28.922Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-QS8aYW/commands.json","count":0}
{"ts":"2026-10-27T00:48:29.294Z","level":"info","msg":"custom command run","commandId":"quit","type":"popup","clientId":"2cde493a-91ff-4ac2-b1ca-05226c66fa61","paneId":"d6e205cf-8106-4c43-bf88-cc973880ec2e"}
{"ts":"2026-10-27T00:48:29.360Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:29.361Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:29.361Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:29.375Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-QS8aYW/commands.json","count":0}
{"ts":"2026-10-27T00:48:29.387Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":44219}
{"ts":"2026-10-27T00:48:29.407Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:29.408Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:29.409Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:29.441Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-qyEFc2/commands.json","count":1}
{"ts":"2026-10-27T00:48:29.714Z","level":"info","msg":"agent resume skipped","paneId":"fe79926d-e757-4aa6-9c4e-56473892289b","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:29.714Z","level":"info","msg":"handoff: complete","id":"abcdef03","adopted":0,"dropped":1}
{"ts":"2026-10-27T00:48:29.714Z","level":"warn","msg":"handoff: some handed-off panes were not usable and were closed","reason":"not a pty master","panes":["fe79926d-e757-4aa6-9c4e-56473892289b"]}
{"ts":"2026-10-27T00:48:29.993Z","level":"info","msg":"custom command run","commandId":"note","type":"shell","clientId":"e9b15513-f341-42c5-8377-41c927c091e8","paneId":"ab7509d6-53b1-40a9-bd02-eaaeaf0a23a8"}
{"ts":"2026-10-27T00:48:30.052Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:30.053Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:30.053Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:30.060Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-wt5N8a/commands.json","count":1}
{"ts":"2026-10-27T00:48:30.266Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:30.266Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:30.266Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:30.273Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-VMUpuQ/commands.json","count":0}
{"ts":"2026-10-27T00:48:30.590Z","level":"info","msg":"custom command run","commandId":"cat","type":"popup","clientId":"8566625e-81bf-4789-886c-630d554b5896","paneId":"f0f2efe0-24e1-4fae-a192-dece37165474"}
{"ts":"2026-10-27T00:48:30.703Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:30.704Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:30.704Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:30.715Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-sOSpjJ/sessions/work/commands.json","count":1}
{"ts":"2026-10-27T00:48:30.740Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:30.741Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:30.741Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:30.748Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-VMUpuQ/commands.json","count":0}
{"ts":"2026-10-27T00:48:30.752Z","level":"error","msg":"handoff: the handoff data was unusable; closed the handed-off terminals and starting normally","reason":"cannot read /tmp/soda-handoff-compose-VMUpuQ/handoff.json: ENOENT","closed":1}
{"ts":"2026-10-27T00:48:31.070Z","level":"info","msg":"agent resume skipped","paneId":"4152bf0c-b78a-461c-8b66-2c7f5bdecf52","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:31.197Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:31.198Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:31.198Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:31.205Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-psock-h8HJzF/commands.json","count":0}
{"ts":"2026-10-27T00:48:31.425Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:31.426Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:31.426Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:31.435Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-fDSbwP/commands.json","count":1}
{"ts":"2026-10-27T00:48:31.646Z","level":"info","msg":"ask opened","askId":"8f4c4d4a6fb1050e489c0e28ac0c81d4","paneId":"4384096b-4d44-4e8f-b5fc-b7fab0b82b91","questions":1,"media":0}
{"ts":"2026-10-27T00:48:31.648Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T00:48:31.649Z","level":"info","msg":"ask closed","askId":"8f4c4d4a6fb1050e489c0e28ac0c81d4","paneId":"4384096b-4d44-4e8f-b5fc-b7fab0b82b91","status":"cancelled"}
{"ts":"2026-10-27T00:48:31.650Z","level":"info","msg":"pane socket: refused a connection","code":"pane_socket_busy"}
{"ts":"2026-10-27T00:48:31.659Z","level":"info","msg":"handoff: replacing this server with the version on disk","id":"eef09f7c4a9b1dfd","panes":1}
{"ts":"2026-10-27T00:48:31.660Z","level":"info","msg":"pane socket: refused a connection","code":"pane_socket_busy"}
{"ts":"2026-10-27T00:48:31.661Z","level":"error","msg":"handoff: execve failed; keeping the current server","error":"execve refused by the test"}
{"ts":"2026-10-27T00:48:31.680Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"4384096b-4d44-4e8f-b5fc-b7fab0b82b91","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:48:32.027Z","level":"warn","msg":"custom commands rejected","file":"/tmp/soda-compose-cmd-fDSbwP/commands.json","problem":"commands.json: commands[0]: 知らない項目です（env）"}
{"ts":"2026-10-27T00:48:32.377Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:32.379Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:32.379Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:32.386Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-1ndr6R/commands.json","count":0}
{"ts":"2026-10-27T00:48:33.103Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T00:48:33.103Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T00:48:33.107Z","level":"info","msg":"ask opened","askId":"e79e6dff0746b30afb26a59a6c55511b","paneId":"f75de411-dc2b-4e86-b991-9e14e4b11020","questions":1,"media":5}
{"ts":"2026-10-27T00:48:33.147Z","level":"info","msg":"ask closed","askId":"e79e6dff0746b30afb26a59a6c55511b","paneId":"f75de411-dc2b-4e86-b991-9e14e4b11020","status":"answered"}
{"ts":"2026-10-27T00:48:33.196Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:33.196Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:33.196Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:33.204Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-kPt3Jw/commands.json","count":0}
{"ts":"2026-10-27T00:48:33.737Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T00:48:33.737Z","level":"info","msg":"ask remote image failed"}
{"ts":"2026-10-27T00:48:33.737Z","level":"info","msg":"ask opened","askId":"b59b4e3695bbb426f6ecc748013fce0c","paneId":"a12e828e-7ae0-490a-b67b-5cbc2eacc691","questions":1,"media":0}
{"ts":"2026-10-27T00:48:33.760Z","level":"info","msg":"ask closed","askId":"b59b4e3695bbb426f6ecc748013fce0c","paneId":"a12e828e-7ae0-490a-b67b-5cbc2eacc691","status":"cancelled"}
{"ts":"2026-10-27T00:48:33.795Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:33.796Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:33.796Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:33.803Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-TFO8BG/commands.json","count":0}
{"ts":"2026-10-27T00:48:33.837Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:33.838Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:33.838Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:33.844Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-tui-it-4ytKXM/state/commands.json","count":0}
{"ts":"2026-10-27T00:48:34.317Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:34.318Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:34.318Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:34.325Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-6YZzqJ/commands.json","count":0}
{"ts":"2026-10-27T00:48:34.854Z","level":"info","msg":"ask opened","askId":"4c4d04ee3699529feb30603b8abc8212","paneId":"fca00c02-fcae-4fc0-8760-d8dc82709e9d","questions":1,"media":1}
{"ts":"2026-10-27T00:48:34.877Z","level":"info","msg":"ask closed","askId":"4c4d04ee3699529feb30603b8abc8212","paneId":"fca00c02-fcae-4fc0-8760-d8dc82709e9d","status":"cancelled"}
{"ts":"2026-10-27T00:48:34.990Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:34.991Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:34.991Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:34.999Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-pGZsu9/commands.json","count":0}
{"ts":"2026-10-27T00:48:35.446Z","level":"info","msg":"pane socket: request","op":"ask.features","paneId":"b653776b-7600-47f3-a6bb-2191ee1cb554","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:48:35.447Z","level":"info","msg":"pane socket: request","op":"ask.nope","paneId":"b653776b-7600-47f3-a6bb-2191ee1cb554","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:48:36.047Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:36.048Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:36.049Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:36.054Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-NVbUYk/commands.json","count":0}
{"ts":"2026-10-27T00:48:36.861Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:36.864Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:36.865Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:36.869Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:3bbbf72d-9df4-48c1-9a30-d1828ce84552"]}
{"ts":"2026-10-27T00:48:36.877Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-ysbNdr/commands.json","count":0}
{"ts":"2026-10-27T00:48:37.120Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:37.123Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:37.123Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:37.138Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-M7HiEm/commands.json","count":0}
{"ts":"2026-10-27T00:48:37.364Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:37.364Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:37.364Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:37.370Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-XqRqMO/commands.json","count":0}
{"ts":"2026-10-27T00:48:37.949Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:37.950Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:37.950Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:37.955Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-decvLB/commands.json","count":0}
{"ts":"2026-10-27T00:48:38.167Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:38.168Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:38.168Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:38.176Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-NZX48a/commands.json","count":0}
{"ts":"2026-10-27T00:48:38.362Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:38.363Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:38.363Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:38.368Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-sGzOYT/commands.json","count":0}
{"ts":"2026-10-27T00:48:38.815Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:38.818Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:38.819Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:38.827Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-mig-state-e6VPzY/commands.json","count":0}
{"ts":"2026-10-27T00:48:38.945Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:38.945Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:38.946Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:38.954Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-bWx9Yi/commands.json","count":0}
{"ts":"2026-10-27T00:48:39.944Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:39.945Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:39.945Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:39.950Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-mig-state-e6VPzY/commands.json","count":0}
{"ts":"2026-10-27T00:48:40.276Z","level":"info","msg":"agent resume skipped","paneId":"42808cbc-aa14-474d-b834-eaf44788832e","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:40.492Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:40.494Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:40.494Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:40.502Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-OTdABV/commands.json","count":0}
{"ts":"2026-10-27T00:48:40.593Z","level":"info","msg":"agent resume skipped","paneId":"3fefa017-fc5c-4983-a778-c8e3771c9293","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:40.897Z","level":"info","msg":"agent resume skipped","paneId":"66228cd3-7b62-422f-b299-aeff6634f9a1","reason":"no-session-ref"}
{"ts":"2026-10-27T00:48:40.974Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:40.975Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:40.975Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:40.980Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-NgKrGY/commands.json","count":0}
{"ts":"2026-10-27T00:48:41.403Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:41.404Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:41.404Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:41.408Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-7bK9Ht/commands.json","count":0}
{"ts":"2026-10-27T00:48:41.723Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:41.725Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:41.725Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:41.732Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-n9IyqD/commands.json","count":0}
{"ts":"2026-10-27T00:48:41.824Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:41.825Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:41.825Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:41.830Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-7xp2t8/commands.json","count":0}
{"ts":"2026-10-27T00:48:42.229Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:42.231Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:42.231Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:42.259Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-KLdwpI/commands.json","count":0}
{"ts":"2026-10-27T00:48:42.270Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T00:48:42.699Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:42.699Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:42.700Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:42.704Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-96Va6i/commands.json","count":0}
{"ts":"2026-10-27T00:48:42.765Z","level":"warn","msg":"handoff: preflight failed; keeping the current server","message":"held by the test"}
{"ts":"2026-10-27T00:48:43.070Z","level":"warn","msg":"bridge: closing a connection after a protocol violation","reason":"channel 1 is already open"}
{"ts":"2026-10-27T00:48:43.073Z","level":"warn","msg":"bridge: closing a connection after a protocol violation","reason":"BridgeProtocolError: unexpected frame type 66"}
{"ts":"2026-10-27T00:48:43.816Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:43.817Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:43.817Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:43.823Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-JEcyv8/commands.json","count":0}
{"ts":"2026-10-27T00:48:43.859Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:43.860Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:43.860Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:43.864Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-JEcyv8/commands.json","count":0}
{"ts":"2026-10-27T00:48:44.300Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:44.301Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:44.301Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:44.306Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-WcO0vH/commands.json","count":0}
{"ts":"2026-10-27T00:48:44.355Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:44.356Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:44.356Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:44.362Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-SCyepI/commands.json","count":0}
{"ts":"2026-10-27T00:48:44.784Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:44.785Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:44.785Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:44.805Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-mIMPJz/commands.json","count":0}
{"ts":"2026-10-27T00:48:44.834Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:44.835Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:44.836Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:44.843Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-mIMPJz/commands.json","count":0}
{"ts":"2026-10-27T00:48:45.666Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:48:45.668Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:48:45.668Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:48:45.674Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-hooksource-YicpKz/state/commands.json","count":0}
{"ts":"2026-10-27T00:48:46.123Z","level":"info","msg":"agent session attached","paneId":"e4ae38ff-780a-4eb4-861d-c8994b3376dd","kind":"claude","session":"11111111","source":"hook"}
{"ts":"2026-10-27T00:48:46.231Z","level":"info","msg":"agent session attached","paneId":"e4ae38ff-780a-4eb4-861d-c8994b3376dd","kind":"claude","session":"22222222","source":"hook"}
{"ts":"2026-10-27T00:48:46.325Z","level":"info","msg":"agent session attached","paneId":"e4ae38ff-780a-4eb4-861d-c8994b3376dd","kind":"claude","session":"33333333","source":"hook"}
{"ts":"2026-10-27T00:48:46.355Z","level":"info","msg":"agent session attached","paneId":"e4ae38ff-780a-4eb4-861d-c8994b3376dd","kind":"claude","session":"33333333","source":"hook"}
{"ts":"2026-10-27T00:48:46.698Z","level":"info","msg":"agent session attached","paneId":"e4ae38ff-780a-4eb4-861d-c8994b3376dd","kind":"claude","session":"aaaaaaaa","source":"hook"}
{"ts":"2026-10-27T00:48:46.726Z","level":"info","msg":"agent session attached","paneId":"e4ae38ff-780a-4eb4-861d-c8994b3376dd","kind":"claude","session":"bbbbbbbb","source":"hook"}
{"ts":"2026-10-27T00:48:46.759Z","level":"info","msg":"agent session attached","paneId":"e4ae38ff-780a-4eb4-861d-c8994b3376dd","kind":"claude","session":"cccccccc","source":"hook"}
hint: Using 'master' as the name for the initial branch. This default branch name
hint: is subject to change. To configure the initial branch name to use in all
hint: of your new repositories, which will suppress this warning, call:
hint: 
hint: 	git config --global init.defaultBranch <name>
hint: 
hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
hint: 'development'. The just-created branch can be renamed via this command:
hint: 
hint: 	git branch -m <name>
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f17742094da4382feea13fe8dac43754": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=bf7b23db71acec1fdd8e2249a3c0a67f": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=657097502ccce702e04a508ed475a991": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=8204f1d67fedaa4f04d2100975c6e4f8": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=b92a211a86846240d4429861ed59f5d3": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=847ebc0cf8572a13c46ce00766b64091": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=7e49c1ddf42950995588ce3776a1b7e7": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=a6a994088f7850bf1e528be865a3704f": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f9197eb35d446fe1c7b138794f0c5583": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=c2fb75a5736e3a42023434b28d7a967b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=e1914c29d03ba2e04ecf9c6534fb1d7a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=09914a2632ec9490624b2fba44e5b1da": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=248db2c1f4ec6518a6e3d0b92074cec2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=90e2b67d5b1278a1a7aa5a0d7c277b27": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=8238ac4a7c16ea7b9a16115d8083d9d0": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=71af0b66794648354cf7deefca8bae38": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=626e0faac8dece23d22aae85eb867352": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f5e3da1d3d0fc9aec5d420db0932c062": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=28d9b4ee26a096df9e5aed4691c55df2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=930041a8adb71037facae34e0643bb6d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=9c4454be0e6b903b95b87cd9f102b0b5": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a685505c6164d7a86b748b2581e19764": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=4c6a7674a05adc71d78bcc9bf6e4ad61": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=9e03531eed436b7017ff492d750e363a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=04ddfd4572008a09d1b57b384f6ec63b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=3765077c92abd28aab976cdd9b12991e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=c10c91db7f5791a06379af7a11411bfe": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=20617f3685ce1459f4eb8d0cc1e800ee": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=407638f2a86557dc23b85a2a2b1b8270": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=220b53ae6c6c883e15fc38d52845ef7a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=0c79f73c994908a5482e70f6a4c49bc1": connect ECONNREFUSED 127.0.0.1:3000
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at Socket.socketErrorListener (node:_http_client:593:5)
    at Socket.emit (node:events:509:28)
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at processTicksAndRejections (node:internal/process/task_queues:90:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=9c8b92f80beead4a49deac11ebf3f944": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=657ae7247a77f84464df206ad0738e3e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=4e7579840e3088692cddf6cad1117022": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=b63251d4f80cf2e9d4163c636605930a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=52d7a84ce88685a6ffca18df2bd51e9c": connect ECONNREFUSED 127.0.0.1:3000
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at Socket.socketErrorListener (node:_http_client:593:5)
    at Socket.emit (node:events:509:28)
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at processTicksAndRejections (node:internal/process/task_queues:90:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a01a52528a3c7eede4498daeecf03451": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=b59220ec3edf68826c9ec3bce243168e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=d34b3e38aeb62fc37d288e2cb97a29b4": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=d4ed5f838699c1182139e8db4fb82fc7": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a1274a6b01130982da732e0a5466ecd3": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=ce0e0509dccd3fabc7b438f96df57acc": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=be195d0f3841f96dc2a2f5c653360019": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=7415c66a1b569ffe7e719b6c51898427": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=56059b2760ad929582ab84e5fe7cf911": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=6566ca6d637d7efee02c90e9af95b5d4": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=8d705cb91874b48646eed5cc6583bce3": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
[graph-perf] {"case":"web-subagent-churn","env":"happy-dom","subagents":60,"generations":20,"totalMs":23,"limitMs":10000}
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a8d35f698ffb81e08c3a98f8bb9b5e41": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=bfb4000abffb72ff7f7a1a8c2cb8ddd8": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=2d8b777f6b0baa232e03185dab3a53fe": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=c8b3286cb3eab29dca38cc6b36894498": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=d73fd7678b2d98109c5efc99580998c6": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=54eefabe4a29911a44e7c830d492f693": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=066f9bfcec9b5541198f931c9d87c8df": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=c1269f5ad92cd29aa2cf219eeda8477a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=94d100deaf8e704b44b0c2a953e474dc": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a9218425f6b7fe1201b8702051106a12": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=3f959e2d3582e5f950985b4cc69251b6": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=e9c4e28736c314568957f98565afebe9": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=bd153288712a338abdc260b4d4aca991": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=58aafc5c6ec3623993dc8b6b64b62865": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ffa33157aa9a620f3a85727bd392a289": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ed937b9fe444a01d3fc6467b06fdf268": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=8a642b34dc4b03d7d9ddb59c71d99fed": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f29ebf423b1ae0dbc4a64489e51f1e1d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=376ebca46a2f22c8a5e79bed0a98f0a9": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=23d630a8b72a8789eefa5e25b7b989ee": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=9ff16533d992edb87f41eb60b7d80e14": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=dc1a452f88aa3789850e03d0ce493318": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=5e6b48789ae6634701f5c012d19fcd78": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=d3eb6a306b20266fe7613794dbe5c29a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=70b81e042658bddd220c97660844763b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
[graph-perf] {"case":"web-render","env":"happy-dom","panes":16,"links":32,"openMs":282,"rerenderMs":23,"limitMs":10000}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-microphone/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/html.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:556:48)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
    at insert (/workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:31:12)
    at mountElement (/workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5772:5)
    at processElement (/workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5688:7)
    at patch (/workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5554:11)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/html.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:556:48)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
    at insert (/workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:31:12)
    at mountElement (/workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5772:5)
    at processElement (/workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5688:7)
    at patch (/workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5554:11)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load script "http://localhost:3000/display-view/frame.js". JavaScript file loading is disabled.
    at HTMLScriptElement.#loadScript (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-script-element/HTMLScriptElement.js:549:31)
    at HTMLScriptElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-script-element/HTMLScriptElement.js:315:33)
    at HTMLScriptElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at insertChildren (eval at boot (/workspaces/sodashitsu-desktop-microphone/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:349:11)
    at inject (eval at boot (/workspaces/sodashitsu-desktop-microphone/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:371:21)
    at onRender (eval at boot (/workspaces/sodashitsu-desktop-microphone/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:491:7)
    at Object.onPort [as onmessage] (eval at boot (/workspaces/sodashitsu-desktop-microphone/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:507:7)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-microphone/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-microphone/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-microphone/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-microphone/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)

 Test Files  777 passed (777)
      Tests  11619 passed (11619)
   Start at  09:44:09
   Duration  393.45s (tests 79%, import 11%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 227 times · 73.91s total, 30% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

## Native generated checks after completion-barrier test improvement

```text
microphone_generated_pcm_checks_passed

```

## Final browser verification

```text

Running 12 tests using 1 worker

(node:1273482) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T00:50:45.229Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:50:45.229Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:50:45.230Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:50:45.235Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-A6H3Bk/commands.json","count":0}
{"ts":"2026-10-27T00:50:45.695Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:50:45.696Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:50:45.696Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:50:45.697Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-KuM4cp/commands.json","count":0}
{"ts":"2026-10-27T00:50:52.202Z","level":"info","msg":"machine link closed","machine":"ad62ddb01f99fa065171808bf95858bd","kind":"transient","reason":"接続が切れました"}
  ✓   1 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: udp, initially muted, bounded decode, mute/stop (7.2s)
{"ts":"2026-10-27T00:50:52.320Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:50:52.320Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:50:52.320Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:50:52.330Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-sgabrl/commands.json","count":0}
{"ts":"2026-10-27T00:50:52.745Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:50:52.746Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:50:52.747Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:50:52.747Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-cFl4tF/commands.json","count":0}
{"ts":"2026-10-27T00:50:56.999Z","level":"info","msg":"machine link closed","machine":"f3ff929b07f8c01d975621fe86d4bab6","kind":"transient","reason":"接続が切れました"}
  ✓   2 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: wss, initially muted, bounded decode, mute/stop (4.8s)
{"ts":"2026-10-27T00:50:57.107Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:50:57.107Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:50:57.108Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:50:57.116Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-SZ51Es/commands.json","count":0}
{"ts":"2026-10-27T00:50:57.617Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:50:57.617Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:50:57.618Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:50:57.619Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-bz8bfh/commands.json","count":0}
{"ts":"2026-10-27T00:51:03.113Z","level":"info","msg":"machine link closed","machine":"0a99df16950504452562345d3f0cdbc1","kind":"transient","reason":"接続が切れました"}
  ✓   3 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: unavailable, initially muted, bounded decode, mute/stop (6.1s)
{"ts":"2026-10-27T00:51:03.238Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:03.238Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:03.239Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:03.248Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-hlgrIz/commands.json","count":0}
{"ts":"2026-10-27T00:51:03.697Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:03.698Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:03.698Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:03.699Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-YSflCC/commands.json","count":0}
{"ts":"2026-10-27T00:51:05.736Z","level":"info","msg":"machine link closed","machine":"5dd1524c5ae7b954bffc7e2359ae967f","kind":"transient","reason":"接続が切れました"}
  ✓   4 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: unsupported, initially muted, bounded decode, mute/stop (2.6s)
{"ts":"2026-10-27T00:51:05.840Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:05.841Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:05.841Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:05.849Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-dRE7fH/commands.json","count":0}
{"ts":"2026-10-27T00:51:06.263Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:06.264Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:06.264Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:06.264Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-k9YTgv/commands.json","count":0}
{"ts":"2026-10-27T00:51:10.615Z","level":"info","msg":"machine link closed","machine":"1b6bbfd9eb111ca85eb8650d4ef445dc","kind":"transient","reason":"接続が切れました"}
  ✓   5 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: resume-race, initially muted, bounded decode, mute/stop (4.9s)
{"ts":"2026-10-27T00:51:10.703Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:10.704Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:10.704Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:10.713Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-7g1vYO/commands.json","count":0}
{"ts":"2026-10-27T00:51:11.165Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:11.166Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:11.166Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:11.166Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-LZKSyT/commands.json","count":0}
{"ts":"2026-10-27T00:51:15.754Z","level":"info","msg":"machine link closed","machine":"9133579847c97140a9d4ea56150a02f2","kind":"transient","reason":"接続が切れました"}
  ✓   6 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: resume-failure, initially muted, bounded decode, mute/stop (5.1s)
{"ts":"2026-10-27T00:51:15.885Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:15.885Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:15.886Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:15.896Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-NPAOLN/commands.json","count":0}
{"ts":"2026-10-27T00:51:16.338Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:16.338Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:16.338Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:16.339Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-vTJ4z4/commands.json","count":0}
{"ts":"2026-10-27T00:51:20.525Z","level":"info","msg":"machine link closed","machine":"4203bc5ad837540afdd7442297429ec3","kind":"transient","reason":"接続が切れました"}
  ✓   7 src/specs/remote-desktop-input.spec.ts:6:37 › focused desktop forwards keyboard and all five mouse buttons (legacy ACK) (4.8s)
{"ts":"2026-10-27T00:51:20.626Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:20.627Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:20.627Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:20.639Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-0oAsC1/commands.json","count":0}
{"ts":"2026-10-27T00:51:21.062Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:21.063Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:21.063Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:21.063Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-wj1pGI/commands.json","count":0}
{"ts":"2026-10-27T00:51:25.177Z","level":"info","msg":"machine link closed","machine":"b6cbdd33d6ccd17ae72e980d240b544f","kind":"transient","reason":"接続が切れました"}
  ✓   8 src/specs/remote-desktop-input.spec.ts:6:37 › focused desktop forwards keyboard and all five mouse buttons (dedicated ACK pipe) (4.6s)
{"ts":"2026-10-27T00:51:25.283Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:25.284Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:25.284Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:25.295Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-Hq9Vfc/commands.json","count":0}
{"ts":"2026-10-27T00:51:25.712Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:25.713Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:25.713Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:25.713Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-4UWDdd/commands.json","count":0}
{"ts":"2026-10-27T00:51:29.070Z","level":"info","msg":"machine link closed","machine":"81cf66a59f61d907945dfe0385d91652","kind":"transient","reason":"接続が切れました"}
  ✓   9 src/specs/remote-desktop-microphone.spec.ts:9:1 › explicit microphone sends generated PCM to B, stops tracks and never restarts on reopen (4.4s)
{"ts":"2026-10-27T00:51:29.660Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:29.661Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:29.661Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:29.673Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-pKrz5p/commands.json","count":0}
{"ts":"2026-10-27T00:51:30.116Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:30.117Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:30.117Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:30.118Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-7yQa1S/commands.json","count":0}
{"ts":"2026-10-27T00:51:35.231Z","level":"info","msg":"machine link closed","machine":"653c2582d93fa00f8318f549a6378024","kind":"transient","reason":"接続が切れました"}
  ✓  10 src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit (6.2s)
{"ts":"2026-10-27T00:51:35.825Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:35.826Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:35.826Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:35.838Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-Ve48TY/commands.json","count":0}
{"ts":"2026-10-27T00:51:36.261Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:36.261Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:36.261Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:36.262Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-lXNhyv/commands.json","count":0}
{"ts":"2026-10-27T00:51:40.803Z","level":"info","msg":"machine link closed","machine":"ed531648ca77172c69106fb35b7d1aaf","kind":"transient","reason":"接続が切れました"}
  ✓  11 src/specs/remote-desktop-settings.spec.ts:6:1 › connection presets and reduced colors reach the canvas, persist per machine, and reconnect read-only (5.1s)
{"ts":"2026-10-27T00:51:40.980Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:40.981Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:40.981Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:40.991Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-xYgiGo/commands.json","count":0}
{"ts":"2026-10-27T00:51:41.419Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:51:41.420Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:51:41.420Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:51:41.420Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-toH94k/commands.json","count":0}
{"ts":"2026-10-27T00:51:56.067Z","level":"info","msg":"machine link closed","machine":"c5dfca0d1e74dcb856b32931af511fe0","kind":"transient","reason":"接続が切れました"}
  ✓  12 src/specs/remote-desktop-shared-datagrams.spec.ts:10:1 › shared UDP viewers recover packet loss and one peer can fall back to WSS independently (15.2s)

  12 passed (1.2m)

```
