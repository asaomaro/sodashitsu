# 7B4c4a verification

Design review closed the fast-admin-exit race with a finite started→controller process-handle observation→ACK handshake before child launch. Already-stopped state cannot rely on Host receipt/SCM alone; independent observed-stop evidence is required, otherwise explicit recovery. Observation ACK is the only narrow write while Host owns a barrier reader, and confers no generic/admin/identity/enrollment mutation permit. Generation transitions are explicit and ambiguous partial artifacts never mean never-started.

Record core implements six closed data kinds (intent, started, observation, stopped, observed-stop, initial), bounded canonical UTF8 JSON, UUIDv4/owner/package/barrier/PID/creation-FILETIME domains, normal/admin request binding and literal clean flags. Data alone does not authenticate an administrator, actual process exit, file ownership or quiescence. No Host/controller/persistence adapter invokes these classes yet.

Machine DPAPI envelopes bind kind/owner/run domains, canonical header/base64/bytes and closed record contents. Private ACLs remain mandatory: machine DPAPI alone does not isolate users. Inputs/copies/entropy/owned plaintext buffers are cleared; managed strings and OS storage erasure are not guaranteed. Generated metadata contains no real identity key or credential. Actual captured process/SCM evidence is still a later adapter requirement.

Admission bounds structural start lease<=5min and observation<=10s, rejects wrong process/creation/package/barrier/run/started digest, backward clocks, scope loss/reentry, missing/repeated ACK and repeated resume. Admission/Observation use the same monitor for every state transition so Current→consume is atomic across threads. Native callbacks/FS authority are not supplied by these clock/data objects.

Generated Record8 controls PASS: kind/owner/expiry/nonempty-job/canonical JSON and raw DPAPI kind/owner/nonce domains. Generated Admission6 controls PASS: consume serialization, expiry, scope, process/digest binding and missing ACK. All fail intended InvalidOperationException, copied source bytes restored, positive reruns PASS. Tests never call actual Host/Worker Main, SCM, fixed ProgramData, protected desktop/input/audio or real key/trust setup.

Independent review found unsynchronized Current→Take/Observation state. Fixed one shared gate (no internal inverse lock order), retained callback reentry latches, added two-thread consume/resume tests and a deterministic internal test seam (public Take passes null) that pauses after Current. The source control switches only Take to a per-call distinct lock and fails the intended concurrent-entry assertion. Initial test fixture used a multi-declarator var and failed compilation; fixed it, not counted as a negative success. Final fix re-review clear.

No JS/bundle changes from frozen8e81e541/#282: source whole12470/836 PASS322.36s, root12532/844 PASS323.24s, browser2 each12.8/8.0s and frozen external install/build/bundle/smoke PASS clean. These results are reused for native-only/data/docs additions; no duplicate full JS suite is claimed. Windows CI and final delivery follow. Physical service/controller/installer activation remains unfinished.

## record source-control evidence

```text
negative kind
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unknown run kind accepted" ---> System.InvalidOperationException: Unknown run kind accepted
negative owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Run owner mismatch accepted" ---> System.InvalidOperationException: Run owner mismatch accepted
negative expiry
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Overlong run admission accepted" ---> System.InvalidOperationException: Overlong run admission accepted
negative job-empty
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Nonempty native Job data accepted" ---> System.InvalidOperationException: Nonempty native Job data accepted
negative canonical
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Noncanonical run JSON accepted" ---> System.InvalidOperationException: Noncanonical run JSON accepted
negative kind-domain
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Run DPAPI kind domain was ignored" ---> System.InvalidOperationException: Run DPAPI kind domain was ignored
negative owner-domain
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Run DPAPI owner domain was ignored" ---> System.InvalidOperationException: Run DPAPI owner domain was ignored
negative nonce-domain
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Run DPAPI nonce domain was ignored" ---> System.InvalidOperationException: Run DPAPI nonce domain was ignored
```

## admission source-control evidence

```text
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
negative pre-ack
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Run resumed before process observation ACK" ---> System.InvalidOperationException: Run resumed before process observation ACK
```

## Delivery receipt

PR #283 merged as b312ffd4. Product 1eef88e4 passed protected Windows CI40796770170/job123195021188 and Node Windows CI40796770164/job123195020854. Final two independent record/cross reviews clear. Ten files reflected into the dirty root only after all-file exact-base/absence preflight and final source/root byte recheck. No runtime/service/installer activation. Prior JS verification is reused as stated above; no new full-JS run.
