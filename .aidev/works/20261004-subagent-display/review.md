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

- [should][conv:-] SubagentListDialog.test.ts 古いサーバのテストの題名と中身が食い違い、何も確かめていなかった / 対応: 修正済（題名を実際の挙動に。0 件の文言と `open` を assert。T12・ラウンド1）
- [should][conv:-] T12 の差分にグラフの古いサーバの確認が無く、サイドバーの「変わらない」も弱い / 対応: 修正済（グラフのノードの DOM がボタンの有無だけの差であること・サイドバーの行の DOM がボタンを除けば同じことを比べる。T12・ラウンド1）
- [nit][conv:-] SubagentListDialog.test.ts 要約の更新のテストの待ちが 1 回で、`open` を見ていない / 対応: 修正済（T12・ラウンド1）

- [must][conv:-] SubagentList.ts:92 制御文字の正規表現が eslint の no-control-regex でエラー / 対応: 修正済（正規表現をやめ `plainText` の文字ごとの判定に。T13・ラウンド1）
- [must][conv:-] SubagentList.ts・sidebar.ts・TuiApp.subagents.test.ts が prettier を通らない（sidebar.ts は HEAD で整形済み） / 対応: 修正済（HEAD で整形済みだったファイルと新規ファイルだけに prettier を当てた。T13・ラウンド1）
- [should][conv:-] mouse.ts:290 ⤷n の桁を右クリックすると全体のメニューが開く / 対応: 修正済（pane のメニュー。テスト付き。T13・ラウンド1）
- [should][conv:-] SubagentList.ts:91 説明の制御文字の除去が C0・DEL だけで、C1・行区切り・双方向制御・種類が素通り / 対応: 修正済（`plainText`。種類にも適用。テスト付き。T13・ラウンド1）
- [should][conv:-] SubagentList.ts:96 ↑↓ の印が経過時間・「ほか n 件」の最後の文字を上書きする / 対応: 修正済（右端の 1 桁を空ける。テスト付き。T13・ラウンド1）
- [should][conv:-] TuiApp.subagents.test.ts キーボードだけの道筋（設定で割り当てたキー）の試験が無く、空の確認があった / 対応: 修正済（`prefs.keys` で割り当てて `prefix+u` で開く試験を足し、空の確認を消した。T13・ラウンド1）
- [nit][conv:-] 全角・2 桁の件数・狭い幅の確認が足りない / 対応: 修正済（試験を足した。T13・ラウンド1）
- [nit][conv:-] decisions D11 の文言と実装の食い違い / 対応: 修正済（D11 を実装に合わせ、条件の理由をコメントに。T13・ラウンド1）

- [should][conv:regression-negative-control] composeServer.subagents.integration.test.ts:274 ログの確認が、ログが非同期に書かれるのを待たず、読めなくても通る / 対応: 修正済（256 件の上限の警告がログに出るまで待ち、ログの経路が使われた上で確かめる。変異で落ちることを確認。T15・ラウンド1）
- [should][conv:-] 同:375 20 件が 1 回の配信にまとまる、が時間に依存する（[1, 21] の完全一致） / 対応: 修正済（「20 回ではなく数回」に緩めた。T15・ラウンド1）
- [nit][conv:-] 同: 「起きないこと」を固定の sleep で確かめている / 対応: 修正済（後続の有効な報告を合図にして、前の報告が処理済みであることを確かめる形に。検出前の sleep は不要なので外した。T15・ラウンド1）
- [nit][conv:-] 同: 先頭の AC・重複した codex の試験・`Client` 型の `hello` / 対応: 修正済（AC に AC5・AC17 を足し、スクリプト経由の codex の試験を外した。T15・ラウンド1）

