# Initial signin installer verification

Source is copied only after review of the raw manifest SHA, closed inventory, sizes and file hashes. Retained files deny write/delete; inventory changes and authority loss invalidate the lease. Copy is streaming/bounded, Flush and hash verified, into an absent private stage; fixed target publication checks directory identity. Owner mutex spans absence checks through final policy inspection.

Generated ordinary temporary directories/files exercise the full source→copy→publish→exclusive barrier→machine-DPAPI initial record→fake disabled SCM registration→marker removal→manual setting path. No payload is executed. Existing service/code/data is rejected. Revocation after registration preserves disabled service and partial marker; recreation of the marker before manual enable is refused. A directory marker blocks RunStorage just like a file. Eight copied-source controls fail intended InvalidOperationException assertions; original bytes are restored and positively rerun. A first source scope mutation was masked by the second guard and was strengthened to remove both; the initial run is not passing evidence.

File factory plumbing now explicitly supplies BA ownership and SYSTEM/BA-only DACL for actual fixed storage, pending admin requests/ack records, run records and all initial installer files. Pure descriptor facts and injected ordinary file factories are tested. Actual native private-file/directory ACL writes are NOT tested. Existing constructor paths keep their ordinary generated-fixture defaults.

SCM is a fake in these suites. Native CreateService/SetSecurityInfo/ChangeServiceConfig calls, public privileged Install entry, installed paths, actual owner validation, SYSTEM/service start/stop and protected desktop/input are NOT exercised. No actual service was created, reconfigured, started or deleted. ValidateOnly inspects release bytes only and never executes source or examines target SCM/state. Upgrade/recovery are not implemented by this initial-only tool.

The generated package/host/worker/quiescence/controller/admin/journal regressions passed serially after the shared factory and marker changes. JS/protocol/bundle sources are unchanged: reuse frozen #282 source12470/root12532, browser2 each and clean external build/bundle/smoke; no new full JS run is claimed. Validation scripts then received only clearer labels and an explicit byte equality check after each installer mutation; the two affected suites were rerun.

## Native regression receipt

```json
[
  {
    "name": "install-source",
    "code": 0,
    "seconds": 6.87
  },
  {
    "name": "installer",
    "code": 0,
    "seconds": 40.92
  },
  {
    "name": "controller",
    "code": 0,
    "seconds": 28.6
  },
  {
    "name": "admin-controller",
    "code": 0,
    "seconds": 12.5
  },
  {
    "name": "run-journal",
    "code": 0,
    "seconds": 11.66
  },
  {
    "name": "run-session",
    "code": 0,
    "seconds": 16.72
  },
  {
    "name": "admin-enrollment",
    "code": 0,
    "seconds": 7.2
  },
  {
    "name": "admin-journal",
    "code": 0,
    "seconds": 4.98
  },
  {
    "name": "service-policy",
    "code": 0,
    "seconds": 6.53
  },
  {
    "name": "host",
    "code": 0,
    "seconds": 31.34
  },
  {
    "name": "worker",
    "code": 0,
    "seconds": 27.02
  },
  {
    "name": "package",
    "code": 0,
    "seconds": 11.35
  },
  {
    "name": "quiescence",
    "code": 0,
    "seconds": 3.95
  }
]
```

## Final independent review

Both independent source/correction/records reviews found no remaining must. The documentation now says existing targets abort installation rather than ambiguously suggesting service stop. Final two validation reruns exited 0 and emitted their four-controls-plus-restored-positive completion markers. Real service installation remains unperformed. Exact-head CI and guarded delivery follow this source revision.

## Intended source-control output

The following are extracted raw log lines; diagnostic stack frames are omitted.

```text
signin_install_source_generated_reviewed_inventory_pins_copy_and_refusal_passed
negative manifest
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unreviewed manifest accepted" ---> System.InvalidOperationException: Unreviewed manifest accepted
negative hash
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Changed release bytes accepted" ---> System.InvalidOperationException: Changed release bytes accepted
negative scope
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Revoked copy continued publication" ---> System.InvalidOperationException: Revoked copy continued publication
negative inventory
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Source inventory change retained lease" ---> System.InvalidOperationException: Source inventory change retained lease
signin_install_source_generated_reviewed_inventory_pins_copy_and_refusal_passed
signin_install_source_4_source_negative_controls_and_restore_passed
signin_installer_generated_fixed_targets_private_files_initial_disabled_manual_and_partial_refusal_passed
negative ready
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unverified package registered service" ---> System.InvalidOperationException: Unverified package registered service
negative enable-commit
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Uncommitted installation enabled service" ---> System.InvalidOperationException: Uncommitted installation enabled service
negative marker
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Maintenance marker bypassed before enabling" ---> System.InvalidOperationException: Maintenance marker bypassed before enabling
negative marker-directory
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Directory maintenance marker was ignored" ---> System.InvalidOperationException: Directory maintenance marker was ignored
signin_installer_generated_fixed_targets_private_files_initial_disabled_manual_and_partial_refusal_passed
signin_installer_4_source_negative_controls_and_restore_passed
```

## Delivery

PR #289 merged as ebe9f361. Exact source head98cdb66c: protected Windows CI40813475985/job123249111467 PASS4m23s; Node Windows CI40813475991/job123249110042 PASS1m42s. Root22-file preflight and raw-evidence append reflected exactly while preserving unrelated changes. No ordinary handoff or real service operation occurred.
