# 10B generated checks

Node23件、Windowsの生成DPAPI/ACL/drive種別/write-through replace、readonly actual user LocalAppData ACLを確認。実endpoint鍵・実ACL変更・画面/入力/音声は使わない。防御を外してruntime失敗を確認後、正確なbyte列へ復元。Windows出力は元のraw logを保持し、以下はUTF-8またはCP932から文字コードだけを変換（CRLF保持）。

## late-endpoint

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts (15 tests | 1 failed | 14 skipped) 88ms
   × rejects an endpoint restored after its trust was revoked 87ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts > rejects an endpoint restored after its trust was revoked
AssertionError: promise resolved "{ …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "04879e579a4af56b297b6fcba372f32035bae61c1af9ac30e8f6a11130d65f693f0844b87efc4e6c91d0db414d77d895601de3bd81b38c894c66590a61707ec64d",
+   },
  }

 ❯ src/desktop/DesktopEndpointStore.test.ts:48:114


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:22:58
   Duration  316ms (transform 46%, tests 31%, import 21%, worker 2%)

```

## read-parent

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts (15 tests | 1 failed | 14 skipped) 56ms
   × checks unsafe ancestors and state-directory aliases on every read 54ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts > checks unsafe ancestors and state-directory aliases on every read
AssertionError: promise resolved "{ initialized: true, …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "fingerprint": "2c2bb5a868be38fcf18ffe5d1bb92cfb78df57bf914a1f4e0498f3ac519f5dd7",
+   "initialized": true,
+   "peers": [
+     {
+       "fingerprint": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
+       "label": "Generated browser",
+       "role": "viewer",
+     },
+   ],
  }

 ❯ src/desktop/DesktopEndpointStore.test.ts:51:138


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:22:59
   Duration  278ms (transform 44%, import 34%, tests 19%, worker 2%)

```

## read-lock

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts (15 tests | 1 failed | 14 skipped) 77ms
   × does not expose a new pin to another store before directory sync completes 75ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts > does not expose a new pin to another store before directory sync completes
AssertionError: promise resolved "{ …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "0482eacc49db04409e545c530432f0f7dd05628b877cb78c27a5c16104e878d07f60ffc84793406917d3f7f62aaae01bab3443a0cb1b84be3556e5cd5c047931aa",
+   },
  }

 ❯ src/desktop/DesktopEndpointStore.test.ts:58:86


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:23:00
   Duration  338ms (transform 54%, tests 23%, import 21%, worker 2%)

```

## dir-sync

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts (15 tests | 1 failed | 14 skipped) 77ms
   × does not expose a new pin to another store before directory sync completes 76ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts > does not expose a new pin to another store before directory sync completes
AssertionError: promise resolved "{ …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "04520e47a935aa5df92818f9637b039c5eb6ae4fc241edd3e76e1b51f9df6b7419bcd5c6852452d9787184abcfbb85d6d8771a3cd9cad996ac1967e65820ee9427",
+   },
  }

 ❯ src/desktop/DesktopEndpointStore.test.ts:58:86


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:23:01
   Duration  287ms (transform 49%, tests 27%, import 22%, worker 2%)

```

## hook-persist

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts (15 tests | 1 failed | 14 skipped) 55ms
   × finishes durable pin removal even if the live-session hook throws 54ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts > finishes durable pin removal even if the live-session hook throws
AssertionError: promise resolved "{ …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "04bd6a8a05e44c3a2f6ea2876f77c7820d144e582fd4a127684e72e0d4829d3d0a3861fdeb51b0f23391474d56333d2f57b423b05ab81ecba88e93919e9abbe96b",
+   },
  }

 ❯ src/desktop/DesktopEndpointStore.test.ts:54:279


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:23:02
   Duration  273ms (transform 52%, import 24%, tests 21%, worker 2%)

```

## permit

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts (15 tests | 1 failed | 14 skipped) 149ms
   × never reactivates an issued permit after revoke, retrust or owner close 148ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts > never reactivates an issued permit after revoke, retrust or owner close
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopEndpointStore.test.ts:65:331


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:23:02
   Duration  404ms (transform 42%, tests 39%, import 17%, worker 2%)

```

## corruption

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts (15 tests | 1 failed | 14 skipped) 93ms
   × never replaces a corrupt identity or a key/public mismatch with a newly trusted key 90ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts > never replaces a corrupt identity or a key/public mismatch with a newly trusted key
AssertionError: promise resolved "{ fingerprint: 'b405f552553f121e4c46…' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "fingerprint": "b405f552553f121e4c461d9535ded7c600582e88701b08c136c6c2fb3683348c",
  }

 ❯ src/desktop/DesktopEndpointStore.test.ts:21:163


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:23:04
   Duration  303ms (transform 43%, tests 32%, import 23%, worker 2%)

```

## windows-fallback

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts (15 tests | 1 failed | 14 skipped) 9ms
   × uses the Windows protector for the entire vault and never falls back to owner-file mode 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointStore.test.ts > uses the Windows protector for the entire vault and never falls back to owner-file mode
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopEndpointStore.test.ts:42:119


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:23:04
   Duration  251ms (transform 65%, import 29%, tests 4%, worker 2%)

```

## system-exe

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointProtector.test.ts (8 tests | 1 failed | 7 skipped) 8ms
   × uses only the absolute system PowerShell and fixed cwd/module path for private bytes 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointProtector.test.ts > uses only the absolute system PowerShell and fixed cwd/module path for private bytes
AssertionError: expected 'powershell.exe' to be 'C:\Windows\System32\WindowsPowerShell…' // Object.is equality

Expected: "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
Received: "powershell.exe"

 ❯ src/desktop/DesktopEndpointProtector.test.ts:14:377


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:23:05
   Duration  261ms (transform 64%, import 31%, tests 3%, worker 2%)

```

## buffer-copy

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-trust

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointProtector.test.ts (8 tests | 1 failed | 7 skipped) 11ms
   × copies Buffer-backed input in owner-file mode before the caller clears it 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointProtector.test.ts > copies Buffer-backed input in owner-file mode before the caller clears it
AssertionError: expected Buffer[ 0, 0, 0 ] to deeply equal Uint8Array[ 1, 2, 3 ]

- Expected
+ Received

- Uint8Array [
-   1,
-   2,
-   3,
- ]
+ {
+   "data": [
+     0,
+     0,
+     0,
+   ],
+   "type": "Buffer",
+ }

 ❯ src/desktop/DesktopEndpointProtector.test.ts:23:199


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
   Start at  13:23:06
   Duration  211ms (transform 62%, import 30%, tests 5%, worker 2%)

```

## acl

```text
endpoint_key_generated_checks_passed
AssertionError: Generated world writer allowed
```

## drive

```text
endpoint_key_generated_checks_passed
AssertionError: Generated nonlocal drive accepted
```
