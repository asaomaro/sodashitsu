# Codex oversized non-child records

Installed CLI0.166.0 metadata-only inspection found ordinary valid JSONL rows larger than256KiB: response_item (message/custom_tool_call_output/function_call_output), compacted, and event_msg/item_completed/Extension. Root/payload/item discriminator headers occurred in the first4KiB. No actual conversation text was copied into fixtures or this repository.

Primary schema source for text/usage events: https://raw.githubusercontent.com/openai/codex/rust-v0.166.0/codex-rs/protocol/src/protocol.rs (`EventMsg`, serde snake_case, distinct UserMessage/AgentMessage/TokenCount and ItemCompleted variants). The fixed non-child item whitelist also reflects provider metadata actually observed from installed0.166.0. Unknown variants never gain automatic skip permission.

Codex only: retain ordinary rows up to256KiB; beyond that use a streaming syntax/envelope validator. It retains bounded frame stack(depth64), discriminator/key tokens(max768 encoded bytes), key sets(max128 per tracked object), and scalar tokens(max64), but no body text. UTF8, string escapes, scalars, object/array structure, duplicate tracked envelope keys, and trailing data are validated across chunks. Root/payload/item discriminators must finish within4KiB. Only response_item/compacted or fixed known non-child event/item discriminators permit a skip. Important/unknown/invalid/deep/late-header rows remain unknown.

The reader consumes every byte once across calls with4MiB/call and512MiB/file limits unchanged. A partial final line and a historical prefix never publish current activity. Inode replacement/truncation resets both fold and scanner, and normal instance/session/kind/forget/close guards apply. Fresh server session proof remains checked before/after publication. Other provider readers are unchanged.

Tradeoff: a460MiB cold scan can take roughly115 scheduled reads; no new progress UI or enlarged CPU/bytes budget is introduced in this correctness fix. Missing child lifecycle records still mean unknown rather than zero. This patch does not infer child state from unrelated text.
