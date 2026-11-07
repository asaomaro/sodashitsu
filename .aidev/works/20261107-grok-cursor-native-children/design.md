# Grok / Cursor formal child acquisition

Base: integrated 0ee709d0. No production, Windows, user conversation, real credential, external model, or normal configuration operations.

## Evidence and scope

Installed Grok 1.0.77 generated one native child and completed it against an owned deterministic loopback API in a unique network namespace. Synthetic authentication only. Final fixture: exit 0, 516 ms, no timeout. The native child used no tools. Parent updates.jsonl has the structured `_x.ai/session/update` envelope and exact parent/child/attempt identities. Its resolved creation model is grok-4. Output prose is removed from the retained envelope. No ModelChanged was emitted; later model/effort supplementation remains source-schema validation, not a successful live observation.

Cursor installed 2026.11.05-86047df stores exact subagentInfo(parentAgentId/rootParentAgentId/toolCallId/typeName) and writes the child's JSONL under the direct parent. Its Start hook is before permission and is not start proof. Stop contains child_conversation_id, parent_conversation_id and common model_id/model_params. JSONL itself contains messages and turn_ended only, not model settings. Plan: require formal Stop + safely opened lineage + direct child file for completed-child settings/history. No new global hook installation.

## Ownership and checks

First implement dedicated Grok fold/reader helpers and fixture tests. NativeReader/Service/compose dispatch changes wait for backend's extra-history fixed commit. Root coordinates the protocol's additive creation/session model basis with UI; creation values stay hidden in current UI. Raw model launch flags, parent model and name suffixes are never child settings evidence.

Taskcheck: protocol additions, record parsing, safe file ownership/scope and production wiring need independent review. Evidence/docs only are included in final cross review. Test old product/helper mutations where meaningful, exact byte restoration, fixed-source type checks. No duplicated full test run.
