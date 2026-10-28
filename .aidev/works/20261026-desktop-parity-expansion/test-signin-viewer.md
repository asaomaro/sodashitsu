# 7B3b signin viewer verification

Scope: generated identities, real loopback sealed transport and browser DOM/pixels; fake native process/stop/clock/input sinks; Windows compile/ABI/generated data. No installed service, SYSTEM Main, desktop capture, SendInput, user credentials, real endpoint key/trust or device changes.

- Final source build and typecheck: PASS.
- Endpoint/process/protocol: 35 PASS (10 + 22 + 3).
- Browser: 2 PASS, 13.5s; +/-5 minute wall-clock skew, view/input ceilings, no pixels or worker before consent, generated green pixel after consent, fresh consent after reconnect, cancel, saved shared source does not expose unsupported signin sharing text.
- Windows generated scope/worker checks and 13 source-copy negative controls: PASS, restored exact bytes. Explicit broker UTF-8 Japanese input/output checks included.
- 6 Node product-source negative controls: intended AssertionError each; exact product bytes restored; restored related 35 PASS. Browser deadline clock mutation: intended status AssertionError after rebuilding product; exact Vue bytes restored and web rebuilt. Restored browser rerun pending final receipt.
- Read-only independent taskchecks/cross: pointer process/native UTF-8, transfer endpoint/protocol/UI; relative-TTL clock skew and shared-only descriptions fixed; fixes delta and cross have no remaining must/should.
- All-file root preflight: 15 own files; root-specific docs/index/Vue changes preserved by guarded three-way merge. No root reset/switch/commit.
- Final source/root full suites, external-worktree smoke, CI and merge receipts: pending.

Earlier whole run overlapped the relative-TTL edit and retained the old built offer schema in a worker (8 offer-schema failures); it also had an unrelated soda PTY integration failure. It is not a final verification result. Final frozen-source run is recorded separately below. Initial browser fixture failures (invalid generated PNG and clicking a folded settings button) were fixed in the test fixture.

## Product-source negative output

### utf8-trailer

```text
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined
```

### input-ledger

```text
AssertionError: expected "vi.fn()" to be called once, but got 0 times
```

### input-quota

```text
AssertionError: expected "vi.fn()" to be called once, but got 0 times
```

### factory-reservation

```text
AssertionError: promise resolved "{ started: true }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "started": true,
  }
```

### fatal-stop

```text
AssertionError: promise resolved "{ started: true }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "started": true,
  }
```

### waiting-heartbeat

```text
AssertionError: expected "vi.fn()" to be called once, but got 0 times
```

### browser clock

```text
Error: expect(locator).toHaveText(expected) failed

    Locator:  locator('[data-remote-desktop]').locator('[data-desktop-status]')
    Expected: "サインイン画面・閲覧中"
    Received: "サインイン画面への接続許可を待っています"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveText" locator('[data-remote-desktop]').locator('[data-desktop-status]') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').locator('[data-desktop-status]')
        14 × locator resolved to <span data-v-07993db0="" data-desktop-status="">サインイン画面への接続許可を待っています</span>
           - unexpected value "サインイン画面への接続許可を待っています"


      50 |   await expect(consent.getByRole("button",
```

### Native UTF-8

```text
negative broker-utf8-output
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Broker UTF8 output changed" ---> System.InvalidOperationException: Broker UTF8 output changed
negative broker-utf8-input
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "VerifyGeneratedData" を呼び出し中に例外が発生しました: "Broker UTF8 input changed" ---> System.InvalidOperationException: Broker UTF8 input changed
signin_worker_13_source_negative_controls_and_restore_passed
```
