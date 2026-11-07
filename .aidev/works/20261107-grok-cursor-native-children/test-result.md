# Isolated Grok child reader checkpoint

This checkpoint does not register Grok in NativeSubagentReader/Service or composeServer. Production wiring waits for the independently owned Codex long-record observer and extra-history integration. Cursor runtime acquisition is separate and not implemented by this checkpoint.

## Actual installed CLI evidence

Installed Grok 1.0.77 created exactly one native child against an owned local deterministic mock. Synthetic auth, unique loopback-only network namespace; no external route, real model, normal settings, existing session or Windows operation. Exit 0, 516 ms, no timeout, child tool calls 0. The sanitized original durable envelopes are in installed-grok-native-fixture.json. Parent `_x.ai/session/update` records contain exact parent/child/attempt, eventId, agentTimestampMs, resolved model, spawn and completed. Finished prose was removed. The preceding root-authorized exploratory native-child probe also succeeded (957 ms), retaining structured metadata only. Both namespaces/process groups/servers/temp HOMEs were cleaned. No additional CLI probe occurred.

Source-schema ModelChanged cases are generated tests, not an observed installed-CLI model switch. The pinned primary notification.rs schema explicitly calls model_id selected-session model and reasoning_effort post-resolution. Missing fields in the latest formal switch replace the prior pair, never mix with old effort or parent settings.

## Verification on fixed helper source

- Protocol build: exit 0.
- Server 4 selected suites / 32 tests: pass (restored-server.log).
- Shared model label 8 tests: pass (restored-core.log).
- CLI agentStatus 40 tests: pass (restored-cli-model.log).
- Server helper/test-inclusive strict + exactOptionalPropertyTypes focused typecheck: exit 0, server-helper-types.log.
- Full client-core typecheck: exit 0, core-types.log.
- CLI serializer/test-inclusive strict focused typecheck: exit 0, cli-focused-types.log. This is not a claim of full CLI package typecheck/build.
- No duplicated full repository tests or production source injection.

## Negative controls / byte restoration

negative-guards.log: disabling exact parent-session acceptance and post-await verified scope yielded 2 failing semantic tests. Both product sources restored byte-for-byte.

negative-old-model-label.log: actual previous shared helper rejected observed creation/session models; 1 regression failed. Restored exact bytes then all 8 passed.

negative-old-cli-model.log: actual previous serializer lost child model/modelBasis; 1 regression failed. Restored exact bytes then all 40 passed.

SHA receipts are restoration.json and cli-restoration.json. Raw test output is retained, not replaced with these summaries.

## Safety/meaning

Spawn proves created membership before dispatch, so initially alive/unknown. Formal running progress alone marks working. Exact attempt terminal removes that child; old-attempt late completion and duplicate spawn cannot revive or stop another attempt. No native events, malformed/unknown lifecycle, unbound finish, overflow, unreadable/incomplete record or unverified parent stay unknown, never synthetic zero.

Parent reads are 4 MiB per call, max512 MiB file, max256 KiB line, max256 children and20k event IDs. Full available EOF/newline is required to publish. Source-instance replacement/forget/close, rotation/shrink/in-place EOF rewrite and parent file/path changes invalidate the old fold. Child setting reads are bounded tail256 KiB, source/path/fd checked before/after; a parent stays pinned throughout. Total four physical supplement slots, one chain per parent, 2-second aggregate deadline. Timed-out chains keep their slot until physical completion and cannot late-mutate returned snapshots.

Only formal resolved creation/session/turn model bases are displayable, without time captions. Unknown or requested parent/type values stay absent. CLI optional model fields do not alter the legacy JSON shape when missing.

## Independent-review P2: bounded duplicate proofs

The reviewer found progress/finished extra model/description/status objects were serialized into each retained dedup value. The fix hashes only kind-relevant lifecycle fields into a fixed64-character SHA-256 digest. Output and arbitrary progress/finished fields are not retained. The test repeats 200000-character unrelated payloads across10 events and requires exactly640 retained value characters. Prior 567524b0 source fails that bound (negative-dedup-size.log); exact restoration is recorded in dedup-restoration.json. Restored13 fold tests pass; all4 selected server suites33tests pass (dedup-related.log). Fixed-source test-inclusive strict typecheck exits0 (dedup-final-types.log). Earlier restoration.json records the original checkpoint, while dedup-restoration.json records this later reviewed source.
