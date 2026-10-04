# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）

（独立点検で直した指摘は 1 件 1 行。続けて、条項 `regression-negative-control` の「壊して落ちる確認」の生の出力を、タスクごとに貼る。）

- [should][conv:-] packages/server/assets/agent-hook-report.cjs:81 `Stop` に `background_tasks` が無いときの送り方が design に無い / 対応: 修正済（T3・ラウンド1。decisions D5 に記録）
- [nit][conv:-] agent-hook-report.cjs `agent_id` を MAX_ID + 1 で切る理由のコメントが無く、境界のテストが無い / 対応: 修正済（T3・ラウンド1。コメントとテストを足した）
- [nit][conv:-] agent-hook-report.test.ts `SubagentStart` の agentType・`Stop` の running の項目の切り詰めのテストが無い / 対応: 修正済（T3・ラウンド1）
- [nit][conv:-] agent-hook-report.cjs catch のコメントが「JSON でない」だけで、解釈できない入力も飲むことを書いていない / 対応: 修正済（T3・ラウンド1）

### 壊して落ちる確認（生の出力）

#### T3 フックのスクリプト（`packages/server/assets/agent-hook-report.cjs`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT: payload.tool_name !== "Agent" && payload.tool_name !== "Task" -> false
 FAIL  assets/agent-hook-report.test.ts > … > PreToolUse は tool_name が Agent・Task のときだけ。Task も受け、ほか（Bash・TaskCreate）は何も送らない
AssertionError: expected { paneId: 'p1', kind: 'claude', …(2) } to be null
      Tests  1 failed | 16 passed (17)
=== MUT: && kind === "claude") { -> ) {
 FAIL  assets/agent-hook-report.test.ts > … > kind が claude でなければ type つきを送らない（…）
AssertionError: expected { paneId: 'p1', kind: 'codex', …(3) } to deeply equal { paneId: 'p1', kind: 'codex', …(1) }
      Tests  1 failed | 16 passed (17)
=== MUT: running.length >= MAX_RUNNING -> running.length >= 1000
 FAIL  assets/agent-hook-report.test.ts > … > Stop の running は 64 件まで。超えたら truncated: true
AssertionError: expected 70 to be 64 // Object.is equality
      Tests  1 failed | 16 passed (17)
=== MUT: t.status !== "running" -> false
 FAIL  assets/agent-hook-report.test.ts > … > Stop は agent_stop。type が subagent で status が running のものだけを running に載せる（128 文字を超える ID は飛ばす）
AssertionError: expected { paneId: 'p1', kind: 'claude', …(3) } to deeply equal { paneId: 'p1', kind: 'claude', …(3) }
      Tests  1 failed | 16 passed (17)
```
