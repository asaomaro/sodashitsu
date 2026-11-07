# Explicit Grok/Cursor resume evidence

Only an actual outer CLI process with exact UUID --resume arguments supplies freshness. Added Grok/Cursor to ProcessMatcher's bounded explicit-argument grammar and SessionService argvApplied handling. Grok model/effort operands are consumed before resume parsing; Cursor's documented bundled Windows node/index.js shape is recognized, arbitrary index.js is not. Pickers, latest, prompt-like flags, unknown flags, conflicting/nested agents and missing UUID remain unsupported evidence. Persisted references alone do not supply freshness.

Generated parser/SessionService cases cover correct front UUID and later instance without explicit resume remaining unverified. Existing old kinds and fresh-session verification itself were not changed.

Negative control restored ProcessMatcher.ts and SessionService.ts only, ran exact new resume cases, and restored both byte-exactly before final checks. Raw output:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-grok-cursor-conversations/packages/server

 ❯ src/agent/ProcessMatcher.test.ts (77 tests | 3 failed | 74 skipped) 7ms
   × takes the explicit grok resume UUID from its live CLI arguments ["--model","fixture","--reasoning-effort","low","--resume","12345678-abcd-ef01-2345-6789abcdef01"] 5ms
   × takes the explicit cursor resume UUID from its live CLI arguments ["--resume","12345678-abcd-ef01-2345-6789abcdef01"] 1ms
   × extracts Cursor resume from its verified Windows bundled Node entry without treating arbitrary index.js as Cursor 1ms
 ❯ src/session/SessionService.attribution.test.ts (40 tests | 2 failed | 38 skipped) 13ms
   ❯ SessionService — 会話の参照は、その pane の前面のエージェント自身の報告でだけ変わる（20261009-agent-session-attribution） (40)
     × grok: only actual front UUID resume arguments establish restored freshness 9ms
     × cursor: only actual front UUID resume arguments establish restored freshness 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/agent/ProcessMatcher.test.ts > takes the explicit grok resume UUID from its live CLI arguments ["--model","fixture","--reasoning-effort","low","--resume","12345678-abcd-ef01-2345-6789abcdef01"]
 FAIL  src/agent/ProcessMatcher.test.ts > takes the explicit cursor resume UUID from its live CLI arguments ["--resume","12345678-abcd-ef01-2345-6789abcdef01"]
AssertionError: expected undefined to be '12345678-abcd-ef01-2345-6789abcdef01' // Object.is equality

- Expected:
"12345678-abcd-ef01-2345-6789abcdef01"

+ Received:
undefined

 ❯ src/agent/ProcessMatcher.test.ts:189:92
    187| ] as const)("takes the explicit %s resume UUID from its live CLI argum…
    188|   const id = args.at(-1)!.split("=").at(-1)!;
    189|   expect(agentResumeSessionId(job(10, [{ ...proc(10, [kind, ...args]),…
       |                                                                                            ^
    190| });
    191| it.each(["claude", "copilot", "muse", "grok", "cursor"] as const)("doe…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  src/agent/ProcessMatcher.test.ts > extracts Cursor resume from its verified Windows bundled Node entry without treating arbitrary index.js as Cursor
AssertionError: expected undefined to be '12345678-abcd-ef01-2345-6789abcdef01' // Object.is equality

- Expected:
"12345678-abcd-ef01-2345-6789abcdef01"

+ Received:
undefined

 ❯ src/agent/ProcessMatcher.test.ts:224:77
    222|  const id="12345678-abcd-ef01-2345-6789abcdef01";
    223|  const argv=[String.raw`C:\tools\cursor-agent\versions\2026.11.05\node…
    224|  expect(agentResumeSessionId(job(10,[{...proc(10,argv),ppid:1}]),"curs…
       |                                                                             ^
    225|  expect(agentResumeSessionId(job(10,[{...proc(10,["node","/unrelated/i…
    226| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  src/session/SessionService.attribution.test.ts > SessionService — 会話の参照は、その pane の前面のエージェント自身の報告でだけ変わる（20261009-agent-session-attribution） > grok: only actual front UUID resume arguments establish restored freshness
 FAIL  src/session/SessionService.attribution.test.ts > SessionService — 会話の参照は、その pane の前面のエージェント自身の報告でだけ変わる（20261009-agent-session-attribution） > cursor: only actual front UUID resume arguments establish restored freshness
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/session/SessionService.attribution.test.ts:225:64
    223|     service.setFrontAgent("p1",{kind,pids:new Set([100]),resumeId:id},…
    224|     service.updatePaneRuntime("p1",{agent:agent({kind,instanceId:"resu…
    225|     expect(service.hasVerifiedAgentSession("p1","resumed",id)).toBe(tr…
       |                                                                ^
    226|     service.updatePaneRuntime("p1",{agent:agent({kind,instanceId:"new-…
    227|     expect(service.hasVerifiedAgentSession("p1","new-instance",id)).to…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯


 Test Files  2 failed (2)
      Tests  5 failed | 112 skipped (117)
   Start at  18:17:41
   Duration  1.37s (transform 81%, import 17%, tests 1%, worker 1%)

undefined
/workspaces/sodashitsu-grok-cursor-conversations/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/agent/ProcessMatcher.test.ts src/session/SessionService.attribution.test.ts -t explicit grok|explicit cursor|only actual front UUID|Windows bundled

```

Receipt: negativeExit 1 / byteExactRestored True. Final fixed combined check with summary work: 138 related tests passed, server tsc build exit 0, test-inclusive server typecheck exit 0. Windows executable shape is a generated fixture, not an actual Windows runtime validation.
