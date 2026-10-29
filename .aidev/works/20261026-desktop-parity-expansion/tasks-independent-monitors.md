# Independent monitor streams

Scope: Windows normal desktop monitor-specific capture/encoder cohorts, explicit current peer proof, PC-wide per-resource ownership and native cleanup proof. No legacy compatibility work. No real OS capture/input/audio/clipboard or service changes during generated validation.

- [x] Protocol/relay capability negotiation, explicit monitor target and incompatible-mode rejection. Taskcheck required.
- [x] Per-monitor source/encoder pools, same-ID settings matching, total8viewer/live-or-retiring8helper limits, topology invalidation. Taskcheck required.
- [x] All Windows provider human/agent/endpoint/single/shared routes use one PC-wide owner per control/clipboard/microphone; exact FIFO cleanup/terminal epochs; failures persist through reconfigure. Taskcheck required.
- [x] Strict native release and input-failure latch; private cleanup ACKs never reach viewers. Generated tests and5 actual-source negative controls. Taskcheck required.
- [x] Independent popup launch and per-monitor preferences; reload never restores input permission. Taskcheck required.
- [x] Readonly independent source review by review_pointer/review_transfer;2musts corrected and correction re-reviewed. Source negative controls catch both actual defects.
- [x] Focused271tests before final topology/fault additions; later2 tests passed. Browser old5, independent normal/encrypted2, independent native1 passed in separate focused runs.
- [x] Final full source build/typecheck/tests:12,487/838 PASS423.60s.
- [x] Final browser8cases after browser-ready sequencing correction:8/8 PASS1.2m.
- [ ] Root exact-byte guarded reflection and root build/typecheck/tests.
- [x] Clean external frozen5774edcd install/build/smoke; final git status empty.
- [ ] Final independent records review.
- [ ] Commit/PR/main exact-head checks and delivery receipt.

External only: real mixed-DPI monitors, OS desktop switching/locking, failed SendInput recovery, GPU/audio/microphone devices. No complete parity or hardware validation claim.
