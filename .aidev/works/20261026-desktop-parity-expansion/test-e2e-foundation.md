# Task10A 暗号状態機械の生成検証

まだ製品配信経路で有効化していない。task10全体は未完了。Node実WebCrypto24件とChrome/Node相互運用1件（9 lane両方向＋replay拒否）を検証。実画面/入力/音声は使わない。

各guardを外してAssertionErrorを確認し、正確なsource byte列へ復元した。lane/direction/nonce負例は同じplaintextのciphertext本体が異なることを検証し、AADやheaderだけの差で鍵分離を偽確認しない。

## pin

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 22ms
   × requires an independently pinned fingerprint even for a valid signature 20ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > requires an independently pinned fingerprint even for a valid signature
AssertionError: promise resolved "DesktopEndpointSession{ …(5) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ DesktopEndpointSession {
+   "crypto": Crypto {},
+   "generation": 1,
+   "localRole": "viewer",
+   "peerRole": "provider",
+   "salt": Uint8Array [
+     147,
+     213,
+     249,
+     230,
+     141,
+     79,
+     171,
+     231,
+     2,
+     226,
+     4,
+     196,
+     160,
+     27,
+     158,
+     87,
+     234,
+     111,
+     77,
+     28,
+     58,
+     174,
+     14,
+     176,
+     183,
+     240,
+     250,
+     5,
+     100,
+     37,
+     253,
+     118,
+   ],
  }

 ❯ src/desktop/DesktopE2e.test.ts:33:475


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:19
   Duration  166ms (transform 56%, tests 25%, import 16%, worker 3%)

```

## signature

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 18ms
   × binds both peers' nonce to the signature transcript 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > binds both peers' nonce to the signature transcript
AssertionError: promise resolved "DesktopEndpointSession{ …(5) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ DesktopEndpointSession {
+   "crypto": Crypto {},
+   "generation": 1,
+   "localRole": "viewer",
+   "peerRole": "provider",
+   "salt": Uint8Array [
+     229,
+     99,
+     191,
+     224,
+     99,
+     59,
+     193,
+     48,
+     102,
+     214,
+     171,
+     234,
+     87,
+     150,
+     103,
+     162,
+     14,
+     121,
+     172,
+     72,
+     140,
+     222,
+     113,
+     250,
+     219,
+     183,
+     169,
+     140,
+     196,
+     24,
+     215,
+     24,
+   ],
  }

 ❯ src/desktop/DesktopE2e.test.ts:37:334


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:20
   Duration  163ms (transform 57%, tests 23%, import 16%, worker 4%)

```

## lane-key

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 63ms
   × round trips all lanes with separate directions and opaque packets 62ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > round trips all lanes with separate directions and opaque packets
AssertionError: expected 2 to be 18 // Object.is equality

- Expected
+ Received

- 18
+ 2

 ❯ src/desktop/DesktopE2e.test.ts:14:563


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:21
   Duration  223ms (tests 44%, transform 43%, import 11%, worker 2%)

```

## direction-key

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 40ms
   × round trips all lanes with separate directions and opaque packets 39ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > round trips all lanes with separate directions and opaque packets
AssertionError: expected 9 to be 18 // Object.is equality

- Expected
+ Received

- 18
+ 9

 ❯ src/desktop/DesktopE2e.test.ts:14:563


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:22
   Duration  181ms (transform 43%, tests 40%, import 14%, worker 3%)

```

## nonce

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 24ms
   × snapshots mutable input and serializes concurrent sealing within one lane 23ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > snapshots mutable input and serializes concurrent sealing within one lane
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopE2e.test.ts:46:395


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:23
   Duration  166ms (transform 50%, tests 29%, import 18%, worker 3%)

```

## replay

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 24ms
   × rejects lane/direction confusion, duplicate delivery and concurrent replays 23ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > rejects lane/direction confusion, duplicate delivery and concurrent replays
AssertionError: promise resolved "Uint8Array[ 103, 101, 110, 101, …(-65) ]" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
- }
+ Uint8Array [
+   103,
+   101,
+   110,
+   101,
+   114,
+   97,
+   116,
+   101,
+   100,
+   32,
+   114,
+   101,
+   109,
+   111,
+   116,
+   101,
+   32,
+   100,
+   101,
+   115,
+   107,
+   116,
+   111,
+   112,
+   32,
+   112,
+   105,
+   120,
+   101,
+   108,
+   115,
+   32,
+   47,
+   32,
+   233,
+   159,
+   179,
+   229,
+   163,
+   176,
+   32,
+   47,
+   32,
+   105,
+   110,
+   112,
+   117,
+   116,
+ ]

 ❯ src/desktop/DesktopE2e.test.ts:21:415


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:24
   Duration  165ms (transform 51%, tests 30%, import 16%, worker 3%)

```

