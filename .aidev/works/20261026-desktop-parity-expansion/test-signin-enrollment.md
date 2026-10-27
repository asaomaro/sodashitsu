# 7B2a 登録情報と最小RPC境界の検証

Base maina2f1ff867810c1cf3a1c87de88e1a4f1ab789244、code9879c1f723c3b6cdb91d27e323ba88338aea1396。class/parserは専用serviceへまだ接続せず、DPAPI/ACL/実owner account type/peer trust/active signin scopeを成立させるものではない。

- Frozen install/source build/typecheck PASS、新unit7件PASS。初回はfixtureのclient kindをcliとした1件が失敗。既存ClientHelloParamsのexternalへfixtureを訂正し、製品guardは緩和していない。
- 固定owner/Root/machine/role、未許可method/unknown fields、input既定off、UTF-8/16KiB、snapshot分離、既定JSON/inspect/errorの秘密非出力を検査。予算の負例は不正JSONだけでなく、正当なJSONにpaddingした過長入力を使い、予算検査を外すと受理されるケースで確認。
- 独立check worktreeを正確なcode commitから作り、fresh install/build、当初9件のsource負例、各元bytes復元、全変種復元後のnormal build/unit7件を通過。smoke時点のcheckはclean。その後の差分は下記SID fixtureの強化だけで、製品source bytesはcode9879と一致。
- 独立reviewerのpnpm smoke PASS（exit0）。/tmp/desktop-signin-enrollment-independent-smoke.log。
- 独立design/taskcheck/cross reviewに残るmust/shouldなし。SIDの18/19/20拒否を全service account判定としない限定と、後続の実owner/account type照合を明記。
- このpath差分ではGitHub CIは起動していない。Windows C# sourceも変更しておらず、新Windows検証成功として過去CIを数えない。
- Source/rootの全体結果と、その後のtest-only fixture強化の検証は下記に区別して記録する。実service/driver導入・実サインイン状態の照会・実画面取得/入力・秘密の登録・Rootへのnetwork接続はこの差分の検証で行っていない。

## 負例（生ログ）

isolated checkの製品sourceだけを変更し、意図したassertで失敗することを確認。finallyで各元bytesを戻して一致検査し、当初9変種の後に正常build/unitを再実行した。続いてSID fixtureを強化し、追加2変種も意図したassert失敗を確認して元bytes復元・normal server build/typecheck/unit7件を確認した（合計11負例、2回に分けた検証）。

