# Codex terminal history validation

Product source fixed at `c1d64ac1148c812d7f80ec21b82d4be989791240`. Node 24.22.2. No source/test edits after validation freeze. No model request, real CLI, production pane action, Windows action or user-record read. Fixture values and temporary paths/IDs are generated. No actual 494MiB parent scan was repeated for this task.

## Commands and outcomes

`node node_modules/vitest/vitest.mjs run --config .aidev/works/20261108-codex-terminal-history/vitest.config.mjs`

Initial unchanged baseline: 3 suites / 67 pass (`initial-related.log`). Fixed source: 5 suites / 77 pass (`related.log`). After all negative substitutions and exact restoration: 5 suites / 77 pass (`restored-related.log`), exit0.

Nine provider/history cases cover start/terminal ownership, foreign/unowned/unknown rejection, completed vs aborted, no active resurrection, public body and child self120 vs parent cumulative999999, strict entry ID, followup rejection before/after EOF, new terminal new selector, unchanged relist preserving grant, unrelated append, same-size rewrite/restored mtime/rotation/forget, partial final line, fresh/cwd/header/child-parent mismatch, scalar or oversized record before head, missing timestamp, four physical checks held through close/late retirement, and a 9MiB single unrelated line across three 4MiB incremental reads with no cold-scan restart.

The generated real compose/PTY test uses its own fake Codex executable, own HOME/state/cwd and authenticated public WebSocket RPCs. A single formal SessionStart supplies fresh proof. It exercises history → exact transcript → exact usage, old/random selector rejection, active count0, unrelated relist stable entry, and formal followup returning current1/retiring history. All unrelated CLIs are stubbed, own processes/state cleaned in finally.

`node --max-old-space-size=8192 node_modules/typescript/bin/tsc -p .aidev/works/20261108-codex-terminal-history/tsconfig.json`: exit0 (`typecheck.log`, `type-results.json`). Strict changed production/fixtures and real compose dependency graph only, not full repository test-inclusive CI. No emit into shared dependency dist. Root integration will perform build/smoke.

## Negative controls

Durable byte backups and runner live under the git-common-dir's agent-audio-backend-codex-terminal recovery folder (not committed, contains product source only). All runs are sequential and started after the fixed-source typecheck completed. Full raw outputs are committed, never substituted by summaries.

1. Actual base42f5 `composeServer.ts`: public history is unavailable; the authenticated new positive fails (1 fail).
2. Remove terminal fact publication only: formal aborted proof positive fails (1 fail).
3. Remove same-size namespace reset: old proof remains incorrectly current; replacement regression fails (1 fail).
4. Remove post-FD-close scope recheck: four retired late results become true; regression fails (1 fail).
5. Ignore the skipped first oversized record: a later session header is wrongly accepted; head regression fails (1 fail).

Only item1 is literal previous-release source; items2–5 are targeted absent-guard negatives. `restoration.json` records all five exit1 results and four exact source-byte/SHA comparisons. `negative-*.log` contains each raw failure. Final source/test hashes all match the fixed commit (`final-source-sha256.json`). No failed mutation remains.

## Boundaries

Existing RPC/schema/UI are reused, and active/alive fold meanings stay unchanged. Parent metadata checks reuse the shared incremental record EOF, at most4 verification tasks (slots kept through FD close); ordinary record size512MiB / chunk4MiB, lifecycle20k / child relations256 unchanged. Metadata checks do not parse the huge parent on each request. Changed parent identity/EOF and current source/fresh/cwd mismatch deny old selection. Normal unrelated append can revalidate the same formal end after catchup; followup/new start/unknown cannot.

Terminal rows deliberately omit model/effort instead of relabeling launch/parent settings. Time is only a formal valid lifecycle row time. Collection remains incomplete, not all historical conversations. Child body uses the preexisting public-message filter; numeric uses preexisting child-only engine with partial/scanning/dedup/line limits. Actual Codex child termination/resume and a real user terminal entry were not induced or tested. Other providers' terminal producers are separate next units.

## Production build after reviewed source freeze

Root requested a single completed production server build. Before building, rebased to docs-only c900; current product commit0ff8ba6e/evidence1c1e2005 has all8TS bytes identical to reviewedc1d64. Resolved only docs preserving the integrated Web/TUI history menu sentence. Workspace dependency aliases were rebound to this own tree; outputs are owned regular own dist directories, not shared main dist.

One early tsc process was stopped (exit143, raw server-build-early-memory-correction.log) after noticing missing inherited NODE_OPTIONS; it had not completed a server build. Corrected command with NODE_OPTIONS=--max-old-space-size=8192, Node24.22.2/corepack-pnpm9.15.9 --filter @sodashitsu/server build completed exit0. No repeated full test or completed server build. Raw server-build.log and server-build-result.json record this exactly. All own server dist file SHA/byte counts are in server-dist-sha256.json; host manifest entries were independently hashed and all matched. Root integration/UI score build is separate and source-disjoint.
