# 8D 検証

低層unit36件、実WSの旧viewer/旧B/helper/permissionと画像only先行を含む関連149件、生成音声browser WSS/UDP2件通過。最終source restartを追加後のbrowserと全体は後記。独立レビューは必須製品指摘なし、UI説明文と旧peerの回帰ケースを補強。負例6件は修正だけを除きruntime assertionが失敗、元bytesに復元。

## source-singleton

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedAudio.test.ts (4 tests | 1 failed | 3 skipped) 9ms
   × captures/encodes once and gives each viewer independent live-only delivery and teardown 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedAudio.test.ts > captures/encodes once and gives each viewer independent live-only delivery and teardown
AssertionError: expected [ { hooks: { …(7) }, …(1) }, …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/DesktopSharedAudio.test.ts:12:20


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  10:52:13
   Duration  815ms (transform 76%, import 22%, tests 1%)


```

## join-fence

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedAudio.test.ts (4 tests | 1 failed | 3 skipped) 10ms
   × captures/encodes once and gives each viewer independent live-only delivery and teardown 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedAudio.test.ts > captures/encodes once and gives each viewer independent live-only delivery and teardown
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Uint8Array [
        1,
      ],
      1,
    ]


Number of calls: 1

 ❯ src/desktop/DesktopSharedAudio.test.ts:12:192


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  10:52:14
   Duration  822ms (transform 76%, import 22%, tests 1%)


```

## lease-isolation

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedAudio.test.ts (4 tests | 1 failed | 3 skipped) 25ms
   × captures/encodes once and gives each viewer independent live-only delivery and teardown 23ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedAudio.test.ts > captures/encodes once and gives each viewer independent live-only delivery and teardown
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      false,
    ]


Number of calls: 1

 ❯ src/desktop/DesktopSharedAudio.test.ts:13:130


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  10:52:16
   Duration  812ms (transform 75%, import 21%, tests 3%)


```

## lease-generation

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedAudio.test.ts (4 tests | 1 failed | 3 skipped) 7ms
   × source failure retires old leases and an old stop cannot remove a new lease 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedAudio.test.ts > source failure retires old leases and an old stop cannot remove a new lease
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSharedAudio.test.ts:19:267


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  10:52:17
   Duration  797ms (transform 77%, import 22%, tests 1%)


```

## protocol

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (127 tests | 1 failed | 126 skipped) 191ms
   × negotiates shared audio after an image-only viewer, requiring viewer 190ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared audio after an image-only viewer, requiring viewer
AssertionError: expected true to be undefined // Object.is equality

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.ts:1121:65


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 126 skipped (127)
   Start at  10:52:19
   Duration  1.35s (transform 67%, import 17%, tests 15%)


```

## helper-normalization

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (127 tests | 1 failed | 126 skipped) 1158ms
   × negotiates shared audio after an image-only viewer, requiring none 1154ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared audio after an image-only viewer, requiring none
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1120:181


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1120:116

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 126 skipped (127)
   Start at  10:52:21
   Duration  2.27s (tests 53%, transform 36%, import 10%)


```

## Final verification

Build/typecheck and 778 suites/11628 tests passed with frozen sources. Browser: 11 passed, including generated shared audio WSS/UDP, fallback and restart, existing audio, microphone and shared-native paths.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-audio

