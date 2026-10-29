# 7B4c4c verification

Process evidence retains a native query-limited/synchronize handle. It validates PID, full creation FILETIME decimal string, exact image and (installed entry only) primary SYSTEM token/session0. It never launches or terminates a process and never reopens a PID after exit. A signaled exit with actual code0 can remain clean evidence after Current becomes false; nonzero including259 is rejected. Scope checks bracket native inspections; revocation, callback reentry and disposal terminate evidence. A process pin alone does not authorize a write or prove SCM/Job/barrier facts.

Generated ordinary processes use ephemeral named events to remain alive until the parent holds their exact handles, then exit0/7/259. Wrong creation/image, ordinary user versus required SYSTEM, live-versus-exited, final inspection-time scope revocation, cancel-latching and reentrant disposal are checked. Fixture cleanup only stops its own generated child on test failure; no product termination API exists. Production Open/Self, SCM, installed service, ProgramData, protected screen/input/audio or actual keys/trust are not invoked.

Seven actual copied-source controls fail intended InvalidOperationException and restore source bytes; final positive rerun passed. JS/build/bundle unchanged from #282/#283/#284; reuse source12470/root12532, browser2 each and frozen external build/smoke without duplicate whole tests.

API references: [QueryServiceStatusEx](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-queryservicestatusex) warns that PID is not valid after STOPPED and may not be valid in pending states; the future controller must pin while RUNNING. [GetProcessTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes) supplies the full creation FILETIME through the retained handle with query-limited rights. No post-exit lookup substitutes for this handle.

```text
signin_process_evidence_actual_ordinary_process_creation_image_exit_and_revocation_passed
negative creation
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Creation mismatch retained process pin" ---> System.InvalidOperationException: Creation mismatch retained process pin
negative image
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Image mismatch retained process pin" ---> System.InvalidOperationException: Image mismatch retained process pin
negative system
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Ordinary process became SYSTEM session0 evidence" ---> System.InvalidOperationException: Ordinary process became SYSTEM session0 evidence
negative exit
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Retained handle ignored actual exit code 7" ---> System.InvalidOperationException: Retained handle ignored actual exit code 7
negative inspection
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Inspection-time process scope remained current" ---> System.InvalidOperationException: Inspection-time process scope remained current
negative exit-inspection
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Exit inspection ignored revoked process scope" ---> System.InvalidOperationException: Exit inspection ignored revoked process scope
negative scope
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Revoked process scope remained current" ---> System.InvalidOperationException: Revoked process scope remained current
signin_process_evidence_actual_ordinary_process_creation_image_exit_and_revocation_passed
signin_process_evidence_7_source_negative_controls_and_restore_passed
```
