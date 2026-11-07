# Cursor formal child-binding helpers

Base: f2fa17aa (Grok helper checkpoint on0ee709d0). Composite NativeReader/Service/compose/transcript wiring is deliberately deferred until root's Codex long-record observer integration. This helper does not register hooks or start a CLI/model/SDK.

## Installed primary contracts

Cursor2026.11.05-86047df installed1623.index.js: `./src/state/index.ts` derives chatsDir as configRoot/chats/md5(resolve(cwd)); `./src/subagent/cli-subagent-host-adapter.ts` creates childUUID/store.db and persists `subagentInfo` with parentAgentId,rootParentAgentId,toolCallId,typeName. Both parent IDs must match the exact verified direct parent. Root lookup is a bounded1000-group/1sec exact-parentUUID walk, not a guessed newest chat.

index.js `../cursor-config/dist/paths.js`: configRoot is nonempty CURSOR_CONFIG_DIR, otherwise XDG_CONFIG_HOME/cursor, otherwise ~/.cursor. CURSOR_DATA_DIR is a different root used by project transcripts; it must not be used as the SQLite root.

index.js `../agent-kv/dist/index.js` metadata serializer writes meta[0] as hex-encoded UTF8 JSON containing agentId,createdAt,subagentInfo. No model fallback is taken from lastUsedModel or parent settings. Node sqlite's normal SELECT never targets an original CLI database.

1623 transcript writer and7923 transcript paths/serializer place the child under the direct parent's agent-transcripts/<parentUUID>/subagents/<childUUID>.jsonl. JSONL messages do not carry model parameters. The actual last complete `turn_ended` marker alone distinguishes success/error/aborted; later input or a partial tail invalidates the old terminal marker.

index.js formal subagentStop has parent_conversation_id,optional child_conversation_id,subagent_id,subagent_type,status,optional conversation_id/model/model_id/model_params. Start is before permission and is never a started/working observation. Stop status and exact lineage/type/last child terminal marker must agree. Common model/effort fields are accepted only when conversation_id and any supplied session ID are the exact child itself. These are selected-session observations, not a claim that a particular model actually served a successful turn. A parent-common model produces an empty child-settings pair even when Stop/DB/file all match.

## Bounded private-copy SQL

- Exact directory/path/regular-single-file/nofollow fds before/after read. Parent/current-scope checks bracket all asynchronous work.
- ChildDB32MiB/WAL8MiB, one256KiB copy buffer per job; parent/child JSONL max512MiB, terminal tail256KiB.
- Two physically outstanding jobs per reader,2sec caller lease; expired/forgotten scopes cannot return fds or late settings. A stuck physical operation keeps its slot until completion rather than spawning more jobs.
- Copy DB/WAL via verified fds to own0700 temp directory/0600 files. Source revisions rechecked, and temp deleted after the fixed SQL Node worker physically closes. If close cannot be confirmed, retain temp/slot until its close event.
- Fixed SQL only; original DB never opened by SQLite. Only exact official `meta(key TEXT PRIMARY KEY,value TEXT)` table schema is queried. Views/generated SQL are rejected before evaluation. SQL value cap262144 hex characters. Extensions disabled/trusted_schema off/readOnly/query_only.
- Worker has no provider/Node preload/SODA environment; no shell, CLI, SDK, model, descendants or OS policy operation. Static worker code, private path over bounded stdin, output only sanitized lineage. Hard deadline kills only that worker.
- Cache64 entries keyed by exact parent/child and complete DB/WAL identity/revision. Unchanged reads do not recopy a wholeDB; all source/path/transcript/scope checks still run.

## Verification scope

All databases, transcripts, hook payloads and preload sentinels are generated isolated fixtures. No existing user DB, credential, conversation, model request, Windows, remote process or installed CLI child was operated. Actual Cursor child hook emission and self-context model parameter availability remain unverified; do not describe schema tests as real acquisition success.

Taskcheck/final independent review applies to this protocol-adjacent ownership/file/process work. No duplicate full repository tests.
