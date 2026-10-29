# WSL audio / microphone

- [x] Fixed binary builder/preflight, protected disposable artifact, owned close lifetime.
- [x] Binary stdio bridge with nonce/Windows PID, strict local kind/name, watchdog and bounded buffers.
- [x] Actual WSL ↔ Windows generated memory pipe byte/PID/partial transfer validation.
- [x] Taskcheck transport (independent): deadline and unread PCM findings corrected; delta review pending.
- [x] Wire per-provider runtime into single/shared audio and microphone with existing ceilings/resource fences.
- [x] Taskcheck integration, generated authority/revocation/close regressions and 11 actual-source negatives; exact restoration and 32 focused positive tests.
- [ ] Browser audio/microphone regression, build/typecheck/full tests; Windows generated validations.
- [ ] Independent whole/correction review, root three-way integration and checks.
- [ ] Fixed HEAD CI, clean startup, commit/PR/main merge.

Fragile taskcheck applies to transport and integration (lifetime/authority/private protocol). Documentation is checked in whole review. No Linux/macOS desktop device is available. WSL/Windows generated memory validation is not real endpoint, Explorer, native Linux/macOS or call-app verification.

Prior slice: PR #307 merged as a96d7562c4294a3d8d0dcbfae5b802cd2d50f4a5 on 2026-10-29T21:18:02Z. Source 12,729 tests, integrated root 12,791 tests; browser21 each; clean fixed-head smoke and four CI jobs passed. Final fixed14-path replay independent review: no additional must/should.
