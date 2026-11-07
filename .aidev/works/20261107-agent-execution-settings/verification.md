# Final verification

All source and fixtures were fixed before the final sequence. Node24, independent offline-installed worktree dependencies, no live dist/node_modules mutation.

- Related10-file unit suite:94pass (`unit-tests.log`).
- Real composeServer + isolated fake Claude parent:2integration cases pass (`integration-tests.log`): hook-only metadata without prior numeric usage, preserving observations across statusline cost, and rejection of unrelated PID reports.
- `pnpm exec tsc -b packages/server`:exit0 (`build.log`).
- `pnpm --filter @sodashitsu/server typecheck`:exit0 including test fixtures (`typecheck.log`).
- Four source negative controls failed as intended, then fixed sources restored byte-exactly: missing Codex observation, old cost re-dating by hook, child hook overriding parent mode, stale async session result. Raw logs and hashes in negative-control.md.

First integration collection before dependency build failed on missing generated client-core dist. The isolated server dependency build fixed the setup issue; final integration ran successfully. No whole-repository test duplicated.

Read-only actual Codex adapter against the current exact root session returned medium/never/danger-full-access from turn_context, all rollout/turn with the provider timestamp1794021318257. No launch profile, user conversation text/path, CLI model turn or production runtime injection was used. Other kinds use generated native-format fixtures and primary installed schema/docs; no actual-user model turn or configuration change. sr-pc operations remain on hold.

Runtime is split into provider projection (dcd7190d) and scoped hook/cache/publication (e9ff958c), following protocol5e142d6d→0aa6a6b2→5d4599f7. UI is owned by agent_audio_ui; independent review and joint integration/CI are coordinated by root. AGY cycle_mode is intentionally excluded from approval fields because the official definition is workflow cycle, not approval policy.
