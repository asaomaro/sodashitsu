# 複数viewer 8B: native encoder共有

1 helper/1 encoder、mixed image/native、consumer別UUID/連番/pending、future-key復帰、設定不一致のviewer限定fallbackを検証する。WS/WSSのみ。shared音声/UDP/adaptation/保護sourceは未完了。実画面取得・OS入力・service/driver変更は行わない。

途中検証: native class12件、shared image pool15件、実WebSocket relay113件（合計140件）。browser2窓は生成hardware H264 fixtureを復号し、canvasの実pixel（赤）、300ms ACK遅延とFIFO解除、fast側の継続、slow側の復帰、1 encoderのledger、peer停止後の残存動画と入力ACK、最後のencoder停止を確認した（1 pass /13.0s）。

独立taskcheck: review_pointer/review_transferとも追加mustなし。新protocol/旧caps gate、source設定正規化、入力owner非干渉、source/consumer ID/seq/ACK、最後の停止を確認。推奨のcodec fallback引継ぎと旧protocol/旧caps拒否の明示回帰も追加した。

以下はguardを戻した実行時の生ログ。各回とも元bytesへ完全復元した。compile errorによるnegativeではない。最終の全体検証は追記する。

## Negative: future-key

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-native

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (12 tests | 1 failed | 11 skipped) 11ms
   × encodes once while a slow consumer drops references and rejoins only at a future key frame 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > encodes once while a slow consumer drops references and rejoins only at a future key frame
AssertionError: expected [ 1, 2 ] to deeply equal [ 1 ]

