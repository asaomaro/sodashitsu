# Microphone encoder recovery

- [x] Bound scope; preserve intermittent-test evidence and no-cause claim.
- [x] Bounded encoder-only recovery and stale-callback fencing (fragile taskcheck: lifetime/permissions; ACK close/configure reentry corrected and rereviewed).
- [x] Deterministic13 unit tests, generated browser regression implementation, historical browser observations and current actual-main source negative/restoration. Local precondition timeouts are documented and are not counted as recovery success.
- [x] Frozen full build/types and890 files /12,939 runtime tests on main e1af5a46. No duplicate whole suite or mutation in the original dirty root.
- [x] Independent whole review and additional scoped CI/evidence delta review.

Delivery operations: exact-head CI (including four generated browser cases from clean checkout), PR/main and merge receipts are recorded in the final PR. These are distinguished from the historical stability results in test-microphone-recovery.md.

Real-device validation remains unperformed: microphone/speaker, OS input, clipboard, service/driver/trust alteration and live A/B handoff. This slice does not claim the cause of an earlier intermittent encrypted microphone case has been identified.
