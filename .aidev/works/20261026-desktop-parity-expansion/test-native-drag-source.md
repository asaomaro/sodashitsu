# Native drag N2 internal selection/source preparation — 2026-10-30 JST

This phase adds internal source and selection adapters, not a usable Explorer drag. No public wire/UI request registers them. The disposable STA worker, bounded IPC/request authentication/process-exit evidence, file grant/control release binding and local native helper remain pending. The top-level N2/N3 tasks are intentionally unchecked.

## Positive validation

- `DesktopNativeSources.test.ts`:30 generated filesystem cases passed. Approved-root bounds, SHA/fixed manifest, initial content under coarse timestamps, empty directories, Windows ambiguous names, symlink/hardlink/source/parent replacement, scoped requests/replay, offer/idle/absolute expiry, reentrant final-close/zeroization/drain, and in-construction buffer erasure while a filesystem read is blocked.
- Real Windows framework compiler compiled `WindowsExplorerSelection.cs` and the generated driver checks, then printed:

```text
explorer_selection_generated_identity_paths_authority_freshness_passed_no_real_desktop
```

The adapter's real UIA/COM/process/token/default-desktop/console-session/physical-DPI checks were compiled but NOT exercised. Driver tests cover stable/changed window, process, item, filesystem paths, duplicate/empty/overlarge selection, authority and freshness. No real desktop, Shell item enumeration, input, clipboard, service or user file was accessed.

## Actual product-source negative controls

Thirteen variants modified the actual TypeScript or C# product module. Each failed the intended runtime assertion, each was restored byte-for-byte, and the corresponding Node or Windows positive passed. Compile/import/timeout failures are not accepted as evidence. Raw logs/driver remain in `node_modules/.cache/native-drag-source/`; final pass is `negative-controls-final.log`.

### sha

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > hashes a bounded selected tree, preserves empty directories and reads exact positional chunks
AssertionError: expected { name: 'folder\text.txt', …(3) } to match object { bytes: 25, …(1) }
(2 matching properties omitted from actual)

- Expected
```

### metadata

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > invalidates source rewrite before publishing
AssertionError: promise resolved "Buffer[ 111 ]" instead of rejecting

- Expected
+ Received
```

### reentrant-close

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > rejects final publication after reentrant close from authority
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > rejects final publication after reentrant close from clock
AssertionError: promise resolved "Buffer[ 97, 98, 99 ]" instead of rejecting

- Expected
```

### absolute

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > expires absolute irreversibly
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopNativeSources.test.ts:235:42
    233|     if (mode === "absolute") for (now = 4000; now < 900000; now += 400…
    234|     now = mode === "offer" ? 1500 : mode === "idle" ? 5000 : mode === …
```

### offer

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > expires offer irreversibly
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopNativeSources.test.ts:235:42
    233|     if (mode === "absolute") for (now = 4000; now < 900000; now += 400…
    234|     now = mode === "offer" ? 1500 : mode === "idle" ? 5000 : mode === …
```

### request-replay

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > refuses reused requests and out-of-bounds reads
AssertionError: promise resolved "Buffer[ 97 ]" instead of rejecting

- Expected
+ Received
```

### scope

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > binds owner
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > binds origin
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > binds gesture
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > binds generation
AssertionError: promise resolved "Buffer[ 97 ]" instead of rejecting
```

### pending-zero

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > erases a partially built snapshot while its next filesystem read is pending
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received
```

### published-zero

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > rejects final publication after reentrant close from authority
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > rejects final publication after reentrant close from clock
AssertionError: expected Buffer[ 97, 98, 99 ] to deeply equal Buffer[ 0, 0, 0 ]

- Expected
```

### snapshot

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeSources.test.ts > native source approved-root lease > publishes the hashed initial bytes even when filesystem timestamps hide a same-size rewrite
AssertionError: expected 'later' to be 'first' // Object.is equality

Expected: "first"
Received: "later"
```

### selection-window

```text
System.Exception: generated assertion: accepted window selection
   �ꏊ ExplorerSelectionChecks.Reject(Action action, String reason)
   �ꏊ ExplorerSelectionChecks.Main()
Explorer selection generated checks failed
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-independent-monitors\scripts\remote-desktop\validate-expl
```

### selection-deadline

```text
System.Exception: generated assertion: accepted expired selection
   �ꏊ ExplorerSelectionChecks.Reject(Action action, String reason)
   �ꏊ ExplorerSelectionChecks.Main()
Explorer selection generated checks failed
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-independent-monitors\scripts\remote-desktop\validate-expl
```

### selection-authority

```text
System.Exception: generated assertion: accepted revoked selection
   �ꏊ ExplorerSelectionChecks.Reject(Action action, String reason)
   �ꏊ ExplorerSelectionChecks.Main()
Explorer selection generated checks failed
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-independent-monitors\scripts\remote-desktop\validate-expl
```

## Independent review and execution status

`review_transfer` independently reviewed the whole internal source/adapter and corrections. The post-callback dead-state check and immediate ownership/zeroization of in-construction buffers were corrected and verified with actual-source negative controls. Final review: no additional must/should. Kernel root integration was independently verified by `review_pointer`.

Frozen source whole build/typecheck passed; whole test:12586 tests /844 files passed,429.57s. Root whole build/typecheck passed; root whole tests and delivery are still pending at this commit. The final delivery/check receipt is appended to the PR body after completion. No actual Explorer drop, A/B deployment, native Linux portal or macOS desktop validation is claimed. User has WSL and no Linux/macOS desktop device available; WSL does not substitute for those desktop validations.
