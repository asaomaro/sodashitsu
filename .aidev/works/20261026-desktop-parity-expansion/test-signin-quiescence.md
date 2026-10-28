# 7B4c2 verification

Public Open derives one fixed ProgramData owner slot on fixed NTFS, never creates/deletes/replaces the barrier or repairs ACLs. Retained directory handles and shared read pin protect the initial marker/identity; one Exclusive attempt consumes the pin, closes only its own reader, opens the same barrier with share0 and rechecks file identity/marker/ACL/ancestor facts. Failure disposes all owned handles. Returned lease retains directories and exclusive file until explicit dispose. State transitions are serialized; reentrant disposal before exclusive open is refused.

PackageNative existing OpenCore remains share1. Its exact native acquisition/identity/ACL code is reused by a new share0 overload; CheckCore exposes the same current-facts check with an internal private-policy seam. Existing verifier keeps its original CodeAcl policy. Existing package source-control markers were updated to mutate the shared-read wrapper rather than a now-extracted native-call literal; accepted negative assertions are unchanged.

Generated actual temp-file tests cover active reader refusal, new reader/write refusal while exclusive, no pin replay after success/failure, replaced file identity, wrong marker/size, policy changes, revoked acquired lease, reentrant disposal and cleanup allowing subsequent ordinary file write. Four source controls (share, identity, marker, lease current policy) PASS with intended InvalidOperationException; exact copied bytes restored and positive rerun PASS. Existing native package controls PASS.

Initial share-negative fixture discarded an unexpectedly returned lease, then temp directory cleanup IOException masked the intended assertion. The fixture now always disposes unexpected returned leases before failing. Initial policy-negative was masked by the independent new-open policy guard; add direct acquired-lease Current revocation assertion instead. Neither initial failed control is counted. Independent native taskcheck/whole cross and test-delta re-review clear.

No real ProgramData path, SCM/Inspect/Acquire, account identity/trust, desktop/input/audio devices, certificates, installer or handoff is accessed. Exclusive filesystem access is not a proof of exact clean service/process exit or native all-descendant Job-zero; future controller must require those separately. JS/bundle unchanged from frozen TLS/startup6676; reuse its source12452/root12514 and browser/external results instead of repeating JS suites for native-only additions. Host/worker compile/generated regressions and CI follow.

## Native source-control evidence

```text
negative share
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Exclusive barrier accepted active reader" ---> System.InvalidOperationException: Exclusive barrier accepted active reader
negative identity
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Barrier accepted a replaced file identity" ---> System.InvalidOperationException: Barrier accepted a replaced file identity
negative marker
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Barrier accepted wrong marker" ---> System.InvalidOperationException: Barrier accepted wrong marker
negative policy
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Exclusive barrier ignored revoked policy" ---> System.InvalidOperationException: Exclusive barrier ignored revoked policy
```

Native host compile-only and staging compilation PASS; host9 controls and exact restoration PASS; worker compilation/generated27 controls PASS. Host source-control share marker also moved from the extracted native literal to the unchanged shared-read wrapper. Initial host run stopped at stale guard-marker lookup, not a regression success; after marker update all intended assertions pass. No privileged host/worker Main is run. New CI step invokes generated ordinary-temp-file checks only. Final CI/main delivery follows.

## Final verification

Product85c8b624 Windows CI both PASS: protected40779565161/job123137485195 (new generated quiescence4, existing package/host9/worker27 and other native checks) and Node40779565059/job123137484543. Guarded root9 files base-match/new, no custom overlap. All JavaScript/bundle files unchanged from frozen6676: source12452/834 PASS369.97s, root12514/842 PASS361.33s, browser2 each14.2/9.4s and external frozen install/build/bundle/smoke PASS clean. Independent final native and fixture-marker re-review clear. Final doc CI/main confirmation follows.
