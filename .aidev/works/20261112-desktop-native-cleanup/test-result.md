# Phase 1 verification

No Windows/prod execution, elevation, service/Task update, installed helper change, screen capture or OS input was performed.

- `git diff --check`: passed.
- Existing `verify-runtime-assets.mjs` against a fresh temporary SDK made by copying exactly the closed runtime inventory: passed, raw output:

```json
{"runtimeResources":111,"localReferences":214,"sourceBytesMatch":true,"macBinaryChecked":false,"helperExecution":false}
```

  `prepare-desktop-helper.ps1` is included; the deleted installer and both new `*Checks.cs` are excluded. Runtime include closure is checked by the existing verifier, including PowerShell references.
- Existing `DesktopSettings.test.ts`, using the unchanged installed dependency tree and a temporary one-project vitest config (root workspace config attempted to initialize missing unrelated web dependencies): passed:

```text
 Test Files  1 passed (1)
      Tests  39 passed (39)
   Start at  22:02:50
   Duration  2.80s (tests 56%, transform 35%, import 9%)
```

- Windows C#/.NET Framework source compilation and generated validators: pending designated operator. Linux has no C#/PowerShell compiler. No success is claimed for these.
- No new mirror tests were added for the cleanup. Existing generated policy/pipe/host tests are preserved in repo-only partial sources and their ten direct compilation consumers include them. Existing peer-policy test was updated to remove its obsolete SCM expectations.
- Independent review: pending integration reviewer.

## Phase 1 source-only Windows validation

Reviewed snapshot `f77b3874` was copied as a git archive into a fresh administrator-protected `C:/git/soda-native-validation-*` folder. The archive SHA was checked before extraction. Capped stdout/stderr files were opened before each invocation under `/tmp/soda-native-validate-f77b3874/` (initial failure) and `/tmp/soda-native-validate-272c6574/` (reviewed fix).

The initial normal compile caught CS0649 on remaining Memory delegates: extracting their test assignments left unassigned-field warnings, which Windows PowerShell Add-Type treats as errors. Reviewed fix `272c6574` explicitly initializes the six delegates to null; it changes no behavior. Both actual production compilation entrypoints subsequently passed:

```text
desktop_helper_roles:{"microphone":false,"audio":false,"codecs":false,"pipe":false,"virtualDisplay":false,"protectedDesktop":false,"richClipboard":false}
desktop_helper_compiled
desktop_unlock_compiled
```

Inspected generated validators passed: protected worker purposes/cleanup/shared-proof/scope/handshake/factory and ABI layout, authentication fake native batches, pointer witness and virtual-pointer witness. The authentication child emitted a CLIXML progress record on stderr; it contained no Error record and exited 0. One outer harness check initially treated an unset LASTEXITCODE as nonzero after the pure protected script; raw passing validator output and harness error are preserved, then a corrected invocation initialized LASTEXITCODE=0 and exited 0.

No service, Task, registry, installed source/binary, capture/input or running native production process was changed. All executed Host inputs and desktop facts in these validators were memory-backed before invocation.

## Phase 2 local generated checks

The isolated Mono compiler under `/tmp/soda-signin-csharp/` compiled Host/Unlock plus partial checks and protected scope inputs. It ran authentication batch, control completion, physical/virtual pointer and protected output/scope generated checks successfully. No Mono packages were installed system-wide. Windows phase 2 compilation awaits independent review of the immutable snapshot.

Raw output from two source negative controls follows. Removing actual release before the ordinary control completion fails:

```text
authentication_input_generated_batch_transition_cleanup_partial_failure_and_ordinary_semantics_passed
System.Exception: Control completion preceded held input release
  at SodaDesktopHost+<VerifyControlCompletion>c__AnonStoreyA.<>m__0 (System.Object value) [0x0001e] in <7f20968205b44525a61f6ea1f4f7306f>:0
  at SodaDesktopHost.Output (System.Object value) [0x0001a] in <7f20968205b44525a61f6ea1f4f7306f>:0
  at SodaDesktopHost.SetControl (System.Boolean enabled, System.Boolean allow, System.Int64 sequence) [0x00051] in <7f20968205b44525a61f6ea1f4f7306f>:0
  at SodaDesktopHost.VerifyControlCompletion () [0x000ac] in <7f20968205b44525a61f6ea1f4f7306f>:0
  at Checks.Main () [0x00005] in <7f20968205b44525a61f6ea1f4f7306f>:0
```

