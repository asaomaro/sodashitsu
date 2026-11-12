# SYSTEMでの固定同梱PowerShell helper起動

基準ef9d8914。source-authorは`/workspaces/sodashitsu-signin-policy-fix`だけを編集し、Windowsはsole operatorが実行した。Rootが内部判断による4783a437の4箇所の削除を訂正する方針を明示した。ユーザーが要求した禁止の撤回ではない。

admin IPCを正規のlocal InteractiveToken Highestで実行すると、controller exit0/service STOPPED/owned process0まで完了し、Nodeだけがoutcome=incompleteを返した。SSHのNU拒否とは別の段階。store.statusの最初のACL helperがPowerShellの実行ポリシーで拒否され、DPAPI処理前に失敗していた。83個の元の暗号化data/trust/enrollment bytesは変わっていない。

actual SYSTEMのread-only結果（private stderr/secret payloadを表示しない）:

```
{"scopes":[{"policy":"Undefined","scope":"MachinePolicy"},{"policy":"Undefined","scope":"UserPolicy"},{"policy":"Undefined","scope":"Process"},{"policy":"Undefined","scope":"CurrentUser"},{"policy":"Undefined","scope":"LocalMachine"}],"effective":"Restricted","system":true}
temporary_readonly_policy_task_deleted
{"exit":1,"validMarker":false,"policyFailurePSSecurityException":false,"script":"check-endpoint-acl.ps1","processPolicyEnvironmentPresent":false}
temporary_readonly_acl_probe_task_deleted
{"tokens":[{"present":false,"token":"PSSecurityException"},{"present":false,"token":"AuthorizationManager"},{"present":false,"token":"SecurityError"},{"present":true,"token":"UnauthorizedAccess"},{"present":true,"token":"about_Execution_Policies"},{"present":false,"token":"Endpoint storage permissions are unsafe"},{"present":false,"token":"FileNotFound"},{"present":false,"token":"cannot"},{"present":true,"token":".ps1"}],"stderrCharacters":485,"stdoutCharacters":0}
```

同じfixed installed ACL helperにchild processの`-ExecutionPolicy Bypass`だけを付けて実行すると成功。終了後の新しいSYSTEM processでは実効Restricted、永続scopeはUndefinedのままだった:

```
{"policyAfter":{"effective":"Restricted","allPersistentUndefined":true},"exit":0,"validMarker":true,"policyFailurePSSecurityException":false,"script":"check-endpoint-acl.ps1","processPolicyEnvironmentPresent":false}
temporary_readonly_acl_probe_task_deleted
```

PowerShellの[公式execution policy説明](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1)はBypassを独自security modelを持つアプリに組み込む用途として説明し、Processはsessionだけ、Group Policyはその上位とする。[powershell.exeの説明](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1)もこの引数がregistry policyを変更しないことを明記する。

変更は4つの固定Node spawnの引数復元だけ。新しいpolicy parser/fallback/crypto/runtime hookは追加しない。OS ACL/NU deny/SYSTEM DPAPI形式/固定path/allowlistと秘密のprivate stdioを維持する。3つの既存spawn境界テストを更新し、絶対PowerShell・固定script・固定module path・process引数とsecret非漏洩を確認。通常のdeveloper validator wrapperは変更しない。

3テストファイルで32テストが成功。修正した4箇所だけ元のno-option版へ戻して再実行すると、clientの4ケースとserverの2ケースが意図したspawn引数assertionで失敗。ソースをバイト一致で戻した。旧実装の生出力:

