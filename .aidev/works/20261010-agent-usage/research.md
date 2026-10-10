# エージェントの利用状況（トークン・コスト・制限）を取る方法の調査

調査日 2026-10-10。調べるだけ（コード・利用者の設定・状態は変えていない。`~/.claude`・`~/.codex`・Windows 側の `.copilot` は読むだけ。実物の `claude`・`codex`・`copilot` は対話で動かしていない。7780 番のサーバには触っていない）。
記号: **【確認】** = 自分の目で、ファイル・出力・公開の文書で確かめた事実（出どころを併記）。**【推測】** = 確かめていない。**【未確認】** = 確かめようとして、確かめられなかった。
読んだコード: origin/main `d383caa`（#126〜#130 を含む）。

---

## 要点（先に）

1. **Claude Code**
   - **制限（5 時間・週）と、いま動いているセッションのコスト・コンテキスト**は、ステータスラインの入力にしか無い【確認】。記録には出ない。したがって包みは要る。包みなしで出せるのは、**記録からのトークン数（下限）**と、**記録に残る `cost-state` の行**（実機で発見した。未文書。**セッションの区切りにだけ書かれる**）まで。
   - ステータスラインの入力の `context_window.total_input_tokens` / `total_output_tokens` は、**「いま文脈にある」トークンで、累計ではない**（公式の文書）。利用者の `statusline.js` の「累積」の表記は誤り。**累計のトークン数は、ステータスラインからは取れない**。コストだけが累計（`cost.total_cost_usd`）。
2. **Codex**: 記録（`rollout-*.jsonl`）の `token_count` に、累計トークン・直近の呼び出し・コンテキストの窓・制限（`rate_limits`）が全部ある【確認】。包みは要らない。**`primary`／`secondary` は「5 時間／週」ではない**: この機械のアカウント（`plan_type: pro`）では、`primary` が `window_minutes: 10080`（週）で、`secondary` は `null`。**`window_minutes` で見分ける**。コストは記録に無い。
3. **Copilot CLI**: この機械には Linux 側に無く、Windows 側の `.copilot` にも会話の記録が無い（設定・ログだけ）【確認】。公開の文書から: 記録は `~/.copilot/session-state/<id>/events.jsonl`、**利用状況（`modelMetrics`・プレミアムリクエスト）は `session.shutdown` の行にだけ**（終了するまで出ない）。**ステータスライン（`/statusline`。JSON が stdin に来る）に、トークン・コンテキスト・プレミアムリクエストの数がある**（Oh My Posh の文書から。公式の文書は未確認）。制限は見当たらない。PR5 に回すのが妥当。
4. **取り方の形**: 「記録を読む」（Claude・Codex・Copilot の終了後）と「ステータスラインの JSON を受ける」（Claude・Copilot）の 2 種類を、種類ごとのアダプタとして持つ。1 つの共通の形に寄せる（下の 5）。
5. **安全**: #126 の読み口（場所はサーバが決める・根の下・通常のファイル・リンク 1 つ・`O_NOFOLLOW`・`O_NONBLOCK`・上限・待ち）の **I/O の部分は使い回せる**。パスの組み立てと整形は、種類ごとに別に書く。ステータスラインの報告は、#128 の確かめを使えて、**さらに強い確かめ（入力の `session_id` が、その pane の `agentSession` と一致するか）が足せる**。

---

## 1. Claude Code のステータスライン

### 1.1 入力の形・呼ばれ方【確認】（出どころ: <https://code.claude.com/docs/en/statusline> を取得して読んだ）

- 設定: `settings.json` の `statusLine`: `{ "type": "command", "command": "<シェルの 1 行>", "padding": <文字数>, "refreshInterval": <秒。最小 1> }`。ユーザー設定（`~/.claude/settings.json`）か**プロジェクトの設定**に書ける。
- stdin の JSON（全項目）:

| 項目 | 内容 |
| :- | :- |
| `session_id`・`transcript_path`・`cwd`・`version`・`session_name`（名前がある時だけ）・`prompt_id` | 会話の識別 |
| `model.id`・`model.display_name` | モデル |
| `workspace.current_dir`・`project_dir`・`added_dirs`・`git_worktree`・`repo.{host,owner,name}` | 場所 |
| `cost.total_cost_usd`・`total_duration_ms`・`total_api_duration_ms`・`total_lines_added/removed` | **累計**のコスト（list price による**見積り**。`modelPricing` の表があればそれ）。`/clear` で 0 に戻る |
| `context_window.total_input_tokens`・`total_output_tokens` | **いま文脈にあるトークン**（最後の応答から。入力はキャッシュの読み書きを含む）。累計ではない |
| `context_window.context_window_size`・`used_percentage`・`remaining_percentage`・`current_usage.{input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens}` | コンテキストの使用率（`used_percentage` は入力側だけで計算。最初の応答の前は `null`。`/compact` の後は `current_usage` が `null`） |
| `rate_limits.five_hour.{used_percentage,resets_at}`・`seven_day.{…}` | **制限**。`resets_at` は Unix 秒。**claude.ai の Pro・Max の利用者だけ**・最初の API 応答の後だけ。窓ごとに独立に無いことがある。`resets_at` を過ぎた窓は落ちる |
| `rate_limits.spend_limit.{used_percentage,resets_at,used_usd,limit_usd,period}` | 組織のゲートウェイの枠（v2.1.251 以降）。無いことが多い |
| `prompt_cache.*`・`exceeds_200k_tokens`・`fast_mode`・`effort.level`・`thinking.enabled`・`output_style.name`・`vim.mode`・`agent.name`・`pr.*`・`worktree.*` | そのほか |

