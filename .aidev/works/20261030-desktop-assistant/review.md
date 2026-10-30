# Independent review — stage A

review_pointer performed read-only taskcheck of protocol/preferences/controller/geometry/native IPC and Electron lifecycle. A real startup defect was found and corrected: custom protocol registration belongs to the assistant-local session, not defaultSession. The taskcheck also confirmed startup-setting rejection occurs before saving, and save failure rolls login-startup back. Final taskcheck: no additional must. No native GUI/OS setting/agent process was started.

review_transfer independently reviewed the whole stage-A diff and found no must. One should was corrected: changing captains while a bubble exists now destroys that stale character bubble; opening it again reads the selected captain. The correction review found no additional must/should.

Scope: native shell/settings/three built-in captain assets/initial disconnected bubble. Authenticated notices, dedicated session, actual chat, OCR/plugins/transcription and standard assistant tools remain explicit subsequent tasks.

Final CI/metadata delta review by review_transfer: no additional must/should. Windows workflow remains generated-test/packaging-only; productName stabilizes the native application identity.
