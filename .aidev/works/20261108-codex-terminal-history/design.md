# Codex terminal history

Scope: existing authenticated history RPCs only; no new RPC, command, input, model turn, Windows action or active membership change. Base 42f5c013 (c900 has the same product source).

The provider-owned SubAgentActivity start relation must precede a completed/interrupted terminal. Timestamps come only from valid formal rows; no arrival clock. Interrupted is aborted, never success. A followup, new start or unknown lifecycle removes the old terminal fact. All prior active/alive folding remains unchanged.

The existing 4MiB/512MiB incremental parent fold provides complete EOF. No independent full scan per history read. The head session_meta must match exact parent UUID and cwd; scalar/oversized records before it cannot manufacture a head. Per-reader random namespace plus bigint device/inode/size/mtimeNs/ctimeNs seal invalidates replace/truncate/same-size rewrite. Same-size rewriting resets the original fold too. Ordinary appends temporarily deny old reads until EOF and fact revalidation; unchanged facts retain the collector entry/grant.

A long-lived service closure validates source/kind/instance/ref/fresh/cwd, independent of an individual list request lease. Parent verification uses at most four simultaneous tasks, slots retained through FD close and fresh checks after async close. Transcript and numeric readers use the existing safe exact child opener and its explicit child→parent relation. All returned data are checked again against parent namespace/revision/current scope. No current-child fallback from an old entry. Model/effort are omitted from terminal rows rather than exposing creation settings as latest settings.

Limits: existing 256 proven child relations, 20k deduplicated lifecycle events, 64 response rows per page/256 collector entries, incomplete=true. Child public response text only; no reasoning/tool body. Existing child-only numeric engine preserves scanning/partial/unknown, response dedup and excludes inherited thread cumulative usage. No extra whole-record parse or raw contents are stored in proof state.

Taskcheck/final cross required: provider-state/proof/security change. Independent final review is requested from the separate API agent after source/evidence freeze. Tests use generated records and isolated fake CLI/PTY only.
