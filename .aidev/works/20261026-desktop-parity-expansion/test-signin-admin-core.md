# 7B4b1 verification

Scope is administration data/policy and native journal/lifecycle foundations only. No admin startup or normal-network wiring is added. A future adapter must authenticate local administration and verify all private path/ACL/mutex/quiescence facts; these classes alone do not provide that authority. No actual service, installed file, SYSTEM Main, keys/trust, desktop/input/audio device or handoff was exercised.

Request related56 PASS and8 actual source-negative controls, exact bytes restored. Initial run in the fresh worktree had missing protocol dist (no tests); protocol build then all56 PASS. Request lease uses wall and monotonic bounds, backward-clock/reentry/callback cancellation latches and at-most-once take; token is redacted from JSON/inspect.

Windows generated crypto/envelope5 source-copy controls PASS; journal5 controls PASS (actual ordinary temporary files, replacement and hardlink rejection, interrupted ack); host9 controls PASS (ordinary generated processes only, barrier write/delete/exclusive refusal and real exit0/7); worker compilation/generated27 controls PASS. First host run after finite-child checks failed the harness because existing job-accounting control reached the new finite-child assertion before the old descendant assertion. Updated the expected intended accounting assertion, reran all9 controls successfully. No compiler error/generic failure is counted as a successful negative. All temporary source-copy bytes restored.

The journal uses same-directory non-replacing MoveFileExW with WRITE_THROUGH and flushed stage bytes. API behavior was checked against [Microsoft MoveFileExW documentation](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw). Generated interruption tests verify recovery state; no power-loss test or storage-hardware durability guarantee is claimed.

Independent taskchecks/cross: request/crypto and journal core/lifecycle reviewed in separate contexts; all must/should resolved. Remaining integration responsibilities are explicit in tasks-signin-management.md and design-signin-admin.md.

Final whole tests, external smoke, CI and merge pending.

## Request source control owner

```text
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSigninAdminRequest.test.ts:18:105


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Request source control nonce

```text
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSigninAdminRequest.test.ts:18:105


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Request source control ttl

```text
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSigninAdminRequest.test.ts:18:105


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Request source control one-attempt

```text
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSigninAdminRequest.test.ts:8:503


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Request source control monotonic-expiry

```text
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninAdminRequest.test.ts:22:35


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Request source control reentry

```text
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninAdminRequest.test.ts:22:35


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Request source control residue

```text
AssertionError: expected 'normal' to be 'recovery' // Object.is equality

Expected: "recovery"
Received: "normal"

 ❯ src/desktop/DesktopSigninAdminRequest.test.ts:24:222


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
```

## Request source control malformed

```text
AssertionError: expected 'normal' to be 'recovery' // Object.is equality

Expected: "recovery"
Received: "normal"

 ❯ src/desktop/DesktopSigninAdminRequest.test.ts:25:230


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯


 Test Files  1 failed (1)
```

## native-admin source controls (raw assertions)

```text
negative nonce
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Admin nonce binding omitted" ---> System.InvalidOperationException: Admin nonce binding omitted
negative owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Admin owner binding omitted" ---> System.InvalidOperationException: Admin owner binding omitted
negative domain
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Admin cipher accepted by enrollment domain" ---> System.InvalidOperationException: Admin cipher accepted by enrollment domain
negative envelope-canonical
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Admin envelope noncanonical fields accepted" ---> System.InvalidOperationException: Admin envelope noncanonical fields accepted
negative envelope-owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Admin envelope owner mismatch accepted" ---> System.InvalidOperationException: Admin envelope owner mismatch accepted
```

## native-journal source controls (raw assertions)

```text
negative claim-identity
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Replaced pending identity was dispatched" ---> System.InvalidOperationException: Replaced pending identity was dispatched
negative residue
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Claim accepted journal residue" ---> System.InvalidOperationException: Claim accepted journal residue
negative claim-digest
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Result accepted changed claim digest" ---> System.InvalidOperationException: Result accepted changed claim digest
negative ack-before-cleanup
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Ack was not published before original removal" ---> System.InvalidOperationException: Ack was not published before original removal
negative partial-stage
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Partial stage entered normal sharing" ---> System.InvalidOperationException: Partial stage entered normal sharing
```

## native-host-final source controls (raw assertions)

