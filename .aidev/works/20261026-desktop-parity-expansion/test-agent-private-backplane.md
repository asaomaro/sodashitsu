# Provider-private agent backplane verification

Code d9521072ce06ceeaddc1c932bc3ec00f12a468b7, base eae3d320 (same tree06862636b8318ae86c6e7a425cd8dffad990a830 as merged main3a57832e).

- Frozen install/final build/typecheck PASS. Source full12026/807 files PASS in one run. Guarded-root full12088/815 files PASS in one run; root build/typecheck PASS.
- Related39 tests PASS: scope matching and rightful ticket preservation, generated helper raw Ctrl+Space, private owner release/cancel, input OFF ceiling, two roots/shared helper isolation, finite8-owner cap/reclaim, provider invalidation during constructor, pending capture rejected before release, throwing close callback. Initial two-exclusive-viewer fixture was corrected to shared viewer setup; no product permission guard relaxed.
- Independent check worktree based merged main3a, exact code delta: fresh install/build, reviewer-run pnpm smoke PASS and related39 PASS. Logs /tmp/desktop-agent-private-backplane-independent-{smoke,related}.log.
- Source/root affected browser each3 PASS in one run: normal agent and human takeover, uncertain action/SIGTERM cleanup, generated encrypted backplane/raw Ctrl+Space. Generated helper/images/keys/fake inputs only; no real desktop/device access.
- Windows generated Node identity code-head CI40584151590/122471060796 PASS2026-10-27T21:09:39Z. No protected workflow triggered for these paths.
- Independent design/taskcheck/cross/delta reviews: no remaining must. The immediate owner-revocation observer was added so human takeover/secure revoke cancels pending capture rather than waiting on the helper. Explicit release still returns its response. Post-constructor epoch guard prevents registering an owner after a reentrant provider reconfiguration.
- No public agent role/Service/CLI/UI route activated in this split. Public integration remains next; this is not completion of task10. Deployment of internal steps259/260 is batched to reduce endpoint handoffs.

## Negative controls

Direct source changes only, four intended AssertionErrors, exact original bytes restored after each. Full build/tests use restored source.


## scope-match
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-private-backplane

 ❯ |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts (12 tests | 1 failed) 31ms
   × requires the exact private viewer scope without consuming the rightful ticket 3ms
 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (20 tests | 1 failed) 2022ms
   × rejects another root scope or recipient without consuming a rightful grant 161ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts > requires the exact private viewer scope without consuming the rightful ticket
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopAgentRecipient.test.ts:80:71
     78| it("requires the exact private viewer scope without consuming the righ…
     79|  const f=fixture(),scope="s".repeat(43),grant=f.api.grant(f.target,{..…
     80|  expect(()=>f.api.attachRecipient("absent",grant.ticket,fingerprint)).…
       |                                                                       ^
     81|  expect(f.api.attachRecipient("right",grant.ticket,fingerprint,()=>tru…
     82| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > rejects another root scope or recipient without consuming a rightful grant
AssertionError: promise resolved "'{"id":"1","result":{"leaseId":"5Xp_rA…'" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
"{\"id\":\"1\",\"result\":{\"leaseId\":\"5Xp_rAtd709NKU0E8eOxD02cTA9n09iBtwg-q-cLCi8\",\"expiresAt\":1793135105355.4436}}"

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:123:184


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 30 passed (32)
   Start at  06:03:02
   Duration  3.02s (tests 57%, transform 33%, import 9%)


## immediate-owner-revoke
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-private-backplane

 ❯ |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts (12 tests | 1 failed) 30ms
   × rejects pending capture immediately on human revoke and still delivers an explicit release response 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts > rejects pending capture immediately on human revoke and still delivers an explicit release response
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopAgentRecipient.test.ts:86:361


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 31 passed (32)
   Start at  06:03:06
   Duration  3.03s (tests 57%, transform 31%, import 11%)


## constructor-post-epoch
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-private-backplane

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (20 tests | 1 failed) 1918ms
   × does not register an agent owner if its active callback invalidates the provider during construction 57ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > does not register an agent owner if its active callback invalidates the provider during construction
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopEndpointBackplane.test.ts:141:106


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 31 passed (32)
   Start at  06:03:10
   Duration  2.85s (tests 57%, transform 32%, import 11%)


## owner-reclaim
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-private-backplane

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts (20 tests | 3 failed) 2058ms
   × binds a recipient grant to its own private viewer scope and forwards only permitted agent input 129ms
   × keeps a second root's agent alive when another root closes or its owner callback runs late 159ms
   × preserves the input ceiling and reclaims the finite private owner capacity 111ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > binds a recipient grant to its own private viewer scope and forwards only permitted agent input
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:118:170
    116|  const inputs=[{kind:"key",code:"ControlLeft",down:true},{kind:"key",c…
    117|  expect((await call(3,"desktop.agent.act",{leaseId,observationId:obser…
    118|  expect((await call(4,"desktop.agent.release",{leaseId})).result.relea…
       |                                                                                                                                                                          ^
    119| });
    120| it("rejects another root scope or recipient without consuming a rightf…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > keeps a second root's agent alive when another root closes or its owner callback runs late
AssertionError: expected 2 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/DesktopEndpointBackplane.test.ts:131:111


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointBackplane.test.ts > preserves the input ceiling and reclaims the finite private owner capacity
Error: Private desktop endpoint unavailable
 ❯ failure src/desktop/DesktopEndpointBackplane.ts:15:19
     13| const children=new Set([DESKTOP_FILES_PROTOCOL,DESKTOP_IMAGE_LANE_PROT…
     14| const secretHash=(value:string)=>createHash("sha256").update(value).di…
     15| const failure=()=>Error("Private desktop endpoint unavailable");
       |                   ^
     16| const cleanup=(fn:()=>void)=>{try{fn();}catch{/* Complete the remainin…
     17| const bytes=(raw:RawData)=>Buffer.isBuffer(raw)?raw:Array.isArray(raw)…
 ❯ DesktopEndpointBackplane.agent src/desktop/DesktopEndpointBackplane.ts:91:92
 ❯ src/desktop/DesktopEndpointBackplane.test.ts:137:114

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 29 passed (32)
   Start at  06:03:13
   Duration  3.12s (tests 56%, transform 33%, import 11%)

All source bytes restored before the final positive checks.
