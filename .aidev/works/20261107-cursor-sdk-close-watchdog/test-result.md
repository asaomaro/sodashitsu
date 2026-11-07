# Cursor SDK worker physical-close watchdog

Fix scope: supervisor lifetime/cleanup only; public SDK policy/auth/provider behavior unchanged. A worker's exit is not the same as physical stdout close. Normal exit arms a short retirement watchdog; timeout, cancellation and shutdown use the same bounded retirement path. Remaining owned POSIX process groups are retired even after the worker exit code is set. If close remains unconfirmed, reject within the retirement budget, discard result, retain private state, detach parent-owned pipes/IPC, emit one fixed non-content diagnostic and refuse new SDK jobs from that supervisor (also rechecked after awaits). Never describe pipe detachment as descendant death.

No Windows Job Object/native/service change was added. Existing live-parent taskkill tree termination remains; a vanished Windows parent cannot prove arbitrary descendant reclamation. Documentation preserves that limitation and the retained-state procedure. SDK summary also reports clearly that an explicit model is required.

Only self-generated workers/grandchildren were used, with fake SDK/auth-path seams. No SDK model/login, real auth, normal conversation or remote PC operation. Own fixture children were killed before temporary test roots were removed.

Final frozen source: four related Vitest files / 47 tests passed; targeted strict exactOptional/noUnchecked NodeNext TypeScript check including supervisor/test exit 0; git diff --check exit 0. Root owns full CI; it was not duplicated. Own workspace installed offline/frozen/ignore-scripts and built only its own protocol prerequisite.

Negative control restored only supervisor to parent version; unconfirmed inherited-pipe test failed, then source was restored byte-exactly before final checks. Raw output:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-cursor-sdk-cleanup/packages/server

 ❯ src/conversation/cursorSdkSummary.test.ts (11 tests | 1 failed | 10 skipped) 672ms
   ❯ Cursor SDK physical retirement (2)
     × bounds unconfirmed inherited-pipe close, retains state and prevents a new SDK job 671ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/conversation/cursorSdkSummary.test.ts > Cursor SDK physical retirement > bounds unconfirmed inherited-pipe close, retains state and prevents a new SDK job
AssertionError: expected 'still-pending' to match object { code: 'agent_prompt_failed' }

- Expected:
{
  "code": "agent_prompt_failed",
}

+ Received:
"still-pending"

 ❯ src/conversation/cursorSdkSummary.test.ts:82:22


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 10 skipped (11)
   Start at  19:09:11
   Duration  1.53s (tests 47%, transform 41%, import 12%)

undefined
/workspaces/sodashitsu-cursor-sdk-cleanup/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/conversation/cursorSdkSummary.test.ts -t bounds unconfirmed inherited-pipe

```

Receipt: negativeExit 1 / byteExactRestored True. Positive checks include normal success, timeout/cancel/close, actual owned POSIX group retirement after worker exit, and a no-retirement DI case returning a bounded error with retained directory and new-job refusal. The DI case simulates unavailable OS tree retirement; it is not a Windows runtime test.
