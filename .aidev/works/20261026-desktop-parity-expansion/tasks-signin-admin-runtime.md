# 7B4b2: local admin adapters and finite dispatch

- [x] Local barrier FD lease, delayed acquisition/cancellation/teardown (taskcheck clear; generated-only).
- [x] Fixed SYSTEM protected mailbox reader with claim-before-decrypt, bounded private pipe and confirmed helper stop (taskcheck clear).
- [x] Six finite administration operations, actual provider/viewer checks, no replay/rollback claim, no result retry, tracked cancellation and bounded teardown (taskcheck clear).
- [x] Optional owner-store write permit and persistence-boundary checks (taskcheck).
- [x] Native public result schema and claimed-request deadline, fixed result writer (taskcheck and final full cross clear).
- [ ] Source negatives/exact restore, generated Windows checks, build/type/full, cross and delivery.

The mutable backend/enrollment writer and native guards at actual identity/enrollment commits are the next slice, before any administration is enabled. Fixed package asset updates belong with that integration. No Node main wiring, SCM controller or installer in this slice. Those are the next integration/release steps. No actual SYSTEM/SCM/keys/trust/desktop action during implementation.
