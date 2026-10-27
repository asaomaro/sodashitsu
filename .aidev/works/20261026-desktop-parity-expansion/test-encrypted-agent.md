# 暗号化したエージェント接続の検証

対象: PR #261。公開agent role、宛先鍵・共有画面scope・登録revisionに束縛した許可、Node CLI/session/MCP/model経路、Webの許可・取消UI。

生成した鍵・画像・helper入力だけで検証する。実デスクトップの取得・入力、実clipboard/音声デバイス、鍵の自動登録、保護サービスの更新は行っていない。モデル経路の検証は既存unit/mockで、外部モデルへの画像送信はしていない。

## 回帰と独立点検

- protocol/CLI/Webの新規13件、private backplane/agent lifecycleを含む関連検査が通過。
- 製品Root/B/browser/Nodeの結合6件: pixels/raw Ctrl+Space、正しいticketを消費しないscope拒否、revoke→retrust時の古い許可拒否、禁止lane/child拒否、NDJSON child、MCP child、発行待ちのEsc/手動操作/生control引取りの同期取消。Node→Rootの受信記録で平文capability/画像/入力methodを渡さないことを確認。
- 初回全体検査: source12039件/810files、既存dirty-root12101件/818filesがそれぞれ単一runで通過。後続のCore修正後に全体を再実行する。
- 最終browser群の初回は12件中11件通過、復号を20ms遅らせる既存drainケースが初回frame待ちで失敗。単独再現1回も同じ結果。変更前main86aa628aでは同じテスト1件が通過。
- 新しい能力通知が重なる起動時に8件の復号待ち制限へ達する回帰を修正。件数を32件にし、copy前検査・16MiB総量・4MiB/record・FIFO・失効検査を維持した。正当な12件burstを最初のdecrypt保留中に投入する回帰、33件目の拒否、件数より先に総byte上限へ達する拒否を検証。Core28件と修正後の製品drain1件が通過。
- 独立taskcheck/cross/delta reviewを実施。保留許可の取消/通常control引取り、期限の小数値、予約prefix、Node接続中のSIGTERM、初回listと明示grantのrate-limit競合などを修正し、指摘差分を再点検済み。Core追加差分も独立点検でmust/shouldなし。
- 独立check worktreeへ正確なsource差分を適用しfresh build/関連13件・起動smoke通過。Core追加差分後の再build/smokeを別途記録する。

## 負例

各修正だけを直接sourceへ戻し、意図したassert失敗を確認。E2Eを使う3変種は戻したserverをbuildしてから実行。finallyで元のbytesへ戻し、一致と正常build/関連検査を確認した。以下は生の出力。

