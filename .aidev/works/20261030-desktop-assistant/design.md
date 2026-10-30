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