```text
negative quiescence-marker
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Invalid quiescence marker accepted" ---> System.InvalidOperationException: Invalid quiescence marker accepted
negative quiescence-write-share
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Live quiescence lease allowed writes" ---> System.InvalidOperationException: Live quiescence lease allowed writes
negative finite-exit-code
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Finite child exit code was ignored" ---> System.InvalidOperationException: Finite child exit code was ignored
negative private-runtime
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Foreign runtime read accepted" ---> System.InvalidOperationException: Foreign runtime read accepted
negative parent-environment
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Parent environment retained" ---> System.InvalidOperationException: Parent environment retained
negative post-create-revocation
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Post-create revocation accepted" ---> System.InvalidOperationException: Post-create revocation accepted
negative handle-inheritance
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unexpected handle inherited" ---> System.InvalidOperationException: Unexpected handle inherited
negative job-membership
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Grandchild not owned by job" ---> System.InvalidOperationException: Grandchild not owned by job
negative job-accounting
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Finite child cleanup failed" ---> System.InvalidOperationException: Finite child cleanup failed
```

## native-final source controls (raw assertions)

```text
negative context-route
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Context route accepted other purpose" ---> System.InvalidOperationException: Context route accepted other purpose
negative control-reentry
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Reentrant release was overwritten" ---> System.InvalidOperationException: Reentrant release was overwritten
negative frame-serial
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Replaced frame ticket published" ---> System.InvalidOperationException: Replaced frame ticket published
negative frame-age
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Stale frame published" ---> System.InvalidOperationException: Stale frame published
negative drawn-frame
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Acknowledgement before publication accepted" ---> System.InvalidOperationException: Acknowledgement before publication accepted
negative epoch
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Changed signin facts published: epoch" ---> System.InvalidOperationException: Changed signin facts published: epoch
negative input-permit-age
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Signin text continued past input freshness" ---> System.InvalidOperationException: Signin text continued past input freshness
negative pointer-event
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Invalid pointer event produced input" ---> System.InvalidOperationException: Invalid pointer event produced input
negative pointer-button
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Invalid pointer button produced input" ---> System.InvalidOperationException: Invalid pointer button produced input
negative target
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Changed target was accepted" ---> System.InvalidOperationException: Changed target was accepted
negative rotation
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Rotated primary was accepted" ---> System.InvalidOperationException: Rotated primary was accepted
negative unicode-cleanup
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Unicode keyup cleanup was omitted" ---> System.InvalidOperationException: Unicode keyup cleanup was omitted
negative broker-utf8-output
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Broker UTF8 output changed" ---> System.InvalidOperationException: Broker UTF8 output changed
negative broker-utf8-input
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Broker UTF8 input changed" ---> System.InvalidOperationException: Broker UTF8 input changed
negative presence-source-latch
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence source revived" ---> System.InvalidOperationException: Presence source revived
negative presence-commands
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence accepted non-observer command" ---> System.InvalidOperationException: Presence accepted non-observer command
negative presence-callback-age
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence callback extended deadline" ---> System.InvalidOperationException: Presence callback extended deadline
negative presence-backward
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence backward clock accepted" ---> System.InvalidOperationException: Presence backward clock accepted
negative presence-reentry
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Reentrant presence publication accepted" ---> System.InvalidOperationException: Reentrant presence publication accepted
negative presence-clock-fault
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence clock exception revived" ---> System.InvalidOperationException: Presence clock exception revived
negative presence-capture-route
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence dispatched capture" ---> System.InvalidOperationException: Presence dispatched capture
negative presence-cleanup-route
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence dispatched input cleanup" ---> System.InvalidOperationException: Presence dispatched input cleanup
negative presence-command-route
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence route accepted active command" ---> System.InvalidOperationException: Presence route accepted active command
negative inactive-classification
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Inactive candidate was not classified" ---> System.InvalidOperationException: Inactive candidate was not classified
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Inactive worker exited before broker authentication" ---> System.InvalidOperationException: Inactive worker exited before broker authentication
negative inactive-viewer-denial
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Viewer inactive promoted to presence" ---> System.InvalidOperationException: Viewer inactive promoted to presence
negative inactive-publication
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Inactive result not published before wait" ---> System.InvalidOperationException: Inactive result not published before wait
```
