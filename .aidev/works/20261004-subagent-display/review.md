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

- [nit][conv:-] AgentIntegrationInstaller.ts:287 経路の形の検査が claude 以外の 7 種の `entriesPath` にも掛かるのが無記載 / 対応: 許容（decisions D7 に記録。T7・ラウンド1）
- [nit][conv:-] AgentIntegrationInstaller.ts:268 追加の経路が配列でないとき `needsUpdate` が true になり、押しても直らない / 対応: 修正済（false にしてテストを足した。T7・ラウンド1）

- [should][conv:-] SubagentTracker.ts:261 `flush` が `publish` の例外を捕まえず、タイマーから漏れる / 対応: 修正済（try/catch とログ。テスト付き。T18・ラウンド1）
- [nit][conv:-] SubagentTracker.ts:239 X → Y で空の状態を作り直していた / 対応: 修正済（作り直さない。次の報告で `agentInstanceOf` から作る。T18・ラウンド1）
- [nit][conv:-] SubagentTracker.ts:231 報告を受けていない pane の最初の検出でタイマーを張る / 対応: 修正済（pane の状態は報告を受けたときにしか作られないので、そもそも張らない。テストで固定。T18・ラウンド1）

- [nit][conv:regression-negative-control] composeServer.ts:662,750,779 受け口の配線（`kind === "claude"` の絞り込み・停止での `close`）を直接確かめるテストが無い / 対応: 許容（T15 の統合テストで、実物のスクリプト → 実 socket → `SubagentTracker` → bus の経路として確かめ、壊して落ちる確認もそこで行う。T6・ラウンド1）

- [nit][conv:-] AgentIntegrationInstaller.test.ts テストの変数名 `mine` が利用者のほかのフックを指していて読み違えやすい / 対応: 修正済（`userHook`。T19・ラウンド1）
- [nit][conv:-] AgentIntegrationInstaller.ts `NOOP_HOOK_SCRIPT` がクラスの後ろにあり、周囲の定数の並びと違う / 対応: 修正済（定数の並びへ移した。T19・ラウンド1）
- [nit][conv:-] AgentIntegrationInstaller.ts 存在確認に `readFile` で中身を丸ごと読んでいた / 対応: 修正済（`access`。T19・ラウンド1）

- [should][conv:-] SubagentListDialog.vue:41 開く時点でエージェントを引けないと閉じず、0 件の文言のまま開き続ける / 対応: 修正済（開かずに閉じる。テスト付き。T10・ラウンド1）
- [nit][conv:-] Sidebar.vue:569 利用者の行の並びの設定で 1 行目が空だと件数のボタンも出ない前提が無記載 / 対応: 修正済（コメント。T10・ラウンド1）
- [nit][conv:-] App.vue:5 import が名前順でない / 対応: 修正済（T10・ラウンド1）
- [nit][conv:-] SubagentListDialog.test.ts 上下キーのスクロールを直接確かめるテストが無い / 対応: 許容（`tabindex` と role を単体で固定。キーの観測は T16 の E2E。T10・ラウンド1）

- [should][conv:-] SubagentPanel.vue:22 パネルを開いたまま別のノードのボタンを押すと、`openedInstanceId` が古いままで閉じてしまう / 対応: 修正済（`GraphView` が `:key` で作り直す。テスト付き。T11・ラウンド1）
- [should][conv:-] SubagentPanel.vue:6 ノードがグラフから外れても、pane と agent が残っていれば閉じない / 対応: 修正済（ノードが載っているかも見る。テスト付き。T11・ラウンド1）

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

#### T7 インストーラ（`packages/server/src/agent/AgentIntegrationInstaller.ts`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT: 自分のエントリがある経路を飛ばす条件（if (entries.some(spec.isOurs)) continue;）を無効化
 FAIL  … > 旧版の導入済み → needsUpdate が true → install で更新される（…）
AssertionError: expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2
 FAIL  … > SessionStart のエントリだけを手で消した状態: installed は false。install で全部が揃い、重ならない
AssertionError: expected [ …(2) ] to have a length of 1 but got 2
=== MUT: 経路の形の検査（pathShape(...) === "invalid"）を false に
 FAIL  … > 経路の値が配列でないときは、何も変えずに断る
AssertionError: expected true to be false // Object.is equality
 FAIL  … > hooks 自体がオブジェクトでないときも、何も変えずに断る
