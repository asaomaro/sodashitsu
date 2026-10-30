# macOS text clipboard verification

Normal/shared Mac text clipboard Node loopback2 cases pass, using owned synthetic helper (no actual pasteboard). Pre-grant read denied, Unicode write/read succeeds after explicit grant, native rich lane unadvertised, second shared viewer cannot steal grant, revoke denies read.

Actual SDK compile/generated fake-sink assertions and12compiled source negatives pending CI. Generated assertions include fixed original monotonic budget consumed by source/canWrite callback, no delayed new reads/writes, post-read revocation/expiry, reentrant generation clear and queued publication.

Full workspace build/typecheck/runtime running on frozen source. No real clipboard or OS permission/prompt/capture/input/service/driver/model/handoff performed.
