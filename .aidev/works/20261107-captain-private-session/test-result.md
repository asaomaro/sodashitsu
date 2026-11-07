# Captain private PTY server verification

Base f3c346d4. Protocol contract daa3e9aa, runtime source fixed before final negative/restore/build/type sequence. Generated memory hosts and fake PTYs only; no user pane/Windows/CLI/model operations.

- Protocol build and shared exact-pane predicate test pass. The predicate checks actual tab/workspace and exact persisted binding pane; it does not grant input permission or hide siblings.
- Related3files95tests pass (AssistantSessions, TerminalHost, protocol predicate). Covers exact current working-owner stop, duplicate promise, start invalidation until exit+flush, replacement before close, failed/unconfirmed close retaining stopping gate, raw snapshot and dedicated attachment retained, ordinary counts exclude captain, same-workspace sibling survives and new captain can start separately. Existing ownership restore/failed launch/queued input/disabled idle drain suites remain green.
- Old f3 runtime4files only (AssistantSessions/assistant RPC/SessionService/TerminalHost) restored temporarily:8fail/86pass. Focused regressions detect missing stop RPC/method, incorrect visible counts and missing physical exit confirmation. Four byte-exact SHA restores documented in restoration.json; related95tests pass again.
- Scoped protocol/client-core build and final server tsc-b pass. Server and protocol test-inclusive typechecks pass. An earlier typecheck overlapped an intermediate negative-control swap and is intentionally not used as final evidence. Final build→typecheck ran after exact restore against frozen production source.
- Raw negative/restored/build/type logs retained. No full repository test was run or duplicated. UI presentation/actual DOM belongs to separate UI work; this server evidence does not claim actual Windows captain CLI stop success.

Physical exit observer is created before normal closePane removes model and calls host.dispose. Its direct PTY subscription survives ordinary listener disposal, and rejects on10sec without exit. Failed/unconfirmed stop retains last stopping info and prevents another start. Raw snapshots, usage/cost/history, terminal permissions, saved graph control links and noncaptain panes are retained. Existing no-auto-retry and old-instance guards remain.

Independent final review is requested from root/backend after final hash; not self-approved.