AssertionError: expected true to be false // Object.is equality
=== MUT: スクリプトの中身の比較（!installedScript.equals(bundled)）を外す
 FAIL  … > エントリは揃っているがスクリプトが古い／無い → needsUpdate が true。install で写し直す
AssertionError: expected false to be true // Object.is equality
=== MUT: 同梱が読めないときの戻り値 false -> true
 FAIL  … > 同梱のスクリプトが読めないときは needsUpdate を出さない（押しても直らない）
AssertionError: expected true to be false // Object.is equality
=== MUT: if (installed && !(await this.needsUpdate(spec, root))) -> if (installed)
 FAIL  … > 旧版の導入済み → needsUpdate が true → install で更新される（…）
AssertionError: expected { ok: true, message: '既に導入済みです' } to deeply equal { ok: true, message: null }
```

（T7・ラウンド1 の修正の分）
```
=== MUT: needsUpdate の「追加の経路が配列でない」判定を外す
 FAIL  … > 経路の値が配列でないとき、押しても直らない「更新が必要」を出さない
AssertionError: expected { cliDetected: false, …(2) } to match object { installed: true, needsUpdate: false }
```

#### T18 `SubagentTracker` の配る側（`SubagentTracker.ts`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT: まとめ待ちのタイマーが動いている間は新しく張らない条件（pane.timer !== undefined ||）を外す
 FAIL  … > 最初の変化から 100 ミリ秒後に、その時点の値を 1 回配る（待ちは延ばさない）
AssertionError: expected [] to have a length of 1 but got +0
=== MUT: 配れたときだけ記録（if (publish(...)) lastPublished = value）→ 常に記録
 FAIL  … > 配れなかった値は、同じ内容の報告で再び配る対象になる（配れたときにだけ記録する）
AssertionError: expected [ { paneId: 'p1', value: { …(2) } } ] to have a length of 2 but got 1
=== MUT: 最初の検出（無し → X）で lastPublished を消す行（delete pane.lastPublished）を外す
 FAIL  … > 検出が無いと思っていたのに配れていた値も、最初の検出で配り直す（…）
AssertionError: expected [ { paneId: 'p1', value: { …(2) } } ] to have a length of 2 but got 1
=== MUT: X → null・X → Y の捨てる処理（this.discard(paneId);）を外す
 FAIL  … > X → null: 状態を捨て、まとめ待ちのタイマーも取り消す
AssertionError: expected 1 to be +0 // Object.is equality
 FAIL  … > X → Y: 古い一覧は新しい検出に付かない。新しい検出は分からない（undefined）から始まる
=== MUT: discard でタイマーを取り消す行を外す
 FAIL  … > X → null: 状態を捨て、まとめ待ちのタイマーも取り消す
AssertionError: expected 1 to be +0 // Object.is equality
 FAIL  … > pane.closed: 状態を捨て、タイマーも取り消す
=== MUT: 同じ instanceId のイベントを止める条件（pane.instanceId === instanceId）を外す
 FAIL  … > 検出された後の自分の配信（同じ instanceId のイベント）では、何もしない
AssertionError: expected undefined to be 1 // Object.is equality
=== MUT: 同じ内容を配らない比較（sameSubagents(value, pane.lastPublished)）を false に
 FAIL  … > 同じ内容は配らない（配った値と同じに戻ったときも）
AssertionError: expected [ …(2) ] to have a length of 1 but got 2
```

（T18・ラウンド1 の修正の分）
```
=== MUT: flush の try/catch を外す
 FAIL  src/agent/SubagentTracker.test.ts > … > 配る処理が例外を投げても、タイマーから漏らさず、配れなかった扱いにする
AssertionError: expected [Function] to not throw an error but 'Error: boom' was thrown
```

#### T6 `SessionService` と配線（`packages/server/src/session/SessionService.ts`。壊した後に元へ戻し `cmp` で一致を確認済み。`agent` は `SessionFile.ts` が保存していないこと〔`agentSession` だけ〕も確かめた）