```text

## pending-leave
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-encrypted-agent-check

 ❯ |@sodashitsu/web| src/components/RemoteDesktopAgent.test.ts (3 tests | 1 failed) 89ms
   × hides encrypted agent controls until authenticated feature proof and cancels a pending first grant on escape 56ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/RemoteDesktopAgent.test.ts > hides encrypted agent controls until authenticated feature proof and cancels a pending first grant on escape
AssertionError: expected [ { type: 'start', …(2) }, …(2) ] to deep equally contain { type: 'agent_endpoint_grant', …(1) }

- Expected:
{
  "enabled": false,
  "type": "agent_endpoint_grant",
}

+ Received:
[
  {
    "machineId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "options": {
      "adaptive": false,
      "deltas": true,
      "features": true,
      "fps": 10,
      "image": {
        "colorMode": "full",
        "showCursor": true,
      },
      "quality": 65,
      "width": 1280,
    },
    "type": "start",
  },
  {
    "enabled": true,
    "recipient": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "type": "agent_endpoint_grant",
  },
  {
    "type": "release",
  },
]

 ❯ src/components/RemoteDesktopAgent.test.ts:18:64


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  07:19:34
   Duration  1.48s (transform 68%, import 13%, environment 12%, tests 6%)


## fractional-expiry
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-encrypted-agent-check

 ❯ |@sodashitsu/protocol| src/desktopAgentEndpoint.test.ts (4 tests | 1 failed) 15ms
   × accepts finite fractional lease expiry from the monotonic-to-wall-clock conversion 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/desktopAgentEndpoint.test.ts > accepts finite fractional lease expiry from the monotonic-to-wall-clock conversion
AssertionError: expected [Function] to not throw an error but '[\n  {\n    "expected": "int",\n    "…' was thrown

- Expected:
undefined

+ Received:
"[
  {
    \"expected\": \"int\",
    \"format\": \"safeint\",
    \"code\": \"invalid_type\",
    \"path\": [
      \"expiresAt\"
    ],
    \"message\": \"Invalid input: expected int, received number\"
  }
]"

 ❯ src/desktopAgentEndpoint.test.ts:18:205


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  07:19:36
   Duration  295ms (transform 61%, import 31%, tests 7%, worker 1%)


## reserved-prefix
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-encrypted-agent-check

 ❯ |@sodashitsu/cli| src/desktopEndpointSession.test.ts (6 tests | 1 failed | 5 skipped) 32ms
   × rejects every reserved encrypted code version without entering plaintext Root RPC 31ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/desktopEndpointSession.test.ts > rejects every reserved encrypted code version without entering plaintext Root RPC
AssertionError: expected [Function] to throw error including 'Invalid encrypted' but got 'login failed: HTTP 500'

Expected: "Invalid encrypted"
Received: "login failed: HTTP 500"

 ❯ src/desktopEndpointSession.test.ts:31:220


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  07:19:37
   Duration  857ms (transform 73%, import 22%, tests 4%)


## scope-before-consumption

Running 1 test using 1 worker

(node:2622451) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T22:19:44.400Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T22:19:44.400Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T22:19:44.400Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T22:19:44.405Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-IoUx5j/commands.json","count":0}
{"ts":"2026-10-27T22:19:44.849Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T22:19:44.850Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T22:19:44.850Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T22:19:44.851Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-IJNqaW/commands.json","count":0}
{"ts":"2026-10-27T22:19:47.798Z","level":"info","msg":"machine link closed","machine":"057abd6e3a7cf9cadd4203d456791f3d","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-encrypted-agent.spec.ts:48:1 › encrypted recipient observes product pixels, forwards raw Ctrl+Space, drains release and cannot revive after retrust (4.2s)


  1) src/specs/remote-desktop-encrypted-agent.spec.ts:48:1 › encrypted recipient observes product pixels, forwards raw Ctrl+Space, drains release and cannot revive after retrust 

    Error: expect(received).rejects.toThrow()

    Received promise resolved instead of rejected
    Resolved to value: {"abort": {}, "authenticated": true, "closed": false, "expiresAt": 1793139707693.9158, "expiresMono": 124140.31731548437, "finish": [Function anonymous], "finished": Promise {}, "initial": false, "lease": "5C1tStfG1sMnfk-zPeIMiV6HdoUlFiCcjX9RNDGuKqg", "nextId": 1, "pending": undefined, "permit": {"active": [Function active], "identity": [DesktopEndpointIdentity]}, "ready": Promise {}, "readyReject": [Function anonymous], "readyResolve": [Function anonymous], "releaseSeen": false, "signal": {Symbol(kEvents): [Map], Symbol(events.maxEventTargetListeners): 0, Symbol(events.maxEventTargetListenersWarned): false, Symbol(kHandlers): [Map], Symbol(kAborted): false, Symbol(kReason): undefined, Symbol(kComposite): false}, "socket": {"_autoPong": true, "_binaryType": "nodebuffer", "_bufferedAmount": 0, "_closeCode": 1006, "_closeFrameReceived": false, "_closeFrameSent": false, "_closeMessage": [Buffer], "_closeTimeout": 30000, "_closeTimer": null, "_errorEmitted": false, "_events": [Object], "_eventsCount": 4, "_extensions": [Object], "_isServer": false, "_maxListeners": undefined, "_paused": false, "_protocol": "soda-desktop-e2e-v1", "_readyState": 1, "_receiver": [Receiver], "_redirects": 0, "_req": null, "_sender": [Sender], "_socket": [Socket], "_url": "ws://127.0.0.1:33957/desktop-e2e", Symbol(shapeMode): false, Symbol(kCapture): false}, "stopped": [Function stopped], "store": {"closed": false, "denied": [Set], "directory": "/tmp/soda-encrypted-agent-KxOh7f/identity/desktop-endpoint", "options": [Object], "pending": [Set], "platform": "linux", "policyRevision": 0, "protector": [Object], "queue": Promise {}, "revisions": [Map]}, "timer": {"_destroyed": false, "_idleNext": [TimersList], "_idlePrev": [TimersList], "_idleStart": 4204, "_idleTimeout": 119931.91577148438, "_onTimeout": [Function anonymous], "_repeat": null, "_timerArgs": undefined, Symbol(refed): false, Symbol(kHasPrimitive): false, Symbol(asyncId): 13647, Symbol(triggerId): 0, Symbol(kAsyncContextFrame): [Map]}, "wire": {"authenticatedAt": 4207.861555, "closed": false, "exchange": undefined, "flushing": false, "generation": 1, "incoming": Promise {}, "options": [Object], "peerHello": undefined, "pingAt": 4203.706812, "preparingRotation": false, "queue": [Array], "queuedBytes": 0, "ready": true, "received": [Map], "receiving": 0, "receivingBytes": 0, "rotateBytes": 805306368, "rotateRecords": 750000, "rotating": false, "rotationDeadline": undefined, "sealDone": Promise {}, "sent": [Map], "session": [DesktopEndpointSession], "started": true, "starting": Promise {}, "timer": [Timeout]}}

      50 |  try{
      51 |   await expect(f.open(formatDesktopAgentGrant({version:1,machineId:f.machine,origin:appServer.origin,provider:f.identity.fingerprint!,recipient:f.cli.fingerprint,scope:"s".repeat(43),ticket:"t".repeat(43),expiresAt:Date.now()+30000}))).rejects.toThrow();await expect(f.view.locator('[data-desktop-status]')).toHaveText("閲覧中");
    > 52 |   const code=await f.grant(),grant=parseDesktopAgentGrant(code);await expect(f.open(formatDesktopAgentGrant({...grant,scope:"w".repeat(43)}))).rejects.toThrow();const session=await f.open(code);await expect(f.view.locator('[data-desktop-status]')).toHaveText("エージェント操作中");await expect(f.code).toHaveCount(0);
         |                                                                                                                                                        ^
      53 |   const frame=await session.observe();expect(await f.canvas.evaluate(async(element,frame)=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(frame.imageBase64),c=>c.charCodeAt(0))],{type:frame.format})),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext("2d")!;ctx.drawImage(bitmap,0,0);bitmap.close();const visible=element as HTMLCanvasElement;return visible.width===frame.width&&visible.height===frame.height&&Array.from(ctx.getImageData(30,30,1,1).data).join()===Array.from(visible.getContext("2d")!.getImageData(30,30,1,1).data).join();},frame)).toBe(true);
      54 |   const inputs=[{kind:"key" as const,code:"ControlLeft",down:true},{kind:"key" as const,code:"Space",down:true},{kind:"key" as const,code:"Space",down:false},{kind:"key" as const,code:"ControlLeft",down:false}];expect((await session.act(frame.observationId,inputs)).acknowledged).toBe(4);expect((await readFile(f.record,"utf8")).trim().split("\n").map(line=>JSON.parse(line))).toEqual(inputs);
      55 |   expect(await session.release()).toEqual({released:true});expect(session.abort.signal.aborted).toBe(true);await expect(f.view.locator('[data-desktop-status]')).toHaveText("閲覧中");
        at /workspaces/sodashitsu-desktop-encrypted-agent-check/packages/e2e/src/specs/remote-desktop-encrypted-agent.spec.ts:52:152

    Error Context: test-results/remote-desktop-encrypted-a-0ddfa-cannot-revive-after-retrust/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-encrypted-a-0ddfa-cannot-revive-after-retrust/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-encrypted-a-0ddfa-cannot-revive-after-retrust/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-encrypted-agent.spec.ts:48:1 › encrypted recipient observes product pixels, forwards raw Ctrl+Space, drains release and cannot revive after retrust 
undefined
/workspaces/sodashitsu-desktop-encrypted-agent-check/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-encrypted-agent.spec.ts -g observes product pixels

## pending-grant-revision

Running 1 test using 1 worker

(node:2622834) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T22:19:52.431Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T22:19:52.431Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T22:19:52.432Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T22:19:52.436Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-Jm8TZK/commands.json","count":0}
{"ts":"2026-10-27T22:19:52.900Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T22:19:52.900Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T22:19:52.900Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T22:19:52.901Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-3KMt4z/commands.json","count":0}
{"ts":"2026-10-27T22:20:00.950Z","level":"info","msg":"machine link closed","machine":"7b3d124bc20425022bf7962c864829af","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-encrypted-agent.spec.ts:76:65 › leaving during a held first grant cancels it before credential completion: leave (9.5s)


  1) src/specs/remote-desktop-encrypted-agent.spec.ts:76:65 › leaving during a held first grant cancels it before credential completion: leave 

    Error: expect(locator).toHaveCount(expected) failed

    Locator:  locator('[data-remote-desktop]').getByLabel('エージェント接続コード')
    Expected: 0
    Received: 1
    Timeout:  5000ms

    Call log:
      - Expect "toHaveCount" locator('[data-remote-desktop]').getByLabel('エージェント接続コード') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').getByLabel('エージェント接続コード')
        14 × locator resolved to 1 element
           - unexpected value "1"


      85 |   else await page.evaluate(()=>{const endpoint=(window as unknown as{__generatedEndpoint:{send(value:string):void}}).__generatedEndpoint;endpoint.send(JSON.stringify({type:"control",enabled:true}));});
      86 |   await expect.poll(()=>cancelled).toBe(true);if(mode==="leave")expect(await f.view.evaluate(element=>element.contains(document.activeElement))).toBe(false);
    > 87 |   release();await expect.poll(()=>finished).toBe(true);const refresh=f.view.getByRole("button",{name:"候補を更新",exact:true});await refresh.click();await expect(refresh).toBeEnabled();await expect(f.code).toHaveCount(0);await expect(f.view.locator('[data-desktop-status]')).toHaveText(mode==="leave"?"閲覧中":"操作中");
         |                                                                                                                                                                                                          ^
      88 |  }finally{release();await Promise.allSettled(tasks);DesktopEndpointStore.prototype.endpoint=original;DesktopRelay.prototype.revokeEndpointAgent=revoke;await f.close();}
      89 | });
      90 | test("encrypted MCP child preserves image/tool responses and release",async({page,appServer})=>{
        at /workspaces/sodashitsu-desktop-encrypted-agent-check/packages/e2e/src/specs/remote-desktop-encrypted-agent.spec.ts:87:202

    Error Context: test-results/remote-desktop-encrypted-a-da32d-credential-completion-leave/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-encrypted-a-da32d-credential-completion-leave/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-encrypted-a-da32d-credential-completion-leave/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-encrypted-agent.spec.ts:76:65 › leaving during a held first grant cancels it before credential completion: leave 
undefined
/workspaces/sodashitsu-desktop-encrypted-agent-check/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-encrypted-agent.spec.ts -g completion: leave

## raw-takeover-revocation

Running 1 test using 1 worker

(node:2623345) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T22:20:05.822Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T22:20:05.823Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T22:20:05.823Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T22:20:05.829Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-H7HSeB/commands.json","count":0}
{"ts":"2026-10-27T22:20:06.417Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T22:20:06.418Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T22:20:06.418Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T22:20:06.420Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-tKrjep/commands.json","count":0}
{"ts":"2026-10-27T22:20:14.091Z","level":"info","msg":"machine link closed","machine":"16000da97d285602d8d028ac6f31a7c6","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-encrypted-agent.spec.ts:76:65 › leaving during a held first grant cancels it before credential completion: raw takeover (9.1s)


  1) src/specs/remote-desktop-encrypted-agent.spec.ts:76:65 › leaving during a held first grant cancels it before credential completion: raw takeover 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      84 |   else if(mode==="takeover")await f.view.getByRole("button",{name:"操作する",exact:true}).click();
      85 |   else await page.evaluate(()=>{const endpoint=(window as unknown as{__generatedEndpoint:{send(value:string):void}}).__generatedEndpoint;endpoint.send(JSON.stringify({type:"control",enabled:true}));});
    > 86 |   await expect.poll(()=>cancelled).toBe(true);if(mode==="leave")expect(await f.view.evaluate(element=>element.contains(document.activeElement))).toBe(false);
         |                                    ^
      87 |   release();await expect.poll(()=>finished).toBe(true);const refresh=f.view.getByRole("button",{name:"候補を更新",exact:true});await refresh.click();await expect(refresh).toBeEnabled();await expect(f.code).toHaveCount(0);await expect(f.view.locator('[data-desktop-status]')).toHaveText(mode==="leave"?"閲覧中":"操作中");
      88 |  }finally{release();await Promise.allSettled(tasks);DesktopEndpointStore.prototype.endpoint=original;DesktopRelay.prototype.revokeEndpointAgent=revoke;await f.close();}
      89 | });
        at /workspaces/sodashitsu-desktop-encrypted-agent-check/packages/e2e/src/specs/remote-desktop-encrypted-agent.spec.ts:86:36

    Error Context: test-results/remote-desktop-encrypted-a-6191a-ial-completion-raw-takeover/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-encrypted-a-6191a-ial-completion-raw-takeover/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-encrypted-a-6191a-ial-completion-raw-takeover/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-encrypted-agent.spec.ts:76:65 › leaving during a held first grant cancels it before credential completion: raw takeover 
undefined
/workspaces/sodashitsu-desktop-encrypted-agent-check/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-encrypted-agent.spec.ts -g completion: raw takeover

```

