# Desktop plugin operations verification

Base main f586aa89. Generated memory targets only: existing DesktopAgentAccess, injected extension child/clock/session, and a real owned Node process running the shipped plugin. No real screen/input/clipboard/audio, OS permission/driver/service, agent/model launch or live deployment. Source remained isolated from original dirty/root and earlier stability worktrees.

- Full build PASS: `/tmp/soda-desktop-plugin-final-build.log`.
- Full types PASS: `/tmp/soda-desktop-plugin-final-types.log`.
- Focused final17 tests PASS in3 new files, including real sample attach→observe→act→release, own-pane/run/project/cwd, synchronous pane removal/re-add, direct ownerActive between inputs, monotonic deadline, pre-base64 allocation cap, sixteen held physical calls after timeout, immediate release while full and late old completion versus fresh human grant. `/tmp/soda-desktop-plugin-final-focused.log`.
- Package validates and pack/read roundtrips with its explicit capability (`/tmp/soda-desktop-agent.sodaplugin`). No install or enable.
- Pointer taskcheck and transfer whole/correction review found no remaining must/should. Final self-check separated release from admission limits; both independent delta reviews confirmed it. Full suite / CI / delivery receipts follow below and in the final PR.

Seven actual source ablations failed the intended runtime assertions; files restored byte-for-byte in finally after each. The controller final SHA256 is c2a92a619a9988652df1bb7622918028f1787662dad4907ecd1317375ca95dda. No compiled output was generated while source defects were active. Vitest reads those sources directly. Original source/raw logs are not replaced by compile/timeout failures. The initial host test directly awaited restart against its manual clock and timed out; it was corrected to the harness run() helper and is not used as negative evidence. Type errors during implementation were fixed before final positives.