```
=== MUT: sameAgent の subagents の参照比較（a.subagents === b.subagents）を true に
 FAIL  … > setAgentSubagents > 検出されていれば差し替えて pane.agent_status_changed を配り true。…
AssertionError: expected [] to have a length of 1 but got +0
 FAIL  … > 周期の更新（AgentTracker が毎回 subagents の無い新しい AgentInfo を渡す）で落ちず、同じ参照のまま引き継ぐ。状態が変わっても保つ
=== MUT: updatePaneRuntime の引き継ぎを false に
 FAIL  … > 周期の更新（…）で落ちず、同じ参照のまま引き継ぐ。状態が変わっても保つ
AssertionError: expected [ 'pane.agent_status_changed' ] to deeply equal []
=== MUT: 引き継ぎの instanceId の一致条件を true に
 FAIL  … > エージェントの入れ替わり（別の instanceId）・終了（null）で消え、新しい検出は subagents を持たない
AssertionError: expected { instanceId: 'a2', …(8) } to not have property "subagents"
=== MUT: setAgentSubagents の検出の有無の確認（!agent）を外す
 FAIL  … > エージェントが検出されていなければ何もせず false（イベントも出さない）
AssertionError: expected true to be false // Object.is equality
```

#### T19 インストーラの削除と配布（`AgentIntegrationInstaller.ts`・`AgentIntegrationService.ts`・`scripts/package.mjs`。壊した後に元へ戻した）

```
=== MUT(AgentIntegrationService.ts): status の各 kind の状態から needsUpdate を落とす
 FAIL  … > DefaultAgentIntegrationService — needsUpdate > status に各 kind の needsUpdate を載せる
AssertionError: expected { cliDetected: true, installed: true } to match object { installed: true, needsUpdate: true }
 FAIL  … > 更新（install）の後の agent_integration.changed に、直った needsUpdate が載る
=== MUT(AgentIntegrationInstaller.ts): uninstall が entriesPath だけを見る
 FAIL  … > uninstall removes only our entries from every path, leaving other hooks intact, and blanks the copied script
AssertionError: expected [ { matcher: 'compact', …(1) }, …(1) ] to deeply equal [ { matcher: 'compact', …(1) } ]
 FAIL  … > uninstall は SessionStart のエントリだけを手で消した状態からも、残りの経路から外す
=== MUT: スクリプトを何もしない中身に差し替える代わりに消す
 FAIL  … > uninstall removes only our entries from every path, leaving other hooks intact, and blanks the copied script
=== MUT: 「未導入でした」を SessionStart だけで判定する
 FAIL  … > uninstall は SessionStart のエントリだけを手で消した状態からも、残りの経路から外す
AssertionError: expected { ok: true, message: '未導入でした' } to deeply equal { ok: true, message: null }
```

配布物（`node scripts/package.mjs --no-build --no-install --no-archive`。作った `release/` は確認後に消した）:

```
修正前の package.mjs で作った配布物:   find release -path '*server/assets*' | wc -l  → 0（packages/server/ は dist と package.json だけ）
修正後:                               release/sodashitsu-0.1.0/packages/server/assets/agent-hook-report.cjs（テストは入らない）
```

#### T9 共有の純関数と操作（`packages/client-core/src/agent/subagents.ts`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT: 負を 0 に丸める（Math.max(0, …)）を外す
 FAIL  src/agent/subagents.test.ts > formatSubagentElapsed > 負（時計のずれ）は 0 秒
AssertionError: expected '-5秒' to be '0秒' // Object.is equality
=== MUT: if (seconds < 60) return -> if (seconds <= 60) return
 FAIL  src/agent/subagents.test.ts > formatSubagentElapsed > 60 秒以上 60 分未満は分
AssertionError: expected '60秒' to be '1分' // Object.is equality
=== MUT: return hidden > 0 ? -> return hidden >= 0 ?
 FAIL  src/agent/subagents.test.ts > ほか n 件 > count が items より多いときだけ出す
