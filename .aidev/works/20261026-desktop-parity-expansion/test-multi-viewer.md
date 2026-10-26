# 複数viewer 8A 検証記録

通常画面の完全画像の共有取得のみ。task8全体は未完了。実画面取得・OS入力・保護サービス変更・driver導入は行わない。

実WebSocketのA/B+生成helperで125件の関連試験が通過。pool15件は生成stream/process、source ACKとsubscriber ACK分離、遅いviewerからの回復、上限8、排他、入力ACK routing/eviction、設定不一致拒否、late joinに過去画像を出さない、lock/終了、実helper終了待ちを検査。ブラウザ2画面はDOM/canvas・browser WS responseで観測し、片方停止後の継続と明示再取得、1 shared helper（最初の単独helperと合計2プロセス）を確認した。

独立点検: review_pointerは旧shared helper終了前にordinary起動できる点、64未ACK後の永久入力停止、control queue送信失敗時の不整合を指摘。終了待ち/2s拒否、古いACK route eviction+global seq非再利用、送信失敗でshared viewer停止を修正。自己点検で古いrelease ACKが新agent grantを取り消す点を検出し、有界control request queueで応答順を対応させた。通常単独のcontrol経路は従来の処理を維持する。

以下はguardだけを元に戻した実行時の生ログ。各試行後に元bytesを復元し、一致を確認した。compile errorでの失敗ではない。全体検証は後で追記する。

