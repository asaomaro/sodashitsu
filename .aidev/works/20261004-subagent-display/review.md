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

- [should][conv:-] SubagentTracker.ts:5-10 クラスの説明が `Subagents` 型の直前に付いていた / 対応: 修正済（T5・ラウンド1）
- [should][conv:-] SubagentTracker.ts `sessionOf` が空のセッション状態を作り続け、数に上限が無い / 対応: 修正済（空のセッションを畳む `tidy` とセッション 32 件の上限。T5・ラウンド1）
- [nit][conv:-] SubagentTracker.ts 終了が起動より先に届いた ID の起動を数えてしまう / 対応: 修正済（`stopped` にある ID の起動は数えない。decisions D6。T5・ラウンド1）
- [nit][conv:-] SubagentTracker.ts 上限で数えなかった起動でも実行前の報告が消えるのが無記載 / 対応: 修正済（コメントとテスト。T5・ラウンド1）
- [nit][conv:-] SubagentTracker.test.ts 60 秒の刈り取り・期限切れの実行前の報告・agentType だけの running・同時刻の並びのテストが無い / 対応: 修正済（T5・ラウンド1）

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

#### T5 `SubagentTracker`（`packages/server/src/agent/SubagentTracker.ts`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT: now - s.pending.at > PENDING_TTL_MS -> now - s.pending.at >= PENDING_TTL_MS
 FAIL  src/agent/SubagentTracker.test.ts > … > 実行前の報告の対応づけ > 10 秒ちょうどなら付ける
AssertionError: expected undefined to be 'ぎりぎり' // Object.is equality
=== MUT: s.items.has(x.id) || s.stopped.has(x.id) -> s.items.has(x.id)
 FAIL  … > 最近終了した ID は足し直さない（60 秒を過ぎたら足す）
AssertionError: expected [ 'a1' ] to deeply equal []
 FAIL  … > 起動していない ID の終了も覚える（Stop より後に届く終了と、足し直しを防ぐ）
AssertionError: expected [ 'late' ] to deeply equal []
=== MUT: if (total >= PANE_ITEMS_MAX) -> if (total > PANE_ITEMS_MAX)
 FAIL  … > 256 件の上限 > pane の合計が 256 件に達したら数えない。ログは pane ごとに 1 回
AssertionError: expected 257 to be 256 // Object.is equality
=== MUT: if (!r.truncated) { -> if (true) {
 FAIL  … > truncated のときは足すだけで、外さない
AssertionError: expected [ 'a2' ] to deeply equal [ 'a1', 'a2' ]
=== MUT: this.markStopped(s, r.agentId); -> （削除）
 FAIL  … > 最近終了した ID は足し直さない（60 秒を過ぎたら足す）
AssertionError: expected [ 'a1' ] to deeply equal []
=== MUT: 種類の一致の条件 -> true
 FAIL  … > 種類が食い違うときは付けない（実行前の報告は残る）
AssertionError: expected { id: 'a1', type: 'Plan', …(2) } to not have property "description"
```

（T5・ラウンド1 の修正の分）
```
=== MUT: 終了済み ID の起動を数えない条件（|| s.stopped.has(r.agentId)）を外す
 FAIL  … > 終了の報告が先に届いた ID の起動は数えない
AssertionError: expected [ 'a1' ] to deeply equal []
=== MUT: while (pane.sessions.size > SESSIONS_MAX) -> while (false)
 FAIL  … > セッションの数は 32 まで。終了の報告が来ないセッション ID が溜まっても、古いものから捨てる
AssertionError: expected 40 to be 32 // Object.is equality
=== MUT: tidy（空のセッションを畳む）を外す
 FAIL  … > 中身の無いセッションの状態は残さない（空のセッションが上限の枠を使って、動いているセッションを押し出さない）
AssertionError: expected [] to deeply equal [ 'keep' ]
```
