# 8C 検証記録

実browser2窓でローカルUDP candidate（getStats）をそれぞれ確認。生成hardware H264 fixtureのpixel、1 packet loss後のUDP維持/復帰、片方のpeer close後はその窓だけWSSで再開し他方のUDP/stream/encoderが継続すること、peer終了後の継続を観測した。初回1 pass /17.3s。実画面取得/OS入力/サービス変更なし。

独立review_pointer/review_transferは製品差分にmustなし。protocol/cap積、B ceiling、helper設定正規化、keyframe source ID変換・current consumer確認・100ms合計上限、A/B adaptive=false、別viewerの保持入力への非干渉を点検。任意推奨だった保持入力を、生成helperでControlLeft保持→非owner動画stop/restartの共通release teardown→owner入力継続で確認した。実UDP/WSS fallbackはbrowserで別に確認しており、保持キー回帰を実UDP実機試験と混同しない。

以下はguardだけを戻した実行時の生ログ。各回元bytesへ完全復元した。compile errorのnegativeではない。最終全体検証は追記する。

## テスト参照先の訂正

最初の全体試験は11,602 pass /1 fail。後から追加した先行画像viewerにより、互換性試験がstartRequests[0]でUDP viewerでなく画像viewerを見ていた。製品の回帰ではない。最後の要求を参照するよう訂正し、関連145件passを確認した。この誤りの影響を受けたold-caps/old-protocol/helper-normalizationの初回negativeは無効として数えず、訂正後に再実行して実行時の失敗とbytes復元を確認した。ほかの5negativeは影響しない。以下は訂正後の有効なnegative。

## Negative: keyframe-id

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (14 tests | 1 failed | 13 skipped) 10ms
   × maps consumer keyframe recovery to the live source without borrowing another viewer id 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > maps consumer keyframe recovery to the live source without borrowing another viewer id
AssertionError: expected '4e83d8ef-d28d-4b9f-b30e-50c75d00cae8' to be 'd884fe88-6b4e-42a9-8a08-78cf540a6294' // Object.is equality

