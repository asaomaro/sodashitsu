# 7B2d 検証記録

Base main d1d191683b7336b15e62c455b165c7ddb3ea388fを取込み。製品moduleは2028d0d2と同一。専用SYSTEM hostが固定配置を先に検査する契約のreadonly key gateで、実SYSTEM/実鍵/実画面へ接続しない。

- 関連unit38件通過（生成P256鍵で署名検証含む）。最初は新WTのclient-core dist未生成で試験前に停止、protocol/client-core build後に実行した。
- Source/root full build/typecheck通過。read-slotのtest-only fixture修正後はsource関連38とserver typecheckを再確認。rootも同fixtureへguardして更新しserver typecheckを通過。全体unitの最終結果は下記。
- 独立taskcheck/cross must/shouldなし。check2028d0d2のfrozen install→build→smoke→unit38が成功。main取込み差分は#266の記録だけで製品TS bytes一致を検査。fixture差分再点検/関連38も成功。check/node_modules/.cache/signin-identity/{install,build,smoke,unit,unit-delta}.log。
- Source9負例（enrollment/required/実鍵pin/deadline/await後owner/issued latch/local callback再入/read実数slot/settled）は別WTの製品TSを直接変更し意図したAssertionErrorを確認、毎回finallyで元bytes復元。復元後38件成功。製品distへ変異したとは主張せず、vitestが読む製品TSへ適用。
- read-slot負例の初回は元fixtureが9件目の拒否をawaitし、5秒期限とVitest timeoutが競合したため不採用。観測行は `Error: Test timed out in 5000ms.`。9件目を開始→即呼出し数8のassert→finallyでextraAbort取消/全fake read解放へfixtureを修正し、再実行では意図した呼出し数assertが失敗した。timeoutを負例成功へ数えない。
- dedicated path/SYSTEM primary/package検査・controller・worker/UIは後続。gate単独でOS proofや入力許可を成立させず、既存user storeへfallbackしない。

## Source負例の生ログ

