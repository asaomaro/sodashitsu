# CLI identity verification

Source branch feat/desktop-cli-identity; production code c9cae13fc66d948bbd0bf95a18c1316efeb36ca4, validator fixes 1564df41/8c468398, bundled command documentation ba339c1e.

- Frozen install, source build/typecheck: PASS. Root guarded three-way mirror preserved unrelated edits; root build/typecheck PASS.
- Related Node/CLI tests: 9 unique PASS (including simultaneous EEXIST directory preparation). Generated child CLI: readonly/stable fingerprint/no network PASS. Generated Node pinned agent handshake PASS; no real peer trusted or desktop accessed.
- Independent check worktree c9cae13f: fresh install/build, reviewer-run pnpm smoke PASS and generated child CLI PASS; clean after checks. Final validator changes are generated test expectations/diagnostics only.
- Windows final code-head Node DPAPI+CLI CI 40580132525 / 122457329717 PASS (2026-10-27T20:42:42Z). Protected boundaries run 40580132568 / 122457745767 PASS (20:42:23Z, failed job rerun).
- Initial Windows readonly fixture failed because Windows PowerShell initialized AppData in the generated USERPROFILE. Key/session/nested storage were absent. Validator now permits only this Windows profile scaffolding while still rejecting any key/session/storage creation. Linux retains exact-empty assertion. No product path/ACL check was relaxed.
- Protected boundaries first attempt emitted microphone_generated_pcm_checks_passed then exit5 in existing generated microphone pipe test; no audio device used. Failed job rerun passed. This existing intermittent failure also appeared in earlier phases.
- Source full first run: 12006 passed, 2 failed / 806 files: bundled skill missed desktop identity (fixed documentation and all11 skill checks PASS), plus existing TUI elapsed-time assertion (no code changed there). Second frozen-implementation run: 12008 passed, 1 failed / 806 files; the sole failure was the same skill documentation snapshot loaded before its repair. All11 skill tests passed after the documentation fix. Unique final coverage12009 /806 files; not a single green full run. The unrelated TUI clock check passed on this run.
- Root full: 12070 passed, 1 failed / 814 files. Only bundled skill documentation snapshot failed; updated skill's all11 tests PASS. Unique final coverage 12071 with all814 files covered; this is full-suite plus targeted repair verification, not a single green full run.
- Independent design/taskcheck/final review and added EEXIST/PS catch delta: no remaining must. No public encrypted agent service/session/MCP/model route added; no global trust/policy changes.

## Negative controls

First exploratory removal of only the first queued-owner check still passed because the in-loop owner guard independently rejected creation; restored exact bytes. Final independent check-worktree controls remove both owner guards or EEXIST handling, each fails the intended assertion. All source bytes restored; no compiled artifacts were used by these direct source tests.


## queued-owner
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-cli-identity-check

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointDirectory.node.test.ts (4 tests | 1 failed) 53ms
   × rejects queued preparation when the owner closes 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointDirectory.node.test.ts > rejects queued preparation when the owner closes
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/desktop/DesktopEndpointDirectory.node.test.ts:16:154


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  05:37:38
   Duration  642ms (transform 44%, import 41%, tests 13%, worker 2%)


## eexist-recheck
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-cli-identity-check

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointDirectory.node.test.ts (4 tests | 1 failed) 108ms
   × rechecks directories after two owners race to create the same components 61ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointDirectory.node.test.ts > rechecks directories after two owners race to create the same components
Error: Desktop endpoint key storage is unavailable
 ❯ failure src/desktop/DesktopEndpointStore.node.ts:17:19
     15| const Envelope=z.object({version:z.literal(1),mode:z.enum(["owner-file…
     16| type Vault=z.infer<typeof Vault>;
     17| const failure=()=>Error("Desktop endpoint key storage is unavailable");
       |                   ^
     18| /** Local-owner persistence only. These methods are not exposed throug…
     19|  * route integration must enforce the existing local configuration aut…
 ❯ src/desktop/DesktopEndpointStore.node.ts:72:60

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  05:37:41
   Duration  619ms (transform 45%, import 28%, tests 25%, worker 2%)


Encrypted browser backplane regression: source1/root1 PASS in separate runs; generated frames and raw Ctrl+Space only. Independent final delta/record review approved; no remaining must.