AssertionError: expected 'ほか 0 件' to be null
```

#### T10 ブラウザ版のサイドバー・一覧ダイアログ・引き方のストア（`Sidebar.vue`・`SubagentListDialog.vue`・`store/subagents.ts`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT(store/subagents.ts): 選んでいるマシンの判定（target.machineId === machines.selectedId）を true に
 FAIL  src/store/subagents.test.ts > … > 選んでいないマシンの pane は、そのマシンの要約から引く
AssertionError: expected undefined to deeply equal { instanceId: 'a1', …(8) }
 FAIL  … > pane の ID が衝突する 2 つのマシンで取り違えない（選んでいるのは local。m2 の p1 は m2 のもの）
=== MUT(Sidebar.vue): 件数のボタンの @click.stop を @click に
 FAIL  src/components/Sidebar.test.ts > Sidebar — サブエージェントの件数のボタン > 押すと、そのエージェントの一覧のダイアログを開く（…）。行の click・pointerdown へ伝えない
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
=== MUT(Sidebar.vue): 件数のボタンの @pointerdown.stop を外す
 FAIL  … > 押すと、そのエージェントの一覧のダイアログを開く（…）。行の click・pointerdown へ伝えない
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
=== MUT(Sidebar.vue): v-if="i === 0 && subagentCount(agent) > 0" -> v-if="i === 0"
 FAIL  … > 1 件以上のときだけ出る（分からない・0 件では出さない）
AssertionError: expected true to be false // Object.is equality
=== MUT(SubagentListDialog.vue): 説明を {{ }} から v-html に
 FAIL  src/components/SubagentListDialog.test.ts > … > 説明は文字として出す（HTML を書いても要素にならない）
AssertionError: expected true to be false // Object.is equality
=== MUT(SubagentListDialog.vue): 入れ替わりの判定（a.instanceId !== openedInstanceId.value）を外す
 FAIL  … > エージェントが入れ替わったら（instanceId が変わったら）閉じる
AssertionError: expected { kind: 'subagents', …(2) } to be null
=== MUT(SubagentListDialog.vue): 10 秒ごとの経過時間の更新（setInterval）を外す
 FAIL  … > 経過時間は 10 秒ごとに進む
AssertionError: expected '0秒' to be '10秒' // Object.is equality
=== MUT(SubagentListDialog.vue): 背景のクリック（@click.self="close"）を外す
 FAIL  … > ［閉じる］・背景のクリック・Esc（cancel）で閉じる。ダイアログの中のクリックでは閉じない
AssertionError: backdrop: expected { kind: 'subagents', … } to be null
```

（T10・ラウンド1 の修正の分）
```
=== MUT: 開く時点で対象のエージェントが居なければ閉じる処理を外す
 FAIL  src/components/SubagentListDialog.test.ts > … > 開く時点で対象のエージェントが居なければ、開かずに閉じる（0 件の文言のまま開き続けない）
AssertionError: expected { kind: 'subagents', … } to be null
```

#### T14 `sodactl`（`packages/cli/src/agentStatus.ts`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT: 項目が無いとき null を返す行を { count: 0, items: [] } に
 FAIL  src/agentStatus.test.ts > subagents > 報告を受けていない（項目が無い）エージェントは null（分からない）
AssertionError: expected { paneId: 'p1', name: null, …(12) } to deeply equal { paneId: 'p1', name: null, …(12) }
=== MUT: type: s.type ?? null -> type: s.type
 FAIL  … > 各項目は {id, type, description, background, startedAt}。分からない値は null で埋め、項目の有無を揺らさない
=== MUT: background: s.background ?? null -> s.background || null
 FAIL  … > background: false は false のまま（null にしない）。count は items より大きくてもそのまま
AssertionError: expected null to be false // Object.is equality
=== MUT: subagents: subagentsViewOf(agent.subagents) -> null
 FAIL  … > 0 件なら {count: 0, items: []}（null と区別する）
AssertionError: expected null to deeply equal { count: +0, items: [] }
```

#### T20 一覧のフォーカスと操作 `show_subagents`（`SubagentListDialog.vue`・`ActionDispatcher.ts`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT(SubagentListDialog.vue): フォーカスを戻す行（el?.focus()）を外す
 FAIL  … > 閉じたときのフォーカスの戻り先 > ボタンから開いた: 閉じるとボタンへ戻る
AssertionError: expected <div data-v-344d990d …(4)>…(1)</div> to be <button …(2)></button> // Object.is equality
=== MUT: 「ボタンから開いたときだけ」の条件（!wasButton）を外す
 FAIL  … > show_subagents から開いた（opener なし）: ボタンがあっても移さない（端末へ）
AssertionError: expected <button …(2)></button> to be <div id="term" tabindex="0"></div> // Object.is equality
=== MUT: 行へのフォールバック（?? document.querySelector(… [data-agent-pane] …)）を外す
 FAIL  … > ボタンから開いたが、ボタンがもう無い（0 件になった等）: 行へ戻る
AssertionError: expected <div data-v-344d990d …(4)>…(1)</div> to be <div class="sidebar-row" …(2)></div> // Object.is equality
=== MUT(ActionDispatcher.ts): 件数の確認（if (count < 1) return;）を外す
 FAIL  … > showSubagents（show_subagents） > 0 件・分からない（項目なし）・エージェントが居ない・フォーカスが無いときは何もしない
AssertionError: expected { kind: 'subagents', …(2) } to be null
=== MUT: 対象のマシンを this.machines.selectedId から "local" に
 FAIL  … > showSubagents（show_subagents） > 別のマシンを選んでいれば、そのマシンの対象として開く
AssertionError: expected { kind: 'subagents', …(2) } to match object { kind: 'subagents', …(2) }
```