## Negative: capability

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-plugin-operations

 ❯ |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts (14 tests | 1 failed | 13 skipped) 16ms
   × requires both an explicit plugin capability and an actual one-use human grant 14ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts > requires both an explicit plugin capability and an actual one-use human grant
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/extensions/ExtensionDesktopAgents.test.ts:112:65
    110|     { ticket } = f.api.grant(f.target);
    111|   f.ext.allow = [];
    112|   expect((await f.call("desktop.agent.attach", { ticket })).ok).toBe(f…
       |                                                                 ^
    113|   f.ext.allow = ["desktop-agent"];
    114|   const attached = await f.call("desktop.agent.attach", { ticket });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  19:20:53
   Duration  1.09s (transform 73%, import 24%, tests 2%, worker 1%)


```

## Negative: actor

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-plugin-operations

 ❯ |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts (14 tests | 1 failed | 13 skipped) 125ms
   × rechecks project before the second input without an explicit review callback 123ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts > rechecks project before the second input without an explicit review callback
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/extensions/ExtensionDesktopAgents.test.ts:314:28
    312|     });
    313|     expect(result.ok).toBe(false);
    314|     expect(f.target.input).toHaveBeenCalledTimes(1);
       |                            ^
    315|     expect(f.target.control).toHaveBeenLastCalledWith(false);
    316|   },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  19:20:55
   Duration  1.21s (transform 65%, import 23%, tests 11%)


```

## Negative: deadline

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-plugin-operations

 ❯ |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts (14 tests | 1 failed | 13 skipped) 145ms
   × rechecks deadline before the second input without an explicit review callback 144ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts > rechecks deadline before the second input without an explicit review callback
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/extensions/ExtensionDesktopAgents.test.ts:313:23
    311|       inputs: [keyInput, keyInput],
    312|     });
    313|     expect(result.ok).toBe(false);
       |                       ^
    314|     expect(f.target.input).toHaveBeenCalledTimes(1);
    315|     expect(f.target.control).toHaveBeenLastCalledWith(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  19:20:58
   Duration  1.32s (transform 66%, import 21%, tests 12%, worker 1%)


```

## Negative: physical

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-plugin-operations

 ❯ |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts (14 tests | 1 failed | 13 skipped) 73ms
   × bounds sixteen physical captures across timeout and leaves rejected grants unused 69ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts > bounds sixteen physical captures across timeout and leaves rejected grants unused
AssertionError: expected { type: 'ext.result', id: '34', …(2) } to match object { ok: false, …(1) }
(5 matching properties omitted from actual)

- Expected
+ Received

  {
-   "error": {
-     "code": "server_busy",
-   },
-   "ok": false,
+   "ok": true,
  }

 ❯ src/extensions/ExtensionDesktopAgents.test.ts:272:73
    270|   const { ticket } = f.api.grant(f.target),
    271|     id = f.begin("desktop.agent.attach", { paneId: f.pane.id, ticket }…
    272|   expect(f.replies.find((r) => r.type === "ext.result" && r.id === id)…
       |                                                                         ^
    273|     ok: false,
    274|     error: { code: "server_busy" },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  19:21:01
   Duration  1.57s (transform 71%, import 23%, tests 5%)


```

## Negative: image

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-plugin-operations

 ❯ |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts (14 tests | 1 failed | 13 skipped) 425ms
   × keeps the observation size limit before allocating base64 and permits a later smaller frame 423ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts > keeps the observation size limit before allocating base64 and permits a later smaller frame
AssertionError: expected [ [ …(1) ] ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/extensions/ExtensionDesktopAgents.test.ts:227:86
    225|   const result = await f.call("desktop.agent.observe", { leaseId });
    226|   expect(result).toMatchObject({ ok: false, error: { code: "server_bus…
    227|   expect(encoding.mock.calls.filter((call) => (call as unknown[])[0] =…
       |                                                                                      ^
    228|     0,
    229|   );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  19:21:04
   Duration  1.60s (transform 52%, tests 29%, import 19%)


```

## Negative: scope-event

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-plugin-operations

 ❯ |@sodashitsu/server| src/extensions/ExtensionHost.desktop.test.ts (2 tests | 1 failed | 1 skipped) 67ms
   × advertises only explicit desktop capability and routes a real app.call through a scoped human grant 65ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionHost.desktop.test.ts > advertises only explicit desktop capability and routes a real app.call through a scoped human grant
AssertionError: expected { type: 'ext.result', …(3) } to match object { ok: false }
(10 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": false,
+   "ok": true,
  }

 ❯ src/extensions/ExtensionHost.desktop.test.ts:74:62
     72|   });
     73|   await h.until(() => child.lines().some((l) => l.id === "closed-lease…
     74|   expect(child.lines().find((l) => l.id === "closed-lease")).toMatchOb…
       |                                                              ^
     75|   await h.run(h.host.restart("user:desktop-tools"));
     76|   expect(target.control).toHaveBeenLastCalledWith(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  19:21:07
   Duration  1.57s (transform 73%, import 22%, tests 5%)


```

## Negative: release-priority

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-plugin-operations

 ❯ |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts (14 tests | 1 failed | 13 skipped) 56ms
   × bounds sixteen physical captures across timeout and leaves rejected grants unused 54ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionDesktopAgents.test.ts > bounds sixteen physical captures across timeout and leaves rejected grants unused
AssertionError: expected { type: 'ext.result', id: '33', …(2) } to match object { Object (ok, result) }
(5 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": true,
-   "result": {
-     "released": true,
-   },
+   "ok": false,
  }

 ❯ src/extensions/ExtensionDesktopAgents.test.ts:265:80
    263|   expect(finishers).toHaveLength(16);
    264|   const releaseId = f.begin("desktop.agent.release", leases[0]!);
    265|   expect(f.replies.find((r) => r.type === "ext.result" && r.id === rel…
       |                                                                                ^
    266|     ok: true,
    267|     result: { released: true },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  19:21:10
   Duration  1.29s (transform 71%, import 24%, tests 5%, worker 1%)


```


## Frozen final source checks

- Full build/typecheck PASS, exit0: `/tmp/soda-desktop-plugin-final-build.log`, `/tmp/soda-desktop-plugin-final-types.log`.
- Full runtime893 files /12,956 tests PASS,427.17s: `/tmp/soda-desktop-plugin-all-tests.log`. Existing happy-dom resource diagnostics appear without failures.
- Product source unchanged after final release correction review, seven source controls and restored-source focused17 positives. No duplicate whole suite in root.
- Scoped Windows/Ubuntu CI uses existing registries/core tests and the actual owned Node plugin child with memory frames/input. No OS desktop, real device, model/agent or live handoff.
- Exact source head CI and main tree match receipts are recorded in the delivery PR.
