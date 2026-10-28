# サインインworker検証記録

Base main1bcd3f6ea2c9a200c71630c5e0146389aa8f2f1a。実SYSTEM/capture/input/login/SCM登録を実行せず、compile・生成facts/Apply sinks・own private markerだけを検証する。

- product headedf3e1be4317cc5274ef810ba1a608d31bbfb630、protected run40720858869/job122931297152 success 2026-10-28T15:57:17Z。
- generated scopeのepoch/PID/creation/session/nonce/120秒/不可逆失効、frame公開/ACK/input seq/1.5秒capture鮮度、callback再入と遅いfactsを検証。
- Native taskcheckでControl release上書き・Input/Publish再入commit・最終read後の鮮度超過を指摘し、state revision/最終状態・clock検査へ修正。own marker deliveryはmessage-only/hiddenordinary双方で実配送とtimeout不可逆を確認し、runtimeWTS/実Sysfactsへの証明には流用しない。
- worker reviewの各Emit鮮度、primary ID/geometry/180度回転、invalidpointer検証順、Unicode down後のexpiry時keyup、成功後held更新を修正。実Applyにfake emit/cleanup/clock/Targetを渡し、3authorized+1sameSourcekeyupとsource変更時cleanup0を区別する。
- 11製品source-copy負例の狙ったInvalidOperationExceptionと元bytes復元・復元後normal成功。固定image verifierはservice/workerの2wrapperだけを公開し任意imageを受け取らない。既存package14負例と通常helper/host/worker全compile・generated suiteもCI成功。
- Node/TSはbase#270から無変更。source12182/816・root12244/824の既存単一全体PASSを継承し、本C#差分の全体JS新規PASSと主張しない。独立build/smokeは別記。
- main/bundle/sealed viewer/controller/installer/UIは未接続。実WinlogonのWTS状態/権限/driver/DPI/入力互換/性能は実機未確認で7B/7完了とはしない。

## Windows生ログ抜粋

