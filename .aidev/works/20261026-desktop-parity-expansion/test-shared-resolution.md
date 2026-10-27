# 共有解像度の検証

source bc1e4941。build/typecheck、全体11789件、独立worktree build/smokeが通過。4種類の既存互換browserは別記の結果を追記する。新browserはWSS/UDP/slow-format/late-fixedの4件成功と、codec gateを一度にしたlate-fixed-udp-drop単独成功の合計5件を確認した。同じ製品source/distでの結果で、fixture gateだけを修正した。

生成H264の1280×800→960×600、2実browserのcanvas描画と継続、renderer別generation/baseSeq、遅いdecoderの画像復帰、固定viewer途中参加で1280へ復帰、保持IDRのUDP fragment損失後の将来keyframe描画、1 encoder/1 audio sourceとAudioDecoder/Context各1を確認。音は仮想出力へ接続し、実speaker/microphone/実画面/OS入力は使用しない。

actual Relay4件でviewer protocol/B capability/helper proofの積を検査し、未知optionの旧peer送信を抑制。NativeVideo/privateprepare/input freshness、coordinator待機/期限/加入/世代/連番/codec/失効をunitで検証。

負例6件は個別guardを戻すと失敗し、finallyでbyte一致を確認してsourceを復元後fresh buildした。draw-commit負例の初版は変更要求を待機中に再送していなかったため通ってしまい、不採用。held受信後・未描画中に要求を送る回帰へ改め、guardを戻すと失敗することを確認。

## 修正前コードの生出力


### next-profile

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-resolution

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (30 tests | 1 failed | 29 skipped) 14ms
   × coalesces another resolution request until the current format exchange completes 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > coalesces another resolution request until the current format exchange completes