## ordering

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 28ms
   × preserves order for input/bulk/agent but accepts reordered authenticated UDP video 26ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > preserves order for input/bulk/agent but accepts reordered authenticated UDP video
AssertionError: promise resolved "Uint8Array[ 103, 101, 110, 101, …(-65) ]" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
- }
+ Uint8Array [
+   103,
+   101,
+   110,
+   101,
+   114,
+   97,
+   116,
+   101,
+   100,
+   32,
+   114,
+   101,
+   109,
+   111,
+   116,
+   101,
+   32,
+   100,
+   101,
+   115,
+   107,
+   116,
+   111,
+   112,
+   32,
+   112,
+   105,
+   120,
+   101,
+   108,
+   115,
+   32,
+   47,
+   32,
+   233,
+   159,
+   179,
+   229,
+   163,
+   176,
+   32,
+   47,
+   32,
+   105,
+   110,
+   112,
+   117,
+   116,
+ ]

 ❯ src/desktop/DesktopE2e.test.ts:24:204


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:25
   Duration  183ms (transform 51%, tests 29%, import 17%, worker 3%)

```

## admission

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 127ms
   × bounds receiving before payload access and reserves duplicate counters during blocked crypto 126ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > bounds receiving before payload access and reserves duplicate counters during blocked crypto
AssertionError: expected 'pending' to be 'rejected' // Object.is equality

Expected: "rejected"
Received: "pending"

 ❯ src/desktop/DesktopE2e.test.ts:59:197


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:26
   Duration  308ms (tests 56%, transform 37%, import 6%, worker 1%)

```

## inflight

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 135ms
   × bounds receiving before payload access and reserves duplicate counters during blocked crypto 134ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > bounds receiving before payload access and reserves duplicate counters during blocked crypto
AssertionError: expected 'pending' to be 'rejected' // Object.is equality

Expected: "rejected"
Received: "pending"

 ❯ src/desktop/DesktopE2e.test.ts:57:262


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:27
   Duration  300ms (tests 63%, transform 29%, import 6%, worker 1%)

```

## close

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 26ms
   × zeros a completed decrypt whose publication races session close 24ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > zeros a completed decrypt whose publication races session close
AssertionError: promise resolved "Uint8Array[ 103, 101, 110, 101, …(-65) ]" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
- }
+ Uint8Array [
+   103,
+   101,
+   110,
+   101,
+   114,
+   97,
+   116,
+   101,
+   100,
+   32,
+   114,
+   101,
+   109,
+   111,
+   116,
+   101,
+   32,
+   100,
+   101,
+   115,
+   107,
+   116,
+   111,
+   112,
+   32,
+   112,
+   105,
+   120,
+   101,
+   108,
+   115,
+   32,
+   47,
+   32,
+   233,
+   159,
+   179,
+   229,
+   163,
+   176,
+   32,
+   47,
+   32,
+   105,
+   110,
+   112,
+   117,
+   116,
+ ]

 ❯ src/desktop/DesktopE2e.test.ts:82:107


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:28
   Duration  195ms (transform 52%, tests 28%, import 16%, worker 3%)

```

## proof-cancel

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e

 ❯ |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts (24 tests | 1 failed | 23 skipped) 17ms
   × does not publish a delayed proof after handshake cancellation 16ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopE2e.test.ts > does not publish a delayed proof after handshake cancellation
AssertionError: promise resolved "'3988c2c141a201db566d5e4e9511da9bc6c0e…'" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
"3988c2c141a201db566d5e4e9511da9bc6c0ef46329828794ef1460e6456b1fd7ffe22d5a411a4ffee3429fecfdac07f7ce5d88aab931bd4009ad5ec5806c0b4"

 ❯ src/desktop/DesktopE2e.test.ts:77:76


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  12:31:28
   Duration  179ms (transform 66%, tests 18%, import 13%, worker 3%)

```