- [should][conv:e2e-observe-browser!] subagents.spec.ts:106 「pane へ移らない」の題が、`pane.focus` のフレームしか見ていない / 対応: 修正済（ブラウザの描画〔`[data-pane-id][aria-current]`〕で、p2 が現在の pane のままであることも見る。T16・ラウンド1）
- [should][conv:e2e-observe-browser] subagents.spec.ts:196 端末への入力の漏れの確認に陽性の対照が無く、文字だけを見ていた / 対応: 修正済（一覧を開く前に端末へ打った文字・矢印のエコーが出力に出ることを先に確かめ、漏れの検査を文字と矢印〔`^[[B`〕の両方に。T16・ラウンド1）
- [should][conv:-] subagents.spec.ts:198 ホイールのスクロールが ArrowDown だけでも通る / 対応: 修正済（先頭へ戻してから、ホイールだけで増えることを別に確かめる。T16・ラウンド1）
- [nit][conv:e2e-observe-browser] subagents.spec.ts:119 `sent.length = 0` が遅れて届くフレームを巻き込む・不要な `.map` / 対応: 修正済（T16・ラウンド1）
- [nit][conv:-] subagents.spec.ts:251 HTML の注入の確認が `onerror` の非同期の動きを待たない / 対応: 修正済（500 ミリ秒置く。T16・ラウンド1）
- [nit][conv:-] subagents.spec.ts:55 受け口のパスが posix 前提であることが無記載 / 対応: 修正済（コメント。T16・ラウンド1）

- [must][conv:regression-negative-control] subagents.spec.ts:430 グラフのパネルの上のキーの漏れの試験が、`0` で元へ戻す形で、漏れても通る（ホイールの対照も無い） / 対応: 修正済（キーを 1 つずつ押してそのつど transform が変わらないことを見る。`+`・`-`・キャンバスの上のホイールが transform を変えることを先に確かめる陽性の対照。T21・ラウンド1）
- [should][conv:e2e-observe-browser] 同:421 transform の文字列の完全一致が浮動小数点の誤差で落ちうる / 対応: 修正済（「戻す」比較をやめ、対照の後の値を基準にする。T21・ラウンド1）
- [should][conv:e2e-observe-browser!] 同:320 ボタン上のドラッグで graph.update が送られないことの陽性の対照が無い / 対応: 修正済（ノード本体のドラッグで graph.update が送られ、ノードが動くことを先に確かめる。T21・ラウンド1）
- [should][conv:-] 同:365 「パネルの外の Esc」が一覧にフォーカスがあるときと区別できない / 対応: 修正済（一覧のフォーカスを待ってからノードへフォーカスを移し、移ったことを確かめる。T21・ラウンド1）
- [nit][conv:-] 同:383 確かめずに Esc を 2 回押している・誤字 / 対応: 修正済（1 回ごとに確かめる。居なくなって閉じたときのノードへのフォーカスも確かめる。T21・ラウンド1）
- [nit][conv:-] 同:12 先頭の説明が T21 を反映していない / 対応: 修正済（T21・ラウンド1）

- [should][conv:-] docs/tui.md・tui-parity.md 端末版の「pane のメニューをキーで開く」道筋の記述が実装と合わない（pane のメニューを開くのは右クリックだけ） / 対応: 修正済（文書を「キーボードだけなら割り当てた `show_subagents`」に直し、decisions D11 に食い違いを記録。T17・ラウンド1）
- [nit][conv:-] docs/verification.md E2E コマンドの書式が周囲と違う / 対応: 修正済（`pnpm --filter @sodashitsu/e2e exec …`。T17・ラウンド1）

### 全タスクをまたぐ点検（cross。1 ラウンド・2 件）

- [should][conv:-] SubagentTracker.ts:94 閉じた pane・無い pane への遅れた報告（非同期の SessionEnd・SubagentStop）で、tracker が状態を作って捨てず、マップが増え、入れ替わり直後の古い SessionEnd が「0 件」を付ける / 対応: 修正済（`paneExists` を依存に足し、pane が無ければ捨てる。検出前でも pane があれば持つ。テストと壊して落ちる確認つき。cross・ラウンド1。decisions D12）
- [nit][conv:-] GraphNode.vue:52 切れたマシンの最後の要約の件数がグラフに出続け、状態の印と食い違う / 対応: 修正済（`exists === true`〔繋がっている〕のときだけ出す。テストと壊して落ちる確認つき。cross・ラウンド1）

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

#### T12 別のマシンの引き方（`Sidebar.test.ts`・`SubagentListDialog.test.ts`・`store/subagents.test.ts`。製品コードの変更なし。壊した後に元へ戻した）