```

 RUN  v5.0.1 /workspaces/sodashitsu-signin-policy-fix/packages/client-core

 ❯ src/desktop/DesktopPowerShellPolicy.node.test.ts (4 tests | 4 failed) 34ms
   × runs fixed protect with an embedded-helper process policy 26ms
   × runs fixed unprotect with an embedded-helper process policy 2ms
   × runs fixed check-endpoint-acl.ps1 with an embedded-helper process policy 1ms
   × runs fixed commit-endpoint-vault.ps1 with an embedded-helper process policy 1ms

 Test Files  1 failed (1)
      Tests  4 failed (4)
   Start at  02:46:13
   Duration  267ms (transform 45%, import 34%, tests 19%, worker 2%)

undefined
/workspaces/sodashitsu-signin-policy-fix/packages/client-core:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/desktop/DesktopPowerShellPolicy.node.test.ts

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/desktop/DesktopPowerShellPolicy.node.test.ts > runs fixed protect with an embedded-helper process policy
 FAIL  src/desktop/DesktopPowerShellPolicy.node.test.ts > runs fixed unprotect with an embedded-helper process policy
AssertionError: expected [ '-NoLogo', '-NoProfile', …(4) ] to deeply equal [ '-NoLogo', '-NoProfile', …(4) ]

- Expected
+ Received

  [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
-   "-ExecutionPolicy",
-   "Bypass",
    "-File",
+   "/workspaces/sodashitsu-signin-policy-fix/scripts/remote-desktop/protect-endpoint-key.ps1",
+   "-Operation",
  ]

 ❯ src/desktop/DesktopPowerShellPolicy.node.test.ts:17:27
     15|  const [executable,args,options]=vi.mocked(spawn).mock.calls[0]!;
     16|  expect(executable).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1…
     17|  expect(args!.slice(0,6)).toEqual(["-NoLogo","-NoProfile","-NonInterac…
       |                           ^
     18|  expect(args![6]!.replaceAll("\\","/").endsWith("/"+(key?"protect-endp…
     19|  expect(args).not.toContain("-Command");expect(args).not.toContain("Se…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  src/desktop/DesktopPowerShellPolicy.node.test.ts > runs fixed check-endpoint-acl.ps1 with an embedded-helper process policy
AssertionError: expected [ '-NoLogo', '-NoProfile', …(3) ] to deeply equal [ '-NoLogo', '-NoProfile', …(4) ]

- Expected
+ Received

  [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
-   "-ExecutionPolicy",
-   "Bypass",
    "-File",
+   "/workspaces/sodashitsu-signin-policy-fix/scripts/remote-desktop/check-endpoint-acl.ps1",
  ]

 ❯ src/desktop/DesktopPowerShellPolicy.node.test.ts:17:27
     15|  const [executable,args,options]=vi.mocked(spawn).mock.calls[0]!;
     16|  expect(executable).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1…
     17|  expect(args!.slice(0,6)).toEqual(["-NoLogo","-NoProfile","-NonInterac…
       |                           ^
     18|  expect(args![6]!.replaceAll("\\","/").endsWith("/"+(key?"protect-endp…
     19|  expect(args).not.toContain("-Command");expect(args).not.toContain("Se…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  src/desktop/DesktopPowerShellPolicy.node.test.ts > runs fixed commit-endpoint-vault.ps1 with an embedded-helper process policy
AssertionError: expected [ '-NoLogo', '-NoProfile', …(3) ] to deeply equal [ '-NoLogo', '-NoProfile', …(4) ]

- Expected
+ Received

  [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
-   "-ExecutionPolicy",
-   "Bypass",
    "-File",
+   "/workspaces/sodashitsu-signin-policy-fix/scripts/remote-desktop/commit-endpoint-vault.ps1",
  ]

 ❯ src/desktop/DesktopPowerShellPolicy.node.test.ts:17:27
     15|  const [executable,args,options]=vi.mocked(spawn).mock.calls[0]!;
     16|  expect(executable).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1…
     17|  expect(args!.slice(0,6)).toEqual(["-NoLogo","-NoProfile","-NonInterac…
       |                           ^
     18|  expect(args![6]!.replaceAll("\\","/").endsWith("/"+(key?"protect-endp…
     19|  expect(args).not.toContain("-Command");expect(args).not.toContain("Se…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯


 RUN  v5.0.1 /workspaces/sodashitsu-signin-policy-fix/packages/server

 ❯ src/desktop/DesktopSigninAdminCommand.test.ts (11 tests | 1 failed) 22ms
   × uses an embedded-helper process policy for the fixed enrollment writer 6ms
 ❯ src/desktop/DesktopSigninVault.node.test.ts (17 tests | 1 failed) 30ms
   × captures only private pipes, parses the fixed owner and never prints credentials 11ms

 Test Files  2 failed (2)
      Tests  2 failed | 26 passed (28)
   Start at  02:46:14
   Duration  1.02s (transform 74%, import 23%, tests 3%)

undefined
/workspaces/sodashitsu-signin-policy-fix/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/desktop/DesktopSigninAdminCommand.test.ts src/desktop/DesktopSigninVault.node.test.ts

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/desktop/DesktopSigninAdminCommand.test.ts > uses an embedded-helper process policy for the fixed enrollment writer
AssertionError: expected [ '-NoLogo', '-NoProfile', …(4) ] to deeply equal [ '-NoLogo', '-NoProfile', …(4) ]

- Expected
+ Received

  [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
-   "-ExecutionPolicy",
-   "Bypass",
    "-File",
+   "/workspaces/sodashitsu-signin-policy-fix/scripts/remote-desktop/write-signin-enrollment.ps1",
+   "-OwnerSid",
  ]

 ❯ src/desktop/DesktopSigninAdminCommand.test.ts:50:26
     48|  const [executable,args,options]=vi.mocked(childProcess.execFile).mock…
     49|  expect(executable).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1…
     50|  expect(args.slice(0,6)).toEqual(["-NoLogo","-NoProfile","-NonInteract…
       |                          ^
     51|  expect(args[6]).toMatch(/write-signin-enrollment\.ps1$/);expect(args)…
     52|  expect(options).toMatchObject({windowsHide:true,cwd:"C:\\Windows\\Sys…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/desktop/DesktopSigninVault.node.test.ts > captures only private pipes, parses the fixed owner and never prints credentials
AssertionError: expected [ '-NoLogo', '-NoProfile', …(4) ] to deeply equal [ '-NoLogo', '-NoProfile', …(4) ]

- Expected
+ Received

  [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
-   "-ExecutionPolicy",
-   "Bypass",
    "-File",
+   "/workspaces/sodashitsu-signin-policy-fix/scripts/remote-desktop/read-signin-enrollment.ps1",
+   "-OwnerSid",
  ]

 ❯ src/desktop/DesktopSigninVault.node.test.ts:24:57


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

fixed_helper_process_policy_old_negative_and_exact_restore_passed
```

