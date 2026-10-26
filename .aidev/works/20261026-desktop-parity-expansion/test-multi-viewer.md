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

## Final validation (source aae8b64c)

build/typecheck成功。独立worktree aae8b64c のinstall/build/smoke PASS。全体773 suite/11,583 pass (339.05s)。browser17 pass/1 optional skip (1.8m): new shared2窓、既存通常/agent/input/native video/protected。全ソース固定中に実行し、途中編集なし。全体の重複実行なし。

### Full suite

```text
    at file:///workspaces/sodashitsu-desktop-multi-viewer/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-multi-viewer/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-multi-viewer/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-multi-viewer/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)

 Test Files  773 passed (773)
      Tests  11583 passed (11583)
   Start at  07:30:53
   Duration  339.05s (tests 83%, import 10%, environment 4%, transform 3%)

Environment  |@sodashitsu/web| happy-dom was created 225 times · 47.54s total, 28% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```
### Browser

```text
{"ts":"2026-10-26T22:32:37.096Z","level":"info","msg":"machine link closed","machine":"91a6014af1a8e1a67529e507c85f8b8c","kind":"transient","reason":"接続が切れました"}
  ✓  17 src/specs/remote-desktop-native-video.spec.ts:381:3 › native video legacy one-frame window under 100ms draw ACK delay (10.7s)
{"ts":"2026-10-26T22:32:37.225Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T22:32:37.226Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T22:32:37.226Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T22:32:37.236Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-WgP55d/commands.json","count":0}
{"ts":"2026-10-26T22:32:37.692Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T22:32:37.692Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T22:32:37.692Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T22:32:37.693Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-GeClPS/commands.json","count":0}
NATIVE_WINDOW_BENCH {"pipelined":true,"frames":79,"fps":25.04656091461646,"ackDelayMs":100,"source":"hardware-generated fixture; no actual desktop or physical network"}
{"ts":"2026-10-26T22:32:43.619Z","level":"info","msg":"machine link closed","machine":"eb1c2c13df4e49d0f2870a9d9d92bfcd","kind":"transient","reason":"接続が切れました"}
  ✓  18 src/specs/remote-desktop-native-video.spec.ts:381:3 › native video three-frame window under 100ms draw ACK delay (6.5s)

  1 skipped
  17 passed (1.8m)

```
### Independent smoke

```text
smoke: client.hello ok
smoke: workspace.create ok (pane 7e517b0c-39c8-4120-8b4b-f4af1c06de29)
smoke: pane.subscribe ok
smoke: echo round trip ok
{"ts":"2026-10-26T22:34:32.055Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"31eaf257-e4d2-4179-9184-82ea65fa0459","paneId":"7e517b0c-39c8-4120-8b4b-f4af1c06de29"}
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke(web): typed into pane 7e517b0c-39c8-4120-8b4b-f4af1c06de29
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS

```
