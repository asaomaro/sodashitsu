# Independent review — stage A

review_pointer performed read-only taskcheck of protocol/preferences/controller/geometry/native IPC and Electron lifecycle. A real startup defect was found and corrected: custom protocol registration belongs to the assistant-local session, not defaultSession. The taskcheck also confirmed startup-setting rejection occurs before saving, and save failure rolls login-startup back. Final taskcheck: no additional must. No native GUI/OS setting/agent process was started.

review_transfer independently reviewed the whole stage-A diff and found no must. One should was corrected: changing captains while a bubble exists now destroys that stale character bubble; opening it again reads the selected captain. The correction review found no additional must/should.

Scope: native shell/settings/three built-in captain assets/initial disconnected bubble. Authenticated notices, dedicated session, actual chat, OCR/plugins/transcription and standard assistant tools remain explicit subsequent tasks.

Final CI/metadata delta review by review_transfer: no additional must/should. Windows workflow remains generated-test/packaging-only; productName stabilizes the native application identity.

## B1 readonly verbal notices

review_pointer taskcheck found and verified fixes for (1) stale completion while working, (2) old completion/blocked event keys surviving a newer resolved event, and (3) named-session cookies not selected. Added monotonic inbox revisions, shared deferred handling, bounded per-pane dedup, strict TLS, generation/deadline/heartbeat ownership; taskcheck found no additional must.

review_transfer independent whole review found timer-only handshake expiry. Fixed absolute monotonic time checks before/after cookie, CA/socket creation, hello/shared callbacks and connected publication. Late pong handling uses the same absolute-budget principle. Correction review: no additional must/should. Final deferred-state delta review: no additional must/should. No reviewer launched actual desktop/OS/real Soda/agents or repeated tests.

## B2 dedicated server session

review_pointer taskcheck found retained-conversation instance confusion and first8-UUID name collisions. Fixed runtime owner instance fences, actual restore provenance plus fresh current-agent session evidence, and injective full-UUID base36 names. Correction: no additional must/should.

review_transfer whole review found requested-only restored markers could adopt a matching name; removed name-only ownership and serializer promotion. Subsequent explicit-adoption recovery was reviewed independently. Self-check added fresh proof to ensure's sessionId update so it cannot reintroduce a stale pane reference after adoption.

The final delta review found successful-start state was a pane boolean and could adopt a same-name replacement before the first detection was claimed. SessionService now records only the actual instance accepted by a launch reservation, invalidates that record on any instance change/null/attribution cleanup, and initial adoption requires this evidence. Regression covers direct and null-mediated replacement before the manager observes A. Correction review confirmed the fix and found no additional must/should. Reviewers read source only; no desktop, actual PTY, agent/model or OS change.
