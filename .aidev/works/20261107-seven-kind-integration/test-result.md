# Seven-kind integration and unconfirmed effort retention

Base 5abc68d1. Nineteen approved commits integrated without conflicts, ending runtime 857a52a8. Duplicate c10cae27/cf9cc075 omitted. Documentation corrections 71634de8 and signing review eac2055d preserve runtime. Compact labels, CPU metadata and fixed-path helper remain unchanged from base.

- Frozen pnpm9.15.9 install exit0; optional official @cursor/sdk1.3.1 and Linux x64 split dependency present. No CLI version changes or actual model/login/Windows operation.
- Full build and full typecheck exit0 once. First full test: 14437 pass / 2 fail / 1 skip, 1014 files pass / 2 fail / 1 skip. Failed composeServer.stop Ctrl+C scheduling and UsageInsights page-capacity timeout pass when rerun alone: 22 tests / 2 files / 6.60s. Full raw log remains `/tmp/soda-7kind-857a52a8-test.log`; final failure/result block is copied verbatim. No full rerun.

## Cross-review P2

A reference catalog with an empty efforts list means effort metadata is unavailable, not explicitly unsupported. Web summary configuration and desktop captain configuration now retain an existing legal effort as `保存済み・未確認`. Explicit nonempty subsets still clear an unsupported saved effort; CLI-reported empty lists (Cursor independent effort) keep the existing default-only behavior. No protocol fields or provider behavior changed.

- Web targeted existing/added semantic suite: 18 pass (includes open without saving, forced refresh, kind round-trip, reference explicit subset and CLI empty list). Web and desktop package typechecks exit0.
- Actual Chromium generated fixture on current assets: all seven kinds, reference source label, Copilot initial open has zero chooseCaptain calls and keeps high unconfirmed, explicit observed subset clears it, Cursor independent effort remains default, refresh/source metadata/save/reload, no send/start/audio/recording. This is generated UI verification, not inference/SDK auth verification.
- Two old product files with tests unchanged: Web 1 fail / 17 pass; actual browser fails because Copilot saved effort is cleared. Raw negative logs included. Byte-exact SHA256 restore both product files, then Web18 and browser pass. No compiled artifacts used by this negative; Vue loads source and desktop serves assets directly.
- Final Web Vite build and assistant-host resource generation exit0 after restoration. `assets.json` verifies the generated server assistant-host bubble equals the source and manifest SHA, and built Web bundle contains the new unconfirmed label. Server TS/desktop TS runtime is otherwise unchanged from full build.
