# Verification

All commands used Node24 (`/home/asaomaro/.nvm/versions/node/v24.22.2/bin`), with independent offline-installed worktree dependencies. No live dist, service, or remote machine was changed.

- `pnpm --filter @sodashitsu/protocol build`: exit 0.
- `pnpm exec tsc -b packages/server`: exit 0 (`build.log`).
- `pnpm --filter @sodashitsu/server typecheck`: exit 0 (`typecheck.log`).
- `pnpm exec vitest run packages/server/src/agent/AntigravitySubagentReader.test.ts packages/server/src/agent/NativeSubagentReader.test.ts packages/server/src/agent/NativeSubagentService.test.ts`: final 38 tests pass (`tests-restored.log`).
- Two source negative controls failed as required, then source SHA256 matched byte-exactly and related tests passed again. See `negative-control.md` and raw logs.

Coverage includes real sanitized provider records through the actual reader and verified publication service, serialized count basis/task state, ALIVE/idle ambiguity, KILLED invalidation, unknown states, forged or missing spawn proof, bounded scans, partial/large records, unsafe IDs, symlinks/hardlinks, unsupported provider compatibility, and pending read invalidation across forget/close/session/kind changes. The service retains fresh instance/session proof before and after async reads.

Whole-repository tests were not duplicated; parent already completed the base343 whole CI. Final independent review is coordinated by root. Native runtime probe evidence is documented separately in `probe.md`; no actual-user conversation was used.
