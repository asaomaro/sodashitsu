# Grok Native Reader/Service wiring

Base: integrated7d91e568, including the final reviewed Codex child long-record observer/cache fixes. Production runtime changes are only NativeSubagentReader and NativeSubagentService. Existing Codex cache/observationEpoch/read/forget/close, Muse/AGY child transcript and state semantics remain intact. No Cursor/history/send/usage wiring is included.

## Behavior

Grok joins the fresh verified-session source gate. NativeReader delegates read/progress/forget/close to the previously reviewed bounded Grok reader. Service passes a live exact pane/instance/kind/ref/session/verified callback through the read, so a lost source cannot return stale child settings. Switching families retires old read state. Source-specific catch-up scheduling keeps existing4MiB/EOF/slot/burst bounds.

Formal generated creation model and child-self session ModelChanged/effort reach public snapshot, actual compiled CLI serializer, and the existing shared Web/TUI model label. The latest missing effort replaces the prior pair. Initial created membership remains alive/unknown, not falsely working or completed.

## Verification on fixed source

- Server tsc-b exit0; CLI build exit0.
- Full server test-inclusive typecheck exit0 (server-types.log).
- Five relevant suites69tests and production compose suite1test:70pass, restored-wiring.log. This includes the new service/delegate tests and existing NativeReader/Service/GrokReader/CodexObservationCache regressions. Full repository tests were not duplicated.
- Prior7d91 actual Reader/Service source restored temporarily: new service/public compose tests3fail, negative-old-wiring.log. Both current product files restored byte-for-byte (restoration.json), then all70pass. No generated artifact from the negative run is used as a positive result.
- Own isolated compose server uses one guarded fake Grok terminal and generated formal record fixtures. One generated SessionStart is deliberately emitted after detection; this proves native publication/assembly, not the real CLI's first-launch behavior. Other CLI commands are guarded no-model stubs; normal HOME/state/config is isolated. Windows host sampler is stubbed; no Windows or remote operation. No real model, actual user pane, auth/account session or installed CLI invocation. Auth token/cookie stays memory-only and is not in retained public-fixture.json.
- Public client.hello snapshot artifact drives actual SubagentList.vue in owned Vite/Chromium. Dracula/One Light display grok-observed-child/high, unknown state, no time caption and no unsupported transcript button; pageerrors0. Screenshots visually inspected. Initial browser harness was intercepted by Vite fallback; corrected to a pre-routing plugin, with product source unchanged. Both owned browsers/servers closed in finally.

The installed CLI native spawn/finish evidence is the earlier reviewed isolated local-mock fixture. ModelChanged/effort propagation here uses source-schema generated records; this is not an actual live-provider switch or a Windows test.
