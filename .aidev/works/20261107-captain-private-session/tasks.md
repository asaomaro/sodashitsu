# Captain dedicated PTY lifecycle

Base f3c346d4 (includes be88 role fix). No real Windows/desktop/agent operations.

- [x] Protocol: exact owned-pane presentation helper; strict device+instance stop; stopping status. Taskcheck: independent root/backend review required.
- [x] Server: explicit stop invalidates queued sends, closes only currently-owned PTY, blocks reactivation until close/persist completion. Existing disabled-idle drain unchanged. Taskcheck: final independent review.
- [x] Visible work-agent counts exclude owned pane, snapshots/terminal attachment, durable bindings, usage/cost/history and saved graph controls remain intact.
- [x] Generated semantic tests, old-runtime negative control, exact byte restore.
- [x] Final fixed-source scoped build/typecheck.
- [ ] Final independent review by root/backend; UI owned separately.

UI contract: isAssistantPane(pane,workspace,tab), only exact binding pane through real tab/workspace. Hide workspace only if no other ordinary pane; dedicated attach uses raw snapshot. Existing stopped/failed retry guards remain. assistant.stop accepts only current ready owner instance; stop RPC result must complete before restart. Start uses existing ensure activate:true. No non-PTY replacement.

Physical retirement: direct underlying PTY exit observer is installed before SessionService.closePane; host disposal remains unchanged on ordinary paths. A 10-second failure retains device stopping gate and last info, not successful completion. Scope/host replacement before close fails closed. Same-workspace siblings survive; their stale captain ownership is detached only after exit proof.
