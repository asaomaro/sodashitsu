# 7B4c4f verification

Added an explicit primary-admin local prepare/result/ack helper. Public mutation entry requires actual user owner, expected reviewed manifest/package, owner mutex, fixed SCM stopped, exclusive unchanged barrier and run initial/independently observed completion. It never starts a service, performs the administrative operation, repairs ACLs, resets identity/trust, clears an unknown result or resumes normal mode.

The shared enrollment codec rebuilds exactly six closed operations and normalizes labels. CA DER validation is shared once with existing Canonical; old claim-bound enrollment validation is preserved. Prepare creates a fresh nonce and issued/expires record, checks a finite local persistence deadline, machine-DPAPI protects it, writes only a fixed CreateNew stage, flushes/captures identity, reopens no-follow/private/single-link, checks deadline after inspection and nonreplace publishes. Owned buffers are cleared; managed JSON strings/OS storage are not claimed erased. Only operation name/nonce/cipher hash/expiry are public.

Result checks actual claimed envelope owner/nonce/hash and rebuilds the closed public result schema. Ack additionally requires the exact reviewed result hash and explicitly deletes the fixed request/result through the existing ack marker sequence. Incomplete can be explicitly acknowledged but never becomes success/replay. Held source files deny concurrent write; the deletion sequence guard keeps parent/owner/quiescence valid and does not reject its own already-deleted file handle.

Pipe input is bounded16KiB/10s, borrowed handle only, no surviving async input reader. EOF performs a final monotonic/deadline check. Validation-only compiles without input/state; ValidateOperationOnly reads and normalizes without administrator/SCM/storage actions, exposing exactly state/operation. Public PowerShell received generated UTF8 Japanese label/enrollment token and returned only those two fields with no payload in stdout/stderr. No request/token/cert/private key is passed in helper argv.

Generated temp files, LocalMachine DPAPI metadata and ordinary input children exercise prepare→claim→public result→exact ack, success/incomplete, caller byte ownership, unknown residue, wrong hashes, loss of scope, replaced stage, closed/unknown operation fields, oversized/unclosed/EOF-deadline input and actual public PS pipe. No actual primary SYSTEM entry, SCM, installed state, identity/trust, protected desktop/input/audio or real credentials were used.

Seven copied-source controls fail intended runtime assertions, restore bytes and positively rerun. First guard lookup matched prepare plus result scopes and was rejected before mutation; selecting the prepare-specific metadata/check sequence fixed the fixture. Independent reviews had no must; fixed EOF final clock and added a decisive boundary case/control, made C# child stdin BOM-free with finally restoration/BaseStream.Close, and nested PS cleanup so kill/dispose failures cannot skip encoding restoration. Final positive and public PS case reran after that fixture-only cleanup change.

Existing enrollment7/execution9/journal regressions passed serially; public helper ValidateOnly compiled. No JS/protocol/bundle changes: reuse frozen #282 source12470/root12532, browser2 each and clean external build/bundle/smoke. No new full JS run claimed. Installer and abnormal-state recovery remain unfinished.

## Native regressions

```json
[
  {
    "name": "admin-enrollment",
    "code": 0,
    "seconds": 7.27
  },
  {
    "name": "admin-execution",
    "code": 0,
    "seconds": 6.66
  },
  {
    "name": "admin-journal",
    "code": 0,
    "seconds": 4.8
  }
]
```

## Intended source-control evidence

```text
signin_admin_controller_generated_prepare_public_result_ack_scope_and_bounded_pipe_passed
negative scope
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Revoked preparation published request" ---> System.InvalidOperationException: Revoked preparation published request
negative stage
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Replaced pending stage was published" ---> System.InvalidOperationException: Replaced pending stage was published
negative claim-hash
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Wrong claim hash acknowledged result" ---> System.InvalidOperationException: Wrong claim hash acknowledged result
negative result-hash
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Wrong result hash acknowledged result" ---> System.InvalidOperationException: Wrong result hash acknowledged result
negative input-deadline
System.InvalidOperationException: Unclosed operation pipe ignored deadline
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Generated bounded input case failed: timeout" ---> System.InvalidOperationException: Generated bounded input case failed: timeout
negative input-final
System.InvalidOperationException: EOF operation input crossed deadline
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Generated bounded input case failed: eof-deadline" ---> System.InvalidOperationException: Generated bounded input case failed: eof-deadline
negative input-size
System.InvalidOperationException: Overlong operation pipe input accepted
System.Management.Automation.MethodInvocationException: "1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Generated bounded input case failed: oversize" ---> System.InvalidOperationException: Generated bounded input case failed: oversize
signin_admin_controller_generated_prepare_public_result_ack_scope_and_bounded_pipe_passed
signin_admin_controller_7_source_negative_controls_and_restore_passed
signin_admin_public_powershell_utf8_pipe_validation_without_payload_output_passed
```
