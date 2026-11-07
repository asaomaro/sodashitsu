# Desktop assistant audio input UI

Scope: expose current direct-audio capability and explicit local Whisper review-to-conversation flow for Claude Code, Codex, Muse Code, Antigravity CLI and GitHub Copilot CLI. Existing five-kind text chat is already implemented. No automatic AI/provider fallback, model launch, actual microphone recording or user-data upload is introduced.

- [x] Use backend-owned pure capability contract (protocol 4c09425a; local equivalent 77b34a7c). Native support and current actor readiness are separate.
- [x] Show native unsupported reason and explicit Whisper alternative; Whisper integration does not imply installed engine.
- [x] Allow reviewed/edited local transcript to become a conversation draft, with separate user send.
- [x] Bind job/revision/recording to current server, actor and conversation; reject stale/foreign requests. Taskcheck required for this boundary; covered by package regression cases and pending independent integration review.
- [x] Preserve fixed IPC actions, owned media, cancellation and TTL; renderer does not supply file paths.
- [x] Run generated browser UI fixture and package tests with raw evidence; run old-code negative controls and exact byte restoration.
- [ ] Independent cross review and any correction re-review: coordinated by root after integration.

Current direct file input is Codex only; other kinds use explicitly configured local Whisper. AGY native attachment research belongs to backend and is not claimed here. Actual CLI recognition quality, physical mic/Windows permissions and model recognition are outside the generated-fixture validation.