- **いつ呼ばれるか**: セッション開始（再開を含む）・新しいアシスタントのメッセージ・`/compact` の完了・権限モードの変更・vim モードの切り替え・`command` の変更・`refreshInterval` の満了・**制限の窓の `resets_at` に達したとき**・キャッシュの `expires_at`。**300ms のデバウンス**。実行中に次の更新が来ると、**走っている script は取り消される**。アイドルの間は静か（`refreshInterval` で補える）。
- **失敗したとき**: 「0 以外の終了コード・出力なし → ステータスラインが空白になる」。遅い script は更新を止める。信頼されていないフォルダでは**空白のまま走らない**（`Status line command skipped: workspace trust not accepted`）。`disableAllHooks: true`（管理された設定以外）なら、管理された `statusLine` だけが走る。`allowManagedHooksOnly` なら、管理された設定の `statusLine` だけ。
- **出力**: 複数行・ANSI の色・OSC 8 のリンクが可。端末の幅は環境変数 `COLUMNS`・`LINES` で渡る。
- **時間切れの具体的な秒数は、文書に無い**【未確認】。

### 1.2 利用者の現在の設定【確認】

- `~/.claude/settings.json` の `statusLine` は `{"type":"command","command":"node ~/.claude/statusline.js"}`（`padding`・`refreshInterval` は無い）。`statusline.js` は上の入力から `model.display_name`・`version`・`cost.total_duration_ms`・`cost.total_api_duration_ms`・`context_window.total_input_tokens`/`total_output_tokens`/`used_percentage`・`cost.total_cost_usd`・`rate_limits.five_hour`/`seven_day` の `used_percentage`・`resets_at`・`workspace.current_dir`・`cost.total_lines_*`・`session_name`・`vim.mode` を使い、自前の `~/.claude/weekly-usage.json`（この機械には無い）に日別コストを控える。
- **プロジェクトの設定（`.claude/settings.json`）が `statusLine` を持てば、ユーザーの設定を上書きする**【確認: 公式の文書「ユーザー設定かプロジェクト設定」。優先順位は設定の文書】。包みは、ユーザーの設定だけを書き換えるので、プロジェクトが上書きしたセッションでは、**包みが呼ばれず、報告が来ない**（記録からの取得だけになる）。

### 1.3 包みの安全な作り（案）【推測。設計の提案】

- **形**: `statusLine.command` を `node "<~/.claude/hooks>/soda-statusline.cjs"` に替える（既存のフックのスクリプトの置き場所と同じ流儀）。**元の `statusLine` のオブジェクト全体（`type`・`command`・`padding`・`refreshInterval`）を控える**。
- **元の控えの置き場所（決めてほしい）**: (a) 横のファイル（`soda-statusline.orig.json`）だけ、(b) command の引数に base64 で埋める、(c) 両方。勧めは (c): 横のファイルが消えても、**設定のファイルだけで元を再現できる**（包みは、自分の引数から元を読む。落ちても元の表示が出る）。外す＝控えの `statusLine` を戻す。
- **遅くしない・落ちても元を出す**: 包みは stdin を全部読み、(1) 元のコマンドを `sh -c`（Windows は `cmd`/PowerShell）で起動して、同じ JSON を渡し、その stdout・終了コードをそのまま返す。(2) 並行して、`SODA_PANE_ID` と `SODA_AGENT_REPORT_SOCKET` があるときだけ、`agent-report.sock` に 1 行を **待たずに**書く（接続・書き込みに 200ms 程度の自前の上限を掛け、失敗は黙って捨てる。`unref`）。送る内容は数字と id だけ（下の 1.4）。元のコマンドが起動できなければ、何も出さずに終わる（元と同じ振る舞い）。SIGTERM（Claude が実行中の script を取り消す）は子へ転送する。
- **Sodashitsu の外**（`SODA_PANE_ID` が無い）: 元を呼ぶだけ。
- **利用者が後で自分で替えたとき**: 設定の `statusLine.command` が、自分のスクリプトを指さなくなる。`AgentIntegrationInstaller` の `status` が「包みが外れています（利用者が替えました）」を出し、**控えを書き戻さない**（利用者の新しい値を上書きしない）。
- **今のフックの導入と同じ流儀か**: **ほぼ同じ**【確認: `AgentIntegrationInstaller.ts` の `HOOK_SPECS`（`entriesPath` が配列の経路・`isOurs`・`expectedMatcher`・`needsUpdate`・`writeConfigFile`〔実体のパスへ原子的に書く・モードを保つ〕）】。違い: `statusLine` は**配列でなくオブジェクト 1 つ**で、**元の値を引き継ぐ**。`pathShape`/`getPath`/`setPath` は配列前提なので、オブジェクトの経路を扱う小さな足しが要る。**「押したときだけ書き換える」「利用者のほかのキーを保つ」「形が想定と違えば何も変えない」**は、そのまま使える。
- **管理された設定が上書きしている場合**: 検出できない（管理された設定のファイルの場所は OS ごとに違い、読めないことがある）。**症状（報告が来ない）で気づく**形にする（設定画面の「利用状況」に「ステータスラインの報告が届いていません」を出す。信頼されていない・プロジェクトが上書き・管理された設定、の可能性を一言で）。

