# B2 dedicated session verification

Generated memory terminals and fake registered-agent starter only: no actual PTY, agent/model, microphone, screen, OS settings or production Soda. Real SessionService/SessionModel, FsSessionFile and ControlSurface are used to exercise ownership, restore, explicit adoption and final queued-input guards. Latest focused run before negatives:2 files /22 tests passed (17 server,5 protocol).

An initial full source run was deliberately interrupted after independent review found the initial same-name replacement defect; it is not reported as a completed suite. The corrected source is checked below. Prior A source/main-equivalent browser smoke visibility failure and Windows native GUI limitations remain; generated tests do not close these gaps.

## Negative controls

Each case temporarily removed only the relevant check, ran the selected regression, observed an assertion failure (not import/bootstrap failure), and restored the source byte-for-byte in finally. Server tests consume source; the full-UUID protocol test imports its source directly. No compiled artifacts were generated while modified. The initial durable negative revealed cleanup could mask an assertion with an undefined release callback; changed cleanup to optional release, then reran and obtained the assertion below. Every final raw failure is included verbatim.

### durable

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 1013ms
   × persists the launch marker before writing and never starts on a failed save 1012ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > persists the launch marker before writing and never starts on a failed save
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/assistant/AssistantSessions.test.ts:191:44
    189|   const pending = f.ensure(device);
    190|   try {
    191|     await vi.waitFor(() => expect(f.flush).toHaveBeenCalledOnce());
       |                                            ^
    192|     expect(f.manager.get(device)?.state).toBe("starting");
    193|     expect(f.start).not.toHaveBeenCalled();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:19:48
   Duration  2.25s (tests 47%, transform 45%, import 8%)
```

### runtime-owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 20ms
   × rejects a direct runtime instance replacement retaining the old conversation reference 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > rejects a direct runtime instance replacement retaining the old conversation reference
AssertionError: expected 'ready' to be 'conflict' // Object.is equality

Expected: "conflict"
Received: "ready"

 ❯ src/assistant/AssistantSessions.test.ts:440:42
    438|   expect(f.session.getPane(info.paneId)?.agentSession?.sessionId).toBe…
    439|   expect(f.session.hasVerifiedAgentSession(info.paneId, foreign.instan…
    440|   expect((await f.ensure(device)).state).toBe("conflict");
       |                                          ^
    441|   expect(f.manager.get(device)?.state).toBe("conflict");
    442|   expect(() => f.manager.target(device, foreign.instanceId)).toThrow("…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:19:51
   Duration  1.20s (transform 81%, import 17%, tests 2%)
```

### restore-proof

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 28ms
   × round-trips ownership and verified conversation identity without starting another agent after restore 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > round-trips ownership and verified conversation identity without starting another agent after restore
AssertionError: expected 'ready' to be 'conflict' // Object.is equality

Expected: "conflict"
Received: "ready"

 ❯ src/assistant/AssistantSessions.test.ts:350:46
    348|     g.session.updatePaneRuntime(info.paneId, { agent: resumed });
    349|     if (evidence === "hook") {
    350|       expect((await g.ensure(device)).state).toBe("conflict"); // Pers…
       |                                              ^
    351|       g.session.reportAgentSession(info.paneId, "codex", sessionId);
    352|     }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:19:52
   Duration  1.32s (transform 81%, import 17%, tests 2%)
```

### requested-only

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 27ms
   × never promotes a requested-only restored marker by an actor's matching name 26ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > never promotes a requested-only restored marker by an actor's matching name
AssertionError: expected 'ready' to be 'conflict' // Object.is equality

Expected: "conflict"
Received: "ready"

 ❯ src/assistant/AssistantSessions.test.ts:499:42
    497|   const actor = g.detect(info);
    498|   expect(actor.name).toBe(binding.name);
    499|   expect((await g.ensure(device)).state).toBe("conflict");
       |                                          ^
    500|   expect(g.manager.get(device)?.state).toBe("conflict");
    501|   expect(() => g.manager.target(device, actor.instanceId)).toThrow("変更…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:19:54
   Duration  1.23s (transform 81%, import 16%, tests 2%)
```

### initial-actor

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 20ms
   × never adopts a same-name replacement before the first launch detection is claimed 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > never adopts a same-name replacement before the first launch detection is claimed
AssertionError: expected 'ready' to be 'conflict' // Object.is equality

Expected: "conflict"
Received: "ready"

 ❯ src/assistant/AssistantSessions.test.ts:616:44
    614|     f.session.updatePaneRuntime(info.paneId, { agent: foreign });
    615|     expect(f.session.getPane(info.paneId)?.agent?.name).toBe(first.nam…
    616|     expect((await f.ensure(device)).state).toBe("conflict");
       |                                            ^
    617|     expect(() => f.manager.target(device, foreign.instanceId)).toThrow…
    618|     expect(f.start).toHaveBeenCalledOnce();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:19:56
   Duration  1.35s (transform 81%, import 17%, tests 2%)
```

### saved-owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 27ms
   × never promotes a requested-only restored marker by an actor's matching name 26ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > never promotes a requested-only restored marker by an actor's matching name
AssertionError: expected 'c9fd0090-dc55-4fd1-af3e-78405aa3b5ec' to be undefined

- Expected:
undefined

+ Received:
"c9fd0090-dc55-4fd1-af3e-78405aa3b5ec"

 ❯ src/assistant/AssistantSessions.test.ts:509:32
    507|       g.session.hasVerifiedAgentSession(paneId, instanceId, sessionId),
    508|   );
    509|   expect(saved.lastInstanceId).toBeUndefined();
       |                                ^
    510|   expect(saved.sessionId).toBeUndefined();
    511|   expect(g.start).not.toHaveBeenCalled();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:19:58
   Duration  1.32s (transform 81%, import 16%, tests 2%)
```

### saved-proof

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 19ms
   × only adopts an explicitly selected current actor and never carries its stale conversation reference 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > only adopts an explicitly selected current actor and never carries its stale conversation reference
AssertionError: expected '27b3a2f9-af6c-47c3-80b4-4b7c712a85b5' to be undefined

- Expected:
undefined

+ Received:
"27b3a2f9-af6c-47c3-80b4-4b7c712a85b5"

 ❯ src/assistant/AssistantSessions.test.ts:540:27
    538|       f.session.hasVerifiedAgentSession(paneId, instanceId, sessionId),
    539|   );
    540|   expect(saved.sessionId).toBeUndefined();
       |                           ^
    541|   expect(f.session.getPane(info.paneId)?.agentSession?.sessionId).toBe…
    542|   expect(f.start).toHaveBeenCalledOnce();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:20:00
   Duration  1.27s (transform 83%, import 16%, tests 2%)
```

### ensure-proof

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 21ms
   × only adopts an explicitly selected current actor and never carries its stale conversation reference 20ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > only adopts an explicitly selected current actor and never carries its stale conversation reference
AssertionError: expected '4356786f-9915-4e6b-bf96-d8dc4e200798' to be undefined

- Expected:
undefined

+ Received:
"4356786f-9915-4e6b-bf96-d8dc4e200798"

 ❯ src/assistant/AssistantSessions.test.ts:533:42
    531|   expect(workspace.assistant?.sessionId).toBeUndefined();
    532|   expect((await f.ensure(device)).state).toBe("ready");
    533|   expect(workspace.assistant?.sessionId).toBeUndefined();
       |                                          ^
    534|   const saved = savedAssistantBinding(
    535|     workspace,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:20:02
   Duration  1.29s (transform 82%, import 16%, tests 2%)
```

### queued-keys

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (17 tests | 1 failed | 16 skipped) 26ms
   × pins assistant prompts and keys through the existing final queued-input guard 25ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > pins assistant prompts and keys through the existing final queued-input guard
AssertionError: expected { ok: true, result: {} } to match object { ok: false, …(1) }
(1 matching property omitted from actual)

- Expected
+ Received

  {
-   "error": {
-     "code": "agent_not_found",
-   },
-   "ok": false,
+   "ok": true,
  }

 ❯ src/assistant/AssistantSessions.test.ts:407:20
    405|     release();
    406|     const result = await pending;
    407|     expect(result).toMatchObject({ ok: false, error: { code: "agent_no…
       |                    ^
    408|     expect(host.writes).toEqual([]);
    409|     f.session.getWorkspace(info.workspaceId)!.projectDir = join(f.stat…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  11:20:04
   Duration  1.32s (transform 80%, import 17%, tests 2%)
```

### full-uuid

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-session

 ❯ |@sodashitsu/protocol| src/desktopAssistantSession.test.ts (5 tests | 1 failed | 4 skipped) 5ms
   × keeps full device uniqueness within the existing agent name limit 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/desktopAssistantSession.test.ts > keeps full device uniqueness within the existing agent name limit
AssertionError: expected 'asst-deadbeef' not to be 'asst-deadbeef' // Object.is equality
 ❯ src/desktopAssistantSession.test.ts:31:17
     29|   const a = assistantAgentName("deadbeef-1111-4111-8111-111111111111"),
     30|     b = assistantAgentName("deadbeef-2222-4222-8222-222222222222");
     31|   expect(a).not.toBe(b);
       |                 ^
     32|   expect(isValidAgentName(a)).toBe(true);
     33|   expect(isValidAgentName(b)).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  11:20:18
   Duration  538ms (transform 73%, import 25%, tests 1%, worker 1%)
```

## Corrected full source result

- `pnpm build`: exit0, `/tmp/soda-assistant-session-full-build.log`.
- `pnpm typecheck`: exit0, `/tmp/soda-assistant-session-full-types.log`.
- `pnpm exec vitest run --maxWorkers=4`: exit0,12,824 tests passed,346.95s. Raw final output:

```text
 Test Files  870 passed (870)
      Tests  12824 passed (12824)
   Start at  11:20:51
   Duration  346.95s (tests 82%, import 10%, environment 4%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 237 times · 50.07s total, 28% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments

```

No full-suite failure remained in this completed B2 run. This does not retroactively classify the stage-A TUI timing failure or the source/main-equivalent browser smoke visibility failure as resolved. The current server-only phase does not rerun the unchanged native/browser UI smoke. Prior native Windows UI limitations remain.

Generated CI for source d0f49c2acd1236ece3f2fc1a8a27fe8fef7699ec: Ubuntu server success (run40991366712, job123854302942). Windows generated keyboard UI/unsigned packaging also succeeded (same run, job123854302496); these are generated checks, not native GUI/device evidence.
