# 7B4b1: administration policy, journal and stop foundations

- [x] Strict finite operation schema, owner/nonce/deadline, one-attempt lease, clock/callback/reentry cancellation; any journal residue selects recovery (taskcheck).
- [x] Separate machine-DPAPI admin purpose/owner/nonce and canonical bounded encrypted envelope; generated caller-buffer checks (taskcheck).
- [x] Fixed journal claim/result/ack transitions, file identity/digests, no replacement, ack before cleanup and partial-stage recovery (taskcheck).
- [x] Precreated immutable quiescence read lease in host/broker/context/worker; generated deny write/delete/exclusive checks (taskcheck).
- [x] Native process-handle exit0 classification with mandatory Job-zero cleanup; actual ordinary finite-child checks (taskcheck).
- [x] Build/typecheck/bundle/full tests, existing vault/worker checks, independent cross and records.
- [ ] External-worktree smoke, PR/CI/main and guarded root reflection.

This slice does not add admin authentication, protected mailbox adapter, local SCM controller, identity/enrollment mutation, Node admin startup or installer. The core requires a later verified private directory/ancestor and owner mutex/quiescence boundary. Existing runtime paths are not modified during validation. These remaining integration tasks stay in tasks-signin-management.md.
