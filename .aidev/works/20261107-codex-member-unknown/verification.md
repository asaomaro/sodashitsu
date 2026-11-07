# Codex owned membership after completed/interacted

Production read-only diagnosis found the exact parent record fully readable but NativeSubagentRecords returned undefined for all three owned children because task completion was followed by formal interacted records. Each had a prior formal started in that same parent. No actual conversation text, names, IDs, or prompts were copied into fixtures; the three-child JSONL fixture is generated from schema structure only.

Primary0.166 schema:
- https://raw.githubusercontent.com/openai/codex/rust-v0.166.0/codex-rs/protocol/src/items.rs (SubAgentActivityItem id/kind/agent_thread_id/agent_path)
- https://raw.githubusercontent.com/openai/codex/rust-v0.166.0/codex-rs/protocol/src/protocol.rs (SubAgentActivityKind)

Codex-only ownership proofs retain at most256 formally started children for the exact parent. Completed removes work but retains affiliation proof. Only a later formal interacted to that proven completed child permits stateunknown/countBasisalive; it never asserts task start. Working members mixed into that snapshot have explicit stateworking. Completed-only history is absent; a new completed removes unknown membership. Interrupted/unknown kinds invalidate reuse proof until another formal started. Unowned references, malformed lifecycle records, unsupported states, missing/bad files, incomplete history and unverified fresh service scope remain unknown. Other providers and API contracts are unchanged.

Final source/tests fixed before checks:
- Five related test files:85 pass (tests-restored.log).
- Server TypeScript project build:exit0 (build.log).
- Server noEmit typecheck including test fixtures:exit0 (typecheck.log).
- Old snapshot implementation fails the generated three-owned-child regression. Fixed source restored byte-exactly; raw output and SHA256 in negative-control.md.

Read-only compiled-reader sanity on the real parent reached EOF in112 bounded4MiB calls (462470065 bytes), invalidfalse/partialfalse/malformedfalse, and returned alive2/unknown2 (real-record-metadata.json). The third originally uncertain child had a newer formal completed at2026-11-07T06:15:38.548Z, so excluding it matches the latest record. The generated three-child regression returns alive3; the code does not force the real result to remain three. No production inspector/injection, model turn, pane input or sr-pc operation was performed. Public snapshot does not expose fresh-session proof; the service fresh check is unchanged. Independent review/integration and actual public UI verification are coordinated by root.