```text

## owner

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 15ms
   × rejects unsupported enrollment fields, owners, peers and unsafe origins 13ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:10
   Duration  907ms (transform 75%, import 23%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > rejects unsupported enrollment fields, owners, peers and unsafe origins
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopSigninEnrollment.test.ts:38:84


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## method

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 12ms
   × never classifies general RPC, initialization, trust or plaintext desktop input 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:11
   Duration  872ms (transform 77%, import 21%, tests 2%, worker 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > never classifies general RPC, initialization, trust or plaintext desktop input
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSigninEnrollment.test.ts:51:47


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## machine

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 29ms
   × binds starts to the configured machine, canonical relay and viewer role 28ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:13
   Duration  970ms (transform 76%, import 20%, tests 3%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > binds starts to the configured machine, canonical relay and viewer role
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopSigninEnrollment.test.ts:59:87


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## origin

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 12ms
   × binds starts to the configured machine, canonical relay and viewer role 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:15
   Duration  797ms (transform 76%, import 22%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > binds starts to the configured machine, canonical relay and viewer role
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopSigninEnrollment.test.ts:59:87


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## role

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 13ms
   × binds starts to the configured machine, canonical relay and viewer role 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:16
   Duration  810ms (transform 71%, import 26%, tests 2%, worker 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > binds starts to the configured machine, canonical relay and viewer role
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopSigninEnrollment.test.ts:59:87


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## serialization

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 12ms
   × keeps credentials out of default serialization, inspection and sanitized failures 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:18
   Duration  835ms (transform 77%, import 21%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > keeps credentials out of default serialization, inspection and sanitized failures
AssertionError: expected '{"version":1,"purpose":"desktop-signi…' to be '{"version":1,"purpose":"desktop-signi…' // Object.is equality

Expected: "{"version":1,"purpose":"desktop-signin"}"
Received: "{"version":1,"purpose":"desktop-signin","revision":"11111111-1111-4111-8111-111111111111","ownerSid":"S-1-5-21-1-2-3-1001","origin":"https://root.invalid","machineId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","token":"secret_tttttttttttttttttttttttttttttttttttt","provider":"2222222222222222222222222222222222222222222222222222222222222222","allowSignin":true,"allowInput":false,"peers":[{"fingerprint":"1111111111111111111111111111111111111111111111111111111111111111","label":"Local approval"}]}"

 ❯ src/desktop/DesktopSigninEnrollment.test.ts:23:57


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## snapshot

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 12ms
   × restores only the fixed enrollment, defaults input off and returns detached snapshots 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:20
   Duration  873ms (transform 73%, import 26%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > restores only the fixed enrollment, defaults input off and returns detached snapshots
AssertionError: expected [ { …(2) }, { …(2) } ] to deeply equal [ { …(2) } ]

- Expected
+ Received

  [
    {
-     "fingerprint": "1111111111111111111111111111111111111111111111111111111111111111",
+     "fingerprint": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      "label": "Local approval",
+   },
+   {
+     "fingerprint": "0000000000000000000000000000000000000000000000000000000000000000",
+     "label": "forged",
    },
  ]

 ❯ src/desktop/DesktopSigninEnrollment.test.ts:18:89
     16|  const status=value.publicStatus();expect(status.allowInput).toBe(fals…
     17|  status.allowInput=true;status.peers[0]!.fingerprint="f".repeat(64);st…
     18|  expect(value.publicStatus().allowInput).toBe(false);expect(value.publ…
       |                                                                                         ^
     19|  const next=value.delegation();next.token="forged";expect(value.delega…
     20|  expect(DesktopSigninEnrollment.decode(bytes({...record(),allowInput:t…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## budget

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 13ms
   × bounds and validates raw UTF-8 before accepting records or requests 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:21
   Duration  846ms (transform 77%, import 21%, tests 2%, worker 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > bounds and validates raw UTF-8 before accepting records or requests
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopSigninEnrollment.test.ts:73:68
     71|  const paddedRecord=new TextEncoder().encode(JSON.stringify(record())+…
     72|  const paddedRequest=new TextEncoder().encode(JSON.stringify({id:"1",m…
     73|  expect(()=>DesktopSigninEnrollment.decode(paddedRecord,ownerSid)).toT…
       |                                                                    ^
     74|  expect(()=>value.classify(paddedRequest)).toThrow();
     75|  expect(()=>value.classify(bytes({id:"x".repeat(129),method:"desktop.e…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## errors

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 23ms
   × keeps credentials out of default serialization, inspection and sanitized failures 21ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:31:23
   Duration  1.11s (transform 67%, import 30%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > keeps credentials out of default serialization, inspection and sanitized failures
AssertionError: expected '[\n  {\n    "origin": "string",\n    …' to be 'Desktop signin enrollment is unavaila…' // Object.is equality

- Expected
+ Received

- Desktop signin enrollment is unavailable
+ [
+   {
+     "origin": "string",
+     "code": "invalid_format",
+     "format": "regex",
+     "pattern": "/^[A-Za-z0-9_-]{43}$/",
+     "path": [
+       "token"
+     ],
+     "message": "Invalid string: must match pattern /^[A-Za-z0-9_-]{43}$/"
+   }
+ ]

 ❯ src/desktop/DesktopSigninEnrollment.test.ts:27:72


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## owner-service

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 19ms
   × rejects unsupported enrollment fields, owners, peers and unsafe origins 17ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:40:35
   Duration  1.22s (transform 76%, import 22%, tests 2%, worker 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > rejects unsupported enrollment fields, owners, peers and unsafe origins
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSigninEnrollment.test.ts:37:182


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## owner-shape

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-enrollment-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts (7 tests | 1 failed | 6 skipped) 19ms
   × rejects unsupported enrollment fields, owners, peers and unsafe origins 18ms

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  08:40:37
   Duration  1.17s (transform 73%, import 24%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninEnrollment.test.ts > rejects unsupported enrollment fields, owners, peers and unsafe origins
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSigninEnrollment.test.ts:37:182


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## 最終結果

- 製品code9879のsource全体12048件/811files PASS、guarded-root全体12110件/819files PASS（それぞれ単一run）。source/root build/typecheck PASS。
- 全体runの後、SID fixtureがowner不一致だけで拒否されないよう、SID変更時は同じexpectedOwnerSidを渡す形へ強化。製品実装は変更せず、source/root/checkのunit各7件とserver typecheckを追加確認。全体件数へ7件を足す集計はしない。
- 追加2負例は3つのservice SID除外/数値構造検査をそれぞれ外し、SID条件自体で失敗することを確認。元の製品source bytesは完全復元し、check normal server buildも通過。
- 独立crossとtest-only追加差分の再レビューに残るmust/shouldなし。新たなbrowser経路やservice entry pointは作っておらず、E2Eでサインアウト共有を検証したという主張はしない。
- PR/mainの結果は後続receiptへ記録する。秘密の保護保存、実account type、service接続/失効、worker epoch、取得/入力とUIは後続。
