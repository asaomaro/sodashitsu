# Server-restart file checkpoints

Current scope: single-file upload/download across Sodashitsu server-process restart and handoff. Folder continuation follows in a separate phase. OS/kernel crash and power-loss durability are not promised. Existing-user desktop/input/audio/services/driver/trust/ACL are untouched; generated Windows fixture ACL may be set only on newly created disposable test folders.

- [x] Verified upload FD/root/parent/prefix snapshot and positional restore; unknown replacement cleanup refusal. Taskcheck required.
- [x] Full download source identity snapshot, full SHA and prefix seek. Taskcheck required.
- [x] Private AES-GCM continuation namespace; owner-file or DPAPI-protected key; parse/namespace missing/zero-byte failclosed, stable policy generation and settings binding. Taskcheck required.
- [x] Registry ACK persistence, prepublication commit intent, lost receipt reconciliation; fresh grant mandatory. Taskcheck required.
- [x] Synchronous pre-epoch handoff freeze, pending IO preservation, paused expiry, load/queue drain and rollback cold reload. Taskcheck required.
- [x] Settings/endpoint policy invalidation, owner lifetime checks and balanced policy holds on success/failure. Taskcheck required.
- [x] Protocol proof, UI server-restart wording, required helper asset packaging, generated cross-platform process-boundary validator/Windows CI step.
- [x] Independent source/correction review; all reported musts corrected. Metadata/hold failure handling and final all-job shutdown failure corrections re-reviewed clear.
- [x] Actual child-process termination at data ACK, before link, after link, after temp unlink, receipt and download boundaries:6 passed after final code freeze on Linux and Windows CI.
- [x] Thirteen product-source negative controls: intended runtime assertions failed, exact bytes restored and positive runs passed.
- [x] Browser server restart upload/download2cases passed initially; final source restart4 and root combined file/folder19 passed.
- [x] Frozen source full build/typecheck/tests12,528, final process6 and source restart browser4.
- [x] All27-file guarded root merge/reflection, root build/typecheck/tests12,590/browser19 and external clean build/smoke.
- [x] Independent source/correction/template review, scoped product commit/PR#295/Windows CI4 and main delivery. Final receipt-only record review clear; record-only delivery follows without product changes.