```
=== MUT(Sidebar.vue): 一覧の対象の machineId を選んでいるマシンから "local" に固定
 FAIL  src/components/Sidebar.test.ts > … > 別のマシンを選んでいるときは、そのマシンの対象として開く（machineId は選んでいるマシンの ID）
AssertionError: expected { kind: 'subagents', …(3) } to deeply equal { kind: 'subagents', …(3) }
=== MUT(store/subagents.ts): 選んでいるマシンの判定を true に（要約を見ない）
 FAIL  src/components/SubagentListDialog.test.ts > … > 2 つのマシン（pane の ID が衝突） > 選んでいるマシン（M2）の対象は session の p1（2 件）、選んでいない手元の対象は要約の p1（5 件）
AssertionError: expected 'サブエージェント — M2 の p1' to be 'サブエージェント — ローカルの p1' // Object.is equality
=== MUT(store/subagents.ts): 要約の引き先を target.machineId から "local" に固定
 FAIL  src/store/subagents.test.ts > … > 選んでいないマシンの pane は、そのマシンの要約から引く
AssertionError: expected undefined to deeply equal { instanceId: 'a1', …(8) }
 FAIL  … > pane の ID が衝突する 2 つのマシンで取り違えない（選んでいるのは local。m2 の p1 は m2 のもの）
```

（T12・ラウンド1 の修正の分）
```
=== MUT(Sidebar.vue): v-if="i === 0 && subagentCount(agent) > 0" -> v-if="i === 0"
 FAIL  src/components/Sidebar.test.ts > … > 1 件以上のときだけ出る（分からない・0 件では出さない）
 FAIL  … > 古いサーバ（subagents の項目が無い）のエージェントの行は、ボタンが無いだけで、ほかは変わらない
=== MUT(GraphNode.vue): <template v-if="subagentCount > 0"> -> v-if="true"
 FAIL  src/components/graph/GraphView.subagents.test.ts > … > 別のマシンのノードのエージェントが古いサーバのもの（subagents の項目が無い）なら、ボタンを出さず、ノードの DOM はボタンの有無だけが違う
AssertionError: expected true to be false // Object.is equality
=== MUT(SubagentListDialog.vue): SubagentList を subagents がある間だけ描く
 FAIL  src/components/SubagentListDialog.test.ts > … > 新しい画面 × 古いサーバ（subagents の項目が無いエージェント）: 一覧は開いて、0 件の文言を出す（エラーにしない）。…
```

#### T13 端末版（`render/chrome/sidebar.ts`・`input/mouse.ts`・`modes/SubagentList.ts`・`modes/ContextMenu.ts`・`actions/TuiDispatcher.ts`・`app/TuiApp.ts`。壊した後に元へ戻した）

```
=== MUT(sidebar.ts): 件数の印を 0 件・項目なしでも出す（(count ?? 0) > 0 を true に）
 FAIL  src/app/TuiApp.subagents.test.ts > … > 1 件以上のとき、エージェントの行の 1 行目の末尾に ⤷n が出る。0 件・項目なしでは出ない
AssertionError: expected { y: 5, section: 'agents', …(4) } to be undefined
=== MUT(mouse.ts): 印の桁範囲の当たり（h.kind === "subagents"）を外す
 FAIL  … > ⤷n の桁範囲のクリックで一覧が開く（pane へは移らない）。行のほかの場所のクリックは今までどおり pane へ
AssertionError: expected null to match object { kind: 'subagents', paneId: 'p3' }
=== MUT(mouse.ts): 印のクリックで一覧を開く行（showSubagentsOf）を外す
 FAIL  … > ⤷n の桁範囲のクリックで…
AssertionError: expected null to match object { kind: 'subagents', paneId: 'p3' }
=== MUT(TuiDispatcher.ts): 件数の確認（< 1）を外す
 FAIL  … > 開いている間に、エージェントが居なくなる・入れ替わる・pane が閉じると閉じる。…
AssertionError: expected { kind: 'subagents', …(2) } to be null
=== MUT(ContextMenu.ts): メニューの項目を常に出す
 FAIL  … > pane のメニューに「サブエージェントの一覧」が出る（1 件以上のときだけ）。選ぶと一覧が開く
AssertionError: expected [ '名前の変更', '右へ分割', '下へ分割', …(5) ] to not include 'サブエージェントの一覧'
=== MUT(TuiApp.ts): 入れ替わりの判定（instanceId）を外す
 FAIL  … > 開いている間に、エージェントが居なくなる・入れ替わる・pane が閉じると閉じる。…
AssertionError: expected { kind: 'subagents', …(2) } to be null
=== MUT(TuiApp.ts): onModelChange の closeSubagentsIfGone を外す
 FAIL  … > 開いている間に、…閉じる。…
AssertionError: expected { kind: 'subagents', …(2) } to be null
=== MUT(SubagentList.ts): 制御文字を空白にする置き換えを外す
 FAIL  … > 説明の中の制御文字は空白にして出す（画面を壊さない）
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' to contain '行1 [2J 行2'
=== MUT(SubagentList.ts): End キーを外す
 FAIL  … > 上下で読み（ホイールも）、Esc で閉じる。…
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' to contain 'ほか 6 件'
=== MUT(SubagentList.ts): ホイールの読みを外す
 FAIL  … > 上下で読み（ホイールも）、Esc で閉じる。…
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' to contain 'ほか 6 件'
```

