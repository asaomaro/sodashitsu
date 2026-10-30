# 検証

関連4ファイル46テスト通過。生成端末、temp保存ファイル、所有Node子プロセスのみ。実agent/PTY/GUI起動なし。最終build/typecheck/全体試験は実行中。

## 修正前の回帰出力

### soda-agent-lifecycle-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-lifecycle

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (27 tests | 3 failed | 24 skipped) 92ms
   × rejects queued input guards after disable while active work finishes 17ms
   × remembers a fully stopped device after replacing the manager and requires explicit activation 11ms
   × does not close the next owned idle agent after suspension begins 63ms
 ❯ |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts (5 tests | 1 failed | 4 skipped) 1064ms
   × keeps an identity that arrives during disable and requests agent stop even if app stop fails 1063ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts > keeps an identity that arrives during disable and requests agent stop even if app stop fails
AssertionError: expected "vi.fn()" to be called with arguments: [ Array(1) ]

Number of calls: 0

 ❯ src/assistant/AssistantLaunchController.test.ts:67:83


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > rejects queued input guards after disable while active work finishes
AssertionError: expected [Function] to throw an error
 ❯ src/assistant/AssistantSessions.test.ts:700:56
    698|  f.session.updatePaneRuntime(info.paneId,{agent:{...agent,state:"worki…
    699|  await f.manager.requestStop(device);
    700|  expect(()=>f.manager.target(device,agent.instanceId)).toThrow();
       |                                                        ^
    701| });
    702| it("remembers a fully stopped device after replacing the manager and r…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > remembers a fully stopped device after replacing the manager and requires explicit activation
AssertionError: expected [Function] to throw an error
 ❯ src/assistant/AssistantSessions.test.ts:705:63
    703|  const f=await fixture();const {device}=await f.ready();await f.manage…
    704|  const g=await fixture({model:f.model,stateDir:f.stateDir});
    705|  expect(()=>g.manager.ensure({deviceId:device,kind:"codex"})).toThrow(…
       |                                                               ^
    706|  await expect(g.manager.ensure({deviceId:device,kind:"codex",activate:…
    707| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > does not close the next owned idle agent after suspension begins
AssertionError: expected undefined to be defined
 ❯ src/assistant/AssistantSessions.test.ts:715:48
    713|  const drain=f.manager.drainIdleStops();await vi.waitFor(()=>expect(re…
    714|  const pause=f.manager.suspend();release();await Promise.all([drain,pa…
    715|  expect(f.session.getPane(second.info.paneId)).toBeDefined();
       |                                                ^
    716| });
    717|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  2 failed (2)
      Tests  4 failed | 28 skipped (32)
   Start at  22:58:56
   Duration  1.97s (transform 52%, tests 35%, import 13%)


```

### soda-agent-lifecycle-second-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-lifecycle

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (30 tests | 2 failed | 28 skipped) 174ms
   × rechecks an idle event received while another dedicated pane is closing 143ms
   × does not auto-resume a disabled marker when the binding flag has not been saved 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > rechecks an idle event received while another dedicated pane is closing
AssertionError: expected { …(14) } to be undefined

- Expected:
undefined

+ Received:
{
  "agent": {
    "completionSeq": 0,
    "instanceId": "3f5ad0ec-a3b1-4dca-9faf-73a62c99859c",
    "kind": "codex",
    "label": "generated",
    "name": "asst-64voyng47lakzpye5k5pljjmg",
    "serverSeenSeq": 0,
    "since": 1,
    "state": "idle",
    "verified": true,
  },
  "agentSession": null,
  "busy": false,
  "cols": 120,
  "cwd": "/tmp/soda-assistant-session-test-jlwIzv/assistant/67a3179a-e838-46c3-a1c4-f8956df77318",
  "failure": null,
  "id": "688b7653-c716-4f67-93a2-5918661d4eeb",
  "label": null,
  "rightClick": "herdr",
  "rows": 40,
  "shell": "",
  "status": "running",
  "tabId": "db1da915-0f0b-42b3-8758-f3f2da7e632a",
  "title": "",
}

 ❯ src/assistant/AssistantSessions.test.ts:741:47
    739|  f.session.updatePaneRuntime(first.info.paneId,{agent:{...first.agent,…
    740|  const again=f.manager.drainIdleStops();release();await Promise.all([d…
    741|  expect(f.session.getPane(first.info.paneId)).toBeUndefined();
       |                                               ^
    742| });
    743| it("does not auto-resume a disabled marker when the binding flag has n…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > does not auto-resume a disabled marker when the binding flag has not been saved
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "codex resume 06a85b8a-a928-409b-b535-fc1d5233a376
",
+ ]

 ❯ src/assistant/AssistantSessions.test.ts:752:43
    750|  const {mkdir,writeFile}=await import("node:fs/promises");await mkdir(…
    751|  const g=await fixture({model:new SessionModel(),stateDir:f.stateDir})…
    752|  expect(g.hosts.get(info.paneId)?.writes).toEqual([]);
       |                                           ^
    753| });
    754|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 28 skipped (30)
   Start at  23:03:38
   Duration  2.86s (transform 73%, import 20%, tests 7%)


```

### soda-agent-lifecycle-drain-boundary-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-lifecycle

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (31 tests | 1 failed | 30 skipped) 31ms
   × starts a fresh drain for a notification at the prior drain's completion boundary 30ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > starts a fresh drain for a notification at the prior drain's completion boundary
AssertionError: expected { …(14) } to be undefined

- Expected:
undefined

+ Received:
{
  "agent": {
    "completionSeq": 0,
    "instanceId": "9f3cdef6-ffee-4868-bf72-f7b1da7422f7",
    "kind": "codex",
    "label": "generated",
    "name": "asst-90ll9mipa4dnmfwr1qup9cv9m",
    "serverSeenSeq": 0,
    "since": 1,
    "state": "idle",
    "verified": true,
  },
  "agentSession": null,
  "busy": false,
  "cols": 120,
  "cwd": "/tmp/soda-assistant-session-test-krM1Mw/assistant/984d5dbe-bb40-4be5-bc7a-ef5f75cd364a",
  "failure": null,
  "id": "06d711f8-83eb-4d49-aa3e-67f4dc388d97",
  "label": null,
  "rightClick": "herdr",
  "rows": 40,
  "shell": "",
  "status": "running",
  "tabId": "39ae9f06-6001-4c0b-a32d-df95991186db",
  "title": "",
}

 ❯ src/assistant/AssistantSessions.test.ts:773:64
    771|  const first=f.manager.drainIdleStops();let next!:Promise<void>;
    772|  queueMicrotask(()=>{const ws=f.session.getWorkspace(info.workspaceId)…
    773|  await first;await next;expect(f.session.getPane(info.paneId)).toBeUnd…
       |                                                                ^
    774| });
    775|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 30 skipped (31)
   Start at  23:08:03
   Duration  1.62s (transform 81%, import 17%, tests 2%)


```

### soda-agent-lifecycle-queued-input-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-lifecycle

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (31 tests | 1 failed | 30 skipped) 28ms
   × drops an already queued assistant prompt after disabling its working owner 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > drops an already queued assistant prompt after disabling its working owner
AssertionError: expected { ok: true, …(1) } to match object { ok: false }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": false,
+   "ok": true,
  }

 ❯ src/assistant/AssistantSessions.test.ts:744:24
    742|  await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
    743|  await f.manager.requestStop(device);release();
    744|  expect(await pending).toMatchObject({ok:false});expect(host.writes).t…
       |                        ^
    745| });
    746|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 30 skipped (31)
   Start at  23:08:24
   Duration  1.63s (transform 82%, import 16%, tests 2%)


```

### soda-agent-lifecycle-fresh-evidence-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-lifecycle

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (31 tests | 1 failed | 30 skipped) 1046ms
   × round-trips ownership and verified conversation identity without starting another agent after restore 1044ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > round-trips ownership and verified conversation identity without starting another agent after restore
AssertionError: expected { …(14) } to be undefined

- Expected:
undefined

+ Received:
{
  "agent": {
    "completionSeq": 0,
    "instanceId": "8968cf62-1813-48d7-823b-1fd70d504995",
    "kind": "codex",
    "label": "generated",
    "serverSeenSeq": 0,
    "since": 1,
    "state": "idle",
    "verified": true,
  },
  "agentSession": {
    "kind": "codex",
    "reportedAt": 1793369332296,
    "sessionId": "dcc20ebd-886a-4fc7-9246-32808440796a",
  },
  "busy": false,
  "cols": 120,
  "cwd": "/tmp/soda-assistant-session-test-AloryE/assistant/ffe419f3-9608-45f9-95b2-9f1c7ebb1954",
  "failure": null,
  "id": "c22241b3-5da4-4e86-95f1-13bbeedc8fd1",
  "label": null,
  "rightClick": "herdr",
  "rows": 40,
  "shell": "",
  "status": "running",
  "tabId": "10e0311f-df86-44fc-8f90-6443dcda58ac",
  "title": "",
}

 ❯ src/assistant/AssistantSessions.test.ts:363:73
    361|     g.session.updatePaneRuntime(info.paneId, { agent: resumed });
    362|     if (evidence === "argv-stop") {
    363|       try { await vi.waitFor(()=>expect(g.session.getPane(info.paneId)…
       |                                                                         ^
    364|       finally {idleStopSubscription?.dispose();}
    365|       continue;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 30 skipped (31)
   Start at  23:08:50
   Duration  2.71s (transform 50%, tests 40%, import 10%)


```

最終build/typecheck通過。全体初回は新activate既定値に旧fixture期待値が追従しておらず1件失敗（他13026件pass）。fixture更新後の対象試験と全体を再実行し、899ファイル13027件pass（383.60秒）。PR #331同一headのCI4件成功、main merge 3cc8c76d7520e4f664ac234953c07e65e56e1aef、GitHub/local tree 8cbbc731fd057000c0ecc3840cd45a9c5b69aa70一致。