## Negative: retiring

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-multi-viewer

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (15 tests | 1 failed | 14 skipped) 71ms
   × waits for the real retiring shared helper before accepting a new ordinary source 70ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > waits for the real retiring shared helper before accepting a new ordinary source
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopSharedCapture.test.ts:199:25
    197|   try {
    198|     await new Promise(resolve => setTimeout(resolve, 50));
    199|     expect(connections).toBe(0);
       |                         ^
    200|     expect(pool.retiring).toBe(child);
    201|     child.close();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  07:23:50
   Duration  834ms (transform 71%, import 20%, tests 9%)


```

## Negative: ack-budget

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-multi-viewer

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (15 tests | 1 failed | 14 skipped) 13ms
   × continues input after 64 missing ACKs and does not route an evicted ACK to another viewer 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > continues input after 64 missing ACKs and does not route an evicted ACK to another viewer
AssertionError: expected [ { type: 'input', seq: 1 }, …(63) ] to have a length of 65 but got 64

- Expected
+ Received

- 65
+ 64

 ❯ src/desktop/DesktopSharedCapture.test.ts:166:60
    164|   expect(a.session.requestControl!(true)).toBe(true);
    165|   for (let seq = 1; seq <= 65; seq++) a.send({ type: "input", seq });
    166|   expect(f.child.commands.filter(m => m.type === "input")).toHaveLengt…
       |                                                            ^
    167|   f.child.send({ type: "input_ack", seq: 1 });
    168|   f.child.send({ type: "input_ack", seq: 65 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  07:23:51
   Duration  722ms (transform 75%, import 23%, tests 2%)


```

## Negative: exclusive

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-multi-viewer

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (15 tests | 1 failed | 14 skipped) 11ms
   × keeps control exclusive and maps input ACKs to the issuing viewer across handover 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > keeps control exclusive and maps input ACKs to the issuing viewer across handover
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSharedCapture.test.ts:81:43
     79|   expect(a.session.requestControl!(true)).toBe(true);
     80|   a.send({ type: "control", enabled: true });
     81|   expect(b.session.requestControl!(true)).toBe(false);
       |                                           ^
     82|   b.send({ type: "control", enabled: false });
     83|   b.send({ type: "input", seq: 1, input: { kind: "key", code: "KeyB", …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  07:23:53
   Duration  642ms (transform 73%, import 24%, tests 2%, worker 1%)


```

## Negative: image-check

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-multi-viewer

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (15 tests | 1 failed | 14 skipped) 1012ms
   × rejects malformed image bytes before acknowledging a source even if every viewer is already waiting 1011ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > rejects malformed image bytes before acknowledging a source even if every viewer is already waiting
AssertionError: expected null to be +0 // Object.is equality

- Expected:
0

+ Received:
null

 ❯ src/desktop/DesktopSharedCapture.test.ts:156:50
    154|  await vi.waitFor(()=>expect(a.messages).toHaveLength(2));
    155|  f.child.send({...frame(2),data:"AA=="});
    156|  await vi.waitFor(()=>expect(a.session.exitCode).toBe(0));
       |                                                  ^
    157|  expect(f.child.commands.filter(m=>m.type==="ack").map(m=>m.seq)).toEq…
    158| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  07:23:54
   Duration  1.70s (tests 62%, transform 29%, import 9%)


```

## Negative: backpressure

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-multi-viewer

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (15 tests | 1 failed | 14 skipped) 13ms
   × captures once and lets a fast viewer continue while another waits for its own ACK 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > captures once and lets a fast viewer continue while another waits for its own ACK
AssertionError: expected [ 1, 2 ] to deeply equal [ 1 ]

- Expected
+ Received

  [
    1,
+   2,
  ]

 ❯ src/desktop/DesktopSharedCapture.test.ts:47:63
     45|   f.child.send(frame(2));
     46|   await vi.waitFor(() => expect(fast.messages).toHaveLength(3));
     47|   expect(slow.messages.map(m => m.info?.seq).filter(Boolean)).toEqual(…
       |                                                               ^
     48|   expect(fast.messages.map(m => m.info?.seq).filter(Boolean)).toEqual(…
     49|   expect(f.spawn).toHaveBeenCalledTimes(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  07:23:56
   Duration  723ms (transform 76%, import 22%, tests 2%)


```

## Negative: relay-control

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-multi-viewer

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (108 tests | 1 failed | 107 skipped) 1388ms
   × shares one capture across viewers with independent backpressure and exclusive input 1386ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > shares one capture across viewers with independent backpressure and exclusive input
AssertionError: expected { type: 'ready', …(10) } to match object { type: 'control', enabled: false }
(10 matching properties omitted from actual)

- Expected
+ Received

  {
-   "enabled": false,
-   "type": "control",
+   "type": "ready",
  }

 ❯ src/desktop/DesktopRelay.test.ts:897:93
    895|  expect((await readFile(f.lifecycle,"utf8")).trim().split("\n").map(li…
    896|  fast.send({type:"control",enabled:true});await vi.waitFor(()=>expect(…
    897|  slow.send({type:"control",enabled:true});await vi.waitFor(()=>expect(…
       |                                                                                             ^
    898|  slow.send({type:"input",seq:1,frameSeq:decodeDesktopFrame(slow.frames…
    899|  fast.send({type:"input",seq:1,frameSeq:decodeDesktopFrame(fast.frames…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 107 skipped (108)
   Start at  07:24:35
   Duration  2.21s (tests 65%, transform 27%, import 7%)


```

## Negative: grant-order

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-multi-viewer

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (109 tests | 1 failed | 108 skipped) 1181ms
   × keeps a new shared agent grant when the prior release ACK arrives after attach 1180ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps a new shared agent grant when the prior release ACK arrives after attach
AssertionError: expected [ { type: 'control', …(1) }, …(2) ] to have a length of 2 but got 3

- Expected
+ Received

- 2
+ 3

 ❯ src/desktop/DesktopRelay.test.ts:955:78
    953|   await vi.waitFor(()=>expect(responses).toHaveLength(2));
    954|   spy.mockRestore();for(const response of responses)send(response);
    955|   await vi.waitFor(()=>expect(viewer.messages.filter(m=>m.type==="cont…
       |                                                                              ^
    956|   expect(viewer.messages.filter(m=>m.type==="agent_state").at(-1)).toM…
    957|   expect(f.relay.agents.observe("shared-agent",attached.leaseId)).toMa…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 108 skipped (109)
   Start at  07:27:23
   Duration  1.98s (tests 62%, transform 30%, import 8%)


```

## Negative: control-send

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-multi-viewer

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (110 tests | 1 failed | 109 skipped) 1256ms
   × ends a shared generation if an agent control request cannot be sent 1252ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > ends a shared generation if an agent control request cannot be sent
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopRelay.test.ts:971:53
    969|  try{
    970|   viewer.send({type:"agent_grant",enabled:true});
    971|   await vi.waitFor(()=>expect(viewer.ws.readyState).toBe(WebSocket.CLO…
       |                                                     ^
    972|   expect(relay.viewers.size).toBe(0);expect(v.controlRequests).toBeUnd…
    973|  }finally{spy.mockRestore();}

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 109 skipped (110)
   Start at  07:28:48
   Duration  3.21s (tests 42%, transform 41%, import 17%, worker 1%)


```
