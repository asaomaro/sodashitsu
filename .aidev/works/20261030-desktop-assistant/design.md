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

## B3a native dedicated bubble conversation

A separate fixed-method native-main socket handles dedicated-session requests and ConversationService records. NoticeConnection remains read-only. Authentication cookies stay in main; TLS verifies existing authorities. Sixteen pending operations, monotonic10s hello/20s responses and20s ping/10s pong bound silent connections. Reconnect never replays commands. A complete, exclusively published installation UUID is stored separately from editable preferences.

The native controller requires the displayed revision and intended instance; device/pane selection belongs to main/server. Start is explicit and lists available registered agent kinds. Reconnect discovers existing state, and only the server's verified initial launch can be claimed automatically. Adoption requires the observed instance selected by the user. Blocked confirmation is not converted to a chat prompt. Conversation output is rechecked against the current dedicated actor after the asynchronous read, bounded to100 literal messages, and resumes at complete-record offsets. A same-actor conversation clear resets the cursor before reading from zero.

This phase supports Claude/Codex conversation records. Other agent kinds and terminal/ask-form/plugin views still use the ordinary isolated Soda window; automatic exact-pane expansion and exact-notice replies remain B3b/C. A native bubble starting successfully is not evidence that real agent login/model operation or Windows GUI works on a device.

## D1 local standard tools and file transcription

Built-in local notes use UUIDs,200 records,8192 characters each,16 pending mutations, bounded8MiB input/output JSON, serialized atomic writes and corruption preservation. Clipboard text is read only by the current bubble's explicit action (8192-character bound); no watcher/synchronization is added. Summary/translation only prepare a visible prompt draft; the existing scoped chat send remains a separate explicit action. Read-aloud chooses only Web Speech voices marked localService, and stops on hidden/pagehide. Missing local voices are shown as unavailable, never silently routed to an online voice.

Transcription is disabled by default and requires an explicitly configured loopback-only HTTP whisper.cpp service. Native main selects a regular audio file through an owned OS file dialog; renderer never supplies its path. Read25MiB at most, one physical picker/read/inference operation including retirement after cancellation,5min monotonic read+inference budget,1MiB response and65536-character preview. No Cookie/credentials/redirects are forwarded; only multipart file/auto language/JSON format are sent to fixed /inference. Disable, origin change, hide/close and cancel invalidate the generation and abort the client request; stale results are discarded. Aborting HTTP cannot guarantee cancellation of inference already executing inside an independently running Whisper process. Nonregular/symlink audio is rejected before nonblocking open, the handle is checked again, and pre/post identity/size/change metadata are compared. Native calls already pending may finish after cancel; no new operation starts until retirement. Clipboard reading locks the shared note editor until the asynchronous response arrives.

No recording, model download, engine launch, automatic agent send or cloud provider is introduced in this phase. Microphone recording remains D2/H.

Primary implementation reference verified2026-10-30: https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/README.md and server.cpp (multipart language/response_format and JSON text result). Formats beyond WAV require ffmpeg and whisper-server --convert. Native OS speech/file/clipboard, actual Whisper model accuracy and capture are unverified; generated tests inject fake adapters and Responses only.

## D2 explicit microphone capture

One main-owned RecordingLease UUID binds a visible/current bubble to microphone-only Check+Request permissions. Remote Soda, non-main frames, camera/display capture and other local roles remain denied. Capture and review each have absolute5min budgets; owner/token/phase must match and upload consumes the lease once. Renderer getUserMedia/MediaRecorder waits cannot be superseded until retired; a late granted stream is stopped after cancellation. A completed recording is reviewed, optionally listened to, explicitly sent to local Whisper or discarded; no automatic model send. Audio remains bounded25MiB and uses the same one-operation/retirement/response/time limits as selected files. Expected-key cancellation cannot touch a later file/record job.

Hide/minimize/navigation/settings disable/engine change discard capture. Capturing-lease expiry destroys the owning bubble even if its renderer cannot respond. Tools collapse cancels, and a persistent indicator/stop control is outside the tools scroll area. Closing captures the WebContents id before destruction. Bubble layout is400x640 clamped to work area, with compact chat controls and small-height scrolling. Playback Audio is instantiated only after explicit listen, not on stop/upload; URLs/players are released on discard.

Generated verification uses fake getUserMedia/MediaRecorder and mocked native permissions/dialog/RPC/inference. Final UI does not mock a media preview element: Audio creation is deferred until explicit listen, which the generated flow does not click. It does not record/play real audio. An isolated valid-WAV audio-element+Blob probe also stalls in this WSL browser, while bare Blob reading passes. IntersectionObserver/rAF geometry waits also stall; generated UI uses synchronous browser DOM rectangles instead. Real Windows microphone permission/capture/codec/playback and local model accuracy remain unverified. Primary permission reference: https://www.electronjs.org/docs/latest/api/session (also checked installed Electron45.1.0 definitions).


## D3 local OCR

Use explicit OS-copied PNG clipboard input or parented native PNG picker, not a screenshot watcher. The modern Windows Snipping Tool protocol requires MSIX packaging/redirect handling and is deferred from the current zip stage; no deprecated URI launch is used. PNG headers and regular-file identity are checked before native decode; maximum8MiB/3840x2160. Preview, integer pixel crop and recognition are separate user actions. Fixed local Tesseract executable/argv, stdin pixels, restricted environment, no shell/network;60s monotonic budget/output256KiB/result65536chars. Protocol preferences default off, absolute engine path and bounded language list. No pixel data in generic state events; explicit preview response only.

Ephemeral image UUID/owner/current generation, absolute5min image lease, single physical operation retained through cancelled I/O/child retirement. Hide/minimize/navigation/close/settings change aborts and clears pixels/result. Crop rechecks the original lease after native work. Common editor import uses the existing notes serialization fence and resets note identity. No agent send on OCR/import. Native permission policy remains audio-only for the separate recording lease; no new display permission.

Taskcheck required for lifecycle/protocol/child boundary; independent whole and correction reviews required. Generated mocks only; no actual clipboard/screen, Tesseract, user microphone or model execution in verification.