（T13・ラウンド1 の修正の分）
```
=== MUT(SubagentList.ts): plainText の C1 の範囲を 0x7f だけに
 FAIL  src/app/TuiApp.subagents.test.ts > … > plainText: C0・DEL・C1（0x9b）・行区切り・双方向の制御を空白にし、…
AssertionError: expected 'a [2Jb c d\u009b31me f g h i j' to be 'a [2Jb c d 31me f g h i j' // Object.is equality
=== MUT(SubagentList.ts): 双方向の制御（U+202A-202E）の除去を外す
 FAIL  … > plainText: …
AssertionError: expected 'a [2Jb c d 31me f g\u202eh i j' to be 'a [2Jb c d 31me f g h i j' // Object.is equality
=== MUT(mouse.ts): 右クリックで subagents も pane のメニューにする条件を外す
 FAIL  … > ⤷n の桁を右クリックすると、その pane のメニュー（サブエージェントの一覧つき）が開く
AssertionError: expected { kind: 'global' } to deeply equal { kind: 'pane', paneId: 'p3' }
=== MUT(SubagentList.ts): 中身の幅の右端 1 桁の空け（cw = inner.w - 1）を inner.w に
 FAIL  … > 一覧が長いとき、↑↓ の印は右端の桁に出て、経過時間の最後の文字を上書きしない
AssertionError: expected ' ◐ w2     │ T3                       …' to match /1分\s*[↑↓]?\s*│/
```

#### T8 設定画面（ブラウザ版 `SettingsDialog.vue`・端末版 `settings/sections.ts`。壊した後に元へ戻した）

```
=== MUT(web SettingsDialog.vue): 「（更新が必要）」の表示を外す
 FAIL  src/components/SettingsDialog.test.ts > … > needsUpdate なら「更新が必要」と［更新］を出し、押すと installAgentIntegration(kind) を呼ぶ（解除とは別のボタン）
AssertionError: expected 'Claude Code導入済み  更新 解除' to contain '更新が必要'
=== MUT(web): ［更新］を常に出す（v-if="true"）
 FAIL  … > 導入済みなら「解除」ボタンで uninstallAgentIntegration(kind) を呼ぶ（AC-I2）
AssertionError: expected '更新' to be '解除' // Object.is equality
=== MUT(web): ［更新］の動きを install から uninstall に
 FAIL  … > needsUpdate なら「更新が必要」と［更新］を出し、押すと installAgentIntegration(kind) を呼ぶ（解除とは別のボタン）
AssertionError: expected "vi.fn()" to be called with arguments: [ 'claude' ]
=== MUT(web): 説明の「Claude Code はフックが 6 つ」を 1 つに
 FAIL  … > 説明にフックの数（Claude Code は 6 つ）・サブエージェントの表示に使うこと・更新と解除は起動し直した後から効くことを書く
AssertionError: expected '各エージェントの公式フックを使い、…' to contain 'Claude Code はフックが 6 つ'
=== MUT(tui sections.ts): needsUpdate を常に false に
 FAIL  src/modes/SettingsDialog.test.ts > 設定画面 > エージェント連携：needsUpdate なら「更新が必要」と更新の項目を出し、押すと install の RPC（解除ではない）。足りていれば出さない
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' to contain '導入済み（更新が必要）'
=== MUT(tui sections.ts): 更新の項目の動きを install から uninstall に
 FAIL  … > 更新の項目…
AssertionError: expected [] to deeply equal [ { kind: 'claude' } ]
=== MUT(tui sections.ts): Claude Code の説明の「6 つ」を外す
 FAIL  … > エージェント連携：Claude Code は 6 つのフックを入れる説明（サブエージェントの表示に使う）。ほかは 1 つ
AssertionError: expected ' Spaces       開いた順 + … to contain 'フックを 6 つ入れます'
```

#### T15 統合テスト（`packages/server/src/composeServer.subagents.integration.test.ts`。実物のスクリプト → 実 socket → SubagentTracker → SessionService → 2 つの接続。壊した後に元へ戻した）