### 1.4 報告の受け口と誰の報告か

- **`agent-report.sock` に、新しい種類の行（`type: "usage"`）を足すのでよいか: よい**【確認: `AgentReportSocket.ts` の `AgentReport = AgentReportBody & { agentPid?; cwd?; source? }`。種類ごとに `parseReport` が上限を掛け、知らない `type` は捨てる】。**別のソケットは要らない**。上限（1 行 32,768 文字）に十分収まる（数字だけの JSON は 1 KB 未満）。
- **ステータスラインのコマンドは、どのプロセスの子で動くか**: Claude Code が `sh -c "<command>"` の形で起動する（`sh` の親が `claude`）【推測: 公式の文書は起動のしかたを書かない。フックと同じ作りと考える】。**`CLAUDE_PID` は渡る見込み**: `claude` の子（この会話の Bash ツール）の環境に `CLAUDE_PID=<その claude の pid>` が入っていることを実機で確認した【確認: `env` の出力。#128 の調査も同じ】。ステータスラインのコマンドの環境でも入るかは **【未確認】**（実物の対話を動かさない取り決めのため）。入らなくても、フックの `agentPidOf` と同じ「親を 4 段たどり、名前が `claude` の祖先」で代えられる。
- **#128 の確かめを、そのまま使えるか: 使える**。報告に `agentPid` を足せば、`SessionService.attribute`（シェルの子孫か・前面のエージェントの pid か）がそのまま掛かる。
- **それより強い確かめ（ステータスライン固有）**: 入力の `session_id` が、その pane の `agentSession.sessionId`（フックが報告したもの）と**一致する**ことを要求できる。pid の確かめと違い、**子の `claude` の報告は別の `session_id` を持つ**ので、別の会話のものは必ず落ちる。一致しないときは捨てる（または、`agentSession` がまだ無い間は、短く保留）。**推す**。
- **欠ける場合**: 利用者が自分で `statusLine` を替えた・プロジェクトが上書きした・信頼されていない・フックの導入前に起動したエージェント（入れ直すまで、包みも効かない）。いずれも「報告なし」になり、記録からの取得に落ちる。

---

## 2. 包みなしで取れる範囲（Claude Code）

### 2.1 記録（`~/.claude/projects/<場所>/<id>.jsonl`）【確認】（この会話の記録 37.6 MB を実際に読んだ）

- `type: "assistant"` の行の `message.usage`: `input_tokens`・`output_tokens`・`cache_creation_input_tokens`・`cache_read_input_tokens`・`cache_creation.{ephemeral_5m_input_tokens,ephemeral_1h_input_tokens}`・`service_tier`・`iterations[]`。`message.model`。`message.id`。`requestId`。`timestamp`・`sessionId`・`cwd`・`version`・`gitBranch`。
- **重複**: 同じ `message.id` の行が複数ある（content ブロックごとに別の行）。この記録で 2,824 行 → 一意の id 1,704。**重複した行の usage は同一**だった（差の出た id は 0）。**数えるときは `message.id` で 1 回にする**。`model` が `<synthetic>` の行は 0 トークン（数えても害は無い）。
- **サブエージェント**: 別のファイル `<記録のフォルダ>/<id>/subagents/agent-<agentId>.jsonl`（`.meta.json` が付く）。主の記録には入らない。この会話は 177 ファイル。**含めるなら全部を読む**。
- **圧縮**: `system` の `compact_boundary` の行。usage は圧縮の後も続くので、合計は連続して数えられる。`/compact` の後の最初の応答までは、コンテキストの使用率が小さく出る。
- **大きさ**: 最大 261 MB の記録がある（`~/.claude/projects` 全体 4.8 GB）。この 37 MB の記録の走査（JSON.parse）は **約 170ms**（Node 24。メモリへ全部読んだ場合）。増分の読み（前回の位置から）にすれば、ふだんは数 KB。
- **合計と、公式の会計の食い違い（重要）**【確認】: この記録の 1 件の `cost-state`（下）の `modelUsage` と、記録からの合計（主＋サブエージェント）を比べた。出力トークン: Sonnet が 記録 約 0.49M ／ cost-state 4.57M、Opus が 記録 約 1.46M ／ cost-state 4.81M。**記録の合計は、会計の値より小さい**（キャッシュ読みは 7 割ほど）。差の理由は **【未確認】**（記録に残らない呼び出し〔分類・タイトル・助言のモデルなど〕・消えたサブエージェントのファイル・圧縮での書き換えの可能性）。→ **記録の合計は「記録に残っている分」と表示し、確定した累計とは言わない**。

### 2.2 `cost-state`（未文書。実機で発見）【確認】