Restoring the old normal-input exemption from the desktop check fails:

```text
authentication_input_generated_batch_transition_cleanup_partial_failure_and_ordinary_semantics_passed
System.Exception: Normal source cleanup crossed the input desktop boundary
  at SodaDesktopHost.VerifyControlCompletion () [0x0027e] in <d4d1e76bba62411486b180bced199d6a>:0
  at Checks.Main () [0x00005] in <d4d1e76bba62411486b180bced199d6a>:0
```

The mutant sources were temporary copies, recompiled for each run. Current and restored generated checks passed, and production bytes were unchanged:

```json
{"generatedChecks":"passed","negativeControls":2,"sourceBytesUnchanged":true,"hostSha256":"46174006c6319f40fc2966872adbfe0033d0bb174122df53d7c8f32dc3534397"}
```

`node --check synthetic-helper.mjs` and `git diff --check` pass. Closed SDK verification passed with 110 runtime resources and 212 local references before the final OS-input guard edit; source bytes are rechecked for the frozen snapshot at integration. No full TS build was repeated.

## Phase 3 local verification

Isolated Mono compiled the exact changed Host/Unlock, partial Checks, direct native scope, immutable scope, handshake/worker and routing sources. Existing generated authentication/control completion/pointer/virtual-pointer and protected input/queued image/queued native video checks pass. All scope wire and owner/session/process/desktop mutation checks remain; only checks for the deleted observer/epoch/ticket infrastructure were removed.

```text
authentication_input_generated_batch_transition_cleanup_partial_failure_and_ordinary_semantics_passed
desktop_control_completion_after_release_and_failure_cleanup_passed
desktop_native_pointer_generated_applied_down_coordinates_policy_and_failure_passed
{"type":"monitor_topology_changed"}
desktop_owned_virtual_native_pointer_10_memory_checks_passed
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_native_output_passed: generated native frame scope, local proof, original budget and output commit
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, direct OS identity/desktop admission at input and queued output; fake facts only
desktop_capture_routing_checks_passed
```

`git diff --check` passes. No full TS build, Windows execution, direct OS identity/desktop querying, capture/input or production mutation occurred for this phase. Independent review and frozen Windows source compilation remain required. The native-video negative validator's mutation target was updated to the direct guard so the existing queued-output negative control remains meaningful after ticket removal.

## Independent review correction: stopped queued publication

The reviewer found a real race after phase 3: an observed transition set the existing `Stopping` flag while a frame waited for stdout, but the OS desktop could become valid again before that frame acquired the output gate. Both image admission and native-video publication now reject `Stopping`, as well as checking the current OS source.

A generated test holds the actual output gate, queues image and native-video publication, marks the source stopped during a desktop transition, restores valid desktop facts and releases the gate. Neither frame may be emitted. Reverting just the two production guards to their exact previous form fails:

```text
authentication_input_generated_batch_transition_cleanup_partial_failure_and_ordinary_semantics_passed
desktop_control_completion_after_release_and_failure_cleanup_passed
desktop_native_pointer_generated_applied_down_coordinates_policy_and_failure_passed
{"type":"monitor_topology_changed"}
desktop_owned_virtual_native_pointer_10_memory_checks_passed
System.Exception: Stopped source published after desktop returned
  at SodaDesktopHost.VerifyStoppedQueuedOutput () [0x001c7] in <3041fa32b0db4760ad8ea62940d415ad>:0
  at SodaDesktopProtectedScopeChecks.Run () [0x00006] in <3041fa32b0db4760ad8ea62940d415ad>:0
  at Checks.Main () [0x00014] in <3041fa32b0db4760ad8ea62940d415ad>:0
```

Current and restored source copies pass all generated checks; the production file was not modified by the mutant compilation:

