# Initial SessionStart freshness

AgentMonitor sends front PID evidence before installing the new runtime instance. Previously setFrontAgent immediately consumed the pending report, so recordVerifiedAgentSession saw no matching runtime, and instance installation deleted the old freshness mark. A single report attached the reference without making it usable.

The monitor now defers only its own setFrontAgent settlement and settles after updatePaneRuntime installs the instance, including unchanged-agent patches. Direct callers retain the default immediate behavior. No pending evidence cache, permission widening, no-PID promotion or hasVerifiedAgentSession relaxation was added.

Final fixed source: attribution/actual AgentMonitor/AssistantSessions tests: 109 passed (3 files); test-inclusive server typecheck exit 0.

Negative control: restored only SessionService.ts and AgentMonitor.ts to parent version; generated single-startup tests failed; restored both byte-exactly before final checks. Raw output:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-grok-cursor-conversations/packages/server

 ❯ src/session/SessionService.attribution.test.ts (38 tests | 2 failed | 36 skipped) 15ms
   ❯ SessionService — 会話の参照は、その pane の前面のエージェント自身の報告でだけ変わる（20261009-agent-session-attribution） (38)
     × grok: a single PID-bearing startup report becomes fresh after the actual monitor detection order 10ms
     × cursor: a single PID-bearing startup report becomes fresh after the actual monitor detection order 3ms
 ❯ src/agent/AgentMonitor.test.ts (12 tests | 2 failed | 10 skipped) 20ms
   ❯ AgentMonitor (11)
     × grok: the real monitor settles a single startup report after installing its instance 16ms
     × cursor: the real monitor settles a single startup report after installing its instance 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/agent/AgentMonitor.test.ts > AgentMonitor > grok: the real monitor settles a single startup report after installing its instance
 FAIL  src/agent/AgentMonitor.test.ts > AgentMonitor > cursor: the real monitor settles a single startup report after installing its instance
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/agent/AgentMonitor.test.ts:221:173
    219|     session.reportAgentSession(pane.id,kind,id,999); // exactly once, …
    220|     vi.useFakeTimers();monitor.start();
    221|     try{await advance(150);const actor=session.getPane(pane.id)?.agent…
       |                                                                                                                                                                             ^
    222|     finally{await monitor.stop();}
    223|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  src/session/SessionService.attribution.test.ts > SessionService — 会話の参照は、その pane の前面のエージェント自身の報告でだけ変わる（20261009-agent-session-attribution） > grok: a single PID-bearing startup report becomes fresh after the actual monitor detection order
 FAIL  src/session/SessionService.attribution.test.ts > SessionService — 会話の参照は、その pane の前面のエージェント自身の報告でだけ変わる（20261009-agent-session-attribution） > cursor: a single PID-bearing startup report becomes fresh after the actual monitor detection order
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/session/SessionService.attribution.test.ts:215:75
    213|     service.updatePaneRuntime("p1", { agent: agent({kind, instanceId:"…
    214|     expect(refOf()).toMatchObject({kind,sessionId:id});
    215|     expect(service.hasVerifiedAgentSession("p1", "fixture-instance", i…
       |                                                                           ^
    216|     service.updatePaneRuntime("p1", { agent: agent({kind, instanceId:"…
    217|     expect(service.hasVerifiedAgentSession("p1", "replacement-instance…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯


 Test Files  2 failed (2)
      Tests  4 failed | 46 skipped (50)
   Start at  17:57:13
   Duration  1.84s (transform 81%, import 17%, tests 1%)

  Transform  transforming modules took 2.74s · 81% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

undefined
/workspaces/sodashitsu-grok-cursor-conversations/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionService.attribution.test.ts src/agent/AgentMonitor.test.ts -t single

```

Restoration receipt: `negativeExit 1`, `byteExactRestored True`. Positive cases include both Grok and Cursor through the real monitor. Negative cases cover missing PID, child PID, wrong kind, expired report, closed pane and replacement instance; an unchanged runtime patch also settles valid pending evidence. Fixtures use generated PIDs/UUIDs only and invoke no model or user pane. Linux Cursor executable-to-hook PID matching is a separate change by the hook owner. This does not claim a live model-written Grok or Cursor session was tested.
