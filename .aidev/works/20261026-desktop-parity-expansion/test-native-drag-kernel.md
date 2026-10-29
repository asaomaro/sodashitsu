# Native drag N1 validation — 2026-10-29

Scope: internal COPY-only Windows COM/data/framing kernel. No Explorer selection source, browser gesture, managed helper, DoDragDrop call, or user-facing native drag is connected yet. N2/N3 remain incomplete.

## Windows generated runtime

Invoked Windows PowerShell from WSL using the fixed framework compiler through `scripts/remote-desktop/validate-native-drag-lease.ps1`. `/noconfig`, explicit framework references, `/unsafe-`, and warnings-as-errors. Compilation and console runtime passed:

```
native_drag_lease_generated_bounds_scope_sha_cancel_and_deadline_passed
```

Generated memory-only cases cover descriptor layout/HGLOBAL, native IDataObject and IStream vtables and ISequentialStream query, full SHA before publication, relative names/tree/aggregate limits, callback-crossed deadlines and clock failure, retained asynchronous completion versus drop return, missing EndOperation absolute expiry, COPY-only effects, CopyTo full/short/error/cancel targets and tracked drain, strict nonce/scope/sequence/UTF-8/base64/bounded frame parsing and terminal cancellation. No real desktop, OLE drop, keyboard/mouse input, service, clipboard contents, or user files were accessed.

## Actual product-source negative controls

Thirteen variants (the twelve initial controls plus the final-Write authority correction) modified the actual C# product module, compiled successfully, and failed an intended generated runtime assertion. Each was restored byte-for-byte and the Windows positive rerun passed. Compile/import/timeout failures were rejected as evidence. Raw logs and driver remain in `node_modules/.cache/native-drag-kernel/`.

| Mutation | Intended runtime assertion excerpt |
| --- | --- |
| sha | `System.Exception: generated assertion: unverified SHA bytes published` |
| callback-deadline | `System.Exception: generated assertion: callback crossed deadline` |
| clock-exception | `System.Exception: generated assertion: clock exception did not revoke irreversibly` |
| reserved-name | `System.Exception: generated assertion: unsafe name accepted` |
| absolute | `System.Exception: generated assertion: heartbeat cannot extend absolute lifetime` |
| nonce | `System.Exception: generated assertion: bad native frame accepted` |
| frame-bound | `System.Exception: generated assertion: bad native frame accepted` |
| canonical-base64 | `System.Exception: generated assertion: invalid phase2 native packet` |
| async-completion | `System.Exception: generated assertion: drop return is not async completion` |
| copy-short-write | `System.Exception: generated assertion: CopyTo partial write` |
| cancel | `System.Exception: generated assertion: cancelled stream cannot read` |
| stream-budget | `System.Exception: generated assertion: native stream creation budget` |

| copy-final-authority | `generated assertion: CopyTo final Write revocation must fail` |

## Review and limits

Independent reviewers `review_pointer` and `review_transfer` reviewed the kernel. Clock sampling after authority callbacks and superscript COM/LPT reserved names were corrected with runtime regressions; framing buffers are wiped in finally; CopyTo now tracks pending target writes and has generated target coverage. Pointer final correction review: no additional must/should. Transfer final review found a final-target-Write revocation window; authority is now rechecked after Write, with 1/65536/70000-byte cancel, owner-revoke and absolute-expiry regressions and an additional actual-source negative control.

This change adds unused C# modules, their generated validator, workflow and records. The JS product tree remains identical to main `5ef0ab45635f7e5f5460d8921ebb63b2362f736d`; it does not claim a new JS whole-suite run. Folder baseline validation is recorded in `test-durable-folders.md`.

The future host must enforce request registration/ownership, bounded cancellable pipe I/O and five-second chunk deadlines, fifteen-minute operation expiry, and actual native process exit before freeing its PC-wide slot. WaitIdle(false), DoDragDrop return or a transport ACK cannot establish cleanup. Co-location proof is separate from IPC authentication. Actual Explorer drops and other operating systems are not validated here; user has WSL but no Linux/macOS desktop test device.

## Delivery receipt

PR#299 tested head `70687cac217f6606caa83eab28c73693348b16c4` merged to main `947448402ce02dfa4c1ec6099458de914917197a`; the trees match. CI runs40896024778/40896024817: windows, boundaries, maintenance-recovery and upgrade all succeeded. A clean detached external worktree built and `pnpm smoke` passed. `review_pointer` independently confirmed all ten root reflection paths match the frozen tested head and manifest hashes with no overlaps. No active A/B process restart or deployment was performed.