```
=== MUT(composeServer.ts): 受け口の type つきの報告を SubagentTracker へ渡す行（subagents.report(report)）を外す
 FAIL  src/composeServer.subagents.integration.test.ts > … > 起動 → 終了: 両方の接続に pane.agent_status_changed で件数が届き、…
AssertionError: expected undefined to be 1 // Object.is equality
 FAIL  … > 作業の終わりの突き合わせ: …
=== MUT(composeServer.ts): kind === "claude" の絞り込みを true に
 FAIL  … > 種類つきの電文は claude だけを数える（受け口へ直接 codex の名乗りで送っても無視される）
AssertionError: expected { count: 1, items: [ { …(2) } ] } to be undefined
=== MUT(SubagentTracker.ts): 最初の検出（無し → X）の配り直しを外す
 FAIL  … > 検出より前に届いた報告は捨てず、最初の検出で配られる（AC15）。…
AssertionError: expected undefined to deeply equal [ 'early' ]
=== MUT(SubagentTracker.ts): 入れ替わりで状態を捨てる（this.discard(paneId)）を外す
 FAIL  … > 検出より前に届いた報告は捨てず、…（AC7）
AssertionError: expected [ 'early', 'fresh' ] to deeply equal [ 'fresh' ]
=== MUT(SubagentTracker.ts): まとめ待ち 100 ミリ秒を 0 に
 FAIL  … > 同じ内容の報告ではイベントが増えない。20 件を続けても、まとめて 1 回で配る（100 ミリ秒のまとめ）
AssertionError: expected [ 1, 6, 8, 12, 15, 18, 21 ] to deeply equal [ 1, 21 ]
=== MUT(agent-hook-report.cjs): Agent・Task 以外の PreToolUse を送らない条件を外す
 FAIL  … > Agent 以外の PreToolUse は何も送らない（検出済みでも件数は出ない）
AssertionError: expected { count: +0, items: [] } to be undefined
```

（落ちなかった変異: `SessionService.updatePaneRuntime` の同じ検出の間の引き継ぎ。偽の `claude` は状態が変わらず、判定の周期が新しい `AgentInfo` を渡す場面が実 PTY では起きないため、統合では観測できない。T6 の単体テスト〔周期の更新・状態の変化で保つ〕が固定している。統合には「周期の判定が走っても件数が消えない」試験を置いてある。）

（T15・ラウンド1 の修正の分）
```
=== MUT(SubagentTracker.ts): 「数えない」の警告に種類を含める
 FAIL  … > サーバのログに説明の中身が出ない（ログの経路が実際に使われた上で確かめる）（AC12）
AssertionError: expected '{"ts":"2026-10-04T05:58:28.353Z","lev…' not to contain '秘密の種類'
=== MUT(SubagentTracker.ts): まとめ待ち 100 ミリ秒を 0 に
 FAIL  … > 同じ内容の報告ではイベントが増えない。20 件を続けても、まとめて数回に配る（100 ミリ秒のまとめ）
AssertionError: expected 4 to be less than or equal to 3
=== MUT(composeServer.ts): kind === "claude" の絞り込みを true に
 FAIL  … > 種類つきの電文は claude だけを数える（…）
AssertionError: expected [ 'x', 'marker' ] to deeply equal [ 'marker' ]
=== MUT(agent-hook-report.cjs): Agent・Task 以外の PreToolUse を送らない条件を外す
 FAIL  … > Agent 以外の PreToolUse は何も送らない（検出済みでも件数は出ない）
AssertionError: expected [ { id: 'marker', …(3) } ] to deeply equal [ { id: 'marker', …(2) } ]
```

#### T16 E2E（`packages/e2e/src/specs/subagents.spec.ts`。実物の Claude Code は使わない。壊した後に元へ戻して `pnpm build` し直した。2 回続けて同じ結果: `--repeat-each=2` で 12 件とも通過）

