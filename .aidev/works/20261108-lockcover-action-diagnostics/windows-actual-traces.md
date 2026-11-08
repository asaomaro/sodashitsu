# Root-owned actual lock-cover metadata (2026-11-08 UTC)

This docs-only record uses the whitelisted fixed metadata from the private receipts. Receipt byte hashes and sanitized values are in windows-actual-traces.json. No raw stderr, PIN/input content, pixels, identities, private paths or arbitrary exception is copied. Runtime source remains 437df4ea; the observed deployed revision was 94d6596e0c0a346a66c278f2a7ce664750ecad7c. Root performed the Windows operations; author performed none.

## Third and fourth explicit operations

| Operation | Recorded time | Fixed sequence | What it proves |
| --- | --- | --- | --- |
| Third | 14:24:27.092–14:24:27.124 | dismiss_authorized → wake_selected → wake_returned → dismiss_returned | The normal cover selected and returned from wake-only; no Enter is reported in this sequence. |
| Fourth | 14:29:23.421–14:29:23.516 | dismiss_authorized → enter_selected → enter_result inserted2 → dismiss_returned | The guarded visible-cover Enter branch called SendInput once and it reported 2 inserted events. This is insertion acceptance, not proof of target delivery or unlock. |

Both trace receipts report logIdentityMatched=true, clipped=false, pinSent=false. Root reports PIN 0 and arbitrary keys 0. Each operation used a newly acquired source/control context; no prior source grant is treated as reusable.

## Later cover observation is not the immediate Enter result

The saved post-enter viewer metadata has frames 0, backend=windows-gdi, secureDesktop=true and lockScreenCover=true. Root identified its observation time as approximately 14:35, around 6 minutes after the 14:29 Enter. The view receipt itself has no timestamp, so that approximate timing comes from root's investigation rather than an invented receipt time.

No immediate post-Enter image/source observation was made in this record. The delayed cover could be compatible with an idle return, but neither that cause nor an Enter failure is established. The cover source intentionally captures no images, so frames 0 in cover is not by itself a capture failure. It does not show whether Winlogon had appeared between 14:29 and 14:35.

## Source/Windows idle boundary

The existing WakeLockScreen calls SetThreadExecutionState(2) once. It does not set ES_CONTINUOUS, periodically renew display power requirements, or implement a 6-minute return timer. [Microsoft's API documentation](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate) says the display-required flag resets the display idle timer; without continuous state it is not a sustained keep-awake request and does not stop a screen saver. These API facts do not reveal this PC's effective Windows idle/LockApp/policy timing and do not establish the cause of this particular delayed view.

Root's next plan is a bounded adjacent wake → fresh source/control → one guarded Enter → immediate fresh source/image observation, with frames maintained for any separate PIN processing. Every phase requires its own new ready/control and original guards; no skipped phase, old source reuse, policy change or blind unknown-state repetition is authorized by these diagnostics. This file implements no source change, power setting, extra input or automation, and claims no subsequent result.
