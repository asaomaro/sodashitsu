# Verification

Source and test fixtures were fixed before this final sequence, using Node24 and independent worktree dependencies:

- Related five-file Vitest suite:79 tests pass (`tests-restored.log`).
- `pnpm exec tsc -b packages/server`: exit0 (`build.log`).
- `pnpm --filter @sodashitsu/server typecheck`: exit0, includes test fixtures (`typecheck.log`).
- Old-reader three oversized regression cases fail, forbidden-important-skip negative control fails; reader/envelope source restored byte-exactly, then all79 tests pass. See `negative-control.md` and raw output.
- Additional read-only generated corpus:20000 deterministic mutations of self-authored JSON,3-byte chunks, compared with JSON.parse; invalid JSON accepted for skipping:0. No actual conversation body or prompt was copied.

Coverage:300KiB/4MiB+/9MiB irrelevant rows followed by completion/newstart; known text/usage event variants; record headers/UTF8 crossing4MiB boundary; unterminated huge line; truncate/inode replacement; instance/session/kind/forget/close invalidation; important/unknown/duplicate/malformed envelopes;1/2/3/7/64/4096-byte syntax splits; UTF8/escape/number/depth/token/header limits; unchanged Muse/AGY/service guards.

No whole-repository test rerun, live handoff, CLI/model turn, production inspector injection, or Windows changes were performed. Independent review and live metadata-only progress/end observation are coordinated by root.
