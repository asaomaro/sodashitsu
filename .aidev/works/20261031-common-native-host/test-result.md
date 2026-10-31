# 検証

- Windows Node 24.19.0 + fixed Windows PowerShell: private generated CLR、3role STA/MTA、未選択moduleなし、未知role/wrong SHA/tamper/hardlink拒否、metadata破損とabsent current pointerをfresh immutable cohortで復旧、実role --preflightのみ。pass。ログ /tmp/soda-common-native-roles-recovery-validation.log。実desktop/input/audio device呼出なし。
- Node関連7files/67tests pass。/tmp/soda-common-native-focused-final.log。
- 全体build + close latch追加後のclient/server incremental build、typecheck pass。全体919files/13,239tests pass、Windows専用1file/1test skip（/tmp/soda-common-native-all.log、exit0）。
- 配布13runtime資源（新規12+既存EndpointAclPolicy）とcompiled entries一致、旧3builder不存在を確認。/tmp/soda-common-native-package-verify.json。
- 独立whole/delta review_transfer: must/shouldなし。前shouldの同時closeはPromise latchで修正。

## 回帰の負例

同じprivate source copyで先にclose回帰が1pass。latchだけ外すと1failになり、二重unlink ENOENTも観測。実装を元へ復元済み。製品ソースは変更せず全体試験と分離。ログ /tmp/soda-common-native-negative-{positive,failure}.log。

```text
 FAIL  DesktopNativeRoleBinary.node.test.ts > shares one physical retirement and cleanup for concurrent close calls
AssertionError: expected Promise{…} to be Promise{…} // Object.is equality

If it should pass with deep equality, replace "toBe" with "toStrictEqual"

Expected: Promise{…}
Received: serializes to the same string


Compared values have no visual difference.

```

初期Windows builderはFile.Replace(temporary,pointer,$null)で、PowerShellのnull→empty path変換によりmetadata repair試験が失敗した。owned explicit backupへ修正して同一試験pass。

```text
Error: Generated native builder failed: #< CLIXML
"3" 個の引数を指定して "Replace" を呼び出し中に例外が発生しました: "パスの形式が無効です。"
```

初期失敗生ログ: /tmp/soda-common-native-roles-final-validation.log。

## Hosted Windows環境での修正

初回CIのNode境界はUbuntu/Windowsとも67pass、CLR生成jobだけpwsh7親のPSModulePath継承によりGet-Acl自動module loadで失敗。DirectoryInfo.GetAccessControl()へ置換し、同じowner/rules/protected評価を維持した。固定WinPS5/.NET Framework向け。実Windows生成validator再実行pass（/tmp/soda-common-native-roles-clr-acl-validation.log）。独立delta reviewはmust/shouldなし。実行ポリシーやOS ACLは変更しない。

```text
Get-Acl : The 'Get-Acl' command was found in the module 'Microsoft.PowerShell.Security', but the module could not be
loaded. For more information, run 'Import-Module Microsoft.PowerShell.Security'.
```

生ログ: /tmp/soda-common-native-ci-failed.log。最終headのCIとmerge結果はPR346で確認する。実desktop/audio/Explorer操作は未検証。


続く同環境CIでGet-FileHashも未検出だったため、Hash-FileをCLR FileStream+SHA256へ変更し、stream取得直後のouter finallyとSHA用inner finallyで例外cleanupを維持。validatorはJSONのUtility autoload後にGet-Acl/Get-FileHashだけを拒否するprivate child fixtureで実行する。旧hashへ戻した隔離copyは以下の意図した失敗、現実装は全role試験pass（/tmp/soda-common-native-roles-cmdlets-unavailable-{positive,negative}.log）。初期のPSModulePath変更だけではbuiltin補完により旧hashも通ったので、回帰として採用せずguardを修正した。修正deltaの独立reviewはmust/shouldなし。

```text
file://wsl.localhost/Ubuntu/tmp/soda-role-no-module-negative-jx6dxamd/verify-native-roles.mjs:19
 pending.stdin.end(JSON.stringify({operation,role,source:sdk,...(operation==='module'?{expectedHost:selectedHost.directory.split(/[\\/]/).at(-1).slice(5),expectedHash:selectedHost.sha256}:{})}));const result=await new Promise((resolve,reject)=>{let stdout='',stderr='';pending.stdout.on('data',data=>stdout+=data);pending.stderr.on('data',data=>stderr+=data);pending.on('error',reject);pending.on('close',status=>status===0?resolve(stdout):reject(Error('Generated native builder failed: '+stderr)));});const parsed=JSON.parse(result.replace(/^\uFEFF/,''));if(operation==='host')selectedHost=parsed;return parsed;
                                                                                                                                                                                                                                                                                                                                                                                                                                                               ^

Error: Generated native builder failed: #< CLIXML

<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><S S="Error">optional hash module is unavailable_x000D__x000A_</S><S S="Error">発生場所 行:27 文字:90_x000D__x000A_</S><S S="Error">+ ... function Get-FileHash { throw 'optional hash module is unavailable' }_x000D__x000A_</S><S S="Error">+                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~_x000D__x000A_</S><S S="Error">    + CategoryInfo          : OperationStopped: (optional hash module is unavailable:String) [], RuntimeException_x000D__x000A_</S><S S="Error">    + FullyQualifiedErrorId : optional hash module is unavailable_x000D__x000A_</S><S S="Error"> _x000D__x000A_</S></Objs>
```