- 記録に `type: "cost-state"` の行がある（この記録に 30 行）。項目: `sessionId`・`totalCostUSD`・`totalAPIDuration`・`totalToolDuration`・`totalLinesAdded/Removed`・`totalDuration`・`startTime`・`hasUnknownModelCost`・**`modelUsage`: モデルごとの `{inputTokens, outputTokens, thinkingTokens, cacheReadInputTokens, cacheCreationInputTokens, webSearchRequests, costUSD}`**。
- **書かれるのは、セッションの区切り**（`/clear`・終了・再開など。この記録では、再開のたびに 1〜2 行。最後の 2 行は同じ値）。**動いている間は更新されない**。累計は再開をまたぐ（この記録で `totalCostUSD` 956.3）。
- 使い方: 「最後の `cost-state` ＋ その後の記録の分」で、**コスト（確定分）とトークンの累計**が出せる。ただし、その後の分のコストは、単価が要る（2.3）。
- **公式の文書に無い**ので、**将来の版で形が変わりうる**（読めなければ「—」に落とす作りにする）【推測】。

### 2.3 コストの概算（単価の表を持つべきか）

- **自前の単価の表は、勧めない**: モデルが増える・価格が変わる・長いコンテキストの料金・5 分／1 時間のキャッシュ書き込みの料金差、で古くなる。確認として、`cost-state` の 5 世代分（モデルごと）から単価を回帰で求められるか試した【確認】が、**条件が悪く（負の単価が出る）、使えない**。
- 推す形: コストは **(1) ステータスラインの `cost.total_cost_usd`（報告があれば。見積りと明記）** → **(2) 最後の `cost-state` の `totalCostUSD`（その時点）** → **(3) それ以外は「—」**。(2) の後に増えた分を、単価の表で足す案は、**表を製品が持つ**（古くなる）か、**利用者が設定で書く**かの決定が要る（下の決定事項）。Claude 自身も list price の見積り（`modelPricing` の表があればそれ）なので、「見積り」の注記は付ける。

### 2.4 コンテキストの使用率

- 記録の最後の主の応答の `usage` から `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`（公式の `used_percentage` と同じ式）。**窓の大きさ**は記録に無い。モデル id の末尾 `[1m]`（`cost-state` の `modelUsage` のキーに `claude-opus-5-5[1m]` がある【確認】）で 100 万、無ければ 20 万、が目安【推測】。ステータスラインの報告があれば、`context_window_size`・`used_percentage` をそのまま使う（正確）。

---

## 3. Codex

### 3.1 記録（`~/.codex/sessions/YYYY/MM/DD/rollout-<時刻>-<id>.jsonl`）【確認】（この機械の最新の記録 739 行・16.7 MB を実際に読んだ）

- 行の形: `{timestamp, ordinal, type, payload}`。種類: `session_meta`（1 行目。`id`・`session_id`・`cwd`・`cli_version`・`model_provider`・`context_window`・`git`・`creator_account_id`）・`turn_context`（`model`・`effort`・`cwd`・`approval_policy`・`sandbox_policy`…。**ターンごと**）・`event_msg`（`task_started`・`token_count`・`item_completed`…）・`response_item`・`token_usage_record`・`world_state`。
- **`event_msg` の `payload.type == "token_count"`**: `info.total_token_usage` と `info.last_token_usage`（どちらも `{input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}`）・`info.model_context_window`（この記録では 354,350）と、**`rate_limits`**:

```
"rate_limits": {"limit_id":"codex","limit_name":null,
  "primary":{"used_percent":17.0,"window_minutes":10080,"resets_at":1792150968},
  "secondary":null,
  "credits":{"has_credits":false,"unlimited":false,"balance":"0"},
  "individual_limit":null,"spend_control_reached":null,
  "plan_type":"pro","rate_limit_reached_type":null}
```

- **出る頻度**: API 呼び出し 1 回ごと（この記録で 88〜89 回。`info`・`rate_limits` は毎回付いていた）。**`total_token_usage` は累計**（16.9M 入力のところまで増えていた）。`token_usage_record`（別の行。`thread_token_usage`・`turn_token_usage`・`response_id`）にも累計がある。
- **`primary`／`secondary` は 5 時間／週ではない**: **`window_minutes`**（この記録は 10080＝週）で判別する。5 時間は 300 のはず【推測】。`secondary` は `null` のことがある（この記録の全 89 回）。**ラベルは `window_minutes` から作る**（300→「5 時間」・10080→「週」・それ以外→「N 分」）。
- **モデル名**: `turn_context.payload.model`（`gpt-6.1-sol`）。`~/.codex/models_cache.json` に `slug`・`display_name`・`context_window`（373000）・`effective_context_window_percent`（95）。
- **コンテキストの使用率**: `last_token_usage.total_tokens`（または `input_tokens`）÷ `info.model_context_window` が目安【推測。Codex 自身の「context-remaining」の式は未確認】。
- **コスト**: 記録に**無い**。Codex の画面の「推定のスレッドコスト」（`config.toml` の `status_line` に `estimated-thread-cost`）は画面だけで、ファイルには出ていない【確認: 記録の全 `token_count` に cost の項目は無い】。→ 「—」（単価の表は、上の 2.3 と同じ決定）。
- **続きから読む**: 末尾の数百 KB を逆から読んで最後の `token_count` を探す（初回）。以後は前回の位置から。大きな記録（この日 34 MB 超）を毎回全部は読まない。**会話の累計は最後の `token_count` の `total_token_usage` 1 つで足りる**（全部を足し合わせる必要が無い。Claude と違う）。
- **pane と会話の対応**: `fix/codex-multi-pane` が `pane.agentSession` に付ける前提でよい（依頼）。記録のファイルは、id からの探索（日付の入れ子を `glob` する）か、フックの入力の `transcript_path`（Codex の `SessionStart` の入力に `transcript_path` がある【確認: 過去の調査 `session-attribution-codex.md`】）。
- **アカウント全体**: 最新の記録（`sessions` 全体で mtime が最新）の最後の `token_count` の `rate_limits` で足りる（pane との対応が無くても）。**`rate_limits` は全 `token_count` に付く**ので、1 つの会話が止まっていても、別の会話の記録が新しければそちらが新しい。`as_of` は、その行の `timestamp`。

