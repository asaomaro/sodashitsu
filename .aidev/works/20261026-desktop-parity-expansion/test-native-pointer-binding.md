# Native pointer binding validation — 2026-10-30 JST

This phase connects private pointer metadata and cleanup receipts, not native Explorer file drag. Real B selection, approved file API activation, local helper gateway, browser gestures and actual OLE target testing remain incomplete.

## Targeted positives

- Owner/InputAcks/SharedCapture:72 tests passed.
- Actual synthetic-helper/provider/relay WebSocket cases:12 passed (3 private pipe/JSON/shared positive +9 delayed witness after release/control/rejected input). Frames are decoded from received binary packets; private metadata is asserted absent from public ACK/ready. Deferred synthetic ACKs are released by a heartbeat, without timing sleeps.
- Windows framework compiles the production input source with memory-backed desktop/topology/emit/output/window lookup before invocation. Positive marker:

```text
desktop_native_pointer_generated_applied_down_epoch_coordinates_policy_and_failure_passed
```

Cases include negative-origin fractional coordinate mapping, exact window/PID/epoch, duplicate down/up/expired/disabled/secure/unmanaged/modifier/invalid target/failed down. No real SendInput, desktop/window query or user files are accessed. It does not prove target application selection processing.

## Regression and source negative evidence

Independent review found that deleting stored proof did not invalidate delayed pending down ACKs. Pending slots now retain a cancelled state that permits only the normal receipt, and both A rejection and B pre-eligibility paths invalidate metadata. Pipe/JSON/shared delayed tests all pass. Clock exceptions now reject pending release confirmations.

The first unnegotiated control was ineffective because the existing test exercised only the stderr parser. A structured ACK case was added; the final control fails the intended runtime assertion. Only the final13 successful source controls are counted. Each mutates actual TypeScript/C# product code, fails a runtime assertion, restores exact bytes and reruns the positive. Compile/import/generic harness timeouts are rejected as evidence. Logs/driver: node_modules/.cache/native-pointer/negative-controls-final.log.

### physical-source

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > serializes all resources until the same physical helper acknowledges cleanup
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received
```

### correlation

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > serializes all resources until the same physical helper acknowledges cleanup
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received
```

### send-before-ack

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > does not accept a synchronous ACK followed by false
AssertionError: promise resolved "{ …(2) }" instead of rejecting

- Expected
+ Received
```

### epoch

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > returns a cleanup receipt only for the exact helper, request and original epoch
AssertionError: expected { …(2) } to deeply equal { …(2) }

- Expected
+ Received
```

### failure-reject

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > rejects confirmed release on timeout without reviving it
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > rejects confirmed release on death without reviving it
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > rejects confirmed release on clock without reviving it
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > rejects confirmed release on throw without reviving it
AssertionError: expected { kind: 'pending' } to match object { kind: 'rejected', error: Any<Error> }
```

### dispose-reject

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > rejects confirmed release on dispose without reviving it
AssertionError: expected { kind: 'pending' } to match object { kind: 'rejected', error: Any<Error> }

- Expected
+ Received
```

### pending-pointer-cutoff

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > does not revive a delayed pipe witness after release
AssertionError: expected { seq: 1, point: { …(5) }, …(2) } to be undefined

- Expected:
undefined
```

### reject-notice

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > does not revive a delayed pipe witness after rejected-input
AssertionError: expected { seq: 1, point: { …(5) }, …(2) } to be undefined

- Expected:
undefined
```

### private-negotiation

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopInputAcks.test.ts > does not consume a pending input for malformed, unrequested or unnegotiated pointer metadata
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

```

### shared-route

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > routes a physical pointer witness only to its submitting viewer and rewrites the helper sequence
AssertionError: expected [ { type: 'input_ack', seq: 7, …(1) } ] to deeply equal []

- Expected
+ Received
```

### helper-policy

```text
System.InvalidOperationException: Native pointer admission mismatch: disabled
   �ꏊ SodaDesktopHost.VerifyNativePointerWitness()
   �ꏊ SodaPointerWitnessChecks.Main()
Pointer witness generated checks failed
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-integration\scripts\remote-desktop\validate-pointe
```

### helper-epoch

```text
System.InvalidOperationException: Native pointer coordinates or epoch mismatch
   �ꏊ SodaDesktopHost.VerifyNativePointerWitness()
   �ꏊ SodaPointerWitnessChecks.Main()
Pointer witness generated checks failed
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-integration\scripts\remote-desktop\validate-pointe
```

### fresh-down-only

```text
System.InvalidOperationException: Duplicate down forged physical witness
   �ꏊ SodaDesktopHost.VerifyNativePointerWitness()
   �ꏊ SodaPointerWitnessChecks.Main()
Pointer witness generated checks failed
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-integration\scripts\remote-desktop\validate-pointe
```

## Review and frozen execution

Independent review_pointer C# review and review_transfer state/route/protocol reviews, including corrections: no remaining must/should. Frozen whole build/forced server emit/typecheck/test and browser checks are still running at initial record creation. Final delivery results are appended after completion. No A/B runtime restart/deploy, real desktop test or native Linux/macOS validation is claimed.
