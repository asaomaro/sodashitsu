# 7B3b: signin viewer

- [x] Fixed native process facade: constrained broker, frame/input ACK bounds, stop proof and terminal owner failure (taskcheck required).
- [x] Enrollment-fixed sealed viewer endpoint, fresh per-connection consent, input ceiling and ownership through teardown (taskcheck required).
- [x] Existing feature bitset and strict offer/grant records (taskcheck required).
- [x] Viewer consent/reset/relative-clock expiry; unsupported signin routes hidden.
- [x] Explicit native UTF-8 transport and generated source-copy negative controls (taskcheck required).
- [ ] Final build/type/full, product-source negative controls and browser validation recorded.
- [ ] Independent cross/fix-delta review, external-worktree smoke, PR/main and guarded root reflection.

This does not complete task 7B. Dedicated Node startup/bundle, local key/enrollment administration, reviewed installer and actual installed service/desktop validation remain. No privileged deployment is performed by this phase.
