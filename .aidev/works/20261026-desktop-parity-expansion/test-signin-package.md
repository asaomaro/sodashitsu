# 7B2e 検証記録

Base main8916a272784c27e98f96ee22933df98cb711a994。実System、実Program Files、実service、実鍵、実画面/入力へ接続せず、固定package data/native read-only verifier/bootstrap/stagingを準備する。

## 結果

- Linux Node normal validators2件、Node source負例11件・コピー元bytes復元・復元後normal成功。mutantはprivate copyの製品mjsそのものへ適用し、各assert/exit1（signalなし）を検査。workspace sourceを書き換えたとは主張しない。
- diagnostics負例の初回はVM flag不足のエラーが先に現れ、狙ったprivate diagnostic assertへ届かなかったため不採用。検証childだけ明示--experimental-vm-modulesでcustom callbackまで到達させ、狙った診断文字列assertを確認。製品bootstrapを緩めていない。byte budget fixtureも構文が有効な18MBのUTF-8 commentで検査し、構文エラーだけの誤検知を避けた。外部fallback fixtureは同配置の通常Node loaderが生成trapを実際に解決できることを確認してからcacheを消し、制限loaderで拒否する。
- Native/taskcheckはmustなし。shouldとして実native handle経路が未検証と指摘されたため、OpenCore/Release内部seamとordinary temporary fixtureを追加し再点検通過。production Holdは固定CodeAcl/hookなしを維持。file/dir取得→handle SD→FileStream所有権移譲、write/delete share拒否、ACL拒否・stream直後・partial group失敗後のexclusive openと解放を実検証する。test用PS/Node childは起動するが、installed agentを起動しない。
- Windows code head2f0b18a89abead9a82fb27ab5089b36b00032f63: protected CI40687001557/job122811826062 PASS2026-10-28T12:21:21Z、Node40687001669/job122811826260 PASS12:22:15Z。ABI/manifest/ACL/actual ordinary temp native/14 source負例・元bytes復元/Node-CSharp canonical相互運用/ordinary-account拒否を確認。
- Node11 source負例を追加したbd2feea769c9b8b404a1203e08455973d6e3d93b: protected40689486629/job122820335034 PASS12:39:22Z、Node40689486843/job122820336888 PASS12:40:25Z（Windows上のNode11も含む）。その後のchild env allowlist化はLinuxと独立checkで11件/復元normalを再確認し、最終CI結果は完了後に記録する。
- 独立check bd2のfrozen install→build→smoke→Node normal2/negative11・復元normal成功、clean。Native/Node taskcheck、should修正再点検、全13files cross、child env test-only差分再点検にmust/shouldなし。check/node_modules/.cache/signin-package/ に保存。環境はPATH/SystemRoot/SYSTEMROOT/WINDIR/TEMP/TMP/TMPDIRだけを渡す。step名も実態に合わせ更新。
- workspace TS/runtimeと既存helper入口はbaseから無変更、新UIなし。この差分で全体suiteを再計上しない。base #267のsource12146/814単一PASS、root unique12208（全体1SettingsDialog失敗後同file146PASS、単一wholePASSではない）の記録を継承し、本差分の新しい全体PASSと主張しない。独立build/smokeと上記専用CIを根拠とする。
- native leaseは読み取り検査だけでchildを起動しない。管理者導入済みbootstrap/ACLが信頼起点、manifestは署名やmalicious-code sandboxの代用ではない。実SYSTEM/固定exe配置の統合、環境固定launch host、専用main/worker、installer/controller/UIは後続で、7B/7全体を完了としない。

## Windows native生成検証の生ログ

