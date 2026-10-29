# 7B4c4b verification

Generated ordinary-user Windows temporary files exercise initial→intent→claim→started→observation→stopped→independently observed completion→next generation, reopening owners along the way. Missing records, bare Host receipts, orphan stop evidence, unknown/transition/staging artifacts, reused run IDs, wrong process/digests, role confusion, scope revocation, and changed directory policy are refused. Revocation immediately after durable transition publication leaves its marker and does not automatically resume. These are data/file boundaries; fixture PID/creation are generated metadata and no actual process/SCM authority is claimed.

Read files retain no-write/delete-share handles, no-follow/single-link/private-ACL facts and same identity through no-replace write-through claim/publication. Private parent and every supplied ancestor are pinned and rechecked. The production native adapters must still supply the fixed path, complete verified ancestor list, role-bound actual mutex/barrier/process authority, and matching package/barrier digest. Core is internal and unconnected; a callback does not itself authenticate authority. No automatic directory initialization or ACL repair.

Nine actual copied-source controls fail the intended InvalidOperationException and restore original bytes; positive rerun passed. A first compile attempt found fixture constant Run collided with method Run; renamed RunId and discarded that failure (not negative evidence). First local invocation was blocked by the Windows script policy; retry used process-local ExecutionPolicy Bypass, no persistent policy change.

No JS/bundle changes relative to #282/#283. Reuse source12470/root12532 whole tests, browser2 each and clean frozen external install/build/bundle/smoke; no new full suite claim.

Independent reviews found two commit-boundary gaps: a replacement pending/staged file could diverge from the semantic record/first write identity, and scope could expire inside metadata inspection. Claim now rereads the held actual file against original run/digest; Publish records the original flushed write-handle facts and rechecks identity plus content; Current rechecks scope after ancestor inspection; claim rechecks Current immediately before rename. New generated faults cover swapped pending, same-content replacement stage, open/inspection-time revocation, and a crash after deleting the entire previous generation. Prepare holds and matches each original record through removal. Both fix reviewers clear.

The old scope mutation removing only the initial check was masked by the new terminal check and correctly rejected as insufficient evidence. The revised scope control removes both checks and triggers the new earlier open-time revocation assertion; all nine final controls passed. The first unrelated existing host-control run hit its positive cooperative-start assertion while native compilation ran concurrently; serial retry passed all thirteen host controls. Package controls passed. No product timing was changed.

```text
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
```
