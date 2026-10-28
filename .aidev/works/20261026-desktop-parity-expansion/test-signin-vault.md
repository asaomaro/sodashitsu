# 7B2b 検証記録

Base main99c5f60e314c9db9d5acdad78e1b6ebbe1000c50。読取helperとNode private child adapterを準備し、serviceへは接続しない。新規保存/ACL修復/サービス起動/鍵登録を行わない。

Native/taskcheck: owner固定path、SYS primary、機密ACL、read-only held handleと前後の同一性検査、buffer消去を点検。現時点mustなし。stdoutはNodeのprivate pipeで受ける契約と、helper側pipe type検査を追加。Node差分の独立点検は後続。

LocalMachine指定Unprotectの引数だけで、同一user/同一entropyのCurrentUser blobが必ず拒否されるとは仮定しない。生成データで実APIの結果を観測し、scope引数ではなくSYSTEM gate/機密ACL/用途とowner/strict schemaを必須とする。alternate-scope retryは実装しない。既存CurrentUser keyの別用途entropyとowner不一致は別に検証する。

Source build/unit、Windows生成検証、負例・独立最終点検は実行後に追記する。実SYSTEM readerとして起動せず、実enrollment/サインイン状態/画面にはアクセスしない。

## 実装検証

- Frozen install/source build PASS。関連unitは当初22件、単調deadline修正後23件、pre-close budget fixture追加後24件を通過。Node taskcheckでtimer-only期限が指摘され、固定performance.now deadlineとtimer未実行のclock-only回帰を追加した。修正差分再点検にmust/shouldなし。
- Source6負例（deadline/owner/post-decode/budget/logging/pipes）はisolated checkの製品sourceを直接変更して意図したassert失敗を確認し、finallyで各元bytesへ戻した。初回check build完了を十分待たず負例を開始したため、初回成果物を検証根拠に使わず、全負例復元と両build完了後のserial full buildを通過させた。正常unit24件も通過。
- checkの製品module bytesはd8/eeと一致。test-only budget6linesは正本eeと一致する差分として保持。これは別の製品実装差分ではない。
- Windows code-head d8 protected CI40610186489/job122559577017 PASS2026-10-28T00:40:29Z。生成crypto/ACL/ABIと普通アカウントでのreader拒否を確認。実SYSTEM readerや実vaultを実行/読取していない。
- 同一user/同じentropyのCurrentUser blobはLocalMachine指定Unprotectでもaccepted=trueとなった。scope引数だけを拒否根拠にしない。別owner/別用途entropyの拒否、SYSTEM gate/機密ACL/strict decoderとalternate-scope retry無しはそれぞれ独立した条件。
- Native/Node taskcheck/cross reviewに残るmust/shouldなし。全体build/typecheck/testと独立smokeの最終結果は完了後に追記する。service/installer/書込みcontroller/実取得・入力は後続。

### Windows生成結果（生ログ）

```text
boundaries	Generated SYSTEM enrollment crypto and ACL checks (no real vault reads)	﻿2026-10-28T00:40:14.7575470Z ##[group]Run scripts/remote-desktop/validate-signin-vault.ps1
boundaries	Generated SYSTEM enrollment crypto and ACL checks (no real vault reads)	2026-10-28T00:40:14.7575910Z [36;1mscripts/remote-desktop/validate-signin-vault.ps1[0m
boundaries	Generated SYSTEM enrollment crypto and ACL checks (no real vault reads)	2026-10-28T00:40:14.7627113Z shell: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE -command ". '{0}'"
boundaries	Generated SYSTEM enrollment crypto and ACL checks (no real vault reads)	2026-10-28T00:40:14.7627482Z ##[endgroup]
boundaries	Generated SYSTEM enrollment crypto and ACL checks (no real vault reads)	2026-10-28T00:40:16.0181663Z signin_vault_same_user_current_user_blob_accepted=true
boundaries	Generated SYSTEM enrollment crypto and ACL checks (no real vault reads)	2026-10-28T00:40:16.0250530Z signin_vault_generated_crypto_and_facts_passed
boundaries	Generated SYSTEM enrollment crypto and ACL checks (no real vault reads)	2026-10-28T00:40:16.1013433Z signin_vault_generated_acl_passed
boundaries	Generated SYSTEM enrollment crypto and ACL checks (no real vault reads)	2026-10-28T00:40:16.6347946Z signin_vault_non_system_refused
```

### Node source負例（生ログ）

