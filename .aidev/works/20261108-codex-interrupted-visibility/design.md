# Codex interrupted child ownership

Keep exact-parent, bounded formal start proofs across both completed and interrupted turn events. Neither terminal event alone counts as membership. A later successful formal interacted event rejoins the owned child as alive with unknown task state. Unknown lifecycle semantics, absent/foreign start proof, namespace replacement and malformed/budget guards remain fail-closed. No fresh/verified gate, public contract, runtime status lookup, count limit or UI change.

The installed CLI reports 0.166.0. Primary pinned implementation emits Interrupted after the targeted interrupt succeeds; followup_task uses TriggerTurn delivery to the same existing agent; message_tool emits Interacted only after successful send:
- https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/tools/handlers/multi_agents_v2/interrupt_agent.rs
- https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/tools/handlers/multi_agents_v2/followup_task.rs
- https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/tools/handlers/multi_agents_v2/message_tool.rs

Read-only diagnosis of the unique, formally corroborated parent scope found a 486.9 MiB record fully folded at EOF: invalid=false, partial=false, limited=false, malformed=false. Two remaining uncertain children both had formal started events, then interrupted followed by interacted. Retained relation count for these uncertain children was zero. Counts may naturally change; no fixed count is assumed. No IDs, conversation content, credentials or real paths are recorded here. Production was not instrumented; diagnostics used a separate own Node process with existing safe record access and metadata-only output. No model/send/Windows operations.

Scope: one production fold module and two regression suites. Independent final review is required. Cursor private intake remains paused at its durable checkpoint; usage and other pending work are not completed by this fix.