### 3.2 ステータスラインのコマンド・フック

- `~/.codex/config.toml` の `status_line = ["model-with-reasoning","approval-mode","project-name","git-branch","branch-changes","five-hour-limit","weekly-limit","estimated-thread-cost","context-remaining","total-input-tokens","total-output-tokens","pull-request-number"]`【確認】。**組み込みの項目名の配列**で、外部のコマンドの設定は見当たらない（公式の文書は未確認【未確認】）。**包みの余地は無い**。
- フック: `hooks.json` は `SessionStart` だけを導入している（Sodashitsu）。入力は `session_id`・`transcript_path`・`cwd`・`hook_event_name`・`model`・`permission_mode`・`source`【確認: 過去の調査】。**利用状況は含まれない**。ほかのイベント（`Stop` など）の有無は【未確認】。

---

## 4. GitHub Copilot CLI

- **この機械**: Linux 側に無い。Windows 側（`/mnt/c/Users/makku/.copilot`）は、`config.json`（`firstLaunchAt` だけ）・`settings.json`（`{"theme":"auto"}`）・`logs/`（`process-*.log` 67 バイト・古い `session-*.log` 498 バイト）・`ide/` だけで、**`session-state/` も `history` も無い**（会話の記録が 1 つも無い）【確認】。npm の shim は `/mnt/c/Users/makku/AppData/Roaming/npm/copilot`。`~/.copilot`（Linux）には `hooks/`（Sodashitsu のフック）だけ。→ **実際の記録の形は、この機械では確かめられない【未確認】**。以下は公開の文書から。
- **記録**（出どころ: GitHub の docs と、コミュニティのツール `copilot-show`〔<https://pkg.go.dev/github.com/apstndb/copilot-show>〕。**第三者の記述**）: `~/.copilot/session-state/<セッション id>/events.jsonl`（`COPILOT_HOME` があればその下。公式の文書: 設定は `~/.copilot` か `COPILOT_HOME`）。行の種類（`session.start`〔`data.context.cwd`〕・`session.model_change`・`session.compaction_complete`〔トークン数〕・`user.message`/`assistant.message`・`tool.execution_*`・`session.shutdown`）。**利用状況は `session.shutdown.data.modelMetrics.*`（`totalNanoAiu`・`inputTokens`・`outputTokens`・`cacheReadTokens` 〔`inputTokens` の部分集合〕・リクエスト数）と、プレミアムリクエストの数**。**`session.shutdown` は終了時にだけ書かれる**ので、動いている会話の累計は出ない【推測: `copilot-show` が「最新の shutdown の snapshot を使う」と書く】。
- **`/usage`**（公式の説明、2025-10 の changelog）: 「プレミアムリクエストの数・セッションの長さ・編集した行数・**モデルごとのトークンの内訳**を出す。同じ情報が終了時にも出る」。画面に出るだけで、ファイルに出るかは【未確認】。
- **ステータスライン**: `/statusline` で有効にする（コミュニティのリポジトリの記述。**`feature_flags.enabled: ["STATUS_LINE"]` が要る版がある**）。**stdin の JSON は、Oh My Posh の文書によれば**: `cwd`・`session_id`・`session_name`・`transcript_path`（会話の記録のフォルダ）・`model.{id,display_name}`・`workspace.current_dir`・`remote.connected`・`version`・`username`・`cost.{total_duration_ms,total_api_duration_ms,total_lines_added,total_lines_removed,total_premium_requests}`・`context_window.{context_window_size,used_percentage,remaining_percentage,remaining_tokens,current_context_tokens,total_input_tokens,total_output_tokens,total_cache_read_tokens,total_cache_write_tokens,total_reasoning_tokens,total_tokens,last_call_input_tokens,last_call_output_tokens}`（<https://ohmyposh.dev/docs/segments/agents/copilot-cli>）。**制限・月の枠の項目は無い**。**設定のキー（`statusLine` の名前・`command` の書き方）は公式の文書で確かめられなかった【未確認】**。
- **フック**（公式: <https://docs.github.com/en/copilot/reference/hooks-configuration>）【確認】: 設定は `~/.copilot/hooks/*.json`（`$COPILOT_HOME/hooks/`）・リポジトリの `.github/hooks/*.json`・設定の `hooks` 欄。イベント: `sessionStart`・`sessionEnd`・`userPromptSubmitted`・`userPromptTransformed`・`preToolUse`・`postToolUse`・`postToolUseFailure`・`errorOccurred`・`agentStop`・`subagentStart`・`subagentStop`・`preCompact`・`permissionRequest`・`notification`。入力は全イベント共通で `sessionId`・`timestamp`（ms）・`cwd`。`sessionStart` に `source`（`startup`・`resume`・`new`）・`initialPrompt?`。`agentStop`・`subagentStart`・`preCompact` に `transcriptPath`。**利用状況は、どのイベントにも含まれない**。タイムアウトの既定 30 秒・fail-open。
- **再開**: スラッシュの `/resume [SESSION-ID]`・`/continue`。**コマンドラインの `--resume`（`--resume=SESSION-ID`）の文書は確かめられなかった【未確認】**。Sodashitsu の `resumeCommandFor` は `copilot --resume=<id>`（既存の前提）。
- **アカウント全体**: プレミアムリクエストの月の枠は、GitHub の課金 API（`gh` の認証が要る）から。**ローカルでは取れない**（コミュニティの `copilot-usage` が課金のエンドポイントを使う、という記述）。→ **対象外**（「—」）。
- **結論**: Copilot は、(a) 終了後の記録（`session.shutdown`）と、(b) ステータスラインの JSON（有効にした場合）の 2 つの口がある。**どちらも、実機で形を確かめてから**（PR5）。この機械に Linux 側の `copilot` を入れて、**短い非対話の実行で**確かめるのが早い（利用者の判断）。

