# Completed-child history: independent contract/collector checkpoint

Base integrated33f10550 plus Cursor6654 helper (local duplicateb79c; root skips the duplicate). This checkpoint contains only shared protocol declarations and a private bounded collector. **No server RPC handler, native-reader/compose wiring, hook intake/installation or Web/TUI presentation is registered. It is not the completed user feature and has not been tested against actual CLI child events or Windows.** Root priority is the Codex long-record observer fix, then native wiring and completed history in order.

The separate API is agent.subagent_history. Its bounded params contain paneID/index/limit/revision only, no path. Results distinguish unavailable/pending from a known ok empty collection; terminalStatus is explicit and never inferred from !running/stateunknown. Optional formal dates/model/effort remain absent when unknown. Native transcript results add optional terminalStatus, preserving old running/state behavior.

The collector uses current exact pane/instance/kind/session plus fresh verified session, keeps at most64 source states and256 entries/source, and caps public pages at64. It stores only whitelisted scalar metadata and four source identity fields. Source object property order/extra payload cannot affect equality or retention. Revision changes reset pagination; overflow is explicitly omittedBefore. Each read/grant revalidates its owned-record callback before/after scope and authorization checks. Four physical verifiers maximum and1500ms caller lease; late jobs retain slots until real completion and cannot mutate returned arrays. Missing/failed proof stays pending/unavailable, never a fabricated zero. It does not mutate agent.subagents, raw panes/layout, graph controls, active counts or usage/cost.

## Verification

- Protocol build and full protocol typecheck exit0.
- Protocol1 + collector10 selected tests pass.
- Collector+tests focused strict/exactOptionalPropertyTypes typecheck exit0 after full valid Pane fixture correction. No full repository test rerun.
- Controlled strict-params/parent-scope/model-basis/physical-slot mutations produce protocol1fail and collector4fail; all product bytes restored exactly, then1+10pass. Raw output and two SHA receipts are retained.
- Initial object-serialization identity comparison rejected a reordered exact source and could retain unknown source payload. Its isolated pre-fix comparison/spread mutation fails1 regression; exact restoration returns all10pass.
- The scope tests cover parent instance/ref-kind/session loss, post-await rejection, grant retirement, authorization loss, stale page revisions, late replies, bounded paging/omission, unknown model/time, whole-pair replacement and no active-count mutation.

## Remaining separate units

After the root's top-priority Codex fix is fixed/integrated: rebase and register Grok native reader while preserving its new Codex observer; add bounded Cursor Stop/child-self AAR intake without parent usage/count attribution or blocking IPC acknowledgment; connect formal terminal sources to this collector and read-only authenticated RPC; then same-window Web/TUI completed-child UI and transcript grants. No automatic global hook/config mutation. Existing explicit integration update/install flow only.
