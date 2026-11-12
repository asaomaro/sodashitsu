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
