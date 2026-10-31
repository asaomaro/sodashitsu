# 生成検証

- C#実コンパイルと純生成ScopeChecks: Windows PowerShell経由で成功。実capture/input/service起動なし。native scope/元の予算/stdout gate/commitの検査を追加。
- Source/許可/元deadline guardを一時コピーで壊して意図したassertion失敗→復元成功、製品C#source bytes不変。初回harnessの定数falseによるコンパイル警告とPowerShell出力折返しの判定は回帰の失敗として数えず修正した。
- 既存Relay/Protected/feature 295件成功。追加real Provider capの交渉3件（feature有/無/許可失効）成功。nativeCadence:trueの実capから禁止optionを送らないことと、H264 stream→source終了まで確認。直結Bへのaudio/UDP/HEVC拒否もnative engine到達前に確認。
- Browser 2件成功（default/UAC）。生成H264のactual pixels、frames増分、scope変更後のdecoder全閉鎖を確認。OS保護画面を実取得したものではない。
- 独立taskcheckでnativeCadence自動付与のmustを修正し、実cap回帰と再点検で解消。独立crossも追加must/shouldなし。

## 最終portable C#負例の生出力

同じ検査をWindows/CIで使うvalidate-protected-video.ps1へ取り込み、最新C#で再実行成功。各子processはAdd-Typeと純生成ScopeChecksだけで、実encoder/deviceは使わない。

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_native_output_passed: generated native frame scope, local proof, original budget and output commit
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only
negative native-scope
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Protected native frame survived scope transition while queued" ---> System.Exception: Protected native frame survived scope transition while queued
   場所 SodaDesktopHost.VerifyProtectedNativeOutput(Func`1 current, Func`1 capture, Func`2 publish, Action transition)
   場所 SodaDesktopProtectedScopeChecks.Run()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative native-deadline
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Expired protected native frame published" ---> System.Exception: Expired protected native frame published
   場所 SodaDesktopHost.VerifyProtectedNativeOutput(Func`1 current, Func`1 capture, Func`2 publish, Action transition)
   場所 SodaDesktopProtectedScopeChecks.Run()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative native-permission
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Protected native video local flag missing" ---> System.Exception: Protected native video local flag missing
   場所 SodaDesktopHost.VerifyProtectedNativeOutput(Func`1 current, Func`1 capture, Func`2 publish, Action transition)
   場所 SodaDesktopProtectedScopeChecks.Run()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_native_output_passed: generated native frame scope, local proof, original budget and output commit
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only
protected_video_3_source_negative_controls_and_restore_passed

```

最新WindowsDesktopHost.cs SHA256: 11d17755be2618d7fa51459e4963a9564abb4f2d62fb6d9adaf6b67c46f82b74
