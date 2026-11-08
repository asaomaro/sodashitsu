# Child numeric usage checkpoint

Base d631c935. Protocol c75ce993; shared current resolver depends on original 9164d6e0 / 8d92b533 / 3e053ba5 (picked independently). No main push or production mutation.

Numeric/service/current-source/RPC checkpoint only. 25 selected tests pass; server test-inclusive noEmit exit0 using this workspace's protocol build. The CLI serializer derived artifacts were copied from the source-identical current d631 build after cmp; an initial worktree typecheck failed only because those preexisting Grok test imports lacked cli/dist. No shared build output was changed.

This is NOT final acceptance: provider opener positives beyond Codex, production compose RPC/negative-control evidence, final fixed-source typecheck, independent review and UI integration remain. Historical grants are not manufactured: current verified membership only until the shared conversation resolver supplies separately authorized historical bindings. Copilot/Cursor per-child numeric records remain unavailable. The number reader never uses account/week/parent totals.

Codex uses exact-child, post-birth token_usage_record.usage per completed response with response_id dedup, never thread_token_usage or turn_token_usage. Partial/scanning are explicit, absent counters are not zero. Context comes from a post-birth last_token_usage sample. Claude/Muse/AGY reuse established per-call shapes. USD is reported only by exact-child Grok usage.json; its ledger includes descendant attribution, so consumptionScope=subtree.

Source proof:
- https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/protocol.rs (TokenUsageRecord: one completed response)
- https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/tests/suite/token_usage_rollout.rs (Responses 120/80/30 vs turn cumulative 120/200/30 and thread cumulative 120/200/230)

Actual read-only numeric-schema metadata check: 3 owned child files ~77.6/68.4/71.9MB, token_usage_record 2074/1756/1793, all exact child thread and after birth, foreign thread 0. Complete scan 450ms, scope and child fd/path revisions stable. Recorded only counts and provider field names, never body/real IDs/path/counter amounts; model calls 0. This confirms schema availability, not an API deployment result.

Current explicit queries advance 4MiB each, 64 caches, at most4 physical operations, total2-second service deadline and no same-child duplicate in flight. Slots remain held until old physical work/close finishes. No body buffer persists between requests. Cache binds source instance/parent/child/birth and exact file ns revision; rotation, truncate, same-size rewrite and scope invalidation discard prior values.
