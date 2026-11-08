# Verification

Runtime: fe292bfd, base 6b173738. Node v24.22.2 explicitly selected for all pnpm commands. No full repository test/build or Web check repeated for this server-only fold change.

- Initial Records/Reader: 50 tests pass.
- Negative: restore only NativeSubagentRecords.ts from 6b173738, run those same suites: 2 new regression failures / 48 passes, exit 1. Raw output: negative-old-records.log.
- Finally restore exact source bytes; SHA256 in restoration.json. Runtime matches fixed commit.
- Records/Reader/Service: 3 files, 67 tests pass, exit 0. Raw output: positive-restored.log.
- Targeted production module and both changed test modules: strict TypeScript, exactOptionalPropertyTypes/noUncheckedIndexedAccess/NodeNext, exit 0. Empty successful output: typecheck.log.

Type command (Node24 PATH, NODE_OPTIONS=--max-old-space-size=8192):

```
pnpm exec tsc --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck packages/server/src/agent/NativeSubagentRecords.ts packages/server/src/agent/NativeSubagentRecords.test.ts packages/server/src/agent/NativeSubagentReader.test.ts
```

Formal success boundary: pinned message_tool.rs awaits `agent_control.send(...).await?` before emitting Interacted. followup_task.rs delegates using TriggerTurn. Thus this fold consumes the provider success event, not merely requested delivery; an interrupt without such a later event stays absent. Working state is not inferred from message acceptance.

Coverage: interrupted-only zero; same-parent started→interrupted→interacted alive/unknown; original startedAt; duplicate historical replay; later completion removal; unknown-kind retirement; no-start and foreign-start/followup refusal; fresh start allowed; reader EOF and forget/new-instance namespace isolation. Existing bounds, malformed events, multiple provider folds and service fresh-scope cases remain passing.

Independent backend read-only review of fixed commit: no must/should. Final raw log and SHA verification requested separately. Root will perform server build/external smoke and actual/public checks before deployment; none of these are claimed by author here. Production real recording content/identifiers/paths, user data, credentials and PCM are absent from these artifacts.

## Actual same-scope record after fixed build

Integration fd6ed652's emitted Reader/Fold graph (fixed terminal branch verified) was loaded by a separate own Node process, without another build or production instrumentation. The same unique public parent scope was corroborated by formal thread cwd/path and safe record locator. Public parent kind/instance/session was rechecked after reading. Existing normal auth was read only; no settings/input/model/send/Windows operations.

Fixed result: 487.3 MiB, 122 calls, EOF=true, pending=false, invalid=false, partial=false, sameScope=true. Count=2, countBasis=alive, states unknown=2/working=0/idle=0. This restores membership where the prior fold returned undefined. Natural child completion changed the observed count; no fixed count expectation. Actual runtime status was intentionally not queried by this isolated fold check, so unknown is preserved. Own reader and allowlisted control channel physically closed. Metadata-only output is actual-fixed-metadata.json. This is not yet public post-handoff/UI verification; root owns that step.
