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
