# Desktop comparison cleanup: combined validation

Frozen runtime HEAD `3eef9233dd19e73a171fa431894d4430f8b3b8b7`, base `c9f3f3941ce9f30328525ee261cf693d347750cb`. Independent final review of the combined source and regression evidence found no must/should issues. This record adds evidence only; source remained frozen during checks.

- Server production TypeScript emit: `pnpm exec tsc -b packages/server`, exit 0. Existing protocol/client-core/TUI/desktop-assistant build outputs reused; unchanged host/native resources were not rebuilt.
- Server package typecheck: default Node heap exhausted at 4 GB (exit 134). One retry with `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sodashitsu/server typecheck` passed, exit 0. Both raw outputs are preserved.
- Web production build including vue-tsc: `pnpm --filter @sodashitsu/web build`, exit 0. Existing chunk-size warning only.
- Combined relevant regressions: 16 files, 564 tests, 562 passed / 2 failed, exit 1. All 15 other files passed. Full batch was not repeated.
- Isolated startup smoke using built server and Web UI in this separate worktree: PASS, exit 0. Generated temporary state, real shell and Chromium verified login, visible terminal canvas, typing and onboarding focus. Public evidence records this fixed result only; server output/session details are omitted.

The two full-batch failures were investigated using one isolated run on current and one on exact c9f3 runtime. Each isolated run had one failure / one pass: the readonly share test expects closure after eight seconds without a drawing ACK, an obsolete preexisting expectation after removal of the ACK-age timeout; the independent image-lane initial-frame test passed on both versions. The latter full-batch timeout was not reproduced in isolation; neither changed human-input gate executes before its initial-frame assertion. No product code was changed to satisfy these tests. Raw outputs and exact restoration hashes are in `../20261112-human-image-input-age/baseline-result.md` and its attached logs. This is not a claim that the entire regression batch passed.

Artifact verification used the authoritative a40/c9f3 map (`d1bc61e501c25e22a145fcbf3fdf7acc757e577839832ff0a9c030467d409965`): seven package outputs remain 3357 files, with six changed paths, three added Web assets and three replaced old Web asset names. The release payload requires nine writes and zero physical deletions, retaining the old Web assets. Protocol/client-core/TUI/CLI/desktop-assistant output bytes are unchanged. The native/script source tree has no diff against pinned a40; the fourteen native source files remain baseline, with no Windows compile or privileged helper update.

No production release, handoff, Windows operation or push was performed. Artifact maps and release preparation live under `.git/recovery/desktop-comparison-cleanup-20261112/` outside tracked source.
