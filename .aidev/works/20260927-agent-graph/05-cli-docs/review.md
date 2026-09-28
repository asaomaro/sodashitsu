# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/cli/src/commands/graph.ts:370,423 表の文字列を JSON.stringify で囲うだけで C1・双方向の上書きの文字（U+202A-202E・U+2066-2069）が端末へ出る（history の {output} 経由で表示の偽装） / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] packages/cli/src/cliArgs.ts:774 -- で始まる文面を --prompt に渡せない（--prompt=… も無い） / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] packages/cli/src/commands/graph.ts:86 エージェント名 p9 の解決が agentTarget の resolveAgentTarget と違い、agent 系と graph で別の pane を指す / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] packages/cli/src/commands/graph.ts:135 一覧に無い 32 桁の id を add（mustExist）でも通し、打ち間違いで動かない線が成功で作られる / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [should][conv:-] packages/cli/src/graph.integration.test.ts:128-138,311 組み立て直して送り直すことを見分ける試験が無い（最初の操作をそのまま送り直す退行が通る） / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] packages/cli/skills/sodactl/SKILL.md:131 別のマシンの配下の delegate の文面（--machine 付き）が書かれていない / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] packages/cli/skills/sodactl/SKILL.md:141-142 例の graph link pause・graph pause に --json が無い / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] packages/cli/skills/sodactl/SKILL.md:151 stale の説明が「再起動で振り直された」で、session.json が読めなかった起動だけであることと食い違う / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [should][conv:-] docs/agent-graph.md:139 別のマシンの再起動で同じ番号が別の pane を指しても誤って動かない、は先の側では誤り（先は idle かしか見ず、新しい pane へ送りうる） / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [should][conv:-] docs/agent-graph.md:77 2 秒以内・20ms 以下は承認待ちから動く線（1 秒の継続＋1 秒の見回り）に当てはまらない / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] docs/agent-graph.md:11 Esc の戻る順に選び直しが抜けている / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] docs/agent-graph.md:33 承認の代理のチップは「承認・通知」「承認・返答」 / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] docs/agent-graph.md:35-36 直前の結果の印に待ち（…）が抜けている / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] docs/agent-graph.md:76 作業中とみなすのは送り終えて 5 秒で切れる / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] docs/sodactl.md:398 -- で始まる文面のエラーは missing value for --prompt / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] docs/verification.md:1016 soda session stop は名前が要る / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] docs/verification.md:999 描画の上限は 10 秒・toSentMs は判定していない / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [should][conv:-] packages/server/src/graph/perf.integration.test.ts:105 32 本すべて on:done で、承認待ちから動くトリガ・承認の代理の経路（1 秒の継続＋1 秒の見回り）を測っていない / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）
- [nit][conv:-] packages/server/src/graph/perf.integration.test.ts:12 AgentMonitor が上書きしない理由の注記が試験の状況（前面は cat）と合わない / 対応: 修正済（21514ac・7bb70b0・df93704・42b2ae9・9460012・953ca19。ラウンド1。docs:139 は検出の手段が無いため docs の書き分けと backlog〔D8-10〕）

## ラウンド 1（2026-09-29）
- [should][conv:-] docs/agent-graph.md:144・docs/machines.md:87-88 別のマシンの番号の振り直しで「元の側は誤って動かない」は誤り（基準は最初の 1 回だけで、2 回目からは無関係の pane の完了・承認待ちで動く） / 対応: 修正済（4b5c2fd・d26969c・2351614。負の確認は test-result）
- [should][conv:-] packages/client-core/src/graph/message.ts:75,91・packages/server/src/graph/GraphEngine.ts:691 監督の知らせ・承認の代理の文面の pane の呼び名（OSC のタイトル）に双方向の上書きの文字が残る / 対応: 修正済（4b5c2fd・d26969c・2351614。負の確認は test-result）
- [nit][conv:-] packages/server/src/graph/GraphEngine.test.ts:446-466 期限のタイマーの張り直しの試験が線 1 本だけ（一番早い期限が先に解ける場合を捕まえない） / 対応: 修正済（4b5c2fd・d26969c・2351614。負の確認は test-result）