```text
boundaries	Generated fixed package data and ACL checks (no install or process launch)	﻿2026-10-28T12:38:52.8652163Z ##[group]Run scripts/remote-desktop/validate-signin-package.ps1 -NegativeControls
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:52.8652868Z [36;1mscripts/remote-desktop/validate-signin-package.ps1 -NegativeControls[0m
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:52.8720671Z shell: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE -command ". '{0}'"
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:52.8721143Z ##[endgroup]
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:54.2903214Z signin_package_generated_native_handles_and_cleanup_passed
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:54.2909178Z signin_package_generated_manifest_acl_and_facts_passed
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:57.7647860Z signin_package_generated_staging_manifest_passed
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:57.8278814Z signin_package_cross_runtime_manifest_passed
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:57.8890383Z signin_package_non_system_refused
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5319719Z negative owner
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5347958Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5350333Z    at SodaDesktopSigninPackageChecks.Reject(Action action)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5354245Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5357333Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5360236Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5363846Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5366407Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5369453Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:58.5372500Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0119431Z negative canonical
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0123766Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0126827Z    at SodaDesktopSigninPackageChecks.Reject(Action action)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0130006Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0133148Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0136791Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0140476Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0143481Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0146086Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.0148964Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4891077Z negative closed-paths
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4895967Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4897940Z    at SodaDesktopSigninPackageChecks.Reject(Action action)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4900706Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4903078Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4905427Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4908685Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4910871Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4913251Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.4917405Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9786078Z negative file-size
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9790621Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9792981Z    at SodaDesktopSigninPackageChecks.Reject(Action action)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9795540Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9797955Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9800248Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9805722Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9809290Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9811683Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:38:59.9815607Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4423648Z negative total-size
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4429059Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4431184Z    at SodaDesktopSigninPackageChecks.Reject(Action action)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4433603Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4436522Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4439361Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4443267Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4445626Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4448837Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.4452456Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9073298Z negative acl-owner
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9078026Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Foreign code owner accepted" ---> System.InvalidOperationException: Foreign code owner accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9079619Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9082486Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9084987Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9088327Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9090416Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9093349Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:00.9095822Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4084106Z negative acl-write
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4089542Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Foreign code write accepted" ---> System.InvalidOperationException: Foreign code write accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4091904Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4094692Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4097110Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4099996Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4102430Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4105009Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.4108480Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8840316Z negative reparse
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8844581Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package file facts accepted" ---> System.InvalidOperationException: Unsafe package file facts accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8847226Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8849259Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8852044Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8854923Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8858113Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8861197Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:01.8863595Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3619984Z negative links
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3623442Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package file facts accepted" ---> System.InvalidOperationException: Unsafe package file facts accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3624993Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3628112Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3630471Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3633777Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3636381Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3639258Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.3641987Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8540347Z negative file-id
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8544589Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Changed package file accepted" ---> System.InvalidOperationException: Changed package file accepted
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8546840Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8549505Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8552040Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8554865Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8557904Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8560665Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:02.8563128Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3613819Z negative share-write
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3618569Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Package write share unexpectedly allowed" ---> System.InvalidOperationException: Package write share unexpectedly allowed
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3619973Z    at SodaDesktopSigninPackageChecks.NativeFixtures()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3622868Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3625321Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3628077Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3630759Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3633375Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3636105Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.3638919Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8418595Z negative share-delete
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8423117Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Package delete share unexpectedly allowed" ---> System.InvalidOperationException: Package delete share unexpectedly allowed
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8424981Z    at SodaDesktopSigninPackageChecks.NativeFixtures()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8428525Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8431292Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8434151Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8437418Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8439904Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8443053Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:03.8445285Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3444827Z negative failure-cleanup
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3449462Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Native failure leaked a handle" ---> System.InvalidOperationException: Native failure leaked a handle
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3451684Z    at SodaDesktopSigninPackageChecks.Exclusive(String path)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3454209Z    at SodaDesktopSigninPackageChecks.NativeFixtures()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3456981Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3459563Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3462037Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3464840Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3467569Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3470191Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.3473068Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8359456Z negative group-cleanup
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8363811Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Native failure leaked a handle" ---> System.InvalidOperationException: Native failure leaked a handle
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8366140Z    at SodaDesktopSigninPackageChecks.Exclusive(String path)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8368761Z    at SodaDesktopSigninPackageChecks.NativeFixtures()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8371540Z    at SodaDesktopSigninPackageChecks.Run()
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8374019Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8376438Z    --- End of inner exception stack trace ---
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8379292Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8382020Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8384613Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:04.8387248Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:05.2968479Z signin_package_generated_native_handles_and_cleanup_passed
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:05.2970590Z signin_package_generated_manifest_acl_and_facts_passed
boundaries	Generated fixed package data and ACL checks (no install or process launch)	2026-10-28T12:39:05.2990687Z signin_package_native_negative_controls_passed
```

## Node source負例の生ログ

```text
negative builtin-set
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe generated bundle accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:15:3)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:36:5 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative external-fallback
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe generated bundle accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:15:3)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:36:5 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative dynamic-import
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe generated bundle accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:15:3)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:38:3 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative main-once
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe generated bundle accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:15:3)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:28:122 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative source-budget
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe generated bundle accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:15:3)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:41:3 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative diagnostics
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected

+ 'private-generated-diagnostic'
- 'Signin agent is unavailable'

    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:16:10)
    at file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-bootstrap.mjs:40:330 {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: 'private-generated-diagnostic',
  expected: 'Signin agent is unavailable',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.15.0

negative staging-owner
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe staging accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:12:85)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:22:268 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative staging-inventory
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe staging accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:12:85)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:35:5 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative staging-file-budget
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe staging accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:12:85)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:35:5 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative staging-hardlink
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe staging accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:12:85)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:35:5 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

negative staging-no-overwrite
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Unsafe staging accepted
    at reject (file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:12:85)
    at async file:///tmp/soda-signin-node-negative-zkKn0X/validate-signin-package.mjs:21:3 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0

signin_bootstrap_generated_builtin_only_no_fallback_passed

signin_package_generated_staging_manifest_passed

signin_node_source_negative_controls_and_restore_passed

```