{"ts":"2026-10-27T01:54:06.763Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:06.764Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:06.766Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:06.767Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:06.767Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:06.768Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:06.773Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:06.776Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-graph-it-state-iFKjMa/commands.json","count":0}
{"ts":"2026-10-27T01:54:06.776Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:06.776Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:06.776Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-stream-it-mR2qiT/state/commands.json","count":0}
{"ts":"2026-10-27T01:54:06.783Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-display-state-KpvjD9/commands.json","count":0}
{"ts":"2026-10-27T01:54:06.901Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:06.904Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:06.904Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:06.912Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-paneenv-state-XQ77FG/commands.json","count":0}
{"ts":"2026-10-27T01:54:07.457Z","level":"info","msg":"display script enabled","byClientId":"10761bd8-c427-420b-a055-f2ee76733396","byKind":"external"}
{"ts":"2026-10-27T01:54:07.497Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:54:07.523Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"main","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:54:07.523Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:54:07.527Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"main","kind":"panel","format":"text","bytes":1,"rev":2}
{"ts":"2026-10-27T01:54:07.527Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T01:54:07.529Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T01:54:07.530Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"main","reason":"closed"}
{"ts":"2026-10-27T01:54:07.530Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T01:54:07.532Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T01:54:07.533Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:7","code":"ok"}
{"ts":"2026-10-27T01:54:07.534Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:8","code":"ok"}
{"ts":"2026-10-27T01:54:07.545Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:9","code":"ok"}
{"ts":"2026-10-27T01:54:07.574Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:10","code":"ok"}
{"ts":"2026-10-27T01:54:07.631Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"quotes","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T01:54:07.631Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:11","code":"ok"}
{"ts":"2026-10-27T01:54:07.633Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"quotes","reason":"closed"}
{"ts":"2026-10-27T01:54:07.633Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:12","code":"ok"}
{"ts":"2026-10-27T01:54:07.647Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"viaws","kind":"band","format":"markdown","bytes":4,"rev":1}
{"ts":"2026-10-27T01:54:07.680Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"viaws","reason":"closed"}
{"ts":"2026-10-27T01:54:07.714Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:13","code":"ok"}
{"ts":"2026-10-27T01:54:08.212Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:14","code":"ok"}
{"ts":"2026-10-27T01:54:08.214Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:15","code":"ok"}
{"ts":"2026-10-27T01:54:08.240Z","level":"info","msg":"display set","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","name":"m","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T01:54:08.241Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:17","code":"ok"}
{"ts":"2026-10-27T01:54:08.243Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:16","code":"ok"}
{"ts":"2026-10-27T01:54:08.247Z","level":"info","msg":"display closed","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","name":"m","reason":"dismissed"}
{"ts":"2026-10-27T01:54:08.247Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:18","code":"ok"}
{"ts":"2026-10-27T01:54:08.251Z","level":"info","msg":"display set","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","name":"n","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T01:54:08.251Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:20","code":"ok"}
{"ts":"2026-10-27T01:54:08.254Z","level":"info","msg":"display reported","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","name":"n","problem":"navigated","format":"text"}
{"ts":"2026-10-27T01:54:08.254Z","level":"info","msg":"display closed","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","name":"n","reason":"navigated"}
{"ts":"2026-10-27T01:54:08.254Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:19","code":"ok"}
{"ts":"2026-10-27T01:54:08.257Z","level":"info","msg":"display set","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","name":"o","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T01:54:08.257Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:22","code":"ok"}
{"ts":"2026-10-27T01:54:08.258Z","level":"info","msg":"display closed","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","name":"o","reason":"closed"}
{"ts":"2026-10-27T01:54:08.259Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:21","code":"ok"}
{"ts":"2026-10-27T01:54:08.259Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:23","code":"ok"}
{"ts":"2026-10-27T01:54:08.298Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"60f9f43b-6a08-489f-9086-53db53e401d0","connId":"pane-socket:24","code":"not_found"}
{"ts":"2026-10-27T01:54:08.303Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:1f8efb82-f11c-42ee-bafc-82dac0053c2e"]}
{"ts":"2026-10-27T01:54:08.304Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:60f9f43b-6a08-489f-9086-53db53e401d0"]}
{"ts":"2026-10-27T01:54:08.880Z","level":"info","msg":"display set","paneId":"b0872828-6bd3-4c7c-a864-4bfa4aa9d410","name":"m","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T01:54:08.881Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b0872828-6bd3-4c7c-a864-4bfa4aa9d410","connId":"pane-socket:25","code":"ok"}
{"ts":"2026-10-27T01:54:08.903Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b0872828-6bd3-4c7c-a864-4bfa4aa9d410","connId":"pane-socket:26","code":"ok"}
{"ts":"2026-10-27T01:54:08.908Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b0872828-6bd3-4c7c-a864-4bfa4aa9d410","connId":"pane-socket:27","code":"ok"}
{"ts":"2026-10-27T01:54:08.923Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b0872828-6bd3-4c7c-a864-4bfa4aa9d410","connId":"pane-socket:28","code":"ok"}
{"ts":"2026-10-27T01:54:09.004Z","level":"info","msg":"display closed","paneId":"b0872828-6bd3-4c7c-a864-4bfa4aa9d410","name":"m","reason":"pane_closed"}
{"ts":"2026-10-27T01:54:09.006Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b0872828-6bd3-4c7c-a864-4bfa4aa9d410","connId":"pane-socket:29","code":"not_found"}
{"ts":"2026-10-27T01:54:09.014Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:b0872828-6bd3-4c7c-a864-4bfa4aa9d410"]}
{"ts":"2026-10-27T01:54:09.015Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:974dc54d-1175-4b2a-a692-d2e53133148a"]}
{"ts":"2026-10-27T01:54:09.354Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:09.355Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:09.355Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:09.362Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-paneenv-named-TWZ9VX/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:54:09.386Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:dbe74a60-b841-4374-a90b-923af79de581"]}
{"ts":"2026-10-27T01:54:09.560Z","level":"info","msg":"display set","paneId":"054d4b1d-4040-4499-bc76-866a793a652f","name":"w","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T01:54:09.784Z","level":"info","msg":"display closed","paneId":"054d4b1d-4040-4499-bc76-866a793a652f","name":"w","reason":"pane_closed"}
{"ts":"2026-10-27T01:54:09.795Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:054d4b1d-4040-4499-bc76-866a793a652f"]}
{"ts":"2026-10-27T01:54:09.906Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:9fcb6b39-1941-4c4b-8bb1-341ce4d21406"]}
{"ts":"2026-10-27T01:54:10.019Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:10.021Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:10.021Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:10.028Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-start-it-Pi7p5X/state/commands.json","count":0}
{"ts":"2026-10-27T01:54:10.188Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b052ff2a-29c7-47d2-bb69-b0cde456cb8b","connId":"pane-socket:30","code":"ok"}
{"ts":"2026-10-27T01:54:10.190Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b052ff2a-29c7-47d2-bb69-b0cde456cb8b","connId":"pane-socket:31","code":"ok"}
{"ts":"2026-10-27T01:54:10.528Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:10.530Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:10.531Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:10.537Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-state-zUQePR/commands.json","count":0}
{"ts":"2026-10-27T01:54:10.918Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:10.920Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:10.920Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:10.927Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-attach-it-QA9vk8/state/commands.json","count":0}
{"ts":"2026-10-27T01:54:11.192Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b052ff2a-29c7-47d2-bb69-b0cde456cb8b","connId":"pane-socket:32","code":"ok"}
{"ts":"2026-10-27T01:54:11.194Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b052ff2a-29c7-47d2-bb69-b0cde456cb8b","connId":"pane-socket:33","code":"ok"}
{"ts":"2026-10-27T01:54:11.195Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b052ff2a-29c7-47d2-bb69-b0cde456cb8b","connId":"pane-socket:34","code":"ok"}
{"ts":"2026-10-27T01:54:11.458Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b052ff2a-29c7-47d2-bb69-b0cde456cb8b","connId":"pane-socket:35","code":"not_found"}
{"ts":"2026-10-27T01:54:11.467Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:b052ff2a-29c7-47d2-bb69-b0cde456cb8b"]}
{"ts":"2026-10-27T01:54:11.472Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:36","code":"ok"}
{"ts":"2026-10-27T01:54:11.474Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:37","code":"ok"}
{"ts":"2026-10-27T01:54:11.475Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:38","code":"ok"}
{"ts":"2026-10-27T01:54:11.476Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"b0","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T01:54:11.476Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:39","code":"ok"}
{"ts":"2026-10-27T01:54:11.478Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"b1","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T01:54:11.478Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:40","code":"ok"}
{"ts":"2026-10-27T01:54:11.480Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:41","code":"display_limit"}
{"ts":"2026-10-27T01:54:11.481Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:42","code":"ok"}
{"ts":"2026-10-27T01:54:11.482Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"b0","reason":"closed"}
{"ts":"2026-10-27T01:54:11.482Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"b1","reason":"closed"}
{"ts":"2026-10-27T01:54:11.482Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:43","code":"ok"}
{"ts":"2026-10-27T01:54:11.525Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:44","code":"ok"}
{"ts":"2026-10-27T01:54:11.525Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"sg","kind":"panel","format":"script-html","bytes":47,"rev":1}
{"ts":"2026-10-27T01:54:11.526Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:45","code":"ok"}
{"ts":"2026-10-27T01:54:11.528Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:46","code":"ok"}
{"ts":"2026-10-27T01:54:11.529Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:47","code":"ok"}
{"ts":"2026-10-27T01:54:11.553Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:49","code":"ok"}
{"ts":"2026-10-27T01:54:11.555Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:50","code":"ok"}
{"ts":"2026-10-27T01:54:11.586Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"sg2","kind":"band","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T01:54:11.590Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"st","kind":"panel","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T01:54:11.591Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:51","code":"ok"}
{"ts":"2026-10-27T01:54:11.594Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:52","code":"ok"}
{"ts":"2026-10-27T01:54:11.597Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:53","code":"invalid_params"}
{"ts":"2026-10-27T01:54:11.599Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:48","code":"ok"}
{"ts":"2026-10-27T01:54:11.603Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"sg","reason":"closed"}
{"ts":"2026-10-27T01:54:11.603Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"sg2","reason":"closed"}
{"ts":"2026-10-27T01:54:11.603Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"st","reason":"closed"}
{"ts":"2026-10-27T01:54:11.603Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:54","code":"ok"}
{"ts":"2026-10-27T01:54:11.603Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:55","code":"ok"}
{"ts":"2026-10-27T01:54:11.609Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:57","code":"ok"}
{"ts":"2026-10-27T01:54:11.612Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"lay","kind":"panel","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T01:54:11.612Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:58","code":"ok"}
{"ts":"2026-10-27T01:54:11.628Z","level":"info","msg":"display set","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"lay2","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T01:54:11.632Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:59","code":"ok"}
{"ts":"2026-10-27T01:54:11.634Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:60","code":"ok"}
{"ts":"2026-10-27T01:54:11.635Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"lay","reason":"closed"}
{"ts":"2026-10-27T01:54:11.635Z","level":"info","msg":"display closed","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","name":"lay2","reason":"closed"}
{"ts":"2026-10-27T01:54:11.635Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7dfe4ed5-7b56-4f9b-84d9-e6d4fe9b928e","connId":"pane-socket:61","code":"ok"}
{"ts":"2026-10-27T01:54:12.115Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:12.116Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:12.116Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:12.122Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-follow-state-9OevcZ/commands.json","count":0}
{"ts":"2026-10-27T01:54:12.165Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","connId":"pane-socket:62","code":"ok"}
{"ts":"2026-10-27T01:54:12.166Z","level":"info","msg":"display set","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","name":"cg","kind":"panel","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T01:54:12.166Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","connId":"pane-socket:63","code":"ok"}
{"ts":"2026-10-27T01:54:12.169Z","level":"info","msg":"display reported","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:54:12.171Z","level":"info","msg":"display reported","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:54:12.218Z","level":"info","msg":"display reported","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:54:12.220Z","level":"info","msg":"display closed","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","name":"cg","reason":"focus_steal"}
{"ts":"2026-10-27T01:54:12.221Z","level":"info","msg":"display script cooldown","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","reason":"focus_steal","closed":1,"ms":300000}
{"ts":"2026-10-27T01:54:12.256Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","connId":"pane-socket:64","code":"ok"}
{"ts":"2026-10-27T01:54:12.257Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","connId":"pane-socket:65","code":"display_busy"}
{"ts":"2026-10-27T01:54:12.259Z","level":"info","msg":"display set","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","name":"cg","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:54:12.260Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"2ce813cd-8cf6-4561-aa48-56ec04b359c0","connId":"pane-socket:66","code":"ok"}
{"ts":"2026-10-27T01:54:12.769Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"ddaf3741-6a8f-44c9-a9f9-15ac0646c4be","connId":"pane-socket:67","code":"ok"}
{"ts":"2026-10-27T01:54:12.773Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"ddaf3741-6a8f-44c9-a9f9-15ac0646c4be","connId":"pane-socket:68","code":"ok"}
{"ts":"2026-10-27T01:54:12.774Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"ddaf3741-6a8f-44c9-a9f9-15ac0646c4be","connId":"pane-socket:69","code":"ok"}
{"ts":"2026-10-27T01:54:12.777Z","level":"info","msg":"display set","paneId":"ddaf3741-6a8f-44c9-a9f9-15ac0646c4be","name":"dg","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:54:12.777Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ddaf3741-6a8f-44c9-a9f9-15ac0646c4be","connId":"pane-socket:70","code":"ok"}
{"ts":"2026-10-27T01:54:12.818Z","level":"info","msg":"display script enabled","byClientId":"fe31409d-f859-4eba-8a46-bd95603e336d","byKind":"external"}
{"ts":"2026-10-27T01:54:12.823Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"ddaf3741-6a8f-44c9-a9f9-15ac0646c4be","connId":"pane-socket:71","code":"ok"}
{"ts":"2026-10-27T01:54:12.824Z","level":"info","msg":"display set","paneId":"ddaf3741-6a8f-44c9-a9f9-15ac0646c4be","name":"dg","kind":"panel","format":"script-html","bytes":8,"rev":2}
{"ts":"2026-10-27T01:54:12.824Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ddaf3741-6a8f-44c9-a9f9-15ac0646c4be","connId":"pane-socket:72","code":"ok"}
{"ts":"2026-10-27T01:54:13.484Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:13.485Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:13.485Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:13.492Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-watch-state-CpmnWv/commands.json","count":0}
{"ts":"2026-10-27T01:54:13.744Z","level":"warn","msg":"origin rejected","path":"/ws","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:45589","allowed":["localhost:45589","127.0.0.1:45589","[::1]:45589"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"event":"workspace.updated","data":{"workspace":{"id":"cce1a8a0-84d9-4224-853e-64dc17c1fc6c","label":"watch-target-0","cwd":"/workspaces/sodashitsu-desktop-shared-audio","tabIds":["c8dfdca3-c2ba-46d3-b098-8747498e1572"],"activeTabId":"c8dfdca3-c2ba-46d3-b098-8747498e1572","groupId":null,"git":{"branch":"feat/desktop-shared-audio","ahead":0,"behind":0,"repoKey":"/workspaces/sodashitsu/.git","isLinkedWorktree":true,"worktreeKey":"/workspaces/sodashitsu/.git/worktrees/sodashitsu-desktop-shared-audio"},"autoLabel":false,"representative":false}}}
{"event":"pane.updated","data":{"pane":{"id":"6e0e71be-c9b2-4719-a6f5-1e753e833001","tabId":"c8dfdca3-c2ba-46d3-b098-8747498e1572","label":null,"cwd":"/workspaces/sodashitsu-desktop-shared-audio","shell":"","cols":120,"rows":40,"status":"running","failure":null,"busy":false,"title":"asaomaro@my-notePC: /workspaces/sodashitsu-desktop-shared-audio","rightClick":"herdr","agent":null,"agentSession":null}}}
{"ts":"2026-10-27T01:54:14.753Z","level":"warn","msg":"origin rejected","path":"/ws","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:44369","allowed":["localhost:44369","127.0.0.1:44369","[::1]:44369"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-27T01:54:14.938Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:14.939Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:14.939Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:14.946Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-agent-it-hrTuXg/a/commands.json","count":0}
{"ts":"2026-10-27T01:54:15.637Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:15.639Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:15.639Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:15.659Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-agent-it-hrTuXg/b/commands.json","count":0}
{"ts":"2026-10-27T01:54:16.305Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:16.308Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:16.308Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:16.346Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-panecurrent-state-T9ht0u/commands.json","count":0}
{"ts":"2026-10-27T01:54:16.735Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:16.737Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:16.737Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:16.743Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-agent-it-state-Wc1CA3/commands.json","count":0}
{"ts":"2026-10-27T01:54:18.804Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:18.807Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:18.808Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:18.816Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-RLxBBQ/commands.json","count":0}
{"ts":"2026-10-27T01:54:18.862Z","level":"info","msg":"machine link closed","machine":"6c64d3589316bbf7942e0805f08432fd","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:54:20.041Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:20.042Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:20.043Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:20.049Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-Qnn5Dt/commands.json","count":0}
{"ts":"2026-10-27T01:54:20.468Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:20.468Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:20.468Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:20.478Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-evqA95/commands.json","count":0}
{"ts":"2026-10-27T01:54:21.005Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:21.006Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:21.006Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:21.015Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-66TxhC/commands.json","count":0}
{"ts":"2026-10-27T01:54:21.472Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:21.473Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:21.474Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:21.490Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-JRj56a/commands.json","count":0}
{"ts":"2026-10-27T01:54:21.665Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:21.668Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:21.669Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:21.678Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-prompt-it-U3sda0/state/commands.json","count":0}
{"ts":"2026-10-27T01:54:21.934Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:21.935Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:21.935Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:21.944Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-jpK0NL/commands.json","count":0}
{"ts":"2026-10-27T01:54:22.046Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"6c64d3589316bbf7942e0805f08432fd","requestId":"12fb0aa6-dd25-48dc-a745-5b5eec124492","paneId":"fc9e78a0-e8fe-4975-9979-d221106c5c95","cause":"channel_unavailable"}
{"ts":"2026-10-27T01:54:22.046Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"6c64d3589316bbf7942e0805f08432fd","requestId":"12fb0aa6-dd25-48dc-a745-5b5eec124492","paneId":"fc9e78a0-e8fe-4975-9979-d221106c5c95","cause":"connect_failed"}
{"ts":"2026-10-27T01:54:22.375Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:22.376Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:22.376Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:22.385Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-zlZSfp/commands.json","count":0}
{"ts":"2026-10-27T01:54:23.268Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:23.268Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:23.268Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:23.276Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-J4AapV/commands.json","count":0}
{"ts":"2026-10-27T01:54:23.789Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:23.790Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:23.790Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:23.799Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-BiCyRB/commands.json","count":0}
{"ts":"2026-10-27T01:54:24.372Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"6c64d3589316bbf7942e0805f08432fd","requestId":"12fb0aa6-dd25-48dc-a745-5b5eec124492","paneId":"fc9e78a0-e8fe-4975-9979-d221106c5c95","cause":"connect_failed"}
{"ts":"2026-10-27T01:54:26.276Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnected","machineId":"6c64d3589316bbf7942e0805f08432fd","requestId":"12fb0aa6-dd25-48dc-a745-5b5eec124492","paneId":"fc9e78a0-e8fe-4975-9979-d221106c5c95","elapsedMs":4230}
{"ts":"2026-10-27T01:54:26.341Z","level":"info","msg":"machine link closed","machine":"6c64d3589316bbf7942e0805f08432fd","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:54:27.045Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"6c64d3589316bbf7942e0805f08432fd","requestId":"12fb0aa6-dd25-48dc-a745-5b5eec124492","paneId":"fc9e78a0-e8fe-4975-9979-d221106c5c95","cause":"channel_unavailable"}
{"ts":"2026-10-27T01:54:27.045Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"6c64d3589316bbf7942e0805f08432fd","requestId":"12fb0aa6-dd25-48dc-a745-5b5eec124492","paneId":"fc9e78a0-e8fe-4975-9979-d221106c5c95","cause":"connect_failed"}
{"ts":"2026-10-27T01:54:27.557Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnected","machineId":"6c64d3589316bbf7942e0805f08432fd","requestId":"12fb0aa6-dd25-48dc-a745-5b5eec124492","paneId":"fc9e78a0-e8fe-4975-9979-d221106c5c95","elapsedMs":512}
{"ts":"2026-10-27T01:54:28.047Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:28.049Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:28.049Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:28.056Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-it-6hjNeF/a/commands.json","count":0}
{"ts":"2026-10-27T01:54:28.530Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:28.531Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:28.531Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:28.537Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-it-6hjNeF/b/commands.json","count":0}
{"ts":"2026-10-27T01:54:35.665Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:35.667Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:35.667Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:35.673Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-exec-it-px9VB7/a/commands.json","count":0}
{"ts":"2026-10-27T01:54:36.453Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:36.455Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:36.455Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:36.470Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-exec-it-px9VB7/b/commands.json","count":0}
{"ts":"2026-10-27T01:54:36.652Z","level":"info","msg":"work agent proxy lifecycle","event":"closed","machineId":"6c64d3589316bbf7942e0805f08432fd","requestId":"12fb0aa6-dd25-48dc-a745-5b5eec124492","paneId":"fc9e78a0-e8fe-4975-9979-d221106c5c95","reason":"target_validation_failed"}
{"ts":"2026-10-27T01:54:36.662Z","level":"info","msg":"machine link closed","machine":"6c64d3589316bbf7942e0805f08432fd","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:54:37.396Z","level":"info","msg":"machine link closed","machine":"08f29834817f8b2e41bcf664966ccbd1","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:54:55.556Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:55.558Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:55.558Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:55.563Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-QbfBHr/commands.json","count":0}
{"ts":"2026-10-27T01:54:56.364Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:56.365Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:56.365Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:56.368Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-37xoij/commands.json","count":0}
{"ts":"2026-10-27T01:54:56.672Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:56.673Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:56.673Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:56.680Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Cbu5Vl/commands.json","count":0}
{"ts":"2026-10-27T01:54:57.092Z","level":"info","msg":"extension started","extension":"user:env","run":"3ec414a5-ba4e-47b0-af0c-8f83949a8fe5","state":"running"}
{"ts":"2026-10-27T01:54:57.107Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:57.108Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:57.109Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:57.113Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-37xoij/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:54:57.440Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:57.441Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:57.441Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:57.446Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-gH4Jdn/commands.json","count":0}
{"ts":"2026-10-27T01:54:57.840Z","level":"info","msg":"extension started","extension":"user:a","run":"7ffe18da-046a-4bc5-87ca-1c072c6a921a","state":"running"}
{"ts":"2026-10-27T01:54:57.845Z","level":"info","msg":"extension started","extension":"user:b","run":"fd79a1ab-b82c-4a48-945e-926bb74d9dfb","state":"running"}
{"ts":"2026-10-27T01:54:58.136Z","level":"info","msg":"extension started","extension":"user:c","run":"09fe9d80-a2c0-4596-8541-d97c132f00de","state":"running"}
{"ts":"2026-10-27T01:54:58.276Z","level":"info","msg":"extension started","extension":"user:a","run":"2b263675-54e1-4386-9819-d736a14100b2","state":"running"}
{"ts":"2026-10-27T01:54:58.381Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:58.381Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:58.382Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:58.387Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-37xoij/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:54:58.412Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:58.413Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:58.413Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:58.417Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-37xoij/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T01:54:58.487Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:58.488Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:58.488Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:58.495Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-MR2DAh/commands.json","count":0}
{"ts":"2026-10-27T01:54:58.888Z","level":"info","msg":"extension started","extension":"user:basic","run":"cd528cbe-02fc-4c91-94cc-c44e74517494","state":"running"}
{"ts":"2026-10-27T01:54:58.888Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:58.889Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:58.889Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:58.895Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-zRNJMu/commands.json","count":0}
{"ts":"2026-10-27T01:54:58.920Z","level":"info","msg":"display set","paneId":"935901aa-c51d-4149-83ed-bfdb285cd8ca","name":"m","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:54:58.929Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"935901aa-c51d-4149-83ed-bfdb285cd8ca","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:54:59.015Z","level":"info","msg":"display set","paneId":"935901aa-c51d-4149-83ed-bfdb285cd8ca","name":"w","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:54:59.312Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.313Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.313Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:59.319Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-Fc9c8T/commands.json","count":0}
{"ts":"2026-10-27T01:54:59.346Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.346Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.346Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:59.352Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-ni3M6D/commands.json","count":0}
{"ts":"2026-10-27T01:54:59.381Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.381Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.381Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:59.388Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-ni3M6D/commands.json","count":0}
{"ts":"2026-10-27T01:54:59.567Z","level":"info","msg":"display closed","paneId":"935901aa-c51d-4149-83ed-bfdb285cd8ca","name":"m","reason":"closed"}
{"ts":"2026-10-27T01:54:59.672Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.672Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.673Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:59.697Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-OYKWVe/commands.json","count":0}
{"ts":"2026-10-27T01:54:59.785Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.786Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:54:59.786Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:54:59.791Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-58MKnH/commands.json","count":0}
{"ts":"2026-10-27T01:55:00.092Z","level":"info","msg":"extension started","extension":"user:own","run":"211a3bea-8d13-409c-8813-9101dd332a4e","state":"running"}
{"ts":"2026-10-27T01:55:00.114Z","level":"info","msg":"display set","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","name":"mine","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:55:00.123Z","level":"info","msg":"display set","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","name":"theirs","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:55:00.124Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:00.510Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:00.511Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:00.511Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:00.517Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-58MKnH/commands.json","count":0}
{"ts":"2026-10-27T01:55:00.737Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:00.740Z","level":"info","msg":"display closed","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","name":"mine","reason":"closed"}
{"ts":"2026-10-27T01:55:00.740Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T01:55:00.742Z","level":"info","msg":"display set","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","name":"mine","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:55:00.742Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T01:55:00.746Z","level":"info","msg":"extension exited","extension":"user:own","run":"211a3bea-8d13-409c-8813-9101dd332a4e","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:00.790Z","level":"info","msg":"extension started","extension":"user:own","run":"7383e180-e68a-4685-88de-d1ad4a0d162a","state":"running"}
{"ts":"2026-10-27T01:55:00.837Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"e9b08181-6094-4657-b6ff-ab54835d98dd","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T01:55:00.942Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:00.944Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:00.944Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:00.953Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-XnA9EF/commands.json","count":0}
{"ts":"2026-10-27T01:55:01.385Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:01.386Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:01.386Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:01.394Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-SH8AXT/commands.json","count":0}
{"ts":"2026-10-27T01:55:01.406Z","level":"info","msg":"extension started","extension":"user:crash","run":"326f0a0b-14df-4b77-a96e-140e6a1edd17","state":"running"}
{"ts":"2026-10-27T01:55:01.437Z","level":"info","msg":"extension exited","extension":"user:crash","run":"326f0a0b-14df-4b77-a96e-140e6a1edd17","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:01.524Z","level":"info","msg":"extension started","extension":"user:crash","run":"638d45d9-71f0-4a2c-af61-5ba461d6d05c","state":"running"}
{"ts":"2026-10-27T01:55:01.556Z","level":"info","msg":"extension exited","extension":"user:crash","run":"638d45d9-71f0-4a2c-af61-5ba461d6d05c","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:01.603Z","level":"info","msg":"extension started","extension":"user:crash","run":"66cea2c2-a8d1-48c8-9d42-193dba80cbdb","state":"running"}
{"ts":"2026-10-27T01:55:01.631Z","level":"info","msg":"extension exited","extension":"user:crash","run":"66cea2c2-a8d1-48c8-9d42-193dba80cbdb","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:01.720Z","level":"info","msg":"extension started","extension":"user:crash","run":"4c9ed166-e434-4a71-bdac-4b5d05fa058c","state":"running"}
{"ts":"2026-10-27T01:55:01.747Z","level":"info","msg":"extension exited","extension":"user:crash","run":"4c9ed166-e434-4a71-bdac-4b5d05fa058c","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:01.836Z","level":"info","msg":"extension started","extension":"user:crash","run":"ce37c33e-3c2f-4fe4-a157-7497e7f2957b","state":"running"}
{"ts":"2026-10-27T01:55:01.870Z","level":"info","msg":"extension exited","extension":"user:crash","run":"ce37c33e-3c2f-4fe4-a157-7497e7f2957b","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:01.870Z","level":"warn","msg":"extension failed","extension":"user:crash","state":"failed","failures":5}
{"ts":"2026-10-27T01:55:01.976Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:01.977Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:01.977Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:01.987Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-dNcHs0/commands.json","count":0}
{"ts":"2026-10-27T01:55:02.252Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:02.253Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:02.253Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:02.268Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-SH8AXT/commands.json","count":0}
{"ts":"2026-10-27T01:55:02.387Z","level":"info","msg":"extension started","extension":"user:a","run":"1403717d-91e5-4f94-ab59-311737e86629","state":"running"}
{"ts":"2026-10-27T01:55:02.398Z","level":"info","msg":"extension started","extension":"user:b","run":"601cb8b0-051a-4df3-b80a-12ffcdaf5cca","state":"running"}
{"ts":"2026-10-27T01:55:02.730Z","level":"info","msg":"extension exited","extension":"user:b","run":"601cb8b0-051a-4df3-b80a-12ffcdaf5cca","code":0,"signal":null,"reason":"exited"}
{"ts":"2026-10-27T01:55:03.153Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:03.154Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:03.154Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:03.160Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-SH8AXT/commands.json","count":0}
{"ts":"2026-10-27T01:55:03.479Z","level":"info","msg":"agent resume skipped","paneId":"96054c01-8558-4848-bce4-b16443d46445","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:03.781Z","level":"info","msg":"agent resume skipped","paneId":"f4d02e4b-4bc0-4bfb-b580-35808b0f7ce0","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:03.898Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:03.899Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:03.899Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:03.904Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-z3lBQA/commands.json","count":0}
{"ts":"2026-10-27T01:55:04.459Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:04.459Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:04.459Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:04.465Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-09Drwr/commands.json","count":0}
{"ts":"2026-10-27T01:55:04.489Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:04.489Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:04.489Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:04.495Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-QqxRo7/commands.json","count":0}
{"ts":"2026-10-27T01:55:04.555Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:04.555Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:04.555Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:04.561Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-7Ido0k/commands.json","count":0}
{"ts":"2026-10-27T01:55:04.840Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:04.841Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:04.841Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:04.851Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Bp2Hzz/commands.json","count":0}
{"ts":"2026-10-27T01:55:05.028Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:05.031Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:05.031Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:05.042Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-V0jero/commands.json","count":0}
{"ts":"2026-10-27T01:55:05.241Z","level":"info","msg":"extension started","extension":"user:noisy","run":"d4dfeb9a-d866-4861-a5aa-e6e3eca1c5da","state":"running"}
{"ts":"2026-10-27T01:55:05.485Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:05.485Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:05.485Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:05.493Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-D177oL/commands.json","count":0}
{"ts":"2026-10-27T01:55:05.504Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:05.505Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:05.505Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:05.513Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-RBP58G/commands.json","count":0}
{"ts":"2026-10-27T01:55:05.933Z","level":"info","msg":"extension started","extension":"user:once","run":"7eebc225-6ed4-41cb-9a7c-c43c0d0d24ce","state":"running"}
{"ts":"2026-10-27T01:55:06.138Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:06.140Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:06.140Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:06.163Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-SQYkWa/commands.json","count":0}
{"ts":"2026-10-27T01:55:06.176Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:06.177Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:06.177Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:06.186Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-RBP58G/commands.json","count":0}
{"ts":"2026-10-27T01:55:06.588Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:06.589Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:06.589Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:06.602Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-kGcskx/commands.json","count":0}
{"ts":"2026-10-27T01:55:06.928Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:06.929Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:06.929Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:06.953Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-znsPfe/commands.json","count":0}
{"ts":"2026-10-27T01:55:07.058Z","level":"info","msg":"extension started","extension":"user:four","run":"a5f3cc5b-156e-4b9b-88cf-19baced31018","state":"running"}
{"ts":"2026-10-27T01:55:07.103Z","level":"info","msg":"display set","paneId":"5e124d22-677f-4815-bf53-d747307e5997","name":"e1","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T01:55:07.104Z","level":"info","msg":"display set","paneId":"5e124d22-677f-4815-bf53-d747307e5997","name":"e2","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T01:55:07.108Z","level":"info","msg":"display set","paneId":"5e124d22-677f-4815-bf53-d747307e5997","name":"p1","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:55:07.108Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"5e124d22-677f-4815-bf53-d747307e5997","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:07.110Z","level":"info","msg":"display set","paneId":"5e124d22-677f-4815-bf53-d747307e5997","name":"p2","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:55:07.111Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"5e124d22-677f-4815-bf53-d747307e5997","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:07.945Z","level":"info","msg":"display closed","paneId":"5e124d22-677f-4815-bf53-d747307e5997","name":"e1","reason":"closed"}
{"ts":"2026-10-27T01:55:07.946Z","level":"info","msg":"display closed","paneId":"5e124d22-677f-4815-bf53-d747307e5997","name":"e2","reason":"closed"}
{"ts":"2026-10-27T01:55:08.034Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:08.035Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:08.035Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:08.038Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:08.039Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:08.039Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:08.043Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-KOJsSM/commands.json","count":0}
{"ts":"2026-10-27T01:55:08.047Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-OIrVge/commands.json","count":0}
{"ts":"2026-10-27T01:55:08.448Z","level":"info","msg":"extension started","extension":"user:bad","run":"3cc9b592-df3b-40be-a273-ef6ae966aa5b","state":"running"}
{"ts":"2026-10-27T01:55:08.456Z","level":"info","msg":"extension started","extension":"user:big","run":"9dee1c5b-a46b-4fc7-bf9e-9ba4eec31bbd","state":"running"}
{"ts":"2026-10-27T01:55:08.479Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"3cc9b592-df3b-40be-a273-ef6ae966aa5b","reason":"bad_lines"}
{"ts":"2026-10-27T01:55:08.480Z","level":"info","msg":"extension exited","extension":"user:bad","run":"3cc9b592-df3b-40be-a273-ef6ae966aa5b","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T01:55:08.514Z","level":"info","msg":"extension started","extension":"user:bad","run":"850a4c2d-f1de-481d-b3a4-48005ca1727d","state":"running"}
{"ts":"2026-10-27T01:55:08.571Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"850a4c2d-f1de-481d-b3a4-48005ca1727d","reason":"bad_lines"}
{"ts":"2026-10-27T01:55:08.588Z","level":"info","msg":"extension exited","extension":"user:bad","run":"850a4c2d-f1de-481d-b3a4-48005ca1727d","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T01:55:08.638Z","level":"info","msg":"extension started","extension":"user:bad","run":"b4836f7e-bf34-4081-bdaa-87040ef39977","state":"running"}
{"ts":"2026-10-27T01:55:08.663Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"b4836f7e-bf34-4081-bdaa-87040ef39977","reason":"bad_lines"}
{"ts":"2026-10-27T01:55:08.664Z","level":"info","msg":"extension exited","extension":"user:bad","run":"b4836f7e-bf34-4081-bdaa-87040ef39977","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T01:55:08.765Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:08.766Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:08.766Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:08.773Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-KOJsSM/commands.json","count":0}
{"ts":"2026-10-27T01:55:08.796Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:08.796Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:08.797Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:08.812Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-fTjyRy/commands.json","count":0}
{"ts":"2026-10-27T01:55:09.092Z","level":"info","msg":"agent resume skipped","paneId":"456b358b-84f3-4c22-8323-c182bddf1771","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:09.221Z","level":"info","msg":"extension started","extension":"user:plain","run":"b75b8b63-a4e1-48d3-bb09-7051b8b7ae15","state":"running"}
{"ts":"2026-10-27T01:55:09.230Z","level":"info","msg":"extension started","extension":"user:allowed","run":"af9dac55-fff4-442e-8a0c-14afa8494cb0","state":"running"}
{"ts":"2026-10-27T01:55:09.343Z","level":"info","msg":"display script enabled","byClientId":"20aea56e-b3ca-4535-81e4-db247ef5da63","byKind":"external"}
{"ts":"2026-10-27T01:55:09.403Z","level":"info","msg":"agent resume skipped","paneId":"75a6fc4f-212c-44df-b525-b545dbd1b286","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:09.455Z","level":"info","msg":"display script enabled","byClientId":"20aea56e-b3ca-4535-81e4-db247ef5da63","byKind":"external"}
{"ts":"2026-10-27T01:55:09.461Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:09.462Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:09.463Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:09.477Z","level":"info","msg":"display set","paneId":"42751e5d-2747-4397-b891-bc69ad3f5c40","name":"g","kind":"panel","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T01:55:09.487Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-e2e-mvGWM8/commands.json","count":0}
{"ts":"2026-10-27T01:55:09.559Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"42751e5d-2747-4397-b891-bc69ad3f5c40","connId":"pane-socket:1","code":"display_closed"}
{"ts":"2026-10-27T01:55:09.613Z","level":"info","msg":"display closed","paneId":"42751e5d-2747-4397-b891-bc69ad3f5c40","name":"g","reason":"script_disabled"}
{"ts":"2026-10-27T01:55:09.693Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:09.693Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:09.693Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:09.701Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-pPZSgi/commands.json","count":0}
{"ts":"2026-10-27T01:55:09.933Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:09.933Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:09.934Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:09.939Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-wtdir-44ZkRk/commands.json","count":0}
{"ts":"2026-10-27T01:55:10.144Z","level":"info","msg":"extension started","extension":"user:hello","run":"c409530f-122d-4c97-9c09-f81d8cfa622e","state":"running"}
{"ts":"2026-10-27T01:55:10.190Z","level":"info","msg":"display set","paneId":"1df4f596-39e2-493d-b1a5-11561ef5db9d","name":"hello","kind":"band","format":"text","bytes":33,"rev":1}
{"ts":"2026-10-27T01:55:10.333Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"1df4f596-39e2-493d-b1a5-11561ef5db9d","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:10.370Z","level":"info","msg":"display closed","paneId":"1df4f596-39e2-493d-b1a5-11561ef5db9d","name":"hello","reason":"closed"}
{"ts":"2026-10-27T01:55:10.442Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"1df4f596-39e2-493d-b1a5-11561ef5db9d","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:10.472Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:10.473Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:10.473Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:10.479Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-eaaGMo/commands.json","count":0}
{"ts":"2026-10-27T01:55:10.841Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:10.842Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:10.842Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:10.850Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-gitnow-zXH8Hs/commands.json","count":0}
{"ts":"2026-10-27T01:55:10.875Z","level":"info","msg":"extension started","extension":"user:t10","run":"6323a38f-6ec7-4ed0-9d71-1a9e7e905b86","state":"running"}
{"ts":"2026-10-27T01:55:11.162Z","level":"info","msg":"extension started","extension":"user:t10","run":"ba322396-68bc-4800-8087-d55fde58faa2","state":"running"}
{"ts":"2026-10-27T01:55:11.291Z","level":"info","msg":"pane socket: request","op":"extension.list","paneId":"b92daa67-f7a5-465c-be22-cf50f1895af9","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T01:55:11.291Z","level":"info","msg":"pane socket: request","op":"extension.setEnabled","paneId":"b92daa67-f7a5-465c-be22-cf50f1895af9","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T01:55:11.292Z","level":"info","msg":"pane socket: request","op":"extension.reload","paneId":"b92daa67-f7a5-465c-be22-cf50f1895af9","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T01:55:11.328Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:11.329Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:11.329Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:11.336Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-ouMCiu/commands.json","count":0}
{"ts":"2026-10-27T01:55:11.612Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:11.612Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:11.612Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:11.619Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-shutdown-sh2ysi/commands.json","count":0}
{"ts":"2026-10-27T01:55:12.197Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:12.198Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:12.198Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:12.205Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-agent-BOosdY/commands.json","count":0}
{"ts":"2026-10-27T01:55:13.687Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:13.688Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:13.688Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:13.694Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-3WEyYl/commands.json","count":0}
{"ts":"2026-10-27T01:55:13.761Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:13.762Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:13.762Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:13.769Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-jWPBv3/commands.json","count":0}
{"ts":"2026-10-27T01:55:14.151Z","level":"info","msg":"extension started","extension":"user:slow","run":"3c6d4b47-458b-4687-9b2a-dda787f6ea5d","state":"running"}
{"ts":"2026-10-27T01:55:14.314Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:14.315Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:14.315Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:14.322Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-vIRG9a/commands.json","count":0}
{"ts":"2026-10-27T01:55:14.620Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:14.621Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:14.621Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:14.628Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-3WEyYl/commands.json","count":0}
{"ts":"2026-10-27T01:55:14.968Z","level":"info","msg":"agent resume skipped","paneId":"48ad5f8f-dd30-4c2f-b76a-9cdd2b5acdae","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:15.273Z","level":"info","msg":"agent resume skipped","paneId":"5b082e24-3fb0-4f0f-92b2-47a9726eba93","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:15.406Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:15.407Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:15.407Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:15.416Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-IBz4ou/commands.json","count":0}
{"ts":"2026-10-27T01:55:16.182Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:16.183Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:16.183Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:16.208Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-vIRG9a/commands.json","count":0}
{"ts":"2026-10-27T01:55:16.388Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:16.388Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:16.388Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:16.396Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-ksWeSa/commands.json","count":0}
{"ts":"2026-10-27T01:55:16.532Z","level":"info","msg":"agent resume skipped","paneId":"14794bc9-43d6-47ad-a0e7-c98d257cf43a","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:16.815Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:16.815Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:16.815Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:16.823Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-ksWeSa/commands.json","count":0}
{"ts":"2026-10-27T01:55:16.835Z","level":"info","msg":"removed session-history.json","reason":"pane history disabled"}
{"ts":"2026-10-27T01:55:16.836Z","level":"info","msg":"agent resume skipped","paneId":"816ef53b-8993-4756-a483-da18d543fb76","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:17.141Z","level":"info","msg":"agent resume skipped","paneId":"e6a694e0-d5c7-44c1-8c2b-24d876ec2d2f","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:17.197Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:17.198Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:17.198Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:17.223Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-245mgr/commands.json","count":0}
{"ts":"2026-10-27T01:55:17.261Z","level":"info","msg":"removed session-history.json","reason":"session.json was not restored"}
{"ts":"2026-10-27T01:55:17.637Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:17.638Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:17.638Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:17.645Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-9vAzD5/commands.json","count":0}
{"ts":"2026-10-27T01:55:17.680Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-history-it-9vAzD5/session-backups/2026-10-27T01-55-17-680Z.json"}
{"ts":"2026-10-27T01:55:17.681Z","level":"info","msg":"removed session-history.json","reason":"session.json was not restored"}
{"ts":"2026-10-27T01:55:18.005Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:18.005Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:18.005Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:18.014Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-mPvYCZ/commands.json","count":0}
{"ts":"2026-10-27T01:55:18.045Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:18.045Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:18.045Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:18.052Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-GRg4QL/commands.json","count":0}
{"ts":"2026-10-27T01:55:18.492Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:18.493Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:18.493Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:18.501Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-GRg4QL/commands.json","count":0}
{"ts":"2026-10-27T01:55:18.513Z","level":"warn","msg":"session-history.json was corrupt; restoring without pane history","reason":"invalid JSON"}
{"ts":"2026-10-27T01:55:18.819Z","level":"info","msg":"agent resume skipped","paneId":"f1a38cd7-977a-4949-a9c0-03c162077cd6","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:18.914Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:18.914Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:18.915Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:18.923Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-JS0NQr/commands.json","count":0}
{"ts":"2026-10-27T01:55:19.368Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:19.369Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:19.369Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:19.377Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-JS0NQr/commands.json","count":0}
{"ts":"2026-10-27T01:55:19.390Z","level":"warn","msg":"session-history.json was corrupt; restoring without pane history","reason":"panes: invalid_type"}
{"ts":"2026-10-27T01:55:19.562Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:19.563Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:19.564Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:19.570Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-YfUboB/commands.json","count":0}
{"ts":"2026-10-27T01:55:19.696Z","level":"info","msg":"agent resume skipped","paneId":"309c5a1f-f5b6-4a59-9c06-83e44c35423a","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:19.751Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:19.752Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:19.752Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:19.761Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-0NCvmf/commands.json","count":0}
{"ts":"2026-10-27T01:55:20.446Z","level":"warn","msg":"pane history save failed","path":"/tmp/soda-history-it-0NCvmf/session-history.json","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-history-it-0NCvmf/.tmp-xd6nj7/write' -> '/tmp/soda-history-it-0NCvmf/session-history.json'"}
{"ts":"2026-10-27T01:55:20.501Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:20.502Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:20.502Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:20.511Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-MSL74T/commands.json","count":0}
{"ts":"2026-10-27T01:55:20.912Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:20.913Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:20.913Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:20.922Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-MSL74T/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:21.158Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:21.159Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:21.160Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:21.178Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-N1S2W1/commands.json","count":0}
{"ts":"2026-10-27T01:55:21.542Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:21.542Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:21.542Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:21.551Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-YQtY3h/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:21.710Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:21.711Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:21.711Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:21.717Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-Pn9fBS/commands.json","count":0}
{"ts":"2026-10-27T01:55:21.979Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:21.980Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:21.980Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:21.990Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-YQtY3h/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:22.304Z","level":"info","msg":"pane socket: request","op":"extension.approve","paneId":"34b68c6f-378b-46b1-8c3a-d991fc0ea718","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T01:55:22.305Z","level":"info","msg":"pane socket: request","op":"extension.deny","paneId":"34b68c6f-378b-46b1-8c3a-d991fc0ea718","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T01:55:22.306Z","level":"info","msg":"pane socket: request","op":"extension.revoke","paneId":"34b68c6f-378b-46b1-8c3a-d991fc0ea718","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T01:55:22.312Z","level":"info","msg":"agent resume skipped","paneId":"fdd384f7-0630-4c0d-ac81-cae978c70c9a","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:22.401Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.402Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.402Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:22.409Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-YQtY3h/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:22.659Z","level":"info","msg":"extension started","extension":"project:757ecd3824a7884b39636114f5bf95ac232be9f71f471f57b3c4451c4eca0073:p2","run":"49b31f76-4eee-4748-b0ba-75cc1cace7f7","state":"running"}
{"ts":"2026-10-27T01:55:22.725Z","level":"info","msg":"agent resume skipped","paneId":"fdd384f7-0630-4c0d-ac81-cae978c70c9a","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:22.789Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.790Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.790Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:22.797Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-N1S2W1/commands.json","count":0}
{"ts":"2026-10-27T01:55:22.799Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.800Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.800Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:22.806Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-wKLvkd/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:22.824Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.824Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.824Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:22.831Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-wKLvkd/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:22.849Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.849Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.849Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:22.856Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-wKLvkd/commands.json","count":0}
{"ts":"2026-10-27T01:55:22.871Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.872Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.872Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:22.878Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-wKLvkd/commands.json","count":0}
{"ts":"2026-10-27T01:55:22.900Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.901Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:22.901Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:22.907Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-gZFIfH/commands.json","count":0}
{"ts":"2026-10-27T01:55:23.115Z","level":"info","msg":"agent resume skipped","paneId":"34b68c6f-378b-46b1-8c3a-d991fc0ea718","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:23.276Z","level":"warn","msg":"subagents: too many, not counting more","paneId":"a231918b-7a14-43f1-a771-71e3d7fbbe42","limit":256}
{"ts":"2026-10-27T01:55:23.305Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:23.306Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:23.306Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:23.313Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-4ZsfaV/commands.json","count":0}
{"ts":"2026-10-27T01:55:23.318Z","level":"warn","msg":"cannot write serve.json","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-compose-named-ui-4ZsfaV/.tmp-TqlLER/write' -> '/tmp/soda-compose-named-ui-4ZsfaV/serve.json'"}
{"ts":"2026-10-27T01:55:23.422Z","level":"info","msg":"agent resume skipped","paneId":"480fc7b1-11f7-4124-9246-9542ddb4e503","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:23.434Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:23.435Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:23.435Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:23.441Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-57UrTZ/commands.json","count":0}
{"ts":"2026-10-27T01:55:23.454Z","level":"info","msg":"extension started","extension":"project:757ecd3824a7884b39636114f5bf95ac232be9f71f471f57b3c4451c4eca0073:p2","run":"aec87df1-04aa-44ac-9e95-7827afeef3a0","state":"running"}
{"ts":"2026-10-27T01:55:23.702Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:23.703Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:23.703Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:23.709Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-DmLecd/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:23.923Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:23.923Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:23.923Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:23.930Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-N1S2W1/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T01:55:24.089Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:24.090Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:24.090Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:24.095Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-DmLecd/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:24.110Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:24.110Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:24.111Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:24.117Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-DmLecd/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:24.660Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:24.662Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:24.662Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:24.672Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-xpGiKa/commands.json","count":0}
{"ts":"2026-10-27T01:55:24.868Z","level":"info","msg":"extension started","extension":"project:757ecd3824a7884b39636114f5bf95ac232be9f71f471f57b3c4451c4eca0073:p2","run":"0689c365-6130-43de-a885-4d245f4eabb6","state":"running"}
{"ts":"2026-10-27T01:55:25.086Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:25.087Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:25.087Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:25.095Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-GrSoXy/commands.json","count":0}
{"ts":"2026-10-27T01:55:25.141Z","level":"info","msg":"display script enabled","byClientId":"01b48751-98a1-4a03-8ab1-313a60400c8c","byKind":"external"}
{"ts":"2026-10-27T01:55:25.303Z","level":"info","msg":"display set","paneId":"be66e5fb-37ed-48a6-a7de-b55d9999296a","name":"main","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:25.303Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"be66e5fb-37ed-48a6-a7de-b55d9999296a","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:25.327Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"be66e5fb-37ed-48a6-a7de-b55d9999296a","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:25.383Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"be66e5fb-37ed-48a6-a7de-b55d9999296a","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T01:55:25.385Z","level":"info","msg":"display closed","paneId":"be66e5fb-37ed-48a6-a7de-b55d9999296a","name":"main","reason":"closed"}
{"ts":"2026-10-27T01:55:25.385Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"be66e5fb-37ed-48a6-a7de-b55d9999296a","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T01:55:25.406Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:25.406Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:25.406Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:25.408Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"be66e5fb-37ed-48a6-a7de-b55d9999296a","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T01:55:25.409Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"be66e5fb-37ed-48a6-a7de-b55d9999296a","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T01:55:25.413Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-SptFvF/commands.json","count":0}
{"ts":"2026-10-27T01:55:25.444Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:25.445Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:25.445Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:25.451Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-qRqhZx/commands.json","count":0}
{"ts":"2026-10-27T01:55:26.029Z","level":"info","msg":"display script enabled","byClientId":"7bccb453-cfed-4dff-8bb7-98b7d64e2be6","byKind":"external"}
{"ts":"2026-10-27T01:55:26.040Z","level":"info","msg":"display set","paneId":"28902efc-e7c7-456b-a2e2-557002643c79","name":"big","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:26.041Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"28902efc-e7c7-456b-a2e2-557002643c79","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:26.050Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"28902efc-e7c7-456b-a2e2-557002643c79","connId":"pane-socket:2","code":"invalid_display"}
{"ts":"2026-10-27T01:55:26.077Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:26.078Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:26.078Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:26.084Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-nsB2FF/commands.json","count":0}
{"ts":"2026-10-27T01:55:26.119Z","level":"info","msg":"extension started","extension":"project:cc9e1226f01baf3ddafdc3c5585d4dc1a1b77a30d51a643e700fdd635bca15a6:a","run":"761feeb8-dc92-4ec3-907e-d9f8f11dc27a","state":"running"}
{"ts":"2026-10-27T01:55:26.172Z","level":"info","msg":"extension started","extension":"project:cc9e1226f01baf3ddafdc3c5585d4dc1a1b77a30d51a643e700fdd635bca15a6:b","run":"c5bbeef1-5c7e-4a40-be80-fd4849527a8d","state":"running"}
{"ts":"2026-10-27T01:55:26.503Z","level":"info","msg":"extension started","extension":"project:cc9e1226f01baf3ddafdc3c5585d4dc1a1b77a30d51a643e700fdd635bca15a6:a","run":"842213c4-59bb-49d1-af9c-22d0b14f9fcd","state":"running"}
{"ts":"2026-10-27T01:55:26.516Z","level":"info","msg":"display script enabled","byClientId":"0fe82567-2cd6-42f9-8c31-e39b920dbfab","byKind":"external"}
{"ts":"2026-10-27T01:55:26.659Z","level":"info","msg":"display set","paneId":"1bef1821-7b29-4170-a646-9d866b26641d","name":"q","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T01:55:26.659Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"1bef1821-7b29-4170-a646-9d866b26641d","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:26.674Z","level":"info","msg":"pane socket: request","connId":"pane-socket:2","code":"bad_request"}
{"ts":"2026-10-27T01:55:26.713Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:26.714Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:26.714Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:26.750Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-GezDBn/commands.json","count":0}
{"ts":"2026-10-27T01:55:26.929Z","level":"info","msg":"extension started","extension":"project:cc9e1226f01baf3ddafdc3c5585d4dc1a1b77a30d51a643e700fdd635bca15a6:a","run":"78e84f8b-65d0-4ad7-9ed0-42182fd28c8a","state":"running"}
{"ts":"2026-10-27T01:55:27.123Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:27.123Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:27.123Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:27.130Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-tyVbXp/commands.json","count":0}
{"ts":"2026-10-27T01:55:27.215Z","level":"info","msg":"display script enabled","byClientId":"b6074e39-2d2b-448e-b791-355af258823c","byKind":"external"}
{"ts":"2026-10-27T01:55:27.267Z","level":"info","msg":"extension started","extension":"project:cc9e1226f01baf3ddafdc3c5585d4dc1a1b77a30d51a643e700fdd635bca15a6:a","run":"7e2ad7a9-1ab5-4812-ab3e-f7976a36f382","state":"running"}
{"ts":"2026-10-27T01:55:27.592Z","level":"info","msg":"extension started","extension":"project:cc9e1226f01baf3ddafdc3c5585d4dc1a1b77a30d51a643e700fdd635bca15a6:a","run":"23c20754-a6e0-4cf1-a72c-2e0d1819489e","state":"running"}
{"ts":"2026-10-27T01:55:27.875Z","level":"info","msg":"display set","paneId":"b81beda5-57a1-4f50-82e2-dd81c63fed01","name":"secret","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:27.884Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:27.885Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:27.885Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T01:55:27.888Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T01:55:27.889Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T01:55:27.890Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:6","code":"invalid_params"}
{"ts":"2026-10-27T01:55:27.891Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:7","code":"invalid_params"}
{"ts":"2026-10-27T01:55:27.892Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:8","code":"invalid_params"}
{"ts":"2026-10-27T01:55:28.353Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:28.366Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:28.366Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:28.379Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-7XMJPf/commands.json","count":0}
{"ts":"2026-10-27T01:55:28.910Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"3bc9a96f-7c92-452f-9a4e-f0b819fe51f0","connId":"pane-socket:9","code":"ok"}
{"ts":"2026-10-27T01:55:28.979Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:28.980Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:28.980Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:28.988Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-8OyL6j/commands.json","count":0}
{"ts":"2026-10-27T01:55:29.287Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:29.288Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:29.288Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:29.295Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-CquHlB/commands.json","count":0}
{"ts":"2026-10-27T01:55:29.392Z","level":"info","msg":"extension started","extension":"project:a39863c59de5816696e107ca180b4dbf4b7b4adbd0897e9652a8c7311da417ad:p4","run":"fe40281a-e4ce-45f4-b8dd-399870a3dd18","state":"running"}
{"ts":"2026-10-27T01:55:29.426Z","level":"info","msg":"display script enabled","byClientId":"071ab573-332e-448c-b64b-579d489c21b2","byKind":"external"}
{"ts":"2026-10-27T01:55:29.450Z","level":"info","msg":"extension exited","extension":"project:a39863c59de5816696e107ca180b4dbf4b7b4adbd0897e9652a8c7311da417ad:p4","run":"fe40281a-e4ce-45f4-b8dd-399870a3dd18","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:29.534Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"85377989-199a-4f98-aab9-666154a8af7f","connId":"pane-socket:5","code":"display_busy"}
{"ts":"2026-10-27T01:55:29.869Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:29.870Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:29.870Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:29.879Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-v4JGbY/commands.json","count":0}
{"ts":"2026-10-27T01:55:30.321Z","level":"info","msg":"display script enabled","byClientId":"014463e4-4984-4500-b292-7867f348bfd1","byKind":"external"}
{"ts":"2026-10-27T01:55:30.625Z","level":"info","msg":"display set","paneId":"6c650a33-bf2d-49f0-a346-c6ae71a6179d","name":"big","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:30.732Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:30.733Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:30.733Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:30.744Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-QsRNW0/commands.json","count":0}
{"ts":"2026-10-27T01:55:30.799Z","level":"info","msg":"display closed","paneId":"6c650a33-bf2d-49f0-a346-c6ae71a6179d","name":"big","reason":"dismissed"}
{"ts":"2026-10-27T01:55:30.803Z","level":"info","msg":"display set","paneId":"6c650a33-bf2d-49f0-a346-c6ae71a6179d","name":"again","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:30.808Z","level":"info","msg":"display reported","paneId":"6c650a33-bf2d-49f0-a346-c6ae71a6179d","name":"again","problem":"navigated","format":"html"}
{"ts":"2026-10-27T01:55:30.808Z","level":"info","msg":"display closed","paneId":"6c650a33-bf2d-49f0-a346-c6ae71a6179d","name":"again","reason":"navigated"}
{"ts":"2026-10-27T01:55:30.846Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:30.847Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:30.847Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:30.857Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-W0U0QZ/commands.json","count":0}
{"ts":"2026-10-27T01:55:31.049Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:31.049Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:31.050Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:31.061Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-nKxEh1/commands.json","count":0}
{"ts":"2026-10-27T01:55:31.292Z","level":"info","msg":"display script enabled","byClientId":"7fe7dbdb-907d-4357-9575-24b2e4ccc08b","byKind":"external"}
{"ts":"2026-10-27T01:55:31.327Z","level":"info","msg":"display set","paneId":"6d1ad2c1-61c4-411f-8f11-b7938c78a285","name":"m","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:31.537Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:31.538Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:31.538Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:31.545Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-qWvXJG/commands.json","count":0}
{"ts":"2026-10-27T01:55:31.983Z","level":"info","msg":"display script enabled","byClientId":"52503fc1-4a6e-4ad8-bbaa-381b56ba0b28","byKind":"external"}
{"ts":"2026-10-27T01:55:32.123Z","level":"info","msg":"display set","paneId":"96c15834-8afb-460b-8051-18768cbff947","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:32.151Z","level":"info","msg":"display set","paneId":"96c15834-8afb-460b-8051-18768cbff947","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:32.199Z","level":"info","msg":"display set","paneId":"96c15834-8afb-460b-8051-18768cbff947","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:32.238Z","level":"info","msg":"display set","paneId":"96c15834-8afb-460b-8051-18768cbff947","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:32.611Z","level":"info","msg":"extension started","extension":"project:b410cde3b5adec27275c31d586e3d647b401f22e8e74763147d42d72f71fa1a6:p5","run":"d98326f6-0f25-41d4-8642-9b84a6ff46da","state":"running"}
{"ts":"2026-10-27T01:55:32.908Z","level":"info","msg":"extension started","extension":"project:b410cde3b5adec27275c31d586e3d647b401f22e8e74763147d42d72f71fa1a6:p5","run":"f55d5fb3-1d71-43eb-9c75-0f347ac1ad21","state":"running"}
{"ts":"2026-10-27T01:55:32.986Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:32.987Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:32.987Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:32.997Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-nKxEh1/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T01:55:33.078Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:33.078Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:33.078Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:33.088Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-psFA26/commands.json","count":0}
{"ts":"2026-10-27T01:55:33.096Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:33.098Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:33.098Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:33.105Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-KPRGLD/commands.json","count":0}
{"ts":"2026-10-27T01:55:33.345Z","level":"info","msg":"display set","paneId":"d213c222-d057-4d63-8a34-052b80951a50","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.457Z","level":"info","msg":"display set","paneId":"d213c222-d057-4d63-8a34-052b80951a50","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.493Z","level":"info","msg":"display set","paneId":"d213c222-d057-4d63-8a34-052b80951a50","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.521Z","level":"info","msg":"display set","paneId":"d213c222-d057-4d63-8a34-052b80951a50","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.556Z","level":"info","msg":"display set","paneId":"e48c6669-6b7b-4644-8411-d23a5a49ae65","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.588Z","level":"info","msg":"display set","paneId":"e48c6669-6b7b-4644-8411-d23a5a49ae65","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.616Z","level":"info","msg":"display set","paneId":"e48c6669-6b7b-4644-8411-d23a5a49ae65","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.642Z","level":"info","msg":"display set","paneId":"e48c6669-6b7b-4644-8411-d23a5a49ae65","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.664Z","level":"info","msg":"extension started","extension":"project:b410cde3b5adec27275c31d586e3d647b401f22e8e74763147d42d72f71fa1a6:p5","run":"007a64d5-8a4c-44d4-ae79-f70b5226c589","state":"running"}
{"ts":"2026-10-27T01:55:33.674Z","level":"info","msg":"display set","paneId":"49278ba2-7a33-49cf-abc6-469cb25d125d","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.701Z","level":"info","msg":"display set","paneId":"49278ba2-7a33-49cf-abc6-469cb25d125d","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.716Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:11720e8d-7b2e-4865-8584-463a02507ca4"]}
{"ts":"2026-10-27T01:55:33.727Z","level":"info","msg":"display set","paneId":"49278ba2-7a33-49cf-abc6-469cb25d125d","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.755Z","level":"info","msg":"display set","paneId":"49278ba2-7a33-49cf-abc6-469cb25d125d","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:55:33.796Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:33.797Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:33.797Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:33.802Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-LCh3Ji/commands.json","count":0}
{"ts":"2026-10-27T01:55:34.109Z","level":"info","msg":"display closed","paneId":"d213c222-d057-4d63-8a34-052b80951a50","name":"p0","reason":"closed"}
{"ts":"2026-10-27T01:55:34.109Z","level":"info","msg":"display closed","paneId":"d213c222-d057-4d63-8a34-052b80951a50","name":"p1","reason":"closed"}
{"ts":"2026-10-27T01:55:34.109Z","level":"info","msg":"display closed","paneId":"d213c222-d057-4d63-8a34-052b80951a50","name":"p2","reason":"closed"}
{"ts":"2026-10-27T01:55:34.109Z","level":"info","msg":"display closed","paneId":"d213c222-d057-4d63-8a34-052b80951a50","name":"p3","reason":"closed"}
{"ts":"2026-10-27T01:55:34.112Z","level":"info","msg":"display set","paneId":"d7fe9d66-a661-49ee-972a-8c9c0d1edb6b","name":"one","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T01:55:34.142Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:34.143Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:34.143Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:34.152Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-GFEJx9/commands.json","count":0}
{"ts":"2026-10-27T01:55:34.380Z","level":"info","msg":"agent session attached","paneId":"0cfcccb9-6a42-49d4-9be7-393acd42811b","kind":"claude","session":"resume-m","source":"hook"}
{"ts":"2026-10-27T01:55:34.415Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:34.416Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:34.416Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:34.422Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:34.423Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:34.423Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:34.423Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-iFB9kR/commands.json","count":0}
{"ts":"2026-10-27T01:55:34.428Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-bPqWm0/commands.json","count":0}
{"ts":"2026-10-27T01:55:34.610Z","level":"info","msg":"display script enabled","byClientId":"59e0748a-da5c-4a85-85e9-0c23f62b699a","byKind":"external"}
{"ts":"2026-10-27T01:55:34.702Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:34.703Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:34.703Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:34.710Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Qew0Ht/commands.json","count":0}
{"ts":"2026-10-27T01:55:35.209Z","level":"info","msg":"display set","paneId":"675967ef-7b55-4acc-ba7b-185cce88c5da","name":"x","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:35.265Z","level":"info","msg":"display closed","paneId":"675967ef-7b55-4acc-ba7b-185cce88c5da","name":"x","reason":"pane_closed"}
{"ts":"2026-10-27T01:55:35.273Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:675967ef-7b55-4acc-ba7b-185cce88c5da"]}
{"ts":"2026-10-27T01:55:35.310Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:35.311Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:35.311Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:35.320Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-w3YWxv/commands.json","count":0}
{"ts":"2026-10-27T01:55:35.368Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:40dad498-ac6b-4a0e-8048-7f8b6a9ff7ad"]}
{"ts":"2026-10-27T01:55:35.404Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:35.405Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:35.405Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:35.410Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-qol9R5/commands.json","count":0}
{"ts":"2026-10-27T01:55:35.790Z","level":"info","msg":"display script enabled","byClientId":"90a8977e-51cd-4b94-a06a-691415b7f1e6","byKind":"external"}
{"ts":"2026-10-27T01:55:35.848Z","level":"info","msg":"extension started","extension":"project:1c4fb3cd382ccebfc69fa2c7cf7663570c819718dbbbd3306d211e50c71b02c1:p5b","run":"e37e3aca-35db-48c3-b15f-9fa5fcf1b7a5","state":"running"}
{"ts":"2026-10-27T01:55:35.890Z","level":"info","msg":"extension exited","extension":"project:1c4fb3cd382ccebfc69fa2c7cf7663570c819718dbbbd3306d211e50c71b02c1:p5b","run":"e37e3aca-35db-48c3-b15f-9fa5fcf1b7a5","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:35.901Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:35.901Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:35.901Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:35.910Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-CZyy01/commands.json","count":0}
{"ts":"2026-10-27T01:55:36.348Z","level":"info","msg":"display script enabled","byClientId":"06dd3c84-4161-4c2f-9a71-0e6a528b420b","byKind":"external"}
{"ts":"2026-10-27T01:55:36.396Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:36.398Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:36.398Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:36.407Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-68O1A9/commands.json","count":0}
{"ts":"2026-10-27T01:55:36.493Z","level":"info","msg":"display set","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T01:55:36.494Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:36.498Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:36.520Z","level":"info","msg":"display set","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:36.521Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T01:55:36.522Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T01:55:36.525Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T01:55:36.536Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","connId":"pane-socket:6","code":"display_closed"}
{"ts":"2026-10-27T01:55:36.552Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","connId":"pane-socket:7","code":"ok"}
{"ts":"2026-10-27T01:55:36.579Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"d5c43afb-c98b-4e1f-a3d5-16ea7e8122db","connId":"pane-socket:8","code":"ok"}
{"ts":"2026-10-27T01:55:36.627Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:36.628Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:36.628Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:36.636Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-jeFbI0/commands.json","count":0}
{"ts":"2026-10-27T01:55:36.870Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:36.870Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:36.870Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:36.876Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-68O1A9/commands.json","count":0}
{"ts":"2026-10-27T01:55:37.067Z","level":"info","msg":"display script enabled","byClientId":"94dc47a3-1060-499d-b699-f709512a121a","byKind":"external"}
{"ts":"2026-10-27T01:55:37.105Z","level":"info","msg":"display set","paneId":"4e133df3-b458-4589-8e53-6d6a6a2f1dd0","name":"lay","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:37.105Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"4e133df3-b458-4589-8e53-6d6a6a2f1dd0","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:37.156Z","level":"info","msg":"display set","paneId":"4e133df3-b458-4589-8e53-6d6a6a2f1dd0","name":"bd","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T01:55:37.156Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"4e133df3-b458-4589-8e53-6d6a6a2f1dd0","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:37.182Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"4e133df3-b458-4589-8e53-6d6a6a2f1dd0","connId":"pane-socket:3","code":"invalid_display"}
{"ts":"2026-10-27T01:55:37.184Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"4e133df3-b458-4589-8e53-6d6a6a2f1dd0","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T01:55:37.196Z","level":"info","msg":"agent resume skipped","paneId":"abff9096-ce3a-4f9b-8857-215f6b617312","reason":"no-session-ref"}
{"ts":"2026-10-27T01:55:37.283Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.285Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.285Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:37.310Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-Wd7bM1/commands.json","count":0}
{"ts":"2026-10-27T01:55:37.461Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.462Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.462Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:37.468Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-KAat8a/commands.json","count":0}
{"ts":"2026-10-27T01:55:37.499Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.500Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.500Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:37.508Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-qWfXnT/commands.json","count":0}
{"ts":"2026-10-27T01:55:37.762Z","level":"info","msg":"display script enabled","byClientId":"a24c962c-03b9-4751-a76f-d0f862433016","byKind":"external"}
{"ts":"2026-10-27T01:55:37.797Z","level":"info","msg":"display set","paneId":"f9332d62-aff5-4699-a44f-5977f4980bb6","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T01:55:37.930Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.931Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.931Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:37.949Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.951Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:37.951Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:37.956Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-czOgQT/commands.json","count":0}
{"ts":"2026-10-27T01:55:37.960Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-KAat8a/commands.json","count":0}
{"ts":"2026-10-27T01:55:37.970Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-graph-it-KAat8a/session-backups/2026-10-27T01-55-37-969Z.json"}
{"ts":"2026-10-27T01:55:38.284Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:642c65e4-07a1-41c7-8a89-83af63e5a26d"]}
{"ts":"2026-10-27T01:55:38.284Z","level":"info","msg":"graph.json had nodes of closed panes; removed them","nodes":1}
{"ts":"2026-10-27T01:55:38.428Z","level":"info","msg":"display script enabled","byClientId":"3168a123-afc5-4542-bd3c-105a2759df3a","byKind":"external"}
{"ts":"2026-10-27T01:55:38.533Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:38.534Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:38.534Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:38.546Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-UO47b2/commands.json","count":0}
{"ts":"2026-10-27T01:55:38.552Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:38.553Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:38.553Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:38.564Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-yWKipt/commands.json","count":0}
{"ts":"2026-10-27T01:55:38.885Z","level":"info","msg":"extension started","extension":"project:fc054528e0d9be6553c1adda60592181300e1aeb2e32a5661e26ddc412e5894e:p6","run":"fbbb8545-4c98-44de-9554-fef91076eb88","state":"running"}
{"ts":"2026-10-27T01:55:38.913Z","level":"info","msg":"display set","paneId":"118a1087-deb8-498d-b072-b15a91ce57b0","name":"secret","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T01:55:38.915Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"6cac13ed-3889-4393-bbe7-a47037037e1f","connId":"pane-socket:1","code":"display_closed"}
{"ts":"2026-10-27T01:55:38.917Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"6cac13ed-3889-4393-bbe7-a47037037e1f","connId":"pane-socket:2","code":"invalid_params"}
{"ts":"2026-10-27T01:55:38.951Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:38.952Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:38.952Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:38.962Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-irbZuK/commands.json","count":0}
{"ts":"2026-10-27T01:55:38.985Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:38.985Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:38.986Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:38.995Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-0e3tfJ/commands.json","count":0}
{"ts":"2026-10-27T01:55:39.373Z","level":"info","msg":"display script enabled","byClientId":"e4c838bd-2dd9-4276-a349-db0193f131d5","byKind":"external"}
{"ts":"2026-10-27T01:55:39.521Z","level":"info","msg":"display set","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T01:55:39.521Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:39.524Z","level":"info","msg":"display reported","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:55:39.527Z","level":"info","msg":"display reported","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:55:39.536Z","level":"info","msg":"display closed","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","name":"g","reason":"closed"}
{"ts":"2026-10-27T01:55:39.536Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:39.539Z","level":"info","msg":"display set","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T01:55:39.539Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T01:55:39.593Z","level":"info","msg":"display reported","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:55:39.593Z","level":"info","msg":"display closed","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","name":"g","reason":"focus_steal"}
{"ts":"2026-10-27T01:55:39.594Z","level":"info","msg":"display script cooldown","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","reason":"focus_steal","closed":1,"ms":300000}
{"ts":"2026-10-27T01:55:39.594Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T01:55:39.596Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","connId":"pane-socket:5","code":"display_busy"}
{"ts":"2026-10-27T01:55:39.597Z","level":"info","msg":"display set","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","name":"h","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:39.598Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T01:55:39.599Z","level":"info","msg":"display reported","paneId":"ac9efac0-b37b-431a-b24c-2917439bf66d","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:55:39.622Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:39.623Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:39.623Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:39.632Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-ARznbi/commands.json","count":0}
{"ts":"2026-10-27T01:55:39.712Z","level":"info","msg":"display set","paneId":"03793938-e5ac-4b4b-8d31-1ea27fc826e9","name":"m","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T01:55:39.754Z","level":"info","msg":"display closed","paneId":"03793938-e5ac-4b4b-8d31-1ea27fc826e9","name":"m","reason":"closed"}
{"ts":"2026-10-27T01:55:39.883Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:39.884Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:39.884Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:39.893Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-kqXQgR/commands.json","count":0}
{"ts":"2026-10-27T01:55:39.950Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:39.951Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:39.951Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:39.958Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-z8KHFt/commands.json","count":0}
{"ts":"2026-10-27T01:55:40.049Z","level":"info","msg":"display script enabled","byClientId":"d04a5877-fe3a-4a92-a2c4-15f365957322","byKind":"external"}
{"ts":"2026-10-27T01:55:40.084Z","level":"info","msg":"display set","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T01:55:40.084Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:55:40.085Z","level":"info","msg":"display reported","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:55:40.087Z","level":"info","msg":"display reported","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:55:40.154Z","level":"info","msg":"display closed","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","name":"g","reason":"closed"}
{"ts":"2026-10-27T01:55:40.155Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:40.177Z","level":"info","msg":"display reported","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T01:55:40.178Z","level":"info","msg":"display script cooldown","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","reason":"focus_steal","closed":0,"ms":300000}
{"ts":"2026-10-27T01:55:40.185Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"a8b9b7d1-2598-415d-9f48-ef8f90763ecc","connId":"pane-socket:3","code":"display_busy"}
{"ts":"2026-10-27T01:55:40.272Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:40.273Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:40.273Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:40.281Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-ZxG2qK/commands.json","count":0}
{"ts":"2026-10-27T01:55:40.381Z","level":"info","msg":"agent session attached","paneId":"43928409-3973-408d-af5f-1796d5df3eba","kind":"grok","session":"grok-1","source":"hook"}
{"ts":"2026-10-27T01:55:40.383Z","level":"info","msg":"agent session attached","paneId":"43928409-3973-408d-af5f-1796d5df3eba","kind":"qodercli","session":"qodercli","source":"hook"}
{"ts":"2026-10-27T01:55:40.383Z","level":"info","msg":"agent session attached","paneId":"43928409-3973-408d-af5f-1796d5df3eba","kind":"devin","session":"devin-1","source":"hook"}
{"ts":"2026-10-27T01:55:40.415Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:40.416Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:40.416Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:40.423Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-OPL7kS/commands.json","count":0}
{"ts":"2026-10-27T01:55:40.678Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"4f040baf-6047-4e7e-98c3-5b83fce87fb1","connId":"pane-socket:1","code":"display_script_disabled"}
{"ts":"2026-10-27T01:55:40.680Z","level":"info","msg":"display set","paneId":"4f040baf-6047-4e7e-98c3-5b83fce87fb1","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:40.680Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"4f040baf-6047-4e7e-98c3-5b83fce87fb1","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:40.681Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"4f040baf-6047-4e7e-98c3-5b83fce87fb1","connId":"pane-socket:3","code":"display_script_disabled"}
{"ts":"2026-10-27T01:55:40.682Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"4f040baf-6047-4e7e-98c3-5b83fce87fb1","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T01:55:40.709Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:40.710Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:40.710Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:40.720Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-oSKRoa/commands.json","count":0}
{"ts":"2026-10-27T01:55:40.790Z","level":"info","msg":"display script enabled","byClientId":"9476dc7a-de0a-4eba-bc99-7d6973773101","byKind":"desktop"}
{"ts":"2026-10-27T01:55:40.844Z","level":"info","msg":"extension started","extension":"project:bd660f9a08e6139ae25e713efe7c8a62b4ce2e1d7292873fcf351198a0dc90a8:p7","run":"a0536d38-fb9e-415d-93a4-3a9b0a80c809","state":"running"}
{"ts":"2026-10-27T01:55:41.065Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:41.067Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:41.067Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:41.092Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-um1VV0/commands.json","count":0}
{"ts":"2026-10-27T01:55:41.141Z","level":"info","msg":"agent session attached","paneId":"dfd59c7f-6df5-444e-b0a7-f0e33ba89f90","kind":"codex","session":"marker-b","source":"hook"}
{"ts":"2026-10-27T01:55:41.185Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:41.186Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:41.186Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:41.195Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-BWz5SN/commands.json","count":0}
{"ts":"2026-10-27T01:55:41.311Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","connId":"pane-socket:1","code":"display_script_disabled"}
{"ts":"2026-10-27T01:55:41.316Z","level":"info","msg":"display script enabled","byClientId":"6db2bd4e-309b-4c94-8e07-a1e23648ec83","byKind":"external"}
{"ts":"2026-10-27T01:55:41.318Z","level":"info","msg":"display set","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T01:55:41.318Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:55:41.320Z","level":"info","msg":"display set","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T01:55:41.321Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T01:55:41.428Z","level":"info","msg":"display closed","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","name":"g","reason":"script_disabled"}
{"ts":"2026-10-27T01:55:41.429Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T01:55:41.436Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T01:55:41.437Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"a46f9104-fa19-48ed-a4f7-e9ad86c3d782","connId":"pane-socket:6","code":"display_script_disabled"}
{"ts":"2026-10-27T01:55:41.466Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:41.467Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:41.467Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:41.480Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-smigGD/commands.json","count":0}
{"ts":"2026-10-27T01:55:41.879Z","level":"info","msg":"pane socket: request","op":"prefs.set","paneId":"814a50c5-c685-4484-80fa-118f1f1a00df","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T01:55:41.880Z","level":"info","msg":"pane socket: request","op":"prefs.get","paneId":"814a50c5-c685-4484-80fa-118f1f1a00df","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T01:55:41.881Z","level":"info","msg":"pane socket: request","op":"client.hello","paneId":"814a50c5-c685-4484-80fa-118f1f1a00df","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T01:55:41.882Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"814a50c5-c685-4484-80fa-118f1f1a00df","connId":"pane-socket:4","code":"display_script_disabled"}
{"ts":"2026-10-27T01:55:41.883Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"814a50c5-c685-4484-80fa-118f1f1a00df","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T01:55:41.924Z","level":"info","msg":"extension started","extension":"project:bd660f9a08e6139ae25e713efe7c8a62b4ce2e1d7292873fcf351198a0dc90a8:p7","run":"c34a2a38-5510-4ac9-9623-e2c175edff9b","state":"running"}
{"ts":"2026-10-27T01:55:42.717Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:42.718Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:42.718Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:42.740Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-LklAw7/commands.json","count":0}
{"ts":"2026-10-27T01:55:42.755Z","level":"info","msg":"display set","paneId":"17179e7f-bb93-4ad2-8123-8a3d19f7ec5f","name":"s","kind":"panel","format":"script-html","bytes":8,"rev":1}
{"ts":"2026-10-27T01:55:42.808Z","level":"info","msg":"display closed","paneId":"17179e7f-bb93-4ad2-8123-8a3d19f7ec5f","name":"s","reason":"script_disabled"}
{"ts":"2026-10-27T01:55:42.846Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:42.848Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:42.848Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:42.856Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-yZc6vM/commands.json","count":0}
{"ts":"2026-10-27T01:55:42.951Z","level":"info","msg":"extension started","extension":"project:bd660f9a08e6139ae25e713efe7c8a62b4ce2e1d7292873fcf351198a0dc90a8:p7","run":"2cda638e-dc3a-4d8c-b0c1-94a998ac7ba4","state":"running"}
{"ts":"2026-10-27T01:55:43.560Z","level":"info","msg":"agent session attached","paneId":"4d46e4d0-b3f4-44ed-96f8-e33f38d2951e","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:55:43.652Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:43.653Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:43.653Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:43.660Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-K16tJH/commands.json","count":0}
{"ts":"2026-10-27T01:55:43.906Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:43.906Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:43.907Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:43.914Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-J7nVMw/commands.json","count":0}
{"ts":"2026-10-27T01:55:44.378Z","level":"info","msg":"extension started","extension":"user:p10u","run":"2ea35ac2-37be-4e66-89f5-214378377ce8","state":"running"}
{"ts":"2026-10-27T01:55:44.498Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:44.499Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:44.499Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:44.507Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-fgBumU/commands.json","count":0}
{"ts":"2026-10-27T01:55:45.122Z","level":"info","msg":"extension started","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"963c1742-8330-41d4-b90b-0e067d2ceb92","state":"running"}
{"ts":"2026-10-27T01:55:45.220Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:45.221Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:45.221Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:45.231Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-KRux9D/commands.json","count":0}
{"ts":"2026-10-27T01:55:45.238Z","level":"info","msg":"extension exited","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"963c1742-8330-41d4-b90b-0e067d2ceb92","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:45.269Z","level":"info","msg":"extension started","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"48a5a8e8-8570-4881-8792-ef6b9d989910","state":"running"}
{"ts":"2026-10-27T01:55:45.357Z","level":"info","msg":"extension exited","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"48a5a8e8-8570-4881-8792-ef6b9d989910","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:45.411Z","level":"info","msg":"extension started","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"e4e1ebd0-9e01-4909-83ff-115d00c9bcfc","state":"running"}
{"ts":"2026-10-27T01:55:45.499Z","level":"info","msg":"extension exited","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"e4e1ebd0-9e01-4909-83ff-115d00c9bcfc","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:45.615Z","level":"info","msg":"extension started","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"63ac0c8c-98b1-4304-a74f-64349c75cb46","state":"running"}
{"ts":"2026-10-27T01:55:45.810Z","level":"info","msg":"extension exited","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"63ac0c8c-98b1-4304-a74f-64349c75cb46","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:45.998Z","level":"info","msg":"extension started","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"ac4b2fbc-3402-45f9-badf-fc541a096a70","state":"running"}
{"ts":"2026-10-27T01:55:46.033Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:46.034Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:46.035Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:46.043Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-1SsnrQ/commands.json","count":0}
{"ts":"2026-10-27T01:55:46.201Z","level":"info","msg":"extension exited","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","run":"ac4b2fbc-3402-45f9-badf-fc541a096a70","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:46.202Z","level":"warn","msg":"extension failed","extension":"project:7f976c4d77dfc5185f49554911bfb405dc0c7d2bc43acf878d0cb50148cd2070:p10","state":"failed","failures":5}
{"ts":"2026-10-27T01:55:46.768Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:46.769Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:46.769Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:46.791Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-CpM54w/commands.json","count":0}
{"ts":"2026-10-27T01:55:46.971Z","level":"info","msg":"agent session attached","paneId":"f510862b-fe52-471e-9240-cd989f5fc14d","kind":"claude","session":"54917b42","source":"hook"}
{"ts":"2026-10-27T01:55:47.220Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:47.221Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:47.221Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:47.245Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-YETPaM/commands.json","count":0}
{"ts":"2026-10-27T01:55:47.502Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:47.503Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:47.503Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:47.511Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-2lfG5D/commands.json","count":0}
{"ts":"2026-10-27T01:55:48.073Z","level":"info","msg":"extension started","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"ec2ae948-5195-4da9-9428-5b42fdb56734","state":"running"}
{"ts":"2026-10-27T01:55:48.075Z","level":"info","msg":"extension exited","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"ec2ae948-5195-4da9-9428-5b42fdb56734","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:48.107Z","level":"info","msg":"extension started","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"70765f21-3b24-4d34-9775-2b1302176697","state":"running"}
{"ts":"2026-10-27T01:55:48.109Z","level":"info","msg":"extension exited","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"70765f21-3b24-4d34-9775-2b1302176697","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:48.160Z","level":"info","msg":"extension started","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"dfa83956-d25f-42b3-bcbf-8bc475d2e02e","state":"running"}
{"ts":"2026-10-27T01:55:48.161Z","level":"info","msg":"extension exited","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"dfa83956-d25f-42b3-bcbf-8bc475d2e02e","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:48.252Z","level":"info","msg":"extension started","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"b61f41dd-02b3-40d9-87c6-e5cd3e633565","state":"running"}
{"ts":"2026-10-27T01:55:48.253Z","level":"info","msg":"extension exited","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"b61f41dd-02b3-40d9-87c6-e5cd3e633565","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:48.342Z","level":"info","msg":"extension started","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"681a8609-3bd8-4458-8e1c-59424aef17ac","state":"running"}
{"ts":"2026-10-27T01:55:48.345Z","level":"info","msg":"extension exited","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","run":"681a8609-3bd8-4458-8e1c-59424aef17ac","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T01:55:48.345Z","level":"warn","msg":"extension failed","extension":"project:e1205885dee20d4d00bfc35560825f32e3051dd76a4d0a7d3959c630117f6c8b:p10b","state":"failed","failures":5}
{"ts":"2026-10-27T01:55:49.387Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:49.388Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:49.388Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:49.396Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-pTv2BB/commands.json","count":0}
{"ts":"2026-10-27T01:55:49.654Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:49.656Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:49.656Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:49.681Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-PLh6Vh/commands.json","count":0}
{"ts":"2026-10-27T01:55:51.113Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:51.114Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:51.114Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:51.121Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-Yi17JP/commands.json","count":0}
{"ts":"2026-10-27T01:55:51.497Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:51.498Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:51.498Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:51.505Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-91yyyK/commands.json","count":0}
{"ts":"2026-10-27T01:55:51.711Z","level":"info","msg":"agent session attached","paneId":"c7bc6c5f-00cf-4cc9-b513-74680a613874","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:55:52.372Z","level":"info","msg":"extension started","extension":"project:bc74d948883eb3f30cf761656f7f628fbea209dab25fe2dd8be66ad02d21dbaf:p9","run":"95be36fc-69f4-4ef1-b7a6-ed50a3c127b3","state":"running"}
{"ts":"2026-10-27T01:55:53.087Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:53.088Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:53.088Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:53.096Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-PhlmM0/state-jVlIzb/commands.json","count":0}
{"ts":"2026-10-27T01:55:53.683Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:53.685Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:53.685Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:53.694Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-CjGrZ0/commands.json","count":0}
{"ts":"2026-10-27T01:55:54.563Z","level":"info","msg":"pane socket: request","op":"agent.subagent_transcript","paneId":"c1fdc9f5-b4a8-41e5-95be-5aa137e000a6","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T01:55:54.869Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:54.870Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:54.870Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:54.879Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-CjGrZ0/commands.json","count":0}
{"ts":"2026-10-27T01:55:54.892Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-graph-run-CjGrZ0/session-backups/2026-10-27T01-55-54-891Z.json"}
{"ts":"2026-10-27T01:55:55.176Z","level":"info","msg":"agent session attached","paneId":"28054cc2-7da7-467c-895d-e9ffca5412a9","kind":"claude","session":"ee7fab19","source":"hook"}
{"ts":"2026-10-27T01:55:55.204Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:0cb7c657-d5b0-4b42-be9d-ca8837191173","local:e7e7d4b0-68f4-47e1-b659-d10ada6e7bc7"]}
{"ts":"2026-10-27T01:55:55.204Z","level":"info","msg":"graph.json had nodes of closed panes; removed them","nodes":2}
{"ts":"2026-10-27T01:55:55.755Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:55.755Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:55.755Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:55.763Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-Y1MpI5/commands.json","count":0}
{"ts":"2026-10-27T01:55:55.975Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:55.977Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:55.977Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:55.983Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-JFxWak/commands.json","count":0}
{"ts":"2026-10-27T01:55:56.432Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:56.433Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:56.433Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:56.436Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-ynWTXi/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T01:55:56.709Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:56.710Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:56.710Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:56.724Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-3hoZgQ/commands.json","count":0}
{"ts":"2026-10-27T01:55:56.913Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:56.913Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:56.914Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:56.914Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:56.915Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:56.915Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:56.923Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-JjQTNs/commands.json","count":0}
{"ts":"2026-10-27T01:55:56.924Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-JjQTNs/commands.json","count":0}
{"ts":"2026-10-27T01:55:57.359Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:57.360Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:57.360Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:57.365Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-mwWKj6/commands.json","count":0}
{"ts":"2026-10-27T01:55:57.672Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T01:55:57.688Z","level":"info","msg":"handoff: replacing this server with the version on disk","id":"730af61970ad45fe","panes":2}
{"ts":"2026-10-27T01:55:57.689Z","level":"error","msg":"handoff: execve failed; keeping the current server","error":"execve refused by the test"}
{"ts":"2026-10-27T01:55:58.217Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:58.218Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:58.219Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:58.225Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-L0XB7Z/commands.json","count":0}
{"ts":"2026-10-27T01:55:58.695Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:58.696Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:58.696Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:58.701Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-VneB5c/commands.json","count":0}
{"ts":"2026-10-27T01:55:59.471Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:59.472Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:59.472Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:59.501Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-2HGOgV/commands.json","count":0}
{"ts":"2026-10-27T01:55:59.674Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:59.675Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:59.675Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:59.682Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-MckHaV/commands.json","count":0}
{"ts":"2026-10-27T01:55:59.960Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:55:59.961Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:55:59.962Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:55:59.967Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-7xlXPU/commands.json","count":0}
{"ts":"2026-10-27T01:56:00.115Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:00.116Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:00.116Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:00.123Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-aUnI5G/commands.json","count":0}
{"ts":"2026-10-27T01:56:00.269Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:c7bc6c5f-00cf-4cc9-b513-74680a613874"]}
{"ts":"2026-10-27T01:56:00.414Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:00.415Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:00.415Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:00.424Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-yl4oRm/commands.json","count":0}
{"ts":"2026-10-27T01:56:00.623Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:00.624Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:00.624Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:00.633Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-xYz61o/commands.json","count":0}
{"ts":"2026-10-27T01:56:01.021Z","level":"info","msg":"agent session attached","paneId":"18c70cc1-d578-45f6-badd-3d1845eb8949","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:01.507Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:01.507Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:01.508Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:01.513Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-42PNvX/commands.json","count":0}
{"ts":"2026-10-27T01:56:01.606Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:56:01.648Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:01.649Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:01.649Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:01.656Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-re1tzP/commands.json","count":0}
{"ts":"2026-10-27T01:56:01.834Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:01.835Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:01.835Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:01.840Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-bsWCAo/commands.json","count":0}
{"ts":"2026-10-27T01:56:02.066Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:02.067Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:02.067Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:02.072Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-SCyn6m/commands.json","count":0}
{"ts":"2026-10-27T01:56:02.350Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:02.351Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:02.351Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:02.374Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-EZdt27/commands.json","count":0}
{"ts":"2026-10-27T01:56:02.656Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:56:02.774Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:02.775Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:02.775Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:02.781Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-6i5PsW/commands.json","count":0}
{"ts":"2026-10-27T01:56:02.802Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:02.803Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:02.803Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:02.812Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-9U3v9w/commands.json","count":0}
{"ts":"2026-10-27T01:56:03.180Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:03.181Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:03.181Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:03.189Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-BeYn6d/commands.json","count":0}
{"ts":"2026-10-27T01:56:03.288Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:03.289Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:03.289Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:03.296Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-2EndhV/commands.json","count":0}
{"ts":"2026-10-27T01:56:03.598Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:56:03.750Z","level":"info","msg":"graph.auto: added","child":"83751618-0e29-415c-98c2-a5e70a157615","parent":"a94a9166-ed9e-4e42-aadd-43437354822c","links":2}
{"ts":"2026-10-27T01:56:04.315Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:04.317Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:04.317Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:04.324Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-sfBoFl/commands.json","count":0}
{"ts":"2026-10-27T01:56:04.337Z","level":"info","msg":"agent session attached","paneId":"967af685-65f7-46c4-a45d-2f122bfa9a94","kind":"claude","session":"e956d9ef","source":"hook"}
{"ts":"2026-10-27T01:56:04.702Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:56:04.735Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:04.736Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:04.736Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:04.742Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-N7HuOF/commands.json","count":0}
{"ts":"2026-10-27T01:56:04.862Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:04.862Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:04.863Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:04.866Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-rRo1vW/commands.json","count":0}
{"ts":"2026-10-27T01:56:04.965Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:04.965Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:04.966Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:04.971Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-BL7THs/commands.json","count":0}
{"ts":"2026-10-27T01:56:05.143Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:05.143Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:05.144Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:05.151Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-Z2JFmH/commands.json","count":0}
{"ts":"2026-10-27T01:56:05.301Z","level":"info","msg":"ask opened","askId":"7bf360be0491afb5819234d59058ee7d","paneId":"8cc9ca98-e264-494e-a455-eddd3e2b3c87","questions":1,"media":0}
{"ts":"2026-10-27T01:56:05.503Z","level":"info","msg":"ask closed","askId":"7bf360be0491afb5819234d59058ee7d","paneId":"8cc9ca98-e264-494e-a455-eddd3e2b3c87","status":"answered"}
{"ts":"2026-10-27T01:56:05.503Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"8cc9ca98-e264-494e-a455-eddd3e2b3c87","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:56:05.539Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:05.540Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:05.540Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:05.545Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-WCYaLX/commands.json","count":0}
{"ts":"2026-10-27T01:56:05.565Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:56:05.953Z","level":"info","msg":"ask opened","askId":"da78f35e398d57ceebe90d5a0f7edb24","paneId":"d828c0ba-a2b8-49de-bb61-61dc954351e1","questions":1,"media":0}
{"ts":"2026-10-27T01:56:05.974Z","level":"info","msg":"ask closed","askId":"da78f35e398d57ceebe90d5a0f7edb24","paneId":"d828c0ba-a2b8-49de-bb61-61dc954351e1","status":"answered"}
{"ts":"2026-10-27T01:56:05.975Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"d828c0ba-a2b8-49de-bb61-61dc954351e1","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:56:06.041Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:06.042Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:06.042Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:06.048Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-cvm4gT/commands.json","count":0}
{"ts":"2026-10-27T01:56:06.400Z","level":"info","msg":"graph.auto: added","child":"00126109-5172-4341-a99b-a3e44644568c","parent":"f89a84d5-71cf-4c7c-a3dd-4e52162b8129","links":2}
{"ts":"2026-10-27T01:56:06.476Z","level":"info","msg":"ask opened","askId":"83813ca46b5875d8fea55aace287553c","paneId":"2e66025f-7eda-4c4f-80d1-ae0e9678b9c2","questions":1,"media":0}
{"ts":"2026-10-27T01:56:06.497Z","level":"info","msg":"ask closed","askId":"83813ca46b5875d8fea55aace287553c","paneId":"2e66025f-7eda-4c4f-80d1-ae0e9678b9c2","status":"cancelled"}
{"ts":"2026-10-27T01:56:06.497Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"2e66025f-7eda-4c4f-80d1-ae0e9678b9c2","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:56:06.500Z","level":"info","msg":"ask opened","askId":"f5831e1e7bd215254c58d292fb2ee08f","paneId":"2e66025f-7eda-4c4f-80d1-ae0e9678b9c2","questions":1,"media":0}
{"ts":"2026-10-27T01:56:06.567Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"attention","reason":"リモートで soda serve が動いていません（リモートで起動してください）（soda: no running soda serve for session default）"}
{"ts":"2026-10-27T01:56:06.664Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:06.665Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:06.665Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:06.673Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-EPzKYK/commands.json","count":0}
{"ts":"2026-10-27T01:56:07.121Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:07.123Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:07.124Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:07.145Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-UpE3Kl/commands.json","count":0}
{"ts":"2026-10-27T01:56:07.379Z","level":"info","msg":"agent session attached","paneId":"b5d67e1e-eee3-4e64-b228-8480a0f7590f","kind":"claude","session":"01bc06e8","source":"hook"}
{"ts":"2026-10-27T01:56:07.501Z","level":"info","msg":"ask closed","askId":"f5831e1e7bd215254c58d292fb2ee08f","paneId":"2e66025f-7eda-4c4f-80d1-ae0e9678b9c2","status":"timeout"}
{"ts":"2026-10-27T01:56:07.501Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"2e66025f-7eda-4c4f-80d1-ae0e9678b9c2","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:56:07.558Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:07.559Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:07.559Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:07.565Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-hrZiKn/commands.json","count":0}
{"ts":"2026-10-27T01:56:07.949Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"e502729f-c454-45f3-b792-ede7588fbab9","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:56:07.999Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"e502729f-c454-45f3-b792-ede7588fbab9","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:56:08.020Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:08.021Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:08.021Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:08.027Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-9mmOYW/commands.json","count":0}
{"ts":"2026-10-27T01:56:08.483Z","level":"info","msg":"ask opened","askId":"f6f0a0ac4cc50807fb399220144a3e2d","paneId":"1c181063-e673-4b53-914c-465b6a7e1945","questions":1,"media":0}
{"ts":"2026-10-27T01:56:08.540Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"1c181063-e673-4b53-914c-465b6a7e1945","connId":"pane-socket:1","code":"ask_busy"}
{"ts":"2026-10-27T01:56:08.575Z","level":"info","msg":"ask closed","askId":"f6f0a0ac4cc50807fb399220144a3e2d","paneId":"1c181063-e673-4b53-914c-465b6a7e1945","status":"cancelled"}
{"ts":"2026-10-27T01:56:08.578Z","level":"info","msg":"ask opened","askId":"3b84f24201eca85cdae8d9561e7d0294","paneId":"1c181063-e673-4b53-914c-465b6a7e1945","questions":1,"media":0}
{"ts":"2026-10-27T01:56:08.601Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"1c181063-e673-4b53-914c-465b6a7e1945","connId":"pane-socket:3","code":"ask_busy"}
{"ts":"2026-10-27T01:56:08.603Z","level":"info","msg":"ask closed","askId":"3b84f24201eca85cdae8d9561e7d0294","paneId":"1c181063-e673-4b53-914c-465b6a7e1945","status":"cancelled"}
{"ts":"2026-10-27T01:56:08.629Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:08.630Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:08.630Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:08.635Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-mE6bPQ/commands.json","count":0}
{"ts":"2026-10-27T01:56:09.002Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.003Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.003Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:09.011Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-AQfgBw/commands.json","count":0}
{"ts":"2026-10-27T01:56:09.094Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"p99","connId":"pane-socket:1","code":"not_found"}
{"ts":"2026-10-27T01:56:09.110Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"bd23e4ea-7226-4b7b-9be0-821f6316776d","connId":"pane-socket:2","code":"invalid_params"}
{"ts":"2026-10-27T01:56:09.113Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"bd23e4ea-7226-4b7b-9be0-821f6316776d","connId":"pane-socket:3","code":"invalid_params"}
{"ts":"2026-10-27T01:56:09.115Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"bd23e4ea-7226-4b7b-9be0-821f6316776d","connId":"pane-socket:4","code":"invalid_ask_spec"}
{"ts":"2026-10-27T01:56:09.195Z","level":"info","msg":"ask opened","askId":"ac6099cb3c25490f1a7752321c206231","paneId":"bd23e4ea-7226-4b7b-9be0-821f6316776d","questions":1,"media":0}
{"ts":"2026-10-27T01:56:09.216Z","level":"info","msg":"ask closed","askId":"ac6099cb3c25490f1a7752321c206231","paneId":"bd23e4ea-7226-4b7b-9be0-821f6316776d","status":"cancelled"}
{"ts":"2026-10-27T01:56:09.243Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.244Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.244Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:09.249Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-cHwxfv/commands.json","count":0}
{"ts":"2026-10-27T01:56:09.264Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.265Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.265Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:09.275Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-4VyZZW/commands.json","count":0}
{"ts":"2026-10-27T01:56:09.414Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.415Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.415Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:09.421Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-xKhA9S/commands.json","count":0}
{"ts":"2026-10-27T01:56:09.663Z","level":"info","msg":"ask opened","askId":"c7d1a7a23b1a19fb00008bbbb559e3d7","paneId":"4e02a460-aeae-4e28-824d-e8cb7af1d9e6","questions":1,"media":0}
{"ts":"2026-10-27T01:56:09.683Z","level":"info","msg":"ask closed","askId":"c7d1a7a23b1a19fb00008bbbb559e3d7","paneId":"4e02a460-aeae-4e28-824d-e8cb7af1d9e6","status":"cancelled"}
{"ts":"2026-10-27T01:56:09.792Z","level":"info","msg":"ask opened","askId":"46136201751060560ed48b840c591fd1","paneId":"4e02a460-aeae-4e28-824d-e8cb7af1d9e6","questions":1,"media":0}
{"ts":"2026-10-27T01:56:09.812Z","level":"info","msg":"ask closed","askId":"46136201751060560ed48b840c591fd1","paneId":"4e02a460-aeae-4e28-824d-e8cb7af1d9e6","status":"cancelled"}
{"ts":"2026-10-27T01:56:09.843Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.844Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:09.844Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:09.852Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-61D4vU/commands.json","count":0}
{"ts":"2026-10-27T01:56:09.976Z","level":"info","msg":"ask opened","askId":"e1ef4728b9f190f7d8d24da65ba159f7","paneId":"c526ce90-52f6-4e41-aebe-08036de88ca5","questions":1,"media":0}
{"ts":"2026-10-27T01:56:10.030Z","level":"info","msg":"ask closed","askId":"e1ef4728b9f190f7d8d24da65ba159f7","paneId":"c526ce90-52f6-4e41-aebe-08036de88ca5","status":"answered"}
{"ts":"2026-10-27T01:56:10.036Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:56:10.094Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:10.095Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:10.095Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:10.118Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-onUHX4/commands.json","count":0}
{"ts":"2026-10-27T01:56:10.238Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.239Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.240Z","level":"info","msg":"pane socket: request","op":"agent.send_keys","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.241Z","level":"info","msg":"pane socket: request","op":"workspace.create","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:4","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.242Z","level":"info","msg":"pane socket: request","op":"pane.rename","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:5","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.243Z","level":"info","msg":"pane socket: request","op":"ask.subscribe","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:6","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.244Z","level":"info","msg":"pane socket: request","op":"agent.fork","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:7","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.244Z","level":"info","msg":"pane socket: request","op":"agent.fork_preview","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:8","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.245Z","level":"info","msg":"pane socket: request","op":"agent.usage","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:9","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.245Z","level":"info","msg":"pane socket: request","op":"agent.usage_watch","paneId":"a8efcfd5-4f54-4438-93cc-49091fb6b3ce","connId":"pane-socket:10","code":"unknown_op"}
{"ts":"2026-10-27T01:56:10.510Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:10.511Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:10.511Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:10.518Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-7IsStd/commands.json","count":0}
{"ts":"2026-10-27T01:56:10.725Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:10.726Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:10.726Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:10.734Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-T9pBn1/commands.json","count":0}
{"ts":"2026-10-27T01:56:11.061Z","level":"info","msg":"display set","paneId":"22471510-6331-4166-819a-b01ee4ba8347","name":"two","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T01:56:11.147Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:11.147Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:11.147Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:11.154Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-HWGFAW/commands.json","count":0}
{"ts":"2026-10-27T01:56:11.210Z","level":"info","msg":"display set","paneId":"22471510-6331-4166-819a-b01ee4ba8347","name":"quotes","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T01:56:11.390Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:56:11.421Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:11.422Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:11.422Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:11.430Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-TIVsPS/commands.json","count":0}
{"ts":"2026-10-27T01:56:11.746Z","level":"info","msg":"graph.auto: added","child":"7dd67b7d-79d9-4c52-97a3-0b668314f10c","parent":"3e871223-1fa4-4cc4-b895-6fb4ad72ae4d","links":2}
{"ts":"2026-10-27T01:56:11.805Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:11.806Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:11.807Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:11.815Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-JOQ7bg/commands.json","count":0}
{"ts":"2026-10-27T01:56:11.849Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:11.862Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:11.863Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:11.876Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-wJAO67/commands.json","count":0}
{"ts":"2026-10-27T01:56:12.158Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"a29e2662-a159-459a-aa87-8ede487faee7","connId":"pane-socket:1","code":"not_found"}
{"ts":"2026-10-27T01:56:12.162Z","level":"info","msg":"ask opened","askId":"d3e4bb108b8b0d755f4c8714068be8e5","paneId":"a29e2662-a159-459a-aa87-8ede487faee7","questions":1,"media":0}
{"ts":"2026-10-27T01:56:12.183Z","level":"info","msg":"ask closed","askId":"d3e4bb108b8b0d755f4c8714068be8e5","paneId":"a29e2662-a159-459a-aa87-8ede487faee7","status":"cancelled"}
{"ts":"2026-10-27T01:56:12.219Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:12.220Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:12.220Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:12.226Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-Lv8if7/commands.json","count":0}
{"ts":"2026-10-27T01:56:12.480Z","level":"info","msg":"ask opened","askId":"c46b6a9e4d0c9878eb2e42b7c4514df8","paneId":"75faf929-8e0e-426a-9d19-82cade6cdaf3","questions":1,"media":2}
{"ts":"2026-10-27T01:56:12.534Z","level":"info","msg":"ask closed","askId":"c46b6a9e4d0c9878eb2e42b7c4514df8","paneId":"75faf929-8e0e-426a-9d19-82cade6cdaf3","status":"cancelled"}
{"ts":"2026-10-27T01:56:12.538Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:56:12.569Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:12.570Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:12.570Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:12.581Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-1QAJnk/commands.json","count":0}
{"ts":"2026-10-27T01:56:12.600Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:12.601Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:12.601Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:12.610Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-956LyN/commands.json","count":0}
{"ts":"2026-10-27T01:56:12.660Z","level":"info","msg":"ask opened","askId":"fa0bf3fdfe182efbaee4fe0acf0e833f","paneId":"722917a8-eb08-48a0-9987-8ad3bdb12abe","questions":1,"media":0}
{"ts":"2026-10-27T01:56:12.680Z","level":"info","msg":"ask closed","askId":"fa0bf3fdfe182efbaee4fe0acf0e833f","paneId":"722917a8-eb08-48a0-9987-8ad3bdb12abe","status":"cancelled"}
{"ts":"2026-10-27T01:56:12.786Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:12.787Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:12.787Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:12.795Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-mDI7mV/commands.json","count":0}
{"ts":"2026-10-27T01:56:13.024Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:13.026Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:13.027Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:13.052Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-yqlnMT/commands.json","count":0}
{"ts":"2026-10-27T01:56:13.159Z","level":"warn","msg":"cannot start the pane socket; `sodactl ask` in a pane needs a login","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-psock-mDI7mV/.p-INqXRb/s' -> '/tmp/soda-psock-mDI7mV/pane.sock'"}
{"ts":"2026-10-27T01:56:13.258Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:13.261Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:13.261Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:13.271Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-LF6un4/commands.json","count":0}
{"ts":"2026-10-27T01:56:13.325Z","level":"info","msg":"agent session attached","paneId":"4760defc-d745-4d65-b59e-c4040c40edb9","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:13.681Z","level":"info","msg":"ask opened","askId":"bdb320d2b963ad4294a31ef96a13185b","paneId":"f1070653-b9c7-4f52-b99a-50611cb2ab79","questions":1,"media":0}
{"ts":"2026-10-27T01:56:13.701Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"f1070653-b9c7-4f52-b99a-50611cb2ab79","connId":"pane-socket:2","code":"invalid_ask_spec"}
{"ts":"2026-10-27T01:56:13.702Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"f1070653-b9c7-4f52-b99a-50611cb2ab79","connId":"pane-socket:3","code":"invalid_params"}
{"ts":"2026-10-27T01:56:13.703Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"f1070653-b9c7-4f52-b99a-50611cb2ab79","connId":"pane-socket:4","code":"unknown_op"}
{"ts":"2026-10-27T01:56:13.704Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"p99","connId":"pane-socket:5","code":"not_found"}
{"ts":"2026-10-27T01:56:13.704Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:56:13.705Z","level":"info","msg":"ask closed","askId":"bdb320d2b963ad4294a31ef96a13185b","paneId":"f1070653-b9c7-4f52-b99a-50611cb2ab79","status":"answered"}
{"ts":"2026-10-27T01:56:13.705Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"f1070653-b9c7-4f52-b99a-50611cb2ab79","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:56:14.167Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:14.168Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:14.168Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:14.175Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-bxIrtY/commands.json","count":0}
{"ts":"2026-10-27T01:56:14.865Z","level":"info","msg":"agent session attached","paneId":"9533b214-1ede-4f5e-aa0c-968fad2caaa3","kind":"claude","session":"../../et","source":"hook"}
{"ts":"2026-10-27T01:56:15.428Z","level":"info","msg":"graph.auto: added","child":"3fcc11ab-891e-47b3-ad2c-d431cc75ea02","parent":"708349c0-79ca-479d-829a-91d375602c79","links":2}
{"ts":"2026-10-27T01:56:15.494Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:15.495Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:15.495Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:15.499Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:15.499Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:15.500Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:15.503Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-ikP80o/commands.json","count":0}
{"ts":"2026-10-27T01:56:15.508Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-4BdME6/commands.json","count":0}
{"ts":"2026-10-27T01:56:16.082Z","level":"info","msg":"agent session attached","paneId":"727cf348-209c-47d0-82be-7e78dc487129","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:17.439Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:727cf348-209c-47d0-82be-7e78dc487129"]}
{"ts":"2026-10-27T01:56:18.558Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:18.559Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:18.560Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:18.573Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-kTuh9u/commands.json","count":0}
{"ts":"2026-10-27T01:56:19.339Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:8f4797e9-ec13-43c7-96eb-908fb7e5d635"]}
{"ts":"2026-10-27T01:56:19.437Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:19.439Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:19.440Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:19.469Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-oMfBir/commands.json","count":0}
{"ts":"2026-10-27T01:56:20.075Z","level":"info","msg":"agent session attached","paneId":"a779306c-f834-443a-9019-96eebbe64874","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:20.141Z","level":"info","msg":"graph.auto: added","child":"0010ffd6-b5c2-4946-92a7-7b059801aa4e","parent":"405cbe74-42be-420c-904e-eb832829ea30","links":2}
{"ts":"2026-10-27T01:56:21.431Z","level":"info","msg":"graph.auto: added","child":"e2af42eb-c2bd-4467-9a5f-87f9275bd964","parent":"405cbe74-42be-420c-904e-eb832829ea30","links":2}
{"ts":"2026-10-27T01:56:21.618Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:21.619Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:21.619Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:21.629Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-2olPSL/commands.json","count":0}
{"ts":"2026-10-27T01:56:21.690Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:21.691Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:21.692Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:21.699Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-Lu8yJh/commands.json","count":0}
{"ts":"2026-10-27T01:56:23.005Z","level":"info","msg":"agent session attached","paneId":"dba4efee-ba68-41b6-b94b-6983e16d5e6c","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T01:56:23.049Z","level":"info","msg":"graph.auto: skipped","child":"b3e69cdb-371f-43c9-a6ce-6846eb589f32","parent":"e1d3a923-162b-49e3-86ea-27303ab42904","reason":"duplicate_link"}
{"ts":"2026-10-27T01:56:23.049Z","level":"info","msg":"graph.auto: added","child":"b3e69cdb-371f-43c9-a6ce-6846eb589f32","parent":"e1d3a923-162b-49e3-86ea-27303ab42904","links":1}
{"ts":"2026-10-27T01:56:23.086Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:23.087Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:23.087Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:23.094Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-Q7MXUN/commands.json","count":0}
{"ts":"2026-10-27T01:56:23.442Z","level":"info","msg":"agent report ignored","paneId":"dba4efee-ba68-41b6-b94b-6983e16d5e6c","kind":"claude","session":"conv-chi","reason":"the reporting process is not the pane's front agent (a nested or unrelated process)","agentPid":1461138}
{"ts":"2026-10-27T01:56:23.509Z","level":"info","msg":"agent session attached","paneId":"dba4efee-ba68-41b6-b94b-6983e16d5e6c","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T01:56:23.538Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:23.538Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:23.539Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:23.544Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-VqD0Ck/commands.json","count":0}
{"ts":"2026-10-27T01:56:24.088Z","level":"info","msg":"agent session attached","paneId":"85d7d8c3-7375-4ef9-a6dd-018b21846958","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T01:56:24.089Z","level":"info","msg":"agent report ignored","paneId":"85d7d8c3-7375-4ef9-a6dd-018b21846958","kind":"claude","session":"conv-dae","reason":"the reporting process is not a descendant of the pane's shell","agentPid":1461076}
{"ts":"2026-10-27T01:56:24.618Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:24.619Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:24.619Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:24.626Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-Drfj2G/commands.json","count":0}
{"ts":"2026-10-27T01:56:24.815Z","level":"info","msg":"graph.auto: skipped","child":"e49505ed-8f2b-412c-ba3b-50dff1055168","parent":"912d40f1-2ef9-4593-84a3-59271b4515a8","reason":"supervisor_taken"}
{"ts":"2026-10-27T01:56:24.815Z","level":"info","msg":"graph.auto: added","child":"e49505ed-8f2b-412c-ba3b-50dff1055168","parent":"912d40f1-2ef9-4593-84a3-59271b4515a8","links":1}
{"ts":"2026-10-27T01:56:24.897Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:24.898Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:24.898Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:24.909Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-oYm5f7/commands.json","count":0}
{"ts":"2026-10-27T01:56:25.179Z","level":"info","msg":"agent session attached","paneId":"adfafdc0-939c-4c35-954a-e97d90067842","kind":"claude","session":"conv-nop","source":"hook"}
{"ts":"2026-10-27T01:56:25.229Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:25.230Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:25.230Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:25.241Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-4e6Gfi/commands.json","count":0}
{"ts":"2026-10-27T01:56:25.943Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:25.944Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:25.944Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:25.952Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-MOg0KQ/commands.json","count":0}
{"ts":"2026-10-27T01:56:26.398Z","level":"info","msg":"agent session attached","paneId":"54200175-5dc4-4e05-8b6b-cfbdb1ac5af7","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T01:56:26.399Z","level":"info","msg":"agent report ignored","paneId":"54200175-5dc4-4e05-8b6b-cfbdb1ac5af7","kind":"claude","reason":"the reporting process is not the pane's front agent (a nested or unrelated process)","agentPid":1461358}
{"ts":"2026-10-27T01:56:26.519Z","level":"info","msg":"agent session attached","paneId":"f55ae626-ef15-4805-899c-ae9fce5f1c5c","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:27.027Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:27.027Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:27.027Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:27.033Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-wcDkE4/commands.json","count":0}
{"ts":"2026-10-27T01:56:27.429Z","level":"info","msg":"graph.auto: added","child":"6050d8be-21db-4464-a226-aeb1e77590f0","parent":"a0e87a99-3e13-441a-a6a5-db4321d32fca","links":2}
{"ts":"2026-10-27T01:56:27.578Z","level":"info","msg":"agent session attached","paneId":"4051cfcd-b431-4a4d-b7e7-2ad3b690668f","kind":"claude","session":"conv-fir","source":"hook"}
{"ts":"2026-10-27T01:56:28.331Z","level":"info","msg":"agent session dropped (a different agent started without reporting)","paneId":"4051cfcd-b431-4a4d-b7e7-2ad3b690668f","kind":"claude","session":"conv-fir","sinceGoneMs":586.6394549999995}
{"ts":"2026-10-27T01:56:28.384Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:28.385Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:28.385Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:28.391Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-pA8LGT/commands.json","count":0}
{"ts":"2026-10-27T01:56:29.037Z","level":"info","msg":"agent session attached","paneId":"aa2536d1-fbee-41f5-bc36-6a6575b723a4","kind":"codex","session":"01a1235d","source":"sole-codex"}
{"ts":"2026-10-27T01:56:29.096Z","level":"info","msg":"graph.auto: added","child":"d0348206-574b-4817-a634-079bcf432926","parent":"a0e87a99-3e13-441a-a6a5-db4321d32fca","links":2}
{"ts":"2026-10-27T01:56:29.118Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:29.119Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:29.119Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:29.126Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-rCzzyz/commands.json","count":0}
{"ts":"2026-10-27T01:56:29.155Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:29.156Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:29.156Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:29.168Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-97LG8e/state-iamxOg/commands.json","count":0}
{"ts":"2026-10-27T01:56:29.701Z","level":"info","msg":"agent report ignored","paneId":"5eb92039-4aae-4a9a-a651-13b9f36007c2","kind":"codex","session":"01a1235d","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): its cwd is not the pane's","agentPid":1461076}
{"ts":"2026-10-27T01:56:29.702Z","level":"info","msg":"agent report ignored","paneId":"5eb92039-4aae-4a9a-a651-13b9f36007c2","kind":"codex","session":"01a1235d","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): the report carries no cwd","agentPid":1461076}
{"ts":"2026-10-27T01:56:30.263Z","level":"info","msg":"agent session attached","paneId":"5eb92039-4aae-4a9a-a651-13b9f36007c2","kind":"codex","session":"01a1235d","source":"sole-codex"}
{"ts":"2026-10-27T01:56:30.338Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:30.339Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:30.339Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:30.341Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:217c08fd-62b7-4112-8438-e054b00090f6"]}
{"ts":"2026-10-27T01:56:30.347Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-nFlBCT/commands.json","count":0}
{"ts":"2026-10-27T01:56:31.007Z","level":"info","msg":"graph.auto: skipped","child":"ddb631ab-2aa6-4160-8d5d-1c5cec251e49","parent":"217c08fd-62b7-4112-8438-e054b00090f6","reason":"parent_gone"}
{"ts":"2026-10-27T01:56:32.197Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:32.199Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:32.199Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:32.208Z","level":"info","msg":"agent report ignored","paneId":"b6c0ee7b-a2f7-4aaa-900e-03ed8036d21d","kind":"codex","session":"codex-tw","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1461076}
{"ts":"2026-10-27T01:56:32.209Z","level":"info","msg":"agent report ignored","paneId":"41618c9f-d955-4f29-a09e-eff40aaedb48","kind":"codex","session":"codex-tw","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1461076}
{"ts":"2026-10-27T01:56:32.210Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-yj7LyX/commands.json","count":0}
{"ts":"2026-10-27T01:56:32.651Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:32.652Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:32.652Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:32.656Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-yj7LyX/commands.json","count":0}
{"ts":"2026-10-27T01:56:32.675Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":38227}
{"ts":"2026-10-27T01:56:32.693Z","level":"info","msg":"handoff: complete","id":"abcdef01","adopted":1,"dropped":0}
{"ts":"2026-10-27T01:56:32.833Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:32.834Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:32.834Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:32.838Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-mNKr6o/commands.json","count":0}
{"ts":"2026-10-27T01:56:32.879Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:32.880Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:32.881Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:32.889Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-sAor8M/commands.json","count":0}
{"ts":"2026-10-27T01:56:33.242Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:33.242Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:33.242Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:33.246Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-mNKr6o/commands.json","count":0}
{"ts":"2026-10-27T01:56:33.249Z","level":"warn","msg":"handoff: closed terminals that were not part of the handoff","closed":1}
{"ts":"2026-10-27T01:56:33.249Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":38643}
{"ts":"2026-10-27T01:56:33.259Z","level":"info","msg":"handoff: complete","id":"abcdef04","adopted":1,"dropped":0}
{"ts":"2026-10-27T01:56:33.316Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:33.317Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:33.317Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:33.321Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-9917Yl/commands.json","count":0}
{"ts":"2026-10-27T01:56:33.799Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:33.800Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:33.800Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:33.805Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-9917Yl/commands.json","count":0}
{"ts":"2026-10-27T01:56:33.808Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":41995}
{"ts":"2026-10-27T01:56:34.119Z","level":"info","msg":"agent resume skipped","paneId":"ef4821a7-24e0-4f29-857d-562cb5c5abbb","reason":"no-session-ref"}
{"ts":"2026-10-27T01:56:34.120Z","level":"warn","msg":"handoff: some handed-off panes were not usable and were closed","reason":"written by pid 1461898, not 1461897","panes":["ef4821a7-24e0-4f29-857d-562cb5c5abbb"]}
{"ts":"2026-10-27T01:56:34.120Z","level":"info","msg":"handoff: complete","id":"abcdef02","adopted":0,"dropped":1}
{"ts":"2026-10-27T01:56:34.467Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:34.467Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:34.467Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:34.472Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-vnG74k/commands.json","count":0}
{"ts":"2026-10-27T01:56:34.477Z","level":"info","msg":"agent session attached","paneId":"5fe09e17-bb38-40df-b52c-44fc9a624efc","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T01:56:34.529Z","level":"info","msg":"agent session attached","paneId":"5609dc87-426c-425a-90c1-e4eaa5990679","kind":"codex","session":"01a1234a","source":"first-turn"}
{"ts":"2026-10-27T01:56:34.653Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:34.654Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:34.654Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:34.661Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-TvX9oj/commands.json","count":0}
{"ts":"2026-10-27T01:56:34.860Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:34.861Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:34.861Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:34.866Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-vnG74k/commands.json","count":0}
{"ts":"2026-10-27T01:56:34.870Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":37211}
{"ts":"2026-10-27T01:56:35.181Z","level":"info","msg":"agent resume skipped","paneId":"53948925-b118-46bd-b9f8-168076d7aa04","reason":"no-session-ref"}
{"ts":"2026-10-27T01:56:35.182Z","level":"info","msg":"handoff: complete","id":"abcdef03","adopted":0,"dropped":1}
{"ts":"2026-10-27T01:56:35.182Z","level":"warn","msg":"handoff: some handed-off panes were not usable and were closed","reason":"not a pty master","panes":["53948925-b118-46bd-b9f8-168076d7aa04"]}
{"ts":"2026-10-27T01:56:35.721Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:35.722Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:35.722Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:35.729Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-53FlRK/commands.json","count":0}
{"ts":"2026-10-27T01:56:36.088Z","level":"info","msg":"agent report ignored","paneId":"0ef3a595-e497-4885-b219-7a4973297820","kind":"codex","session":"01a12341","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 2 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1461076}
{"ts":"2026-10-27T01:56:36.121Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:36.122Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:36.122Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:36.128Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-53FlRK/commands.json","count":0}
{"ts":"2026-10-27T01:56:36.131Z","level":"error","msg":"handoff: the handoff data was unusable; closed the handed-off terminals and starting normally","reason":"cannot read /tmp/soda-handoff-compose-53FlRK/handoff.json: ENOENT","closed":1}
{"ts":"2026-10-27T01:56:36.444Z","level":"info","msg":"agent resume skipped","paneId":"aaf1ad7c-5f90-42b2-ab73-fd8522017d24","reason":"no-session-ref"}
{"ts":"2026-10-27T01:56:36.557Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:36.558Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:36.558Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:36.563Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-psock-7VqJyt/commands.json","count":0}
{"ts":"2026-10-27T01:56:36.951Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:36.962Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:36.963Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:36.978Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-v2Qpaq/commands.json","count":0}
{"ts":"2026-10-27T01:56:37.103Z","level":"info","msg":"ask opened","askId":"e5ad40c545b469689ed1786c5aefbe46","paneId":"2627642e-2a73-4560-bba1-cc4c884c020c","questions":1,"media":0}
{"ts":"2026-10-27T01:56:37.106Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T01:56:37.107Z","level":"info","msg":"ask closed","askId":"e5ad40c545b469689ed1786c5aefbe46","paneId":"2627642e-2a73-4560-bba1-cc4c884c020c","status":"cancelled"}
{"ts":"2026-10-27T01:56:37.110Z","level":"info","msg":"pane socket: refused a connection","code":"pane_socket_busy"}
{"ts":"2026-10-27T01:56:37.120Z","level":"info","msg":"handoff: replacing this server with the version on disk","id":"bbc76b09dee153ae","panes":1}
{"ts":"2026-10-27T01:56:37.121Z","level":"info","msg":"pane socket: refused a connection","code":"pane_socket_busy"}
{"ts":"2026-10-27T01:56:37.121Z","level":"error","msg":"handoff: execve failed; keeping the current server","error":"execve refused by the test"}
{"ts":"2026-10-27T01:56:37.142Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"2627642e-2a73-4560-bba1-cc4c884c020c","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T01:56:37.841Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:37.844Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:37.844Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:37.852Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-ivOaA8/commands.json","count":0}
{"ts":"2026-10-27T01:56:38.627Z","level":"info","msg":"agent report ignored","paneId":"1334c598-783c-48d3-a5f3-65d00de03893","kind":"codex","session":"01a12326","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1461076}
{"ts":"2026-10-27T01:56:38.752Z","level":"info","msg":"agent session attached","paneId":"f16b687e-6983-4890-94d0-444a37050383","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:39.319Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:39.320Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:39.320Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:39.327Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-5dVdGk/commands.json","count":0}
{"ts":"2026-10-27T01:56:39.895Z","level":"info","msg":"agent session attached","paneId":"1c503b8d-2665-40e1-9be1-64d6e76cbcea","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:40.383Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:40.384Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:40.384Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:40.392Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-6X1Ahh/commands.json","count":0}
{"ts":"2026-10-27T01:56:40.618Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:40.619Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:40.619Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:40.630Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-vamu1e/commands.json","count":0}
{"ts":"2026-10-27T01:56:40.853Z","level":"info","msg":"agent report ignored","paneId":"1334c598-783c-48d3-a5f3-65d00de03893","kind":"codex","session":"01a1234a","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): the session record could not be checked","agentPid":1461076}
{"ts":"2026-10-27T01:56:40.917Z","level":"info","msg":"agent session attached","paneId":"6403214d-f046-4166-beae-7a3c65360ce0","kind":"codex","session":"01a12341","source":"argv"}
{"ts":"2026-10-27T01:56:40.984Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:40.984Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:40.984Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:40.993Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-Xh8uYt/commands.json","count":0}
{"ts":"2026-10-27T01:56:41.217Z","level":"info","msg":"agent session attached","paneId":"29ae4f3d-e2af-448b-902f-9e25daa500d4","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:42.698Z","level":"info","msg":"agent session attached","paneId":"ae3e11f4-2d03-4e1c-807f-a83dcf768ffe","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T01:56:43.638Z","level":"info","msg":"agent session dropped (a different agent started without reporting)","paneId":"ae3e11f4-2d03-4e1c-807f-a83dcf768ffe","kind":"codex","session":"01a12341","sinceGoneMs":701.3945859999985}
{"ts":"2026-10-27T01:56:43.639Z","level":"info","msg":"agent session attached","paneId":"ae3e11f4-2d03-4e1c-807f-a83dcf768ffe","kind":"codex","session":"01a1234a","source":"argv"}
{"ts":"2026-10-27T01:56:43.715Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:43.716Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:43.716Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:43.724Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-Y8AD8K/commands.json","count":0}
{"ts":"2026-10-27T01:56:45.041Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:45.042Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:45.043Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:45.052Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-PANdMg/commands.json","count":0}
{"ts":"2026-10-27T01:56:45.199Z","level":"info","msg":"agent session attached","paneId":"857fcb7f-a013-4f1f-83f8-74fb17d73cee","kind":"codex","session":"01a12326","source":"exit-text"}
{"ts":"2026-10-27T01:56:45.244Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:45.245Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:45.245Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:45.254Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-emk9EI/commands.json","count":0}
{"ts":"2026-10-27T01:56:45.662Z","level":"info","msg":"agent session attached","paneId":"0d346185-5ae5-48cd-8444-27da9e475f47","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:46.860Z","level":"info","msg":"agent session attached","paneId":"6f4c60d8-28d4-42df-bdf7-e674fe270efa","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T01:56:46.952Z","level":"info","msg":"agent session attached","paneId":"ea310b61-b50b-47cb-ad32-662788327ed2","kind":"codex","session":"01a1234a","source":"first-turn"}
{"ts":"2026-10-27T01:56:47.270Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:47.271Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:47.271Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:47.296Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-jL1uwS/state-emk9EI/commands.json","count":0}
{"ts":"2026-10-27T01:56:47.436Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:47.439Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:47.439Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:47.449Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-tui-it-T5TeHF/state/commands.json","count":0}
{"ts":"2026-10-27T01:56:47.631Z","level":"info","msg":"agent resume command written","paneId":"ea310b61-b50b-47cb-ad32-662788327ed2","kind":"codex","session":"01a1234a"}
{"ts":"2026-10-27T01:56:47.938Z","level":"info","msg":"agent resume command written","paneId":"6f4c60d8-28d4-42df-bdf7-e674fe270efa","kind":"codex","session":"01a12341"}
{"ts":"2026-10-27T01:56:51.225Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:c61c3a7e-feff-4914-99b6-388ead6fc074"]}
{"ts":"2026-10-27T01:56:51.823Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:51.826Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:51.826Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:51.834Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-CYkFuD/commands.json","count":0}
{"ts":"2026-10-27T01:56:52.644Z","level":"info","msg":"ask opened","askId":"b554b2465b450792f337591029718266","paneId":"b6669486-5585-43a5-86fb-82e4f9b07b43","questions":1,"media":0}
{"ts":"2026-10-27T01:56:52.670Z","level":"info","msg":"ask closed","askId":"b554b2465b450792f337591029718266","paneId":"b6669486-5585-43a5-86fb-82e4f9b07b43","status":"answered"}
{"ts":"2026-10-27T01:56:52.742Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:52.743Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:52.743Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:52.743Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:52.743Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:52.743Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:52.750Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-tF4v2o/commands.json","count":0}
{"ts":"2026-10-27T01:56:52.751Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-kdJL8Q/commands.json","count":0}
{"ts":"2026-10-27T01:56:53.371Z","level":"info","msg":"ask opened","askId":"0772ac6ba3a5654e27e00f35ba503ded","paneId":"66f90b9a-ec63-4352-88dd-d791c84a7300","questions":13,"media":0}
{"ts":"2026-10-27T01:56:53.385Z","level":"info","msg":"agent session attached","paneId":"5ca3169e-748e-4ad8-bc80-d24063375ce9","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:53.414Z","level":"info","msg":"ask closed","askId":"0772ac6ba3a5654e27e00f35ba503ded","paneId":"66f90b9a-ec63-4352-88dd-d791c84a7300","status":"answered"}
{"ts":"2026-10-27T01:56:53.477Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:53.478Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:53.478Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:53.499Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-hVn3zG/commands.json","count":0}
{"ts":"2026-10-27T01:56:54.145Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:54.146Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:54.146Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:54.155Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-8BvjlA/commands.json","count":0}
{"ts":"2026-10-27T01:56:54.173Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:54.174Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:54.175Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:54.184Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-4mqGCA/commands.json","count":0}
{"ts":"2026-10-27T01:56:54.840Z","level":"info","msg":"agent session attached","paneId":"e481c6b8-3ab4-4feb-b968-17d83ccd446d","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:54.847Z","level":"info","msg":"ask opened","askId":"2909c94143dae5afa681af8c4462279f","paneId":"0e702cf5-152f-4fdd-b567-a4417a9293b8","questions":1,"media":0}
{"ts":"2026-10-27T01:56:54.873Z","level":"info","msg":"ask closed","askId":"2909c94143dae5afa681af8c4462279f","paneId":"0e702cf5-152f-4fdd-b567-a4417a9293b8","status":"cancelled"}
{"ts":"2026-10-27T01:56:54.910Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:54.911Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:54.911Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:54.920Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-wmTx7O/commands.json","count":0}
{"ts":"2026-10-27T01:56:55.390Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:55.391Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:55.391Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:55.399Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-jhFCyX/commands.json","count":0}
{"ts":"2026-10-27T01:56:55.555Z","level":"info","msg":"ask opened","askId":"b9e2aae89cd39bd584fe365bf3c6fcba","paneId":"91783625-5b22-40b7-b6cd-a98d47608e2e","questions":1,"media":0}
{"ts":"2026-10-27T01:56:55.632Z","level":"info","msg":"ask closed","askId":"b9e2aae89cd39bd584fe365bf3c6fcba","paneId":"91783625-5b22-40b7-b6cd-a98d47608e2e","status":"cancelled"}
{"ts":"2026-10-27T01:56:55.666Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:55.667Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:55.667Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:55.675Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-aatBcv/commands.json","count":0}
{"ts":"2026-10-27T01:56:56.075Z","level":"info","msg":"agent session attached","paneId":"b1082b0c-1028-4c42-b03c-649837c46443","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:56.282Z","level":"info","msg":"ask opened","askId":"1019bc40ed71eecb4c7bf69d87d07fd8","paneId":"55019928-771c-43cb-b362-8d26f87d837f","questions":3,"media":0}
{"ts":"2026-10-27T01:56:56.350Z","level":"info","msg":"ask closed","askId":"1019bc40ed71eecb4c7bf69d87d07fd8","paneId":"55019928-771c-43cb-b362-8d26f87d837f","status":"answered"}
{"ts":"2026-10-27T01:56:56.459Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:56.460Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:56.460Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:56.471Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-Z7UDCB/commands.json","count":0}
{"ts":"2026-10-27T01:56:56.725Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:56.727Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:56.727Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:56.732Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-DdtVrE/commands.json","count":0}
{"ts":"2026-10-27T01:56:57.073Z","level":"info","msg":"ask opened","askId":"023d93cf0d2ac37cc4e9e2fbbc21429b","paneId":"02b13aa8-1be7-47fb-849e-9d447966c2b1","questions":1,"media":0}
{"ts":"2026-10-27T01:56:57.147Z","level":"info","msg":"ask closed","askId":"023d93cf0d2ac37cc4e9e2fbbc21429b","paneId":"02b13aa8-1be7-47fb-849e-9d447966c2b1","status":"answered"}
{"ts":"2026-10-27T01:56:57.230Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:57.232Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:57.233Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:57.256Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-QSBrvL/commands.json","count":0}
{"ts":"2026-10-27T01:56:57.519Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:57.519Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:57.520Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:57.525Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-ixCBCC/commands.json","count":0}
{"ts":"2026-10-27T01:56:57.805Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:57.806Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:57.806Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:57.815Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-mLUOtK/commands.json","count":0}
{"ts":"2026-10-27T01:56:57.842Z","level":"info","msg":"ask opened","askId":"efdb400e0be299f0c4265e95dde217b7","paneId":"e88543aa-d3d3-4eb7-9e9d-dc44349bae09","questions":1,"media":0}
{"ts":"2026-10-27T01:56:57.863Z","level":"info","msg":"ask closed","askId":"efdb400e0be299f0c4265e95dde217b7","paneId":"e88543aa-d3d3-4eb7-9e9d-dc44349bae09","status":"cancelled"}
{"ts":"2026-10-27T01:56:57.943Z","level":"info","msg":"display script enabled","byClientId":"751e0321-3ad4-4d97-a290-c9bb79a78ccb","byKind":"external"}
{"ts":"2026-10-27T01:56:57.997Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:57.998Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:57.998Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:58.004Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-CffxSD/commands.json","count":0}
{"ts":"2026-10-27T01:56:58.399Z","level":"info","msg":"ask opened","askId":"c8c97b8b5e6e2ff352d2c7b70cf61751","paneId":"29692fb8-ab57-46c1-906d-4b72066ba5fd","questions":1,"media":0}
{"ts":"2026-10-27T01:56:58.439Z","level":"info","msg":"agent session attached","paneId":"3ba672da-70cc-43fd-8be5-4d1debe17a79","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:56:58.451Z","level":"info","msg":"ask closed","askId":"c8c97b8b5e6e2ff352d2c7b70cf61751","paneId":"29692fb8-ab57-46c1-906d-4b72066ba5fd","status":"cancelled"}
{"ts":"2026-10-27T01:56:58.458Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:29692fb8-ab57-46c1-906d-4b72066ba5fd"]}
{"ts":"2026-10-27T01:56:58.517Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:58.518Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:58.518Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:58.530Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-NdA8Ej/commands.json","count":0}
{"ts":"2026-10-27T01:56:58.638Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:58.639Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:58.639Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:58.647Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-gxAaDO/commands.json","count":0}
{"ts":"2026-10-27T01:56:58.993Z","level":"info","msg":"agent report ignored","paneId":"3ba672da-70cc-43fd-8be5-4d1debe17a79","kind":"claude","session":"3e81f9a7","reason":"the reporting process is not a descendant of the pane's shell","agentPid":1462515}
{"ts":"2026-10-27T01:56:59.129Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.130Z","level":"info","msg":"ask opened","askId":"434b67b6687ada28daf226265bf10375","paneId":"e0b568bb-5328-43a8-bbba-c6896a9204e9","questions":1,"media":0}
{"ts":"2026-10-27T01:56:59.130Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.130Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:59.139Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-gxAaDO/commands.json","count":0}
{"ts":"2026-10-27T01:56:59.155Z","level":"info","msg":"ask closed","askId":"434b67b6687ada28daf226265bf10375","paneId":"e0b568bb-5328-43a8-bbba-c6896a9204e9","status":"cancelled"}
{"ts":"2026-10-27T01:56:59.190Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.191Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.191Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:59.201Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-AIFgpj/commands.json","count":0}
{"ts":"2026-10-27T01:56:59.391Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.392Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.392Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:59.398Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-aYvLSo/state-cmiaD7/commands.json","count":0}
{"ts":"2026-10-27T01:56:59.467Z","level":"info","msg":"agent resume skipped","paneId":"2b527ed0-9d6d-4d77-89e5-15ec1e8459c3","reason":"no-session-ref"}
{"ts":"2026-10-27T01:56:59.600Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.601Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.601Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:59.606Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-GeHN04/commands.json","count":0}
{"ts":"2026-10-27T01:56:59.748Z","level":"info","msg":"ask opened","askId":"f3915f60c6b8288440952fdba28d1d14","paneId":"bb858ecd-7c2c-48ac-bf19-e4e4be84b57c","questions":1,"media":0}
{"ts":"2026-10-27T01:56:59.775Z","level":"info","msg":"ask closed","askId":"f3915f60c6b8288440952fdba28d1d14","paneId":"bb858ecd-7c2c-48ac-bf19-e4e4be84b57c","status":"answered"}
{"ts":"2026-10-27T01:56:59.943Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.944Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:56:59.944Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:56:59.969Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-WJDI0S/commands.json","count":0}
{"ts":"2026-10-27T01:57:00.100Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:00.101Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:00.102Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:00.110Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-yTWZL9/commands.json","count":0}
{"ts":"2026-10-27T01:57:00.564Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:00.565Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:00.566Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:00.574Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-HKfo8R/commands.json","count":0}
{"ts":"2026-10-27T01:57:00.592Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:00.594Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:00.594Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:00.602Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-a8QTYh/commands.json","count":0}
{"ts":"2026-10-27T01:57:01.020Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:01.021Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:01.021Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:01.043Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-MFTjZo/commands.json","count":0}
{"ts":"2026-10-27T01:57:01.091Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:01.092Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:01.092Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:01.098Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-RJc4k5/commands.json","count":0}
{"ts":"2026-10-27T01:57:01.130Z","level":"info","msg":"agent session attached","paneId":"602b859c-c8d9-418c-8bea-cf71393f10cd","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:01.442Z","level":"warn","msg":"origin rejected","path":"/api/local-login","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:40503","allowed":["localhost:40503","127.0.0.1:40503","[::1]:40503"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-27T01:57:01.546Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:01.548Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:01.548Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:01.556Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-FoORNr/commands.json","count":0}
{"ts":"2026-10-27T01:57:01.977Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:01.977Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:01.978Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:01.988Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-MKYFhF/commands.json","count":0}
{"ts":"2026-10-27T01:57:04.886Z","level":"info","msg":"agent session attached","paneId":"b0e19f30-3376-4048-b1f0-c7f3fa0fc1e1","kind":"claude","session":"d996adb2","source":"hook"}
{"ts":"2026-10-27T01:57:05.143Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:57:05.153Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:05.154Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:05.155Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:05.167Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-H8tmkE/state-FDkSZF/commands.json","count":0}
{"ts":"2026-10-27T01:57:05.260Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:05.262Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:05.263Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:05.310Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-jPIT1U/commands.json","count":0}
{"ts":"2026-10-27T01:57:05.750Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:05.752Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:05.752Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:05.762Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-zbgGNN/commands.json","count":0}
{"ts":"2026-10-27T01:57:06.397Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:06.401Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:06.401Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:06.428Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-ScVC5W/commands.json","count":0}
{"ts":"2026-10-27T01:57:07.121Z","level":"info","msg":"agent session attached","paneId":"8fec3bba-e193-4be2-9329-b6fe4bd0548d","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:07.198Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:07.200Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:07.200Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:07.209Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-Fztkqu/commands.json","count":0}
{"ts":"2026-10-27T01:57:07.299Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:57:07.433Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:07.434Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:07.435Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:07.442Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-H8tmkE/state-GIpEol/commands.json","count":0}
{"ts":"2026-10-27T01:57:08.969Z","level":"info","msg":"machine link closed","machine":"7ebf826c9d7e97e8a198c9851e4b0afc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:57:09.096Z","level":"info","msg":"agent session attached","paneId":"17a5bf71-8594-45e8-96e1-e7e74b02eb58","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:10.172Z","level":"info","msg":"machine link closed","machine":"7ebf826c9d7e97e8a198c9851e4b0afc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:57:10.272Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:57:10.349Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:10.350Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:10.350Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:10.360Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-CBb3tb/commands.json","count":0}
{"ts":"2026-10-27T01:57:10.732Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:10.733Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:10.733Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:10.740Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-TcuPsI/commands.json","count":0}
{"ts":"2026-10-27T01:57:10.826Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:10.827Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:10.827Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:10.835Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-We4dEy/commands.json","count":0}
{"ts":"2026-10-27T01:57:11.194Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:11.195Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:11.195Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:11.204Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-hkDN9g/commands.json","count":0}
{"ts":"2026-10-27T01:57:11.264Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:11.265Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:11.265Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:11.277Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-KP6Bty/commands.json","count":0}
{"ts":"2026-10-27T01:57:11.858Z","level":"info","msg":"machine link closed","machine":"2010bc619642bed3546656cf59248567","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:57:12.355Z","level":"info","msg":"agent session attached","paneId":"f7d59aee-5a64-46fd-9502-89b0a56d475e","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:12.450Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:12.450Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:12.450Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:12.458Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-hkDN9g/commands.json","count":0}
{"ts":"2026-10-27T01:57:12.782Z","level":"info","msg":"agent resume skipped","paneId":"67d26604-1690-42ae-ad68-f5a1b480dc9b","reason":"no-session-ref"}
{"ts":"2026-10-27T01:57:12.875Z","level":"info","msg":"machine link closed","machine":"2010bc619642bed3546656cf59248567","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:57:12.923Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:12.924Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:12.925Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:12.958Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-dO66aS/commands.json","count":0}
{"ts":"2026-10-27T01:57:13.399Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:13.400Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:13.401Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:13.409Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-Y5CcDY/commands.json","count":0}
{"ts":"2026-10-27T01:57:14.104Z","level":"info","msg":"machine link closed","machine":"89649972faef3d263e01198d9b794fcb","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T01:57:14.146Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:14.146Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:14.146Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:14.154Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-FZW4ss/commands.json","count":0}
{"ts":"2026-10-27T01:57:14.592Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:14.593Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:14.593Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:14.601Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-HIHH4o/commands.json","count":0}
{"ts":"2026-10-27T01:57:15.321Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:15.321Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:15.321Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:15.322Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T01:57:15.332Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-uzW8P7/commands.json","count":0}
{"ts":"2026-10-27T01:57:15.776Z","level":"info","msg":"machine link closed","machine":"5d2dbd520e036551bf1132f20d868093","kind":"transient","reason":"接続が切れました（ssh: connect to host 127.0.0.1 port 1: Connection refused）"}
{"ts":"2026-10-27T01:57:15.840Z","level":"info","msg":"agent session attached","paneId":"f0188120-5c2c-4311-91b6-d420c3aaf07c","kind":"claude","session":"41c4d400","source":"hook"}
{"ts":"2026-10-27T01:57:17.425Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:17.428Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:17.428Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:17.436Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-Sx5bxp/commands.json","count":0}
{"ts":"2026-10-27T01:57:17.664Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:17.667Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:17.667Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:17.689Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-t4kq5M/commands.json","count":0}
{"ts":"2026-10-27T01:57:18.205Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T01:57:18.205Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T01:57:18.208Z","level":"info","msg":"ask opened","askId":"2d2c27c6bf906d3ae8b053a47c42b626","paneId":"272b1e1a-c10b-45bf-8960-a0f0f6ec145b","questions":1,"media":5}
{"ts":"2026-10-27T01:57:18.251Z","level":"info","msg":"ask closed","askId":"2d2c27c6bf906d3ae8b053a47c42b626","paneId":"272b1e1a-c10b-45bf-8960-a0f0f6ec145b","status":"answered"}
{"ts":"2026-10-27T01:57:18.331Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:18.332Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:18.332Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:18.339Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-9FY4GM/commands.json","count":0}
{"ts":"2026-10-27T01:57:18.998Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T01:57:18.999Z","level":"info","msg":"ask remote image failed"}
{"ts":"2026-10-27T01:57:18.999Z","level":"info","msg":"ask opened","askId":"d0dc7de8d8fbf60decce1bcbc5a730b2","paneId":"ddef8c23-f965-4c84-b185-c5be7b3b1a0f","questions":1,"media":0}
{"ts":"2026-10-27T01:57:19.020Z","level":"info","msg":"ask closed","askId":"d0dc7de8d8fbf60decce1bcbc5a730b2","paneId":"ddef8c23-f965-4c84-b185-c5be7b3b1a0f","status":"cancelled"}
{"ts":"2026-10-27T01:57:19.070Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:19.071Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:19.071Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:19.078Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-tVNsRg/commands.json","count":0}
{"ts":"2026-10-27T01:57:19.734Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:19.736Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:19.736Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:19.755Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-qeN63I/commands.json","count":0}
{"ts":"2026-10-27T01:57:20.263Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:20.264Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:20.265Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:20.276Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-f0w9yz/commands.json","count":0}
{"ts":"2026-10-27T01:57:20.361Z","level":"info","msg":"ask opened","askId":"cfd3927951ded6119e6975a2f1f38b40","paneId":"664a3924-868a-4c2d-80dd-baf0c6478b7e","questions":1,"media":1}
{"ts":"2026-10-27T01:57:20.387Z","level":"info","msg":"ask closed","askId":"cfd3927951ded6119e6975a2f1f38b40","paneId":"664a3924-868a-4c2d-80dd-baf0c6478b7e","status":"cancelled"}
{"ts":"2026-10-27T01:57:20.429Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:20.430Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:20.430Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:20.438Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-DVHb13/commands.json","count":0}
{"ts":"2026-10-27T01:57:20.895Z","level":"info","msg":"pane socket: request","op":"ask.features","paneId":"7c58614b-3f1e-42e5-a850-25aabd133517","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T01:57:20.897Z","level":"info","msg":"pane socket: request","op":"ask.nope","paneId":"7c58614b-3f1e-42e5-a850-25aabd133517","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T01:57:21.402Z","level":"info","msg":"agent session attached","paneId":"02394f99-1ff6-4e31-bd3a-f77fda34d4f6","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:21.691Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:21.692Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:21.692Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:21.702Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-H8tmkE/state-xta6hF/commands.json","count":0}
{"ts":"2026-10-27T01:57:22.911Z","level":"info","msg":"agent session attached","paneId":"cde50986-bb8f-4d9f-92e0-6ccd7af05de6","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:22.945Z","level":"info","msg":"usage report ignored","paneId":"cde50986-bb8f-4d9f-92e0-6ccd7af05de6","kind":"claude","reason":"the reporting process is not a descendant of the pane's shell"}
{"ts":"2026-10-27T01:57:24.624Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:24.625Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:24.625Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:24.654Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-H8tmkE/state-NYfHZi/commands.json","count":0}
{"ts":"2026-10-27T01:57:25.296Z","level":"info","msg":"agent session attached","paneId":"8bf57fe5-4e71-4ab0-9608-d98c91c1592b","kind":"claude","session":"da835535","source":"hook"}
{"ts":"2026-10-27T01:57:27.102Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:27.104Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:27.104Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:27.112Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-tz3Xcu/state-leNLIu/commands.json","count":0}
{"ts":"2026-10-27T01:57:27.641Z","level":"info","msg":"agent session attached","paneId":"793b2f92-bae4-4f36-bdc8-dd797cfd3a76","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:27.784Z","level":"info","msg":"agent session attached","paneId":"91c12d22-9360-48ef-b9b4-96178881b7b4","kind":"claude","session":"3e81f9a7","source":"hook"}
[graph-perf] {"case":"single-change","panes":16,"links":32,"limitMs":2000,"results":[{"source":0,"toStartMs":[14,14],"toSentMs":[1392,1392]},{"source":5,"toStartMs":[97,97],"toSentMs":[1082,1085]},{"source":10,"toStartMs":[6,13],"toSentMs":[1272,1272]}]}
{"ts":"2026-10-27T01:57:29.493Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:29.494Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:29.494Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:29.502Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-qD8wgY/commands.json","count":0}
{"ts":"2026-10-27T01:57:31.491Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:31.493Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:31.493Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:31.500Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-Yb5EV7/commands.json","count":0}
{"ts":"2026-10-27T01:57:32.926Z","level":"info","msg":"agent session attached","paneId":"ce51385f-6646-4335-90ec-065bb7d8da45","kind":"claude","session":"conv-KIL","source":"hook"}
{"ts":"2026-10-27T01:57:33.014Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:33.015Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:33.015Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:33.026Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-Ra8SEP/commands.json","count":0}
{"ts":"2026-10-27T01:57:33.198Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:33.199Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:33.199Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:33.205Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-Yb5EV7/commands.json","count":0}
{"ts":"2026-10-27T01:57:33.532Z","level":"info","msg":"agent resume command written","paneId":"ce51385f-6646-4335-90ec-065bb7d8da45","kind":"claude","session":"conv-KIL"}
{"ts":"2026-10-27T01:57:33.594Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:33.595Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:33.595Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:33.600Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-gpxihp/commands.json","count":0}
{"ts":"2026-10-27T01:57:34.104Z","level":"info","msg":"agent session attached","paneId":"a98f7f80-6fac-4655-a88d-ea578b562ea0","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:35.303Z","level":"info","msg":"agent session attached","paneId":"8e3ea050-050b-48d5-af47-49672404b146","kind":"claude","session":"conv-TER","source":"hook"}
{"ts":"2026-10-27T01:57:35.648Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:35.648Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:35.649Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:35.654Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-gpxihp/commands.json","count":0}
{"ts":"2026-10-27T01:57:36.021Z","level":"info","msg":"agent resume command written","paneId":"8e3ea050-050b-48d5-af47-49672404b146","kind":"claude","session":"conv-TER"}
{"ts":"2026-10-27T01:57:36.101Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:36.102Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:36.103Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:36.108Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-l4NJLP/commands.json","count":0}
{"ts":"2026-10-27T01:57:37.938Z","level":"info","msg":"agent session attached","paneId":"4edd264e-9561-43d6-81fa-9d86e3ff9323","kind":"claude","session":"conv-HUP","source":"hook"}
{"ts":"2026-10-27T01:57:38.347Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:38.347Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:38.347Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:38.355Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-l4NJLP/commands.json","count":0}
{"ts":"2026-10-27T01:57:38.678Z","level":"info","msg":"agent resume command written","paneId":"4edd264e-9561-43d6-81fa-9d86e3ff9323","kind":"claude","session":"conv-HUP"}
{"ts":"2026-10-27T01:57:38.771Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:38.771Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:38.772Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:38.778Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-4lfwAa/commands.json","count":0}
{"ts":"2026-10-27T01:57:39.425Z","level":"info","msg":"agent session attached","paneId":"4cedc617-3c5d-46b2-bf30-4d7bad304ecb","kind":"claude","session":"conv-gra","source":"hook"}
[graph-perf] {"case":"blocked","panes":16,"links":32,"holdMs":1000,"limitMs":2000,"results":[{"source":0,"triggerStartMs":1241,"approvalStartMs":1279},{"source":5,"triggerStartMs":1127,"approvalStartMs":1156},{"source":10,"triggerStartMs":1176,"approvalStartMs":1258}]}
{"ts":"2026-10-27T01:57:41.321Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:41.321Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:41.322Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:41.331Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-A46SK5/commands.json","count":0}
{"ts":"2026-10-27T01:57:42.701Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:42.701Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:42.702Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:42.709Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-4lfwAa/commands.json","count":0}
{"ts":"2026-10-27T01:57:43.027Z","level":"info","msg":"agent resume command written","paneId":"4cedc617-3c5d-46b2-bf30-4d7bad304ecb","kind":"claude","session":"conv-gra"}
{"ts":"2026-10-27T01:57:43.128Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:43.129Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:43.129Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:43.135Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-4hcOIH/commands.json","count":0}
{"ts":"2026-10-27T01:57:43.705Z","level":"info","msg":"agent session attached","paneId":"20956827-56bf-415b-a8f0-e979c9935879","kind":"claude","session":"conv-lat","source":"hook"}
{"ts":"2026-10-27T01:57:43.878Z","level":"info","msg":"agent session attached","paneId":"d0734b7b-2197-45ee-b40f-6dd5f53a8348","kind":"claude","session":"c4bd86a5","source":"hook"}
{"ts":"2026-10-27T01:57:45.632Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:45.633Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:45.633Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:45.643Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-EPbKiM/commands.json","count":0}
{"ts":"2026-10-27T01:57:46.660Z","level":"info","msg":"agent session attached","paneId":"d8a65715-f50e-45df-8c28-71506565d9d1","kind":"claude","session":"3e81f9a7","source":"hook"}
[graph-perf] {"case":"burst","panes":16,"links":32,"limitMs":2000,"maxFirstStartMs":14,"firstStartMs":[12,12,13,13,13,13,13,13,14,14,14,14,14,14,14,14]}
{"ts":"2026-10-27T01:57:50.916Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:50.918Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:50.918Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:50.927Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-tz3Xcu/state-JBI7NL/commands.json","count":0}
{"ts":"2026-10-27T01:57:51.544Z","level":"info","msg":"agent session attached","paneId":"b414567a-29c3-48bc-9e5a-5e75a35291bc","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:55.982Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:55.983Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:55.984Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:55.992Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-EBSXdG/commands.json","count":0}
{"ts":"2026-10-27T01:57:56.525Z","level":"info","msg":"agent session attached","paneId":"3d4c81f5-5d65-4792-8714-70063a0e4f49","kind":"claude","session":"907c6b38","source":"hook"}
{"ts":"2026-10-27T01:57:56.646Z","level":"info","msg":"agent session attached","paneId":"5a5ffb00-b4b9-4b09-8414-7c17739f18ae","kind":"claude","session":"conv-qui","source":"hook"}
{"ts":"2026-10-27T01:57:56.778Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:56.779Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:56.779Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:56.802Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-tz3Xcu/state-cwx7gC/commands.json","count":0}
{"ts":"2026-10-27T01:57:57.275Z","level":"info","msg":"agent session attached","paneId":"ff4456bc-de4f-4b24-a00c-a5f94b74d56f","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:58.023Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:57:58.024Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:57:58.024Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:57:58.035Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-hqfTfs/commands.json","count":0}
{"ts":"2026-10-27T01:57:58.721Z","level":"info","msg":"agent session attached","paneId":"19d1f5ea-7900-4c16-b620-82483edab466","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:57:59.657Z","level":"info","msg":"agent session attached","paneId":"19d1f5ea-7900-4c16-b620-82483edab466","kind":"claude","session":"7c0a3f2e","source":"hook"}
{"ts":"2026-10-27T01:58:02.262Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:02.264Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:02.264Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:02.264Z","level":"info","msg":"agent session attached","paneId":"caae6d46-a8c6-4cd6-a6fd-8180bf67f093","kind":"claude","session":"c7ae4fbf","source":"hook"}
{"ts":"2026-10-27T01:58:02.270Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-3IDS3Q/commands.json","count":0}
{"ts":"2026-10-27T01:58:02.374Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:02.375Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:02.375Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:02.386Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-RkEdcZ/commands.json","count":0}
{"ts":"2026-10-27T01:58:03.486Z","level":"info","msg":"agent session attached","paneId":"54485c1a-0d16-4de9-8878-06f2f6663fd4","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:58:03.938Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:03.940Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:03.940Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:03.946Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-71x9CV/commands.json","count":0}
{"ts":"2026-10-27T01:58:04.274Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:04.275Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:04.275Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:04.284Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-3Zzzce/commands.json","count":0}
{"ts":"2026-10-27T01:58:04.703Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:04.704Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:04.704Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:04.726Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-foGDmC/commands.json","count":0}
{"ts":"2026-10-27T01:58:04.739Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:04.740Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:04.740Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:04.748Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-7zb2vs/commands.json","count":0}
{"ts":"2026-10-27T01:58:05.233Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:05.234Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:05.234Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:05.242Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-wQ5acG/commands.json","count":0}
{"ts":"2026-10-27T01:58:05.289Z","level":"info","msg":"agent session attached","paneId":"5b3f6c7d-87c6-4483-ae7c-7361c246d05d","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:58:06.027Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:06.028Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:06.028Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:06.038Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-nFHmCd/commands.json","count":0}
{"ts":"2026-10-27T01:58:06.547Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:06.548Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:06.548Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:06.555Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-cByPLp/commands.json","count":0}
{"ts":"2026-10-27T01:58:07.066Z","level":"info","msg":"agent session dropped (agent gone, shell alive)","paneId":"5a5ffb00-b4b9-4b09-8414-7c17739f18ae","graceMs":10000,"kind":"claude","session":"conv-qui","reason":"agent ended"}
{"ts":"2026-10-27T01:58:07.208Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:07.209Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:07.209Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:07.218Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-EBSXdG/commands.json","count":0}
{"ts":"2026-10-27T01:58:07.437Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:07.439Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:07.439Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:07.449Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-ClOh5j/commands.json","count":1}
{"ts":"2026-10-27T01:58:07.545Z","level":"info","msg":"agent resume skipped","paneId":"5a5ffb00-b4b9-4b09-8414-7c17739f18ae","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:07.958Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:07.959Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:07.960Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:07.967Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-puLb5s/commands.json","count":0}
{"ts":"2026-10-27T01:58:08.208Z","level":"info","msg":"custom command run","commandId":"cat","type":"popup","clientId":"56bed6d2-c02f-4a2f-acde-a5288e4227fb","paneId":"e98774c2-4119-478c-8b8e-4e8e02206321"}
{"ts":"2026-10-27T01:58:08.504Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:08.505Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:08.505Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:08.515Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-b4Oly0/commands.json","count":1}
{"ts":"2026-10-27T01:58:08.693Z","level":"info","msg":"agent session attached","paneId":"051cda79-7d01-41e9-979d-dafc1ecd095e","kind":"claude","session":"7876cd99","source":"hook"}
{"ts":"2026-10-27T01:58:08.846Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:08.847Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:08.847Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:08.857Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-oSZ6oQ/commands.json","count":0}
{"ts":"2026-10-27T01:58:09.100Z","level":"info","msg":"custom command run","commandId":"quit","type":"popup","clientId":"a36f3b6e-fb74-4876-95a3-b8f9a78469b9","paneId":"72043918-f826-4b0a-9358-46773842e4b1"}
{"ts":"2026-10-27T01:58:09.181Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:09.182Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:09.182Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:09.191Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-iT6PHw/commands.json","count":1}
{"ts":"2026-10-27T01:58:09.654Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:09.655Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:09.655Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:09.676Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-TqzYdL/commands.json","count":0}
{"ts":"2026-10-27T01:58:09.790Z","level":"info","msg":"custom command run","commandId":"note","type":"shell","clientId":"4d1079eb-344e-4e17-9c99-30524fa28886","paneId":"f14a5691-218f-4cb6-a1e4-ab3c9082ce72"}
{"ts":"2026-10-27T01:58:09.871Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:09.872Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:09.872Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:09.880Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-5Pn4Kl/commands.json","count":1}
{"ts":"2026-10-27T01:58:09.958Z","level":"info","msg":"agent session attached","paneId":"b6082767-d2b1-4ad4-b0ce-7d786167c559","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:58:10.235Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:10.236Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:10.236Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:10.245Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-15lfMT/commands.json","count":0}
{"ts":"2026-10-27T01:58:10.264Z","level":"info","msg":"agent session attached","paneId":"82049489-f0cc-451b-a3d0-2f46601cda12","kind":"claude","session":"conv-bc","source":"hook"}
{"ts":"2026-10-27T01:58:10.299Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:10.300Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:10.300Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:10.307Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-TqzYdL/commands.json","count":0}
{"ts":"2026-10-27T01:58:10.421Z","level":"info","msg":"custom command run","commandId":"cat","type":"popup","clientId":"90a8edda-7056-4e9d-89f1-c7bc37ba05ed","paneId":"1fe9e56f-eb0e-42be-8830-f43d969d48c3"}
{"ts":"2026-10-27T01:58:10.478Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:10.479Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:10.480Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:10.489Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-U5fViD/sessions/work/commands.json","count":1}
{"ts":"2026-10-27T01:58:10.626Z","level":"info","msg":"agent resume command written","paneId":"82049489-f0cc-451b-a3d0-2f46601cda12","kind":"claude","session":"conv-bc"}
{"ts":"2026-10-27T01:58:10.710Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:10.710Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:10.710Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:10.718Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-ln9hT0/state-TqzYdL/commands.json","count":0}
{"ts":"2026-10-27T01:58:11.036Z","level":"info","msg":"agent resume command written","paneId":"82049489-f0cc-451b-a3d0-2f46601cda12","kind":"claude","session":"conv-bc"}
{"ts":"2026-10-27T01:58:11.113Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:11.114Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:11.114Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:11.123Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-CBm3Om/commands.json","count":1}
{"ts":"2026-10-27T01:58:11.697Z","level":"warn","msg":"custom commands rejected","file":"/tmp/soda-compose-cmd-CBm3Om/commands.json","problem":"commands.json: commands[0]: 知らない項目です（env）"}
{"ts":"2026-10-27T01:58:12.183Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:12.185Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:12.186Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:12.193Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-U0wCks/commands.json","count":0}
{"ts":"2026-10-27T01:58:13.056Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:13.057Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:13.057Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:13.064Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-ErNlVz/commands.json","count":0}
{"ts":"2026-10-27T01:58:13.515Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:13.516Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:13.516Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:13.522Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-biQ7Pp/commands.json","count":0}
{"ts":"2026-10-27T01:58:13.860Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:13.862Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:13.863Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:13.871Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-CtJmpn/commands.json","count":0}
{"ts":"2026-10-27T01:58:14.090Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:14.091Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:14.091Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:14.099Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-c0ESh7/commands.json","count":0}
{"ts":"2026-10-27T01:58:15.031Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:15.032Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:15.032Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:15.038Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-jDmAcl/commands.json","count":0}
{"ts":"2026-10-27T01:58:16.015Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:16.016Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:16.016Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:16.024Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-IuyHsx/commands.json","count":0}
{"ts":"2026-10-27T01:58:16.946Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:16.947Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:16.947Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:16.956Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-2IY99u/commands.json","count":0}
{"ts":"2026-10-27T01:58:17.900Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:17.901Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:17.901Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:17.911Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-WsGgEo/commands.json","count":0}
{"ts":"2026-10-27T01:58:18.950Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:18.953Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:18.953Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:18.989Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-gvFf9Y/commands.json","count":0}
{"ts":"2026-10-27T01:58:21.022Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:21.025Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:21.025Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:21.033Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-HALetf/commands.json","count":0}
{"ts":"2026-10-27T01:58:21.533Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:21.534Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:21.534Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:21.538Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-2HThNo/commands.json","count":0}
{"ts":"2026-10-27T01:58:21.883Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:21.885Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:21.885Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:21.891Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-upNz9T/commands.json","count":0}
{"ts":"2026-10-27T01:58:21.952Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:21.953Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:21.953Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:21.957Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-i6cgjx/commands.json","count":0}
{"ts":"2026-10-27T01:58:22.353Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:22.354Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:22.354Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:22.359Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-GvXF9H/commands.json","count":0}
{"ts":"2026-10-27T01:58:22.370Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:22.371Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:22.371Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:22.377Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-lwyxGk/commands.json","count":0}
{"ts":"2026-10-27T01:58:22.799Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T01:58:22.831Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:22.832Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:22.833Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:22.837Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-EHvBSo/commands.json","count":0}
{"ts":"2026-10-27T01:58:23.206Z","level":"warn","msg":"bridge: closing a connection after a protocol violation","reason":"channel 1 is already open"}
{"ts":"2026-10-27T01:58:23.209Z","level":"warn","msg":"bridge: closing a connection after a protocol violation","reason":"BridgeProtocolError: unexpected frame type 66"}
{"ts":"2026-10-27T01:58:23.300Z","level":"warn","msg":"handoff: preflight failed; keeping the current server","message":"held by the test"}
{"ts":"2026-10-27T01:58:25.356Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:25.358Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:25.358Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:25.364Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-hooksource-gsuYwh/state/commands.json","count":0}
{"ts":"2026-10-27T01:58:25.391Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:25.392Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:25.393Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:25.399Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-Qs0X1P/commands.json","count":0}
{"ts":"2026-10-27T01:58:25.836Z","level":"info","msg":"agent session attached","paneId":"87c123a8-a18a-4c89-bf09-351475965fc7","kind":"claude","session":"11111111","source":"hook"}
{"ts":"2026-10-27T01:58:25.879Z","level":"info","msg":"agent session attached","paneId":"87c123a8-a18a-4c89-bf09-351475965fc7","kind":"claude","session":"22222222","source":"hook"}
{"ts":"2026-10-27T01:58:25.951Z","level":"info","msg":"agent session attached","paneId":"87c123a8-a18a-4c89-bf09-351475965fc7","kind":"claude","session":"33333333","source":"hook"}
{"ts":"2026-10-27T01:58:26.051Z","level":"info","msg":"agent session attached","paneId":"87c123a8-a18a-4c89-bf09-351475965fc7","kind":"claude","session":"33333333","source":"hook"}
{"ts":"2026-10-27T01:58:26.399Z","level":"info","msg":"agent session attached","paneId":"87c123a8-a18a-4c89-bf09-351475965fc7","kind":"claude","session":"aaaaaaaa","source":"hook"}
{"ts":"2026-10-27T01:58:26.431Z","level":"info","msg":"agent session attached","paneId":"87c123a8-a18a-4c89-bf09-351475965fc7","kind":"claude","session":"bbbbbbbb","source":"hook"}
{"ts":"2026-10-27T01:58:26.468Z","level":"info","msg":"agent session attached","paneId":"87c123a8-a18a-4c89-bf09-351475965fc7","kind":"claude","session":"cccccccc","source":"hook"}
{"ts":"2026-10-27T01:58:27.177Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:27.178Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:27.178Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:27.187Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-Qs0X1P/commands.json","count":0}
{"ts":"2026-10-27T01:58:27.528Z","level":"info","msg":"agent resume skipped","paneId":"906542a8-e48b-461d-aed4-54904137a642","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:27.835Z","level":"info","msg":"agent resume skipped","paneId":"9cd31917-a81d-4e86-8e01-2e49a272ddc0","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:28.141Z","level":"info","msg":"agent resume skipped","paneId":"4f2945bf-a051-4649-97c8-64ffbec8dfce","reason":"no-session-ref"}
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
{"ts":"2026-10-27T01:58:28.446Z","level":"info","msg":"agent resume skipped","paneId":"23ca146c-9a9e-4f61-b27c-b87d05c57a93","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:28.755Z","level":"info","msg":"agent resume skipped","paneId":"26b09312-7bc4-41d4-b91c-bc3be99a0de5","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:28.766Z","level":"info","msg":"graph.json was migrated to schema 2 (a copy of the old file is in graph-backups/)"}
{"ts":"2026-10-27T01:58:28.835Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:28.836Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:28.836Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:28.840Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-Qs0X1P/commands.json","count":0}
{"ts":"2026-10-27T01:58:29.179Z","level":"info","msg":"agent resume skipped","paneId":"906542a8-e48b-461d-aed4-54904137a642","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:29.484Z","level":"info","msg":"agent resume skipped","paneId":"9cd31917-a81d-4e86-8e01-2e49a272ddc0","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:29.789Z","level":"info","msg":"agent resume skipped","paneId":"4f2945bf-a051-4649-97c8-64ffbec8dfce","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:30.093Z","level":"info","msg":"agent resume skipped","paneId":"23ca146c-9a9e-4f61-b27c-b87d05c57a93","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:30.399Z","level":"info","msg":"agent resume skipped","paneId":"26b09312-7bc4-41d4-b91c-bc3be99a0de5","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:34.062Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:34.066Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:34.066Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:34.076Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-mig-state-hlSDuH/commands.json","count":0}
{"ts":"2026-10-27T01:58:35.339Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:35.340Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:35.340Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:35.361Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-mig-state-hlSDuH/commands.json","count":0}
{"ts":"2026-10-27T01:58:35.692Z","level":"info","msg":"agent resume skipped","paneId":"789912d7-1c14-454b-89c1-17188afee4e8","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:35.997Z","level":"info","msg":"agent resume skipped","paneId":"8434888c-f8ce-4d70-a5aa-5f2d1552468f","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:36.301Z","level":"info","msg":"agent resume skipped","paneId":"8c9433b2-8a4e-42ed-93f5-969cdbebf4b1","reason":"no-session-ref"}
{"ts":"2026-10-27T01:58:37.952Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:37.954Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:37.954Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:37.961Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-mmUwdv/commands.json","count":0}
{"ts":"2026-10-27T01:58:38.031Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:38.032Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:38.032Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:38.037Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-mmUwdv/commands.json","count":0}
{"ts":"2026-10-27T01:58:38.535Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:38.536Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:38.537Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:38.542Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-19EXio/commands.json","count":0}
{"ts":"2026-10-27T01:58:38.575Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:38.576Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:38.576Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:38.582Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-yoLMJz/commands.json","count":0}
{"ts":"2026-10-27T01:58:39.020Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:39.021Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:39.021Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:39.026Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-REYpVf/commands.json","count":0}
{"ts":"2026-10-27T01:58:39.050Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:39.051Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:39.051Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:39.056Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-REYpVf/commands.json","count":0}
{"ts":"2026-10-27T01:58:43.788Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T01:58:43.789Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T01:58:43.789Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T01:58:43.800Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-aBUahQ/state-gfnom4/commands.json","count":0}
{"ts":"2026-10-27T01:58:44.980Z","level":"info","msg":"agent session attached","paneId":"94f3b9e8-0547-40ef-961e-005e8cf6797e","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T01:58:48.777Z","level":"info","msg":"agent session attached","paneId":"17e8c887-3e3c-431f-b917-7a3e1e6b94fb","kind":"claude","session":"0ea1a307","source":"hook"}
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f0d263cbbefe076dba0117936ae1a997": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=b51dde25741e2000d9051c86d011428f": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=6bfacb504d9a934a038f563ef398f35c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=81c1791532ac33a6a075083b9bb56b56": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=176694c212e26af2af7fb90cb823c92a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=cb293ca2b9201353dac6b8051e1569b2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=3e3f033e3df4ed98e39934bd36031f97": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=b6216ec3e299f860b29fffb227111ef2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f14329f0f584a40a7ced26dae41ee156": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=579f54436e6664dff41a9e5c01638495": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=c40cb7e2f4db3f89e9d6729d23d29931": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=df4c2dcad3f6e1b59fc4b65b44d8413a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=dcf35a5f7dbdac1cab3b509eb46c6765": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=9f905d4d603c54acc3dc88afd0f24494": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=9173f90cdc8f8f6aa9cc301ae27dee6b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=54a4b2e297f921fce08c79cc0171ec25": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=3808465e5567a28effd80759ada66ee6": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=7a29c3436d36ec7ee679c3fe28f68490": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=481accf404638bd8496407d50fb26c37": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ca5e11b4c6a5c2766def00e726a4a40a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ecbcd80d68d4fdf8fc04b8cf6b3e3ad7": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=c07a16723bcf03feca59d8343309a896": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=828b4c20996c6130989ef490ca0e4235": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=12249d92b91563dc815e2065d1068976": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=65a23bbe44d01072e3d8ee08a9148288": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=fdd11475895334c957b0c8ff4dcddc50": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=39624368ce2c2ae15de1242ef6256f0f": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=8ceec0844c16fb559d39eb734156e37a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=3ea4f8eea122f8d5032e526785aea94d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=b2e211948de1a77dfea17043cde50e15": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
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
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=5766e708d959e5ca1f12353949df636e": connect ECONNREFUSED 127.0.0.1:3000
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at Socket.socketErrorListener (node:_http_client:593:5)
    at Socket.emit (node:events:509:28)
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at processTicksAndRejections (node:internal/process/task_queues:90:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=499f4d7c55cf68f43c22b4eeb6c1a5fc": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=fc82231e3871c6dccca5661b6cd6b242": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=967aae6a9eed593554b608295da02b60": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=0d03e9286b23f6a4b2c43810baa54605": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
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
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=2d71b4195b423dae795e26e61bf1a398": connect ECONNREFUSED 127.0.0.1:3000
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at Socket.socketErrorListener (node:_http_client:593:5)
    at Socket.emit (node:events:509:28)
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at processTicksAndRejections (node:internal/process/task_queues:90:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=6cc4efa175424c4c21379c7cfe89ff75": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=3020b9dfb1cde50c62252d2a05721214": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a503160b68481e4f68e3ab65a0e8207c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=607818bc2a3c2cb4839544839fcae79c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=cf86c67298aecc4dff3c54491f8a4b76": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f8f6bf63ce51c4caacbfca04e1a3a399": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=c8ed16a7285359c5c8381fbd860a46dc": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=fe5287d124ab2b431187cdacb24ca7fe": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=1b7259e1f3ef8a1e292fa9bfe91ee28a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f41ec182727f2db79393a80978e2b651": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=041b7d072c7f646f1de6597e16445661": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
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
DOMException [NotSupportedError]: Failed to load script "http://localhost:3000/display-view/frame.js". JavaScript file loading is disabled.
    at HTMLScriptElement.#loadScript (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-script-element/HTMLScriptElement.js:549:31)
    at HTMLScriptElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-script-element/HTMLScriptElement.js:315:33)
    at HTMLScriptElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at insertChildren (eval at boot (/workspaces/sodashitsu-desktop-shared-audio/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:349:11)
    at inject (eval at boot (/workspaces/sodashitsu-desktop-shared-audio/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:371:21)
    at onRender (eval at boot (/workspaces/sodashitsu-desktop-shared-audio/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:491:7)
    at Object.onPort [as onmessage] (eval at boot (/workspaces/sodashitsu-desktop-shared-audio/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:507:7)
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
[graph-perf] {"case":"web-subagent-churn","env":"happy-dom","subagents":60,"generations":20,"totalMs":49,"limitMs":10000}
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=f042a092709e614aa21831011ee8d9d5": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=87f53148263bea060832dd1e9a5f7361": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=d3f48a4f53ac4a5f79645b462056591b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=e33831cc30f8f5dd07838bc08827996e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=2a5bf3ef7581f66568e083b54c2ad659": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=0299184839a14a16a06fb842dc02bb62": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a24f298d44e2d5db4becb9c02537151a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=c2f7ce7cfba4d28ffc8c323aa514a468": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=5d6a00d7707b3aa83d38c917b7c95cb2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=31b24350189ada9d464c36809217f6b2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=717c00211f8edeb68ba5b4dc9b9258ac": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=084b819348520ea66bb55aed945cd337": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=b044d68f7a0e4cc6e462565d7e8fd1f3": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=f87641b9e8199cc424b713a4d9f0d24c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ba822ae01372d8e9fce68d7ee4db51fd": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=c8bf661755daf194259b3eb4b72a1ad5": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=5a31556ae6019b64fecdf02b8e6bef1d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=b4174df5a0373a4f05cd86eae11c4f0c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=b4e7039ef9bc828ccdaa016c3fe60674": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=054922d93db05b77fc3d937fe2f59bb2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=04ffecff59181d852ba7172ed7fe4739": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=7cf6cb6693dd82fd3bc8f129b24bd7d6": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=2e92fc10d629947bd5fdad61525e0630": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=df2a3a5bd03d0577760ca6897ea35a2f": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=e5fa7cf14e012b946a595762bc7eb93a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/html.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:556:48)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
    at insert (/workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:31:12)
    at mountElement (/workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5772:5)
    at processElement (/workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5688:7)
    at patch (/workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5554:11)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/html.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:556:48)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
    at insert (/workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:31:12)
    at mountElement (/workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5772:5)
    at processElement (/workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5688:7)
    at patch (/workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5554:11)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
[graph-perf] {"case":"web-render","env":"happy-dom","panes":16,"links":32,"openMs":267,"rerenderMs":47,"limitMs":10000}
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-shared-audio/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-shared-audio/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-shared-audio/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-shared-audio/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-audio/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)

 Test Files  778 passed (778)
      Tests  11628 passed (11628)
   Start at  10:54:01
   Duration  389.17s (tests 79%, import 11%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 227 times · 77.54s total, 29% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

```text

Running 11 tests using 1 worker

(node:1482490) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T02:00:34.601Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:34.602Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:34.602Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:34.610Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-6cXvZH/commands.json","count":0}
{"ts":"2026-10-27T02:00:35.405Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:35.406Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:35.406Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:35.408Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-H9wfkk/commands.json","count":0}
{"ts":"2026-10-27T02:00:44.740Z","level":"info","msg":"machine link closed","machine":"c3ec1dea20429f9e073c5ce064768e78","kind":"transient","reason":"接続が切れました"}
  ✓   1 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: udp, initially muted, bounded decode, mute/stop (10.5s)
{"ts":"2026-10-27T02:00:44.900Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:44.901Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:44.901Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:44.911Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-F06aJv/commands.json","count":0}
{"ts":"2026-10-27T02:00:45.361Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:45.362Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:45.362Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:45.362Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-cSCbmO/commands.json","count":0}
{"ts":"2026-10-27T02:00:49.768Z","level":"info","msg":"machine link closed","machine":"866c55c1d98ef2f758ed65d0b5defd67","kind":"transient","reason":"接続が切れました"}
  ✓   2 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: wss, initially muted, bounded decode, mute/stop (5.0s)
{"ts":"2026-10-27T02:00:49.897Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:49.898Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:49.898Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:49.907Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-3wzP6C/commands.json","count":0}
{"ts":"2026-10-27T02:00:50.391Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:50.391Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:50.392Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:50.392Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-SbQXLT/commands.json","count":0}
{"ts":"2026-10-27T02:00:56.194Z","level":"info","msg":"machine link closed","machine":"415cb4b45a17b68026d9d65179a68ab6","kind":"transient","reason":"接続が切れました"}
  ✓   3 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: unavailable, initially muted, bounded decode, mute/stop (6.5s)
{"ts":"2026-10-27T02:00:56.404Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:56.405Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:56.405Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:56.416Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-rAoTHr/commands.json","count":0}
{"ts":"2026-10-27T02:00:56.898Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:56.898Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:56.899Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:56.900Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-xXcwHA/commands.json","count":0}
{"ts":"2026-10-27T02:00:59.524Z","level":"info","msg":"machine link closed","machine":"273d2ea898624040281fb0835b3f5ef8","kind":"transient","reason":"接続が切れました"}
  ✓   4 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: unsupported, initially muted, bounded decode, mute/stop (3.2s)
{"ts":"2026-10-27T02:00:59.629Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:00:59.630Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:00:59.630Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:00:59.639Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-q9LINX/commands.json","count":0}
{"ts":"2026-10-27T02:01:00.236Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:00.237Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:00.237Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:00.238Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-tXglKj/commands.json","count":0}
{"ts":"2026-10-27T02:01:05.344Z","level":"info","msg":"machine link closed","machine":"5fa1ba9cbbc2e30a597500c7267ca477","kind":"transient","reason":"接続が切れました"}
  ✓   5 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: resume-race, initially muted, bounded decode, mute/stop (5.8s)
{"ts":"2026-10-27T02:01:05.504Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:05.505Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:05.506Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:05.515Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-xCIJuN/commands.json","count":0}
{"ts":"2026-10-27T02:01:05.970Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:05.971Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:05.971Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:05.971Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-wBekS0/commands.json","count":0}
{"ts":"2026-10-27T02:01:11.015Z","level":"info","msg":"machine link closed","machine":"9b482d40b1161423669cef1cbbd299f9","kind":"transient","reason":"接続が切れました"}
  ✓   6 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: resume-failure, initially muted, bounded decode, mute/stop (5.6s)
{"ts":"2026-10-27T02:01:11.138Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:11.139Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:11.139Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:11.148Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-LYlijq/commands.json","count":0}
{"ts":"2026-10-27T02:01:11.587Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:11.587Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:11.587Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:11.588Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ieV6su/commands.json","count":0}
{"ts":"2026-10-27T02:01:14.653Z","level":"info","msg":"machine link closed","machine":"efd175223f8c5a4550a85ce2e638e593","kind":"transient","reason":"接続が切れました"}
  ✓   7 src/specs/remote-desktop-microphone.spec.ts:9:1 › explicit microphone sends generated PCM to B, stops tracks and never restarts on reopen (4.1s)
{"ts":"2026-10-27T02:01:15.249Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:15.250Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:15.251Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:15.262Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-XAQdGh/commands.json","count":0}
{"ts":"2026-10-27T02:01:15.685Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:15.686Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:15.686Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:15.687Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-XJ10fn/commands.json","count":0}
{"ts":"2026-10-27T02:01:23.441Z","level":"info","msg":"machine link closed","machine":"2022a9459557b92b08e9ee6bc2d411e3","kind":"transient","reason":"接続が切れました"}
  ✓   8 src/specs/remote-desktop-shared-audio.spec.ts:8:42 › shared system audio uses one capture and isolates stop/fallback: wss (8.8s)
{"ts":"2026-10-27T02:01:24.074Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:24.075Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:24.075Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:24.086Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-SjBigz/commands.json","count":0}
{"ts":"2026-10-27T02:01:24.614Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:24.615Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:24.615Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:24.616Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-SDEqM0/commands.json","count":0}
{"ts":"2026-10-27T02:01:34.316Z","level":"info","msg":"machine link closed","machine":"56cbf4c666d7ab3255c9f97f11b285cc","kind":"transient","reason":"接続が切れました"}
  ✓   9 src/specs/remote-desktop-shared-audio.spec.ts:8:42 › shared system audio uses one capture and isolates stop/fallback: udp (10.9s)
{"ts":"2026-10-27T02:01:34.995Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:34.996Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:34.996Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:35.009Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-mBbbpn/commands.json","count":0}
{"ts":"2026-10-27T02:01:35.464Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:35.464Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:35.464Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:35.466Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-S00rBQ/commands.json","count":0}
{"ts":"2026-10-27T02:01:44.097Z","level":"info","msg":"machine link closed","machine":"2a8933944d470b38344920b3e9dcb245","kind":"transient","reason":"接続が切れました"}
  ✓  10 src/specs/remote-desktop-shared-datagrams.spec.ts:10:1 › shared UDP viewers recover packet loss and one peer can fall back to WSS independently (9.3s)
{"ts":"2026-10-27T02:01:44.300Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:44.301Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:44.301Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:44.315Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-Rj2O6Z/commands.json","count":0}
{"ts":"2026-10-27T02:01:44.762Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T02:01:44.763Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T02:01:44.763Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T02:01:44.764Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-xlMmgz/commands.json","count":0}
{"ts":"2026-10-27T02:01:51.694Z","level":"info","msg":"machine link closed","machine":"54b50a27e6e55fd9719991f64cf42eeb","kind":"transient","reason":"接続が切れました"}
  ✓  11 src/specs/remote-desktop-shared-native.spec.ts:9:1 › two native viewers share one encoder and a slow viewer recovers without stalling its peer (7.6s)

  11 passed (1.3m)

```
