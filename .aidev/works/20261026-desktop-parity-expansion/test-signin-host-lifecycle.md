# 7B4c4d verification

Host.Run now consumes the fixed protected runs intent, binds actual package manifest bytes and immutable barrier identity, records native self PID/creation, checks actual admin pending envelope nonce/digest versus an empty normal namespace, and awaits a controller observation before any child creation. Owner-slot and all ancestors are held with their distinct private/code ACL policies. No installer or controller is invoked; this source path remains inactive.

Child launch performs admission→blocking package/runtime Current→final consumed-lease confirmation→ResumeThread. Final confirmation rechecks original intent wall/monotonic expiry and the original10s observation deadline, stop/close/reentry and single use, with no later blocking filesystem inspection. Receipt requires confirmed resume and native cooperative exit0/Job0 while package/runtime/journal remain held. Native failure paths force all descendants down before releasing leases; unconfirmed/forced/nonzero/lost-proof/reentrant/clock-backward states emit no clean receipt.

Generated ordinary temp-file/fake-clock integration covers missing observation/stop/expiry, completion before resume, unclean child, final retained-proof loss, callback reentry (including swallowed clock callback exceptions), backward completion time, actual admin mode nonce/hash and unknown artifacts. Actual ordinary native child is started with generated observation, confirms admission, exits cooperatively with Job0 and creates a receipt. Another actual suspended child has the fake clock advanced by post-admission Current to the10s boundary; it is refused and cleaned before running. No actual SYSTEM Host Main/Self, SCM, installed ProgramData, protected desktop/input/audio, user keys/trust or driver operations are executed.

Independent review found that a blocking Current after admission could cross the deadline. Added a distinct one-shot ConfirmTaken/ConfirmResume at the last native boundary, requiring confirmed state for receipts, original5min/10s clocks and reentrant/stop guards. Two fix reviews clear. Added generated direct confirmation wall/observation expiry controls and actual native post-inspection deadline regression. The remaining scheduling gap between the last clock sample and the OS call is not claimed atomic.

The first expanded host validator found duplicate marker/private-ACL guard strings because Quiescence is newly compiled into Host. No failed run was counted as negative evidence. The controls now select the specific Host lambda/indented guard. A final serial run passed host16 controls, worker27, package controls, journal9, session8; admission8 had passed immediately beforehand. Copied/generated-source controls restore exact bytes and positively rerun.

JS/protocol/bundle assets unchanged: reuse #282 source12470/root12532, browser2 each and clean frozen external install/build/bundle/smoke. No new whole JS suite is claimed. Service compile-only/staging tests are included in host/worker validation; no actual installation/start/stop. Controller/installer/recovery and hardware verification remain unfinished.

## Serial native results

```json
[
  {
    "name": "host",
    "code": 0,
    "seconds": 32.15
  },
  {
    "name": "worker",
    "code": 0,
    "seconds": 27.73
  },
  {
    "name": "package",
    "code": 0,
    "seconds": 11.25
  },
  {
    "name": "run-journal",
    "code": 0,
    "seconds": 11.56
  },
  {
    "name": "run-session",
    "code": 0,
    "seconds": 16.16
  }
]
```

## Intended source-control failures

