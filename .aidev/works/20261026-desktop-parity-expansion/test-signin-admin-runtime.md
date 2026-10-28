# 7B4b2: local administration adapters and dispatch verification

Scope: local barrier FD ownership, fixed protected mailbox reader, six-operation finite engine, optional store write lease, native public result/deadline validation and fixed result writer. No mutable backend, native identity/enrollment commit guard, package activation, main/admin startup, SCM controller or installer is enabled. Those remain next tasks. No real SYSTEM Main, installed/private user state, keys/trust, service, desktop/input/audio devices or A/B handoff was exercised. Store tests use generated temporary identities only.

Related77 PASS (local lease13, mailbox19, engine18, result writer13, store-related14). Independent taskchecks and full cross in separate contexts: pointer/transfer, no final must/should. Writer callback-after-close should fixed by rechecking done after liveness callbacks (reader too), with synchronous-close regression.

Actual old1069bed6 Store source produces intended AssertionErrors; exact current source restored. Six engine product-source controls, writer2 and reader1 source controls produce intended AssertionErrors; all exact bytes restored. Raw evidence below.

Windows native public result/deadline8 source-copy controls PASS (generated JSON/clocks/owner callbacks only). Journal6 controls PASS (ordinary temporary files), including the new read-only claimed-request inspection and refusal after result residue. Parser validation covers all three fixed PS helper scripts without executing them. Initial reentry-negative test had an unbounded recursive callback causing a generic child/CLIXML failure; bounded one reentry and reran all8 intended assertions. First journal inspection control guard matched two source locations; made the new inspection condition unique and reran all6 controls. Neither harness failure is accepted as a successful control. Temporary source-copy bytes restored.

Engine tracks pending operations and bounds each5s plus teardown8s; unconfirmed stop terminates the dedicated process. Incomplete result explicitly permits partial prior changes, never promises rollback or replays; unknown result write is not retried. Backend must enforce the lease at actual identity/enrollment persistence before this engine is connected. Native result writer revalidates the actual encrypted claimed owner/nonce/digest/deadline and rebuilds only closed public result fields.

Build/typecheck/bundle, whole tests, external smoke, final CI and delivery pending.

## Actual product-source control store

```text
AssertionError: promise resolved "{ fingerprint: '7b45eebbf7abdc9d3d09…' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "fingerprint": "7b45eebbf7abdc9d3d0920479e798c501153262e8527feeb866aed3dee426763",
  }

 ❯ src/desktop/DesktopEndpointWritePermit.node.test.ts:11:151
```

## Actual product-source control engine-trust

```text
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "data": Array [
          0,
          0,
          0,
```

## Actual product-source control engine-owner

```text
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/desktop/DesktopSigninAdministration.test.ts:19:305

```

## Actual product-source control engine-pending

```text
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninAdministration.test.ts:23:319


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  05:16:34
   Duration  586ms (transform 73%, import 24%, tests 2%, worker 1%)

```

## Actual product-source control engine-late-backend

```text
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninAdministration.test.ts:20:261


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  05:16:36
   Duration  744ms (transform 75%, import 23%, tests 2%)

```

## Actual product-source control engine-peer-limit

```text
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "fingerprint": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "label": "Generated viewer",
        "role": "viewer",
      },
```

## Actual product-source control engine-result-retry

```text
AssertionError: expected "vi.fn()" to be called once, but got 2 times
 ❯ src/desktop/DesktopSigninAdministration.test.ts:25:206


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  05:16:38
   Duration  692ms (transform 72%, import 26%, tests 2%)

```

## Actual product-source control writer-exit

```text
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/desktop/DesktopSigninAdminResult.node.test.ts:12:322

```

## Actual product-source control writer-reentry

```text
AssertionError: expected Buffer[ 0, 0, 0, 0, 0, 0, 0, 0, …(23) ] to be null

- Expected:
null

+ Received:
Buffer [
  0,
  0,
  0,
  0,
  0,
```

## Actual product-source control reader-exit

```text
AssertionError: promise resolved "{ kind: 'normal' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "kind": "normal",
  }

 ❯ src/desktop/DesktopSigninAdminMailbox.node.test.ts:17:64
```

## native-execution source controls (raw assertions)

```text
negative wall
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native wall expiry accepted" ---> System.InvalidOperationException: Native wall expiry accepted
negative monotonic
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native monotonic expiry accepted" ---> System.InvalidOperationException: Native monotonic expiry accepted
negative owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native owner loss accepted" ---> System.InvalidOperationException: Native owner loss accepted
negative reentry
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native reentrant deadline accepted" ---> System.InvalidOperationException: Native reentrant deadline accepted
negative result-nonce
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native result accepted other nonce" ---> System.InvalidOperationException: Native result accepted other nonce
negative result-secret
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native result accepted secret field" ---> System.InvalidOperationException: Native result accepted secret field
negative result-role
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native result promoted agent role" ---> System.InvalidOperationException: Native result promoted agent role
negative result-peers
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native result accepted ninth peer" ---> System.InvalidOperationException: Native result accepted ninth peer
```

## native-journal source controls (raw assertions)

```text
negative claim-inspection
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Claim inspection accepted completed result residue" ---> System.InvalidOperationException: Claim inspection accepted completed result residue
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