#### T11 ブラウザ版のグラフ（`GraphNode.vue`・`GraphView.vue`・`SubagentPanel.vue`・`SubagentList.vue`。壊した後に元へ戻し `cmp` で一致を確認済み）

```
=== MUT(GraphNode.vue): 件数のボタンの @pointerdown.stop を外す
 FAIL  src/components/graph/GraphView.subagents.test.ts > グラフのノードの件数のボタン > 押すとグラフの中のパネルが開く。ノードの選択・ドラッグ・線の作成・pane への移動を始めない
AssertionError: expected [ 'graph-node', 'graph-node-selected' ] to not include 'graph-node-selected'
=== MUT(GraphNode.vue): <template v-if="subagentCount > 0"> -> v-if="true"
 FAIL  … > 1 件以上のときだけ出る（数・読み上げの名前つき）。…
AssertionError: expected true to be false // Object.is equality
=== MUT(GraphNode.vue): 読み取り専用（モバイル）の数だけの表示（v-if="readOnly"）を外す
 FAIL  … > モバイルの読み取り専用のグラフ: 数だけを出し（ボタンではない）、押しても s でも開かない
AssertionError: expected true to be false // Object.is equality
=== MUT(GraphView.vue): 閉じたときにノードへフォーカスを戻す行（focusNode(key)）を外す
 FAIL  … > Esc は 1 段ずつ: まずパネルを閉じてノードへフォーカスが戻り、グラフ画面は閉じない。…
AssertionError: expected <body><div data-v-app>…(1)</div></body> to be <div data-v-c147c260 …(8)>…(4)</div> // Object.is equality
=== MUT(GraphView.vue): グラフ画面を閉じるときの subagentsKey の取り消しを外す
 FAIL  … > グラフ画面を閉じたら、パネルも閉じる（開き直しても開いたままにならない）
AssertionError: expected true to be false // Object.is equality
=== MUT(GraphView.vue): escape() の段の subagentsKey の項を外す
 FAIL  … > Esc は 1 段ずつ: まずパネルを閉じてノードへフォーカスが戻り、グラフ画面は閉じない。…
AssertionError: expected true to be false // Object.is equality
=== MUT(SubagentPanel.vue): キーの ev.stopPropagation() を外す
 FAIL  … > パネルの上のキー・ホイールを、グラフ画面（ズーム・パン）へ渡さない
AssertionError: expected [ 'key:ArrowDown', 'key:+', 'key:1' ] to deeply equal []
=== MUT(SubagentPanel.vue): @wheel.stop を外す
 FAIL  … > パネルの上のキー・ホイールを、グラフ画面（ズーム・パン）へ渡さない
AssertionError: expected [ 'wheel' ] to deeply equal []
=== MUT(SubagentPanel.vue): 対象が居なくなった・入れ替わったときに閉じる watch を外す
 FAIL  … > 対象のエージェントが居なくなったら閉じる。入れ替わっても閉じる。同じ instanceId の更新では閉じない
AssertionError: expected true to be false // Object.is equality
```

（落ちなかった変異: 件数のボタンの `@click.stop`、キー `s` の `count > 0` と `openSubagents` 内のモバイル・件数の検査。ノードに click の受けが無く、`openSubagents` が同じ検査を持つ二重の守りで、片方だけを外しても挙動が変わらないため。どちらも残す。）

（T11・ラウンド1 の修正の分）
```
=== MUT(GraphView.vue): SubagentPanel の :key="subagentsKey" を外す
 FAIL  … > パネルを開いたまま別のノードの件数のボタンを押すと、そのノードの一覧に切り替わる（閉じない）。…
AssertionError: expected [] to have a length of 1 but got +0
=== MUT(SubagentPanel.vue): ノードが載っているか（onGraph）の判定を外す
 FAIL  … > 対象のノードがグラフから外れたら（pane とエージェントが残っていても）閉じる
AssertionError: expected true to be false // Object.is equality
```
