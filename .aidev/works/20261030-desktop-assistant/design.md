# Architecture and staged implementation

Electron45.1.0 host: existing TypeScript/Web terminal and ask-form code can be reused; Tray, transparent non-focusing character window and focusable panel are separate. Windows host connects to the existing Soda server in WSL. Electron main owns OS capabilities; sandboxed/context-isolated renderer has nodeIntegration=false. Verify every IPC sender's current main frame, role and generation. Local character/settings assets use a fixed app scheme and strict CSP; external navigation/popups are denied or opened only through validated HTTP(S) actions. Native permission handlers deny unsolicited capture/media requests.

1. Shared validated preferences/contracts, native shell lifecycle and settings persistence. Disabled by default. Local geometry, startup and server endpoint rules. Asset-only male/female captain defaults. No native UI launched by imports/tests.
2. Authenticated Soda connection, bounded notification feed and correlated source selection; persistent dedicated-session manager (serialized ensure/stop, exact ownership/generation, registered agent kinds only). Connect/reconnect never duplicates agent or runs a model for notice formatting.
3. Assistant panel using existing terminal/ask-form/display/controller code. Keep source/project/machine visible and reply target pinned. Atomic existing form answers remain server-authoritative. Dedicated chat has a separate explicit target.
4. Explicit selected-screen/window/region capture and local OCR worker, bounded image lifetime/size and preview. No automatic upload. Surface capabilities truthfully when OS support is unavailable.
5. Extend existing plugin manifest for asset-only characters, assistant view placement and allowed actions. Project plugin approval is unchanged; native actions cross a separate narrow consent boundary. Packaged app/CLI launch and documentation, generated native/browser/Windows verification.

Keep each deliverable below a few dozen files. Fragile taskcheck: settings persistence, launch/reconnect/stop ownership, native IPC/capture, plugin trust and response correlation. Independent final whole-diff review is mandatory, plus delta review for corrections. Source full suite once; receiving root uses guarded three-way merge, related tests/browser and clean external smoke rather than repeating all tests. Existing root worktree is never reset/switched/pulled/committed.

Primary references read2026-10-30:
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/tray
- https://www.electronjs.org/docs/latest/api/desktop-capturer
- https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture

Version metadata verified from npm: electron45.1.0, electron-builder26.18.0. Framework choice is for shared Web/TypeScript behavior; no third-party implementation code is copied.

## B1 authenticated notices

A separate native-main read-only WebSocket connects using Electron URL-filtered Soda cookies (default/named sessions). It requests client.hello and notification.state only; no terminal subscribe/input/agent starts. The projection validates and retains at most4096 panes/tabs/workspaces,32 notices and512 shared resolutions. Per-pane current agent markers avoid replay storms with more than512 live agents. Current event key/instance/parent/state must still match. Completed work is announced only while idle, not after a subsequent working state. Shared resolutions precede initial delivery.

All callbacks have generation fences; absolute monotonic handshake budget10s and ping20s/pong10s bound silent links, including timer-late callbacks. TLS uses existing Node/default/system CAs, verification enabled and no redirects. Cookies never cross renderer IPC. Inbox updates have monotonic revisions so a delayed initial RPC cannot overwrite a newer push. Notifications open the bubble inactive; explicit user chat focuses it. Muted notifications remain in the bounded inbox without opening a window.

Primary TLS API reference: https://nodejs.org/api/tls.html#tlsgetcacertificatestype . Windows OS trust behavior still requires native-device verification; generated TLS tests use an internal in-memory trust adapter and existing test-only PEM fixtures, never install OS trust.

## B2 dedicated server session

Authenticated `assistant.get/ensure/adopt/prompt/send_keys` use a stable per-installation UUID. The server derives an injective full-UUID agent name within32 characters, reserves one private state-directory workspace per device, and persists the launch-request marker before the fixed registered-agent starter can write. Reconnection never retries a recorded launch. Explicit retry requires an empty available shell and preserves the old terminal in a separate untagged workspace. Creation is serialized across devices, bounded at32 owners and16 pending requests.

Runtime ownership pins exact pane/workspace/project/instance identities. Restored conversation references require actual restore provenance plus fresh current-agent hook/argv evidence; a retained session string or matching name is insufficient. A requested-only saved marker cannot grant authority. Initial adoption requires the actual instance accepted by a launch reservation; replacement invalidates that evidence even before the manager reads the first actor. An explicit `adopt` request can select the current observed actor when a live handoff lacks new evidence; saving temporarily disables input, checks generation/current actor after flush, and rolls memory back on failure. It sends no terminal input. Conversation serialization requires both matching owned instance and fresh evidence. Prompt/key forwarding reuses existing agent methods and checks the pinned target again in the final queued terminal build. These UUIDs are correlation identifiers inside an authenticated Soda account, not a separate authentication secret or security boundary against the account owner.

Handoff suspends and drains pending session operations before takeover; a failed handoff can resume without reviving old-generation requests. Disabling native display does not kill submitted work. This phase is the server API only: native bubble chat/adoption/agent-kind selection still require B3.

## Standard assistant tools

Transcription supports explicit microphone start/stop/cancel and user-selected audio files, bounded recordings/uploads, a visible processing route (local or external) and result preview before sending to an agent or saving a note. No passive recording or background upload. A provider that is unavailable must be shown as unavailable; accepting a file alone is not successful transcription.

Read-aloud, selected-text summary/translation, local notes and reminders via the existing scheduler accompany chat/OCR. Use the same bubble to show results and distinguish a dedicated assistant conversation from replies to a specific source. Summary/translation are explicit model requests; formatting notifications is model-free. Expensive/capture/clipboard/plugin actions remain narrow capabilities, not arbitrary renderer shell access.