---

## 5. 共通の形（案）

```ts
interface AgentUsage {                       // セッション（pane）ごと
  kind: "claude" | "codex" | "copilot" | string;
  model: string | null;                      // 表示名（Claude: display_name があれば。無ければ id）
  tokens: {                                  // 無い項目は無い（0 ではない）
    input?: number; output?: number; cacheRead?: number; cacheWrite?: number; reasoning?: number; total?: number;
    basis: "cumulative" | "transcript" | "context";  // 累計（Codex・cost-state）／記録に残る分（下限）／いま文脈にある分
  };
  costUsd?: number;
  costBasis?: "reported" | "cost-state" | "estimate";   // 報告（Claude の見積り）／会計の行／自前の概算
  contextUsedPct?: number;                   // 0〜100
  contextWindowTokens?: number;
  premiumRequests?: number;                  // Copilot
  source: "statusline" | "transcript" | "cost-state" | "hook";
  updatedAt: number;                         // 最後に値を得た時刻（epoch ms）。必ず持つ
  stale?: boolean;                           // 画面側は updatedAt と動いているかで出す
}

interface AccountUsage {                     // アカウント全体
  kind: string;
  accountKey: string;                        // `CLAUDE_CONFIG_DIR`・`CODEX_HOME` の根のパスから作った不透明な鍵（画面には短い名前）
  label?: string;                            // 利用者が付けた名前（既定: 根のフォルダ名）
  windows: { label: string; usedPct: number; resetsAt?: number; windowMinutes?: number }[];
  plan?: string;                             // Codex: plan_type
  source: "statusline" | "rollout";
  asOf: number;
}
```

- **アカウントの見分け**: Claude は `CLAUDE_CONFIG_DIR`（無ければ `~/.claude`）、Codex は `CODEX_HOME`（無ければ `~/.codex`）の**根のパス**で分ける、でよい。Claude のステータスラインの入力に、アカウントの識別子は**無い**（`username` は Copilot だけ）ので、包みが `process.env.CLAUDE_CONFIG_DIR` を報告に添える（pane のシェルの環境変数）。Codex の `session_meta.creator_account_id`（不透明な id）は、同じ `CODEX_HOME` に複数のアカウントがある場合の補助になる【確認: 項目の存在。使い方は推測】。サーバが pane の環境を知らないので、**記録の置き場所（どの根の下か）で決める**のが確実。
- **古い値**: `updatedAt`／`asOf` を必ず持つ。画面は「N 分前」を出す。制限の窓は `resetsAt` を過ぎたら「リセット済み（次の値待ち）」にする（Claude 自身も窓が過ぎると落とす）。ステータスラインはアイドルの間は静か（`refreshInterval` を包みで足す手は、**利用者の設定を変える**ので勧めない）。

---

## 6. サーバの側の置き場所と安全

