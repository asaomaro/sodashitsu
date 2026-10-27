# Endpoint ordered wire verification

Generated Node tests26 pass. Includes both roles/all9lanes, initial async race, mismatched local budgets, both rekey orders, in-flight old seal, epoch revocation after crypto, bounds, replay/tamper, liveness and no-poll expiry.

Two independent reviewers found the initial-start race and lower-budget rotation/deadline races. All were corrected with generated regressions; final re-review has no remaining findings. Browser transport fixture uses two real Chromium sockets, opaque WebSocket relay and Node endpoints; verifies DOM receipts for9lanes through3rounds, repeated generations, ciphertext opacity and isolated viewer revocation. This does not claim production desktop route integration.

Negative controls below modify only the named defense, execute the targeted regression, then restore the exact original bytes in finally. Full build follows all negative controls to refresh compiled artifacts. Saved raw log bytes are retained, including timing/line endings.

This PR also restores four Windows negative-log lines to their original CRLF bytes in the previous store record. Those raw logs intentionally trigger diff --check CR whitespace reports; product source must pass the check.

## startup

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 32ms
   × accepts a viewer hello while the provider's initial key generation is pending 31ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > accepts a viewer hello while the provider's initial key generation is pending
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopEndpointWire.test.ts:117:183


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
Error: Desktop encrypted connection is unavailable
 ❯ failure packages/client-core/src/desktop/DesktopEndpointWire.ts:27:19
 ❯ packages/client-core/src/desktop/DesktopEndpointWire.ts:106:45

This error originated in "packages/client-core/src/desktop/DesktopEndpointWire.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The last test to run before this error was "accepts a viewer hello while the provider's initial key generation is pending". This means either:
- the error was thrown while Vitest was running this test, or
- the error was thrown after the test completed, and this was the most recent test at that point.
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
     Errors  1 error
   Start at  14:36:12
   Duration  204ms (transform 58%, tests 28%, import 13%, worker 2%)


```

## request

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 5010ms
   × requests an authenticated rekey when the viewer's budget is lower than the provider's 5009ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > requests an authenticated rekey when the viewer's budget is lower than the provider's
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/desktop/DesktopEndpointWire.test.ts:120:1
    118|  resume();await f.rightStarting;await pending;await f.pump();expect(f.…
    119| });
    120| it("requests an authenticated rekey when the viewer's budget is lower …
       | ^
    121|  const f=await fixture({rotateRecords:2,providerRotateRecords:20});awa…
    122|  for(let n=0;n<6;n++){const pending=f.left.send("image",encode("image"…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:13
   Duration  5.19s (tests 98%, transform 1%)


```