```text
admission.log
signin_run_admission_generated_expiry_observation_and_single_resume_passed
negative atomic-consume
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Concurrent admission entered an uncompleted consume" ---> System.InvalidOperationException: Concurrent admission entered an uncompleted consume
negative expiry
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Expired monotonic admission accepted" ---> System.InvalidOperationException: Expired monotonic admission accepted
negative owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Revoked child scope resumed" ---> System.InvalidOperationException: Revoked child scope resumed
negative process
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Observation binding mismatch accepted: pid" ---> System.InvalidOperationException: Observation binding mismatch accepted: pid
negative binding
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Observation binding mismatch accepted: startedSha256" ---> System.InvalidOperationException: Observation binding mismatch accepted: startedSha256
negative confirm-wall
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Expired intent confirmed native resume" ---> System.InvalidOperationException: Expired intent confirmed native resume
negative confirm-observation
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Expired observation confirmed native resume" ---> System.InvalidOperationException: Expired observation confirmed native resume
negative pre-ack
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Run resumed before process observation ACK" ---> System.InvalidOperationException: Run resumed before process observation ACK
signin_run_admission_generated_expiry_observation_and_single_resume_passed
signin_run_admission_8_source_negative_controls_and_restore_passed
host-final.log
signin_host_generated_environment_job_descendants_and_revocation_passed
negative graceful-force
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Forced child was misclassified as clean" ---> System.InvalidOperationException: Forced child was misclassified as clean
negative graceful-frame
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Cooperative child did not finish cleanly" ---> System.InvalidOperationException: Cooperative child did not finish cleanly
negative graceful-exit
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Graceful completion ignored nonzero child exit" ---> System.InvalidOperationException: Graceful completion ignored nonzero child exit
negative graceful-descendants
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Graceful completion ignored live descendant" ---> System.InvalidOperationException: Graceful completion ignored live descendant
negative quiescence-marker
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Invalid quiescence marker accepted" ---> System.InvalidOperationException: Invalid quiescence marker accepted
negative quiescence-write-share
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Live quiescence lease allowed writes" ---> System.InvalidOperationException: Live quiescence lease allowed writes
negative finite-exit-code
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Finite child exit code was ignored" ---> System.InvalidOperationException: Finite child exit code was ignored
negative private-runtime
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Foreign runtime read accepted" ---> System.InvalidOperationException: Foreign runtime read accepted
negative parent-environment
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Parent environment retained" ---> System.InvalidOperationException: Parent environment retained
negative post-create-revocation
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Post-create revocation accepted" ---> System.InvalidOperationException: Post-create revocation accepted
negative admission
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unconfirmed child admission resumed" ---> System.InvalidOperationException: Unconfirmed child admission resumed
negative post-admission
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Post-admission revocation resumed child" ---> System.InvalidOperationException: Post-admission revocation resumed child
negative post-inspection-deadline
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Post-admission inspection expired before native resume" ---> System.InvalidOperationException: Post-admission inspection expired before native resume
negative handle-inheritance
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unexpected handle inherited" ---> System.InvalidOperationException: Unexpected handle inherited
negative job-membership
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Grandchild not owned by job" ---> System.InvalidOperationException: Grandchild not owned by job
negative job-accounting
System.Management.Automation.MethodInvocationException: "2" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Cooperative child did not finish cleanly" ---> System.InvalidOperationException: Cooperative child did not finish cleanly
signin_host_generated_environment_job_descendants_and_revocation_passed
signin_host_source_negatives_and_restore_passed
worker-final.log
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
signin_worker_generated_data_and_abi_passed
negative context-route
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Context route accepted other purpose" ---> System.InvalidOperationException: Context route accepted other purpose
negative control-reentry
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Reentrant release was overwritten" ---> System.InvalidOperationException: Reentrant release was overwritten
negative frame-serial
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Replaced frame ticket published" ---> System.InvalidOperationException: Replaced frame ticket published
negative frame-age
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Stale frame published" ---> System.InvalidOperationException: Stale frame published
negative drawn-frame
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Acknowledgement before publication accepted" ---> System.InvalidOperationException: Acknowledgement before publication accepted
negative epoch
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Changed signin facts published: epoch" ---> System.InvalidOperationException: Changed signin facts published: epoch
negative input-permit-age
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Signin text continued past input freshness" ---> System.InvalidOperationException: Signin text continued past input freshness
negative pointer-event
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Invalid pointer event produced input" ---> System.InvalidOperationException: Invalid pointer event produced input
negative pointer-button
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Invalid pointer button produced input" ---> System.InvalidOperationException: Invalid pointer button produced input
negative target
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Changed target was accepted" ---> System.InvalidOperationException: Changed target was accepted
negative rotation
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Rotated primary was accepted" ---> System.InvalidOperationException: Rotated primary was accepted
negative unicode-cleanup
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Unicode keyup cleanup was omitted" ---> System.InvalidOperationException: Unicode keyup cleanup was omitted
negative broker-utf8-output
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Broker UTF8 output changed" ---> System.InvalidOperationException: Broker UTF8 output changed
negative broker-utf8-input
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Broker UTF8 input changed" ---> System.InvalidOperationException: Broker UTF8 input changed
negative presence-source-latch
signin_scope_generated_epoch_expiry_frame_and_input_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence source revived" ---> System.InvalidOperationException: Presence source revived
negative presence-commands
signin_scope_generated_epoch_expiry_frame_and_input_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence accepted non-observer command" ---> System.InvalidOperationException: Presence accepted non-observer command
negative presence-callback-age
signin_scope_generated_epoch_expiry_frame_and_input_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence callback extended deadline" ---> System.InvalidOperationException: Presence callback extended deadline
negative presence-backward
signin_scope_generated_epoch_expiry_frame_and_input_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence backward clock accepted" ---> System.InvalidOperationException: Presence backward clock accepted
negative presence-reentry
signin_scope_generated_epoch_expiry_frame_and_input_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Reentrant presence publication accepted" ---> System.InvalidOperationException: Reentrant presence publication accepted
negative presence-clock-fault
signin_scope_generated_epoch_expiry_frame_and_input_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence clock exception revived" ---> System.InvalidOperationException: Presence clock exception revived
negative presence-capture-route
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence dispatched capture" ---> System.InvalidOperationException: Presence dispatched capture
negative presence-cleanup-route
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence dispatched input cleanup" ---> System.InvalidOperationException: Presence dispatched input cleanup
negative presence-command-route
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Presence route accepted active command" ---> System.InvalidOperationException: Presence route accepted active command
negative inactive-classification
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Inactive candidate was not classified" ---> System.InvalidOperationException: Inactive candidate was not classified
negative inactive-auth-wait
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Inactive worker exited before broker authentication" ---> System.InvalidOperationException: Inactive worker exited before broker authentication
negative inactive-viewer-denial
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Viewer inactive promoted to presence" ---> System.InvalidOperationException: Viewer inactive promoted to presence
negative inactive-publication
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "VerifyGeneratedData" ���Ăяo�����ɗ�O���������܂���: "Inactive result not published before wait" ---> System.InvalidOperationException: Inactive result not published before wait
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
signin_worker_generated_data_and_abi_passed
signin_worker_27_source_negative_controls_and_restore_passed
package-final.log
signin_package_generated_native_handles_and_cleanup_passed
signin_package_generated_manifest_acl_and_facts_passed
signin_package_generated_staging_manifest_passed
signin_package_cross_runtime_manifest_passed
negative owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
negative canonical
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
negative closed-paths
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
negative file-size
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
negative total-size
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe package data accepted" ---> System.InvalidOperationException: Unsafe package data accepted
negative acl-owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Foreign code owner accepted" ---> System.InvalidOperationException: Foreign code owner accepted
negative acl-write
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Foreign code write accepted" ---> System.InvalidOperationException: Foreign code write accepted
negative reparse
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe package file facts accepted" ---> System.InvalidOperationException: Unsafe package file facts accepted
negative links
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe package file facts accepted" ---> System.InvalidOperationException: Unsafe package file facts accepted
negative file-id
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Changed package file accepted" ---> System.InvalidOperationException: Changed package file accepted
negative share-write
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Package write share unexpectedly allowed" ---> System.InvalidOperationException: Package write share unexpectedly allowed
negative share-delete
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Package delete share unexpectedly allowed" ---> System.InvalidOperationException: Package delete share unexpectedly allowed
negative failure-cleanup
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native failure leaked a handle" ---> System.InvalidOperationException: Native failure leaked a handle
negative group-cleanup
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native failure leaked a handle" ---> System.InvalidOperationException: Native failure leaked a handle
signin_package_generated_native_handles_and_cleanup_passed
signin_package_generated_manifest_acl_and_facts_passed
signin_package_native_negative_controls_passed
run-journal-final.log
signin_run_journal_generated_restart_roles_process_bindings_and_crash_boundaries_passed
negative role
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Observation-only owner prepared a start" ---> System.InvalidOperationException: Observation-only owner prepared a start
negative same-run
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Previous run id was reused" ---> System.InvalidOperationException: Previous run id was reused
negative mode
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Mismatched admin mode claimed start" ---> System.InvalidOperationException: Mismatched admin mode claimed start
negative process
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Wrong observed process accepted" ---> System.InvalidOperationException: Wrong observed process accepted
negative receipt
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Host receipt alone admitted next generation" ---> System.InvalidOperationException: Host receipt alone admitted next generation
negative scope
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Open-time revoked scope consumed intent" ---> System.InvalidOperationException: Open-time revoked scope consumed intent
negative post-inspection
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Inspection-time revoked scope retained authority" ---> System.InvalidOperationException: Inspection-time revoked scope retained authority
negative stage-identity
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Replaced staged file identity was published" ---> System.InvalidOperationException: Replaced staged file identity was published
negative claim-content
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Replaced pending intent consumed with old claim data" ---> System.InvalidOperationException: Replaced pending intent consumed with old claim data
signin_run_journal_generated_restart_roles_process_bindings_and_crash_boundaries_passed
signin_run_journal_9_source_negative_controls_and_restore_passed
run-session-final.log
signin_host_lifecycle_generated_handshake_admission_receipt_and_mode_bindings_passed
negative resume
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unresumed run published receipt" ---> System.InvalidOperationException: Unresumed run published receipt
negative child-clean
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unclean child published receipt" ---> System.InvalidOperationException: Unclean child published receipt
negative retained
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Final retained proof was ignored" ---> System.InvalidOperationException: Final retained proof was ignored
negative reentry
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Reentrant completion published receipt" ---> System.InvalidOperationException: Reentrant completion published receipt
negative post-clock
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Clock callback restored completion authority" ---> System.InvalidOperationException: Clock callback restored completion authority
negative normal-fallback
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Pending admin request fell back to normal mode" ---> System.InvalidOperationException: Pending admin request fell back to normal mode
negative admin-nonce
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Wrong admin nonce admitted child branch" ---> System.InvalidOperationException: Wrong admin nonce admitted child branch
negative admin-digest
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Wrong actual admin digest admitted child branch" ---> System.InvalidOperationException: Wrong actual admin digest admitted child branch
signin_host_lifecycle_generated_handshake_admission_receipt_and_mode_bindings_passed
signin_host_lifecycle_8_source_negative_controls_and_restore_passed
```
