# 7B3d dedicated signin startup verification

JavaScript product at 24aa2d37 is fixed for whole checks; the later C# CI correction is recorded below. Generated data only: no installed SYSTEM Main/service, actual desktop capture/OS input, user keys/trust, certificates or real enrollment were changed.

- Related 69 PASS: presence21/runtime20/native facade23/bundle1/window parser4.
- Actual Runtime → Root delegation/finite RPC → readonly generated identity → sealed browser viewer E2E: 2 PASS (source/policy revocation, 9.3s); restored product rerun 2 PASS (9.4s). Consent DOM, green image pixels and cleared pixels after source end or external generated-store revocation observed in browser. Native presence/vault/capture are explicit fake edges; not real SYSTEM evidence.
- Windows build-signin-worker ValidateOnly compile/generated/ABI PASS; final source-copy negative controls 26 PASS, exact bytes restored. Candidate inactive waits for first command, whose broker pump starts only after live PID/pipe auth. Viewer unavailable receives its real configure shape but never capture/input.
- 4 old-product regressions PASS as intended AssertionErrors (pulse callback expiry, oldest policy snapshot, initial snapshot, late connector cleanup), exact bytes restored. Old header plus rebuilt web fails the visible entry assertion; exact Vue bytes restored and product rebuilt.
- Build/typecheck/bundle PASS. Final source full: 12,261 PASS / 822 files, single PASS (357.16s). Root full: 12,323 PASS / 830 files, single PASS (356.63s); serial after source whole. External/CI receipts follow.
- Independent taskchecks/cross/fixes deltas: no residual must/should. Found/fixed prior-pulse TTL reentry, old policy snapshot completion re-aging, late connector close and inactive PID-auth race. Final configure validation delta also clear.
- Guarded root reflection: 21 own files, existing custom remote-desktop docs preserved via 3-way merge. No root reset/switch/commit. Root install/build/typecheck/bundle PASS; root full12,323 PASS and browser2 PASS (9.5s).

Early generated integration exposed the missing workspace-independent entry: Root delegation was online, but selecting the signed-out machine could not create a workspace-bound native tab. The real machine-header popup and strict plain desktop launch fix this while retaining the finite four remote RPCs. Initial Vue narrowing/optional-prop type errors were fixed before the final checks. These preliminary failures are not passing evidence.

## Old product negative output

### pulse-callback

```text
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true
```

### policy-snapshot

```text
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true
```

### initial-snapshot

```text
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "active": [Function active],
        "enrollment": Object {
          "purpose": "desktop-signin",
          "version": 1,
        },
        "handlers": Object {
          "capabilities": [Function capabilities],
          "clientGone": [Function clientGone],
          "hello": [Function hello],
          "start": [Function start],
          "status": [Function status],
        },
        "signal": AbortSignal {
          Symbol(kEvents): Map {},
          Symbol(events.maxEventTargetListeners): 0,
          Symbol(events.maxEventTargetListenersWarned): false,
          Symbol(kHandlers): Map {},
          Symbol(kAborted): false,
          Symbol(kReason): undefined,
          Symbol(kComposite): false,
        },
      },
    ]


Number of calls: 1
```

### late-connector

```text
AssertionError: expected "vi.fn()" to be called at least once
```

### old header

```text
Error: expect(locator).toBeVisible() failed

    Locator: locator('[data-machine-id="9d0c5881cc1147c868f22ca5dd429947"]').getByRole('button', { name: 'Generated readonly signin のデスクトップを別窓で開く', exact: true })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" locator('[data-machine-id="9d0c5881cc1147c868f22ca5dd429947"]').getByRole('button', { name: 'Generated readonly signin のデスクトップを別窓で開く', exact: true }) with timeout 5000ms
      - waiting for locator('[data-machine-id="9d0c5881cc1147c868f22ca5dd429947"]').getByRole('button', { name: 'Generated readonly signin のデスクトップを別窓で開く', exact: true })


      32 |  }
      33 |  try{
    > 34 |   start();await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"
```

### Native inactive guards

```text
negative inactive-classification
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Inactive candidate was not classified" ---> System.InvalidOperationException: Inactive candidate was not classified
negative inactive-auth-wait
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Inactive worker exited before broker authentication" ---> System.InvalidOperationException: Inactive worker exited before broker authentication
negative inactive-viewer-denial
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Viewer inactive promoted to presence" ---> System.InvalidOperationException: Viewer inactive promoted to presence
negative inactive-publication
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Inactive result not published before wait" ---> System.InvalidOperationException: Inactive result not published before wait
signin_worker_26_source_negative_controls_and_restore_passed
```

## C# pipe completion correction after first CI

First PR #274 product run: Node identity 40743779361 PASS; protected-boundary run40743779491 failed after `microphone_generated_pcm_checks_passed` with process exit5. Local old microphone checks also printed PASS but exited2, including an explicit PowerShell exit0 trial. That PowerShell-only change did not fix it and was reverted; it is not part of the product fix.

Old audio/microphone APM paths could close a borrowed AsyncWaitHandle and omit End* when cancelled/timed out. Completion callbacks now own exactly-once End and fault observation; permission/deadline checks still reject late values. Sys signin broker uses FromAsync for the same wait lifetime. Completion-owned cleanup clears late cancelled Mic bytes and Audio write buffers. Caller thread stop is not claimed to prove all kernel I/O already completed; cleanup follows End.

This follows the [BeginRead/EndRead resource contract](https://learn.microsoft.com/en-us/dotnet/api/system.io.stream.beginread?view=netframework-4.8) and [AsyncWaitHandle lifetime](https://learn.microsoft.com/en-us/dotnet/api/system.iasyncresult.asyncwaithandle?view=netframework-4.8.1). No real devices/input/capture are used.

Final Windows generation: audio three fresh processes PASS/exit0, microphone three fresh processes PASS/exit0. Old APM-body temp-copy mutation and completion-cleanup removal each fail their intended InvalidOperationException; product bytes remain unchanged. Sys signin compile/generated/26 negative controls PASS after FromAsync change. Audio generated checks added to CI. Independent C# taskcheck/cross and cleanup delta have no remaining must/should.

C#-only product correction; JS source and tests remain the frozen baseline (source12,261/root12,323 single PASS). No new JS whole PASS is claimed for this native-only delta. Corrected CI results are recorded below.

```text
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Pending pipe wait handle closed or End omitted" ---> System.InvalidOperationException: Pending pipe wait handle closed or End omitted
   場所 SodaMicrophoneChecks.PendingCancellation()
   場所 SodaMicrophoneChecks.Run()
   場所 CallSite.Target(Closure , CallSite , Type )
```
```text
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Late cancelled pipe bytes retained" ---> System.InvalidOperationException: Late cancelled pipe bytes retained
   場所 SodaMicrophoneChecks.LateBufferCleanup()
   場所 SodaMicrophoneChecks.Run()
   場所 CallSite.Target(Closure , CallSite , Type )
```

## Frozen independent worktree and corrected product CI

Independent worktree at24aa2d37: frozen install/build/bundle/smoke PASS, git clean. Native-only a4af2c9d delta fast-forwarded into it; JS product bytes unchanged. C# private-pipe correction validated separately as above, rather than duplicating JS whole tests.

Corrected a4af2c9d CI: protected boundaries40750258487/job123034789110 PASS2026-10-28T19:01:15Z (includes new audio step and microphone), Node identity40750258383/job123034790336 PASS19:01:52Z. Final documentation-head CI and merge receipts follow in deployment records.