## deadline

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 30ms
   × expires a local rekey wait even while old-key authenticated data keeps arriving 29ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > expires a local rekey wait even while old-key authenticated data keeps arriving
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/desktop/DesktopEndpointWire.test.ts:129:52
    127|  await f.right.send("video",encode("old frame"));await f.left.receive(…
    128|  f.advance(14000);await f.right.send("video",encode("old frame2"));awa…
    129|  f.advance(1000);f.left.poll();expect(f.leftClose).toHaveBeenCalledTim…
       |                                                    ^
    130| });
    131| it("keeps the original deadline when the provider's rotate arrives nea…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:19
   Duration  251ms (transform 56%, tests 27%, import 14%, worker 3%)


```

## encrypt-epoch

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 32ms
   × checks the owner again after an asynchronous encrypt completes 31ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > checks the owner again after an asynchronous encrypt completes
AssertionError: expected [ Uint8Array[ 83, 68, 69, 49, …(73) ] ] to deeply equal []

- Expected
+ Received

- []
+ [
+   Uint8Array [
+     83,
+     68,
+     69,
+     49,
+     1,
+     0,
+     0,
+     0,
+     0,
+     1,
+     0,
+     0,
+     0,
+     1,
+     175,
+     207,
+     91,
+     190,
+     233,
+     146,
+     41,
+     7,
+     60,
+     22,
+     178,
+     194,
+     255,
+     154,
+     248,
+     224,
+     235,
+     182,
+     100,
+     41,
+     176,
+     70,
+     242,
+     151,
+     163,
+     7,
+     157,
+     85,
+     66,
+     88,
+     174,
+     137,
+     214,
+     174,
+     167,
+     218,
+     152,
+     117,
+     110,
+     106,
+     5,
+     141,
+     60,
+     3,
+     77,
+     51,
+     195,
+     18,
+     52,
+     105,
+     229,
+     71,
+     109,
+     89,
+     24,
+     192,
+     25,
+     123,
+     254,
+   ],
+ ]

 ❯ src/desktop/DesktopEndpointWire.test.ts:78:154


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:20
   Duration  216ms (transform 52%, tests 30%, import 15%, worker 2%)


```

## decrypt-epoch

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 34ms
   × suppresses a completed decrypt when its source epoch changes 33ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > suppresses a completed decrypt when its source epoch changes
AssertionError: expected [ { lane: 'clipboard', …(1) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "bytes": Uint8Array [
+       112,
+       114,
+       105,
+       118,
+       97,
+       116,
+       101,
+       32,
+       99,
+       108,
+       105,
+       112,
+       98,
+       111,
+       97,
+       114,
+       100,
+     ],
+     "lane": "clipboard",
+   },
+ ]

 ❯ src/desktop/DesktopEndpointWire.test.ts:85:152


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:20
   Duration  195ms (transform 56%, tests 29%, import 13%, worker 2%)


```

## receive-budget

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 5020ms
   × bounds received ciphertext while a decrypt is stalled and clears queued plaintext on close 5018ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > bounds received ciphertext while a decrypt is stalled and clears queued plaintext on close
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/desktop/DesktopEndpointWire.test.ts:87:1


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:21
   Duration  5.21s (tests 99%, transform 1%)


```

## liveness

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 28ms
   × does not accept a raw hello as authenticated liveness 25ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > does not accept a raw hello as authenticated liveness
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/desktop/DesktopEndpointWire.test.ts:53:94
     51| });
     52| it("does not accept a raw hello as authenticated liveness",async()=>{
     53|  const f=await fixture();await f.pump();f.advance(60000);f.right.poll(…
       |                                                                                              ^
     54| });
     55| it("uses encrypted ping and pong without delivering them to the applic…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:27
   Duration  185ms (transform 57%, tests 26%, import 14%, worker 2%)


```

## send-budget

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 5009ms
   × bounds queued data before a peer authenticates 5008ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > bounds queued data before a peer authenticates
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/desktop/DesktopEndpointWire.test.ts:66:1


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:28
   Duration  5.18s (tests 98%, transform 1%)


```

## provider-deadline

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 66ms
   × keeps the original deadline when the provider's rotate arrives near its end 65ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > keeps the original deadline when the provider's rotate arrives near its end
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/desktop/DesktopEndpointWire.test.ts:135:154
    133|  await new Promise(resolve=>setTimeout(resolve,5));while(f.leftRaw.len…
    134|  await new Promise(resolve=>setTimeout(resolve,10));expect(JSON.parse(…
    135|  f.advance(14000);await f.left.receive(f.rightRaw.shift()!);expect(f.l…
       |                                                                                                                                                          ^
    136| });
    137| it("keeps a peer-initiated deadline when a delayed old seal reaches it…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:34
   Duration  218ms (tests 47%, transform 41%, import 11%, worker 2%)


```

## seal-deadline

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 63ms
   × keeps a peer-initiated deadline when a delayed old seal reaches its local limit 62ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > keeps a peer-initiated deadline when a delayed old seal reaches its local limit
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/desktop/DesktopEndpointWire.test.ts:144:52
    142|  const pending=f.left.send("control",encode("old input"));await begun;…
    143|  await f.left.receive(f.rightRaw.shift()!);const rotating=f.left.recei…
    144|  f.advance(1000);f.left.poll();expect(f.leftClose).toHaveBeenCalledTim…
       |                                                    ^
    145| });
    146| it("rejects a late asynchronous start even if the timer callback has n…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:36:35
   Duration  216ms (tests 46%, transform 39%, import 12%, worker 2%)


```

## no-poll

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-relay

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts (26 tests | 1 failed | 25 skipped) 32ms
   × rejects a late asynchronous start even if the timer callback has not run 30ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointWire.test.ts > rejects a late asynchronous start even if the timer callback has not run
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/desktop/DesktopEndpointWire.test.ts:150:126


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  14:37:01
   Duration  373ms (transform 71%, tests 15%, import 12%, worker 2%)


```
