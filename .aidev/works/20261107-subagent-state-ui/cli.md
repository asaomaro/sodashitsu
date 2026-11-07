# CLI state/membership preservation

agent get/list already print JSON only; no new human mode or flag was added. Preserve explicitly supplied countBasis and child state, and keep the legacy omitted-field shape. CLI docs explain alive as membership and unknown as unavailable working status. Token-usage formatting is a separate capability and remains unchanged.

61 related tests pass, including actual get/list command serializers for Codex/Muse/Copilot/AGY and omitted-field compatibility. Baseline agentStatus.ts fails 5 new cases; exact bytes restored (cli-restore.json). Raw logs retained. Full CLI package typecheck was attempted but lacks this fresh worktree's server dist prerequisite; no errors in changed files were reported. A focused typecheck extending the same CLI config checks the changed serializer/tests/entry-command dependencies separately. Root owns full integration build/typecheck; no duplicate server build requested.

Audit: rg of subagentsViewOf/count/items selectors found this CLI reconstruction and Dashboard row count reconstruction (fixed in the UI commit). Raw pane/AgentInfo transport through WS, machine summaries and MCP does not project a count/items-only child shape; token breakdown subagents is a separate model and was not changed. Child transcript capability remains separate.
