# Native worker generated validation — 2026-10-30 JST

Scope: internal one-operation native process, pump and exit journal. No browser/local gateway, B selection/wire/input release integration or actual Explorer drag is connected. The NativeDriver, NativeDragBackend desktop/OLE and product Global slot are compiled but not activated. N2 public routes/N3 browser integration remain unchecked.

## Windows positives

The four framework validators (`validate-native-drag-lease/pump/slot/worker.ps1`) compiled with fixed framework references, `/noconfig`, unsafe disabled and warnings as errors, and passed:

```text
native_drag_lease_generated_bounds_scope_sha_cancel_and_deadline_passed
native_drag_pump_generated_registration_chunk_deadline_scope_cancel_and_verified_stream_passed
native_drag_slot_generated_private_dpapi_retained_process_exit_busy_hardlink_and_corrupt_passed
native_drag_worker_generated_sync_async_failure_scope_gesture_sha_and_blocked_process_watchdog_passed_no_real_ole
```

Pump tests include exact registration/index/offset/length/End, native lease SHA/read integration, failed enqueue,17th concurrent read refusal, packet erase, terminal cancellation/drain, idle/absolute/request deadlines and wrong scope.

Slot uses generated owned child processes and new private fixtures. Explicit uniquely named event gates separate mutex release from actual process exit. The next child reaches its retained-handle wait and cannot admit while the old process remains gated alive; it succeeds after exit. Corrupt DPAPI, hardlinked journal and an in-memory broad ACL are rejected. Only owned Process.Start handles are waited/killed during fixture failure cleanup.

Worker uses fake desktop/OLE/slot drivers: sync/async COPY, failed async EndOperation, cancellation, missing held button/desktop, bad SHA, button release/expiry during data construction, phase2 and last backend OS-check expiry all behave correctly. Real and fake dispatch share the same final admission code. Actual generated children with blocked native callback, blocked stdin and blocked stdout finish as process failure within their bounded budget; no real DoDragDrop or SendInput executes.

## Actual product-source negative controls

Fourteen variants altered the actual C# module, compiled, and failed their intended generated runtime assertion. Each exact-byte restore was followed by its Windows positive pass. Compile/import/generic harness timeouts were not accepted. The process-watchdog control specifically observes an owned child still alive after its required process-exit budget, kills only that retained owned fixture process and raises the intended assertion. Raw logs/driver: `node_modules/.cache/native-drag-host/`.

### offset

```text
System.Exception: generated assertion: invalid offset response accepted
   �ꏊ NativeDragPumpChecks.Reject(Action action, String reason)
   �ꏊ NativeDragPumpChecks.InvalidResponses()
   �ꏊ NativeDragPumpChecks.Main()
```

### index

```text
System.Exception: generated assertion: invalid index response accepted
   �ꏊ NativeDragPumpChecks.Reject(Action action, String reason)
   �ꏊ NativeDragPumpChecks.InvalidResponses()
   �ꏊ NativeDragPumpChecks.Main()
```

### end

```text
System.Exception: generated assertion: invalid early-end response accepted
   �ꏊ NativeDragPumpChecks.Reject(Action action, String reason)
   �ꏊ NativeDragPumpChecks.InvalidResponses()
   �ꏊ NativeDragPumpChecks.Main()
```

### scope

```text
System.Exception: generated assertion: wrong scope heartbeat accepted
   �ꏊ NativeDragPumpChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragPumpChecks.EmptyAndScope()
   �ꏊ NativeDragPumpChecks.Main()
```

### chunk-deadline

```text
System.Exception: generated assertion: expired chunk pump alive
   �ꏊ NativeDragPumpChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragPumpChecks.Deadlines()
   �ꏊ NativeDragPumpChecks.Main()
```

### concurrency

```text
System.Exception: generated assertion: seventeenth pending file accepted
   �ꏊ NativeDragPumpChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragPumpChecks.QueueAndConcurrency()
   �ꏊ NativeDragPumpChecks.Main()
```

### packet-zero

