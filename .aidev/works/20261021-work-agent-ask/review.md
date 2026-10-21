# Independent review: work-agent operator ask-form

Date: 2026-10-21
Reviewer: /root/review_view_maximize
Worktree: /workspaces/sodashitsu-work-agent
Branch: feat/remote-work-local-ask
Decision: APPROVE. No mandatory findings.

Scope: the protocol guard, dedicated MCP ask_user metadata/routing, launcher AskService integration and cleanup, native allowed-tool strings, documentation/skill updates, and new unit/E2E coverage. Product files were not edited.

## Authority and local I/O

- Only the new ask IPC operation reaches A's AskService; remote_work keeps the existing B route. The parent chooses A's already-created pane and a new unpredictable owner ID. Caller-provided top-level pane/machine overrides are rejected by a strict parameter schema.
- checkWorkAgentAsk normalizes the ordinary ask-form spec before inspecting accepted references, rejects view.file including normalized path forms, and rejects accepted option image/audio references. Unknown raw spec fields are not used to select I/O or target; AskService normalizes again before preparation.
- Inline views carry text only. Markdown documents supply bodies, not file paths. The parent creates exclusive random .md files under its private launch directory, using the existing0600 writer, then passes only those parent-chosen paths to the existing viewer pipeline. No general authentication cookie is exposed.
- Existing Markdown iframe isolation was checked: no same-origin grant, default-src none and img-src data. Embedded remote Markdown cannot fetch arbitrary A/LAN resources through image references; links use the existing constrained viewer behavior.
- Combined definition/documents256KiB,8 total views, per-document and timeout limits remain bounded. Dedicated native tool approval adds only ask_user beside remote_work; no local project tool or sandbox permission is enabled.

## Lifecycle and races

- The job owner is attached before asynchronous document creation. Cancellation while files are being created sets owner.cancelled; the post-creation check returns cancelled before AskService.open. Launcher cleanup also makes check fail, so an early onClientGone before registration cannot be followed by an orphan form.
- No await occurs between the final cancelled check and synchronous AskService entry registration. Later cancel/socket EOF uses the exact random owner, closing that form and aborting pending media preparation. Lease cleanup/pane close/server shutdown retain their existing cancellation paths.
- Success, unavailable, timeout, cancellation or preparation failure all reach finally, which calls onClientGone idempotently and removes the chosen temporary document files. Another pane's or owner's ask is not cancelled.
- Answer JSON is returned through the existing dedicated MCP connection; cancelled/timeout/unavailable are not represented as approval, and instructions prohibit assuming defaults. Five-minute form wait fits within the320-second IPC and330-second native tool limits.

## Verification

The E2E observes the actual A dialog and Markdown iframe heading, verifies B has no pending asks, submits and checks answer JSON, closes via Escape, then ends the real MCP child's stdin and observes dialog disappearance plus ask-file deletion. The fixture native CLI is intentionally separate from the real MCP child; this verifies the product MCP/AskService/browser path without a real model call.

Inspected supplied logs:3 related test files/13 tests passed; Chromium E2E1 passed (13.0s). git diff HEAD --check passed. Full typecheck/remaining checks are owned by the implementation session and were not duplicated. No real remote notes, desktop capture or OS input was used by this review.