```json
{"generatedChecks":"passed","negativeControls":1,"sourceBytesUnchanged":true,"hostSha256":"c1392ba0e09b19a80fe7a859854ede95813d46326b011574ca42a3e2076b23c9"}
```

This reuses the existing stop state; it adds no epoch, observer, timer or transition counter. No Windows execution occurred for this correction before review.

## Closed SDK and reviewed native 3 Windows validation

Both `d805e24d` and reviewed `1bca2d42` were projected to exactly the closed runtime-assets list in fresh protected Windows validation folders. Each projection asserted **zero `*Checks.cs` files**. Public normal `windows-helper.ps1 -ValidateOnly` and `prepare-desktop-helper.ps1 -ValidateOnly` passed in both projections. The archives were checked by SHA before extraction. Raw outputs: `/tmp/soda-native-closed-d805e24d/` and `/tmp/soda-native-closed-1bca2d42/`.

Reviewed `1bca2d42` repository-source generated protected/authentication/pointer checks also passed under Windows. The new stopped-queued-image/native-video regression passed. Logs are in `/tmp/soda-native-generated-1bca2d42/`. Authentication stderr again contained only a progress record, with no Error. No installed helper, service, Task, registry, input, capture or production process was changed.

## Optional input deadline and media age gates

Isolated Mono source compilation and generated tests pass. Human input without a deadline remains admitted at seven seconds since the prior helper heartbeat (the source watchdog has not expired); explicit expired input and missing control permission are rejected. Restoring mandatory expiry fails:

```text
System.Collections.Generic.KeyNotFoundException: The given key 'expiresAt' was not present in the dictionary.
  at System.Collections.Generic.Dictionary`2[TKey,TValue].get_Item (TKey key) [0x00021] in <12b418a7818c4ca0893feeaaf67f1e7f>:0
  at SodaDesktopHost.ApplyInput (System.Collections.Generic.Dictionary`2[TKey,TValue] msg, System.Int64& inputSeq, System.Action applied) [0x00011] in <1332f0c369634fe8b0015c62d472f621>:0
  at SodaDesktopHost.VerifyLiveInputDeadline () [0x00124] in <1332f0c369634fe8b0015c62d472f621>:0
  at Checks.Main () [0x00000] in <1332f0c369634fe8b0015c62d472f621>:0
```

Restoring the duplicate six-second admission gate fails:

```text
System.Exception: Live human input without a deadline was rejected
  at SodaDesktopHost.VerifyLiveInputDeadline () [0x0013f] in <d93337c465694b418f60d4352d6f34e3>:0
  at Checks.Main () [0x00000] in <d93337c465694b418f60d4352d6f34e3>:0
```

A generated live native-video publication waits behind the actual stdout gate for 1.1 seconds while its source stays current. Reintroducing the previous one-second publication budget (same before/after-gate positions) fails:

```text
live_input_optional_deadline_and_single_source_liveness_passed
stopped_queued_image_and_native_video_rejected_after_desktop_return_passed
System.Exception: Live video stopped after output congestion
  at SodaDesktopHost.VerifyLiveQueuedVideo () [0x0011e] in <c012779d768d496c9c63e665ae2537f8>:0
  at SodaDesktopProtectedScopeChecks.Run () [0x0000b] in <c012779d768d496c9c63e665ae2537f8>:0
  at Checks.Main () [0x00005] in <c012779d768d496c9c63e665ae2537f8>:0
```

Current and restored compilations pass, and production bytes are unchanged after all temporary mutants. Existing frame-credit/order, preparation, rate/profile/held-IDR generated checks also pass:

```text
desktop_frame_preparation_checks_passed
frame_preparation_model: duration=5000ms capture_encode=65ms ack=100ms fps_limit=30 serial_frames=31 overlapped_frames=50; deterministic model, not a desktop benchmark
desktop_video_rate_checks_passed: private cadence/bitrate ceilings, recovery to original maximum, no OS calls
```

The obsolete profile-expiry assertions and native-age negative control were removed with their deleted production policies. Source/stop queued-output negative controls remain. No full TS build was run; Windows validation of this new snapshot requires independent review.