```
=== E2E MUT(Sidebar.vue): 件数のボタンの @click.stop を @click に（行へ伝わる）
  ✘  2 src/specs/subagents.spec.ts:102:1 › ボタンを押しても pane へ移らない（行へ伝えない。ブラウザが pane.focus を送らない）。一覧が開く（AC-I1・AC-I2） (3.6s)
  1 failed
  5 passed (21.3s)
=== E2E MUT(Sidebar.vue): 件数のボタンの出す条件を「項目があれば 0 件でも」に
  ✘  1 src/specs/subagents.spec.ts:77:1 › 件数のボタン: 起動で出て、増減し、0 件で消える。作業の終わりの突き合わせで直る（AC1・AC2） (7.6s)
  ✘  3 src/specs/subagents.spec.ts:141:1 › 一覧: 種類・説明・経過時間・バックグラウンドの印。0 件の文言（開いたまま）。64 件を超えたら「ほか n 件」（AC4・AC17） (7.6s)
    Error: expect(locator).toHaveCount(expected) failed
  2 failed
  4 passed (28.1s)
=== E2E MUT(SubagentList.vue): 説明を {{ }} から v-html に
  ✘  6 src/specs/subagents.spec.ts:235:1 › 短い説明に HTML を書いても動かない（文字として出る）（AC12） (7.1s)
    Error: expect(locator).toHaveText(expected) failed
  1 failed
  5 passed (22.7s)
=== E2E MUT(SubagentListDialog.vue): 閉じたときにフォーカスを戻す行（el?.focus()）を外す（ボタンが無く、行へ戻す場面）
  ✘  3 src/specs/subagents.spec.ts:141:1 › 一覧: 種類・説明・経過時間・バックグラウンドの印。0 件の文言（開いたまま）。64 件を超えたら「ほか n 件」（AC4・AC17） (7.5s)
    Error: expect(locator).toBeFocused() failed
    Expected: focused
    Received: inactive
  1 failed
  5 passed (23.1s)
=== E2E MUT(SubagentListDialog.vue): 対象が居なくなったら閉じる watch を外す
  ✘  5 src/specs/subagents.spec.ts:215:1 › 開いている間に対象のエージェントが居なくなったら、一覧は閉じる（AC-I4） (7.4s)
    Error: expect(locator).toBeFocused() failed → toBeHidden() failed
  1 failed
  5 passed (23.2s)
```

（落ちなかった変異: ボタンから開いて同じボタンへ戻る場面でのフォーカスを戻す行。ブラウザの `<dialog>` が、閉じたときに開く前にフォーカスのあった要素へ戻すので、同じ結果になる。ボタンが無い場面〔行へ戻る〕で固定した。）

（T16・ラウンド1 の修正の分。`pnpm build` し直して確認。2 回続けて同じ結果: `--repeat-each=2` で 12 件とも通過）
```
=== E2E MUT(Sidebar.vue): 件数のボタンの @click.stop を @click に
  ✘  2 src/specs/subagents.spec.ts:102:1 › ボタンを押しても pane へ移らない（焦点は p2 のまま。ブラウザが pane.focus を送らない）。一覧が開く（AC-I1・AC-I2） (3.7s)
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 3
  1 failed
  5 passed (19.4s)
```

#### T21 E2E（グラフと漏れ。`packages/e2e/src/specs/subagents.spec.ts` の後半。壊した後に元へ戻して `pnpm build` し直した。2 回続けて同じ結果: `--repeat-each=2` で全 18 件通過）

```
=== E2E MUT(SubagentPanel.vue): キーの ev.stopPropagation() を外す
  ✘  3 src/specs/subagents.spec.ts:404:1 › グラフのパネルの上のキー・ホイールは、グラフ（ズーム・パン・ノードの移動）へ届かない（AC-I5） (2.6s)
  1 failed
  2 passed (9.3s)
=== E2E MUT(GraphNode.vue): 件数のボタンの @pointerdown.stop を外す
  ✘  1 src/specs/subagents.spec.ts:311:1 › グラフのノード: 件数のボタンが出て、押すと横のパネルが開く。ノードを動かさず・pane へ移らない（AC3・AC-I1・AC-I2） (2.8s)
  1 failed
  2 passed (9.5s)
=== E2E MUT(GraphView.vue): 閉じたときのノードへのフォーカス（focusNode(key)）を外す
  ✘  2 src/specs/subagents.spec.ts:363:1 › グラフのパネル: キー s で開く・Esc は 1 段ずつ（まずパネル）・閉じるとノードへフォーカスが戻る。居なくなったら閉じる（AC-I1・AC-I3・AC-I4） (7.6s)
    Error: expect(locator).toBeFocused() failed
  1 failed
  2 passed (15.8s)
=== E2E MUT(GraphView.vue): escape() の段の subagentsKey の項を外す（パネルを開いたままフォーカスがノードにある Esc の試験を足した後）
  ✘  2 src/specs/subagents.spec.ts:363:1 › グラフのパネル: …（AC-I1・AC-I3・AC-I4） (7.4s)
    Error: expect(locator).toBeHidden() failed
  1 failed
  2 passed (15.8s)
```