```text

## enrollment
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 29ms
   × refuses unregistered before touching a key store 15ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > refuses unregistered before touching a key store
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopSigninIdentity.test.ts:40:138


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:09
   Duration  922ms (transform 73%, import 22%, tests 4%, worker 1%)


## required
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 32ms
   × requires a live local not-required policy match 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > requires a live local not-required policy match
AssertionError: promise resolved "{ …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "allowInput": false,
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "04346dc40f6efcea540abef2b85c411f1debd8a9dbce0458b1c28d5f717cf7e5492d8d0d5469129db07f0be81ff64d07730d080f93eb2bf4c0352524752d9af06f",
+   },
  }

 ❯ src/desktop/DesktopSigninIdentity.test.ts:46:46


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:11
   Duration  939ms (transform 74%, import 22%, tests 4%, worker 1%)


## actual-pin
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 33ms
   × does not reuse another identity even when public status advertises the configured pin 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > does not reuse another identity even when public status advertises the configured pin
AssertionError: promise resolved "{ …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "allowInput": false,
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "042d2ee4e6fc83edf8b2ebf50c89e512c30be9ceee12f647d5d377140f97cc0b3109dd2fbe31682f2a6b8cc8cf7afe9b8497004f3c154c9f2621ba039432c6e4be",
+   },
  }

 ❯ src/desktop/DesktopSigninIdentity.test.ts:50:46
     48| it("does not reuse another identity even when public status advertises…
     49|   const f=fixture(),other=await DesktopEndpointIdentity.create(crypto)…
     50|   await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin …
       |                                              ^
     51| });
     52| it.each(["store-revoked","owner","abort","scope","active-throws"])("pe…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:13
   Duration  976ms (transform 72%, import 24%, tests 4%, worker 1%)


## deadline
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 27ms
   × checks a monotonic deadline before a late timer callback 14ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > checks a monotonic deadline before a late timer callback
AssertionError: promise resolved "{ …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "allowInput": false,
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "048f3ca3ce3d97d3b245457cd737a7d40f1b27fb0bc8fe622734eddc444df840a735fa9eef1988acc79d0a7b518354fbd502312fe474204d3029d1dcd66f2f53f4",
+   },
  }

 ❯ src/desktop/DesktopSigninIdentity.test.ts:84:46
     82| it("checks a monotonic deadline before a late timer callback",async()=…
     83|   const f=fixture();f.store.status.mockImplementationOnce(async()=>{f.…
     84|   await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin …
       |                                              ^
     85| });
     86| it.each(["revision","provider","allowInput"])("rejects a caller scope …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:14
   Duration  945ms (transform 74%, import 22%, tests 3%)


## owner-after-await
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 31ms
   × discards a result on owner loss during first-status 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > discards a result on owner loss during first-status
AssertionError: promise resolved "{ …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "allowInput": false,
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "04befb4c4a7d6dea5cafbd2cac5eeb1da8c5c8d313c517b32afbe7591c089bc85b143a4d249498df4349a43caa267e95b105b7a65f9b6a76db883399c859ffc9e7",
+   },
  }

 ❯ src/desktop/DesktopSigninIdentity.test.ts:65:46
     63|   if(stage==="identity")f.store.endpoint.mockResolvedValue({identity:{…
     64|   if(stage==="last-status")f.store.status.mockResolvedValueOnce(f.stat…
     65|   await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin …
       |                                              ^
     66| });
     67| it("checks both the pending read and the issued permit after reentrant…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:16
   Duration  977ms (transform 73%, import 22%, tests 4%, worker 1%)


## issued-latch
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 31ms
   × permanently revokes an issued permit on store-revoked 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > permanently revokes an issued permit on store-revoked
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninIdentity.test.ts:57:111
     55|   if(mode==="store-revoked")f.local(false);if(mode==="owner")f.loseOwn…
     56|   if(mode==="active-throws")scope.active=()=>{throw Error("private");};
     57|   expect(permit.active()).toBe(false);f.local(true);active=true;scope.…
       |                                                                                                               ^
     58| });
     59| it.each(["abort","owner"].flatMap(loss=>["first-status","endpoint","id…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:18
   Duration  991ms (transform 73%, import 23%, tests 4%)


## local-reentrant
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 30ms
   × latches synchronous revocation from the local permit callback 15ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > latches synchronous revocation from the local permit callback
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninIdentity.test.ts:75:88
     73|   const f=fixture();let revoke=false;
     74|   f.store.endpoint.mockResolvedValue({identity,active:()=>{if(revoke)f…
     75|   const permit=await f.gate.endpoint(peer,f.scope);revoke=true;expect(…
       |                                                                                        ^
     76| });
     77| it("does not publish after local trust is removed during restoration",…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:20
   Duration  958ms (transform 74%, import 22%, tests 4%)


## real-read-slot
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 21ms
   × bounds live reads even when callers cancel before the underlying read settles 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > bounds live reads even when callers cancel before the underlying read settles
AssertionError: expected "vi.fn()" to be called 8 times, but got 9 times
 ❯ src/desktop/DesktopSigninIdentity.test.ts:96:31
     94|   for(let i=0;i<8;i++){const abort=new AbortController();results.push(…
     95|   const extraAbort=new AbortController(),extra=f.gate.endpoint(peer,{.…
     96|   try {expect(f.store.status).toHaveBeenCalledTimes(8);}
       |                               ^
     97|   finally {extraAbort.abort();for(const release of releases)release(f.…
     98|   expect(await extra).toBeInstanceOf(Error);await flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:22
   Duration  948ms (transform 75%, import 22%, tests 3%)


## settled-reads
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-identity-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts (38 tests | 1 failed | 37 skipped) 31ms
   × cancels stalled callers on the timer but waits for actual reads before releasing ownership 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninIdentity.test.ts > cancels stalled callers on the timer but waits for actual reads before releasing ownership
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninIdentity.test.ts:105:169
    103|   f.store.status.mockImplementationOnce(()=>new Promise(resolve=>{rele…
    104|   const outcome=f.gate.endpoint(peer,f.scope).catch(error=>error);awai…
    105|   await expect(f.gate.settled()).rejects.toThrow();f.gate.close();let …
       |                                                                                                                                                                         ^
    106|   release(f.state());await done;expect(settled).toBe(true);expect(f.st…
    107| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
   Start at  20:11:24
   Duration  910ms (transform 72%, import 23%, tests 4%)


```

## 最終結果

- Source build/typecheck・全体12146件/814files PASS（単一run、323.14秒）。root build/typecheckも成功。fixtureのみ変更後のsource/root server typecheckも通過。
- Root全体は12207 PASS/1 FAIL（計12208件/822files、328.30秒）。失敗は変更していないSettingsDialog通知切替testのtoast true/false assert。コード/条件を変えず同file単独を再実行し146件/1file PASS（20.86秒）。root unique12208件を検証したが、単一全体runのPASSとはせず、146件を追加件数へ足さない。
- 関連38件、source9負例/元bytes復元、独立build/smoke/taskcheck/crossとfixture差分再点検・unit38に残るmust/shouldなし。checkの製品TS bytesは正本と一致。
- この変更pathでは既存CI workflow非該当で、CI PASSとは主張しない。System identity/固定path/package host、controller、worker/UIは未完成。このgate単独の鍵所持をOS入力許可にしない。実SYSTEM起動・実鍵登録・実画面取得/入力は未実施。

### Root全体の失敗（生ログ）

```text
 FAIL  |@sodashitsu/web| src/components/SettingsDialog.test.ts > SettingsDialog — 通知の節 — 切り替え（AC6・AC-I2） > 押した時点で反映され、保存される（確定ボタンは無い）
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/components/SettingsDialog.test.ts:96:54
     94|
     95|     await switches(wrapper)[0]!.trigger("click");
     96|     expect(useNotificationsStore(pinia).prefs.toast).toBe(false);
       |                                                      ^
     97|     expect(useNotificationsStore(createPinia()).prefs.toast, "再読み込みしても…
     98|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 821 passed (822)
      Tests  1 failed | 12207 passed (12208)
   Start at  20:21:12
   Duration  328.30s (tests 83%, import 9%, environment 4%, transform 4%)


```
