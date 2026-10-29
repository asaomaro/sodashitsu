# Independent monitor validation (2026-10-29)

Windows normal-desktop independent capture/encoding cohorts. Old compatibility was not requested. No real desktop/input/audio/clipboard/devices/services/SCM changes. Synthetic helper uses generated mixed-DPI monitor layouts and frames; native validation installs memory-backed input/desktop/monitor/output endpoints before executing production methods.

## Focused verification

- Desktop owner/channel/shared capture/relay plus browser settings/launch: 271 passed before the final topology/fault additions; additional topology all-source stop and reconnect/configure/endpoint fault persistence: 2 passed.
- Browser old clipping: plain/encrypted/native/topology plus invalid launch URL 5 passed. Independent plain/encrypted2 passed; generated H264 independent2-window1 passed separately. Final combined browser run pending.
- validate-resource-fence.ps1 -NegativeControls: actual Host Apply/Release/ResourceCleanup key-up/button-up/Unicode-up failures cannot emit normal or terminal cleanup ACK. Five actual-source negative controls failed the intended assertions; each source restored byte-for-byte and positive checks rerun.
- Existing validate-unlock-helper.ps1 all generated suites passed, including input priority, lock cover, preparation, display lease, UTF8/no-console and ACK pipe checks. windows-helper.ps1 ValidateOnly passed.
- scripts/package.mjs --no-build --no-install --no-archive passed; packaged windows-helper.ps1 ValidateOnly passed with all required private runtime assets present.
- Five TS actual-product guard controls: physical helper cap, same-source ACK, pending cleanup exclusion, command FIFO, per-monitor preferences. Intended assertions failed; exact bytes restored; corresponding positives passed. Formatter subsequently changed only whitespace in the new owner/channel files; final full tests cover formatted files.

## Independent review and corrections

Readonly review_pointer: all Windows human/agent/endpoint/single/cohort paths, native input/cleanup proof, private ACK lifecycle. Readonly review_transfer: protocol, per-monitor pool/admission, UI, URL, preferences and packaging. Two musts corrected and re-reviewed with no outstanding must/should:

1. Native key/button up removed held state before Emit; Unicode-up also lacked held bookkeeping. Preserve held keys/buttons until successful emit, and any input emit failure terminally closes all resource fences, including Unicode failures. Memory-backed actual Host regression and source negative controls cover normal and terminal ACK refusal.
2. Admission could see fewer than8 physical helpers before pending WS opens. Synchronously recheck live+retiring budget at actual spawn before adding the physical identity. Regression holds two accepted launches, adds7 retiring identities, permits only one physical spawn and rejects the second while preserving count8. Handler catch stops rejected share.

Browser validation found the old popup ready guard still required composite cropping. Independent mode now verifies selected source ID. Browser tests observe canvas pixels/dimensions, DOM, browser-sent pointer frames, saved quality and no restored input grant. H264 fixture uses generated16:9 monitor bounds matching its encoded aspect; the old whole-layout fixture did not match individual monitor frames. Intermediate native fixture failures are not counted as passes. Early negative-harness matcher strings were corrected to match actual assertion text; failed harness attempts were rejected and product bytes restored.

## Root integration

All-file exact-byte preflight initially refused4 changed root files. Existing other-session local desktop/LAN work was retained with guarded3way merge: Provider localOrScope/allowLanHttp; Relay localProvider/start error mapping; Relay test fixture extra parameters/default true; Vue local-PC note. Manual overlap resolutions only combine start resource guards and independent viewer hint with the root signatures/default. Review_transfer checked all4 merged root bytes against saved merge results with no findings. docs/remote-desktop.md preserves root custom bytes and appends only this phase's section. Initial31-file reflection completed; later record-only updates are separately guarded. No root branch switch/reset/pull/commit.

## Final checks and delivery

Source/root full checks, combined browser, external clean smoke and exact-head PR/CI receipt pending. Logs: node_modules/.cache/independent-monitors/ in source and root worktrees. Actual mixed-DPI/GPU/input desktop/failed SendInput recovery and real audio devices remain external verification, not validated by these generated results.

