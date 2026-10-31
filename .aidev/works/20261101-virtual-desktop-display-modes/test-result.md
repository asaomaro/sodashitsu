# 検証

- Windows C#実コンパイル、純生成virtual broker/preflight、Fake Driverの既存physical Leaseとowned virtual mode成功。実capture/input/service/driver/OS変更なし。
- source、元deadline、対象monitor、owned照合後deadlineの4 guardを私有copyで一つずつ破壊→意図assertion失敗→復元成功。製品source bytes不変。
- taskcheckのmust: owned照合前の古い採時を使う問題を修正。Apply直前のowned callbackで元期限へ進めApply0をassert。旧順序へ戻す負例でApply1を検出する。
- Nodeの同寸法2viewer/異寸法拒否/残ったviewer描画継続と、別resize許可欠落の2件成功。UI/共有capture93件成功。
- Browser1件成功: 2windowが明示1920×1080に参加、actual canvas幅/高さ/pixels/共有mode configureを確認。別解像度へjoin失敗しても既存windowが同じ1920×1080で継続し、新しいframe描画を確認。
- validate-display-lease.ps1が単独実行時に既存Unlock依存を不足していたため依存source/refを追加。これは退行の負例として数えない。
- build/typecheck成功。独立taskcheck/cross完了、must解消。crossのUI説明shouldはvirtual時の終了後削除・解放へ分岐して解消。

## 私有copy負例の生出力

```text
virtual_desktop_preflight_guard_passed: fake normal/secure guards; no native device or desktop APIs
owned_virtual_mode_checks_passed: exact source, original deadline, rollback, no orphan restoration guardian; fake driver only
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
negative owned-source
virtual_desktop_preflight_guard_passed: fake normal/secure guards; no native device or desktop APIs
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Virtual mode source/budget guard missing: modes" ---> System.Exception: Virtual mode source/budget guard missing: modes
   場所 SodaDesktopTests.DisplayModeChecks.VirtualModes()
   場所 SodaDesktopTests.DisplayModeChecks.Run()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative original-budget
virtual_desktop_preflight_guard_passed: fake normal/secure guards; no native device or desktop APIs
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Virtual mode source/budget guard missing: deadline" ---> System.Exception: Virtual mode source/budget guard missing: deadline
   場所 SodaDesktopTests.DisplayModeChecks.VirtualModes()
   場所 SodaDesktopTests.DisplayModeChecks.Run()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative exact-monitor
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyVirtualDesktopGuard" を呼び出し中に例外が発生しました: "Virtual resize escaped the owned monitor" ---> System.InvalidOperationException: Virtual resize escaped the owned monitor
   場所 SodaDesktopHost.VerifyVirtualDesktopGuard()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative post-query-budget
virtual_desktop_preflight_guard_passed: fake normal/secure guards; no native device or desktop APIs
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Virtual mode committed after source/budget loss: scope-query-deadline" ---> System.Exception: Virtual mode committed after source/budget loss: scope-query-deadline
   場所 SodaDesktopTests.DisplayModeChecks.VirtualModes()
   場所 SodaDesktopTests.DisplayModeChecks.Run()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
virtual_desktop_preflight_guard_passed: fake normal/secure guards; no native device or desktop APIs
owned_virtual_mode_checks_passed: exact source, original deadline, rollback, no orphan restoration guardian; fake driver only
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
virtual_modes_4_source_negative_controls_and_restore_passed

```