（落ちなかった変異: パネルの `@wheel.stop`。ホイールのパンを受けるのは `.graph-canvas` で、パネルはその外側（`.graph-side`）にあるので、ホイールは元からパンへ届かない。二重の守りとして残す。）

（T21・ラウンド1 の修正の分。`pnpm build` し直して確認。2 回続けて同じ結果: `--repeat-each=2` で全 18 件通過）
```
=== E2E MUT(SubagentPanel.vue): キーの ev.stopPropagation() を外す
  ✘  3 src/specs/subagents.spec.ts:420:1 › グラフのパネルの上のキー・ホイールは、グラフ（ズーム・パン・ノードの移動）へ届かない（AC-I5） (2.8s)
    Error: キー +
  1 failed
=== E2E MUT(GraphNode.vue): 件数のボタンの @pointerdown.stop を外す
  ✘  1 src/specs/subagents.spec.ts:311:1 › グラフのノード: 件数のボタンが出て、…（AC3・AC-I1・AC-I2） (3.4s)
    Error: expect(received).toBe(expected) // Object.is equality
  1 failed
=== E2E MUT(GraphView.vue): escape() の段の subagentsKey の項を外す
  ✘  2 src/specs/subagents.spec.ts:368:1 › グラフのパネル: キー s で開く・Esc は 1 段ずつ（…） (7.9s)
    Error: expect(locator).toBeHidden() failed
  1 failed
```

（cross・ラウンド1 の修正の分）
```
=== MUT(GraphNode.vue): 件数を exists === true のときだけ出す条件を外す
 FAIL  src/components/graph/GraphView.subagents.test.ts > … > 切れているマシンのノードには、最後の要約の件数を出さない（状態の印と同じ。繋がり直せば出る）
AssertionError: expected true to be false // Object.is equality
=== MUT(SubagentTracker.ts): pane が無ければ捨てる行（!this.deps.paneExists(r.paneId)）を外す
 FAIL  src/agent/SubagentTracker.test.ts > … > 閉じた pane への遅れた報告 > pane が無ければ、状態を作らずに捨てる（…）
AssertionError: expected { count: +0, items: [] } to be undefined
```


## 独立レビューの指摘（review-findings-01.md）への対応

直した: 1〜6・8・9・13。直さない（記録だけ）: 7（端末版のキーボードの道筋は `show_subagents` へのキー割り当てだけ。既定のキーを付けるかは利用者の判断待ち）、10（`SessionStart` だけ手で消した状態）、11（「起きないこと」の固定の待ち。陽性の対照あり）、12（E2E のイベント待ち。判定はブラウザ）。

#### 1. 一覧を閉じたときのフォーカス（`SubagentListDialog.vue`。単体＋E2E）
```
=== MUT: ボタンも行も無いとき（と show_subagents）に端末へ戻す行（registry?.focus(view.focusedPaneId)）を外す
 FAIL  src/components/SubagentListDialog.test.ts > … > ボタンから開いたが、ボタンも行も無い（エージェントが居なくなった・pane が閉じた）: 今フォーカスのある pane の端末へ明示的に戻す（AC-I4）
AssertionError: expected "vi.fn()" to be called with arguments: [ 'p1' ]
 FAIL  … > show_subagents から開いた（opener なし）: ボタンがあっても移さず、端末へ戻す
 FAIL  … > 対象のエージェントが居なくなって自分で閉じ、行も無いときは、端末へ戻す
=== E2E MUT（web を作り直して）: 同じ行を外す
  ✘  5 src/specs/subagents.spec.ts:243:1 › 開いている間に対象のエージェントが居なくなったら、一覧は閉じる（AC-I4）。件数が変われば一覧も変わる (7.5s)
    Error: expect(locator).toBeFocused() failed
    Expected: focused
    Received: inactive
```

#### 2. 切れたマシンのノードのキー `s`（`GraphView.vue`・`SubagentPanel.vue`）
```
=== MUT(GraphView.vue): subagentCountOf の exists === true の条件を外す
 FAIL  src/components/graph/GraphView.subagents.test.ts > … > 切れているマシンのノードには、最後の要約の件数を出さない（状態の印と同じ。繋がり直せば出る）
AssertionError: expected true to be false // Object.is equality   （キー s で一瞬でもパネルが作られたかを DOM の変化の記録で見る）
=== MUT(SubagentPanel.vue): パネルが繋がっているマシンのときだけ件数を持つ条件（exists === true）を外す
 FAIL  … > 切れているマシンのノードには、…（開いている間にマシンが切れたら、パネルは閉じる）
AssertionError: expected true to be false // Object.is equality
```

