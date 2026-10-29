# 7B4c4e verification

Public local control requires primary elevated administrator, actual user owner, private owner mutex, fixed service configuration and a reviewed expected raw manifest SHA. Package verification holds the entire code set and actual manifest; controller authority is separated from the existing SYSTEM-only Host/Worker authority. Query-only status opens no SCM start/stop rights. The helper accepts only status/start/stop and bounded owner/manifest/admin binding metadata, no executable/path/command/credential. ValidateOnly compiles without any SCM/installed-state/owner account operation. Actual registration/installation/recovery/request preparation/result ack remain unfinished.

Start writes a fresh one-shot intent only under proved initial/observed completion and exclusive unchanged barrier, then pins the running SCM process's actual creation/image/System-session0 before ACK. Admin keeps that same handle through natural exit0, SCMclean, Job0 Host receipt and unchanged exclusive barrier before observed-stop. It reports inspect-required for the admin result, never administrative operation success or normal fallback. Normal clean Node completion retains Host/package/runtime until an explicit stop can pin it. Stop never reopens PID after process exit or forcibly terminates service processes.

Full generated tests use actual ordinary Host and child processes, native Job0, private temporary lifecycle DPAPI data, named current-user mutexes and fake SCM calls. They run initial status→start/ACK→stop→observed completion→new generation, short admin natural completion and explicit generated result acknowledgment before a fresh normal start, normal natural Node completion with Host retained, actual Host exit7 behind a forged clean SCM status, wrong SCM PID, lost scope/intent, and swallowed query reentry. The production SYSTEM/installed-path/SCM factories are compiled but never invoked; no protected desktop, input, audio device, actual identity/trust or installed state is accessed.

A deterministic staged-publication test pauses a writer after creating the intent stage and removing old generation under its journal mutex. A reader must block until complete pending publication. The source controls remove read or full-write locking separately and fail the intended incomplete-publication assertion. Native storage supplies a separate private SYSTEM/Administrators journal mutex, distinct from the long-lived owner controller mutex; reader snapshots and complete writer operations are serialized. Source may contain an incomplete stage after an interrupted writer, and no automatic repair is attempted.

The first concurrent integration exposed live *.writing inventory races. Added shared journal serialization and kept strict unknown/partial-artifact refusal. Independent review then found admin ACK closed the exact handle too early; admin now observes natural completion with the same handle and persists observed-stop. Normal retains its Host after clean Node completion, avoiding loss of later stop observation. One reviewer temporarily suspected ACK-publication/early-admin-exit race and withdrew it after confirming the shared journal mutex prevents ACK consumption before observer operation completion. Both final source reviews clear.

Two restored-positive failures were investigated with fixture-only metadata and PDB stacks, not counted as negative success. SCM stopped could precede actual process signal; Observe now waits on the same retained handle after clean SCM status and then validates exit0. A generated exit gate deliberately makes fake SCM stopped precede actual Host exit; Context.Wait (production Thread.Sleep) releases only the test gate. Restoring the old immediate CleanExit requirement fails the intended assertion. Controller ten final source controls, exact copied-byte restoration and final positive rerun passed.

Existing regression groups passed serially (below). A dependency-list update initially shifted three run-session variant row fields, causing a guard-selection failure before mutation; fixed the table, discarded that failed run, reran run-session and remaining groups. Earlier five groups were unchanged and retained their recorded successful results. Native Host/Worker compile and release staging are included. Controller public ValidateOnly compiled successfully without operations.

No JS/protocol/bundle changes: reuse #282 source12470/root12532 whole tests, browser2 each and clean frozen external install/build/bundle/smoke. No duplicate full JS suite is claimed. Controller/Host source is implemented but no dedicated service is installed/started/stopped by this work.

## Serial native regressions

```json
[
  {
    "name": "process-evidence",
    "code": 0,
    "seconds": 6.98
  },
  {
    "name": "host",
    "code": 0,
    "seconds": 31.32
  },
  {
    "name": "worker",
    "code": 0,
    "seconds": 27.32
  },
  {
    "name": "package",
    "code": 0,
    "seconds": 11.13
  },
  {
    "name": "run-journal",
    "code": 0,
    "seconds": 11.62
  },
  {
    "name": "run-session",
    "code": 0,
    "seconds": 16.29
  },
  {
    "name": "run-admission",
    "code": 0,
    "seconds": 6.81
  },
  {
    "name": "service-policy",
    "code": 0,
    "seconds": 6.17
  },
  {
    "name": "quiescence",
    "code": 0,
    "seconds": 4.01
  }
]
```

## Controller intended source failures

```text
signin_controller_actual_ordinary_host_child_job_ack_stop_observation_and_recovery_passed
negative reader-lock
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Reader observed incomplete run publication" ---> System.InvalidOperationException: Reader observed incomplete run publication
negative writer-lock
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Reader observed incomplete run publication" ---> System.InvalidOperationException: Reader observed incomplete run publication
negative admin-observer
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Short admin completion was not independently observed" ---> System.InvalidOperationException: Short admin completion was not independently observed
negative normal-host-lifetime
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Clean normal Host exited before stop observer could pin it" ---> System.InvalidOperationException: Clean normal Host exited before stop observer could pin it
negative scm-before-exit
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Stopped SCM status was mistaken for process exit" ---> System.InvalidOperationException: Stopped SCM status was mistaken for process exit ---> System.InvalidOperationException: Signin controller requires a verified installation or explicit recovery
negative scope
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Revoked SCM scope started service" ---> System.InvalidOperationException: Revoked SCM scope started service
negative intent
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unready start intent reached SCM" ---> System.InvalidOperationException: Unready start intent reached SCM
negative query-reentry
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "SCM query reentry retained authority" ---> System.InvalidOperationException: SCM query reentry retained authority
negative stop-pid
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Wrong SCM process was stopped" ---> System.InvalidOperationException: Wrong SCM process was stopped
negative host-exit
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Nonzero host exit was accepted" ---> System.InvalidOperationException: Nonzero host exit was accepted
signin_controller_actual_ordinary_host_child_job_ack_stop_observation_and_recovery_passed
signin_controller_10_source_negative_controls_and_restore_passed
```

## Delivery

PR#287 merged main7488c838a0b4e31a3eb7f4407e02bd2115e3506b. Product8793a04e passed protected Windows CI40805183483/job123222312647 and Node Windows CI40805183602/job123222312640. Final records review clear. Root26files reflected with full-file base/result preflight and final byte recheck; the documentation append preserved existing root customizations. Only eight prior approved final record files differ from source head on main; product files match. No service/installer activation or ordinary server handoff.
