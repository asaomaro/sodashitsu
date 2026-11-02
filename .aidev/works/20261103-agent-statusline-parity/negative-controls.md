# 回帰テストのnegative control（生出力）

修正箇所だけを一時的に戻し、対象テストが失敗することを確認。各回の後にSHA256で元のバイト列と一致することを確認した。

## muse-timestamp

```text

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents/packages/server

 ❯ src/usage/museLiveUsage.test.ts (3 tests | 1 failed | 2 skipped) 8ms
   × does not fabricate Muse allowance and preserves over-quota/reset timestamps 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/usage/museLiveUsage.test.ts > does not fabricate Muse allowance and preserves over-quota/reset timestamps
AssertionError: expected null to match object { plan: 'Pro', …(2) }

- Expected:
{
  "asOf": 1793700000000,
  "plan": "Pro",
  "windows": [
    {
      "resetsAt": 1793700000099,
      "stale": true,
      "usedPct": 108,
    },
    {
      "stale": false,
      "usedPct": 50,
    },
  ],
}

+ Received:
null

 ❯ src/usage/museLiveUsage.test.ts:63:18
     61|     1793700000100,
     62|   );
     63|   expect(result).toMatchObject({
       |                  ^
     64|     plan: "Pro",
     65|     asOf: 1793700000000,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  00:53:50
   Duration  813ms (transform 76%, import 23%, tests 1%)

undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/usage/museLiveUsage.test.ts -t does not fabricate Muse allowance

```

復元: byte-identical。

## agy-cost

```text

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents/packages/server

 ❯ src/usage/antigravityAdapter.test.ts (4 tests | 1 failed | 3 skipped) 8ms
   × keeps Antigravity reported costs, effort and amount-only quota without fictitious percentages 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/usage/antigravityAdapter.test.ts > keeps Antigravity reported costs, effort and amount-only quota without fictitious percentages
AssertionError: expected { model: null, …(5) } to match object { costUsd: 0.4, …(3) }
(3 matching properties omitted from actual)

- Expected
+ Received

  {
    "costEstimated": true,
-   "costUsd": 0.4,
    "reasoningEffort": "high",
    "tokens": {
      "basis": "context",
    },
  }

 ❯ src/usage/antigravityAdapter.test.ts:33:80
     31|  const a=new AntigravityUsageAdapter(()=>200000);
     32|  a.note({paneId:"p",sessionId:"s",costUsd:0.4,costEstimated:true,reaso…
     33|  expect(await a.usageFor({paneId:"p",sessionId:"s",transcriptPath:unde…
       |                                                                                ^
     34|  expect((await a.accounts())[0]).toMatchObject({plan:"Pro",windows:[],…
     35| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  00:53:52
   Duration  785ms (transform 76%, import 22%, tests 1%)

undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/usage/antigravityAdapter.test.ts -t keeps Antigravity reported costs

```

復元: byte-identical。

## copilot-profile

```text

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents/packages/server

 ❯ src/agent/antigravityStatusLineWrap.test.ts (9 tests | 1 failed | 8 skipped) 28ms
   × Copilot wraps settings.json, retains command without optional type and restores exact bytes 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/agent/antigravityStatusLineWrap.test.ts > Copilot wraps settings.json, retains command without optional type and restores exact bytes
AssertionError: expected 'printf old' to contain 'soda-copilot-statusline.cjs'

Expected: "soda-copilot-statusline.cjs"
Received: "printf old"

 ❯ src/agent/antigravityStatusLineWrap.test.ts:115:95


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  00:53:53
   Duration  224ms (transform 62%, tests 20%, import 15%, worker 3%)

undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/agent/antigravityStatusLineWrap.test.ts -t Copilot wraps settings.json

```

復元: byte-identical。
