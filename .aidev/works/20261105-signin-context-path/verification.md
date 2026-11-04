# Sign-in runtime context path (2026-11-05)

Native host moved private state to Program Files/Sodashitsu/DesktopSigninData/<owner hash>/runtime (eec6cf98), but TypeScript still required the old ProgramData suffix. This rejected the native context before an initialize request could be claimed. Context validation now derives the exact state directory from the verified fixed package root, preserving canonical drive path, owner, root and exact equality checks. It rejects the retired path, other roots/drives and owner slots.

## Verification

- Node 24.15.0 build and typecheck: pass (raw logs attached).
- Four related files, 66 tests: pass (`related-tests.txt`).
- Negative control: original production function with the new test fails; exact modified bytes restored and same test passes (`negative-control.txt`, `restored-control.txt`).
- Independent review by /root/review_resource_monitor: no findings on all five modified source/test files.
- Full suite: 966 files passed, 7 failed, 1 skipped; 13786 tests passed, 9 failed, 1 skipped, one worker SIGABRT. This is not an all-suite pass. Failures include unrelated sidebar snapshots, synthetic Electron export, timing and extension child cleanup. A bounded low-worker rerun is recorded separately when complete.
- Detached baseline 590419ef reproduced both sidebar snapshot failures and the synthetic Electron nativeTheme missing export. The first host baseline attempt lacked build output; the second used the unchanged built GUI output and reproduced the actual nativeTheme error. No sidebar/GUI product changes are part of this fix.

## Live state and limits

`live-repair-result.json` records successful expired-unclaimed cancellation and package upgrade, followed by an observed failed service start. `live-observed-failure.json` records exact original journal/admin inventory. These are operational evidence, not a successful service run. Raw bytes remain on sr-pc; no private enrollment key or token is included here. The new source fix has not yet been installed as a fresh dedicated service package. An observed abnormal run must not use the unclaimed-only cancellation operation. Normal-user service enumeration is denied by service ACL and does not prove absence; direct sc query returns access denied.
