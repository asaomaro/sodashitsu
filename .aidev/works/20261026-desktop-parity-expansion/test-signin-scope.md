# 7B1 検証記録

Base main5765f05dcadadaf64f4e74b79bf5de56671919d6（PR261）。新しいC# sourceと独立validatorは既存helper/service/capture/input/HTTP/RPCへ組み込まない。Native hostを生成検証から生成・実行せず、fake host・生成TOKEN_PRIVILEGES buffer・Marshal layoutだけを使う。

独立設計点検はmust/shouldなし。taskcheckでprimary tokenをPrivilegeCheckへ渡すAPI契約違反を1件発見。GetTokenInformation(TokenPrivileges)と有限bufferの純粋parserへ修正し、無効/除去/重複/不正長の回帰を追加。追加差分の再点検も通過し、残るmust/shouldはない。

この環境にはWindows PowerShell/C# compilerがないため、Windows CIで実際のAdd-Typeと生成テストを確認する。source copyの当初5変種（終端再確認の追加後は6変種）を各fresh processでcompileし、意図したassert失敗を確認してbytes復元・fresh正常compileを行うvalidatorを追加した。最終結果は下記へ記録する。実OS query・SYSTEM worker起動・capture/input・service/driver導入は行わない。

JS/TSの製品実装・依存・設定の変更はない。baseのsource12041件/810files、root12103件/818filesとsource browser12件の結果を流用し、新差分の全体テスト成功として数えない。新たな検証はWindows生成compile/負例と独立レビューへ絞る。

Cross reviewで同一console内のsignin開始を終端でも拒否するshouldを受け、state/name/tokenの再照会とhandle解放・遷移の生成回帰を追加。OS照会の非atomic性とepoch barrier依存も契約へ明記した。

## Windows CI / 最終点検

Code head0a5978b1d9520ea5b6e21068e185caad9c1ff3d6。Protected CI40600363558 attempt2/job122527649512 PASS2026-10-27T23:14:18Z、Node identity CI40600363647/job122526667036 PASS23:13:03Z。通常compile/生成host/privilege parser/ABI、source copyの6負例、各変種で元bytesの復元を確認し、全6変種が復元された後にfresh compile/正常検証を1回通過。実native queryはしていない。

初回attempt1は既存validate-microphone.ps1が成功markerを出した後にexit5となり、新しいcandidate stepに到達せず失敗。既存mic sourceはこの差分で変更・参照しておらず、直前89b4d21eの同検証は通過済み。失敗jobを1回だけ再実行し、micを含む全stepが通過した。原因は断定せず初回生ログも保持する。

独立taskcheck/API修正再点検とcross/終端再確認差分の再レビューを通過。残るmust/shouldなし。候補の照会は非atomicであり、後続epoch barrierと専用agent/service/routeを完成させるまでは7B/サインアウト後共有の対応完了としない。

### 初回の既存step失敗（生ログ）

```text
boundaries	Generated microphone PCM and private pipe checks (no audio devices)	﻿2026-10-27T23:12:33.2071530Z ##[group]Run scripts/remote-desktop/validate-microphone.ps1
boundaries	Generated microphone PCM and private pipe checks (no audio devices)	2026-10-27T23:12:33.2072053Z [36;1mscripts/remote-desktop/validate-microphone.ps1[0m
boundaries	Generated microphone PCM and private pipe checks (no audio devices)	2026-10-27T23:12:33.2136661Z shell: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE -command ". '{0}'"
boundaries	Generated microphone PCM and private pipe checks (no audio devices)	2026-10-27T23:12:33.2137404Z ##[endgroup]
boundaries	Generated microphone PCM and private pipe checks (no audio devices)	2026-10-27T23:12:33.9747553Z microphone_generated_pcm_checks_passed
boundaries	Generated microphone PCM and private pipe checks (no audio devices)	2026-10-27T23:12:34.3538291Z ##[error]Process completed with exit code 5.

```

### 生成検証・6負例・復元後再コンパイル（生ログ）

```text
boundaries	Generated signed-out candidate checks (no native queries)	﻿2026-10-27T23:14:11.8006954Z ##[group]Run scripts/remote-desktop/validate-signin-candidate.ps1 -NegativeControls
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:11.8007532Z [36;1mscripts/remote-desktop/validate-signin-candidate.ps1 -NegativeControls[0m
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:11.8062934Z shell: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE -command ". '{0}'"
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:11.8063275Z ##[endgroup]
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.2056613Z desktop_signin_candidate_generated_passed
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6035246Z negative state
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6049297Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe signin candidate accepted: WTS state 0" ---> System.InvalidOperationException: Unsafe signin candidate accepted: WTS state 0
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6051317Z    at SodaDesktopSigninCandidateChecks.Reject(String name, Action`1 change)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6053983Z    at SodaDesktopSigninCandidateChecks.Run()
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6056297Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6058703Z    --- End of inner exception stack trace ---
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6061420Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6063887Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6066281Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.6068591Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9505854Z negative token-error
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9509555Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe signin candidate accepted: token query error 0" ---> System.InvalidOperationException: Unsafe signin candidate accepted: token query error 0
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9511274Z    at SodaDesktopSigninCandidateChecks.Reject(String name, Action`1 change)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9513428Z    at SodaDesktopSigninCandidateChecks.Run()
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9515321Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9518120Z    --- End of inner exception stack trace ---
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9520556Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9522641Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9525176Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:12.9527809Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2965423Z negative token-close
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2968383Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Token was leaked or desktop inspected after a present token" ---> System.InvalidOperationException: Token was leaked or desktop inspected after a present token
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2969946Z    at SodaDesktopSigninCandidateChecks.Run()
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2972011Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2973977Z    --- End of inner exception stack trace ---
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2976323Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2978037Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2980562Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.2982639Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6366367Z negative console-after
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6369677Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe signin candidate accepted: console switched during query" ---> System.InvalidOperationException: Unsafe signin candidate accepted: console switched during query
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6373038Z    at SodaDesktopSigninCandidateChecks.Reject(String name, Action`1 change)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6373952Z    at SodaDesktopSigninCandidateChecks.Run()
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6376974Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6379327Z    --- End of inner exception stack trace ---
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6382079Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6384821Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6387449Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.6389734Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9753300Z negative session-after
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9756896Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe signin candidate accepted: user signed in during query" ---> System.InvalidOperationException: Unsafe signin candidate accepted: user signed in during query
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9758297Z    at SodaDesktopSigninCandidateChecks.Reject(String name, Action`1 change)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9760324Z    at SodaDesktopSigninCandidateChecks.Run()
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9762109Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9764449Z    --- End of inner exception stack trace ---
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9766930Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9769138Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9770904Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:13.9773446Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3085593Z negative enabled-privilege
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3088485Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Disabled or removed target privilege accepted" ---> System.InvalidOperationException: Disabled or removed target privilege accepted
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3090243Z    at SodaDesktopSigninCandidateChecks.PrivilegeChecks()
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3092350Z    at SodaDesktopSigninCandidateChecks.Run()
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3094246Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3096127Z    --- End of inner exception stack trace ---
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3098578Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3100320Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3102187Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.3103985Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.6371292Z desktop_signin_candidate_generated_passed
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-27T23:14:14.6388768Z desktop_signin_candidate_negative_controls_passed
```