AssertionError: expected [ …(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/DesktopSharedNative.test.ts:191:337


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 29 skipped (30)
   Start at  18:59:54
   Duration  812ms (transform 76%, import 22%, tests 2%)


```

### draw-commit

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-resolution

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (32 tests | 1 failed | 31 skipped) 15ms
   × coalesces another resolution request until the current format exchange completes 14ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > coalesces another resolution request until the current format exchange completes
AssertionError: expected [ …(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/DesktopSharedNative.test.ts:191:448


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 31 skipped (32)
   Start at  19:00:48
   Duration  657ms (transform 75%, import 22%, tests 3%)


```

### deferred-rate

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-resolution

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (32 tests | 1 failed | 31 skipped) 21ms
   × reapplies aggregate cadence changes only after the helper has emitted its held IDR 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > reapplies aggregate cadence changes only after the helper has emitted its held IDR
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSharedNative.test.ts:195:286


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 31 skipped (32)
   Start at  19:00:49
   Duration  686ms (transform 74%, import 22%, tests 4%)


```

### late-key

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-resolution

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (32 tests | 1 failed | 31 skipped) 13ms
   × does not give a late subscriber either profile's previously held keyframe 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > does not give a late subscriber either profile's previously held keyframe
AssertionError: expected [ { type: 'native_frame', …(10) } ] to be undefined

- Expected:
undefined

+ Received:
[
  {
    "codec": "avc1.42041f",
    "codecName": "h264",
    "data": "AAAAAQkQAAAAAWdCBB/ZQPATfl/8AAQABQgICAoAAAMAAgAAAwB5HhEIywAAAAFozjyAAAAAAWWIhC///8EUUAAQE/HAAEAmOAAISE/a+++++++++++++++++++++++++++/w//wRRQABA08cAAQP44AAia3q++++++++++++++++++++++++++++btXXXXXXXXXXXXXXXXXXXXXXXXXXXXXTquuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuunrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrp666666666666666666666666666666666666666666666666666666666666euuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuunrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr//j8FvFAAEBDEASIQAAQCgA6xACZEAJnBwAQAhkHABACGWtra2trT1111111111109ddddddddddddddddddddddddddddddddddddddddcz+paWlpaWnrrrrrrrrrrrp666666666666666666666666666666666666666666euuuuunrrrrrrrrrrrp666666666666666666666666666666666666666666euuuuunrrrrrrrrrrrp66666666666666666666666666666666666666666+I//0CuDgghFLEpCAAFQVAyUspKX4HABBRcsOACCi5fi1rAkF/a2tra09dddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT1111111111111111111111111111111111111111111111111111111111109dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT1111111111111111111111111111111111111111111111111111111111109dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT11111111111111111111111111111//x+C3igAF8QAAQFQAEQgAAgHAA6wcACABTIOABAApnBwAQAxkHABADGWtra2tra2tra2tra2tra2tra2tra2tra2tra2trh/4YAwW8UAAQBMQCVCAACAWAGWJAmRIEzg4AQApkHACAFMtbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbWbe8672tra2tra2tra2tra2tra2tra2tra2tra2tra2szvVra2tra2tra2tra2tra2tra2tra2tra2tra2traze9dddddddddddddddddddddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT1111111111111111111111111111111111111111111111111111111111109dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT1111111111111111111111111111111111111111111111111111111111109dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT1111111111111111111111111111111111111111111111111111111111109dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT1111111111111111111111111111111111111111111111111111111111109dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT1111111111111111111111111111111111111111111111111111111111109dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXT1111111111111111111111111111111111111111111111111111111111109ddddddddddddddddddddddddddddeAAAAAQz///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+A",
    "generation": 1,
    "height": 600,
    "id": "e6344530-4e73-4afa-b6b3-e9f8f5dbba19",
    "key": true,
    "seq": 1,
    "timestamp": 66666,
    "type": "native_frame",
    "width": 960,
  },
  {
    "id": "e6344530-4e73-4afa-b6b3-e9f8f5dbba19",
    "type": "native_video_stopped",
  },
]

 ❯ src/desktop/DesktopSharedNative.test.ts:198:162


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 31 skipped (32)
   Start at  19:00:50
   Duration  811ms (transform 75%, import 23%, tests 2%)


```

### drop-credit

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-resolution

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (32 tests | 1 failed | 31 skipped) 14ms
   × keeps the drawing fence after a dropped held IDR until a future keyframe is actually drawn 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > keeps the drawing fence after a dropped held IDR until a future keyframe is actually drawn
AssertionError: expected [ …(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/DesktopSharedNative.test.ts:202:286


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 31 skipped (32)
   Start at  19:00:52
   Duration  792ms (transform 74%, import 24%, tests 2%)


```

### private-drop

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-resolution

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeAdaptive.test.ts (12 tests | 1 failed | 11 skipped) 13ms
   × preserves UDP drop credit separately from a shared draw commit: true 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeAdaptive.test.ts > preserves UDP drop credit separately from a shared draw commit: true
AssertionError: expected { type: 'native_video_ack', …(2) } to deeply equal { type: 'native_video_ack', …(3) }

- Expected
+ Received

  {
-   "dropped": true,
    "id": "3577b338-7c6c-417d-80bf-967cc4a306e7",
    "seq": 1,
    "type": "native_video_ack",
  }

 ❯ src/desktop/DesktopNativeAdaptive.test.ts:61:236


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 11 skipped (12)
   Start at  19:00:53
   Duration  728ms (transform 76%, import 21%, tests 2%)


```

## Final positive results

### Full suite

```text
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-resolution/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-resolution/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-resolution/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)

 Test Files  787 passed (787)
      Tests  11789 passed (11789)
   Start at  19:02:32
   Duration  374.78s (tests 80%, import 11%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 227 times · 66.44s total, 28% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

### Typecheck

```text
packages/tui typecheck: Done
packages/web typecheck: Done
packages/server typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/server typecheck: Done
packages/cli typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/e2e typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/cli typecheck: Done
packages/e2e typecheck: Done

```

### New browser first four

```text
  ✓  1 src/specs/remote-desktop-shared-resolution.spec.ts:9:89 › shared resolution uses per-viewer barriers and one live audio source: wss (12.1s)
  ✓  2 src/specs/remote-desktop-shared-resolution.spec.ts:9:89 › shared resolution uses per-viewer barriers and one live audio source: udp (14.0s)
  ✓  3 src/specs/remote-desktop-shared-resolution.spec.ts:9:89 › shared resolution uses per-viewer barriers and one live audio source: slow-format (13.9s)
  ✓  4 src/specs/remote-desktop-shared-resolution.spec.ts:9:89 › shared resolution uses per-viewer barriers and one live audio source: late-fixed (11.9s)
  1 failed
  4 passed (1.4m)
```

### UDP loss leaf final

```text
{"ts":"2026-10-27T09:56:47.254Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T09:56:47.254Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T09:56:47.254Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T09:56:47.255Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-SWFu7w/commands.json","count":0}
{"ts":"2026-10-27T09:56:58.934Z","level":"info","msg":"machine link closed","machine":"c2dae6c5e6a52181b47125ea464c9e88","kind":"transient","reason":"接続が切れました"}
  ✓  1 src/specs/remote-desktop-shared-resolution.spec.ts:9:89 › shared resolution uses per-viewer barriers and one live audio source: late-fixed-udp-drop (12.3s)

  1 passed (13.5s)

```

### Independent smoke

```text
{"ts":"2026-10-27T10:08:05.338Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"9cd7c426-3086-4c10-9718-1cdfcb935f18","paneId":"92839b14-bb5d-4dab-8a8b-69b3a2d8dbb9"}
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke(web): typed into pane 92839b14-bb5d-4dab-8a8b-69b3a2d8dbb9
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS

```
