# Recipient-bound agent private foundation: validation

Code29478a38ddce784cb9a7ce7c8cc45ed9b490689a, branch feat/desktop-agent-recipient-binding, base main0ef02b66. The build began from050a0bc8 before the main merge; identical base tree ded0e268be4cb3976609afeaf1a9e150c2022f18 verified. Fast-forward to main changes commit graph only, no source bytes.

- Frozen install, final build/typecheck PASS; full source12019/807 files PASS in one run.
- Related20 tests PASS (legacy access7, recipient/privateRPC10, surface3). Generated frames/fake input only.
- Independent check WT based main0ef, exact source delta: fresh install/build, reviewer-run pnpm smoke PASS; same related20 PASS. No real OS access.
- Source and guarded-root browser each3 tests PASS in one process: remote-desktop-agent2 (one agent, human takeover; uncertain action/SIGTERM cleanup), encrypted backplane1 (generated B frames/raw Ctrl+Space).
- Windows generated Node identity code-head CI40582132878/122464026007 PASS20:55:31Z. No protected workflow was triggered for these paths.
- Root guarded mirror and build/typecheck PASS; full root12081/815 files PASS in one run.
- Independent taskcheck initially found two musts: outer owner invalidation was not checked inside a multi-input act; timer-only deadlines allowed a delayed completion before timer callback. Fixed by binding the private owner active/deadline closure into each grant, checked before/after input, and monotonic operation/lifetime deadlines. Added held-first-input + clock-only (timer not fired) regressions. Delta reviews confirm fixes; no remaining must.
- server_busy on observe is a structured recoverable response and keeps owner; no action retry. Callback exceptions cannot stop revocation cleanup. Wrong recipient/legacy attaches do not consume a rightful bound ticket. No public role/CLI/UI/Backplane route enabled by this split.

## Negative controls (direct source, exact byte restore)


## recipient-match
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-recipient-binding

 ❯ |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts (10 tests | 1 failed) 26ms
   × requires the bound authenticated recipient and does not let legacy/wrong attach consume the ticket 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts > requires the bound authenticated recipient and does not let legacy/wrong attach consume the ticket
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopAgentRecipient.test.ts:17:50
     15| it("requires the bound authenticated recipient and does not let legacy…
     16|  const f=fixture(),grant=f.api.grant(f.target,f.recipient);
     17|  expect(()=>f.api.attach("legacy",grant.ticket)).toThrow();expect(()=>…
       |                                                  ^
     18|  const lease=f.api.attachRecipient("right",grant.ticket,fingerprint);e…
     19|  const legacy=f.api.grant(f.target);expect(()=>f.api.attachRecipient("…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  05:47:49
   Duration  669ms (transform 72%, import 24%, tests 4%)


## owner-in-input-loop
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-recipient-binding

 ❯ |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts (10 tests | 2 failed) 26ms
   × stops a multi-input action immediately when the private owner loses its outer scope 4ms
   × enforces operation and owner deadlines before timer callbacks get a chance to run 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts > stops a multi-input action immediately when the private owner loses its outer scope
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/desktop/DesktopAgentRecipient.test.ts:60:228


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts > enforces operation and owner deadlines before timer callbacks get a chance to run
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/desktop/DesktopAgentRecipient.test.ts:68:250


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
   Start at  05:47:51
   Duration  651ms (transform 71%, import 24%, tests 5%)


## monotonic-deadlines
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-recipient-binding

 ❯ |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts (10 tests | 1 failed) 65ms
   × enforces operation and owner deadlines before timer callbacks get a chance to run 22ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentRecipient.test.ts > enforces operation and owner deadlines before timer callbacks get a chance to run
AssertionError: promise resolved "'{"id":"3","result":{"acknowledged":2,…'" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
"{\"id\":\"3\",\"result\":{\"acknowledged\":2,\"afterFrameSeq\":1}}"

 ❯ src/desktop/DesktopAgentRecipient.test.ts:68:151


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  05:47:52
   Duration  623ms (transform 65%, import 22%, tests 12%)

All original source bytes were restored after every negative control.
