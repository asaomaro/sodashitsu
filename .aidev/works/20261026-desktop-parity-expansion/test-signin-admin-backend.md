# 7B4b3: guarded mutable backend verification

Scope: Node mutable backend and bounded fixed helper tasks; claim-kind-bound key/policy commits, canonical enrollment matched to claimed data, machine DPAPI and fixed enrollment write/disable; closed installed assets22; readonly runtime physically refuses all writes and generic unguarded commit helper is excluded. Main/admin startup, local controller, installer and actual privileged setup remain next slices. No actual SYSTEM entry, installed/private user keys or trust, SCM, desktop/input/audio device or A/B handoff was exercised. All filesystem/crypto/process fixtures use generated ordinary-user temporary data only.

Related48 PASS (Task/Backend27 + readonly1 + existingRuntime20). Five actual product source controls: readonly write denial, mutation lease, actualprovider binding, viewer role and owned pending read retention. Intended AssertionErrors, exact bytes restored. Related suite restored48 PASS.

Native persistence8 controls PASS; generated actual temp files cover fixed destinations, wrong operation, marker permission, missing identity, expired commit, unsafe ACL callbacks and final metadata-order expiry. Initial existing-target replacement failed with Win32 access-denied5 while the inspection handle remained open; close that inspected target before rename while retaining protected directory/source leases, recheck moved source identity. Pure test diagnostics modified copies only. Pointer review found final Facts IO after last deadline guard; moved Current after Facts/test seam immediately before Move. A source control recreates the old ordering and fails intended expired-target assertion. Delta re-review clear.

Initial new metadata-case fixture reused a local name and failed compilation; fixed it and reran, never counted as a successful control. Initial source-negative expected assertions were adjusted where another earlier scenario correctly caught the same removed guard; corrected controls use intended specific assertions.

Native enrollment6 controls PASS: claim token/machine/input/peer/owner/closed fields. The generic unknown-field mutation first trips the peer-agent-role refusal, and that intended assertion is explicitly recorded. Includes generated DPAPI roundtrip, actual temp fixed enrollment write/disable, expired refusal, ECMAScript-trim display label and private reply codec. Execution9 controls PASS includes unknown native request kind; fixed helper scripts parse without execution.

JS/C# asset lists22 match. JS staging validator and node source controls PASS; Windows package generated/cross-manifest/source controls PASS. No installation or approval is implied by a generated manifest. Ordinary readonly store mutation-control creates only generated temp identity data, never a real user key.

Sensitive claim reply serialization is inside C# rather than a PowerShell ConvertTo-Json pipeline; owned plaintext/reply buffers are cleared. Managed strings/OS storage erasure is not guaranteed.

Independent taskchecks and final whole cross: Node/backend/package and native persistence/enrollment clear, all must/should resolved. Source build/typecheck/builtin bundle PASS; worker compile-only/generated27 controls PASS with the updated package assets. Whole tests/external smoke/final CI/main pending.

## Product source control readonly

```text
AssertionError: promise resolved "{ fingerprint: '81f9186b5179f162b723…' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "fingerprint": "81f9186b5179f162b723858e0c94b444401bf221b9954806d8f2bbbe99be9305",
  }

 ❯ src/desktop/DesktopSigninReadonlyStore.test.ts:7:389
```

## Product source control permit

```text
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninAdminBackend.node.test.ts:11:249


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Product source control provider

```text
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/desktop/DesktopSigninAdminBackend.node.test.ts:16:676

```

## Product source control role

```text
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/desktop/DesktopSigninAdminBackend.node.test.ts:14:381

```

## Product source control pending

```text
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninAdminBackend.node.test.ts:19:547


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
```

## native-persistence source controls (raw assertions)

```text
negative kind
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native commit accepted unrelated request kind" ---> System.InvalidOperationException: Native commit accepted unrelated request kind
negative destination
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native commit escaped fixed destinations" ---> System.InvalidOperationException: Native commit escaped fixed destinations
negative marker
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Trust request changed required marker" ---> System.InvalidOperationException: Trust request changed required marker
negative missing
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Trust request recreated missing identity" ---> System.InvalidOperationException: Trust request recreated missing identity
negative deadline
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Expired request changed target" ---> System.InvalidOperationException: Expired request changed target
negative directory-acl
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe directory policy accepted" ---> System.InvalidOperationException: Unsafe directory policy accepted
negative file-acl
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unsafe file policy changed target" ---> System.InvalidOperationException: Unsafe file policy changed target
negative metadata-order
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Late metadata completion committed expired request" ---> System.InvalidOperationException: Late metadata completion committed expired request
```

## native-enrollment source controls (raw assertions)

```text
negative token
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Enrollment claim field mismatch accepted: token" ---> System.InvalidOperationException: Enrollment claim field mismatch accepted: token
negative machine
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Enrollment claim field mismatch accepted: machineId" ---> System.InvalidOperationException: Enrollment claim field mismatch accepted: machineId
negative input
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Enrollment input scope extended" ---> System.InvalidOperationException: Enrollment input scope extended
negative peer
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Enrollment peer scope extended" ---> System.InvalidOperationException: Enrollment peer scope extended
negative owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Enrollment owner mismatch accepted" ---> System.InvalidOperationException: Enrollment owner mismatch accepted
negative unknown
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Enrollment peer agent role accepted" ---> System.InvalidOperationException: Enrollment peer agent role accepted
```

## native-execution source controls (raw assertions)

```text
negative kind
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native deadline accepted unknown request kind" ---> System.InvalidOperationException: Native deadline accepted unknown request kind
negative wall
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native wall expiry accepted" ---> System.InvalidOperationException: Native wall expiry accepted
negative monotonic
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native monotonic expiry accepted" ---> System.InvalidOperationException: Native monotonic expiry accepted
negative owner
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native owner loss accepted" ---> System.InvalidOperationException: Native owner loss accepted
negative reentry
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native reentrant deadline accepted" ---> System.InvalidOperationException: Native reentrant deadline accepted
negative result-nonce
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native result accepted other nonce" ---> System.InvalidOperationException: Native result accepted other nonce
negative result-secret
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native result accepted secret field" ---> System.InvalidOperationException: Native result accepted secret field
negative result-role
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native result promoted agent role" ---> System.InvalidOperationException: Native result promoted agent role
negative result-peers
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Native result accepted ninth peer" ---> System.InvalidOperationException: Native result accepted ninth peer
```

## package-native source controls (raw assertions)

```text
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
```