- **#126 の使い回し**（`SubagentTranscript.ts`）: 使い回せるのは **I/O の外側**: (a) 入力は pane の id だけ（場所を受け取らない）、(b) `realpath` で実体にして、**根の下**（`~/.claude/projects`・`CLAUDE_CONFIG_DIR/projects`／`~/.codex/sessions`・`CODEX_HOME/sessions`）であることを確かめる、(c) `lstat` でリンクを断る・`isFile`・`nlink === 1`、(d) `open(O_RDONLY | O_NOFOLLOW | O_NONBLOCK)` の後に `fd.stat()` で再確認、(e) 読む量・待ちの上限、(f) ログに場所・中身を出さない、(g) `pane.sock` に載せない。`resolveTranscriptFile` は**サブエージェント専用の形**（`<親>/<id>/subagents/agent-<id>.jsonl`）なので、主の記録用の解決を別に書く（`basename === <sessionId>.jsonl`・根の直下 2 段）。`readRange` は共通化できる。
- **場所の出どころ**: Claude は、フックの報告の `transcript_path`（今は `subagent_*` の報告にだけ載せている。**`session` の報告にも足す**）か、`<根>/<cwd をハイフンにした名前>/<sessionId>.jsonl` をサーバが組み立てる（Claude の命名の規則。**【推測】**。フックの値の方が確実）。報告の中身は信用しない（#126 と同じ。根の下・名前の一致で確かめる）。Codex は `transcript_path` か、`sessions/**/rollout-*-<id>.jsonl` の探索。
- **読む頻度**: 見えているときだけ（ダッシュボード・情報ボタンの窓が開いている間、またはそのエージェントの pane が見えている間）。**5 秒おき**を目安に、まず `stat`（サイズ・mtime が変わらなければ何も読まない）。増えたときだけ、前回の位置から（1 回 1 MiB まで）読む。初回は、Claude の累計のために全体を**分割して**走査（上限 64 MiB まで。超えたら末尾だけ・「一部」の印）。pane ごとに、集計（数字）と位置と最後の id だけをメモリに持つ（Codex は末尾から最後の `token_count` だけ）。見えていない pane は読まない（直前の値に `updatedAt`）。
- **配る相手**: ログイン済みの `/ws` だけ（新しい方式 `agent.usage`・できごと `agent.usage_changed`）。**`pane.sock`（ログイン不要）には載せない**（pane の入出力・設定に触れない、という載せてよい条件を満たすが、秘密ではないとはいえ不要）。
- **会話の中身は配らない**: 配るのは数字・モデル名・時刻・ラベルだけ。記録のパスも配らない（#126 と同じ）。`session_name`（利用者が付けた名前）は、ステータスラインの入力に含まれるが**送らない**（すでに Sodashitsu が `pane.agent.name` を持つ）。
- **別のマシン（中継）の pane**: 記録はそのマシンにある。**そのマシンの `soda serve` が読んで、`agent.usage` の方式で返す**（既存の中継の `agent.get`／`RemoteAgentPort` と同じ形）。手元のサーバは、別のマシンの記録を読まない。アカウント全体の枠も、**マシンごと**（別のマシンの同じアカウントが同じ枠を共有する場合に重複して見えるのは仕方がない。`accountKey` はマシンの id を含める）。
- **ステータスラインの報告の安全**: `type: "usage"` の項目は数値と短い文字列だけを通す（上限・範囲）。偽の報告（同じ利用者のプログラム）は、表示を汚すだけで、会話の参照のように再開に影響しない。

---

## 7. 画面（案）

- **ダッシュボードを 3 つ目の画面に**: `screens/screens.ts` の `SCREENS` に 1 行（`{ id: "dashboard", label: "ダッシュボード", shortLabel: "ダ", component: DashboardScreen }`）足せばよい**作り**になっている【確認: 同ファイルの冒頭のコメントが「3 つ目以降の画面は、ここへ 1 行足す」と書く。`App.vue` と `ScreenSwitcher` は `SCREENS` から作る】。`view.screen` の型 `ScreenId` が増える。**注意**: (1) 見えない画面は `inert` で、**大きさを保ったまま**（`display: none` を使わない）なので、ダッシュボードも同じ作りでよい。(2) `view.setScreen` は 1 列（モバイル）では `base` 以外を断る。モバイルの 1 列には、グラフのように**重ねるダイアログ**（`GraphDialog`）の形が要る（PR3 で決める）。(3) `main.ts` の `isAllowedOnGraphScreen`（グラフの画面で効くキー）と、`ActionDispatcher` の「グラフを閉じる」の分岐は、`screen === "graph"` を前提にしているので、画面が増えるときに「基本画面以外」へ一般化する必要がある。(4) 切り替えのボタンは 3 つになる（PR6 で作った tab と同じ見た目。狭いサイドバーの `shortLabel`）。
- **一覧の列**: 種類・名前（`agent.name`）・状態（`pane.agent.state`）・モデル・作業フォルダ／ブランチ（workspace の git）・サブエージェントの数（`pane.agent.subagents.count`）・トークン（基準の印つき）・コスト（基準の印つき）・コンテキスト（棒）・最後の動き（`AgentInfo.since` と `updatedAt`）。上部にアカウントの枠（種類ごと・窓ごとの使用率の棒・リセットの時刻・「N 分前」）。行を押すと、その pane（基本画面で選ぶ）へ。
- **情報ボタン**: モダンは `PaneActions.vue` の並び（［右へ分割］［下へ分割］［最大化］［閉じる］）に［情報］を足す（`data-pane-action="info"`）。押すと pane の近くに小さな窓（セッションの利用状況・サブエージェントの一覧への入口）。**クラシックは配置を変えない**（PR4 の AC）ので、右クリックのメニュー（「利用状況…」）とキー（`prefix` の操作として登録。割り当ては利用者が変えられる）から開く。モバイルは、メニューから開く全面のダイアログ。
- **端末版（TUI）**: 今回は対象外でよい（`sodactl agent usage` で見られる。`docs/tui-parity.md` に「サーバ機能」として 1 行）。

---

## 8. 切り方（勧め）

