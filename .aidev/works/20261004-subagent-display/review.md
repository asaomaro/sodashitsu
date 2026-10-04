# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）

（独立点検で直した指摘は 1 件 1 行。続けて、条項 `regression-negative-control` の「壊して落ちる確認」の生の出力を、タスクごとに貼る。）

- [should][conv:-] packages/server/assets/agent-hook-report.cjs:81 `Stop` に `background_tasks` が無いときの送り方が design に無い / 対応: 修正済（T3・ラウンド1。decisions D5 に記録）
- [nit][conv:-] agent-hook-report.cjs `agent_id` を MAX_ID + 1 で切る理由のコメントが無く、境界のテストが無い / 対応: 修正済（T3・ラウンド1。コメントとテストを足した）
- [nit][conv:-] agent-hook-report.test.ts `SubagentStart` の agentType・`Stop` の running の項目の切り詰めのテストが無い / 対応: 修正済（T3・ラウンド1）
- [nit][conv:-] agent-hook-report.cjs catch のコメントが「JSON でない」だけで、解釈できない入力も飲むことを書いていない / 対応: 修正済（T3・ラウンド1）

- [should][conv:regression-negative-control] T4 の壊して落ちる確認の生の出力が review.md に無い / 対応: 修正済（T4・ラウンド1。下に貼った）
- [nit][conv:-] AgentReportSocket.test.ts running の 64 件ちょうど・65 件の境界のテストが無い / 対応: 修正済（T4・ラウンド1）
- [nit][conv:-] AgentReportSocket.ts `MAX_LINE_BYTES` が文字数を測っているのに名前が BYTES / 対応: 修正済（`MAX_LINE_CHARS` に改名。T4・ラウンド1）

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

#### T4 受け口（`packages/server/src/agent/AgentReportSocket.ts`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT: MAX_LINE_BYTES = 32768 -> MAX_LINE_BYTES = 4096
 FAIL  src/agent/AgentReportSocket.test.ts > … > 4096 文字を超えても、32768 文字までは受ける。超えたら捨てる
AssertionError: expected [] to have a length of 1 but got +0
=== MUT: truncated = true; // 削った -> void 0; // 削った
 FAIL  … > running は 64 件まで。削ったら truncated を立てる（スクリプトが立てていなくても）
AssertionError: expected { type: 'agent_stop', …(5) } to match object { truncated: true }
=== MUT: return undefined; // 知らない type は捨てる -> return { type: "session", ...base };
 FAIL  … > 知らない type・型が違う項目は捨てる
AssertionError: expected [ { type: 'session', …(3) } ] to deeply equal []
 FAIL  … > ログに説明の中身を出さない
AssertionError: expected 0 to be greater than 0
=== MUT: logger.debug("agent report: unexpected shape, ignoring"); -> …, { payload });
 FAIL  … > ログに説明の中身を出さない
AssertionError: expected '[{"level":"debug","msg":"agent report…' not to contain '秘密の説明'
=== MUT: Array.from(v).length <= MAX_ID -> true
 FAIL  … > 128 文字を超える agentId の電文は捨てる。running の 128 文字を超える ID の項目は飛ばす
AssertionError: expected [ { type: 'subagent_start', …(4) } ] to deeply equal []
```