#### 3. 端末版の経過時間（`TuiApp.ts`。日時を出さない設定で、偽の時計）
```
=== MUT: 一覧を開いている間の 10 秒ごとの描き直し（if (this.ui.dialogContext?.kind === "subagents")）を if (false) に
 FAIL  src/app/TuiApp.subagents.test.ts > … > 一覧を開いている間は、経過時間が進む（10 秒ごとに描き直す）。閉じたら描き直さない
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' to match /T\s+17秒/
=== MUT: 同じ条件を if (true) に（閉じた後も描き直す）
 FAIL  … 同じ試験
AssertionError: expected 21089 to be 21047 // Object.is equality
```

#### 4・5. `SubagentTracker`（引き継ぎの条件・セッションの捨て方。`decisions.md` D13）
```
=== MUT: 引き継ぎの kind === "claude" を true に
 FAIL  … > 検出の無い間に届いた報告の引き継ぎ > 検出されたのが claude でなければ（codex 等）引き継がない
AssertionError: expected [ { paneId: 'p1', value: { …(2) } } ] to deeply equal []
=== MUT: 最後の報告からの時間（ORPHAN_MAX_AGE_MS）の条件を外す
 FAIL  … > 最後の報告から 30 秒を超えていたら引き継がない（新しい検出は分からない）
=== MUT: 動いているサブエージェントがあるかの条件を true に
 FAIL  … > 動いているサブエージェントが無い（終了・作業の終わりの報告だけ）なら引き継がず、「0 件」を新しい検出に付けない
=== MUT: セッションの上限で、動いているものを持たないセッションを先に捨てる分岐（s.items.size === 0）を外す
 FAIL  … > 上限を超えたら、動いているサブエージェントを持たないセッション（終了の記憶だけ）を先に捨てる。動いているものを持つセッションは残す
AssertionError: expected [] to deeply equal [ 'keep' ]
```

#### 6. フックのスクリプト: 報告に失敗する状況（`agent-hook-report.test.ts`。socket が無い・サーバが止まっている・pane の外 × 6 つのイベント〔Stop を含む〕・stdin が壊れている）
```
=== MUT: 接続の失敗で標準エラーに書く
 FAIL  assets/agent-hook-report.test.ts > … > 報告に失敗する状況で、黙って正常に終わる（AC12） > socket が無い（パスのファイルが無い）
AssertionError: SessionStart: expected { code: +0, stdout: '', …(1) } to deeply equal { code: +0, stdout: '', stderr: '' }
 FAIL  … > サーバが止まっている（socket のファイルだけが残り、待ち受けていない）
=== MUT: pane の外（環境変数なし）で標準出力に書く
 FAIL  … > pane の外（環境変数が無い）
=== MUT: 解釈できない入力で終了コードを 1 に
 FAIL  … > stdin が JSON でない・空でも、黙って正常に終わる
AssertionError: "": expected { code: 1, stdout: '', stderr: '' } to deeply equal { code: +0, stdout: '', stderr: '' }
```

#### 8・9・13
- 8: `ContextMenu.ts` のコメントを事実に合わせた（メニューはマウス用。キーボードの道筋は `show_subagents`）。
- 9: `uninstall()` は、自分のエントリを除いて空になった経路をキーごと消す（元から空・利用者のエントリが残る経路は触らない）。
```
=== MUT: 空になった経路をキーごと消す分岐を外す
 FAIL  src/agent/AgentIntegrationInstaller.test.ts > … > uninstall removes only our entries from every path, … 
AssertionError: PreToolUse: expected { SessionStart: [ { …(2) } ], …(5) } to not have property "PreToolUse"
 FAIL  … > uninstall: 元から空だった経路（自分のエントリが無かった経路）と、利用者のエントリが残る経路は触らない
=== MUT: 空かどうかを見ずに常にキーごと消す
 FAIL  … > uninstall removes only our entries …
AssertionError: expected undefined to deeply equal [ { matcher: 'compact', …(1) } ]
```
- 13: 定数の後の空行を 1 つに。