```text

## deadline

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-vault-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts (17 tests | 1 failed | 16 skipped) 12ms
   × rejects a late secret even before the timer callback runs 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  09:44:19
   Duration  875ms (transform 77%, import 21%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts > rejects a late secret even before the timer callback runs
AssertionError: expected { version: 1, …(1) } to be an instance of Error
 ❯ src/desktop/DesktopSigninVault.node.test.ts:68:24
     66|  let now=0;const f=fixture(()=>now),p=f.read(owner,{active:()=>true}),…
     67|  f.child.stdout.emit("data",raw);now=5000;f.child.emit("close",0);
     68|  expect(await outcome).toBeInstanceOf(Error);expect(f.child.kill).toHa…
       |                        ^
     69| });
     70| it("catches an abort fired during spawn and never exposes a late respo…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## owner

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-vault-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts (17 tests | 1 failed | 16 skipped) 12ms
   × discards a completed secret after owner loss at close 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  09:44:21
   Duration  850ms (transform 74%, import 24%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts > discards a completed secret after owner loss at close
AssertionError: expected { version: 1, …(1) } to be an instance of Error
 ❯ src/desktop/DesktopSigninVault.node.test.ts:52:48
     50|  f.child.stdout.emit("data",raw);
     51|  if(mode==="close")active=false;if(mode==="abort")controller.abort();
     52|  f.child.emit("close",0);expect(await outcome).toBeInstanceOf(Error);e…
       |                                                ^
     53| });
     54| it("bounds a stalled helper and removes its abort listener",async()=>{

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## post-decode

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-vault-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts (17 tests | 1 failed | 16 skipped) 12ms
   × discards a completed secret after owner loss at decode 10ms

 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  09:44:23
   Duration  812ms (transform 74%, import 24%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts > discards a completed secret after owner loss at decode
AssertionError: expected { version: 1, …(1) } to be an instance of Error
 ❯ src/desktop/DesktopSigninVault.node.test.ts:52:48
     50|  f.child.stdout.emit("data",raw);
     51|  if(mode==="close")active=false;if(mode==="abort")controller.abort();
     52|  f.child.emit("close",0);expect(await outcome).toBeInstanceOf(Error);e…
       |                                                ^
     53| });
     54| it("bounds a stalled helper and removes its abort listener",async()=>{

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## budget

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-vault-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts (17 tests | 1 failed | 16 skipped) 8ms
   × rejects oversized output before waiting for helper close 7ms

 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  09:44:24
   Duration  885ms (transform 74%, import 25%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts > rejects oversized output before waiting for helper close
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/desktop/DesktopSigninVault.node.test.ts:61:60
     59| it("rejects oversized output before waiting for helper close",async()=…
     60|  const f=fixture(),p=f.read(owner,{active:()=>true}),outcome=p.catch(e…
     61|  try {f.child.stdout.emit("data",raw);expect(f.child.kill).toHaveBeenC…
       |                                                            ^
     62|  finally {f.child.emit("close",1);}
     63|  expect(raw.every(value=>value===0)).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## logging

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-vault-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts (17 tests | 1 failed | 16 skipped) 14ms
   × captures only private pipes, parses the fixed owner and never prints credentials 12ms

 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  09:44:26
   Duration  880ms (transform 77%, import 20%, tests 2%, worker 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
stderr | src/desktop/DesktopSigninVault.node.test.ts > captures only private pipes, parses the fixed owner and never prints credentials
secret_tttttttttttttttttttttttttttttttttttt


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts > captures only private pipes, parses the fixed owner and never prints credentials
AssertionError: expected "error" to not be called at all, but actually been called 1 times

Received:

  1st error call:

    Array [
      "secret_tttttttttttttttttttttttttttttttttttt",
    ]


Number of calls: 1

 ❯ src/desktop/DesktopSigninVault.node.test.ts:26:55
     24|  expect(executable).toBe(shell);expect(args).toContain(owner);expect(a…
     25|  expect(options.stdio).toEqual(["ignore","pipe","pipe"]);expect(option…
     26|  expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled…
       |                                                       ^
     27| });
     28| it.each(["overflow","malformed","empty","exit","error","stdout","stder…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


## pipes

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-vault-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts (17 tests | 1 failed | 16 skipped) 13ms
   × captures only private pipes, parses the fixed owner and never prints credentials 12ms

 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  09:44:28
   Duration  968ms (transform 74%, import 24%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninVault.node.test.ts > captures only private pipes, parses the fixed owner and never prints credentials
AssertionError: expected [ 'ignore', 'inherit', 'pipe' ] to deeply equal [ 'ignore', 'pipe', 'pipe' ]

- Expected
+ Received

  [
    "ignore",
-   "pipe",
+   "inherit",
    "pipe",
  ]

 ❯ src/desktop/DesktopSigninVault.node.test.ts:25:24
     23|  const [executable,args,options]=f.spawn.mock.calls[0]!;
     24|  expect(executable).toBe(shell);expect(args).toContain(owner);expect(a…
     25|  expect(options.stdio).toEqual(["ignore","pipe","pipe"]);expect(option…
       |                        ^
     26|  expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled…
     27| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## 最終結果

- Source build/typecheck、全体12065件/812files PASS、guarded-root build/typecheck、全体12127件/820files PASS（各単一run）。
- 関連unit24件、source6負例の意図したassert失敗/元bytes復元、check serial full build後の独立pnpm smoke PASS（exit0）。/tmp/desktop-signin-vault-independent-smoke.log。追加pre-close budget testも独立点検通過。
- code head ee0f6fdc838aadaf1bfcd629eb5a11db1bb94035 のprotected CI40610666442/job122561132021 PASS2026-10-28T00:44:52Z、Node identity40610666224/job122561130737 PASS00:46:08Z。
- 独立Native/Node taskcheck、期限修正再点検、cross、test-only差分再点検にmust/shouldなし。実SYSTEM reader・実vault・service/driver導入・実signin/capture/inputは未実施。
- [DataProtectionScope仕様](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope?view=netframework-4.8.1)と[CryptUnprotectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata)も照合。生成した改変cipher拒否の結果は、そのfixtureの確認であり、全改変やscope属性の強制の証明として拡張しない。信頼済み保存先/機密ACL/strict schemaを必須とする。
- この部品では書込みcontroller、鍵の準備/peer登録、trusted package/asset hashを確定するinstaller/host、service lifecycle/即時取消、worker/epoch barrier、取得/入力/UIへの接続は未完成。7B/task7全体を完了扱いにしない。
