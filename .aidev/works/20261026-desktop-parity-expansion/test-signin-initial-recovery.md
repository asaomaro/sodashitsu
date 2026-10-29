# Never-started initial recovery verification

Only the fully committed initial-installer crash boundary after removal of the transition marker is supported. Public Run fixes owner paths, validates primary administrator/actual user, retains exact reviewed package and owner mutex, and has a finite 60-second lifetime. Core retains private ancestors/directories and exclusive same-identity barrier. Closed slot inventory (admin/runtime/runs/quiescence.lock), empty admin/runtime and machine-DPAPI initial-only journal bound to manifest and barrier are required. No state is created or deleted.

After full disabled policy and stopped status checks, all evidence is rechecked immediately before Manual config. Afterwards full Manual policy, stopped and retained initial evidence are checked. No service start/stop/kill/recovery action is exposed. Existing manual/running/wrong package/pending journal/unknown or nonempty storage/file-or-directory marker/concurrent barrier/late marker/authority loss are refused. Unknown bytes remain present.

Independent review identified that STOPPED PID is never valid, not guaranteed zero. The predicate was extracted and corrected; generated nonzero/zero PID positives, running/failed/specific-error negatives and an actual copied-source regression reinstating Pid==0 verify this. Primary reference: https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-queryservicestatusex .

Five source controls fail intended runtime assertions, exact original byte comparison and restored positive pass. The first final-proof mutation was masked by a redundant immediate proof; that run is not passing evidence. The redundant immediate duplicate was removed while retaining the compound final proof after SCM inspection/query; the effective guard mutation then fails as intended. Generated tests use ordinary temporary files, actual DPAPI/retained native file handles/barrier, and fake SCM. Public ValidateOnly compiled without state/SCM access. No public privileged Run/native SCM mutation/actual private ACL factory/installed storage/SYSTEM/desktop/input/key/trust was exercised.

No existing product source/JS/protocol changes in this phase: reuse #289 13 native groups, and unchanged #282 frozen JS source12470/root12532/browser2 each/external build/smoke. New recovery suite and its compile check are additional evidence, not new full-suite counts. Upgrade, partial-marker recovery and general runtime-crash recovery remain unsupported.

## Raw intended-control output

```text
signin_initial_recovery_generated_initial_only_empty_private_storage_exclusive_and_no_repair_passed
negative stopped-pid
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Stopped status incorrectly used invalid PID" ---> System.InvalidOperationException: Stopped status incorrectly used invalid PID
negative initial
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Noninitial generation accepted" ---> System.InvalidOperationException: Noninitial generation accepted
negative stopped
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Running service accepted" ---> System.InvalidOperationException: Running service accepted
negative inventory
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unknown slot residue accepted" ---> System.InvalidOperationException: Unknown slot residue accepted
negative final-proof
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Late marker accepted" ---> System.InvalidOperationException: Late marker accepted
signin_initial_recovery_generated_initial_only_empty_private_storage_exclusive_and_no_repair_passed
signin_initial_recovery_5_source_negative_controls_and_restore_passed
```

## Final review

Both independent design/source/correction/records reviews clear after invalid STOPPED PID correction. Final five source controls/restored positive exit0; final public ValidateOnly exit0. Exact-head CI and guarded delivery follow.
