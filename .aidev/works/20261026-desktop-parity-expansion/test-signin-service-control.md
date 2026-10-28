# 7B4c1 verification

Fixed owner service name and literal quoted installed executable are derived from canonical owner and fixed Program Files path. Inspect opens SCM connect and service query-config/READ_CONTROL only, not change/start/stop. Rejects account other than LocalSystem, shared/interactive type, nonmanual start, unexpected error policy, dependencies/load group, recovery program/restart/reboot, delayed/noncrash actions, triggers and launch protection. Service owner SYSTEM/Administrators and control/config rights limited to them; other SIDs may query/read/interrogate only. This alone neither authenticates a controller nor proves package integrity or quiescence.

Native queries use bounded buffers<=64KiB, bounded text/pointer/action arrays, retained native handles and finally release. Generated unmanaged buffers directly exercise the same Configuration/Recovery decoders as Inspect: x64 ABI sizes/offsets, valid decode, out-of-range pointers, unterminated UTF16/MULTI_SZ, action count and array boundaries. No Inspect or SCM query is executed by tests.

Owner-bound Global controller mutex is created with private SYSTEM/Administrators ACL. Existing objects are verified without repair, finite wait1..30000ms, abandoned acquisition is refused and its acquired ownership released, recheck policy after wait. Lease is thread-affine and idempotently disposed. Mutex is serialization only, never package/service/quiescence authority. Generated tests exercise ACL policy only, not privileged named-object creation/Acquire.

Initial ACL negative replacement used constant false and failed C# unreachable-code warning before intended assertion; this is not counted. Replace by removal of the whole guard; initial5 controls passed, expanded parser7 controls passed. Expanded mutex9 controls and final review/CI follow. Product source mutations happen only in temporary byte-identical copies; each accepted control requires intended InvalidOperationException and exact restoration. No real service/register/start/stop, user identities/trust, desktop/input/audio devices, global certificates or handoff.

JS product is unchanged from TLS/startup6676c804 (cf5777db changes native test-fixture normalization and records only); reuse its frozen build/type/full/browser/external results honestly once final. Do not claim JS suite rerun for these C#-only files. Controller/installer/quiescence and real deployment remain unfinished.

Expanded native9 source controls PASS with exact copied-byte restoration: mutex owner/ACL, buffer range, action count, account, type, recovery action, service owner/control ACL. Every failure contains the intended InvalidOperationException; no compiler failure counted. Independent parser and mutex taskchecks plus final cross clear. Actual Acquire/wait/abandon/Inspect remain unexecuted; no real OS lifecycle claim.

Primary contracts: https://learn.microsoft.com/en-us/windows/win32/services/service-security-and-access-rights and https://learn.microsoft.com/en-us/dotnet/api/system.threading.abandonedmutexexception . Query-only service permissions and acquired ownership on abandonment are used explicitly.

## Native source-control evidence

```text
negative mutex-owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe controller mutex ACL accepted" ---> System.InvalidOperationException: Unsafe controller mutex ACL accepted
negative mutex-acl
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe controller mutex ACL accepted" ---> System.InvalidOperationException: Unsafe controller mutex ACL accepted
negative buffer-range
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "SCM accepted pointer before buffer" ---> System.InvalidOperationException: SCM accepted pointer before buffer
negative action-count
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "SCM accepted excessive action count" ---> System.InvalidOperationException: SCM accepted excessive action count
negative account
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Non-System service account accepted" ---> System.InvalidOperationException: Non-System service account accepted
negative type
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Interactive service type accepted" ---> System.InvalidOperationException: Interactive service type accepted
negative recovery
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Recovery restart action accepted" ---> System.InvalidOperationException: Recovery restart action accepted
negative owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Untrusted service owner accepted" ---> System.InvalidOperationException: Untrusted service owner accepted
negative acl-control
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Untrusted service control right accepted: DC" ---> System.InvalidOperationException: Untrusted service control right accepted: DC
```