復元後の対象テスト再実行:

```
Test Files  1 passed (1)
Tests       4 passed (4)
Test Files  2 passed (2)
Tests       28 passed (28)
```

変更対象のtypecheck/buildと明示Signin bundleは独立レビュー後に行う。全体unit/typecheck/ビルドを重複実行しない。このsource commit時点では新bundleを実機へ導入しておらず、admin statusのactual成功までを主張しない。public upgrade/実機確認はRootとsole Windows operatorが行う。

## 独立レビュー後の統合・対象build

独立レビューはd73fe6e9を指摘なしで承認。7125c583（public prepare NullString修正済み）へ3ccde963としてcherry-pickし、競合なし。productionの4箇所はレビュー済みと同じ。prepare SDKの7529 pinは維持する。

変更対象だけを含む一時tsconfigでclient/serverの標準tscを実行し、両方exit0。最初の/tmp配置configはNode typeRoots解決を欠いていたためprojectの既存@types/nodeへ明示した。server側は新testのmock呼出しargsがnullableという2件だけ検出し、実行時に消える非null assertionを付けて再実行成功。productionの型/処理変更はない。32単体テストはcherry-pick前の同一コードで成功しており、競合も実行時変更もないため重複実行しない。

Rootの承認後に実行したbuild（すべてexit0）:

```
pnpm --filter @sodashitsu/client-core build
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sodashitsu/server build
assistant_internal_resources_built_no_execution
node scripts/remote-desktop/build-signin-bundle.mjs
signin_bundle_built_no_execution
node --check packages/server/dist/signin/main.bundle.cjs
```

通常の既知warningはRolldownのinlineDynamicImports deprecationのみ。Web/全7package/full unit/E2Eは再実行していない。

新しいSignin CJSは628603 bytes、SHA-256 `2f9ded67acb76ed345cf71752e928c6fc8f3a218759e7e560a7c04af16dae7f7`。旧mailbox/backend/request/result/task/administration/locallease/sourceの8 module markerは全てabsent。builderは既存のまま（SHA-256 `a3975253cfef9b778f804175761359e29c56afe9a9a4aad2fa6214bac87ddc7f`）。C# native13ac、Node exe、同梱PowerShell bytesは変更しない。

現行配布済みA8の3330ファイルmap（SHA-256 `3c3281b5ce4cb64950b22f72dcb016ff15673709149f379e8c2a335ddd16f55e`）と7つのowned distを照合し、ファイル集合は同じ3330、変化は9ファイルだけ。A291を差分基準に使わず、新たな削除・追加は0。9件は4 helperのJS/mapとSignin CJS:

```
packages/client-core/dist/desktop/DesktopEndpointProtector.node.js
packages/client-core/dist/desktop/DesktopEndpointProtector.node.js.map
packages/client-core/dist/desktop/DesktopWindowsMetadata.node.js
packages/client-core/dist/desktop/DesktopWindowsMetadata.node.js.map
packages/server/dist/desktop/DesktopSigninAdminCommand.js
packages/server/dist/desktop/DesktopSigninAdminCommand.js.map
packages/server/dist/desktop/DesktopSigninVault.node.js
packages/server/dist/desktop/DesktopSigninVault.node.js.map
packages/server/dist/signin/main.bundle.cjs
```

source/artifactのincremental prerequisiteは7125c583。新しいall-map/payload/source bundle pinはprivate `/tmp/soda-signin-process-policy-proof/artifact-plan/`で最終HEADへ固定し、Root/hash reviewer承認後にsole Opsへ渡す。Windowsの短い既存Signinサービスをpublic upgraderで更新し、Automaticと83個の既存dataを保持する実操作はsource-authorが実行しない。
