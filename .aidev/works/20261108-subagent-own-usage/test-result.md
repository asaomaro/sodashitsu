# Child usage: final source verification

Base: `6b173738`, protocol `ab519991`, initial numeric/API checkpoint `60850ec1`, followed by this exact-source history/append completion. The older `checkpoint.md` describes the initial current-only checkpoint, not the completed history behavior.

## Source and negative controls

`restoration.json` records four failing negative controls and the exact restored SHA-256 of Service, Reader and Accumulator. The raw logs are included beside this file:

- `negative-pre-history.log`: replace Service only with committed `60850ec1`; successful-known-child history, TTL, generation and bound tests fail.
- `negative-over-limit.log`: omit observed oversized-generation cache invalidation; subsequent smaller rewritten record incorrectly retains previous totals, and the regression fails.
- `negative-foreign-thread.log`: remove the exact Codex thread gate; the post-birth exact-child isolation test fails.
- `negative-grok-history.log`: remove the ended-Grok fail-closed guard; the attempt-unconnected history test fails.

All four exits are 1, followed by byte-exact restoration. An earlier foreign-thread control used a test-name pattern that did not select the intended test; that unsuccessful control is not the claimed evidence. The final raw log uses the exact post-birth test and fails as required. No runtime changes were made after those restored hashes.

After an execution-environment refresh, the repository retained the raw negative logs and restoration manifest. All three current source hashes were checked against that manifest again. Missing `/tmp` results were discarded and the final related and type checks rerun against the retained source. Recovery copies contain source/test/docs only, under git-common-dir/recovery/agent-audio-backend-child-usage, outside the commit.

## Related checks

`restored-final.log`: 7 suites / 38 tests pass. This includes five formal provider source fixtures; per-response isolation, explicit-zero versus absent, reported totals only, no parent/account data; large-line bounded progress; append during read, replacement, truncate and same-size rewrite; four physical slots held through timeout/cleanup; delayed source loss; current-to-history, 64 grants, 30-minute nonrenewing TTL, same-ID rerun; unsupported provider/no parent opener; and the real private compose HTTP/WS API.

The compose fixture uses an isolated HOME/state/cwd, own masked Node producer and actual SessionStart hook. Before fresh binding, usage is unavailable. After the single formal binding it returns child self total 120, excluding generated parent total 999999. After parent completion, sidebar active count becomes 0 while the previously granted historical child total remains 120 with partial provenance. Unknown child IDs remain unavailable. This is API integration evidence, not a browser-rendering claim. Real CLI/model calls: 0.

The restored-final run is repeated only because the prior `/tmp` execution proof disappeared during the environment refresh. No repository-wide full suite is duplicated here.

## Source semantics and actual records

Codex 0.166 official `core/src/state/session.rs::record_token_usage` clones the supplied per-response usage into `TokenUsageRecord.usage`, while separately accumulating `turn_token_usage` and `thread_token_usage`. Those cumulative values are deliberately ignored. The official protocol and token_usage_rollout suite are linked in `docs/subagent-usage.md`. The upstream source was reopened during final verification.

Earlier metadata-only discovery confirmed three exact formally related child files with 2074 / 1756 / 1793 own post-birth token_usage_record rows and zero foreign thread rows; this is discovery evidence only, not final-reader execution proof. The original temporary diagnostic log did not survive the environment refresh, so these counts are not presented as newly reproducible final-reader acceptance.

`actual-incremental.log`: the final compiled reader probe reached public hello (9 panes / 5 Codex panes), but no current child membership was available at that checkpoint. It stopped before opening any child record. Therefore the final reader's actual long-record incremental scan remains unconfirmed until fresh public membership returns. No known historical ID was substituted, no user record body/ID/path or counter amount was output, and no model turn was sent. The bounded generated-large-record and public compose tests above are the current execution proof.

## Deliberate limits

Grok current ledger is connected; descendant-inclusive provider totals are marked subtree and only provider-reported USD ticks are exposed. Ended-Grok attempt revalidation is not connected to this API and returns unavailable with a fixed reason. This is a Sodashitsu proof-integration limit, not a claim that upstream has no API. The other four supported providers use only a successfully acquired exact-source grant and mark historical numbers partial. Copilot/Cursor numeric readers remain unconnected. No child usage is added back into parent aggregates.

## Final type/build receipt

The full server source-and-test-inclusive check using the checked-in server tsconfig, own protocol declarations, and Node 24.22.2 exited 0 with `--max-old-space-size=8192`. The first attempt with the default 4 GiB heap aborted with OOM, not a reported type failure; its raw log is retained as `typecheck-default-heap.log`. `typecheck-final.log` is empty because the successful compiler emitted no diagnostics. No runtime/test source changed between either check. The owned Reader dependency graph was also compiled to an isolated ESM bundle using rolldown (exit 0), without writing through shared workspace node_modules or modifying production dist.

## Recovered Native membership: actual final Reader verification

After the independent Native interruption-membership hotfix was deployed, root authorized a repeat against fresh public membership. `actual-after-native-recovery.mjs` selects exactly one parent whose workspace project and pane cwd match the authorized project, verifies its formal parent-record cwd and contained regular owned path, then freezes parent instance/ref/kind/verified and exact child birth tuples. It does not choose the largest child count or substitute known child IDs. Every 4 MiB query checks the public scope and parent namespace before and after; each child opener revalidates the formal parent relation. Outer bound is 35 seconds, internal budget 30 seconds, maximum 4 children and 40 calls per child.

`actual-after-native-recovery.log`: three current children were available when the frozen scope was acquired (root's earlier observation was two; no fixed-count assumption). Child record sizes 85,173,791 / 77,270,394 / 79,241,174 bytes reached EOF in 21 / 19 / 19 bounded calls, with 2,359 / 2,097 / 2,072 deduplicated post-birth response records. All three had reported input/output/cacheRead/cacheWrite/reasoning/total plus context and context window. `scanning:false`, `partial:true` is retained, including oversized rows omitted by the bounded reader. This does not claim every source row was fully parsed. Total elapsed 1,935 ms; parent namespace and exact public scope unchanged throughout.

The isolated final Reader bundle was compiled from the unchanged final runtime. The production safe opener source was compared byte-exact to this branch's existing safe opener before use. All own FD handles/cache were closed and the private diagnostic process exited 0. No model, send, Windows operation, raw body, actual ID/path or token/cost amount was output. This closes the final Reader's actual-long-record acceptance that was explicitly pending at the earlier empty-membership checkpoint. It does not claim that the un-deployed usage RPC or every other provider was exercised on real accounts; those remain generated source/API evidence.
