# Verification

Own worktree /workspaces/sodashitsu-audio-ui; Node 24.22.2, own dependency/dist directories. No live assistant/user preferences/real microphone/provider conversations used.

Evidence directory contains raw command output. Full repository build/test is intentionally delegated to root once after integration.

Negative control: restored baseline f696b1ad versions of transcription.ts and tools/recording assets, while retaining regression tests and browser fixture. Both new conversation-context tests failed. Browser fixture received baseline assets over HTTP and failed waiting for the missing draft-transcription control. The unchanged appearance.js dist import is unrelated to this change. All four source/assets were restored byte-for-byte in a finally block; negative-restore.json records each match. Positive checks then ran on restored current implementation.

Package tests cover all five kinds, wrong result revision/context, foreign bubble sender, no automatic prompt/audio send, edited result transfer, disconnect cancellation, pending picker/read/fetch and original owner/TTL/permission tests. Browser fixture exercises actual served DOM, edited draft payload and unsupported native file/mic controls for four kinds. These generated results do not prove real provider recognition or Windows microphone permission behavior.

## Independent review correction: preserve tools on audio context changes

Context retirement previously destroyed the recording owner window, losing unrelated unsaved tool input. It now invalidates the main-owned lease first and sends the existing token-scoped recording-cancelled event, retaining the tools window. Existing renderer cancellation stops MediaRecorder, releases tracks, drops clip/pending permission results; main rejects old stop/complete even if renderer ignores cancellation. Other existing lifecycle/expiry policy was not broadened by this correction.

Raw follow-up results are in evidence/preserve-tools. Baseline HEAD main.ts with new tests fails all five kinds on tools.isDestroyed (negative); main.ts then restored byte-for-byte (SHA in restore.json). Full 289 package tests and typecheck pass after restoration. Actual served browser DOM cancellation verifies recording track release, enabled controls and unchanged unsaved memo; this browser fixture does not execute Electron main, whose non-destruction is covered by main.test.ts. No actual microphone/user data used.