- Expected
+ Received

  [
    1,
+   2,
  ]

 ❯ src/desktop/DesktopSharedNative.test.ts:27:48
     25|   f.ack(f.b, f.bid, 1);
     26|   f.native.receive(f.frame(3)); f.ack(f.a, f.aid, 3);
     27|   expect(f.messages.get(f.b)?.map(m => m.seq)).toEqual([1]);
       |                                                ^
     28|   f.native.receive(f.frame(4, true));
     29|   expect(f.messages.get(f.a)?.map(m => m.seq)).toEqual([1, 2, 3, 4]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 11 skipped (12)
   Start at  07:53:14
   Duration  911ms (transform 76%, import 22%, tests 1%)


```

## Negative: pending-window

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-native

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (12 tests | 1 failed | 11 skipped) 12ms
   × does not replay a previous key frame and keeps pending windows independent 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > does not replay a previous key frame and keeps pending windows independent
AssertionError: expected [ 1, 2, 3, 4 ] to deeply equal [ 1, 2, 3 ]

- Expected
+ Received

  [
    1,
    2,
    3,
+   4,
  ]

 ❯ src/desktop/DesktopSharedNative.test.ts:41:48
     39|   expect(f.messages.get(f.b)).toBeUndefined();
     40|   f.native.receive(f.frame(2)); f.native.receive(f.frame(3)); f.native…
     41|   expect(f.messages.get(f.a)?.map(m => m.seq)).toEqual([1, 2, 3]);
       |                                                ^
     42|   expect(f.messages.get(f.b)).toBeUndefined();
     43|   f.ack(f.a, f.aid, 1); f.native.receive(f.frame(5, true));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 11 skipped (12)
   Start at  07:53:16
   Duration  889ms (transform 78%, import 20%, tests 1%)


```

## Negative: last-encoder

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-native

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (12 tests | 1 failed | 11 skipped) 9ms
   × isolates different encoder settings and stops only when the last native subscriber leaves 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > isolates different encoder settings and stops only when the last native subscriber leaves
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSharedNative.test.ts:57:73
     55|   expect(f.commands.filter(m => m.type === "native_video" && m.enabled…
     56|   f.start(f.b, f.bid); f.native.detach(f.a);
     57|   expect(f.commands.some(m => m.type === "native_video" && !m.enabled)…
       |                                                                         ^
     58|   f.native.receive(f.frame(1, true));
     59|   expect(f.messages.get(f.b)?.at(-1)).toMatchObject({ id: f.bid, seq: …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 11 skipped (12)
   Start at  07:53:18
   Duration  795ms (transform 75%, import 23%, tests 1%, worker 1%)


```

## Negative: fallback-proof

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-native

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (12 tests | 1 failed | 11 skipped) 12ms
   × requires an explicit fallback when the encoder returns a different codec 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > requires an explicit fallback when the encoder returns a different codec
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSharedNative.test.ts:105:48
    103| it("requires an explicit fallback when the encoder returns a different…
    104|  const f=setup();f.start(f.a,f.aid,{codec:"hevc"});
    105|  expect(()=>f.native.receive(f.frame(1,true))).toThrow(/fallback/);
       |                                                ^
    106|  expect(f.commands.filter(m=>m.type==="native_video_ack")).toHaveLengt…
    107| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 11 skipped (12)
   Start at  07:53:19
   Duration  728ms (transform 73%, import 25%, tests 2%)


```

## Negative: old-caps

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-native

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (113 tests | 1 failed | 112 skipped) 295ms
   × keeps old shared-only peers on images without sending unknown shared native fields 293ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps old shared-only peers on images without sending unknown shared native fields
AssertionError: expected { width: 1280, fps: 30, …(7) } to not have property "sharedNative"

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.ts:1015:42
    1013|  await vi.waitFor(()=>expect(viewer.frames.length).toBe(1));
    1014|  expect(f.startRequests[0]!.options).toHaveProperty("sharedDesktop",tr…
    1015|  expect(f.startRequests[0]!.options).not.toHaveProperty("sharedNative"…
       |                                          ^
    1016|  expect(viewer.messages.find(m=>m.type==="ready")).not.toHaveProperty(…
    1017|  }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 112 skipped (113)
   Start at  07:53:21
   Duration  1.46s (transform 63%, tests 22%, import 15%)


```

## Negative: old-protocol

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-native

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (113 tests | 1 failed | 112 skipped) 150ms
   × keeps old shared-only peers on images without sending unknown shared native fields 148ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps old shared-only peers on images without sending unknown shared native fields
AssertionError: expected { width: 1280, fps: 30, …(7) } to not have property "sharedNative"

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.ts:1015:42
    1013|  await vi.waitFor(()=>expect(viewer.frames.length).toBe(1));
    1014|  expect(f.startRequests[0]!.options).toHaveProperty("sharedDesktop",tr…
    1015|  expect(f.startRequests[0]!.options).not.toHaveProperty("sharedNative"…
       |                                          ^
    1016|  expect(viewer.messages.find(m=>m.type==="ready")).not.toHaveProperty(…
    1017|  }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 112 skipped (113)
   Start at  07:53:23
   Duration  1.34s (transform 69%, import 19%, tests 12%)


```

## Negative: mixed-source

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-native

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (113 tests | 1 failed | 112 skipped) 1139ms
   × shares one native encoder, isolates slow decoder credit, and preserves remaining viewers on stop 1137ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > shares one native encoder, isolates slow decoder credit, and preserves remaining viewers on stop
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ src/desktop/DesktopRelay.test.ts:983:119
    981|  const options={sharedDesktop:true,width:1280,fps:30,quality:65,featur…
    982|  image.send({type:"start",machineId:"remote",options});await vi.waitFo…
    983|  for(const v of [a,b]){v.send({type:"start",machineId:"remote",options…
       |                                                                                                                       ^
    984|  const media=(v:typeof a)=>v.frames.filter(isDesktopMediaChunk).map(de…
    985|  const stream=(v:typeof a)=>v.messages.filter(m=>m.type==="media_strea…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 112 skipped (113)
   Start at  07:53:25
   Duration  2.32s (tests 51%, transform 39%, import 9%)


```
