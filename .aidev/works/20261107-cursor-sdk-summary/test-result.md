# Verification (in progress)

Node24.22.2 explicitly selected. pnpm9.15.9 exact optional @cursor/sdk1.3.1 added with ignore-scripts; subsequent frozen-lockfile ignore-scripts install succeeded. Reviewed lock integrity matches registry/tarball investigation. No real model/login or Windows machine operations.

Initial fresh worktree package build was attempted before full workspace linking and reported missing zod; full frozen install corrected bootstrap. First linked build/typecheck found only three nullable-pipe type annotations in the new supervisor (fixed using non-null assertions for explicitly configured pipe stdio). These are development checks, not final validation claims.

New public-API DI runtime and owned-process tests: 25/25 initially passed. Related suite after final-scope test/binding update: five files47/47 passed. Final fixed source build/typecheck/negative-control results will be appended before delivery.

DI public handles prove application text extraction, zero-tool configuration and wrapper rejection/cancellation, not Cursor server tool refusal or actual model text success. Existing actual SDK mock evidence resides in prior investigation /tmp/soda-cursor-sdk-safety-20261107; user/project sentinels functional in ambient control, inhibited by restricted local.fs configuration. Plugin control was not activated and is not claimed pass.


Final production package `pnpm exec tsc -b packages/server`: exit0 (/tmp/soda-cursor-sdk-build-final.log). SDK/runtime/supervisor compiled JS were generated.

Negative controls applied only locally, never committed: runtime tools[]→read; both final publish scope checks removed; SummaryService restored byte-for-byte to base d709ff5c. Selected tests failed3 cases as expected (negative.txt raw). All three files restored byte-exact (restoration.json SHA256), then five selected suites47/47passed (restored.txt raw). No full workspace test was run.

Compiled actual worker/publicSDK no-auth smoke: own isolated user+network namespace with no network interfaces/real auth/model, missing private auth file. Returned unsupported_agent_kind, no raw stderr, private directories fully cleaned, exit0 (noauth-smoke.json). This exercises real compiled dependency loading and no-auth failure, not authenticated/model execution.

Final server test-source typecheck is repeated after source-negative restoration because the prior check overlapped transient negative files. Only the fixed-source receipt will be used for delivery. Production source is fixed during that check.

Final fixed-source `pnpm --filter @sodashitsu/server typecheck`: exit0 (server-typecheck.txt). No source changes occurred during this final check.
