# macOS text clipboard verification

Normal/shared Mac text clipboard Node loopback2 cases pass, using owned synthetic helper (no actual pasteboard). Pre-grant read denied, Unicode write/read succeeds after explicit grant, native rich lane unadvertised, second shared viewer cannot steal grant, revoke denies read.

Actual SDK compile/generated fake-sink assertions and12compiled source negatives pending CI. Generated assertions include fixed original monotonic budget consumed by source/canWrite callback, no delayed new reads/writes, post-read revocation/expiry, reentrant generation clear and queued publication.

Full workspace build/typecheck/runtime running on frozen source. No real clipboard or OS permission/prompt/capture/input/service/driver/model/handoff performed.

## Final verification/delivery

All9 exact-head CI checks pass, including actual Mac SDK compilation, fake sink self-test and12compiled source negatives. No real pasteboard/capture/input/permission prompt in tests. Full build/typecheck PASS;895 files/12,994 tests PASS,364.99s.

PR327 merged main728934159e4d5c924e1014610cbfad7ae347b624. Tree19dece58a726033b8bb86ccd27b2bf3693f6b892 equals tested head724772af3cfb6d7b644396317b2d346a96bcc63c. Immutable head/CI/merge receipt in PR body. Independent correction/delta reviews have no remaining findings.