| PR | 中身 | 受け入れ条件の骨子 |
| :- | :- | :- |
| **PR1 サーバ（記録だけ）** | アダプタの枠・共通の形・読み口（#126 の I/O を共通化）・Claude の記録（重複の除去・サブエージェント・増分・`cost-state`）・Codex の記録（最後の `token_count`・`rate_limits`・`window_minutes` のラベル）・方式 `agent.usage`・`sodactl agent usage`・フックの報告に `transcript_path` | 数字が実記録の期待値と一致（重複で 2 倍にならない・サブエージェントを含む／含まない）。大きな記録でも上限内（走査の時間・メモリ）。場所を受け取らない・根の外／リンク／FIFO を拒む。値が無いものは無い。`updatedAt`。別のマシンの pane。`pane.sock` から呼べない。会話の中身がどこにも出ない |
| **PR2 ステータスラインの包み** | `soda-statusline.cjs`・導入・外す・更新（`AgentIntegrationInstaller` に `statusLine` の仕様を足す）・`type: "usage"` の受け口・`session_id` の一致の確かめ | 設定画面で押したときだけ書く。利用者のほかのキーを保つ。元の出力・終了コードがそのまま。落ちても・`SODA_PANE_ID` が無くても元が出る。遅くしない（送るのは待たない）。利用者が替えた・プロジェクトが上書きしたときの表示。別の会話の報告を捨てる |
| **PR3 ダッシュボード** | 3 つ目の画面・一覧・アカウントの枠・更新の配信 `agent.usage_changed`・モバイルの形 | 一覧と上部の枠。行から pane へ。見えていない間は読まない。画面の切り替えで `client.view` が落ち着く（PR4 の守り）。モバイル・古い値の表示・値が無いときの「—」 |
| **PR4 情報ボタン** | モダンの［情報］・クラシックのメニューとキー・窓 | クラシックの配置が変わらない（比べる道具）。キーボードで開ける。窓の中身は数字だけ |
| **PR5 Copilot CLI** | 実機の確認・記録（`session.shutdown`）・ステータスラインの口（有効なら）・再開のコマンドの確認 | 実機で形を確かめた事実を `research` に。値が無いときは「—」 |

- 1 PR が数十ファイルを超えないよう、PR1 は「Claude」と「Codex」で 2 つに分けてもよい（共通の枠を先に）。

---

## 決めること（監督役・利用者）

1. **コストの単価の表を、製品が持つか**: 持たない（勧め）＝報告（Claude の見積り）か最後の `cost-state` だけ、無ければ「—」。持つ／利用者が書く＝概算を出せるが古くなる。Codex のコストは、表を持たない限り「—」。
2. **`cost-state`（未文書）を使ってよいか**: 勧め＝使う（読めなければ「—」へ落とす）。形が変わるリスクを受け入れるか。
3. **包みの控えの置き場所**: 横のファイルだけ／command の引数（base64）／両方（勧め）。
4. **記録のトークン合計の見せ方**: 「記録に残る分（下限）」と書く（勧め）／会計との食い違いの理由を調べるまで出さない。
5. **ステータスラインの `refreshInterval` を包みで足すか**: 勧めない（利用者の設定を変える。アイドルの間は値が古いまま・`updatedAt` で示す）。
6. **アカウントの鍵**: 設定のフォルダの根のパス（勧め）。画面に出す名前の既定（フォルダ名か、利用者が付ける名前か）。
7. **ダッシュボードのモバイル**: 重ねるダイアログ（グラフと同じ）でよいか。
8. **Copilot CLI の実機の確認**: Linux 側に入れて、短い非対話の実行で形を確かめる許可（PR5 の前提）。
9. **サブエージェントを pane のトークンに含めるか**: 含める（会計に合う）／別に出す（勧め: 含めて、内訳を情報ボタンに）。
10. **ダッシュボードの `view.screen` の追加に伴う、`isAllowedOnGraphScreen`・グラフを閉じる分岐の一般化**を、PR3 に含めてよいか。

## 出どころ（URL）

- Claude Code のステータスライン: <https://code.claude.com/docs/en/statusline>
- Copilot CLI のフック: <https://docs.github.com/en/copilot/reference/hooks-configuration>
- Copilot CLI のコマンド一覧（設定の置き場所・`/context`・`/session`・`/resume`）: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference>
- Copilot CLI のステータスラインの入力（Oh My Posh の segment 文書）: <https://ohmyposh.dev/docs/segments/agents/copilot-cli>
- Copilot CLI の記録（第三者のツール）: <https://pkg.go.dev/github.com/apstndb/copilot-show>
- 実機: `~/.claude/projects/-workspaces-sodashitsu/957621e5-….jsonl`（`assistant`・`cost-state` の行）・`~/.claude/settings.json`・`~/.claude/statusline.js`・`~/.codex/sessions/2026/10/10/rollout-2026-10-10T09-50-20-01a1234a-….jsonl`・`~/.codex/config.toml`・`~/.codex/models_cache.json`・`/mnt/c/Users/makku/.copilot`。
- コード: `packages/server/src/agent/{AgentIntegrationInstaller,AgentReportSocket,SubagentTranscript}.ts`・`packages/server/src/session/SessionService.ts`（`attribute`・`acceptsReporter`）・`packages/web/src/screens/screens.ts`・`App.vue`・`components/{ScreenSwitcher,PaneActions}.vue`（origin/main `d383caa`）。
