# Verification

Own worktree /workspaces/sodashitsu-audio-ui; Node 24.22.2, own dependency/dist directories. No live assistant/user preferences/real microphone/provider conversations used.

Evidence directory contains raw command output. Full repository build/test is intentionally delegated to root once after integration.

Negative control: restored baseline f696b1ad versions of transcription.ts and tools/recording assets, while retaining regression tests and browser fixture. Both new conversation-context tests failed. Browser fixture received baseline assets over HTTP and failed waiting for the missing draft-transcription control. The unchanged appearance.js dist import is unrelated to this change. All four source/assets were restored byte-for-byte in a finally block; negative-restore.json records each match. Positive checks then ran on restored current implementation.

Package tests cover all five kinds, wrong result revision/context, foreign bubble sender, no automatic prompt/audio send, edited result transfer, disconnect cancellation, pending picker/read/fetch and original owner/TTL/permission tests. Browser fixture exercises actual served DOM, edited draft payload and unsupported native file/mic controls for four kinds. These generated results do not prove real provider recognition or Windows microphone permission behavior.
