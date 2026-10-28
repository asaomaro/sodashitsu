# 7B4a: context-only inspection verification

Scope: fixed native SYSTEM/session0/private-output/package/runtime metadata route and non-authorizing Node facade. No startup wiring, administration, SCM/install, real keys/trust or desktop action. Native context dispatch precedes DPI/desktop/child creation. The final stop marker follows all lease disposal.

Independent architecture and taskcheck/cross: pointer/transfer reviewed readonly. Final musts/shoulds clear. Transfer found missing final owner check; fixed after closed callback with reentry invalidation and deadline/signal recheck. Unneeded context heartbeat writes removed. Added owner-loss, callback abort/close/expiry and closed-callback tests.

Related 41 PASS (presence21 + context20). Six actual TS product-source mutations: authority, premature metadata, pulse acceptance, owner check, reentrant close and stop proof. Each fails intended AssertionError and exact source bytes restored; raw evidence below. First authority attempt mutated only the internal facade while the public wrapper correctly withheld authority; it passed and is not counted. The accepted control mutates the public product guard.

Native ValidateOnly and generated ABI/data plus27 source-copy negative controls PASS; includes exact context argv route rejection. Current-user/generated sinks only; privileged Main, service/token/desktop/device operations were not executed. Before source build, first typecheck failed because fresh worktree protocol dist was absent; build precedes final typecheck.

Final product8360c543: source build/typecheck/builtin bundle PASS; full12,281/823 single PASS348.28s. Guarded root8 files (docs custom preserved): build/typecheck/bundle PASS, full12,343/831 single PASS358.24s. Browser startup source2 PASS12.5s/root2 PASS11.4s. Frozen external worktree8360c543 install/build/bundle/smoke PASS, clean. No repeat whole suite needed for documentation-only final delta.

Product-head CI: protected40753551539/job123046315590 PASS; Node40753564385/job123046361305 PASS. Final documentation-head CI/merge pending.

Generated native27 source controls completed on product source after the #274 APM correction was incorporated. TS six controls are actual product mutations with intended assertions, source bytes exactly restored before build/full tests. Architecture includes already-stopped-service recovery distinction and separately registered SYSTEM machine identity. All must/should findings resolved. No real privileged operation or handoff.

## TS source negative: authority

```text
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninContextProcess.test.ts:16:224
```

## TS source negative: premature

```text
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSigninContextProcess.test.ts:16:478
```

## TS source negative: pulse

```text
AssertionError: promise resolved "{ type: 'signin_context', …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "ownerSid": "S-1-5-21-1-2-3-1001",
+   "packageRoot": "C:\\Program Files\\Sodashitsu\\DesktopSignin-generated",
+   "stateDir": "C:\\ProgramData\\sodashitsu\\desktop-signin\\c169ebe52e9c0ba43200ce3a6af1b392219cdaf6006bba3e879ccb699a245fae\\runtime",
+   "type": "signin_context",
  }

 ❯ src/desktop/DesktopSigninContextProcess.test.ts:17:499
```

## TS source negative: owner

```text
AssertionError: promise resolved "{ type: 'signin_context', …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "ownerSid": "S-1-5-21-1-2-3-1001",
+   "packageRoot": "C:\\Program Files\\Sodashitsu\\DesktopSignin-generated",
+   "stateDir": "C:\\ProgramData\\sodashitsu\\desktop-signin\\c169ebe52e9c0ba43200ce3a6af1b392219cdaf6006bba3e879ccb699a245fae\\runtime",
+   "type": "signin_context",
  }

 ❯ src/desktop/DesktopSigninContextProcess.test.ts:23:482
```

## TS source negative: reentry

```text
AssertionError: promise resolved "{ type: 'signin_context', …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "ownerSid": "S-1-5-21-1-2-3-1001",
+   "packageRoot": "C:\\Program Files\\Sodashitsu\\DesktopSignin-generated",
+   "stateDir": "C:\\ProgramData\\sodashitsu\\desktop-signin\\c169ebe52e9c0ba43200ce3a6af1b392219cdaf6006bba3e879ccb699a245fae\\runtime",
+   "type": "signin_context",
  }

 ❯ src/desktop/DesktopSigninContextProcess.test.ts:23:482
```

## TS source negative: proof

```text
AssertionError: promise resolved "{ type: 'signin_context', …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "ownerSid": "S-1-5-21-1-2-3-1001",
+   "packageRoot": "C:\\Program Files\\Sodashitsu\\DesktopSignin-generated",
+   "stateDir": "C:\\ProgramData\\sodashitsu\\desktop-signin\\c169ebe52e9c0ba43200ce3a6af1b392219cdaf6006bba3e879ccb699a245fae\\runtime",
+   "type": "signin_context",
  }

 ❯ src/desktop/DesktopSigninContextProcess.test.ts:19:330
```