### 復号待ち件数を旧8件へ戻す負例

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-encrypted-agent-check

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (28 tests | 1 failed | 27 skipped) 60ms
   × accepts an authenticated startup burst while the first decrypt is stalled 59ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > accepts an authenticated startup burst while the first decrypt is stalled
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopEndpointWire.test.ts:162:28
    160|  try {
    161|   while(f.leftRaw.length)pending.push(f.right.receive(f.leftRaw.shift(…
    162|   expect(f.rightClose).not.toHaveBeenCalled();
       |                            ^
    163|  }finally{resume();await Promise.all(pending);}
    164|  expect(f.rightRecords.map(row=>new TextDecoder().decode(row.bytes))).…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 27 skipped (28)
   Start at  07:46:07
   Duration  374ms (transform 59%, tests 26%, import 12%, worker 3%)


```

元の32件のbytesを復元し、Core28件を再度通過。

## 最終結果

- Core修正後のsource build/typecheck PASS、全体12041件/810files PASS（単一run）。既存dirty-rootのbuild/typecheck PASS、全体12103件/818files PASS（単一run）。以前の12039/12101結果へ部分検査を足した集計ではない。
- Sourceは製品browser12件を単一runでPASS。Rootは同じ12件の初回で11件PASS、monitor窓のshared再接続直後にframe0で1件失敗した。全体検査終了後の単独再確認ではその1件がPASS（合計unique12、単一runの全件成功ではない）。この一度の再確認から原因や修正を断定しない。旧agent2、暗号browser backplane、new encrypted agent6、遅い復号時のdrain、暗号monitor窓、暗号受信drag準備を含む。
- 新Core28件PASS、旧8件の負例はassert失敗、bytes復元後も28件PASS。
- 独立checkでCore差分後のbuild/smokeを再度通過。/tmp/desktop-encrypted-agent-wire-independent-{build,smoke}.log。追加差分の独立review2件はmust/shouldなし。文書・負例記録も独立review通過。
- Code head d87209dbdabdc11f6bc92d6dafa1498a2303d562 のWindows生成Node identity CI40597404903/job122516703767 PASS、2026-10-27T22:48:39Z。
- PR/mainと両端反映は後続のreceiptへ記録する。7B signin常駐agent、他OSの未実装機能、署名driver/実機確認等を完了に数えない。