## Raw intended-negative output

```text
negative physical-budget
   × rechecks the live and retiring helper budget when accepted sockets finally launch 120ms
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > rechecks the live and retiring helper budget when accepted sockets finally launch
AssertionError: expected [Function] to throw an error
negative source-identity
   × serializes all resources until the same physical helper acknowledges cleanup 12ms
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > serializes all resources until the same physical helper acknowledges cleanup
AssertionError: expected true to be false // Object.is equality
negative pending-cleanup
   × serializes all resources until the same physical helper acknowledges cleanup 26ms
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > serializes all resources until the same physical helper acknowledges cleanup
AssertionError: expected true to be false // Object.is equality
negative fence-fifo
   × keeps fences behind queued commands and waits for exact ACK before physical stdin end 1017ms
 FAIL  |@sodashitsu/server| src/desktop/DesktopResourceChannel.test.ts > keeps fences behind queued commands and waits for exact ACK before physical stdin end
AssertionError: expected [ 'resource_epoch', …(2) ] to deeply equal [ 'resource_epoch', 'blocked' ]
negative monitor-namespace
   × isolates monitor preferences from other monitors and the machine defaults 11ms
 FAIL  |@sodashitsu/web| src/desktop/settings.test.ts > isolates monitor preferences from other monitors and the machine defaults
AssertionError: expected { width: 960, fps: 5, …(4) } to deeply equal { width: 1280, fps: 10, …(4) }
desktop_resource_fence_generated_strict_release_worker_cleanup_terminal_failure_passed
desktop_resource_input_failed_key_button_unicode_never_ack_passed
negative input-fault-latch
desktop_resource_fence_generated_strict_release_worker_cleanup_terminal_failure_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyResourceInputFailures" ���Ăяo�����ɗ�O���������܂���: "Input failure was not terminal: key" ---> System.InvalidOperationException: Input failure was not terminal: key
negative held-key
desktop_resource_fence_generated_strict_release_worker_cleanup_terminal_failure_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyResourceInputFailures" ���Ăяo�����ɗ�O���������܂���: "Failed release was forgotten: key" ---> System.InvalidOperationException: Failed release was forgotten: key
negative held-button
desktop_resource_fence_generated_strict_release_worker_cleanup_terminal_failure_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyResourceInputFailures" ���Ăяo�����ɗ�O���������܂���: "Failed release was forgotten: pointer" ---> System.InvalidOperationException: Failed release was forgotten: pointer
negative terminal-latch
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Failed cleanup revived" ---> System.InvalidOperationException: Failed cleanup revived
negative failed-release-forgotten
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Failed key was silently forgotten" ---> System.InvalidOperationException: Failed key was silently forgotten
desktop_resource_fence_generated_strict_release_worker_cleanup_terminal_failure_passed
desktop_resource_input_failed_key_button_unicode_never_ack_passed
desktop_resource_cleanup_5_source_negative_controls_and_restore_passed
```

## Full source and clean startup results

Frozen product5774edcd source `pnpm build`, `pnpm typecheck` passed. Whole suite838files/12,487tests passed423.60s, maxWorkers4. Separate detached5774edcd worktree install/build/`pnpm smoke` passed; final git status empty. Both browser terminal canvas/typed PTY round trip and guidance focus/close were observed. Packaged helper compiled from generated release folder.

Combined browser run first reported7passes/1failure while the full suite was active: the new native case reached the next checkbox before the previous shared reconnect completed. The test now observes browser status `閲覧中` after each shared/cursor/independent change, rather than accepting an old positive canvas counter as readiness. Ordered combined rerun pending. This is test sequencing only; product files unchanged. Root full tests running after the source whole suite completed; never two whole suites concurrently.

Ordered final browser run:8/8 PASS1.2m (plain/encrypted/native/topology, independent plain/encrypted/native, invalid URL). Source product unchanged from5774edcd. Final source taskcheck/cross/correction review clear; root integrated full tests/browser are pending before merge.
