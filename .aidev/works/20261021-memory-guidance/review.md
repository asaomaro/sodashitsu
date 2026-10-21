# Independent review: remote_work memory guidance

Date: 2026-10-21
Reviewer: /root/review_view_maximize
Worktree: /workspaces/sodashitsu-work-agent
Branch: docs/remote-work-memory-guidance
Decision: APPROVE. No mandatory findings.

Scope: the five-file documentation/string-only diff: docs/remote-work.md, docs/sodactl.md, bundled sodactl SKILL.md, workAgentMcp.ts tool metadata and workAgentRun.ts initial instructions. No protocol schema, persistence or execution behavior changes were present.

Checked against implementation:
- Filenames MEMORY.md/decisions.md match the server's ASCII filename regex,128-character limit, trailing-dot and Windows reserved-name rejection. Memory takes name rather than filesystem path and defaults to MEMORY.md.
- list returns files; read/write return text and SHA256 version. Missing-file creation must omit version, and existing-file update requires a current matching version. Backend validates these distinctions and returns the saved version for readback comparison.
- Dedicated remote_work fixes sourcePaneId to B's launch-request pane; bind-based CLI memory uses A's calling pane. The guidance explicitly distinguishes these namespaces and does not infer loss from another pane's list.
- The CLI returns WorkMemory directly as JSON, so the PowerShell example's top-level version access is correct. Its UTF8 pipeline avoids unsupported PowerShell input redirection.
- Generic failure is not treated as proven disconnect. Diagnosis uses sequential inspect/list/read, distinguishes read success from write permission, and stops when connection/target change or write uncertainty cannot be resolved. No instruction blindly replays writes or falls back to A's local project tools. A failed creation requires reading any concurrent file before considering an update/merge.
- JSON version placeholders are explicitly marked for substitution; actual64-digit read versions are required. The docs consistently use the same filename through creation/read/update/verification.

Lightweight verification: extracted all9 fenced memory JSON examples from docs and bundled skill, substituted the documented version placeholders with64 lowercase hex characters, and validated each with the existing WorkAgentTool and WorkMethods.work.memory schemas. All9 passed. git diff HEAD --check passed. No product files were edited, real remote memory was not accessed, and no full build/test run was duplicated. The implementation session owns its running build/typecheck/related-test results.

Implementation-session validation supplied after review: CLI build/typecheck and3 existing test files/25 tests passed;12 examples including inline/MCP-description JSON validated; isolated real WorkContext covered list/create/read/versioned update/readback and stale-version rejection followed by successful inspect/list/read. examples.log was inspected. This complements the reviewer's narrower9 fenced memory-example checks and does not use production notes or an external model.