Expected: "d884fe88-6b4e-42a9-8a08-78cf540a6294"
Received: "4e83d8ef-d28d-4b9f-b30e-50c75d00cae8"

 ❯ src/desktop/DesktopSharedNative.test.ts:126:58
    124|  f.native.command(f.b,{type:"native_keyframe",id:f.bid});
    125|  const requests=f.commands.filter(m=>m.type==="native_keyframe");
    126|  expect(requests).toHaveLength(1);expect(requests[0].id).toBe(root);ex…
       |                                                          ^
    127|  f.ack(f.a,f.aid,1);f.ack(f.b,f.bid,1);f.native.receive(f.frame(2));
    128|  expect(f.messages.get(f.a)).toHaveLength(1);expect(f.messages.get(f.b…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  08:18:43
   Duration  789ms (transform 79%, import 19%, tests 1%)


```

## Negative: keyframe-owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (14 tests | 1 failed | 13 skipped) 9ms
   × maps consumer keyframe recovery to the live source without borrowing another viewer id 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > maps consumer keyframe recovery to the live source without borrowing another viewer id
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSharedNative.test.ts:122:57
    120|  const root=f.frame(2).id;
    121|  f.native.command(f.a,{type:"native_keyframe",id:f.bid});
    122|  expect(f.commands.some(m=>m.type==="native_keyframe")).toBe(false);
       |                                                         ^
    123|  f.native.command(f.a,{type:"native_keyframe",id:f.aid});
    124|  f.native.command(f.b,{type:"native_keyframe",id:f.bid});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  08:18:45
   Duration  738ms (transform 75%, import 23%, tests 1%)


```

## Negative: keyframe-budget

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (14 tests | 1 failed | 13 skipped) 10ms
   × maps consumer keyframe recovery to the live source without borrowing another viewer id 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > maps consumer keyframe recovery to the live source without borrowing another viewer id
AssertionError: expected [ …(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/DesktopSharedNative.test.ts:126:19
    124|  f.native.command(f.b,{type:"native_keyframe",id:f.bid});
    125|  const requests=f.commands.filter(m=>m.type==="native_keyframe");
    126|  expect(requests).toHaveLength(1);expect(requests[0].id).toBe(root);ex…
       |                   ^
    127|  f.ack(f.a,f.aid,1);f.ack(f.b,f.bid,1);f.native.receive(f.frame(2));
    128|  expect(f.messages.get(f.a)).toHaveLength(1);expect(f.messages.get(f.b…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  08:18:46
   Duration  673ms (transform 74%, import 24%, tests 2%)


```

## Negative: old-caps

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (116 tests | 1 failed | 115 skipped) 247ms
   × negotiates shared UDP only for the new viewer and provider capability 244ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared UDP only for the new viewer and provider capability
AssertionError: expected { width: 1280, fps: 30, …(9) } to not have property "sharedDatagrams"

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.ts:1038:64


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 115 skipped (116)
   Start at  08:44:37
   Duration  1.42s (transform 64%, tests 19%, import 17%)


```

## Negative: old-protocol

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (116 tests | 1 failed | 115 skipped) 397ms
   × negotiates shared UDP only for the new viewer and provider capability 396ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared UDP only for the new viewer and provider capability
AssertionError: expected { width: 1280, fps: 30, …(9) } to not have property "sharedDatagrams"

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.ts:1038:64


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 115 skipped (116)
   Start at  08:44:39
   Duration  1.55s (transform 58%, tests 28%, import 14%)


```

## Negative: b-adaptation

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (116 tests | 1 failed | 115 skipped) 171ms
   × forces shared encoder adaptation off at B even for direct provider messages 169ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > forces shared encoder adaptation off at B even for direct provider messages
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopRelay.test.ts:1052:20
    1050|  try{
    1051|   share.ws.emit("message",Buffer.from(JSON.stringify({type:"media",ena…
    1052|   expect(adaptive).toBe(false);
       |                    ^
    1053|  }finally{spy.mockRestore();}
    1054| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 115 skipped (116)
   Start at  08:18:52
   Duration  1.16s (transform 65%, import 18%, tests 16%)


```

## Negative: input-owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (116 tests | 1 failed | 115 skipped) 441ms
   × preserves another viewer's held key and control when non-owner video stops and restarts 440ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > preserves another viewer's held key and control when non-owner video stops and restarts
AssertionError: expected { type: 'release', held: [] } to match object { type: 'key-down', …(1) }

- Expected
+ Received

  {
-   "held": [
-     "ControlLeft",
-   ],
-   "type": "key-down",
+   "held": [],
+   "type": "release",
  }

 ❯ src/desktop/DesktopRelay.test.ts:1078:25
    1076|   expect(shares.find(s=>s.control)?.control).toBe(true);
    1077|   const ledger=(await readFile(f.ledger,"utf8")).trim().split("\n").ma…
    1078|   expect(ledger.at(-1)).toMatchObject({type:"key-down",held:["ControlL…
       |                         ^
    1079|   b.send({type:"input",seq:2,frameSeq:decodeDesktopFrame(b.frames.at(-…
    1080|   await vi.waitFor(()=>expect(b.messages.some(m=>m.type==="input_ack"&…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 115 skipped (116)
   Start at  08:18:54
   Duration  1.41s (transform 49%, tests 34%, import 16%)


```

## Negative: helper-normalization

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (116 tests | 1 failed | 115 skipped) 1484ms
   × negotiates shared UDP only for the new viewer and provider capability 1482ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared UDP only for the new viewer and provider capability
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ src/desktop/DesktopRelay.test.ts:1037:53


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 115 skipped (116)
   Start at  08:44:42
   Duration  2.44s (tests 63%, transform 29%, import 8%)


```

## Initial full-suite failure (test selector corrected)

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared UDP only for the new viewer and provider capability
AssertionError: expected { width: 1280, fps: 30, …(5) } to match object { sharedDatagrams: true, …(2) }
(7 matching properties omitted from actual)

- Expected
+ Received

  {
-   "nativeDatagrams": true,
-   "sharedDatagrams": true,
-   "sharedNative": true,
+   "extendedInput": true,
+   "features": true,
+   "fps": 30,
+   "imeKeys": true,
+   "quality": 65,
+   "sharedDesktop": true,
+   "width": 1280,
  }

 ❯ src/desktop/DesktopRelay.test.ts:1039:44


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 773 passed (774)
      Tests  1 failed | 11602 passed (11603)
   Start at  08:33:53
   Duration  410.68s (tests 79%, import 11%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 225 times · 72.96s total, 29% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

## Invalid attempt (excluded): old-caps

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (116 tests | 1 failed | 115 skipped) 516ms
   × negotiates shared UDP only for the new viewer and provider capability 514ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared UDP only for the new viewer and provider capability
AssertionError: expected { width: 1280, fps: 30, …(5) } to match object { sharedDatagrams: true, …(2) }
(7 matching properties omitted from actual)

- Expected
+ Received

  {
-   "nativeDatagrams": true,
-   "sharedDatagrams": true,
-   "sharedNative": true,
+   "extendedInput": true,
+   "features": true,
+   "fps": 30,
+   "imeKeys": true,
+   "quality": 65,
+   "sharedDesktop": true,
+   "width": 1280,
  }

 ❯ src/desktop/DesktopRelay.test.ts:1039:44


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 115 skipped (116)
   Start at  08:18:48
   Duration  1.59s (transform 52%, tests 35%, import 12%)


```

## Invalid attempt (excluded): old-protocol

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (116 tests | 1 failed | 115 skipped) 613ms
   × negotiates shared UDP only for the new viewer and provider capability 611ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared UDP only for the new viewer and provider capability
AssertionError: expected { width: 1280, fps: 30, …(5) } to match object { sharedDatagrams: true, …(2) }
(7 matching properties omitted from actual)

- Expected
+ Received

  {
-   "nativeDatagrams": true,
-   "sharedDatagrams": true,
-   "sharedNative": true,
+   "extendedInput": true,
+   "features": true,
+   "fps": 30,
+   "imeKeys": true,
+   "quality": 65,
+   "sharedDesktop": true,
+   "width": 1280,
  }

 ❯ src/desktop/DesktopRelay.test.ts:1039:44


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 115 skipped (116)
   Start at  08:18:50
   Duration  1.51s (transform 44%, tests 44%, import 12%)


```

## Invalid attempt (excluded): helper-normalization

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (116 tests | 1 failed | 115 skipped) 1469ms
   × negotiates shared UDP only for the new viewer and provider capability 1467ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared UDP only for the new viewer and provider capability
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ src/desktop/DesktopRelay.test.ts:1037:53


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 115 skipped (116)
   Start at  08:18:56
   Duration  2.51s (tests 61%, transform 31%, import 9%)


```


## Final verification after corrected assertion

The second full run passed 11602 tests (one skipped); its only failed suite was the PTY freshness check because restoring negative-control source bytes made their mtimes newer than dist. Rebuilt unchanged product sources and reran that missing suite: one test passed. Aggregate verified: 11603 tests; this is not a single all-green full invocation. Browser verification: 24 passed. Independent worktree build/smoke and both independent reviews passed.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams

{"ts":"2026-10-26T23:47:13.595Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:13.598Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:13.598Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:13.607Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-agent-it-pNNQvz/a/commands.json","count":0}
{"ts":"2026-10-26T23:47:13.628Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:13.630Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:13.630Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:13.632Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:13.634Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:13.634Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:13.638Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-display-state-Mn7q3l/commands.json","count":0}
{"ts":"2026-10-26T23:47:13.644Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-prompt-it-5kHVzU/state/commands.json","count":0}
{"ts":"2026-10-26T23:47:13.656Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:13.658Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:13.658Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:13.665Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-start-it-wLc5av/state/commands.json","count":0}
{"ts":"2026-10-26T23:47:14.045Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:14.046Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:14.046Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:14.051Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-agent-it-pNNQvz/b/commands.json","count":0}
{"ts":"2026-10-26T23:47:14.375Z","level":"info","msg":"display script enabled","byClientId":"6bfcc64a-b020-40fc-babc-e75aadd5685e","byKind":"external"}
{"ts":"2026-10-26T23:47:14.413Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:47:14.453Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"main","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:47:14.454Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:47:14.457Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"main","kind":"panel","format":"text","bytes":1,"rev":2}
{"ts":"2026-10-26T23:47:14.458Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-26T23:47:14.459Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-26T23:47:14.460Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"main","reason":"closed"}
{"ts":"2026-10-26T23:47:14.460Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-26T23:47:14.461Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-26T23:47:14.462Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:7","code":"ok"}
{"ts":"2026-10-26T23:47:14.463Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:8","code":"ok"}
{"ts":"2026-10-26T23:47:14.473Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:9","code":"ok"}
{"ts":"2026-10-26T23:47:14.505Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:10","code":"ok"}
{"ts":"2026-10-26T23:47:14.543Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"quotes","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-26T23:47:14.543Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:11","code":"ok"}
{"ts":"2026-10-26T23:47:14.556Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"quotes","reason":"closed"}
{"ts":"2026-10-26T23:47:14.556Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:12","code":"ok"}
{"ts":"2026-10-26T23:47:14.569Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"viaws","kind":"band","format":"markdown","bytes":4,"rev":1}
{"ts":"2026-10-26T23:47:14.602Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"viaws","reason":"closed"}
{"ts":"2026-10-26T23:47:14.658Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:13","code":"ok"}
{"ts":"2026-10-26T23:47:15.184Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:14","code":"ok"}
{"ts":"2026-10-26T23:47:15.185Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:15","code":"ok"}
{"ts":"2026-10-26T23:47:15.211Z","level":"info","msg":"display set","paneId":"b300c85b-5a41-4992-a698-51d24829f492","name":"m","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-26T23:47:15.211Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:17","code":"ok"}
{"ts":"2026-10-26T23:47:15.215Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:16","code":"ok"}
{"ts":"2026-10-26T23:47:15.218Z","level":"info","msg":"display closed","paneId":"b300c85b-5a41-4992-a698-51d24829f492","name":"m","reason":"dismissed"}
{"ts":"2026-10-26T23:47:15.219Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:18","code":"ok"}
{"ts":"2026-10-26T23:47:15.222Z","level":"info","msg":"display set","paneId":"b300c85b-5a41-4992-a698-51d24829f492","name":"n","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-26T23:47:15.223Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:20","code":"ok"}
{"ts":"2026-10-26T23:47:15.225Z","level":"info","msg":"display reported","paneId":"b300c85b-5a41-4992-a698-51d24829f492","name":"n","problem":"navigated","format":"text"}
{"ts":"2026-10-26T23:47:15.225Z","level":"info","msg":"display closed","paneId":"b300c85b-5a41-4992-a698-51d24829f492","name":"n","reason":"navigated"}
{"ts":"2026-10-26T23:47:15.225Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:19","code":"ok"}
{"ts":"2026-10-26T23:47:15.229Z","level":"info","msg":"display set","paneId":"b300c85b-5a41-4992-a698-51d24829f492","name":"o","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-26T23:47:15.229Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:22","code":"ok"}
{"ts":"2026-10-26T23:47:15.242Z","level":"info","msg":"display closed","paneId":"b300c85b-5a41-4992-a698-51d24829f492","name":"o","reason":"closed"}
{"ts":"2026-10-26T23:47:15.243Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:21","code":"ok"}
{"ts":"2026-10-26T23:47:15.244Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:23","code":"ok"}
{"ts":"2026-10-26T23:47:15.288Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b300c85b-5a41-4992-a698-51d24829f492","connId":"pane-socket:24","code":"not_found"}
{"ts":"2026-10-26T23:47:15.293Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:b300c85b-5a41-4992-a698-51d24829f492"]}
{"ts":"2026-10-26T23:47:15.882Z","level":"info","msg":"display set","paneId":"4689b890-0f97-4dd7-9f29-1e74b5fac41f","name":"m","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-26T23:47:15.882Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"4689b890-0f97-4dd7-9f29-1e74b5fac41f","connId":"pane-socket:25","code":"ok"}
{"ts":"2026-10-26T23:47:15.901Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"4689b890-0f97-4dd7-9f29-1e74b5fac41f","connId":"pane-socket:26","code":"ok"}
{"ts":"2026-10-26T23:47:15.904Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"4689b890-0f97-4dd7-9f29-1e74b5fac41f","connId":"pane-socket:27","code":"ok"}
{"ts":"2026-10-26T23:47:15.928Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"4689b890-0f97-4dd7-9f29-1e74b5fac41f","connId":"pane-socket:28","code":"ok"}
{"ts":"2026-10-26T23:47:15.994Z","level":"info","msg":"display closed","paneId":"4689b890-0f97-4dd7-9f29-1e74b5fac41f","name":"m","reason":"pane_closed"}
{"ts":"2026-10-26T23:47:15.995Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"4689b890-0f97-4dd7-9f29-1e74b5fac41f","connId":"pane-socket:29","code":"not_found"}
{"ts":"2026-10-26T23:47:16.004Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:4689b890-0f97-4dd7-9f29-1e74b5fac41f"]}
{"ts":"2026-10-26T23:47:16.625Z","level":"info","msg":"display set","paneId":"6a9a6773-6560-425b-9784-9c97d19c8e91","name":"w","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-26T23:47:16.835Z","level":"info","msg":"display closed","paneId":"6a9a6773-6560-425b-9784-9c97d19c8e91","name":"w","reason":"pane_closed"}
{"ts":"2026-10-26T23:47:16.849Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:6a9a6773-6560-425b-9784-9c97d19c8e91"]}
{"ts":"2026-10-26T23:47:17.267Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"1c052dac-03bd-4e3f-90d0-388c016912fd","connId":"pane-socket:30","code":"ok"}
{"ts":"2026-10-26T23:47:17.268Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"1c052dac-03bd-4e3f-90d0-388c016912fd","connId":"pane-socket:31","code":"ok"}
{"ts":"2026-10-26T23:47:17.763Z","level":"info","msg":"machine link closed","machine":"7628abbb98348edf2eae6cc905a15933","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:47:18.270Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"1c052dac-03bd-4e3f-90d0-388c016912fd","connId":"pane-socket:32","code":"ok"}
{"ts":"2026-10-26T23:47:18.272Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"1c052dac-03bd-4e3f-90d0-388c016912fd","connId":"pane-socket:33","code":"ok"}
{"ts":"2026-10-26T23:47:18.272Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"1c052dac-03bd-4e3f-90d0-388c016912fd","connId":"pane-socket:34","code":"ok"}
{"ts":"2026-10-26T23:47:18.530Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"1c052dac-03bd-4e3f-90d0-388c016912fd","connId":"pane-socket:35","code":"not_found"}
{"ts":"2026-10-26T23:47:18.537Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:1c052dac-03bd-4e3f-90d0-388c016912fd"]}
{"ts":"2026-10-26T23:47:18.542Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:36","code":"ok"}
{"ts":"2026-10-26T23:47:18.543Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:37","code":"ok"}
{"ts":"2026-10-26T23:47:18.544Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:38","code":"ok"}
{"ts":"2026-10-26T23:47:18.546Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"b0","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-26T23:47:18.546Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:39","code":"ok"}
{"ts":"2026-10-26T23:47:18.549Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"b1","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-26T23:47:18.549Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:40","code":"ok"}
{"ts":"2026-10-26T23:47:18.552Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:41","code":"display_limit"}
{"ts":"2026-10-26T23:47:18.553Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:42","code":"ok"}
{"ts":"2026-10-26T23:47:18.554Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"b0","reason":"closed"}
{"ts":"2026-10-26T23:47:18.554Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"b1","reason":"closed"}
{"ts":"2026-10-26T23:47:18.554Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:43","code":"ok"}
{"ts":"2026-10-26T23:47:18.611Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:44","code":"ok"}
{"ts":"2026-10-26T23:47:18.612Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"sg","kind":"panel","format":"script-html","bytes":47,"rev":1}
{"ts":"2026-10-26T23:47:18.612Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:45","code":"ok"}
{"ts":"2026-10-26T23:47:18.615Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:46","code":"ok"}
{"ts":"2026-10-26T23:47:18.616Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:47","code":"ok"}
{"ts":"2026-10-26T23:47:18.639Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:49","code":"ok"}
{"ts":"2026-10-26T23:47:18.641Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:50","code":"ok"}
{"ts":"2026-10-26T23:47:18.674Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"sg2","kind":"band","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-26T23:47:18.694Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"st","kind":"panel","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-26T23:47:18.695Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:51","code":"ok"}
{"ts":"2026-10-26T23:47:18.698Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:52","code":"ok"}
{"ts":"2026-10-26T23:47:18.699Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:53","code":"invalid_params"}
{"ts":"2026-10-26T23:47:18.701Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:48","code":"ok"}
{"ts":"2026-10-26T23:47:18.703Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"sg","reason":"closed"}
{"ts":"2026-10-26T23:47:18.703Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"sg2","reason":"closed"}
{"ts":"2026-10-26T23:47:18.703Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"st","reason":"closed"}
{"ts":"2026-10-26T23:47:18.703Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:54","code":"ok"}
{"ts":"2026-10-26T23:47:18.703Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:55","code":"ok"}
{"ts":"2026-10-26T23:47:18.706Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:57","code":"ok"}
{"ts":"2026-10-26T23:47:18.708Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"lay","kind":"panel","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-26T23:47:18.708Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:58","code":"ok"}
{"ts":"2026-10-26T23:47:18.724Z","level":"info","msg":"display set","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"lay2","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-26T23:47:18.744Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:59","code":"ok"}
{"ts":"2026-10-26T23:47:18.746Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:60","code":"ok"}
{"ts":"2026-10-26T23:47:18.747Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"lay","reason":"closed"}
{"ts":"2026-10-26T23:47:18.747Z","level":"info","msg":"display closed","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","name":"lay2","reason":"closed"}
{"ts":"2026-10-26T23:47:18.748Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"88c3f06e-4d88-41a8-81f2-aa6e28709bc4","connId":"pane-socket:61","code":"ok"}
{"ts":"2026-10-26T23:47:19.325Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","connId":"pane-socket:62","code":"ok"}
{"ts":"2026-10-26T23:47:19.326Z","level":"info","msg":"display set","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","name":"cg","kind":"panel","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-26T23:47:19.326Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","connId":"pane-socket:63","code":"ok"}
{"ts":"2026-10-26T23:47:19.331Z","level":"info","msg":"display reported","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:47:19.333Z","level":"info","msg":"display reported","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:47:19.335Z","level":"info","msg":"display reported","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:47:19.335Z","level":"info","msg":"display closed","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","name":"cg","reason":"focus_steal"}
{"ts":"2026-10-26T23:47:19.336Z","level":"info","msg":"display script cooldown","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","reason":"focus_steal","closed":1,"ms":300000}
{"ts":"2026-10-26T23:47:19.342Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","connId":"pane-socket:64","code":"ok"}
{"ts":"2026-10-26T23:47:19.343Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","connId":"pane-socket:65","code":"display_busy"}
{"ts":"2026-10-26T23:47:19.348Z","level":"info","msg":"display set","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","name":"cg","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:47:19.348Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"3da1c3e0-6c1b-47f1-8c25-df8e59ac881b","connId":"pane-socket:66","code":"ok"}
{"ts":"2026-10-26T23:47:19.891Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7fe22461-1032-4e57-96c9-5d158c6e32bf","connId":"pane-socket:67","code":"ok"}
{"ts":"2026-10-26T23:47:19.894Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7fe22461-1032-4e57-96c9-5d158c6e32bf","connId":"pane-socket:68","code":"ok"}
{"ts":"2026-10-26T23:47:19.907Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7fe22461-1032-4e57-96c9-5d158c6e32bf","connId":"pane-socket:69","code":"ok"}
{"ts":"2026-10-26T23:47:19.913Z","level":"info","msg":"display set","paneId":"7fe22461-1032-4e57-96c9-5d158c6e32bf","name":"dg","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:47:19.914Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7fe22461-1032-4e57-96c9-5d158c6e32bf","connId":"pane-socket:70","code":"ok"}
{"ts":"2026-10-26T23:47:20.055Z","level":"info","msg":"display script enabled","byClientId":"1e11d667-062a-40c2-9656-7028aefce8b6","byKind":"external"}
{"ts":"2026-10-26T23:47:20.060Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"7fe22461-1032-4e57-96c9-5d158c6e32bf","connId":"pane-socket:71","code":"ok"}
{"ts":"2026-10-26T23:47:20.061Z","level":"info","msg":"display set","paneId":"7fe22461-1032-4e57-96c9-5d158c6e32bf","name":"dg","kind":"panel","format":"script-html","bytes":8,"rev":2}
{"ts":"2026-10-26T23:47:20.062Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7fe22461-1032-4e57-96c9-5d158c6e32bf","connId":"pane-socket:72","code":"ok"}
{"ts":"2026-10-26T23:47:20.735Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"7628abbb98348edf2eae6cc905a15933","requestId":"188472b3-b3ba-4b47-b362-d6be86d8f56b","paneId":"16c32fdb-39d6-46f7-abc9-d65c2a393c64","cause":"channel_unavailable"}
{"ts":"2026-10-26T23:47:20.736Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"7628abbb98348edf2eae6cc905a15933","requestId":"188472b3-b3ba-4b47-b362-d6be86d8f56b","paneId":"16c32fdb-39d6-46f7-abc9-d65c2a393c64","cause":"connect_failed"}
{"ts":"2026-10-26T23:47:20.960Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:20.962Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:20.962Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:20.968Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-94MAbX/commands.json","count":0}
{"ts":"2026-10-26T23:47:22.184Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:22.185Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:22.185Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:22.191Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-xEzujx/commands.json","count":0}
{"ts":"2026-10-26T23:47:22.605Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:22.607Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:22.607Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:22.613Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-T2u3xJ/commands.json","count":0}
{"ts":"2026-10-26T23:47:23.073Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:23.074Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:23.074Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:23.081Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-xmGKvz/commands.json","count":0}
{"ts":"2026-10-26T23:47:23.274Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"7628abbb98348edf2eae6cc905a15933","requestId":"188472b3-b3ba-4b47-b362-d6be86d8f56b","paneId":"16c32fdb-39d6-46f7-abc9-d65c2a393c64","cause":"connect_failed"}
{"ts":"2026-10-26T23:47:23.501Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:23.501Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:23.502Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:23.508Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-PBGGq9/commands.json","count":0}
{"ts":"2026-10-26T23:47:23.934Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:23.935Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:23.935Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:23.942Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-upbJkF/commands.json","count":0}
{"ts":"2026-10-26T23:47:24.103Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:24.105Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:24.106Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:24.114Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-it-l4uMOd/a/commands.json","count":0}
{"ts":"2026-10-26T23:47:24.367Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:24.368Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:24.368Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:24.373Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-dtwDPz/commands.json","count":0}
{"ts":"2026-10-26T23:47:24.545Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:24.546Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:24.546Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:24.551Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-it-l4uMOd/b/commands.json","count":0}
{"ts":"2026-10-26T23:47:25.043Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnected","machineId":"7628abbb98348edf2eae6cc905a15933","requestId":"188472b3-b3ba-4b47-b362-d6be86d8f56b","paneId":"16c32fdb-39d6-46f7-abc9-d65c2a393c64","elapsedMs":4308}
{"ts":"2026-10-26T23:47:25.105Z","level":"info","msg":"machine link closed","machine":"7628abbb98348edf2eae6cc905a15933","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:47:25.254Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:25.255Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:25.255Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:25.262Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-bhuQYi/commands.json","count":0}
{"ts":"2026-10-26T23:47:25.744Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"7628abbb98348edf2eae6cc905a15933","requestId":"188472b3-b3ba-4b47-b362-d6be86d8f56b","paneId":"16c32fdb-39d6-46f7-abc9-d65c2a393c64","cause":"channel_unavailable"}
{"ts":"2026-10-26T23:47:25.744Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"7628abbb98348edf2eae6cc905a15933","requestId":"188472b3-b3ba-4b47-b362-d6be86d8f56b","paneId":"16c32fdb-39d6-46f7-abc9-d65c2a393c64","cause":"connect_failed"}
{"ts":"2026-10-26T23:47:25.894Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:25.895Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:25.895Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:25.907Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-aaDOFI/commands.json","count":0}
{"ts":"2026-10-26T23:47:26.738Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnected","machineId":"7628abbb98348edf2eae6cc905a15933","requestId":"188472b3-b3ba-4b47-b362-d6be86d8f56b","paneId":"16c32fdb-39d6-46f7-abc9-d65c2a393c64","elapsedMs":994}
{"ts":"2026-10-26T23:47:27.188Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:27.190Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:27.190Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:27.196Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-state-BW6Bo8/commands.json","count":0}
{"ts":"2026-10-26T23:47:29.209Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:29.210Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:29.210Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:29.219Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-follow-state-FpGxOT/commands.json","count":0}
{"ts":"2026-10-26T23:47:29.506Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:29.508Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:29.508Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:29.518Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-panecurrent-state-62hJRw/commands.json","count":0}
{"ts":"2026-10-26T23:47:30.490Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:30.494Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:30.495Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:30.513Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-watch-state-J80f2A/commands.json","count":0}
{"event":"workspace.updated","data":{"workspace":{"id":"c9e84789-640a-4cb2-ba8c-c6318dbb7353","label":"watch-target-0","cwd":"/workspaces/sodashitsu-desktop-shared-datagrams","tabIds":["8ed3ece3-dd4a-4988-8b58-03513987ab2c"],"activeTabId":"8ed3ece3-dd4a-4988-8b58-03513987ab2c","groupId":null,"git":{"branch":"feat/desktop-shared-datagrams","ahead":0,"behind":0,"repoKey":"/workspaces/sodashitsu/.git","isLinkedWorktree":true,"worktreeKey":"/workspaces/sodashitsu/.git/worktrees/sodashitsu-desktop-shared-datagrams"},"autoLabel":false,"representative":false}}}
{"event":"graph.changed","data":{"graph":{"rev":2,"paused":false,"nodes":[{"key":"local:437c951d-497f-48f1-ac5e-5fa5753967e5","x":40,"y":60},{"key":"local:e17ebe6e-90b1-492c-81b2-8fba3aac9f59","x":40,"y":-100}],"links":[]},"byClientId":"graph"}}
{"event":"pane.updated","data":{"pane":{"id":"e17ebe6e-90b1-492c-81b2-8fba3aac9f59","tabId":"8ed3ece3-dd4a-4988-8b58-03513987ab2c","label":null,"cwd":"/workspaces/sodashitsu-desktop-shared-datagrams","shell":"","cols":120,"rows":40,"status":"running","failure":null,"busy":false,"title":"asaomaro@my-notePC: /workspaces/sodashitsu-desktop-shared-datagrams","rightClick":"herdr","agent":null,"agentSession":null}}}
{"ts":"2026-10-26T23:47:31.842Z","level":"warn","msg":"origin rejected","path":"/ws","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:35909","allowed":["localhost:35909","127.0.0.1:35909","[::1]:35909"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-26T23:47:32.753Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:32.755Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:32.755Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:32.775Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-paneenv-state-32eT6b/commands.json","count":0}
{"ts":"2026-10-26T23:47:33.969Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:33.971Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:33.971Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:33.979Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-stream-it-nmNDib/state/commands.json","count":0}
{"ts":"2026-10-26T23:47:35.236Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:35.237Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:35.237Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:35.243Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-paneenv-named-4EhnfS/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:47:35.495Z","level":"info","msg":"work agent proxy lifecycle","event":"closed","machineId":"7628abbb98348edf2eae6cc905a15933","requestId":"188472b3-b3ba-4b47-b362-d6be86d8f56b","paneId":"16c32fdb-39d6-46f7-abc9-d65c2a393c64","reason":"target_validation_failed"}
{"ts":"2026-10-26T23:47:35.522Z","level":"info","msg":"machine link closed","machine":"7628abbb98348edf2eae6cc905a15933","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:47:35.595Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:610c494e-38cc-4955-a0a4-1842951cab4e"]}
{"ts":"2026-10-26T23:47:36.270Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:2b268682-e262-42c6-acfa-c22d129a3e2b"]}
{"ts":"2026-10-26T23:47:36.629Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:36.631Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:36.631Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:36.638Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-graph-it-state-IrvoAa/commands.json","count":0}
{"ts":"2026-10-26T23:47:36.665Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:767eefae-b009-4299-8f1b-041b3f7ebb31"]}
{"ts":"2026-10-26T23:47:36.920Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:36.922Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:36.922Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:36.931Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-attach-it-z2aSYf/state/commands.json","count":0}
{"ts":"2026-10-26T23:47:37.190Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:2795ba04-2f18-416b-b2b3-b88c81ceea38"]}
{"ts":"2026-10-26T23:47:39.690Z","level":"warn","msg":"origin rejected","path":"/ws","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:40161","allowed":["localhost:40161","127.0.0.1:40161","[::1]:40161"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-26T23:47:39.694Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:a9c7bfe3-a5cb-4055-923d-8a8f05ed6fa1"]}
{"ts":"2026-10-26T23:47:39.909Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:39.911Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:39.912Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:39.921Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-exec-it-P9xdTQ/a/commands.json","count":0}
{"ts":"2026-10-26T23:47:40.400Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:40.401Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:40.401Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:40.405Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-exec-it-P9xdTQ/b/commands.json","count":0}
{"ts":"2026-10-26T23:47:40.744Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:47:40.746Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:47:40.746Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:47:40.752Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-agent-it-state-kaXwxQ/commands.json","count":0}
{"ts":"2026-10-26T23:47:41.448Z","level":"info","msg":"machine link closed","machine":"eff65e86cd21b2416ba7ca9d159e8a35","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:48:04.886Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:04.888Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:04.889Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:04.893Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:04.894Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:04.895Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:04.897Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-QwvANv/commands.json","count":0}
{"ts":"2026-10-26T23:48:04.901Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-YphnOy/commands.json","count":0}
{"ts":"2026-10-26T23:48:05.118Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:05.120Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:05.120Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:05.126Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-lgGHZC/commands.json","count":0}
{"ts":"2026-10-26T23:48:05.393Z","level":"info","msg":"extension started","extension":"user:env","run":"8565bd77-dba9-4c6a-8dfa-f2388e42326e","state":"running"}
{"ts":"2026-10-26T23:48:05.649Z","level":"info","msg":"agent session attached","paneId":"bc4e1746-b8fd-4adc-929f-5757706b4deb","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:48:05.782Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:05.782Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:05.783Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:05.788Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-NXGTUP/commands.json","count":0}
{"ts":"2026-10-26T23:48:05.813Z","level":"info","msg":"agent session attached","paneId":"2d2008ea-2627-4631-b383-2e7a7536c4ff","kind":"claude","session":"conv-KIL","source":"hook"}
{"ts":"2026-10-26T23:48:06.029Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:06.030Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:06.030Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:06.034Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-lgGHZC/commands.json","count":0}
{"ts":"2026-10-26T23:48:06.190Z","level":"info","msg":"extension started","extension":"user:a","run":"2c218706-e729-42b2-99e3-f16bee3d59f1","state":"running"}
{"ts":"2026-10-26T23:48:06.199Z","level":"info","msg":"extension started","extension":"user:b","run":"af8a3371-e1a3-461d-9185-884e45c9da47","state":"running"}
{"ts":"2026-10-26T23:48:06.353Z","level":"info","msg":"agent resume command written","paneId":"2d2008ea-2627-4631-b383-2e7a7536c4ff","kind":"claude","session":"conv-KIL"}
{"ts":"2026-10-26T23:48:06.431Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:06.432Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:06.432Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:06.438Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-EeHt1W/commands.json","count":0}
{"ts":"2026-10-26T23:48:06.490Z","level":"info","msg":"extension started","extension":"user:c","run":"cb357ad5-38f4-40cc-acc7-35ba893df6be","state":"running"}
{"ts":"2026-10-26T23:48:06.661Z","level":"info","msg":"extension started","extension":"user:a","run":"8494e9c8-889e-4e6a-9a15-2e9fc503c0d8","state":"running"}
{"ts":"2026-10-26T23:48:06.837Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:06.838Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:06.838Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:06.846Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-nuOvFf/commands.json","count":0}
{"ts":"2026-10-26T23:48:07.001Z","level":"info","msg":"agent session attached","paneId":"836211af-af8c-43f5-9e17-c8e7e50a175f","kind":"claude","session":"conv-TER","source":"hook"}
{"ts":"2026-10-26T23:48:07.201Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:07.202Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:07.202Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:07.207Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-EeHt1W/commands.json","count":0}
{"ts":"2026-10-26T23:48:07.239Z","level":"info","msg":"extension started","extension":"user:basic","run":"2fb50c73-236a-4bd4-934f-3c89a07115cc","state":"running"}
{"ts":"2026-10-26T23:48:07.267Z","level":"info","msg":"display set","paneId":"463236cf-99c2-493a-9583-cd5476ac22aa","name":"m","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:48:07.276Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"463236cf-99c2-493a-9583-cd5476ac22aa","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:48:07.394Z","level":"info","msg":"display set","paneId":"463236cf-99c2-493a-9583-cd5476ac22aa","name":"w","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:48:07.526Z","level":"info","msg":"agent resume command written","paneId":"836211af-af8c-43f5-9e17-c8e7e50a175f","kind":"claude","session":"conv-TER"}
{"ts":"2026-10-26T23:48:07.622Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:07.622Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:07.622Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:07.628Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-cUZ8Ov/commands.json","count":0}
{"ts":"2026-10-26T23:48:07.951Z","level":"info","msg":"display closed","paneId":"463236cf-99c2-493a-9583-cd5476ac22aa","name":"m","reason":"closed"}
{"ts":"2026-10-26T23:48:08.039Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:08.040Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:08.040Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:08.047Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Yq1PaZ/commands.json","count":0}
{"ts":"2026-10-26T23:48:08.252Z","level":"info","msg":"agent session attached","paneId":"a21a314c-0d11-4657-aade-2a262b25f407","kind":"claude","session":"conv-HUP","source":"hook"}
{"ts":"2026-10-26T23:48:08.490Z","level":"info","msg":"extension started","extension":"user:own","run":"0e911d6c-7e57-4790-b027-333ca5dc72b5","state":"running"}
{"ts":"2026-10-26T23:48:08.521Z","level":"info","msg":"display set","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","name":"mine","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:48:08.531Z","level":"info","msg":"display set","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","name":"theirs","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:48:08.531Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:48:08.589Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:08.590Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:08.590Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:08.598Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-cUZ8Ov/commands.json","count":0}
{"ts":"2026-10-26T23:48:08.916Z","level":"info","msg":"agent resume command written","paneId":"a21a314c-0d11-4657-aade-2a262b25f407","kind":"claude","session":"conv-HUP"}
{"ts":"2026-10-26T23:48:08.977Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:08.978Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:08.978Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:08.982Z","level":"info","msg":"agent session attached","paneId":"19c38936-e09c-47da-91de-5c7dea8874d5","kind":"claude","session":"60298daf","source":"hook"}
{"ts":"2026-10-26T23:48:08.984Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-Vl053Z/commands.json","count":0}
{"ts":"2026-10-26T23:48:09.170Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:48:09.172Z","level":"info","msg":"display closed","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","name":"mine","reason":"closed"}
{"ts":"2026-10-26T23:48:09.172Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-26T23:48:09.174Z","level":"info","msg":"display set","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","name":"mine","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:48:09.175Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-26T23:48:09.195Z","level":"info","msg":"extension exited","extension":"user:own","run":"0e911d6c-7e57-4790-b027-333ca5dc72b5","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:09.223Z","level":"info","msg":"extension started","extension":"user:own","run":"7086a54a-b958-4329-836c-9c8b3a4336cb","state":"running"}
{"ts":"2026-10-26T23:48:09.269Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b4f072fa-f7ce-4621-8760-fd23ace33654","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-26T23:48:09.368Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:09.369Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:09.369Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:09.377Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-cY0KuS/commands.json","count":0}
{"ts":"2026-10-26T23:48:09.547Z","level":"info","msg":"agent session attached","paneId":"fc3a3e9a-9bd6-4b75-aa6e-0d6532d3b5ab","kind":"claude","session":"conv-gra","source":"hook"}
{"ts":"2026-10-26T23:48:09.779Z","level":"info","msg":"extension started","extension":"user:crash","run":"9da86916-7fba-4e8a-ba55-5f396fc91ef1","state":"running"}
{"ts":"2026-10-26T23:48:09.831Z","level":"info","msg":"extension exited","extension":"user:crash","run":"9da86916-7fba-4e8a-ba55-5f396fc91ef1","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:09.940Z","level":"info","msg":"extension started","extension":"user:crash","run":"2377bb2c-2318-4d73-8ab8-6df1d475e9d9","state":"running"}
{"ts":"2026-10-26T23:48:09.973Z","level":"info","msg":"extension exited","extension":"user:crash","run":"2377bb2c-2318-4d73-8ab8-6df1d475e9d9","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:10.020Z","level":"info","msg":"extension started","extension":"user:crash","run":"0de3a4f3-b59c-45d8-858e-29c6a128149b","state":"running"}
{"ts":"2026-10-26T23:48:10.054Z","level":"info","msg":"extension exited","extension":"user:crash","run":"0de3a4f3-b59c-45d8-858e-29c6a128149b","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:10.155Z","level":"info","msg":"extension started","extension":"user:crash","run":"b82c78d4-b383-4e0e-aa33-a1566ddd52a0","state":"running"}
{"ts":"2026-10-26T23:48:10.208Z","level":"info","msg":"extension exited","extension":"user:crash","run":"b82c78d4-b383-4e0e-aa33-a1566ddd52a0","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:10.299Z","level":"info","msg":"extension started","extension":"user:crash","run":"bb6654c4-bb5b-4735-aa37-062023b7f81d","state":"running"}
{"ts":"2026-10-26T23:48:10.347Z","level":"info","msg":"extension exited","extension":"user:crash","run":"bb6654c4-bb5b-4735-aa37-062023b7f81d","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:10.347Z","level":"warn","msg":"extension failed","extension":"user:crash","state":"failed","failures":5}
{"ts":"2026-10-26T23:48:10.489Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:10.489Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:10.489Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:10.498Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-N56fO4/commands.json","count":0}
{"ts":"2026-10-26T23:48:10.887Z","level":"info","msg":"extension started","extension":"user:a","run":"6b7192e3-1a6e-4d61-91c4-351fa4de80f0","state":"running"}
{"ts":"2026-10-26T23:48:10.895Z","level":"info","msg":"extension started","extension":"user:b","run":"422fba8a-a786-497c-b44b-629183a1b037","state":"running"}
{"ts":"2026-10-26T23:48:11.228Z","level":"info","msg":"extension exited","extension":"user:b","run":"422fba8a-a786-497c-b44b-629183a1b037","code":0,"signal":null,"reason":"exited"}
{"ts":"2026-10-26T23:48:12.779Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:12.780Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:12.780Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:12.786Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-Vl053Z/commands.json","count":0}
{"ts":"2026-10-26T23:48:13.105Z","level":"info","msg":"agent resume command written","paneId":"fc3a3e9a-9bd6-4b75-aa6e-0d6532d3b5ab","kind":"claude","session":"conv-gra"}
{"ts":"2026-10-26T23:48:13.112Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:13.113Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:13.113Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:13.124Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-O3ROdp/commands.json","count":0}
{"ts":"2026-10-26T23:48:13.163Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:13.164Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:13.164Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:13.171Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-4B6ENk/commands.json","count":0}
{"ts":"2026-10-26T23:48:13.382Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:13.383Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:13.383Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:13.391Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-91aSIl/commands.json","count":0}
{"ts":"2026-10-26T23:48:13.706Z","level":"info","msg":"agent session attached","paneId":"aacf1884-0b7c-4329-820f-8a91567251fe","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:48:13.748Z","level":"info","msg":"agent session attached","paneId":"fddccea2-fef5-4356-8aba-24b38742b6bf","kind":"claude","session":"conv-lat","source":"hook"}
{"ts":"2026-10-26T23:48:13.785Z","level":"info","msg":"extension started","extension":"user:noisy","run":"814db9dc-6d28-49f2-8b8a-2019f2cf7fde","state":"running"}
{"ts":"2026-10-26T23:48:14.131Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:14.132Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:14.132Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:14.139Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-nANscJ/commands.json","count":0}
{"ts":"2026-10-26T23:48:14.564Z","level":"info","msg":"extension started","extension":"user:once","run":"071fa38a-3317-4aeb-945f-e23aefffc006","state":"running"}
{"ts":"2026-10-26T23:48:14.760Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:14.761Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:14.761Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:14.770Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-nANscJ/commands.json","count":0}
{"ts":"2026-10-26T23:48:15.155Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:15.156Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:15.156Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:15.163Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-zSdVaN/commands.json","count":0}
{"ts":"2026-10-26T23:48:15.566Z","level":"info","msg":"extension started","extension":"user:four","run":"9342db87-1590-488e-bdc5-80ef80f706b4","state":"running"}
{"ts":"2026-10-26T23:48:15.600Z","level":"info","msg":"display set","paneId":"2942e86b-4e0d-4b13-8632-ffbf172a1d37","name":"e1","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-26T23:48:15.601Z","level":"info","msg":"display set","paneId":"2942e86b-4e0d-4b13-8632-ffbf172a1d37","name":"e2","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-26T23:48:15.684Z","level":"info","msg":"display set","paneId":"2942e86b-4e0d-4b13-8632-ffbf172a1d37","name":"p1","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:48:15.684Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"2942e86b-4e0d-4b13-8632-ffbf172a1d37","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:48:15.706Z","level":"info","msg":"display set","paneId":"2942e86b-4e0d-4b13-8632-ffbf172a1d37","name":"p2","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:48:15.706Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"2942e86b-4e0d-4b13-8632-ffbf172a1d37","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:48:16.417Z","level":"info","msg":"display closed","paneId":"2942e86b-4e0d-4b13-8632-ffbf172a1d37","name":"e1","reason":"closed"}
{"ts":"2026-10-26T23:48:16.418Z","level":"info","msg":"display closed","paneId":"2942e86b-4e0d-4b13-8632-ffbf172a1d37","name":"e2","reason":"closed"}
{"ts":"2026-10-26T23:48:16.522Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:16.522Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:16.522Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:16.530Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-BZnjyr/commands.json","count":0}
{"ts":"2026-10-26T23:48:16.985Z","level":"info","msg":"extension started","extension":"user:bad","run":"83107595-fe9d-4cd5-ae87-d554be114194","state":"running"}
{"ts":"2026-10-26T23:48:16.995Z","level":"info","msg":"extension started","extension":"user:big","run":"abc19771-57b4-4e7c-bc34-5a4f89e8e31e","state":"running"}
{"ts":"2026-10-26T23:48:17.044Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"83107595-fe9d-4cd5-ae87-d554be114194","reason":"bad_lines"}
{"ts":"2026-10-26T23:48:17.062Z","level":"info","msg":"extension exited","extension":"user:bad","run":"83107595-fe9d-4cd5-ae87-d554be114194","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-26T23:48:17.110Z","level":"info","msg":"extension started","extension":"user:bad","run":"fada2ba1-4cf0-4243-8c7b-87b36b083d9f","state":"running"}
{"ts":"2026-10-26T23:48:17.116Z","level":"info","msg":"agent session attached","paneId":"58ff0e31-b978-4520-a752-993a392b136e","kind":"claude","session":"1fb01d1e","source":"hook"}
{"ts":"2026-10-26T23:48:17.147Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"fada2ba1-4cf0-4243-8c7b-87b36b083d9f","reason":"bad_lines"}
{"ts":"2026-10-26T23:48:17.148Z","level":"info","msg":"extension exited","extension":"user:bad","run":"fada2ba1-4cf0-4243-8c7b-87b36b083d9f","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-26T23:48:17.198Z","level":"info","msg":"extension started","extension":"user:bad","run":"77c5522b-1732-4b44-91a4-72c73327a86d","state":"running"}
{"ts":"2026-10-26T23:48:17.230Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"77c5522b-1732-4b44-91a4-72c73327a86d","reason":"bad_lines"}
{"ts":"2026-10-26T23:48:17.231Z","level":"info","msg":"extension exited","extension":"user:bad","run":"77c5522b-1732-4b44-91a4-72c73327a86d","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-26T23:48:17.373Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:17.373Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:17.374Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:17.383Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-GZphxk/commands.json","count":0}
{"ts":"2026-10-26T23:48:17.836Z","level":"info","msg":"extension started","extension":"user:plain","run":"78d0c420-972f-4c6d-917c-c3b604aa3dd2","state":"running"}
{"ts":"2026-10-26T23:48:17.855Z","level":"info","msg":"extension started","extension":"user:allowed","run":"bf002b20-ad21-44b3-81fe-f665ebe93858","state":"running"}
{"ts":"2026-10-26T23:48:18.011Z","level":"info","msg":"display script enabled","byClientId":"fb8c2340-0dc4-44e7-872e-426ea44c3f74","byKind":"external"}
{"ts":"2026-10-26T23:48:18.136Z","level":"info","msg":"display script enabled","byClientId":"fb8c2340-0dc4-44e7-872e-426ea44c3f74","byKind":"external"}
{"ts":"2026-10-26T23:48:18.157Z","level":"info","msg":"display set","paneId":"02079cde-eb60-44ed-bfba-113ed1eae8fd","name":"g","kind":"panel","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-26T23:48:18.239Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"02079cde-eb60-44ed-bfba-113ed1eae8fd","connId":"pane-socket:1","code":"display_closed"}
{"ts":"2026-10-26T23:48:18.298Z","level":"info","msg":"display closed","paneId":"02079cde-eb60-44ed-bfba-113ed1eae8fd","name":"g","reason":"script_disabled"}
{"ts":"2026-10-26T23:48:18.380Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:18.380Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:18.380Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:18.390Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-fhGhCC/commands.json","count":0}
{"ts":"2026-10-26T23:48:18.844Z","level":"info","msg":"extension started","extension":"user:hello","run":"41b96b63-88fe-4ad7-b6dc-652fa59bad66","state":"running"}
{"ts":"2026-10-26T23:48:18.873Z","level":"info","msg":"display set","paneId":"1a0b7335-6a3b-4f36-a02c-77a06e3d705b","name":"hello","kind":"band","format":"text","bytes":33,"rev":1}
{"ts":"2026-10-26T23:48:19.010Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"1a0b7335-6a3b-4f36-a02c-77a06e3d705b","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:48:19.055Z","level":"info","msg":"display closed","paneId":"1a0b7335-6a3b-4f36-a02c-77a06e3d705b","name":"hello","reason":"closed"}
{"ts":"2026-10-26T23:48:19.135Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"1a0b7335-6a3b-4f36-a02c-77a06e3d705b","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:48:19.194Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:19.195Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:19.195Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:19.203Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Uu7VbU/commands.json","count":0}
{"ts":"2026-10-26T23:48:19.607Z","level":"info","msg":"extension started","extension":"user:t10","run":"e9c30406-1bae-4c3e-85c7-43d0b63510ee","state":"running"}
{"ts":"2026-10-26T23:48:19.987Z","level":"info","msg":"extension started","extension":"user:t10","run":"98bcaeb6-a8ba-4855-9b6b-f2dd73644ef4","state":"running"}
{"ts":"2026-10-26T23:48:20.158Z","level":"info","msg":"pane socket: request","op":"extension.list","paneId":"ac7b8001-418e-42b4-a1ca-abba52c8844f","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-26T23:48:20.159Z","level":"info","msg":"pane socket: request","op":"extension.setEnabled","paneId":"ac7b8001-418e-42b4-a1ca-abba52c8844f","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-26T23:48:20.161Z","level":"info","msg":"pane socket: request","op":"extension.reload","paneId":"ac7b8001-418e-42b4-a1ca-abba52c8844f","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-26T23:48:20.217Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:20.218Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:20.218Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:20.226Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-lRBp4f/commands.json","count":0}
{"ts":"2026-10-26T23:48:21.018Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:aacf1884-0b7c-4329-820f-8a91567251fe"]}
{"ts":"2026-10-26T23:48:21.178Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:21.179Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:21.180Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:21.188Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-JFdioQ/commands.json","count":0}
{"ts":"2026-10-26T23:48:21.818Z","level":"info","msg":"agent session attached","paneId":"e68ca63d-b6f8-4736-83d4-98a33a8d7025","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:48:22.743Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:22.744Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:22.745Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:22.754Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-FGkZ8f/commands.json","count":0}
{"ts":"2026-10-26T23:48:23.149Z","level":"info","msg":"extension started","extension":"user:slow","run":"f3cd0ca1-5bca-42f6-a4b4-27016364b941","state":"running"}
{"ts":"2026-10-26T23:48:23.345Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:23.346Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:23.346Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:23.353Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Ml3pnW/commands.json","count":0}
{"ts":"2026-10-26T23:48:25.183Z","level":"info","msg":"agent session attached","paneId":"c0c7707f-9e6c-43bd-bb45-1aead297f74c","kind":"claude","session":"7eef5faa","source":"hook"}
{"ts":"2026-10-26T23:48:25.185Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:25.185Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:25.186Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:25.193Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Ml3pnW/commands.json","count":0}
{"ts":"2026-10-26T23:48:25.534Z","level":"info","msg":"agent resume skipped","paneId":"094aa854-e349-411a-90ae-e37f246bb200","reason":"no-session-ref"}
{"ts":"2026-10-26T23:48:25.838Z","level":"info","msg":"agent resume skipped","paneId":"98431afa-cb53-43ec-a16d-190e79459615","reason":"no-session-ref"}
{"ts":"2026-10-26T23:48:25.994Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:25.995Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:25.996Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:26.005Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-XEkKqK/commands.json","count":0}
{"ts":"2026-10-26T23:48:26.992Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:26.992Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:26.992Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:27.015Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-0P7But/commands.json","count":0}
{"ts":"2026-10-26T23:48:27.256Z","level":"info","msg":"agent session attached","paneId":"bb2361a3-38d7-492a-95ef-e949cca61e36","kind":"claude","session":"conv-qui","source":"hook"}
{"ts":"2026-10-26T23:48:27.974Z","level":"info","msg":"agent session attached","paneId":"7af60018-494c-4ce9-9928-9e9bb53f352f","kind":"claude","session":"b666ace5","source":"hook"}
{"ts":"2026-10-26T23:48:30.164Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:30.165Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:30.165Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:30.174Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-HnRZz2/commands.json","count":0}
{"ts":"2026-10-26T23:48:31.236Z","level":"info","msg":"pane socket: request","op":"extension.approve","paneId":"fb3607bb-13ad-43a5-941f-4260a482e461","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-26T23:48:31.237Z","level":"info","msg":"pane socket: request","op":"extension.deny","paneId":"fb3607bb-13ad-43a5-941f-4260a482e461","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-26T23:48:31.238Z","level":"info","msg":"pane socket: request","op":"extension.revoke","paneId":"fb3607bb-13ad-43a5-941f-4260a482e461","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-26T23:48:31.593Z","level":"info","msg":"extension started","extension":"project:c3a92cad059d33777d8dd0f091035b6117725d84d2dbcf8aa92269792c1449cc:p2","run":"b3e93987-0a9a-4c90-bfdb-a4e61591a03b","state":"running"}
{"ts":"2026-10-26T23:48:31.786Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:31.786Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:31.787Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:31.795Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-HnRZz2/commands.json","count":0}
{"ts":"2026-10-26T23:48:32.081Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:32.083Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:32.084Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:32.093Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-crjWnP/commands.json","count":0}
{"ts":"2026-10-26T23:48:32.116Z","level":"info","msg":"agent resume skipped","paneId":"fb3607bb-13ad-43a5-941f-4260a482e461","reason":"no-session-ref"}
{"ts":"2026-10-26T23:48:32.420Z","level":"info","msg":"agent resume skipped","paneId":"a9d7b9cd-0fc0-4985-9fff-8e6de68b375f","reason":"no-session-ref"}
{"ts":"2026-10-26T23:48:32.456Z","level":"info","msg":"extension started","extension":"project:c3a92cad059d33777d8dd0f091035b6117725d84d2dbcf8aa92269792c1449cc:p2","run":"38c820bd-dfad-46d6-95f7-f28946deeb8e","state":"running"}
{"ts":"2026-10-26T23:48:32.829Z","level":"info","msg":"agent session attached","paneId":"bda1f7bf-3b0f-4a28-a10b-86fe252274e8","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:48:32.992Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:32.993Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:32.993Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:33.004Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-HnRZz2/sessions/other/commands.json","count":0}
{"ts":"2026-10-26T23:48:33.827Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:33.828Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:33.828Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:33.839Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-1Z5bKt/commands.json","count":0}
{"ts":"2026-10-26T23:48:33.904Z","level":"info","msg":"extension started","extension":"project:c3a92cad059d33777d8dd0f091035b6117725d84d2dbcf8aa92269792c1449cc:p2","run":"18a80e07-40ea-4b2c-b8ec-c056f0a033c0","state":"running"}
{"ts":"2026-10-26T23:48:34.142Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:34.143Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:34.144Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:34.151Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-OveFJd/commands.json","count":0}
{"ts":"2026-10-26T23:48:34.421Z","level":"info","msg":"agent session attached","paneId":"6e6264c6-740e-4c92-8c49-96e3a10ade44","kind":"claude","session":"../../et","source":"hook"}
{"ts":"2026-10-26T23:48:35.107Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:35.108Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:35.108Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:35.116Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-rPurED/commands.json","count":0}
{"ts":"2026-10-26T23:48:35.269Z","level":"info","msg":"extension started","extension":"project:1fad770b73d62e8a523c59c44f960612ca26474b9bcbe7b533ee5971120a7611:a","run":"e30dff91-ffe2-4f34-9d14-243a19bdfc98","state":"running"}
{"ts":"2026-10-26T23:48:35.325Z","level":"info","msg":"extension started","extension":"project:1fad770b73d62e8a523c59c44f960612ca26474b9bcbe7b533ee5971120a7611:b","run":"dee0a774-52cf-432f-9aba-241367b832d4","state":"running"}
{"ts":"2026-10-26T23:48:35.714Z","level":"info","msg":"extension started","extension":"project:1fad770b73d62e8a523c59c44f960612ca26474b9bcbe7b533ee5971120a7611:a","run":"d32ad016-145c-4d66-a8fc-0aa2c9703f48","state":"running"}
{"ts":"2026-10-26T23:48:35.828Z","level":"info","msg":"agent session attached","paneId":"1b60ae14-c728-4e5f-91c3-077b27f872e2","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:48:36.116Z","level":"info","msg":"extension started","extension":"project:1fad770b73d62e8a523c59c44f960612ca26474b9bcbe7b533ee5971120a7611:a","run":"5a7a1ba3-9c09-4df6-9d22-9cbfe514a76a","state":"running"}
{"ts":"2026-10-26T23:48:36.452Z","level":"info","msg":"extension started","extension":"project:1fad770b73d62e8a523c59c44f960612ca26474b9bcbe7b533ee5971120a7611:a","run":"1c49f550-489b-4d6d-8edf-c6194756664c","state":"running"}
{"ts":"2026-10-26T23:48:36.793Z","level":"info","msg":"extension started","extension":"project:1fad770b73d62e8a523c59c44f960612ca26474b9bcbe7b533ee5971120a7611:a","run":"94824321-b632-41d0-9a0f-8415134cb523","state":"running"}
{"ts":"2026-10-26T23:48:36.943Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:1b60ae14-c728-4e5f-91c3-077b27f872e2"]}
{"ts":"2026-10-26T23:48:37.430Z","level":"info","msg":"agent session dropped (agent gone, shell alive)","paneId":"bb2361a3-38d7-492a-95ef-e949cca61e36","graceMs":10000,"kind":"claude","session":"conv-qui","reason":"agent ended"}
{"ts":"2026-10-26T23:48:37.541Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:37.542Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:37.542Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:37.550Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-XEkKqK/commands.json","count":0}
{"ts":"2026-10-26T23:48:37.666Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:37.666Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:37.666Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:37.674Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-rqqAZJ/commands.json","count":0}
{"ts":"2026-10-26T23:48:37.875Z","level":"info","msg":"agent resume skipped","paneId":"bb2361a3-38d7-492a-95ef-e949cca61e36","reason":"no-session-ref"}
{"ts":"2026-10-26T23:48:38.725Z","level":"info","msg":"extension started","extension":"project:90de528f7bc613cd1a168b1e308ac01ddc89ab2ca54b089ab06dff70b96a7d52:p4","run":"ef8c53b2-bc3b-4f14-b680-cad3069af766","state":"running"}
{"ts":"2026-10-26T23:48:38.771Z","level":"info","msg":"extension exited","extension":"project:90de528f7bc613cd1a168b1e308ac01ddc89ab2ca54b089ab06dff70b96a7d52:p4","run":"ef8c53b2-bc3b-4f14-b680-cad3069af766","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:39.014Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:0f55f6d4-efdb-4105-b82b-95d1beb8bd9f"]}
{"ts":"2026-10-26T23:48:39.059Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:39.060Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:39.060Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:39.071Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-lm46bE/commands.json","count":0}
{"ts":"2026-10-26T23:48:39.650Z","level":"info","msg":"agent session attached","paneId":"273ec3b5-2cda-421d-8d68-235afae17ccb","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:48:39.932Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:39.933Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:39.933Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:39.940Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-gqJRvx/commands.json","count":0}
{"ts":"2026-10-26T23:48:40.395Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:40.396Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:40.396Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:40.405Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-BUw4xe/commands.json","count":0}
{"ts":"2026-10-26T23:48:41.242Z","level":"info","msg":"agent session attached","paneId":"b090c8db-d4ba-4ada-8525-2676313dafaa","kind":"claude","session":"conv-bc","source":"hook"}
{"ts":"2026-10-26T23:48:41.294Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:41.295Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:41.295Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:41.303Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-gqJRvx/commands.json","count":0}
{"ts":"2026-10-26T23:48:41.621Z","level":"info","msg":"agent resume command written","paneId":"b090c8db-d4ba-4ada-8525-2676313dafaa","kind":"claude","session":"conv-bc"}
{"ts":"2026-10-26T23:48:41.680Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:41.680Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:41.680Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:41.687Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-iehM6s/state-gqJRvx/commands.json","count":0}
{"ts":"2026-10-26T23:48:41.878Z","level":"info","msg":"extension started","extension":"project:a6b0c730e2a3e8ad7ebc87a6ec7638046dad02b69ebe0e18befe43a71b0fb735:p5","run":"de35a6f5-e385-40c5-99b2-c3c74972e484","state":"running"}
{"ts":"2026-10-26T23:48:42.005Z","level":"info","msg":"agent resume command written","paneId":"b090c8db-d4ba-4ada-8525-2676313dafaa","kind":"claude","session":"conv-bc"}
{"ts":"2026-10-26T23:48:42.143Z","level":"info","msg":"extension started","extension":"project:a6b0c730e2a3e8ad7ebc87a6ec7638046dad02b69ebe0e18befe43a71b0fb735:p5","run":"b2958e16-6d67-48cc-ae95-4d1ffbc65cf7","state":"running"}
{"ts":"2026-10-26T23:48:42.213Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:42.213Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:42.213Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:42.223Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-BUw4xe/sessions/other/commands.json","count":0}
{"ts":"2026-10-26T23:48:42.399Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:42.401Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:42.401Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:42.408Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-433CFu/commands.json","count":0}
{"ts":"2026-10-26T23:48:42.927Z","level":"info","msg":"extension started","extension":"project:a6b0c730e2a3e8ad7ebc87a6ec7638046dad02b69ebe0e18befe43a71b0fb735:p5","run":"e6cf0411-be5f-4b59-ad79-0bad18f9a6f8","state":"running"}
{"ts":"2026-10-26T23:48:42.986Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:42.988Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:42.989Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:42.998Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-rol9mc/commands.json","count":0}
{"ts":"2026-10-26T23:48:43.006Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:a079208c-1bb4-425a-ac00-819ed019cd86"]}
{"ts":"2026-10-26T23:48:44.109Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:44.110Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:44.110Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:44.121Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-uKwli0/commands.json","count":0}
{"ts":"2026-10-26T23:48:44.432Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:44.433Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:44.433Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:44.441Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-YHVvax/commands.json","count":0}
{"ts":"2026-10-26T23:48:45.260Z","level":"info","msg":"extension started","extension":"project:7e8fdf4a0b10c3165f7474b53967b48771bdd5ff773a447961edf12dac995193:p5b","run":"f9e75bd0-4a9a-4f37-bc4f-88133c95ba19","state":"running"}
{"ts":"2026-10-26T23:48:45.338Z","level":"info","msg":"extension exited","extension":"project:7e8fdf4a0b10c3165f7474b53967b48771bdd5ff773a447961edf12dac995193:p5b","run":"f9e75bd0-4a9a-4f37-bc4f-88133c95ba19","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:45.843Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:45.844Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:45.844Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:45.855Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-ZqeCJz/commands.json","count":0}
{"ts":"2026-10-26T23:48:45.881Z","level":"warn","msg":"subagents: too many, not counting more","paneId":"1592b8e5-9b0d-491d-865c-d61c21ad52fe","limit":256}
{"ts":"2026-10-26T23:48:46.041Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:46.042Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:46.042Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:46.050Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-KGSKh2/commands.json","count":0}
{"ts":"2026-10-26T23:48:46.574Z","level":"info","msg":"agent session attached","paneId":"d8df51e6-12fb-46b7-9726-99b1bd62742a","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:48:46.941Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:46.942Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:46.942Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:46.952Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-c0xjby/commands.json","count":0}
{"ts":"2026-10-26T23:48:48.348Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:48.351Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:48.352Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:48.361Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-RoxrkC/commands.json","count":0}
{"ts":"2026-10-26T23:48:48.383Z","level":"info","msg":"extension started","extension":"project:5e725d0059ee8571cd76424de937a4f62241830bfdeca0e2feb065370d0f8a84:p6","run":"0e830cac-0465-4bc4-9f60-a15ac31a8ff8","state":"running"}
{"ts":"2026-10-26T23:48:49.232Z","level":"info","msg":"display set","paneId":"a75218f5-0c7d-48ae-9232-b3f5f1c57c5a","name":"m","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-26T23:48:49.270Z","level":"info","msg":"display closed","paneId":"a75218f5-0c7d-48ae-9232-b3f5f1c57c5a","name":"m","reason":"closed"}
{"ts":"2026-10-26T23:48:49.468Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:49.469Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:49.469Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:49.482Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-zilr0L/commands.json","count":0}
{"ts":"2026-10-26T23:48:50.282Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:50.283Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:50.283Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:50.292Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-P0enxu/commands.json","count":0}
{"ts":"2026-10-26T23:48:50.784Z","level":"info","msg":"display script enabled","byClientId":"37e0afa9-df16-4229-9243-54b21984a6dc","byKind":"desktop"}
{"ts":"2026-10-26T23:48:50.847Z","level":"info","msg":"extension started","extension":"project:cb56359b02d8dc2a9abf6c59788e10d7f673e322182d78f2e8b0475c3f069926:p7","run":"3ffbe16b-bc7b-4cc2-aff3-35355a4b4821","state":"running"}
{"ts":"2026-10-26T23:48:52.023Z","level":"info","msg":"extension started","extension":"project:cb56359b02d8dc2a9abf6c59788e10d7f673e322182d78f2e8b0475c3f069926:p7","run":"01ca43fd-20a1-4fa8-8af6-e8d1aed7fa71","state":"running"}
{"ts":"2026-10-26T23:48:52.733Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:52.733Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:52.734Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:52.742Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-Wq7GLl/commands.json","count":0}
{"ts":"2026-10-26T23:48:52.905Z","level":"info","msg":"display set","paneId":"33cad4f3-1c1c-4181-b294-49157663e752","name":"s","kind":"panel","format":"script-html","bytes":8,"rev":1}
{"ts":"2026-10-26T23:48:52.992Z","level":"info","msg":"display closed","paneId":"33cad4f3-1c1c-4181-b294-49157663e752","name":"s","reason":"script_disabled"}
{"ts":"2026-10-26T23:48:53.099Z","level":"info","msg":"extension started","extension":"project:cb56359b02d8dc2a9abf6c59788e10d7f673e322182d78f2e8b0475c3f069926:p7","run":"3e75961c-f955-4293-bccd-6b0a25099d7e","state":"running"}
{"ts":"2026-10-26T23:48:54.091Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:54.092Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:54.092Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:54.102Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-cuPH1U/commands.json","count":0}
[graph-perf] {"case":"single-change","panes":16,"links":32,"limitMs":2000,"results":[{"source":0,"toStartMs":[14,15],"toSentMs":[1045,1045]},{"source":5,"toStartMs":[158,158],"toSentMs":[1216,1216]},{"source":10,"toStartMs":[152,152],"toSentMs":[1260,1261]}]}
{"ts":"2026-10-26T23:48:54.448Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:54.452Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:54.452Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:54.463Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-kHSmEZ/commands.json","count":0}
{"ts":"2026-10-26T23:48:54.515Z","level":"info","msg":"extension started","extension":"user:p10u","run":"b9bc0213-cc05-424b-b5f1-85fdb5af11e0","state":"running"}
{"ts":"2026-10-26T23:48:54.525Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:54.526Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:54.527Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:54.536Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-sgcB4N/commands.json","count":0}
{"ts":"2026-10-26T23:48:55.243Z","level":"info","msg":"extension started","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"9e217729-9e35-4d86-a976-0b919272e8a9","state":"running"}
{"ts":"2026-10-26T23:48:55.347Z","level":"info","msg":"extension exited","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"9e217729-9e35-4d86-a976-0b919272e8a9","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:55.379Z","level":"info","msg":"extension started","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"6345ee61-448d-430d-8f24-41b40d1ca3fe","state":"running"}
{"ts":"2026-10-26T23:48:55.465Z","level":"info","msg":"extension exited","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"6345ee61-448d-430d-8f24-41b40d1ca3fe","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:55.515Z","level":"info","msg":"extension started","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"346b047e-65fd-43a9-8272-f7d0e7821eae","state":"running"}
{"ts":"2026-10-26T23:48:55.620Z","level":"info","msg":"extension exited","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"346b047e-65fd-43a9-8272-f7d0e7821eae","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:55.712Z","level":"info","msg":"extension started","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"59ad173e-3646-423b-923d-ad48fa07aa2a","state":"running"}
{"ts":"2026-10-26T23:48:55.870Z","level":"info","msg":"extension exited","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"59ad173e-3646-423b-923d-ad48fa07aa2a","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:55.962Z","level":"info","msg":"extension started","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"bf05dece-d69a-4168-bc3b-e232260c0504","state":"running"}
{"ts":"2026-10-26T23:48:56.150Z","level":"info","msg":"extension exited","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","run":"bf05dece-d69a-4168-bc3b-e232260c0504","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:56.150Z","level":"warn","msg":"extension failed","extension":"project:a6742947241f30ed780ea034956474ba5cc8736275a29731cbf0985979b98027:p10","state":"failed","failures":5}
{"ts":"2026-10-26T23:48:56.844Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:56.845Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:56.845Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:56.855Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-XfBpY3/commands.json","count":0}
{"ts":"2026-10-26T23:48:56.931Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:56.932Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:56.933Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:56.941Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-gFRofw/commands.json","count":0}
{"ts":"2026-10-26T23:48:58.165Z","level":"info","msg":"extension started","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"7fadcec2-4cda-4d60-8781-fe0b9d927797","state":"running"}
{"ts":"2026-10-26T23:48:58.168Z","level":"info","msg":"extension exited","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"7fadcec2-4cda-4d60-8781-fe0b9d927797","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:58.198Z","level":"info","msg":"extension started","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"ac504b64-9f6a-45fc-b72a-2f6bc3cd68fc","state":"running"}
{"ts":"2026-10-26T23:48:58.200Z","level":"info","msg":"extension exited","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"ac504b64-9f6a-45fc-b72a-2f6bc3cd68fc","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:58.231Z","level":"info","msg":"agent session attached","paneId":"db11156f-44bc-4fdb-8197-4d5b385ac75e","kind":"claude","session":"resume-m","source":"hook"}
{"ts":"2026-10-26T23:48:58.252Z","level":"info","msg":"extension started","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"7c3e215f-6482-41dc-9132-27261ab67d20","state":"running"}
{"ts":"2026-10-26T23:48:58.254Z","level":"info","msg":"extension exited","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"7c3e215f-6482-41dc-9132-27261ab67d20","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:58.274Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:58.275Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:58.275Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:58.283Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-m7eN6v/commands.json","count":0}
{"ts":"2026-10-26T23:48:58.347Z","level":"info","msg":"extension started","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"2b5e56db-b520-440c-a5cf-cc34d8fe870d","state":"running"}
{"ts":"2026-10-26T23:48:58.349Z","level":"info","msg":"extension exited","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"2b5e56db-b520-440c-a5cf-cc34d8fe870d","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:58.448Z","level":"info","msg":"extension started","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"633dbe15-85fa-4f9d-98d6-d6559051b44b","state":"running"}
{"ts":"2026-10-26T23:48:58.451Z","level":"info","msg":"extension exited","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","run":"633dbe15-85fa-4f9d-98d6-d6559051b44b","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-26T23:48:58.451Z","level":"warn","msg":"extension failed","extension":"project:4778ae0e87f1faf4540bb4c51b0bcd6062a0bf0c70f5b4a0cfddd1bf37833a10:p10b","state":"failed","failures":5}
{"ts":"2026-10-26T23:48:59.818Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:48:59.819Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:48:59.819Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:48:59.843Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-QuNgeY/commands.json","count":0}
{"ts":"2026-10-26T23:49:02.424Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:02.424Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:02.425Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:02.433Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-uITPAP/commands.json","count":0}
{"ts":"2026-10-26T23:49:02.929Z","level":"info","msg":"extension started","extension":"project:74c5e88ba2d68ae435c20a80e7076a1210d3d7265afce75220758f2ac038e050:p9","run":"7fd0f218-221d-4e3c-bfec-e0a14ca92c9b","state":"running"}
{"ts":"2026-10-26T23:49:04.080Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:04.081Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:04.081Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:04.091Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-sgbufW/commands.json","count":0}
{"ts":"2026-10-26T23:49:04.336Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:04.338Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:04.339Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:04.347Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-1Aaxjg/commands.json","count":0}
{"ts":"2026-10-26T23:49:04.539Z","level":"info","msg":"agent session attached","paneId":"ead8907c-53ed-49de-aa9c-1b216f9059cb","kind":"grok","session":"grok-1","source":"hook"}
{"ts":"2026-10-26T23:49:04.540Z","level":"info","msg":"agent session attached","paneId":"ead8907c-53ed-49de-aa9c-1b216f9059cb","kind":"qodercli","session":"qodercli","source":"hook"}
{"ts":"2026-10-26T23:49:04.541Z","level":"info","msg":"agent session attached","paneId":"ead8907c-53ed-49de-aa9c-1b216f9059cb","kind":"devin","session":"devin-1","source":"hook"}
{"ts":"2026-10-26T23:49:04.572Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:04.572Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:04.572Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:04.580Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-fthaFl/commands.json","count":0}
{"ts":"2026-10-26T23:49:05.198Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:05.199Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:05.199Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:05.220Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-JzKnTu/commands.json","count":0}
{"ts":"2026-10-26T23:49:05.348Z","level":"info","msg":"agent session attached","paneId":"40563fd0-1e75-4182-b619-2fa73c5f0f83","kind":"codex","session":"marker-b","source":"hook"}
{"ts":"2026-10-26T23:49:05.385Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:05.386Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:05.386Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:05.394Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-sodZs7/commands.json","count":0}
{"ts":"2026-10-26T23:49:05.968Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:05.969Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:05.969Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:05.975Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-JzKnTu/sessions/work/commands.json","count":0}
[graph-perf] {"case":"blocked","panes":16,"links":32,"holdMs":1000,"limitMs":2000,"results":[{"source":0,"triggerStartMs":1655,"approvalStartMs":1776},{"source":5,"triggerStartMs":1196,"approvalStartMs":1196},{"source":10,"triggerStartMs":1104,"approvalStartMs":1104}]}
{"ts":"2026-10-26T23:49:06.447Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:06.447Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:06.447Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:06.456Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-1vvVs9/commands.json","count":0}
{"ts":"2026-10-26T23:49:06.910Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:06.911Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:06.911Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:06.920Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-jJyTEb/commands.json","count":0}
{"ts":"2026-10-26T23:49:07.314Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:07.316Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:07.316Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:07.322Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-JzKnTu/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:07.370Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:07.371Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:07.371Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:07.377Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-JzKnTu/sessions/other/commands.json","count":0}
{"ts":"2026-10-26T23:49:07.810Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:07.811Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:07.811Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:07.817Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-7G3rj5/commands.json","count":0}
{"ts":"2026-10-26T23:49:08.524Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:08.525Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:08.525Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:08.535Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-V1UmXP/commands.json","count":0}
{"ts":"2026-10-26T23:49:08.577Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:08.578Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:08.578Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:08.591Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-UNJnxO/commands.json","count":0}
{"ts":"2026-10-26T23:49:08.624Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:08.625Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:08.625Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:08.633Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-UNJnxO/commands.json","count":0}
{"ts":"2026-10-26T23:49:08.862Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:08.863Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:08.863Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:08.870Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-wZvTV1/commands.json","count":0}
{"ts":"2026-10-26T23:49:09.045Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:09.045Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:09.046Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:09.052Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-p7BQ3L/commands.json","count":0}
{"ts":"2026-10-26T23:49:09.772Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:09.773Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:09.773Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:09.780Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-p7BQ3L/commands.json","count":0}
{"ts":"2026-10-26T23:49:10.363Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:10.364Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:10.364Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:10.374Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-7E6v0a/commands.json","count":0}
{"ts":"2026-10-26T23:49:10.614Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:10.615Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:10.615Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:10.620Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-kOZe4l/commands.json","count":0}
{"ts":"2026-10-26T23:49:11.496Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:11.497Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:11.497Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:11.506Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-kOZe4l/commands.json","count":0}
{"ts":"2026-10-26T23:49:11.807Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:11.808Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:11.808Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:11.817Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-KHw7Lf/commands.json","count":0}
{"ts":"2026-10-26T23:49:12.376Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:12.377Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:12.377Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:12.384Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-kOZe4l/commands.json","count":0}
{"ts":"2026-10-26T23:49:12.710Z","level":"info","msg":"agent resume skipped","paneId":"15afaa4b-2cd8-430d-9416-51572085ba9d","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:13.014Z","level":"info","msg":"agent resume skipped","paneId":"fde2b42a-025e-47d0-92a6-e564b9e7d288","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:13.217Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.218Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.218Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:13.226Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-FUWuYT/commands.json","count":0}
{"ts":"2026-10-26T23:49:13.856Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.857Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.857Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:13.865Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-KBPP3Z/commands.json","count":0}
{"ts":"2026-10-26T23:49:13.879Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.880Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.880Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:13.889Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-ArUmcd/commands.json","count":0}
{"ts":"2026-10-26T23:49:13.895Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.896Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.896Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:13.903Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-og2VnJ/commands.json","count":0}
{"ts":"2026-10-26T23:49:13.985Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.986Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:13.987Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:13.997Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-ZBMD6D/commands.json","count":0}
{"ts":"2026-10-26T23:49:14.515Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:14.516Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:14.516Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:14.524Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-LJlCPR/commands.json","count":0}
{"ts":"2026-10-26T23:49:14.941Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:14.942Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:14.942Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:14.953Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-90eHYY/commands.json","count":0}
[graph-perf] {"case":"burst","panes":16,"links":32,"limitMs":2000,"maxFirstStartMs":13,"firstStartMs":[13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13]}
{"ts":"2026-10-26T23:49:15.600Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:15.601Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:15.601Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:15.609Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-tlq4sJ/commands.json","count":0}
{"ts":"2026-10-26T23:49:15.957Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:15.972Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:15.973Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:16.013Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-0NwYQz/commands.json","count":0}
{"ts":"2026-10-26T23:49:16.108Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:16.109Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:16.109Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:16.120Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-er09rs/commands.json","count":0}
{"ts":"2026-10-26T23:49:16.375Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:16.376Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:16.376Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:16.385Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-28z3qc/commands.json","count":0}
{"ts":"2026-10-26T23:49:17.437Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:17.439Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:17.439Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:17.448Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-9Bgr6Y/commands.json","count":0}
{"ts":"2026-10-26T23:49:17.692Z","level":"info","msg":"graph.auto: added","child":"976e1ac8-d932-40dd-85cf-123f24db426c","parent":"b33a57e8-1a7d-40bd-90ee-65e9bfc1bbc8","links":2}
{"ts":"2026-10-26T23:49:17.863Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:17.864Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:17.864Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:17.894Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-IqMDoc/state-Yw8wMp/commands.json","count":0}
{"ts":"2026-10-26T23:49:18.179Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:18.180Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:18.180Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:18.188Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-9Bgr6Y/commands.json","count":0}
{"ts":"2026-10-26T23:49:18.520Z","level":"info","msg":"agent resume skipped","paneId":"3d1688cc-abbf-4d09-9b6d-6134df60548b","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:18.824Z","level":"info","msg":"agent resume skipped","paneId":"785d93b4-7159-4337-a94a-3a23293df9f4","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:18.907Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:18.908Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:18.908Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:18.915Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-e2e-ZUd8Uf/commands.json","count":0}
{"ts":"2026-10-26T23:49:19.077Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:19.078Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:19.079Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:19.087Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-TUJRDI/commands.json","count":0}
{"ts":"2026-10-26T23:49:19.270Z","level":"info","msg":"pane socket: request","op":"agent.subagent_transcript","paneId":"3688ad51-6c3f-431b-a1fd-97eed5cdb5fc","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-26T23:49:19.410Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:19.411Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:19.411Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:19.419Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-wtdir-2MlMi2/commands.json","count":0}
{"ts":"2026-10-26T23:49:20.070Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:20.072Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:20.072Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:20.081Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-mmXuZD/state-BPK6Br/commands.json","count":0}
{"ts":"2026-10-26T23:49:20.179Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:20.180Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:20.181Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:20.191Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-tdqmge/commands.json","count":0}
{"ts":"2026-10-26T23:49:20.393Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:20.394Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:20.394Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:20.401Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-gitnow-xpqiJ2/commands.json","count":0}
{"ts":"2026-10-26T23:49:20.563Z","level":"info","msg":"agent session attached","paneId":"d571a0ff-25d6-453e-9618-3f1f7f3ad6ba","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:20.744Z","level":"info","msg":"graph.auto: added","child":"06499ec1-2d18-47f2-8005-51bb8557cf62","parent":"f6a3802a-9f8a-4736-9f71-a7b6f91d9213","links":2}
{"ts":"2026-10-26T23:49:21.306Z","level":"info","msg":"agent session attached","paneId":"fc9d87ac-ff0d-4bdd-a9a9-c1185c782f54","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:21.313Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:21.314Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:21.314Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:21.324Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-shutdown-nOYIOs/commands.json","count":0}
{"ts":"2026-10-26T23:49:21.796Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:21.797Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:21.797Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:21.805Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-agent-agS1PL/commands.json","count":0}
{"ts":"2026-10-26T23:49:23.477Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:23.478Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:23.479Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:23.489Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-5Gbat0/commands.json","count":0}
{"ts":"2026-10-26T23:49:23.567Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:23.568Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:23.568Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:23.575Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-43udMy/commands.json","count":0}
{"ts":"2026-10-26T23:49:24.476Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:24.476Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:24.476Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:24.486Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-43udMy/commands.json","count":0}
{"ts":"2026-10-26T23:49:24.829Z","level":"info","msg":"agent resume skipped","paneId":"5ebbf58d-03d0-4f90-972d-28a015a9cffc","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:25.104Z","level":"info","msg":"agent session attached","paneId":"b8889499-e9ed-48c6-bf7f-d03bb433a01e","kind":"claude","session":"869b5dcc","source":"hook"}
{"ts":"2026-10-26T23:49:25.136Z","level":"info","msg":"agent resume skipped","paneId":"389c9e17-f192-459f-ab9a-6f6a08c3a76b","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:25.265Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:25.265Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:25.265Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:25.273Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-tydxNV/commands.json","count":0}
{"ts":"2026-10-26T23:49:25.790Z","level":"info","msg":"graph.auto: added","child":"1326b951-930a-4125-92a3-f7141a0c6530","parent":"dec161cf-6779-453c-812d-0c525ebb976a","links":2}
{"ts":"2026-10-26T23:49:26.020Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:26.021Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:26.021Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:26.031Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-uYufsX/commands.json","count":0}
{"ts":"2026-10-26T23:49:26.279Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:26.280Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:26.280Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:26.287Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-3cdIzW/commands.json","count":0}
{"ts":"2026-10-26T23:49:26.688Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:26.688Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:26.689Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:26.696Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-3cdIzW/commands.json","count":0}
{"ts":"2026-10-26T23:49:26.708Z","level":"info","msg":"removed session-history.json","reason":"pane history disabled"}
{"ts":"2026-10-26T23:49:27.013Z","level":"info","msg":"agent resume skipped","paneId":"319c3142-48ce-4384-a6f8-fbf3fa1b22a4","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:27.068Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:27.069Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:27.069Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:27.092Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-oWmlSM/commands.json","count":0}
{"ts":"2026-10-26T23:49:27.131Z","level":"info","msg":"removed session-history.json","reason":"session.json was not restored"}
{"ts":"2026-10-26T23:49:27.509Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:27.510Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:27.510Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:27.517Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-yJ4PDc/commands.json","count":0}
{"ts":"2026-10-26T23:49:27.563Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-history-it-yJ4PDc/session-backups/2026-10-26T23-49-27-562Z.json"}
{"ts":"2026-10-26T23:49:27.564Z","level":"info","msg":"removed session-history.json","reason":"session.json was not restored"}
{"ts":"2026-10-26T23:49:27.956Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:27.957Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:27.957Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:27.965Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-NYV69E/commands.json","count":0}
{"ts":"2026-10-26T23:49:28.372Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:28.372Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:28.373Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:28.381Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-NYV69E/commands.json","count":0}
{"ts":"2026-10-26T23:49:28.392Z","level":"warn","msg":"session-history.json was corrupt; restoring without pane history","reason":"invalid JSON"}
{"ts":"2026-10-26T23:49:28.697Z","level":"info","msg":"agent resume skipped","paneId":"b8717f9a-1b90-4ba0-bc6f-ed3d821e488b","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:28.783Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:28.784Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:28.784Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:28.792Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-0a4NjA/commands.json","count":0}
{"ts":"2026-10-26T23:49:29.236Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:29.237Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:29.237Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:29.258Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-0a4NjA/commands.json","count":0}
{"ts":"2026-10-26T23:49:29.276Z","level":"warn","msg":"session-history.json was corrupt; restoring without pane history","reason":"panes: invalid_type"}
{"ts":"2026-10-26T23:49:29.582Z","level":"info","msg":"agent resume skipped","paneId":"a51e668a-d6af-4f56-826f-150a7893b71a","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:29.714Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:29.715Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:29.715Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:29.724Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-CwYhPy/commands.json","count":0}
{"ts":"2026-10-26T23:49:29.943Z","level":"info","msg":"graph.auto: added","child":"c30f617d-b499-47c7-9c44-7b1ebcc219a3","parent":"920bd1f4-b43d-43e0-b8c0-bd52bae9564d","links":2}
{"ts":"2026-10-26T23:49:29.995Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:29.996Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:29.996Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:30.006Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-chK1I5/commands.json","count":0}
{"ts":"2026-10-26T23:49:30.418Z","level":"warn","msg":"pane history save failed","path":"/tmp/soda-history-it-CwYhPy/session-history.json","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-history-it-CwYhPy/.tmp-2Sfw4n/write' -> '/tmp/soda-history-it-CwYhPy/session-history.json'"}
{"ts":"2026-10-26T23:49:30.448Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:30.449Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:30.449Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:30.458Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-245YLy/commands.json","count":0}
{"ts":"2026-10-26T23:49:30.987Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:30.988Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:30.988Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:30.999Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-dTtjxz/commands.json","count":0}
{"ts":"2026-10-26T23:49:31.033Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:31.033Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:31.033Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:31.055Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-245YLy/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:31.648Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:31.649Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:31.649Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:31.657Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-S9gCi9/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:32.072Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.073Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.073Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:32.081Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-S9gCi9/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:32.095Z","level":"info","msg":"agent session attached","paneId":"f3c1a87a-d969-4b12-b0fd-ea011048ca9f","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:32.421Z","level":"info","msg":"agent resume skipped","paneId":"23964c06-8383-4b7d-b1fb-13f97b040ed9","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:32.482Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.483Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.483Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:32.492Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-S9gCi9/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:32.809Z","level":"info","msg":"agent resume skipped","paneId":"23964c06-8383-4b7d-b1fb-13f97b040ed9","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:32.945Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.947Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.947Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:32.956Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-cSuuRg/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:32.984Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.985Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.985Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:32.988Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.989Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:32.989Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:32.994Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-cSuuRg/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:33.001Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-RJ8hIi/commands.json","count":0}
{"ts":"2026-10-26T23:49:33.014Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.015Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.015Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:33.022Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-cSuuRg/commands.json","count":0}
{"ts":"2026-10-26T23:49:33.061Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.062Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.062Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:33.070Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-cSuuRg/commands.json","count":0}
{"ts":"2026-10-26T23:49:33.097Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.098Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.098Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:33.106Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-wElidE/commands.json","count":0}
{"ts":"2026-10-26T23:49:33.532Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.533Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.533Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:33.545Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-eu3lGc/commands.json","count":0}
{"ts":"2026-10-26T23:49:33.553Z","level":"warn","msg":"cannot write serve.json","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-compose-named-ui-eu3lGc/.tmp-MuTIC2/write' -> '/tmp/soda-compose-named-ui-eu3lGc/serve.json'"}
{"ts":"2026-10-26T23:49:33.987Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.988Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:33.988Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:33.998Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-VpT86t/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:34.387Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:34.387Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:34.388Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:34.395Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-VpT86t/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:34.419Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:34.420Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:34.420Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:34.428Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-VpT86t/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:49:34.571Z","level":"info","msg":"graph.auto: added","child":"01ac55c2-1cbf-4f75-a5ab-fb17eee6a84c","parent":"3644aef6-7bd7-45a9-a00a-b217fb3d184b","links":2}
{"ts":"2026-10-26T23:49:35.199Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:35.201Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:35.201Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:35.210Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-ONoG45/commands.json","count":0}
{"ts":"2026-10-26T23:49:35.609Z","level":"info","msg":"graph.auto: added","child":"ab188394-b402-4601-9c27-b1009714b1b9","parent":"3644aef6-7bd7-45a9-a00a-b217fb3d184b","links":2}
{"ts":"2026-10-26T23:49:35.686Z","level":"info","msg":"agent session attached","paneId":"579c58c6-91ed-4988-a6aa-503dbec2fdf0","kind":"claude","session":"0b6fceef","source":"hook"}
{"ts":"2026-10-26T23:49:35.771Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:35.774Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:35.774Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:35.811Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-2uxOxg/commands.json","count":0}
{"ts":"2026-10-26T23:49:36.602Z","level":"info","msg":"agent session attached","paneId":"13a1ed31-074c-423e-8cb9-d787b39a8b6a","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-26T23:49:37.136Z","level":"info","msg":"agent session attached","paneId":"13a1ed31-074c-423e-8cb9-d787b39a8b6a","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-26T23:49:37.174Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:37.174Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:37.175Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:37.179Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-ONyjTH/commands.json","count":0}
{"ts":"2026-10-26T23:49:37.546Z","level":"info","msg":"graph.auto: skipped","child":"c8be4169-4a6a-4269-aa3d-478aefa247b9","parent":"2d8780b0-bcc3-477d-9ea0-857bfd834b8c","reason":"duplicate_link"}
{"ts":"2026-10-26T23:49:37.546Z","level":"info","msg":"graph.auto: added","child":"c8be4169-4a6a-4269-aa3d-478aefa247b9","parent":"2d8780b0-bcc3-477d-9ea0-857bfd834b8c","links":1}
{"ts":"2026-10-26T23:49:37.616Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:37.617Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:37.617Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:37.647Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-DIl99P/commands.json","count":0}
{"ts":"2026-10-26T23:49:38.475Z","level":"info","msg":"agent session attached","paneId":"a279d9a4-4ca3-4b89-9799-47c30d5e3db7","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-26T23:49:38.478Z","level":"info","msg":"agent report ignored","paneId":"a279d9a4-4ca3-4b89-9799-47c30d5e3db7","kind":"claude","session":"conv-dae","reason":"the reporting process is not a descendant of the pane's shell","agentPid":1024951}
{"ts":"2026-10-26T23:49:39.012Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:39.013Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:39.013Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:39.019Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-DIde3g/commands.json","count":0}
{"ts":"2026-10-26T23:49:39.798Z","level":"info","msg":"graph.auto: skipped","child":"54a8d248-47af-492a-b434-1546949e7dff","parent":"7ef6a2b0-26a8-4bc3-bf8d-c1765089e8f2","reason":"supervisor_taken"}
{"ts":"2026-10-26T23:49:39.798Z","level":"info","msg":"graph.auto: added","child":"54a8d248-47af-492a-b434-1546949e7dff","parent":"7ef6a2b0-26a8-4bc3-bf8d-c1765089e8f2","links":1}
{"ts":"2026-10-26T23:49:39.861Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:39.862Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:39.862Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:39.870Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-gmR1Ou/commands.json","count":0}
{"ts":"2026-10-26T23:49:40.286Z","level":"info","msg":"agent session attached","paneId":"29204974-9518-44a1-a24f-6843e4d34ac5","kind":"claude","session":"conv-nop","source":"hook"}
{"ts":"2026-10-26T23:49:40.317Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:40.318Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:40.318Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:40.324Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-ZhEOtM/commands.json","count":0}
{"ts":"2026-10-26T23:49:40.337Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:40.338Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:40.338Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:40.348Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-s7bikZ/commands.json","count":0}
{"ts":"2026-10-26T23:49:41.342Z","level":"info","msg":"agent session attached","paneId":"c4c4a995-e0aa-4240-aa54-e88cffdd368b","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:41.518Z","level":"info","msg":"agent session attached","paneId":"e79f0b08-a67e-410e-ab98-e7adb036fb55","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-26T23:49:41.523Z","level":"info","msg":"agent report ignored","paneId":"e79f0b08-a67e-410e-ab98-e7adb036fb55","kind":"claude","reason":"the reporting process is not the pane's front agent (a nested or unrelated process)","agentPid":1025313}
{"ts":"2026-10-26T23:49:42.204Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:42.206Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:42.207Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:42.215Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-tpOyhB/commands.json","count":0}
{"ts":"2026-10-26T23:49:42.482Z","level":"info","msg":"graph.auto: added","child":"41093ff3-ed24-4692-a45c-11c3128b7436","parent":"fec9f318-f42a-412e-ab70-b6e27e2aaf9d","links":2}
{"ts":"2026-10-26T23:49:43.439Z","level":"info","msg":"agent session attached","paneId":"a26550ac-53a0-4d97-bcc6-8d766dcf3e40","kind":"claude","session":"conv-fir","source":"hook"}
{"ts":"2026-10-26T23:49:43.713Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:43.715Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:43.715Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:43.724Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-mmXuZD/state-b73gxh/commands.json","count":0}
{"ts":"2026-10-26T23:49:43.951Z","level":"info","msg":"graph.auto: added","child":"4edfc127-b4ea-4c6f-9ef5-4353bc5fa6e9","parent":"fec9f318-f42a-412e-ab70-b6e27e2aaf9d","links":2}
{"ts":"2026-10-26T23:49:44.004Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:44.006Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:44.006Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:44.017Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-NWDett/state-XH3XdI/commands.json","count":0}
{"ts":"2026-10-26T23:49:44.329Z","level":"info","msg":"agent session dropped (a different agent started without reporting)","paneId":"a26550ac-53a0-4d97-bcc6-8d766dcf3e40","kind":"claude","session":"conv-fir","sinceGoneMs":650.7866990000002}
{"ts":"2026-10-26T23:49:44.378Z","level":"info","msg":"agent session attached","paneId":"37e40062-21ab-42d4-ab12-f5410ad3dc04","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:44.413Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:44.416Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:44.416Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:44.424Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-rdNWfq/commands.json","count":0}
{"ts":"2026-10-26T23:49:44.855Z","level":"info","msg":"agent session attached","paneId":"4e779810-54a3-4aab-a343-74c0fb76e4e8","kind":"claude","session":"a451020b","source":"hook"}
{"ts":"2026-10-26T23:49:45.328Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:e6cca94c-7150-42fc-b840-93be171596e6"]}
{"ts":"2026-10-26T23:49:45.988Z","level":"info","msg":"graph.auto: skipped","child":"d15f66b2-4533-4d4d-a0f4-797186bf5fc8","parent":"e6cca94c-7150-42fc-b840-93be171596e6","reason":"parent_gone"}
{"ts":"2026-10-26T23:49:46.244Z","level":"info","msg":"agent session attached","paneId":"801515af-1f88-4b09-bb9d-177c9dba01dd","kind":"codex","session":"01a1235d","source":"sole-codex"}
{"ts":"2026-10-26T23:49:46.391Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:46.392Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:46.393Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:46.400Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-NwYwxl/commands.json","count":0}
{"ts":"2026-10-26T23:49:46.762Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:46.764Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:46.764Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:46.772Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-BjeFUn/commands.json","count":0}
{"ts":"2026-10-26T23:49:46.986Z","level":"info","msg":"agent report ignored","paneId":"6e6f9076-f466-4c42-b83e-de0036335245","kind":"codex","session":"01a1235d","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): its cwd is not the pane's","agentPid":1024951}
{"ts":"2026-10-26T23:49:46.987Z","level":"info","msg":"agent report ignored","paneId":"6e6f9076-f466-4c42-b83e-de0036335245","kind":"codex","session":"01a1235d","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): the report carries no cwd","agentPid":1024951}
{"ts":"2026-10-26T23:49:47.494Z","level":"info","msg":"agent session attached","paneId":"6e6f9076-f466-4c42-b83e-de0036335245","kind":"codex","session":"01a1235d","source":"sole-codex"}
{"ts":"2026-10-26T23:49:47.524Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:47.525Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:47.525Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:47.530Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-SeBHkv/commands.json","count":0}
{"ts":"2026-10-26T23:49:47.602Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:47.603Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:47.603Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:47.612Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-IfkeOQ/commands.json","count":0}
{"ts":"2026-10-26T23:49:48.255Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:48.256Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:48.257Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:48.264Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-4GChDJ/commands.json","count":0}
{"ts":"2026-10-26T23:49:49.201Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:8ec38e69-5553-4f71-a81f-e2979d2af885"]}
{"ts":"2026-10-26T23:49:49.238Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:49.239Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:49.239Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:49.249Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-cKatlv/commands.json","count":0}
{"ts":"2026-10-26T23:49:49.303Z","level":"info","msg":"agent report ignored","paneId":"74b6e0e0-ddc5-42e4-be92-90385087a2e6","kind":"codex","session":"codex-tw","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1024951}
{"ts":"2026-10-26T23:49:49.304Z","level":"info","msg":"agent report ignored","paneId":"f5915cc8-af2f-48c8-9283-652a968e18c1","kind":"codex","session":"codex-tw","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1024951}
{"ts":"2026-10-26T23:49:49.599Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:49.600Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:49.600Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:49.609Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-mmXuZD/state-tTXSwJ/commands.json","count":0}
{"ts":"2026-10-26T23:49:50.012Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:50.013Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:50.013Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:50.021Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-BbDUyR/commands.json","count":0}
{"ts":"2026-10-26T23:49:50.192Z","level":"info","msg":"agent session attached","paneId":"ac1d845b-1ac8-4e76-9e44-9a75fad9d1d2","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:50.264Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:50.264Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:50.265Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:50.274Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-KCf9FR/commands.json","count":0}
{"ts":"2026-10-26T23:49:50.781Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:50.782Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:50.782Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:50.789Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-KCf9FR/commands.json","count":0}
{"ts":"2026-10-26T23:49:51.116Z","level":"info","msg":"agent resume skipped","paneId":"13116d0a-5977-412c-9cb5-1ad244c7235d","reason":"no-session-ref"}
{"ts":"2026-10-26T23:49:51.237Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:51.238Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:51.238Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:51.247Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-eK9nSv/commands.json","count":0}
{"ts":"2026-10-26T23:49:51.268Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:51.270Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:51.271Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:51.278Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-9AkbRB/state-tiwfpe/commands.json","count":0}
{"ts":"2026-10-26T23:49:51.728Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:51.728Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:51.729Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:51.738Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-eK9nSv/commands.json","count":0}
{"ts":"2026-10-26T23:49:51.754Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-graph-it-eK9nSv/session-backups/2026-10-26T23-49-51-752Z.json"}
{"ts":"2026-10-26T23:49:51.952Z","level":"info","msg":"agent session attached","paneId":"06c91082-cef3-4f6c-9750-908f02f94f2f","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-26T23:49:51.974Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:51.976Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:51.976Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:51.986Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-FnYLlF/commands.json","count":0}
{"ts":"2026-10-26T23:49:52.060Z","level":"info","msg":"agent session attached","paneId":"3548d0ea-2cb9-4adb-9e6d-a991b6790c9a","kind":"codex","session":"01a1234a","source":"first-turn"}
{"ts":"2026-10-26T23:49:52.065Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:6e14fb22-5a7e-40db-8b1c-2e74d8764dc4"]}
{"ts":"2026-10-26T23:49:52.065Z","level":"info","msg":"graph.json had nodes of closed panes; removed them","nodes":1}
{"ts":"2026-10-26T23:49:52.154Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:52.155Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:52.155Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:52.180Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-U4tVH0/commands.json","count":0}
{"ts":"2026-10-26T23:49:52.196Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:52.197Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:52.197Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:52.206Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-LElaiv/commands.json","count":0}
{"ts":"2026-10-26T23:49:52.620Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:52.621Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:52.622Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:52.631Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-c6W6pj/commands.json","count":0}
{"ts":"2026-10-26T23:49:52.676Z","level":"info","msg":"agent session attached","paneId":"099d12b9-354e-4770-a09f-a8ac4162cc45","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:52.936Z","level":"info","msg":"agent session attached","paneId":"81959b07-e9f7-4e52-a45c-9688c5ccd76e","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:52.981Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:52.983Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:52.983Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:52.989Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-9AkbRB/state-ZsJzFh/commands.json","count":0}
{"ts":"2026-10-26T23:49:53.849Z","level":"info","msg":"agent report ignored","paneId":"fd1366f4-52f2-44cc-bc12-54bc9067f497","kind":"codex","session":"01a12341","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 2 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1024951}
{"ts":"2026-10-26T23:49:54.818Z","level":"info","msg":"agent session attached","paneId":"320c1b4e-7952-4a0a-9db0-fc06b711e7a3","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:49:54.823Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:54.824Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:54.824Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:54.850Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-5EMozO/commands.json","count":0}
{"ts":"2026-10-26T23:49:54.884Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:54.885Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:54.885Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:54.895Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-nSvr4s/commands.json","count":0}
{"ts":"2026-10-26T23:49:56.625Z","level":"info","msg":"agent report ignored","paneId":"b5604053-95d4-4f0b-b5b6-19aae2f0a56f","kind":"codex","session":"01a12326","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1024951}
{"ts":"2026-10-26T23:49:57.775Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:57.776Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:57.776Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:57.784Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-G4h35d/commands.json","count":0}
{"ts":"2026-10-26T23:49:58.177Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:58.178Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:58.178Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:58.189Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-F2vkpd/commands.json","count":0}
{"ts":"2026-10-26T23:49:58.217Z","level":"info","msg":"agent report ignored","paneId":"b5604053-95d4-4f0b-b5b6-19aae2f0a56f","kind":"codex","session":"01a1234a","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): the session record could not be checked","agentPid":1024951}
{"ts":"2026-10-26T23:49:59.407Z","level":"info","msg":"agent session attached","paneId":"fec6eabe-43b6-43eb-9383-e150bd29e9c8","kind":"codex","session":"01a12341","source":"argv"}
{"ts":"2026-10-26T23:49:59.411Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:59.412Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:59.412Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:59.423Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-XCuWyU/commands.json","count":0}
{"ts":"2026-10-26T23:49:59.483Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:49:59.483Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:49:59.484Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:49:59.491Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-L0MpyA/commands.json","count":0}
{"ts":"2026-10-26T23:50:01.124Z","level":"info","msg":"agent session attached","paneId":"737f7395-752f-41bd-981b-a0f5c4b6a635","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-26T23:50:01.461Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:01.462Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:01.462Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:01.470Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-oMsCsV/commands.json","count":0}
{"ts":"2026-10-26T23:50:01.957Z","level":"info","msg":"agent session dropped (a different agent started without reporting)","paneId":"737f7395-752f-41bd-981b-a0f5c4b6a635","kind":"codex","session":"01a12341","sinceGoneMs":584.8923709999981}
{"ts":"2026-10-26T23:50:01.958Z","level":"info","msg":"agent session attached","paneId":"737f7395-752f-41bd-981b-a0f5c4b6a635","kind":"codex","session":"01a1234a","source":"argv"}
{"ts":"2026-10-26T23:50:02.012Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:02.013Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:02.013Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:02.022Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-wRu9eU/commands.json","count":0}
{"ts":"2026-10-26T23:50:02.802Z","level":"info","msg":"agent session attached","paneId":"fcce3b95-9feb-464e-acc9-f0a88468082e","kind":"claude","session":"18aad8d5","source":"hook"}
{"ts":"2026-10-26T23:50:03.393Z","level":"info","msg":"agent session attached","paneId":"2d20ce2e-ed29-4c52-ba8c-76185b96b82e","kind":"codex","session":"01a12326","source":"exit-text"}
{"ts":"2026-10-26T23:50:03.480Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:03.481Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:03.481Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:03.489Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-wpZLQb/commands.json","count":0}
{"ts":"2026-10-26T23:50:04.334Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:04.335Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:04.335Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:04.345Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-wZgkYd/commands.json","count":0}
{"ts":"2026-10-26T23:50:05.032Z","level":"info","msg":"agent session attached","paneId":"5219b6bd-875c-4f99-b6b3-7388f37b0e52","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-26T23:50:05.101Z","level":"info","msg":"agent session attached","paneId":"540b0dad-958e-4be9-a6f1-58baf6490ad4","kind":"codex","session":"01a1234a","source":"first-turn"}
{"ts":"2026-10-26T23:50:05.306Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:05.308Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:05.308Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:05.320Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-803GZd/state-wpZLQb/commands.json","count":0}
{"ts":"2026-10-26T23:50:05.367Z","level":"info","msg":"agent session attached","paneId":"06abb9ae-24e1-4a88-9eca-f878d4793889","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:05.667Z","level":"info","msg":"agent resume command written","paneId":"540b0dad-958e-4be9-a6f1-58baf6490ad4","kind":"codex","session":"01a1234a"}
{"ts":"2026-10-26T23:50:05.973Z","level":"info","msg":"agent resume command written","paneId":"5219b6bd-875c-4f99-b6b3-7388f37b0e52","kind":"codex","session":"01a12341"}
{"ts":"2026-10-26T23:50:07.341Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:07.342Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:07.342Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:07.351Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-9AkbRB/state-A9SwsB/commands.json","count":0}
{"ts":"2026-10-26T23:50:07.894Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:07.895Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:07.895Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:07.906Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-ec48Tj/commands.json","count":0}
{"ts":"2026-10-26T23:50:08.560Z","level":"info","msg":"agent session attached","paneId":"969e2387-db2d-49fe-867b-137307ee4c85","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:08.610Z","level":"info","msg":"usage report ignored","paneId":"969e2387-db2d-49fe-867b-137307ee4c85","kind":"claude","reason":"the reporting process is not a descendant of the pane's shell"}
{"ts":"2026-10-26T23:50:08.679Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:08.682Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:08.682Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:08.691Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-5vHNUE/commands.json","count":0}
{"ts":"2026-10-26T23:50:08.930Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:08.931Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:08.931Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:08.940Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-ec48Tj/commands.json","count":0}
{"ts":"2026-10-26T23:50:08.954Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-graph-run-ec48Tj/session-backups/2026-10-26T23-50-08-952Z.json"}
{"ts":"2026-10-26T23:50:09.269Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:d275a62a-9360-48ce-b0b6-b34498ff8374","local:df4c3cd6-9b9b-4077-852d-14c7f3fbc7e9"]}
{"ts":"2026-10-26T23:50:09.270Z","level":"info","msg":"graph.json had nodes of closed panes; removed them","nodes":2}
{"ts":"2026-10-26T23:50:09.492Z","level":"info","msg":"agent session attached","paneId":"1100cd5e-0605-48bb-b34d-4afdbda11ac1","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:10.018Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:10.019Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:10.019Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:10.027Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-rYRHjj/commands.json","count":0}
{"ts":"2026-10-26T23:50:10.296Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:10.297Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:10.297Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:10.305Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:10.305Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:10.305Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:10.306Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-9AkbRB/state-apmHAe/commands.json","count":0}
{"ts":"2026-10-26T23:50:10.312Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-9qzUtB/commands.json","count":0}
{"ts":"2026-10-26T23:50:10.915Z","level":"info","msg":"agent session attached","paneId":"7df0b16e-0f1c-47e4-ad2c-fb91c7479b27","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:11.069Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:11.071Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:11.071Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:11.098Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-0RyN5F/commands.json","count":0}
{"ts":"2026-10-26T23:50:11.585Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:11.586Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:11.586Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:11.593Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-23Dvdc/commands.json","count":0}
{"ts":"2026-10-26T23:50:12.068Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-26T23:50:12.112Z","level":"info","msg":"handoff: replacing this server with the version on disk","id":"f001847511204ac3","panes":2}
{"ts":"2026-10-26T23:50:12.114Z","level":"error","msg":"handoff: execve failed; keeping the current server","error":"execve refused by the test"}
{"ts":"2026-10-26T23:50:12.325Z","level":"info","msg":"agent session attached","paneId":"d8112cad-43af-4674-a70c-582cee15adb8","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:13.362Z","level":"info","msg":"agent session attached","paneId":"423af928-58be-4b6a-9bff-6f4a42d01321","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:13.831Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:13.848Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:13.849Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:13.866Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-aplEUS/commands.json","count":0}
{"ts":"2026-10-26T23:50:14.529Z","level":"info","msg":"display script enabled","byClientId":"cb8ffc32-0ef1-4ac2-b537-347af94c3733","byKind":"external"}
{"ts":"2026-10-26T23:50:14.575Z","level":"info","msg":"display set","paneId":"a8d87c84-147d-4277-a5e1-0a2c09df46b1","name":"main","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:14.576Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"a8d87c84-147d-4277-a5e1-0a2c09df46b1","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:14.601Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"a8d87c84-147d-4277-a5e1-0a2c09df46b1","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:14.673Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"a8d87c84-147d-4277-a5e1-0a2c09df46b1","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-26T23:50:14.680Z","level":"info","msg":"display closed","paneId":"a8d87c84-147d-4277-a5e1-0a2c09df46b1","name":"main","reason":"closed"}
{"ts":"2026-10-26T23:50:14.680Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"a8d87c84-147d-4277-a5e1-0a2c09df46b1","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-26T23:50:14.704Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"a8d87c84-147d-4277-a5e1-0a2c09df46b1","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-26T23:50:14.706Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"a8d87c84-147d-4277-a5e1-0a2c09df46b1","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-26T23:50:14.756Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:14.757Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:14.758Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:14.765Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-ulD3Fy/commands.json","count":0}
{"ts":"2026-10-26T23:50:15.054Z","level":"info","msg":"agent session attached","paneId":"ccf97c3f-030e-43c6-85f8-5e67da43a0b7","kind":"claude","session":"8fc2a5f9","source":"hook"}
{"ts":"2026-10-26T23:50:15.206Z","level":"info","msg":"display script enabled","byClientId":"7dbd8038-4c6d-47fd-baf9-8cacd410e2bd","byKind":"external"}
{"ts":"2026-10-26T23:50:15.219Z","level":"info","msg":"display set","paneId":"8bd74528-ce80-4a1c-b383-c6e9d2b02b13","name":"big","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:15.219Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"8bd74528-ce80-4a1c-b383-c6e9d2b02b13","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:15.229Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"8bd74528-ce80-4a1c-b383-c6e9d2b02b13","connId":"pane-socket:2","code":"invalid_display"}
{"ts":"2026-10-26T23:50:15.270Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:15.271Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:15.271Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:15.277Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-qfMFJX/commands.json","count":0}
{"ts":"2026-10-26T23:50:15.696Z","level":"info","msg":"display script enabled","byClientId":"441ef95e-1644-43bb-a210-d450c788f0f9","byKind":"external"}
{"ts":"2026-10-26T23:50:15.734Z","level":"info","msg":"display set","paneId":"d20952ca-edb3-40c6-9af0-a21e05508232","name":"q","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-26T23:50:15.734Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"d20952ca-edb3-40c6-9af0-a21e05508232","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:15.851Z","level":"info","msg":"pane socket: request","connId":"pane-socket:2","code":"bad_request"}
{"ts":"2026-10-26T23:50:15.884Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:15.885Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:15.885Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:15.892Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-BhbP5H/commands.json","count":0}
{"ts":"2026-10-26T23:50:16.106Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:16.107Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:16.108Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:16.116Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-5NsUnY/commands.json","count":0}
{"ts":"2026-10-26T23:50:16.322Z","level":"info","msg":"display script enabled","byClientId":"1f0907c3-8473-4184-a08b-e322c98c1c63","byKind":"external"}
{"ts":"2026-10-26T23:50:16.699Z","level":"info","msg":"agent session attached","paneId":"b011a021-3dd9-41a9-8694-b086ccae1033","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:16.856Z","level":"info","msg":"display set","paneId":"1c5fa76b-4466-4abd-b4f9-3fcc831900a9","name":"secret","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:16.939Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:16.940Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:16.941Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-26T23:50:16.943Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-26T23:50:16.944Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-26T23:50:16.944Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:6","code":"invalid_params"}
{"ts":"2026-10-26T23:50:16.945Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:7","code":"invalid_params"}
{"ts":"2026-10-26T23:50:16.946Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:8","code":"invalid_params"}
{"ts":"2026-10-26T23:50:17.581Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:17.582Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:17.582Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:17.608Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-LxM46C/commands.json","count":0}
{"ts":"2026-10-26T23:50:17.954Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"7a103775-3f53-488f-b3a2-2d7ba2ea8e28","connId":"pane-socket:9","code":"ok"}
{"ts":"2026-10-26T23:50:18.154Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:18.155Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:18.155Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:18.165Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-0cpSv0/commands.json","count":0}
{"ts":"2026-10-26T23:50:18.338Z","level":"info","msg":"agent session attached","paneId":"dcc969a1-3617-4f12-8784-ee025c76f44e","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:18.599Z","level":"info","msg":"display script enabled","byClientId":"fdceacb4-87d5-426c-8267-c62c8009c0bb","byKind":"external"}
{"ts":"2026-10-26T23:50:18.704Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"846bfebc-427d-4dbb-a92d-f7cfa01621fe","connId":"pane-socket:5","code":"display_busy"}
{"ts":"2026-10-26T23:50:19.054Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:19.056Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:19.056Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:19.065Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-vXiXCb/commands.json","count":0}
{"ts":"2026-10-26T23:50:19.139Z","level":"info","msg":"agent session attached","paneId":"dcc969a1-3617-4f12-8784-ee025c76f44e","kind":"claude","session":"7c0a3f2e","source":"hook"}
{"ts":"2026-10-26T23:50:19.486Z","level":"info","msg":"display script enabled","byClientId":"33e0276c-837c-41da-b006-2d9612397ca3","byKind":"external"}
{"ts":"2026-10-26T23:50:19.714Z","level":"info","msg":"display set","paneId":"a3808eb2-63c0-4df2-83a0-3f990cdd0caa","name":"big","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:19.901Z","level":"info","msg":"display closed","paneId":"a3808eb2-63c0-4df2-83a0-3f990cdd0caa","name":"big","reason":"dismissed"}
{"ts":"2026-10-26T23:50:19.915Z","level":"info","msg":"display set","paneId":"a3808eb2-63c0-4df2-83a0-3f990cdd0caa","name":"again","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:19.927Z","level":"info","msg":"display reported","paneId":"a3808eb2-63c0-4df2-83a0-3f990cdd0caa","name":"again","problem":"navigated","format":"html"}
{"ts":"2026-10-26T23:50:19.927Z","level":"info","msg":"display closed","paneId":"a3808eb2-63c0-4df2-83a0-3f990cdd0caa","name":"again","reason":"navigated"}
{"ts":"2026-10-26T23:50:19.977Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:19.978Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:19.978Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:19.987Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-sYqQpR/commands.json","count":0}
{"ts":"2026-10-26T23:50:20.417Z","level":"info","msg":"display script enabled","byClientId":"ba3bc428-1bbf-4254-8199-af0db7d9f8c8","byKind":"external"}
{"ts":"2026-10-26T23:50:20.543Z","level":"info","msg":"display set","paneId":"be078613-5758-4564-bc02-2bbe580e1b90","name":"m","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:20.696Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:20.697Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:20.697Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:20.705Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-cTpT7S/commands.json","count":0}
{"ts":"2026-10-26T23:50:21.129Z","level":"info","msg":"display script enabled","byClientId":"f84452eb-9f86-47fc-b2ca-987cbb0fbc15","byKind":"external"}
{"ts":"2026-10-26T23:50:21.269Z","level":"info","msg":"display set","paneId":"55dab5da-5f23-4057-83be-8d2f7650407b","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:21.315Z","level":"info","msg":"display set","paneId":"55dab5da-5f23-4057-83be-8d2f7650407b","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:21.366Z","level":"info","msg":"display set","paneId":"55dab5da-5f23-4057-83be-8d2f7650407b","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:21.415Z","level":"info","msg":"display set","paneId":"55dab5da-5f23-4057-83be-8d2f7650407b","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:21.545Z","level":"info","msg":"agent session attached","paneId":"6fb228fa-92be-436b-b926-13249551b43f","kind":"claude","session":"2ff487a5","source":"hook"}
{"ts":"2026-10-26T23:50:21.646Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:21.647Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:21.647Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:21.657Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-rzd2G3/commands.json","count":0}
{"ts":"2026-10-26T23:50:22.636Z","level":"info","msg":"agent session attached","paneId":"f8d80661-15c7-46a9-b943-371511774d6e","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:22.820Z","level":"info","msg":"display set","paneId":"8e698433-1c92-40b9-80e3-1be2146a0127","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:22.852Z","level":"info","msg":"display set","paneId":"8e698433-1c92-40b9-80e3-1be2146a0127","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:22.884Z","level":"info","msg":"display set","paneId":"8e698433-1c92-40b9-80e3-1be2146a0127","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:22.917Z","level":"info","msg":"display set","paneId":"8e698433-1c92-40b9-80e3-1be2146a0127","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:22.965Z","level":"info","msg":"display set","paneId":"b1877d8e-688b-4516-aa01-dae0af8a625f","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:23.093Z","level":"info","msg":"display set","paneId":"b1877d8e-688b-4516-aa01-dae0af8a625f","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:23.121Z","level":"info","msg":"display set","paneId":"b1877d8e-688b-4516-aa01-dae0af8a625f","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:23.148Z","level":"info","msg":"display set","paneId":"b1877d8e-688b-4516-aa01-dae0af8a625f","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:23.177Z","level":"info","msg":"display set","paneId":"b552b505-2fcc-44c3-99a8-1db2e88a0c48","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:23.226Z","level":"info","msg":"display set","paneId":"b552b505-2fcc-44c3-99a8-1db2e88a0c48","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:23.261Z","level":"info","msg":"display set","paneId":"b552b505-2fcc-44c3-99a8-1db2e88a0c48","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:23.291Z","level":"info","msg":"display set","paneId":"b552b505-2fcc-44c3-99a8-1db2e88a0c48","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:23.495Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:23.496Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:23.497Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:23.521Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-078eDI/commands.json","count":0}
{"ts":"2026-10-26T23:50:23.824Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:23.824Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:23.825Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:23.833Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-52qIcv/commands.json","count":0}
{"ts":"2026-10-26T23:50:24.019Z","level":"info","msg":"display closed","paneId":"8e698433-1c92-40b9-80e3-1be2146a0127","name":"p0","reason":"closed"}
{"ts":"2026-10-26T23:50:24.019Z","level":"info","msg":"display closed","paneId":"8e698433-1c92-40b9-80e3-1be2146a0127","name":"p1","reason":"closed"}
{"ts":"2026-10-26T23:50:24.019Z","level":"info","msg":"display closed","paneId":"8e698433-1c92-40b9-80e3-1be2146a0127","name":"p2","reason":"closed"}
{"ts":"2026-10-26T23:50:24.020Z","level":"info","msg":"display closed","paneId":"8e698433-1c92-40b9-80e3-1be2146a0127","name":"p3","reason":"closed"}
{"ts":"2026-10-26T23:50:24.024Z","level":"info","msg":"display set","paneId":"ec54f5b6-1cb3-4b58-a055-1712b342b159","name":"one","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-26T23:50:24.073Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:24.074Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:24.075Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:24.087Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-XJZXWr/commands.json","count":0}
{"ts":"2026-10-26T23:50:24.392Z","level":"info","msg":"agent session attached","paneId":"47934702-720a-4893-b9ff-9232383426f3","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:24.436Z","level":"info","msg":"agent session attached","paneId":"d75d1926-038d-49c6-8b8a-3f369847d20f","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:24.554Z","level":"info","msg":"display script enabled","byClientId":"e6b15831-dbc7-4dc2-ad40-c022a27a7280","byKind":"external"}
{"ts":"2026-10-26T23:50:25.040Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:25.041Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:25.041Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:25.052Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-YRlEhJ/commands.json","count":0}
{"ts":"2026-10-26T23:50:25.182Z","level":"info","msg":"display set","paneId":"fdff3710-578e-498e-8fac-bf8ae212fd9f","name":"x","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:25.238Z","level":"info","msg":"display closed","paneId":"fdff3710-578e-498e-8fac-bf8ae212fd9f","name":"x","reason":"pane_closed"}
{"ts":"2026-10-26T23:50:25.243Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:fdff3710-578e-498e-8fac-bf8ae212fd9f"]}
{"ts":"2026-10-26T23:50:25.281Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:25.282Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:25.282Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:25.293Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-jos1MM/commands.json","count":0}
{"ts":"2026-10-26T23:50:25.750Z","level":"info","msg":"agent session attached","paneId":"d8748582-43b2-401f-b1e9-60230c779430","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:25.889Z","level":"info","msg":"display script enabled","byClientId":"5f32338f-a5a4-448e-8cc6-55d1fe717feb","byKind":"external"}
{"ts":"2026-10-26T23:50:25.982Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:25.983Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:25.983Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:25.993Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-4usxRk/commands.json","count":0}
{"ts":"2026-10-26T23:50:26.371Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:26.372Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:26.372Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:26.396Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-lzWivv/commands.json","count":0}
{"ts":"2026-10-26T23:50:26.463Z","level":"info","msg":"display script enabled","byClientId":"89f486ed-9e47-47d7-aa4e-492a01364373","byKind":"external"}
{"ts":"2026-10-26T23:50:26.622Z","level":"info","msg":"display set","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-26T23:50:26.624Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:26.636Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:26.664Z","level":"info","msg":"display set","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:26.664Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-26T23:50:26.666Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-26T23:50:26.667Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-26T23:50:26.668Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","connId":"pane-socket:6","code":"display_closed"}
{"ts":"2026-10-26T23:50:26.671Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","connId":"pane-socket:7","code":"ok"}
{"ts":"2026-10-26T23:50:26.675Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"241246c1-d941-4e24-a8d8-a043e045f8c4","connId":"pane-socket:8","code":"ok"}
{"ts":"2026-10-26T23:50:26.708Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:26.709Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:26.709Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:26.721Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-uAu348/commands.json","count":0}
{"ts":"2026-10-26T23:50:26.998Z","level":"info","msg":"agent session attached","paneId":"89e4e5ca-9b79-4108-bf07-1d6405d40c25","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:27.159Z","level":"info","msg":"display script enabled","byClientId":"19857e15-aca6-4ff5-afbf-49a837728d57","byKind":"external"}
{"ts":"2026-10-26T23:50:27.252Z","level":"info","msg":"display set","paneId":"01f786b7-b967-4fc4-8d2e-7a9dedd4c30f","name":"lay","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:27.252Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"01f786b7-b967-4fc4-8d2e-7a9dedd4c30f","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:27.275Z","level":"info","msg":"display set","paneId":"01f786b7-b967-4fc4-8d2e-7a9dedd4c30f","name":"bd","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-26T23:50:27.275Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"01f786b7-b967-4fc4-8d2e-7a9dedd4c30f","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:27.277Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"01f786b7-b967-4fc4-8d2e-7a9dedd4c30f","connId":"pane-socket:3","code":"invalid_display"}
{"ts":"2026-10-26T23:50:27.279Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"01f786b7-b967-4fc4-8d2e-7a9dedd4c30f","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-26T23:50:27.370Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:27.370Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:27.371Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:27.381Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-KKbN67/commands.json","count":0}
{"ts":"2026-10-26T23:50:27.822Z","level":"info","msg":"display script enabled","byClientId":"413edbd6-a9ec-46aa-bcdf-fa493ae8e092","byKind":"external"}
{"ts":"2026-10-26T23:50:27.960Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:27.961Z","level":"info","msg":"display set","paneId":"b37d6725-d2e7-422c-acb3-69f1f2188ae4","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-26T23:50:27.973Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:27.974Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:27.987Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-WA08fx/commands.json","count":0}
{"ts":"2026-10-26T23:50:28.060Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:28.061Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:28.061Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:28.071Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-Sl3JsN/commands.json","count":0}
{"ts":"2026-10-26T23:50:28.492Z","level":"info","msg":"display script enabled","byClientId":"2d59ec15-ee1e-40b9-bb13-3a8a0cd3d19b","byKind":"external"}
{"ts":"2026-10-26T23:50:28.654Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:28.655Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:28.655Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:28.667Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-99MGk3/commands.json","count":0}
{"ts":"2026-10-26T23:50:28.878Z","level":"info","msg":"agent session attached","paneId":"6f122c4a-7e33-4920-afb3-5824a9ec7bf5","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:29.040Z","level":"info","msg":"display set","paneId":"6093a4ad-636c-42aa-9363-c9de7316a3c2","name":"secret","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-26T23:50:29.044Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"25a4ee6f-757e-44da-9d87-ae9370fea0f9","connId":"pane-socket:1","code":"display_closed"}
{"ts":"2026-10-26T23:50:29.093Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"25a4ee6f-757e-44da-9d87-ae9370fea0f9","connId":"pane-socket:2","code":"invalid_params"}
{"ts":"2026-10-26T23:50:29.177Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:29.177Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:29.177Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:29.189Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-ez41Hp/commands.json","count":0}
{"ts":"2026-10-26T23:50:29.244Z","level":"info","msg":"agent session attached","paneId":"4ed9df2c-17bc-45a9-8c21-36d580809f14","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:50:29.640Z","level":"info","msg":"display script enabled","byClientId":"fa414272-8026-4b74-8dea-66b3498d9d14","byKind":"external"}
{"ts":"2026-10-26T23:50:29.794Z","level":"info","msg":"display set","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-26T23:50:29.794Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:29.798Z","level":"info","msg":"display reported","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:50:29.800Z","level":"info","msg":"display reported","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:50:29.811Z","level":"info","msg":"display closed","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","name":"g","reason":"closed"}
{"ts":"2026-10-26T23:50:29.811Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:29.813Z","level":"info","msg":"display set","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-26T23:50:29.814Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-26T23:50:29.831Z","level":"info","msg":"agent report ignored","paneId":"4ed9df2c-17bc-45a9-8c21-36d580809f14","kind":"claude","session":"3e81f9a7","reason":"the reporting process is not a descendant of the pane's shell","agentPid":1027357}
{"ts":"2026-10-26T23:50:29.868Z","level":"info","msg":"display reported","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:50:29.868Z","level":"info","msg":"display closed","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","name":"g","reason":"focus_steal"}
{"ts":"2026-10-26T23:50:29.868Z","level":"info","msg":"display script cooldown","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","reason":"focus_steal","closed":1,"ms":300000}
{"ts":"2026-10-26T23:50:29.869Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-26T23:50:29.872Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","connId":"pane-socket:5","code":"display_busy"}
{"ts":"2026-10-26T23:50:29.873Z","level":"info","msg":"display set","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","name":"h","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:29.873Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-26T23:50:29.875Z","level":"info","msg":"display reported","paneId":"e74b6e06-c1a6-4156-927f-3bdba14d8c14","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:50:29.912Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:29.913Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:29.913Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:29.939Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-p1EraO/commands.json","count":0}
{"ts":"2026-10-26T23:50:30.253Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:30.254Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:30.254Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:30.264Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-a55KsZ/state-z2uvbP/commands.json","count":0}
{"ts":"2026-10-26T23:50:30.414Z","level":"info","msg":"display script enabled","byClientId":"98694381-6ad4-4ec6-b7ab-b01baed9966e","byKind":"external"}
{"ts":"2026-10-26T23:50:30.556Z","level":"info","msg":"display set","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-26T23:50:30.556Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:30.559Z","level":"info","msg":"display reported","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:50:30.560Z","level":"info","msg":"display reported","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:50:30.562Z","level":"info","msg":"display closed","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","name":"g","reason":"closed"}
{"ts":"2026-10-26T23:50:30.562Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:30.570Z","level":"info","msg":"display reported","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-26T23:50:30.570Z","level":"info","msg":"display script cooldown","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","reason":"focus_steal","closed":0,"ms":300000}
{"ts":"2026-10-26T23:50:30.572Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"12da6355-b4be-4e60-91ca-d47d7b9b7ad1","connId":"pane-socket:3","code":"display_busy"}
{"ts":"2026-10-26T23:50:30.609Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:30.609Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:30.609Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:30.623Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-vUHJQE/commands.json","count":0}
{"ts":"2026-10-26T23:50:31.023Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ec11ce07-1f72-48e1-9bff-baa93a174c54","connId":"pane-socket:1","code":"display_script_disabled"}
{"ts":"2026-10-26T23:50:31.025Z","level":"info","msg":"display set","paneId":"ec11ce07-1f72-48e1-9bff-baa93a174c54","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:31.025Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"ec11ce07-1f72-48e1-9bff-baa93a174c54","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:31.026Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"ec11ce07-1f72-48e1-9bff-baa93a174c54","connId":"pane-socket:3","code":"display_script_disabled"}
{"ts":"2026-10-26T23:50:31.027Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"ec11ce07-1f72-48e1-9bff-baa93a174c54","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-26T23:50:31.057Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:31.058Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:31.058Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:31.068Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-PgCQZm/commands.json","count":0}
{"ts":"2026-10-26T23:50:31.534Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:31.536Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:31.536Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:31.545Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-Sk1PPC/commands.json","count":0}
{"ts":"2026-10-26T23:50:31.625Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","connId":"pane-socket:1","code":"display_script_disabled"}
{"ts":"2026-10-26T23:50:31.630Z","level":"info","msg":"display script enabled","byClientId":"fe772adc-669c-427a-9ea5-aab37225b4aa","byKind":"external"}
{"ts":"2026-10-26T23:50:31.632Z","level":"info","msg":"display set","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-26T23:50:31.632Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:31.633Z","level":"info","msg":"display set","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-26T23:50:31.633Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-26T23:50:31.740Z","level":"info","msg":"display closed","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","name":"g","reason":"script_disabled"}
{"ts":"2026-10-26T23:50:31.740Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-26T23:50:31.745Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-26T23:50:31.747Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"57f14241-336e-4619-908c-d6b2851ac2cd","connId":"pane-socket:6","code":"display_script_disabled"}
{"ts":"2026-10-26T23:50:31.776Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:31.777Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:31.777Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:31.787Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-P6MT7R/commands.json","count":0}
{"ts":"2026-10-26T23:50:31.976Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:31.977Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:31.977Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:31.981Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-KhCUAn/commands.json","count":0}
{"ts":"2026-10-26T23:50:32.181Z","level":"info","msg":"pane socket: request","op":"prefs.set","paneId":"c9f874c1-365a-4461-b370-6f3932ef317f","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-26T23:50:32.183Z","level":"info","msg":"pane socket: request","op":"prefs.get","paneId":"c9f874c1-365a-4461-b370-6f3932ef317f","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-26T23:50:32.184Z","level":"info","msg":"pane socket: request","op":"client.hello","paneId":"c9f874c1-365a-4461-b370-6f3932ef317f","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-26T23:50:32.186Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"c9f874c1-365a-4461-b370-6f3932ef317f","connId":"pane-socket:4","code":"display_script_disabled"}
{"ts":"2026-10-26T23:50:32.188Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"c9f874c1-365a-4461-b370-6f3932ef317f","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-26T23:50:32.917Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:32.919Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:32.919Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:32.925Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-slRimp/commands.json","count":0}
{"ts":"2026-10-26T23:50:33.550Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:33.625Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:33.626Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:33.626Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:33.633Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-qFnr16/commands.json","count":0}
{"ts":"2026-10-26T23:50:33.635Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:33.635Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:33.636Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:33.641Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-bTlV0w/commands.json","count":0}
{"ts":"2026-10-26T23:50:34.050Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:34.050Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:34.051Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:34.058Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-tiuEBP/commands.json","count":0}
{"ts":"2026-10-26T23:50:34.510Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:50:34.643Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:34.644Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:34.644Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:34.652Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-F0mhU4/commands.json","count":0}
{"ts":"2026-10-26T23:50:35.078Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:35.079Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:35.079Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:35.089Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-4gvdIZ/commands.json","count":0}
{"ts":"2026-10-26T23:50:35.579Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:50:36.709Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:36.752Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:36.754Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:36.754Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:36.764Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-CH9k8v/commands.json","count":0}
{"ts":"2026-10-26T23:50:37.339Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:37.340Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:37.340Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:37.347Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-rnRRbK/commands.json","count":0}
{"ts":"2026-10-26T23:50:37.527Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:37.640Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:37.642Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:37.642Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:37.648Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-dMQtbO/commands.json","count":0}
{"ts":"2026-10-26T23:50:37.724Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:37.725Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:37.725Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:37.732Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-ydMU3M/commands.json","count":0}
{"ts":"2026-10-26T23:50:37.786Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:50:38.145Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:38.148Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:38.148Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:38.161Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-ndPOcu/commands.json","count":0}
{"ts":"2026-10-26T23:50:38.237Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:38.239Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:38.239Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:38.247Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-Orc8QF/commands.json","count":0}
{"ts":"2026-10-26T23:50:38.644Z","level":"info","msg":"ask opened","askId":"ee84ebcb3fedd25f37d6cda9de1e87f3","paneId":"4871bc42-cc95-40fc-9a5a-e7303f06d9cb","questions":1,"media":0}
{"ts":"2026-10-26T23:50:38.789Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"attention","reason":"リモートで soda serve が動いていません（リモートで起動してください）（soda: no running soda serve for session default）"}
{"ts":"2026-10-26T23:50:38.844Z","level":"info","msg":"ask closed","askId":"ee84ebcb3fedd25f37d6cda9de1e87f3","paneId":"4871bc42-cc95-40fc-9a5a-e7303f06d9cb","status":"answered"}
{"ts":"2026-10-26T23:50:38.845Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"4871bc42-cc95-40fc-9a5a-e7303f06d9cb","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:38.899Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:38.900Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:38.900Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:38.925Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-dT3Tag/commands.json","count":0}
{"ts":"2026-10-26T23:50:38.928Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:38.930Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:38.930Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:38.938Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-7dObEV/commands.json","count":0}
{"ts":"2026-10-26T23:50:39.334Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:39.335Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:39.336Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:39.345Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-Kr4Zp8/commands.json","count":0}
{"ts":"2026-10-26T23:50:39.354Z","level":"info","msg":"ask opened","askId":"16948d30ec64bf090d64f746a7349066","paneId":"519cc966-cfcf-4d13-a2c0-dc80f326876e","questions":1,"media":0}
{"ts":"2026-10-26T23:50:39.376Z","level":"info","msg":"ask closed","askId":"16948d30ec64bf090d64f746a7349066","paneId":"519cc966-cfcf-4d13-a2c0-dc80f326876e","status":"answered"}
{"ts":"2026-10-26T23:50:39.376Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"519cc966-cfcf-4d13-a2c0-dc80f326876e","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:39.439Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:39.440Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:39.440Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:39.447Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-jeMX7N/commands.json","count":0}
{"ts":"2026-10-26T23:50:39.767Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:50:39.894Z","level":"info","msg":"ask opened","askId":"20914c932373242895e8b4a3bcf2ab94","paneId":"6d9713f6-39bc-47c9-ab14-5d63c28d5f55","questions":1,"media":0}
{"ts":"2026-10-26T23:50:39.924Z","level":"info","msg":"ask closed","askId":"20914c932373242895e8b4a3bcf2ab94","paneId":"6d9713f6-39bc-47c9-ab14-5d63c28d5f55","status":"cancelled"}
{"ts":"2026-10-26T23:50:39.924Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"6d9713f6-39bc-47c9-ab14-5d63c28d5f55","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:40.055Z","level":"info","msg":"ask opened","askId":"ef8bba0194f2054a0f09906b5c796d42","paneId":"6d9713f6-39bc-47c9-ab14-5d63c28d5f55","questions":1,"media":0}
{"ts":"2026-10-26T23:50:41.056Z","level":"info","msg":"ask closed","askId":"ef8bba0194f2054a0f09906b5c796d42","paneId":"6d9713f6-39bc-47c9-ab14-5d63c28d5f55","status":"timeout"}
{"ts":"2026-10-26T23:50:41.056Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"6d9713f6-39bc-47c9-ab14-5d63c28d5f55","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:41.110Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:41.111Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:41.111Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:41.119Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-1iFcyZ/commands.json","count":0}
{"ts":"2026-10-26T23:50:41.153Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:41.154Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:41.154Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:41.163Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-oRzp15/commands.json","count":0}
{"ts":"2026-10-26T23:50:41.488Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"1d3b1781-e32c-498f-a99f-97a41410c51e","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:41.527Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"1d3b1781-e32c-498f-a99f-97a41410c51e","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:50:41.560Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:41.561Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:41.561Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:41.567Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-3wsz5T/commands.json","count":0}
{"ts":"2026-10-26T23:50:41.569Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:41.570Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:41.570Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:41.589Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-q0hp7g/commands.json","count":0}
{"ts":"2026-10-26T23:50:42.180Z","level":"info","msg":"ask opened","askId":"a7c5fe5e7db0214d832b25eb31dc282d","paneId":"a66db1e3-81fb-40f4-a393-053c8b861997","questions":1,"media":0}
{"ts":"2026-10-26T23:50:42.214Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"a66db1e3-81fb-40f4-a393-053c8b861997","connId":"pane-socket:1","code":"ask_busy"}
{"ts":"2026-10-26T23:50:42.221Z","level":"info","msg":"ask closed","askId":"a7c5fe5e7db0214d832b25eb31dc282d","paneId":"a66db1e3-81fb-40f4-a393-053c8b861997","status":"cancelled"}
{"ts":"2026-10-26T23:50:42.224Z","level":"info","msg":"ask opened","askId":"9597ec59804958c4ae1c678738c1ce40","paneId":"a66db1e3-81fb-40f4-a393-053c8b861997","questions":1,"media":0}
{"ts":"2026-10-26T23:50:42.249Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"a66db1e3-81fb-40f4-a393-053c8b861997","connId":"pane-socket:3","code":"ask_busy"}
{"ts":"2026-10-26T23:50:42.251Z","level":"info","msg":"ask closed","askId":"9597ec59804958c4ae1c678738c1ce40","paneId":"a66db1e3-81fb-40f4-a393-053c8b861997","status":"cancelled"}
{"ts":"2026-10-26T23:50:42.256Z","level":"info","msg":"ask opened","askId":"30c6685a7836ca7f136af1d66f909b82","paneId":"dd40e4d3-1900-4505-9163-a3ec441ee0de","questions":1,"media":0}
{"ts":"2026-10-26T23:50:42.286Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.287Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.287Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:42.296Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-0RVugV/commands.json","count":0}
{"ts":"2026-10-26T23:50:42.309Z","level":"info","msg":"ask closed","askId":"30c6685a7836ca7f136af1d66f909b82","paneId":"dd40e4d3-1900-4505-9163-a3ec441ee0de","status":"answered"}
{"ts":"2026-10-26T23:50:42.313Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:42.393Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.395Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.395Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:42.403Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-xdr8Sa/commands.json","count":0}
{"ts":"2026-10-26T23:50:42.681Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:42.739Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.740Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.740Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:42.753Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-YoNaQ1/commands.json","count":0}
{"ts":"2026-10-26T23:50:42.758Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"p99","connId":"pane-socket:1","code":"not_found"}
{"ts":"2026-10-26T23:50:42.760Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"6d1a0b38-823d-4d2a-abab-0d8df31c3271","connId":"pane-socket:2","code":"invalid_params"}
{"ts":"2026-10-26T23:50:42.761Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"6d1a0b38-823d-4d2a-abab-0d8df31c3271","connId":"pane-socket:3","code":"invalid_params"}
{"ts":"2026-10-26T23:50:42.762Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"6d1a0b38-823d-4d2a-abab-0d8df31c3271","connId":"pane-socket:4","code":"invalid_ask_spec"}
{"ts":"2026-10-26T23:50:42.766Z","level":"info","msg":"ask opened","askId":"80b8dc7f48da2f52770838bbc962c124","paneId":"6d1a0b38-823d-4d2a-abab-0d8df31c3271","questions":1,"media":0}
{"ts":"2026-10-26T23:50:42.787Z","level":"info","msg":"ask closed","askId":"80b8dc7f48da2f52770838bbc962c124","paneId":"6d1a0b38-823d-4d2a-abab-0d8df31c3271","status":"cancelled"}
{"ts":"2026-10-26T23:50:42.817Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.818Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.818Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:42.821Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.822Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:42.822Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:42.827Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-2BhlhE/commands.json","count":0}
{"ts":"2026-10-26T23:50:42.831Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-GUZBm4/commands.json","count":0}
{"ts":"2026-10-26T23:50:43.168Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:43.168Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:43.168Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:43.180Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-YrmJvA/commands.json","count":0}
{"ts":"2026-10-26T23:50:43.249Z","level":"info","msg":"ask opened","askId":"7c3a64cd440665ecdf1243ded0952b23","paneId":"9dbd5727-98ce-4c96-98d8-9b921ae640de","questions":1,"media":0}
{"ts":"2026-10-26T23:50:43.269Z","level":"info","msg":"ask closed","askId":"7c3a64cd440665ecdf1243ded0952b23","paneId":"9dbd5727-98ce-4c96-98d8-9b921ae640de","status":"cancelled"}
{"ts":"2026-10-26T23:50:43.383Z","level":"info","msg":"ask opened","askId":"164b3b9a6cdfee8962ffa55ce83ca47f","paneId":"9dbd5727-98ce-4c96-98d8-9b921ae640de","questions":1,"media":0}
{"ts":"2026-10-26T23:50:43.405Z","level":"info","msg":"ask closed","askId":"164b3b9a6cdfee8962ffa55ce83ca47f","paneId":"9dbd5727-98ce-4c96-98d8-9b921ae640de","status":"cancelled"}
{"ts":"2026-10-26T23:50:43.498Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:43.500Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:43.501Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:43.530Z","level":"info","msg":"display set","paneId":"c5bb91a1-755e-437b-9e37-e5aaa82696fa","name":"two","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-26T23:50:43.538Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-dPF24z/commands.json","count":0}
{"ts":"2026-10-26T23:50:43.696Z","level":"info","msg":"display set","paneId":"c5bb91a1-755e-437b-9e37-e5aaa82696fa","name":"quotes","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-26T23:50:43.869Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:43.907Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:43.908Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:43.908Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:43.920Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-EDudoK/commands.json","count":0}
{"ts":"2026-10-26T23:50:43.938Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.940Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.941Z","level":"info","msg":"pane socket: request","op":"agent.send_keys","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.942Z","level":"info","msg":"pane socket: request","op":"workspace.create","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:4","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.943Z","level":"info","msg":"pane socket: request","op":"pane.rename","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:5","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.944Z","level":"info","msg":"pane socket: request","op":"ask.subscribe","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:6","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.945Z","level":"info","msg":"pane socket: request","op":"agent.fork","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:7","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.946Z","level":"info","msg":"pane socket: request","op":"agent.fork_preview","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:8","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.946Z","level":"info","msg":"pane socket: request","op":"agent.usage","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:9","code":"unknown_op"}
{"ts":"2026-10-26T23:50:43.947Z","level":"info","msg":"pane socket: request","op":"agent.usage_watch","paneId":"c1594a50-5e6e-4545-8417-6f7daa172c41","connId":"pane-socket:10","code":"unknown_op"}
{"ts":"2026-10-26T23:50:44.368Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:44.369Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:44.369Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:44.380Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-gH6IXt/commands.json","count":0}
{"ts":"2026-10-26T23:50:44.403Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:44.404Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:44.404Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:44.431Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-dUTKpK/commands.json","count":0}
{"ts":"2026-10-26T23:50:44.886Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:44.887Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:44.887Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:44.893Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-lexq2S/commands.json","count":0}
{"ts":"2026-10-26T23:50:45.066Z","level":"info","msg":"ask opened","askId":"945cd3d5b7d8ee75ea8678797723cd8c","paneId":"0e7a4f61-8ac5-4422-93fe-18ccff53331f","questions":1,"media":2}
{"ts":"2026-10-26T23:50:45.118Z","level":"info","msg":"ask closed","askId":"945cd3d5b7d8ee75ea8678797723cd8c","paneId":"0e7a4f61-8ac5-4422-93fe-18ccff53331f","status":"cancelled"}
{"ts":"2026-10-26T23:50:45.124Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:45.160Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:45.162Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:45.162Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:45.188Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-ZOyMar/commands.json","count":0}
{"ts":"2026-10-26T23:50:45.633Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:45.634Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:45.634Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:45.645Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-hHisWN/commands.json","count":0}
{"ts":"2026-10-26T23:50:46.145Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"f87ad583-d763-4d13-aed6-1cf9cc4878c5","connId":"pane-socket:1","code":"not_found"}
{"ts":"2026-10-26T23:50:46.211Z","level":"info","msg":"ask opened","askId":"b08b36630e08915dc09e1982d4adae32","paneId":"f87ad583-d763-4d13-aed6-1cf9cc4878c5","questions":1,"media":0}
{"ts":"2026-10-26T23:50:46.233Z","level":"info","msg":"ask closed","askId":"b08b36630e08915dc09e1982d4adae32","paneId":"f87ad583-d763-4d13-aed6-1cf9cc4878c5","status":"cancelled"}
{"ts":"2026-10-26T23:50:46.292Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:46.293Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:46.293Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:46.302Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-l2yqgv/commands.json","count":0}
{"ts":"2026-10-26T23:50:46.380Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:46.739Z","level":"info","msg":"ask opened","askId":"ac73cf5955f70d37b364ee98e55fa551","paneId":"eb16902d-c0bd-4927-9785-d22f8b7ac75e","questions":1,"media":0}
{"ts":"2026-10-26T23:50:46.757Z","level":"info","msg":"ask closed","askId":"ac73cf5955f70d37b364ee98e55fa551","paneId":"eb16902d-c0bd-4927-9785-d22f8b7ac75e","status":"cancelled"}
{"ts":"2026-10-26T23:50:46.785Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:46.786Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:46.786Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:46.795Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-ZekCeb/commands.json","count":0}
{"ts":"2026-10-26T23:50:47.174Z","level":"warn","msg":"cannot start the pane socket; `sodactl ask` in a pane needs a login","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-psock-ZekCeb/.p-VN3jsX/s' -> '/tmp/soda-psock-ZekCeb/pane.sock'"}
{"ts":"2026-10-26T23:50:47.260Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:47.261Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:47.261Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:47.268Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-po6Qm0/commands.json","count":0}
{"ts":"2026-10-26T23:50:47.589Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:47.757Z","level":"info","msg":"ask opened","askId":"ae82856c55cb43291f54b43f4f542cdb","paneId":"3d80a4d2-8f85-4f37-b9be-2ea1359c545b","questions":1,"media":0}
{"ts":"2026-10-26T23:50:47.777Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"3d80a4d2-8f85-4f37-b9be-2ea1359c545b","connId":"pane-socket:2","code":"invalid_ask_spec"}
{"ts":"2026-10-26T23:50:47.779Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"3d80a4d2-8f85-4f37-b9be-2ea1359c545b","connId":"pane-socket:3","code":"invalid_params"}
{"ts":"2026-10-26T23:50:47.780Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"3d80a4d2-8f85-4f37-b9be-2ea1359c545b","connId":"pane-socket:4","code":"unknown_op"}
{"ts":"2026-10-26T23:50:47.781Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"p99","connId":"pane-socket:5","code":"not_found"}
{"ts":"2026-10-26T23:50:47.782Z","level":"info","msg":"ask closed","askId":"ae82856c55cb43291f54b43f4f542cdb","paneId":"3d80a4d2-8f85-4f37-b9be-2ea1359c545b","status":"answered"}
{"ts":"2026-10-26T23:50:47.783Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"3d80a4d2-8f85-4f37-b9be-2ea1359c545b","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:50:48.324Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:48.327Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:48.327Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:48.334Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-X4LvUX/commands.json","count":0}
{"ts":"2026-10-26T23:50:48.573Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:48.576Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:48.576Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:48.582Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-hpb9U9/commands.json","count":0}
{"ts":"2026-10-26T23:50:49.333Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:49.334Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:49.334Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:49.354Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-jggfA6/commands.json","count":0}
{"ts":"2026-10-26T23:50:50.689Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:50.690Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:50.690Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:50.695Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-j0zUHc/commands.json","count":0}
{"ts":"2026-10-26T23:50:51.095Z","level":"info","msg":"machine link closed","machine":"a65a59fc62186febbd1d258480bb331d","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-26T23:50:52.235Z","level":"info","msg":"machine link closed","machine":"a65a59fc62186febbd1d258480bb331d","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:50:52.577Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:52.579Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:52.579Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:52.609Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-rdFTox/commands.json","count":0}
{"ts":"2026-10-26T23:50:52.795Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:52.796Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:52.796Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:52.802Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-I33tu9/commands.json","count":0}
{"ts":"2026-10-26T23:50:53.240Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:53.242Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:53.242Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:53.251Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-tNmQ0O/commands.json","count":0}
{"ts":"2026-10-26T23:50:53.861Z","level":"info","msg":"machine link closed","machine":"02cdc6c3345fd7e5dcd7b341cd7d74f7","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:50:54.058Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:54.059Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:54.059Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:54.067Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-DFfTt4/commands.json","count":0}
{"ts":"2026-10-26T23:50:54.389Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:54.390Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:54.390Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:54.397Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-tNmQ0O/commands.json","count":0}
{"ts":"2026-10-26T23:50:54.794Z","level":"info","msg":"agent resume skipped","paneId":"0d3d652d-e45c-433e-be3e-59858c1e99fa","reason":"no-session-ref"}
{"ts":"2026-10-26T23:50:54.887Z","level":"info","msg":"machine link closed","machine":"02cdc6c3345fd7e5dcd7b341cd7d74f7","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:50:54.943Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:54.944Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:54.944Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:54.954Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-xTqBS3/commands.json","count":0}
{"ts":"2026-10-26T23:50:55.394Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:55.395Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:55.395Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:55.404Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-hS14If/commands.json","count":0}
{"ts":"2026-10-26T23:50:56.061Z","level":"info","msg":"machine link closed","machine":"f6216214b7a271a092a330f52a978aa9","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-26T23:50:56.114Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:56.115Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:56.115Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:56.127Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-IUHTwL/commands.json","count":0}
{"ts":"2026-10-26T23:50:56.335Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:56.340Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:56.344Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:56.358Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-T4Opo1/commands.json","count":0}
{"ts":"2026-10-26T23:50:56.707Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:56.717Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:56.718Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:56.727Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-dFBOmG/commands.json","count":0}
{"ts":"2026-10-26T23:50:57.202Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:57.203Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:57.203Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:57.211Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-A7I756/commands.json","count":0}
{"ts":"2026-10-26T23:50:57.673Z","level":"info","msg":"machine link closed","machine":"8371779d51c5796019e8a025a2fcf31f","kind":"transient","reason":"接続が切れました（ssh: connect to host 127.0.0.1 port 1: Connection refused）"}
{"ts":"2026-10-26T23:50:58.440Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:58.442Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:58.442Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:58.450Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-5AT8kR/commands.json","count":0}
{"ts":"2026-10-26T23:50:58.957Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:58.958Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:58.958Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:58.964Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-SpShCB/sessions/work/commands.json","count":0}
{"ts":"2026-10-26T23:50:59.452Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:59.453Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:59.454Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:59.454Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:59.455Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:59.455Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:59.484Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-Hfcnq1/commands.json","count":0}
{"ts":"2026-10-26T23:50:59.486Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-Hfcnq1/commands.json","count":0}
{"ts":"2026-10-26T23:50:59.941Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:50:59.942Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:50:59.942Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:50:59.950Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-7piuSo/commands.json","count":0}
{"ts":"2026-10-26T23:51:00.827Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:00.828Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:00.828Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:00.835Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-V7P975/commands.json","count":0}
{"ts":"2026-10-26T23:51:01.283Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:01.284Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:01.284Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:01.292Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-XAAloo/commands.json","count":0}
{"ts":"2026-10-26T23:51:02.265Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:02.266Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:02.266Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:02.272Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-hIg3fR/commands.json","count":0}
{"ts":"2026-10-26T23:51:02.730Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:02.730Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:02.731Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:02.737Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-7xR5WH/commands.json","count":0}
{"ts":"2026-10-26T23:51:02.769Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:02.770Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:02.770Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:02.781Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-bwENNS/state-b6O0Ij/commands.json","count":0}
{"ts":"2026-10-26T23:51:03.214Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:03.215Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:03.215Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:03.224Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-MzuWZR/commands.json","count":0}
{"ts":"2026-10-26T23:51:03.939Z","level":"info","msg":"agent session attached","paneId":"8c5b126e-53f6-45ca-9341-b508664b601b","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-26T23:51:04.086Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:04.087Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:04.087Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:04.095Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-sUUwLO/commands.json","count":0}
{"ts":"2026-10-26T23:51:05.093Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:05.095Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:05.095Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:05.104Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-egGLHZ/commands.json","count":0}
{"ts":"2026-10-26T23:51:05.579Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:05.581Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:05.581Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:05.612Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-Qjp7IU/commands.json","count":0}
{"ts":"2026-10-26T23:51:05.775Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:05.777Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:05.777Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:05.784Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-9P1z4V/commands.json","count":0}
{"ts":"2026-10-26T23:51:05.999Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:06.001Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:06.002Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:06.010Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-b9jLLy/commands.json","count":0}
{"ts":"2026-10-26T23:51:06.067Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:06.068Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:06.068Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:06.077Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-2BwcWf/commands.json","count":0}
{"ts":"2026-10-26T23:51:06.501Z","level":"info","msg":"ask opened","askId":"a64531b3a1fa368dded5cf3e5eb7d6f8","paneId":"a7a20312-88fb-4748-82ff-df98a4499a76","questions":1,"media":0}
{"ts":"2026-10-26T23:51:06.523Z","level":"info","msg":"ask closed","askId":"a64531b3a1fa368dded5cf3e5eb7d6f8","paneId":"a7a20312-88fb-4748-82ff-df98a4499a76","status":"answered"}
{"ts":"2026-10-26T23:51:06.590Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:06.591Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:06.591Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:06.598Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-x5JBcm/commands.json","count":0}
{"ts":"2026-10-26T23:51:07.170Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:07.171Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:07.171Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:07.178Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-SRnLnq/commands.json","count":0}
{"ts":"2026-10-26T23:51:07.208Z","level":"info","msg":"ask opened","askId":"bbafbb907cf4c63b9a69c8e554606524","paneId":"0eeb73af-52ed-4b90-844f-e0cc7c0634bd","questions":13,"media":0}
{"ts":"2026-10-26T23:51:07.251Z","level":"info","msg":"ask closed","askId":"bbafbb907cf4c63b9a69c8e554606524","paneId":"0eeb73af-52ed-4b90-844f-e0cc7c0634bd","status":"answered"}
{"ts":"2026-10-26T23:51:07.291Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:07.292Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:07.292Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:07.302Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-mdEqMx/commands.json","count":0}
{"ts":"2026-10-26T23:51:07.598Z","level":"info","msg":"agent session attached","paneId":"bba9341c-b97c-4403-a803-b796abcbdb39","kind":"claude","session":"e7ad59ab","source":"hook"}
{"ts":"2026-10-26T23:51:07.928Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:07.929Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:07.929Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:07.938Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-kP9wbd/commands.json","count":0}
{"ts":"2026-10-26T23:51:08.225Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:08.226Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:08.226Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:08.234Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-uHysfg/commands.json","count":0}
{"ts":"2026-10-26T23:51:08.571Z","level":"info","msg":"ask opened","askId":"13cac4542602849789db5218bd29327d","paneId":"1ffdd3a1-c0b8-4e8b-8313-1a2184af3acf","questions":1,"media":0}
{"ts":"2026-10-26T23:51:08.597Z","level":"info","msg":"ask closed","askId":"13cac4542602849789db5218bd29327d","paneId":"1ffdd3a1-c0b8-4e8b-8313-1a2184af3acf","status":"cancelled"}
{"ts":"2026-10-26T23:51:08.629Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:08.629Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:08.629Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:08.639Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-Och9A5/commands.json","count":0}
{"ts":"2026-10-26T23:51:09.131Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:09.132Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:09.132Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:09.141Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-Sy1SMV/commands.json","count":0}
{"ts":"2026-10-26T23:51:09.242Z","level":"info","msg":"ask opened","askId":"d7f3f4f48b9d899ea19e2677211bcef5","paneId":"82a0fde4-9530-4125-89b3-f2b7ab68d1c6","questions":1,"media":0}
{"ts":"2026-10-26T23:51:09.310Z","level":"info","msg":"ask closed","askId":"d7f3f4f48b9d899ea19e2677211bcef5","paneId":"82a0fde4-9530-4125-89b3-f2b7ab68d1c6","status":"cancelled"}
{"ts":"2026-10-26T23:51:09.342Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:09.343Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:09.343Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:09.352Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-J0RpXN/commands.json","count":0}
{"ts":"2026-10-26T23:51:09.918Z","level":"info","msg":"ask opened","askId":"b16428c0e273eeafc0159d9eac34237f","paneId":"c966020d-f577-4e12-a94f-439ad6cff898","questions":3,"media":0}
{"ts":"2026-10-26T23:51:09.978Z","level":"info","msg":"ask closed","askId":"b16428c0e273eeafc0159d9eac34237f","paneId":"c966020d-f577-4e12-a94f-439ad6cff898","status":"answered"}
{"ts":"2026-10-26T23:51:10.014Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:10.015Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:10.015Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:10.025Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-OX3hkq/commands.json","count":0}
{"ts":"2026-10-26T23:51:10.084Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:10.085Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:10.085Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:10.094Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-DqnVII/commands.json","count":0}
{"ts":"2026-10-26T23:51:10.591Z","level":"info","msg":"ask opened","askId":"0eeefbcac49d86c85776d567c1ddd6d7","paneId":"bf8337dc-1f4c-4454-81a5-57efb8964484","questions":1,"media":0}
{"ts":"2026-10-26T23:51:10.650Z","level":"info","msg":"ask closed","askId":"0eeefbcac49d86c85776d567c1ddd6d7","paneId":"bf8337dc-1f4c-4454-81a5-57efb8964484","status":"answered"}
{"ts":"2026-10-26T23:51:10.688Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:10.689Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:10.689Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:10.698Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-tw2G6Q/commands.json","count":0}
{"ts":"2026-10-26T23:51:11.102Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:11.103Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:11.103Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:11.113Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-EWmt2V/commands.json","count":0}
{"ts":"2026-10-26T23:51:11.253Z","level":"info","msg":"ask opened","askId":"7b7fce0bd9a4eaee311cfde3adfd5cfe","paneId":"06e4ed95-aae9-4590-9be4-212cf33a0148","questions":1,"media":0}
{"ts":"2026-10-26T23:51:11.274Z","level":"info","msg":"ask closed","askId":"7b7fce0bd9a4eaee311cfde3adfd5cfe","paneId":"06e4ed95-aae9-4590-9be4-212cf33a0148","status":"cancelled"}
{"ts":"2026-10-26T23:51:11.825Z","level":"info","msg":"ask opened","askId":"08896f066fa2b7f142ae9c12b9c20a59","paneId":"547f5b2d-59b7-44b3-9492-063c642bf2fe","questions":1,"media":0}
{"ts":"2026-10-26T23:51:11.867Z","level":"info","msg":"ask closed","askId":"08896f066fa2b7f142ae9c12b9c20a59","paneId":"547f5b2d-59b7-44b3-9492-063c642bf2fe","status":"cancelled"}
{"ts":"2026-10-26T23:51:11.902Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:547f5b2d-59b7-44b3-9492-063c642bf2fe"]}
{"ts":"2026-10-26T23:51:11.943Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:11.944Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:11.944Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:11.955Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-WvaoYO/commands.json","count":0}
{"ts":"2026-10-26T23:51:12.632Z","level":"info","msg":"ask opened","askId":"85bdca6403f03411e325f000335535a7","paneId":"e4b1fd5d-6360-4920-bce1-4224dc05d016","questions":1,"media":0}
{"ts":"2026-10-26T23:51:12.673Z","level":"info","msg":"ask closed","askId":"85bdca6403f03411e325f000335535a7","paneId":"e4b1fd5d-6360-4920-bce1-4224dc05d016","status":"cancelled"}
{"ts":"2026-10-26T23:51:12.713Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:12.714Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:12.714Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:12.724Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-xKE9PZ/commands.json","count":0}
{"ts":"2026-10-26T23:51:12.796Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:12.798Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:12.798Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:12.804Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-PnD5Ub/commands.json","count":0}
{"ts":"2026-10-26T23:51:13.187Z","level":"info","msg":"ask opened","askId":"c36d6c723e76b95293c2dc4d237a62ff","paneId":"1c4a45fd-c127-427b-8e2b-aaf815525050","questions":1,"media":0}
{"ts":"2026-10-26T23:51:13.283Z","level":"info","msg":"ask closed","askId":"c36d6c723e76b95293c2dc4d237a62ff","paneId":"1c4a45fd-c127-427b-8e2b-aaf815525050","status":"answered"}
{"ts":"2026-10-26T23:51:13.618Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:13.619Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:13.619Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:13.627Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-0sMZ9G/commands.json","count":0}
{"ts":"2026-10-26T23:51:13.994Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:13.997Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:13.997Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:14.005Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-VcmF5W/commands.json","count":0}
{"ts":"2026-10-26T23:51:14.076Z","level":"info","msg":"display script enabled","byClientId":"ad56bef2-af08-444f-bf94-3dca3fa1fc8b","byKind":"external"}
{"ts":"2026-10-26T23:51:14.084Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.086Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.087Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:14.095Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-D00swV/commands.json","count":0}
{"ts":"2026-10-26T23:51:14.132Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.133Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.133Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:14.140Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-vEwlkK/commands.json","count":0}
{"ts":"2026-10-26T23:51:14.523Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.524Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.525Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:14.529Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-VcmF5W/commands.json","count":0}
{"ts":"2026-10-26T23:51:14.535Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":37731}
{"ts":"2026-10-26T23:51:14.559Z","level":"info","msg":"handoff: complete","id":"abcdef01","adopted":1,"dropped":0}
{"ts":"2026-10-26T23:51:14.646Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.647Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.647Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:14.652Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-2trRE4/commands.json","count":0}
{"ts":"2026-10-26T23:51:14.785Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.786Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:14.786Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:14.793Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-BlQAFA/commands.json","count":0}
{"ts":"2026-10-26T23:51:15.062Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.063Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.063Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:15.068Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-2trRE4/commands.json","count":0}
{"ts":"2026-10-26T23:51:15.072Z","level":"warn","msg":"handoff: closed terminals that were not part of the handoff","closed":1}
{"ts":"2026-10-26T23:51:15.072Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":45917}
{"ts":"2026-10-26T23:51:15.082Z","level":"info","msg":"handoff: complete","id":"abcdef04","adopted":1,"dropped":0}
{"ts":"2026-10-26T23:51:15.138Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.139Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.139Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:15.144Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-l5MMG0/commands.json","count":0}
{"ts":"2026-10-26T23:51:15.424Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.425Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.425Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:15.434Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-BlQAFA/commands.json","count":0}
{"ts":"2026-10-26T23:51:15.586Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.587Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.587Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:15.594Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-l5MMG0/commands.json","count":0}
{"ts":"2026-10-26T23:51:15.598Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":42467}
{"ts":"2026-10-26T23:51:15.762Z","level":"info","msg":"agent resume skipped","paneId":"632c6ada-5431-45bd-8f6f-1e77a30249a0","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:15.773Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.773Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.773Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:15.779Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-D00swV/commands.json","count":0}
{"ts":"2026-10-26T23:51:15.864Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.865Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:15.865Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:15.872Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-Fk5wkZ/commands.json","count":0}
{"ts":"2026-10-26T23:51:15.912Z","level":"info","msg":"agent resume skipped","paneId":"7a4c1140-ef72-4f88-8837-7deabd4b14a2","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:15.912Z","level":"info","msg":"handoff: complete","id":"abcdef02","adopted":0,"dropped":1}
{"ts":"2026-10-26T23:51:15.912Z","level":"warn","msg":"handoff: some handed-off panes were not usable and were closed","reason":"written by pid 1035730, not 1035729","panes":["7a4c1140-ef72-4f88-8837-7deabd4b14a2"]}
{"ts":"2026-10-26T23:51:16.106Z","level":"info","msg":"agent resume skipped","paneId":"9d7216d5-871e-414d-b620-8df9a58fd099","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:16.295Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:16.295Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:16.295Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:16.301Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-Vs107l/commands.json","count":0}
{"ts":"2026-10-26T23:51:16.357Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:16.358Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:16.358Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:16.367Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-WeRdtR/commands.json","count":0}
{"ts":"2026-10-26T23:51:16.410Z","level":"info","msg":"agent resume skipped","paneId":"f6955d04-41a8-47fe-b21d-863510169abb","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:16.699Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:16.699Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:16.699Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:16.704Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-Vs107l/commands.json","count":0}
{"ts":"2026-10-26T23:51:16.708Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":34481}
{"ts":"2026-10-26T23:51:16.716Z","level":"info","msg":"agent resume skipped","paneId":"ef532f38-ea6e-48c3-9f41-3199193e907f","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:16.810Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:16.811Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:16.811Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:16.819Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-UpMx8S/commands.json","count":0}
{"ts":"2026-10-26T23:51:17.021Z","level":"info","msg":"agent resume skipped","paneId":"81369d7a-76c4-41f8-9072-456f3e16260a","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:17.027Z","level":"info","msg":"agent resume skipped","paneId":"f41fa3d3-2874-4b63-90ec-2c6401a8264c","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:17.027Z","level":"info","msg":"handoff: complete","id":"abcdef03","adopted":0,"dropped":1}
{"ts":"2026-10-26T23:51:17.027Z","level":"warn","msg":"handoff: some handed-off panes were not usable and were closed","reason":"not a pty master","panes":["f41fa3d3-2874-4b63-90ec-2c6401a8264c"]}
{"ts":"2026-10-26T23:51:17.246Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:17.246Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:17.246Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:17.256Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-iFjayi/commands.json","count":0}
{"ts":"2026-10-26T23:51:17.327Z","level":"info","msg":"agent resume skipped","paneId":"01fdca0e-50f0-494c-9f26-40eb9c6be761","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:17.334Z","level":"info","msg":"graph.json was migrated to schema 2 (a copy of the old file is in graph-backups/)"}
{"ts":"2026-10-26T23:51:17.391Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:17.392Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:17.392Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:17.397Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-D00swV/commands.json","count":0}
{"ts":"2026-10-26T23:51:17.584Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:17.585Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:17.585Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:17.591Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-44vyyU/commands.json","count":0}
{"ts":"2026-10-26T23:51:17.649Z","level":"warn","msg":"origin rejected","path":"/api/local-login","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:38837","allowed":["localhost:38837","127.0.0.1:38837","[::1]:38837"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-26T23:51:17.710Z","level":"info","msg":"agent resume skipped","paneId":"9d7216d5-871e-414d-b620-8df9a58fd099","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:17.740Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:17.740Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:17.740Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:17.751Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-YSvFt6/commands.json","count":0}
{"ts":"2026-10-26T23:51:18.002Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:18.003Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:18.003Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:18.010Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-44vyyU/commands.json","count":0}
{"ts":"2026-10-26T23:51:18.014Z","level":"error","msg":"handoff: the handoff data was unusable; closed the handed-off terminals and starting normally","reason":"cannot read /tmp/soda-handoff-compose-44vyyU/handoff.json: ENOENT","closed":1}
{"ts":"2026-10-26T23:51:18.014Z","level":"info","msg":"agent resume skipped","paneId":"f6955d04-41a8-47fe-b21d-863510169abb","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:18.193Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:18.194Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:18.194Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:18.205Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-vRHg2d/commands.json","count":0}
{"ts":"2026-10-26T23:51:18.319Z","level":"info","msg":"agent resume skipped","paneId":"ef532f38-ea6e-48c3-9f41-3199193e907f","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:18.331Z","level":"info","msg":"agent resume skipped","paneId":"77adfb21-1845-40d1-87ff-5f43efc1c0b6","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:18.419Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:18.420Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:18.420Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:18.426Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-psock-RttFCo/commands.json","count":0}
{"ts":"2026-10-26T23:51:18.626Z","level":"info","msg":"agent resume skipped","paneId":"81369d7a-76c4-41f8-9072-456f3e16260a","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:18.931Z","level":"info","msg":"agent resume skipped","paneId":"01fdca0e-50f0-494c-9f26-40eb9c6be761","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:18.989Z","level":"info","msg":"ask opened","askId":"9f6d1b388ed08b5c7480f1a4d864583f","paneId":"105c62b8-4288-4d14-b586-4675cbeaed7c","questions":1,"media":0}
{"ts":"2026-10-26T23:51:19.015Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-26T23:51:19.019Z","level":"info","msg":"ask closed","askId":"9f6d1b388ed08b5c7480f1a4d864583f","paneId":"105c62b8-4288-4d14-b586-4675cbeaed7c","status":"cancelled"}
{"ts":"2026-10-26T23:51:19.033Z","level":"info","msg":"pane socket: refused a connection","code":"pane_socket_busy"}
{"ts":"2026-10-26T23:51:19.080Z","level":"info","msg":"handoff: replacing this server with the version on disk","id":"063b0325fbeac7ac","panes":1}
{"ts":"2026-10-26T23:51:19.085Z","level":"info","msg":"pane socket: refused a connection","code":"pane_socket_busy"}
{"ts":"2026-10-26T23:51:19.087Z","level":"error","msg":"handoff: execve failed; keeping the current server","error":"execve refused by the test"}
{"ts":"2026-10-26T23:51:19.105Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"105c62b8-4288-4d14-b586-4675cbeaed7c","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-26T23:51:19.321Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:19.323Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:19.323Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:19.336Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-sHg2kh/commands.json","count":1}
{"ts":"2026-10-26T23:51:20.133Z","level":"info","msg":"custom command run","commandId":"cat","type":"popup","clientId":"e16ae70e-fd21-427f-8027-eb7db924a665","paneId":"a403cc01-9eb3-4ad0-861b-e312c20275d1"}
{"ts":"2026-10-26T23:51:20.375Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:20.376Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:20.376Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:20.383Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-mnmwWM/commands.json","count":1}
{"ts":"2026-10-26T23:51:20.837Z","level":"info","msg":"custom command run","commandId":"quit","type":"popup","clientId":"4bfcdab9-7d4b-4037-a52a-f37eef70b5a3","paneId":"906b31ae-7cae-427f-86e3-d83f94a8dd00"}
{"ts":"2026-10-26T23:51:21.043Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:21.044Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:21.044Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:21.071Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-58iQW5/commands.json","count":1}
{"ts":"2026-10-26T23:51:21.600Z","level":"info","msg":"custom command run","commandId":"note","type":"shell","clientId":"d2f82501-c4ee-49e6-8d4e-d2f80851f47b","paneId":"fc3d30a2-11bb-46e6-8ce7-1c013490362c"}
{"ts":"2026-10-26T23:51:21.687Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:21.687Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:21.688Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:21.695Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-5ho5PB/commands.json","count":1}
{"ts":"2026-10-26T23:51:22.216Z","level":"info","msg":"custom command run","commandId":"cat","type":"popup","clientId":"25353759-f138-4ee4-8dd9-cd50832d96ae","paneId":"594b69d7-cbf4-4fe0-a76c-a87c7ac7cd92"}
{"ts":"2026-10-26T23:51:22.297Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:22.298Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:22.298Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:22.306Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-hIfhlN/sessions/work/commands.json","count":1}
{"ts":"2026-10-26T23:51:22.968Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:22.969Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:22.969Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:22.977Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-wIcddJ/commands.json","count":1}
{"ts":"2026-10-26T23:51:23.556Z","level":"warn","msg":"custom commands rejected","file":"/tmp/soda-compose-cmd-wIcddJ/commands.json","problem":"commands.json: commands[0]: 知らない項目です（env）"}
{"ts":"2026-10-26T23:51:23.827Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:23.829Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:23.830Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:23.856Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-QfCESD/commands.json","count":0}
 ❯ |@sodashitsu/server| src/launch/soda.pty.integration.test.ts (1 test | 1 skipped) 20ms
{"ts":"2026-10-26T23:51:24.648Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-26T23:51:24.648Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-26T23:51:24.652Z","level":"info","msg":"ask opened","askId":"6b856f62ab5cba99fdedab9c36eacce0","paneId":"3caa46aa-b2cf-413b-90c7-44f2950b0bb1","questions":1,"media":5}
{"ts":"2026-10-26T23:51:24.695Z","level":"info","msg":"ask closed","askId":"6b856f62ab5cba99fdedab9c36eacce0","paneId":"3caa46aa-b2cf-413b-90c7-44f2950b0bb1","status":"answered"}
{"ts":"2026-10-26T23:51:24.787Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:24.790Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:24.790Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:24.808Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-RWcZHT/commands.json","count":0}
{"ts":"2026-10-26T23:51:25.363Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-26T23:51:25.363Z","level":"info","msg":"ask remote image failed"}
{"ts":"2026-10-26T23:51:25.364Z","level":"info","msg":"ask opened","askId":"e955092393c3516521709cc12cf38d3f","paneId":"c5f6a186-e8a1-4978-9ad1-000aedd76098","questions":1,"media":0}
{"ts":"2026-10-26T23:51:25.388Z","level":"info","msg":"ask closed","askId":"e955092393c3516521709cc12cf38d3f","paneId":"c5f6a186-e8a1-4978-9ad1-000aedd76098","status":"cancelled"}
{"ts":"2026-10-26T23:51:25.459Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:25.462Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:25.463Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:25.481Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-UhMyzw/commands.json","count":0}
{"ts":"2026-10-26T23:51:26.154Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:26.156Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:26.156Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:26.167Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-KTruoE/commands.json","count":0}
{"ts":"2026-10-26T23:51:26.659Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:26.661Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:26.661Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:26.671Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-tui-it-SMIU96/state/commands.json","count":0}
{"ts":"2026-10-26T23:51:26.772Z","level":"info","msg":"ask opened","askId":"666f4b2a9196d392acd15cbf9be33864","paneId":"becdc447-8fec-4304-bf6c-2b1412574897","questions":1,"media":1}
{"ts":"2026-10-26T23:51:26.798Z","level":"info","msg":"ask closed","askId":"666f4b2a9196d392acd15cbf9be33864","paneId":"becdc447-8fec-4304-bf6c-2b1412574897","status":"cancelled"}
{"ts":"2026-10-26T23:51:26.832Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:26.833Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:26.833Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:26.842Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-tumiEC/commands.json","count":0}
{"ts":"2026-10-26T23:51:27.277Z","level":"info","msg":"pane socket: request","op":"ask.features","paneId":"11dddce0-36d5-46c9-a7e3-d46773f1b7b5","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-26T23:51:27.279Z","level":"info","msg":"pane socket: request","op":"ask.nope","paneId":"11dddce0-36d5-46c9-a7e3-d46773f1b7b5","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-26T23:51:28.044Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:28.047Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:28.047Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:28.053Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-hkDqq7/commands.json","count":0}
{"ts":"2026-10-26T23:51:28.105Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:28.107Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:28.107Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:28.115Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-bVrZmk/commands.json","count":0}
{"ts":"2026-10-26T23:51:28.842Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:28.843Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:28.843Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:28.850Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-yJA0hK/commands.json","count":0}
{"ts":"2026-10-26T23:51:28.898Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:28.899Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:28.899Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:28.907Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-yjg8xg/commands.json","count":0}
{"ts":"2026-10-26T23:51:29.328Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:29.329Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:29.329Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:29.335Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-mXuOy8/commands.json","count":0}
{"ts":"2026-10-26T23:51:29.402Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:29.403Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:29.403Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:29.410Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-aVmCVq/commands.json","count":0}
{"ts":"2026-10-26T23:51:29.865Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:29.868Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:29.868Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:29.905Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-vcjHoe/commands.json","count":0}
{"ts":"2026-10-26T23:51:30.178Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:9121d139-c22a-4f8d-bd7d-94426efd57b4"]}
{"ts":"2026-10-26T23:51:30.202Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:30.203Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:30.203Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:30.210Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-4DDnef/commands.json","count":0}
{"ts":"2026-10-26T23:51:30.959Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:30.961Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:30.961Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:30.971Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-Y7HhGC/commands.json","count":0}
{"ts":"2026-10-26T23:51:31.388Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:31.390Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:31.390Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:31.397Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-mig-state-Zoe7XL/commands.json","count":0}
{"ts":"2026-10-26T23:51:31.421Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:31.422Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:31.423Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:31.429Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-T84kNF/commands.json","count":0}
{"ts":"2026-10-26T23:51:31.888Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:31.888Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:31.889Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:31.894Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-5AyLsk/commands.json","count":0}
{"ts":"2026-10-26T23:51:32.328Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:32.328Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:32.329Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:32.349Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-9mhdYs/commands.json","count":0}
{"ts":"2026-10-26T23:51:32.535Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:32.536Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:32.536Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:32.542Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-mig-state-Zoe7XL/commands.json","count":0}
{"ts":"2026-10-26T23:51:32.750Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-26T23:51:32.866Z","level":"info","msg":"agent resume skipped","paneId":"8dae9539-9e14-4168-8da2-fc3089f98187","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:33.170Z","level":"info","msg":"agent resume skipped","paneId":"e8c703b0-9fcb-433a-870f-eeb4e4aaaf0f","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:33.242Z","level":"warn","msg":"handoff: preflight failed; keeping the current server","message":"held by the test"}
{"ts":"2026-10-26T23:51:33.476Z","level":"info","msg":"agent resume skipped","paneId":"db323d51-a93b-4fa3-9520-6cbd38213649","reason":"no-session-ref"}
{"ts":"2026-10-26T23:51:34.448Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:34.450Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:34.450Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:34.463Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-PjGkNy/commands.json","count":0}
{"ts":"2026-10-26T23:51:34.976Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:34.977Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:34.977Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:34.982Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-K5do3r/commands.json","count":0}
{"ts":"2026-10-26T23:51:35.422Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:35.423Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:35.423Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:35.430Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-L0dfXE/commands.json","count":0}
{"ts":"2026-10-26T23:51:35.672Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:35.674Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:35.674Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:35.683Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-hooksource-J7reGq/state/commands.json","count":0}
{"ts":"2026-10-26T23:51:35.814Z","level":"warn","msg":"bridge: closing a connection after a protocol violation","reason":"channel 1 is already open"}
{"ts":"2026-10-26T23:51:35.817Z","level":"warn","msg":"bridge: closing a connection after a protocol violation","reason":"BridgeProtocolError: unexpected frame type 66"}
{"ts":"2026-10-26T23:51:36.123Z","level":"info","msg":"agent session attached","paneId":"075ff828-041b-4447-aab2-81f4f76901e5","kind":"claude","session":"11111111","source":"hook"}
{"ts":"2026-10-26T23:51:36.159Z","level":"info","msg":"agent session attached","paneId":"075ff828-041b-4447-aab2-81f4f76901e5","kind":"claude","session":"22222222","source":"hook"}
{"ts":"2026-10-26T23:51:36.231Z","level":"info","msg":"agent session attached","paneId":"075ff828-041b-4447-aab2-81f4f76901e5","kind":"claude","session":"33333333","source":"hook"}
{"ts":"2026-10-26T23:51:36.332Z","level":"info","msg":"agent session attached","paneId":"075ff828-041b-4447-aab2-81f4f76901e5","kind":"claude","session":"33333333","source":"hook"}
{"ts":"2026-10-26T23:51:36.694Z","level":"info","msg":"agent session attached","paneId":"075ff828-041b-4447-aab2-81f4f76901e5","kind":"claude","session":"aaaaaaaa","source":"hook"}
{"ts":"2026-10-26T23:51:36.746Z","level":"info","msg":"agent session attached","paneId":"075ff828-041b-4447-aab2-81f4f76901e5","kind":"claude","session":"bbbbbbbb","source":"hook"}
{"ts":"2026-10-26T23:51:36.795Z","level":"info","msg":"agent session attached","paneId":"075ff828-041b-4447-aab2-81f4f76901e5","kind":"claude","session":"cccccccc","source":"hook"}
{"ts":"2026-10-26T23:51:37.356Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:37.357Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:37.358Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:37.364Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-QEUAsw/commands.json","count":0}
{"ts":"2026-10-26T23:51:37.464Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:37.465Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:37.465Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:37.469Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-QEUAsw/commands.json","count":0}
{"ts":"2026-10-26T23:51:37.915Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:37.916Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:37.917Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:37.922Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-UoS4v4/commands.json","count":0}
{"ts":"2026-10-26T23:51:37.953Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:37.954Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:37.955Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:37.960Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-j4Ikjf/commands.json","count":0}
{"ts":"2026-10-26T23:51:38.445Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:38.446Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:38.446Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:38.453Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-OOZQRp/commands.json","count":0}
{"ts":"2026-10-26T23:51:38.489Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T23:51:38.490Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T23:51:38.490Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T23:51:38.496Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-OOZQRp/commands.json","count":0}
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
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=3e4e2d9891da20a8bb232781235ea652": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=82f459cdae0dfd63fb2c3b1bccabfdce": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=35ac11889e42c245919e39e8f76eb127": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=afd6c1bfe6ff7aa94eedb77be65d7f52": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=3aae6aa785ecca38d24f36460c1a4b14": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=10c54dd2382dedc5599edf99ccb7d18e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=ee4a8f3e7d858a2aba6912d2081f689e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=82d993438f90a9274d1d22708aad444b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=2e99c29bfe60e39deeb08cee187f92e2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=e1b9575a02ec7ff50f78d581cd2e79f4": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=6357485e3f2702a7bbc25f10456862d0": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f34957353c811d7c50388cff132fe6c8": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=03bd581d446af231012c7e703b431042": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=57e6633778f506593c6e072725501795": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=18067033237cc47e1231d3b30f297744": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=702123f4393a2ff43e9151de6d308365": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
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
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=55b32dd6ec435f660f537cdaccbb4c8a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=2b39c3e3be5ff1bfbea49f800db90aef": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=cab430f2221ad2abe75763ace35e0e81": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=9603284226310d76432cd65c754132fd": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=32f51c37790307b3ff2e30f6e375c23b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=815e1f80ad898a49c20d52928b5bb3e1": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=79bf0cbcf298de11070a9d6ee54d7a46": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=c3e54d4be105be578b1e0c6e887b4dfc": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=f2545cd1187dd1a13f3c18a9b7e1ba01": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ec02647ed9302e35d8e0dbad26b6837e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=280d9515fd36c7075abe968e645d9257": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=00268babd98480151bdbad95bd65f378": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=b6e6808b128de5a05ac03b74b6061a20": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=14f194a67ff61cc89461a3bd0c14c25e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
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
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=4fb2cd83e5e9793055669ddefb9d7c4a": connect ECONNREFUSED 127.0.0.1:3000
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at Socket.socketErrorListener (node:_http_client:593:5)
    at Socket.emit (node:events:509:28)
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at processTicksAndRejections (node:internal/process/task_queues:90:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a8f194d6a4fa8fa11aa06c259b689d51": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ff5be09834410f503ab29b0b81c5817d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=b353e6651dc98de70a53e9d60a13b593": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=2ca80ec44b560889dd21e91309e25bd2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
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
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=3dee3650512589f5e4a783174a262b00": connect ECONNREFUSED 127.0.0.1:3000
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at Socket.socketErrorListener (node:_http_client:593:5)
    at Socket.emit (node:events:509:28)
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at processTicksAndRejections (node:internal/process/task_queues:90:21)
[graph-perf] {"case":"web-subagent-churn","env":"happy-dom","subagents":60,"generations":20,"totalMs":44,"limitMs":10000}
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=bd95adf2e01d536a71cd0852528080f3": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=8af5ee2cea118d35e7db877d5a26c362": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=18b80bf6da834fa54f893f49de72a0cd": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=f648b415db94457b76e9c876d88cd6fa": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=47d5aafc48489f9fc060bba95d79c539": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=d361971edd313302de6d1361c2cb3089": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=63321e36f09b6e564d1dc796e4952fb4": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=207f823f379995387e88f008de65e4e5": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=0bae43eaf4e7f9919ca21124b97b545d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=7a47f47a2d2b02c0530893ccbbe4fe78": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=4ad437f5eae0ed01efa13299fc5c5478": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=15d82e938f4d8ca8d528265ef93d0f83": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=e6676c8d457e4d1fec06cdcd8dce227d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=96e42fa5e78d75bd54b04ea06f6fa2b3": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=38d88d02cbb15a120e82ce1b53143fda": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=58790ee756207cd4fea58b8b1f62c343": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=7b98d085b6de6889f3e4bc2e4524611c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=d3fed549bbaea1685bb3733e6470a5c3": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=42dc558d70cff1dc16bbdca9e44099b4": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=6008338274eda43ff21e27f0c5dac93a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=e7d58c94ec4a3e4da0ec649b41454e77": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=0588d42f1008054a1146beb06ea997ee": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=5832b5f3bf13de5e65547b5710d857cf": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=65630d3c3a472f2d7e337cc8cee662d1": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=62d93e0c8013c235cbfbd5c6fef8df8a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=060a3832aeb1f4bda29b78f73ad0a281": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=7e847025bbae99dc731459e052f334d1": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=963bc4225aabd7ae1af8503423e4df20": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
[graph-perf] {"case":"web-render","env":"happy-dom","panes":16,"links":32,"openMs":223,"rerenderMs":43,"limitMs":10000}
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=c74024dbcda243e8db230203b989b3c1": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=2a95bb3e6b1e0cd7dc67512d180b00b0": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=1374ec8779a27a13ddf6fcb86eb2307a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=aee8701b9043fd79bb0653022b1c03aa": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=df18f9bfdcb45e6e3e4c0936311942b9": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=d2cf1a3276379b25478063101e2ea252": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=c35c27701d678b8434cb919007668b70": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=5ead989a89898f5f56a2921ba3089040": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
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
    at HTMLScriptElement.#loadScript (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-script-element/HTMLScriptElement.js:549:31)
    at HTMLScriptElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-script-element/HTMLScriptElement.js:315:33)
    at HTMLScriptElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at insertChildren (eval at boot (/workspaces/sodashitsu-desktop-shared-datagrams/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:349:11)
    at inject (eval at boot (/workspaces/sodashitsu-desktop-shared-datagrams/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:371:21)
    at onRender (eval at boot (/workspaces/sodashitsu-desktop-shared-datagrams/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:491:7)
    at Object.onPort [as onmessage] (eval at boot (/workspaces/sodashitsu-desktop-shared-datagrams/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:507:7)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-shared-datagrams/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/html.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:556:48)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
    at insert (/workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:31:12)
    at mountElement (/workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5772:5)
    at processElement (/workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5688:7)
    at patch (/workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5554:11)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/html.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:556:48)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
    at insert (/workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:31:12)
    at mountElement (/workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5772:5)
    at processElement (/workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5688:7)
    at patch (/workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5554:11)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-shared-datagrams/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-shared-datagrams/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-shared-datagrams/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-shared-datagrams/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/launch/soda.pty.integration.test.ts > soda（引数なし）を本物の端末で（node-pty。dist が無ければ skip：先に pnpm build。Windows は対象外）
Error: dist is older than src (run pnpm build first): src/desktop/DesktopProvider.ts, src/desktop/DesktopRelay.ts
 ❯ src/launch/soda.pty.integration.test.ts:133:15
    131|       const stale = [...staleOutputs(SERVER_PKG), ...staleOutputs(TUI_…
    132|       if (stale.length > 0)
    133|         throw new Error(
       |               ^
    134|           `dist is older than src (run pnpm build first): ${stale.slic…
    135|         );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 773 passed (774)
      Tests  11602 passed | 1 skipped (11603)
   Start at  08:47:08
   Duration  394.72s (tests 79%, import 12%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 225 times · 75.14s total, 30% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-datagrams


 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  09:00:12
   Duration  7.75s (transform 52%, tests 38%, import 10%)

  Transform  |@sodashitsu/server| transforming modules took 3.94s · 52% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