```text
boundaries	Generated signin scope and private marker (no capture, input, or service)	2026-10-28T15:56:19.7228883Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin scope and private marker (no capture, input, or service)	2026-10-28T15:56:19.7890865Z signin_scope_private_marker_delivery_and_terminal_timeout_passed
boundaries	Dedicated signin worker compilation and generated data (no worker launch)	2026-10-28T15:56:21.5712660Z signin_worker_generated_data_and_abi_passed
boundaries	Dedicated signin worker compilation and generated data (no worker launch)	2026-10-28T15:56:21.5747178Z signin_worker_compiled_no_execution
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	﻿2026-10-28T15:56:21.6426570Z ##[group]Run scripts/remote-desktop/validate-signin-worker.ps1 -NegativeControls
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:21.6427583Z [36;1mscripts/remote-desktop/validate-signin-worker.ps1 -NegativeControls[0m
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:21.6530591Z shell: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE -command ". '{0}'"
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:21.6531605Z ##[endgroup]
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:22.7413897Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:22.7416748Z signin_worker_generated_data_and_abi_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4198855Z negative control-reentry
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4207799Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Reentrant release was overwritten" ---> System.InvalidOperationException: Reentrant release was overwritten
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4210362Z    at SodaDesktopSigninScopeChecks.Run()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4213876Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4217195Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4221415Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4224523Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4228014Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:23.4231685Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0086039Z negative frame-serial
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0090706Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Replaced frame ticket published" ---> System.InvalidOperationException: Replaced frame ticket published
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0093775Z    at SodaDesktopSigninScopeChecks.Run()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0097315Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0100819Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0104719Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0107787Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0110893Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.0114843Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5613205Z negative frame-age
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5618531Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Stale frame published" ---> System.InvalidOperationException: Stale frame published
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5620581Z    at SodaDesktopSigninScopeChecks.Run()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5623463Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5626910Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5630321Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5632955Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5636076Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:24.5639210Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1122290Z negative drawn-frame
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1127474Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Acknowledgement before publication accepted" ---> System.InvalidOperationException: Acknowledgement before publication accepted
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1130810Z    at SodaDesktopSigninScopeChecks.Run()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1134800Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1137254Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1140879Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1143911Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1146961Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.1149996Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6685451Z negative epoch
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6693843Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Changed signin facts published: epoch" ---> System.InvalidOperationException: Changed signin facts published: epoch
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6696036Z    at SodaDesktopSigninScopeChecks.Run()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6698661Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6701801Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6705757Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6708088Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6711462Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:25.6715001Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2971294Z negative input-permit-age
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2976236Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2980154Z System.Management.Automation.MethodInvocationException: Exception calling "VerifyGeneratedData" with "0" argument(s): "Signin text continued past input freshness" ---> System.InvalidOperationException: Signin text continued past input freshness
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2982378Z    at SodaDesktopSigninWorker.VerifyGeneratedData()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2985258Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2987967Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2991877Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2994805Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.2997852Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.3000608Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8876215Z negative pointer-event
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8881190Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8885037Z System.Management.Automation.MethodInvocationException: Exception calling "VerifyGeneratedData" with "0" argument(s): "Invalid pointer event produced input" ---> System.InvalidOperationException: Invalid pointer event produced input
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8886834Z    at SodaDesktopSigninWorker.VerifyGeneratedData()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8889822Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8892644Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8896112Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8899868Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8902694Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:26.8905999Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5127801Z negative pointer-button
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5131725Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5135347Z System.Management.Automation.MethodInvocationException: Exception calling "VerifyGeneratedData" with "0" argument(s): "Invalid pointer button produced input" ---> System.InvalidOperationException: Invalid pointer button produced input
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5137331Z    at SodaDesktopSigninWorker.VerifyGeneratedData()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5140470Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5142787Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5145813Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5148807Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5151373Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:27.5153823Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1375915Z negative target
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1381605Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1385953Z System.Management.Automation.MethodInvocationException: Exception calling "VerifyGeneratedData" with "0" argument(s): "Changed target was accepted" ---> System.InvalidOperationException: Changed target was accepted
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1387915Z    at SodaDesktopSigninWorker.VerifyGeneratedData()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1391075Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1393902Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1397851Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1400601Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1403569Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.1406370Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7503460Z negative rotation
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7508172Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7511599Z System.Management.Automation.MethodInvocationException: Exception calling "VerifyGeneratedData" with "0" argument(s): "Rotated primary was accepted" ---> System.InvalidOperationException: Rotated primary was accepted
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7513235Z    at SodaDesktopSigninWorker.VerifyGeneratedData()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7515841Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7518322Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7522442Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7525406Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7529496Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:28.7532177Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3628642Z negative unicode-cleanup
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3632587Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3636202Z System.Management.Automation.MethodInvocationException: Exception calling "VerifyGeneratedData" with "0" argument(s): "Unicode keyup cleanup was omitted" ---> System.InvalidOperationException: Unicode keyup cleanup was omitted
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3638837Z    at SodaDesktopSigninWorker.VerifyGeneratedData()
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3642229Z    at CallSite.Target(Closure , CallSite , Type )
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3645648Z    --- End of inner exception stack trace ---
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3649701Z    at System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3652426Z    at System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3656434Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.3658851Z    at System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.9515030Z signin_scope_generated_epoch_expiry_frame_and_input_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.9517644Z signin_worker_generated_data_and_abi_passed
boundaries	Generated signin worker input, topology, and negative controls (no OS input)	2026-10-28T15:56:29.9520066Z signin_worker_11_source_negative_controls_and_restore_passed
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:43.7245050Z negative owner
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:43.7275324Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:44.2476271Z negative canonical
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:44.2480830Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:44.7429795Z negative closed-paths
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:44.7433766Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:45.2537829Z negative file-size
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:45.2542366Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:45.8051548Z negative total-size
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:45.8058389Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:46.3219081Z negative acl-owner
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:46.3223481Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Foreign code owner accepted" ---> System.InvalidOperationException: Foreign code owner accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:46.8489266Z negative acl-write
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:46.8493740Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Foreign code write accepted" ---> System.InvalidOperationException: Foreign code write accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:47.3960908Z negative reparse
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:47.3966137Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package file facts accepted" ---> System.InvalidOperationException: Unsafe package file facts accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:47.9420639Z negative links
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:47.9424893Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe package file facts accepted" ---> System.InvalidOperationException: Unsafe package file facts accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:48.4748886Z negative file-id
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:48.4753003Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Changed package file accepted" ---> System.InvalidOperationException: Changed package file accepted
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:48.9844701Z negative share-write
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:48.9849434Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Package write share unexpectedly allowed" ---> System.InvalidOperationException: Package write share unexpectedly allowed
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:49.4830050Z negative share-delete
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:49.4835018Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Package delete share unexpectedly allowed" ---> System.InvalidOperationException: Package delete share unexpectedly allowed
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:49.9834377Z negative failure-cleanup
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:49.9838802Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Native failure leaked a handle" ---> System.InvalidOperationException: Native failure leaked a handle
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:50.4869955Z negative group-cleanup
boundaries	Generated package data, ACL, and ordinary temporary file handle checks	2026-10-28T15:56:50.4875374Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Native failure leaked a handle" ---> System.InvalidOperationException: Native failure leaked a handle
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:56:53.7312011Z negative private-runtime
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:56:53.7337176Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Foreign runtime read accepted" ---> System.InvalidOperationException: Foreign runtime read accepted
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:56:54.2285532Z negative parent-environment
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:56:54.2290934Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Parent environment retained" ---> System.InvalidOperationException: Parent environment retained
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:56:54.8368594Z negative post-create-revocation
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:56:54.8373880Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Post-create revocation accepted" ---> System.InvalidOperationException: Post-create revocation accepted
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:56:55.3899830Z negative handle-inheritance
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:56:55.3905224Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Unexpected handle inherited" ---> System.InvalidOperationException: Unexpected handle inherited
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:57:00.9625008Z negative job-membership
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:57:00.9634561Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Grandchild not owned by job" ---> System.InvalidOperationException: Grandchild not owned by job
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:57:01.5467857Z negative job-accounting
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T15:57:01.5472735Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Descendant cleanup failed" ---> System.InvalidOperationException: Descendant cleanup failed
boundaries	Existing generated monitor checks	2026-10-28T15:57:07.7388064Z desktop_monitor_checks_passed: fake mixed-scale/negative topology, gaps, selection, reorder, hotplug/scale revoke, limits; no real screen/input/clipboard/OS configuration
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:11.9072671Z negative state
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:11.9091592Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe signin candidate accepted: WTS state 0" ---> System.InvalidOperationException: Unsafe signin candidate accepted: WTS state 0
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:12.3599591Z negative token-error
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:12.3604222Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe signin candidate accepted: token query error 0" ---> System.InvalidOperationException: Unsafe signin candidate accepted: token query error 0
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:12.8072320Z negative token-close
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:12.8077619Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Token was leaked or desktop inspected after a present token" ---> System.InvalidOperationException: Token was leaked or desktop inspected after a present token
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:13.2734248Z negative console-after
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:13.2740300Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe signin candidate accepted: console switched during query" ---> System.InvalidOperationException: Unsafe signin candidate accepted: console switched during query
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:13.7387846Z negative session-after
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:13.7393835Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Unsafe signin candidate accepted: user signed in during query" ---> System.InvalidOperationException: Unsafe signin candidate accepted: user signed in during query
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:14.1764221Z negative enabled-privilege
boundaries	Generated signed-out candidate checks (no native queries)	2026-10-28T15:57:14.1769410Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "0" argument(s): "Disabled or removed target privilege accepted" ---> System.InvalidOperationException: Disabled or removed target privilege accepted
```

## 独立検証/PRの結果

独立checkはproduct headedf3e1beでfrozen install/build/smoke成功、clean。Native taskcheck/worker crossと全修正差分の再点検はmust/shouldなし。PR #271の同head protected40721619757/job122933763673は2026-10-28T16:01:25Z成功、Node identity40721619632/job122933762431は16:02:55Z成功。先行push CIとPR CIは区別し二重の全体JS testとして計上しない。WIP用push branch指定は最終workflowで除き、以後は既存pull_request path条件を使う。

Tokenの複製/実sessionへのCreateProcessAsUser/実GDI/実SendInputはsourceとABIの点検・compileのみで、成功を実証したとはしない。main/sealed viewerからの接続・controller/installer/UIと実機確認は後続。
