# 8C 検証記録

実browser2窓でローカルUDP candidate（getStats）をそれぞれ確認。生成hardware H264 fixtureのpixel、1 packet loss後のUDP維持/復帰、片方のpeer close後はその窓だけWSSで再開し他方のUDP/stream/encoderが継続すること、peer終了後の継続を観測した。初回1 pass /17.3s。実画面取得/OS入力/サービス変更なし。

独立review_pointer/review_transferは製品差分にmustなし。protocol/cap積、B ceiling、helper設定正規化、keyframe source ID変換・current consumer確認・100ms合計上限、A/B adaptive=false、別viewerの保持入力への非干渉を点検。任意推奨だった保持入力を、生成helperでControlLeft保持→非owner動画stop/restartの共通release teardown→owner入力継続で確認した。実UDP/WSS fallbackはbrowserで別に確認しており、保持キー回帰を実UDP実機試験と混同しない。

以下はguardだけを戻した実行時の生ログ。各回元bytesへ完全復元した。compile errorのnegativeではない。最終全体検証は追記する。

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

## Negative: old-protocol

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
