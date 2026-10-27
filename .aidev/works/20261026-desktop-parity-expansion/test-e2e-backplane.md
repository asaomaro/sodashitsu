# Private endpoint backplane verification

Node generated15cases passed, including private authentication/origin/WeakSet/epoch, legacy rejection, local input OFF despite helper true, delayed provider start after revoke, root/callback cleanup, common source survival and cross-root child tickets. Initial cross-root test parent protocol error was corrected before this pass; both reviewers re-reviewed the fix. Related existing relay/provider tests148passed before final extra tests. Build/typecheck passed before negative controls; final fresh build/full/typecheck/browser/independent smoke follow below.

Browser generated1case passed: actual synthetic-helper Provider→private loopback backplane→actual cryptographic wire→opaque WebSocket relay→real browser PNG canvas, input ACK for ControlLeft/Space down/up, repeated generation/rekey and root revocation. This does not enable or test the product public route/viewer.

Negative controls each remove only the named defense, then execute its targeted runtime assertion. Source bytes restored exactly in finally; no generated mutation remains. Raw output follows, unnormalized.

## registered-scope

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 29ms
   × rejects legacy and forged endpoint starts before opening a provider socket 28ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > rejects legacy and forged endpoint starts before opening a provider socket
AssertionError: expected [Function] to throw error including 'Authenticated' but got '共有用の接続を開始できませんでした'

Expected: "Authenticated"
Received: "共有用の接続を開始できませんでした"

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:30:118
     28|  const f=await fixture(),params={url:"ws://127.0.0.1:9/desktop-share",…
     29|  await expect(f.provider.start("legacy",params)).rejects.toThrow("Auth…
     30|  await expect(f.provider.start("forged",params,{origin:"http://127.0.0…
       |                                                                                                                      ^
     31| });
     32| it("runs the generated helper and raw input through the private permis…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:00:07
   Duration  919ms (transform 75%, import 21%, tests 3%)


```

## required

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 25ms
   × rejects legacy and forged endpoint starts before opening a provider socket 24ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > rejects legacy and forged endpoint starts before opening a provider socket
AssertionError: expected [Function] to throw error including 'Authenticated' but got 'Bで許可されていない共有先です'

Expected: "Authenticated"
Received: "Bで許可されていない共有先です"

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:29:49
     27| it("rejects legacy and forged endpoint starts before opening a provide…
     28|  const f=await fixture(),params={url:"ws://127.0.0.1:9/desktop-share",…
     29|  await expect(f.provider.start("legacy",params)).rejects.toThrow("Auth…
       |                                                 ^
     30|  await expect(f.provider.start("forged",params,{origin:"http://127.0.0…
     31| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:00:09
   Duration  912ms (transform 77%, import 20%, tests 3%)


```

## epoch

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 34ms
   × does not revive an old root after provider configure or handoff rollback 33ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > does not revive an old root after provider configure or handoff rollback
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:48:202


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:00:10
   Duration  990ms (transform 75%, import 21%, tests 4%)


```

## target

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 22ms
   × binds the public target before rewriting it to a private machine route 21ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > binds the public target before rewriting it to a private machine route
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopEndpointBackplane.test.ts:41:114


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:00:12
   Duration  930ms (transform 76%, import 21%, tests 3%)


```

## cookie

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 45ms
   × requires both the private cookie and the exact local origin for viewer upgrade 30ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > requires both the private cookie and the exact local origin for viewer upgrade
AssertionError: expected 'unexpected upgrade' to contain '401'

Expected: "401"
Received: "unexpected upgrade"

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:75:69
     73|   return new Promise<string>(resolve=>{ws.on("error",error=>resolve(er…
     74|  }
     75|  expect(await denied(origin,"SodaDesktopEndpoint="+"a".repeat(64))).to…
       |                                                                     ^
     76|  expect(await denied("https://attacker.invalid","SodaDesktopEndpoint="…
     77| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:00:14
   Duration  1.03s (transform 75%, import 20%, tests 5%)


```

## origin

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 24ms
   × requires both the private cookie and the exact local origin for viewer upgrade 23ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > requires both the private cookie and the exact local origin for viewer upgrade
AssertionError: expected 'Unexpected server response: 401' to contain '403'

Expected: "403"
Received: "Unexpected server response: 401"

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:76:89
     74|  }
     75|  expect(await denied(origin,"SodaDesktopEndpoint="+"a".repeat(64))).to…
     76|  expect(await denied("https://attacker.invalid","SodaDesktopEndpoint="…
       |                                                                                         ^
     77| });
     78| it("limits endpoint scopes to the exact registered loopback origin",as…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:00:15
   Duration  923ms (transform 76%, import 21%, tests 3%)


```

## cleanup

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 87ms
   × completes all socket cleanup even if revocation and close callbacks throw 86ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > completes all socket cleanup even if revocation and close callbacks throw
AssertionError: expected [Function] to not throw an error but 'Error: generated channel close failure' was thrown

- Expected:
undefined

+ Received:
"Error: generated channel close failure"

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:104:105


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
Error: generated close failure
 ❯ packages/server/src/desktop/DesktopEndpointBackplane.test.ts:102:52
 ❯ cleanup packages/server/src/desktop/DesktopEndpointBackplane.ts:14:31
 ❯ WebSocket.<anonymous> packages/server/src/desktop/DesktopEndpointBackplane.ts:117:71
 ❯ Object.onceWrapper node:events:631:26
 ❯ WebSocket.emit node:events:509:28
 ❯ WebSocket.emitClose node_modules/.pnpm/ws@8.21.3/node_modules/ws/lib/websocket.js:279:10
 ❯ Socket.socketOnClose node_modules/.pnpm/ws@8.21.3/node_modules/ws/lib/websocket.js:1360:15
 ❯ Socket.emit node:events:509:28
 ❯ TCP.<anonymous> node:net:350:12

This error originated in "packages/server/src/desktop/DesktopEndpointBackplane.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The last test to run before this error was "completes all socket cleanup even if revocation and close callbacks throw". This means either:
- the error was thrown while Vitest was running this test, or
- the error was thrown after the test completed, and this was the most recent test at that point.
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
     Errors  1 error
   Start at  15:00:17
   Duration  1.02s (transform 70%, import 21%, tests 9%)


```

## origin-port

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 40ms
   × limits endpoint scopes to the exact registered loopback origin 38ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > limits endpoint scopes to the exact registered loopback origin
AssertionError: expected [Function] to throw error including '共有先' but got '共有用の接続を開始できませんでした'

Expected: "共有先"
Received: "共有用の接続を開始できませんでした"

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:82:139


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:00:19
   Duration  989ms (transform 76%, import 19%, tests 5%)


```

## child-session

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-owner

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (15 tests | 1 failed | 14 skipped) 1103ms
   × rejects another root's image ticket without consuming the legitimate attachment 1101ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > rejects another root's image ticket without consuming the legitimate attachment
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:108:268


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopEndpointBackplane.test.ts:108:220

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:00:20
   Duration  1.98s (tests 59%, transform 31%, import 9%)


```

## Final verification

Frozen d21f8d05: final build/typecheck passed, full tests786files/11,735passed. Final browser3passed after all9negative controls and fresh build. Independent worktree build/smoke passed. Two independent reviews and fix re-reviews have no remaining findings. No production/public route, keys or devices activated.
