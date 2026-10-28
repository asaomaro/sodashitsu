# 7B3c readonly presence verification

Validation uses generated clocks/facts/commands and fake capture/release callbacks only. No privileged Main, token/session queries, service install, actual capture or OS input is executed.

The first generated run passed before routing coverage was added. A later compile caught a generated local-name collision with existing DEVMODE test; renamed it. A negative-control guard matched two clock checks; narrowed it to the actual post-source check before accepting a result. These failed harness runs are not passing product evidence.

Final Windows generated/ABI/22 source-copy controls: PASS, exact source-copy bytes restored; 13 inherited guards plus 9 new presence/routing guards.
Independent taskchecks: no must. Clock exception terminal-latch should and actual routing-coverage should addressed; fixes delta/cross: no remaining must/should (pointer and transfer).

TypeScript/runtime source remains the 9ed557f2 viewer baseline; whole JS tests are not repeated for this C#-only product delta. Build lists and native helper changed, so Windows compile/generated checks and CI are required.

A first reentry mutation removed the only read of a private field and hit a compiler warning. It was not accepted as regression evidence; the mutation now preserves a value read while disabling the actual reentry check, and fails the intended InvalidOperationException. The final complete 22-control run passes and restores exact bytes.

## Final native negative output (new presence/routing cases)

```text
negative presence-source-latch
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Presence source revived" ---> System.InvalidOperationException: Presence source revived
negative presence-commands
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Presence accepted non-observer command" ---> System.InvalidOperationException: Presence accepted non-observer command
negative presence-callback-age
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Presence callback extended deadline" ---> System.InvalidOperationException: Presence callback extended deadline
negative presence-backward
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Presence backward clock accepted" ---> System.InvalidOperationException: Presence backward clock accepted
negative presence-reentry
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Reentrant presence publication accepted" ---> System.InvalidOperationException: Reentrant presence publication accepted
negative presence-clock-fault
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Presence clock exception revived" ---> System.InvalidOperationException: Presence clock exception revived
negative presence-capture-route
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Presence dispatched capture" ---> System.InvalidOperationException: Presence dispatched capture
negative presence-cleanup-route
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Presence dispatched input cleanup" ---> System.InvalidOperationException: Presence dispatched input cleanup
negative presence-command-route
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Presence route accepted active command" ---> System.InvalidOperationException: Presence route accepted active command
signin_worker_22_source_negative_controls_and_restore_passed
```

Windows `build-signin-worker.ps1 -ValidateOnly -OwnerSid S-1-5-21-1-2-3-1001`: PASS, `signin_worker_compiled_no_execution`. Final script/docs delta independently reviewed; no must/should.

Frozen product 400b51fd CI: Protected desktop boundaries run40735757062/job122983717318 PASS2026-10-28T17:28:01Z; Node identity run40735756716/job122983707921 PASS17:28:23Z. Main merge/root reflection are recorded in the deployment receipt.