```text
System.Exception: generated assertion: accepted packet not erased
   �ꏊ NativeDragPumpChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragPumpChecks.Positive()
   �ꏊ NativeDragPumpChecks.Main()
```

### process-exit

```text
System.Exception: generated assertion: mutex release substituted for actual process exit
   �ꏊ NativeDragSlotChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragSlotChecks.Main(String[] args)
Native drag slot generated checks failed
```

### private-acl

```text
System.Exception: generated assertion: broad read ACL accepted
   �ꏊ NativeDragSlotChecks.Policy()
   �ꏊ NativeDragSlotChecks.Main(String[] args)
Native drag slot generated checks failed
```

### hardlink

```text
System.Exception: generated assertion: multiply linked native journal accepted
   �ꏊ NativeDragSlotChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragSlotChecks.Main(String[] args)
Native drag slot generated checks failed
```

### dpapi

```text
System.Exception: generated assertion: corrupt native journal accepted
   �ꏊ NativeDragSlotChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragSlotChecks.Main(String[] args)
Native drag slot generated checks failed
```

### final-admission

```text
System.Exception: generated assertion: worker result backend-expire
   �ꏊ NativeDragWorkerChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragWorkerChecks.Case(String mode, Boolean child)
   �ꏊ NativeDragWorkerChecks.Main(String[] args)
```

### async-result

```text
System.Exception: generated assertion: worker result failed-async
   �ꏊ NativeDragWorkerChecks.Assert(Boolean value, String reason)
   �ꏊ NativeDragWorkerChecks.Case(String mode, Boolean child)
   �ꏊ NativeDragWorkerChecks.Main(String[] args)
```

### process-watchdog

```text
System.Exception: generated assertion: blocked stuck outlived process watchdog
   �ꏊ NativeDragWorkerChecks.Main(String[] args)
Native drag worker generated checks failed
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-host\scripts\remote-desktop\validate-native-drag-w
```

## Review and remaining verification

Independent reviewers reviewed pump, slot and whole worker/corrections. Late-gesture checks were corrected both after data construction and after the very last backend OS check; the shared native dispatch gate is regression-tested. Failed async extraction has a separate completion-success flag. Slot timing sleeps were replaced with explicit old-child gates. Final whole record review and frozen CI/root delivery receipt follow.

No JS product files changed from main ee92e292; source12586/root12648 test counts are the N2 baseline, not new N3 whole-suite runs. Linux/macOS device tests, actual Windows Explorer target behavior and A/B deployment are not claimed.

## First Windows CI correction

The first Windows CI (run40907941308, head78eec48b) failed before its first slot fixture was admitted:

```text
System.Exception: generated assertion: first private fixture slot refused
```

New journal files previously used the process's default owner, while the subsequent policy requires the current user explicitly. Journal stage creation now supplies current-user owner plus a protected user-only FileSecurity directly to CreateNew; it never changes an existing file/directory ACL. The generated policy test requires the owner to be explicit, and generated-only child diagnostics now preserve the failure cause. The CI correction remains subject to the exact new head's Windows rerun.

Affected exit/ACL/hardlink/DPAPI source controls were rerun against the corrected Slot source: intended assertion failures, exact restoration and Windows positives passed. An additional actual-source control removes the explicit owner and fails:

```text
System.Exception: generated assertion: journal creation owner must be explicit current user
```

Total controls15, with5 affected Slot checks rerun; unchanged pump/worker controls remain the14-control baseline above. Root source reflection is revalidated before applying only changed bytes. No JS product code changed.

## Second Windows CI fixture correction

The explicit-owner correction passed initial slot acquisition on CI head24a629f0 (run40909287102). The subsequent failure was in the generated fixture's console-text gate:

```text
System.Exception: generated assertion: fixture process did not linger after mutex release
```

The fixture now uses its own uniquely named local events for release/exit, removing console input encoding/preamble dependence. No product process-exit check or deadline was weakened. All5 affected Slot actual-source controls were rerun with exact restores and Windows positives. Final CI rerun remains required. Production stdin continues to use the bounded byte/strict UTF-8 protocol, unrelated to these test gates.
