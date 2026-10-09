# 調査: エージェントの fork（会話を引き継いだエージェントを別の pane・別の worktree に起こす）

調査日: 2026-10-09 / Claude Code 2.1.295（この開発機）/ 製品のコードは変えていない。
記号: **【確認】** = この開発機で実行して確かめた、または公式文書で読んだ事実。**【推測】** = 確かめていない。**【未確認】** = 確かめられなかった。

## 要点（先に）

1. Claude Code には、会話を引き継いで別のセッションとして始める口がある: `claude --resume <id> --fork-session`（対話・`-p` のどちらでも）。**新しい id になり、元の記録は書き換わらず、元の会話を覚えていて、元が動いている最中でも、別のフォルダからでも動く**【確認】。
2. **別の worktree（別フォルダ）から fork できる**。公式の仕様（v2.1.223 以降は id で全プロジェクトを探す）で、記録のファイルを写す必要はない【確認】。
3. **引き継がれるのは会話とモデルだけ**。権限モード・`--add-dir` は引き継がれない【確認】。fork の側で指定し直す必要がある。
4. Sodashitsu は、フックを入れた Claude Code の pane なら会話の id を持っている（`pane.agentSession`）。**fork を起こしたときも、フックが新しい id（`source:"fork"`）を報告してくる**【確認】ので、fork した側の `agentSession` は自動で正しくなる。フックなし・フックより前の起動では分からない。argv での推測は**危ない**（元の id が見えるだけ）。
5. 起動は、既存の `agent.start` の仕組み（固定表の実行ファイル + クォートした引数）に乗せられる。ただし fork は**専用の rpc（`agent.fork`）**にして、会話の id はサーバが `pane.agentSession` から取るのがよい。
6. 新しい worktree: `worktree.create` は**その workspace の cwd の HEAD から**枝を作る（pane の cwd ではない）。**未コミットの変更の有無・件数は、サーバはいま知らない**（`GitInfo` に無い）。新しい git の呼び出しが要る。
7. グラフの「fork」の線: 新しい `LinkKind` は足せるが、**protocol・GraphEngine・client-core の検証・web・CLI に触れ、古い版が `graph.json` を読むと「壊れたファイル」として退避する**。軽い代替は、線ではなく pane/node の「fork 元」の注記。
8. 最大の落とし穴（要件に無い）: **会話の中の絶対パスは元のフォルダのまま**。新しい worktree で fork したエージェントが、元のフォルダのファイルを編集しうる。最初のプロンプトで作業フォルダの変更を伝える設計が要る。

---

## (1) Claude Code の fork の口

### 1.1 公式文書・`--help`

【確認】`claude --help` / <https://code.claude.com/docs/en/cli-reference>（2026-10-09 取得）:

| 旗 | 文書の説明（要約） |
| --- | --- |
| `-r, --resume [id/name]` | id か名前で再開。**id を渡すと、現在のプロジェクトとその git worktree、次に「この機械の全プロジェクト」を探す（v2.1.223 以降。それ以前は現在のプロジェクトと worktree だけ）**。`.jsonl` の絶対パスも渡せる |
| `-c, --continue` | 今のフォルダの直近の会話 |
| `--fork-session` | 「再開するとき、元の id を使い回さず新しい session id を作る」（`--resume`/`--continue` と併用） |
| `--session-id <uuid>` | 会話の id を指定して始める（UUID） |
| `--bg --resume <id>` | 動いている最中の id なら、**同じ id で続ける、または「コピーを始める」**（`--help` の文面） |
| `-n, --name` | 表示名 |
| `--permission-mode`, `--add-dir`, `--model`, `--effort`, `--settings` | セッション単位の指定 |

### 1.2 実測（一時フォルダ `forkA`／`forkB`。短い会話。費用は合計 1 ドル未満）

準備: `forkA` で `claude -p "合言葉 PINEAPPLE-42 を覚えて" --permission-mode plan --output-format json` → session_id = `9f698fc3-…`。

| 問い | 実行 | 結果 |
| --- | --- | --- |
| (a) 新しい id か | `claude -p "合言葉は?" --resume 9f698fc3-… --fork-session --output-format json` | **【確認】** `session_id = ecf8d81d-…`（別 id）。記録は同じフォルダ用の場所に別ファイルとして増えた |
| (b) 元の記録が書き換わらないか | fork の前後で `md5sum` と mtime を比較（2 回） | **【確認】** どちらも `OK`／`ORIGINAL UNCHANGED`。fork 側のファイルは**元の記録を丸ごと複製**し（26 行 → 31 行。1 往復の会話で約 180KB）、先頭に `mode` の行を足したもの |
| (c) 覚えているか | 応答 | **【確認】** 「PINEAPPLE-42」と答えた |
| (d) 元が動いている最中でも | 元の会話を `--resume`（同じ id）で `Bash sleep 25` を走らせている最中（8 秒後）に、別プロセスで fork | **【確認】** fork は成功し（`9793de07-…`）、元は `DONE` で完走。fork 側は「sleep が前のセッション終了時に未完了で停止」と受け取った——**その時点の記録の写し**を持つ（実行中のツール呼び出しの結果は持たない）。なお対話中の別端末ではなく `-p` の実行中での確認。対話中でも、文書の `--bg --resume` の記述（動いていれば「コピーを始める」）と整合する。**【未確認】** 対話モードの実プロセスに対する fork |
| (e-1) モデル | 元を `--model claude-haiku-5-5`、fork は `--model` なし | **【確認】** fork の応答は `claude-haiku-5-5`——**引き継がれる** |
| (e-2) 権限モード | 元を `--permission-mode acceptEdits`、fork は指定なし | **【確認】** fork の新しい行の `permissionMode` は `default`（元の行は `acceptEdits` のまま複製）——**引き継がれない** |
| (e-3) 追加フォルダ | 元を `--add-dir <extra>`、fork は指定なし。`extra/a.txt` の Read を頼む | **【確認】** 「読めない（権限が無い）」——**引き継がれない**（`-p` の default で外のフォルダの Read は不可なので、挙動は「引き継がれない」と整合。add-dir 自体の有無の直接の観測ではない） |
| (f) 別フォルダから | `forkB`（別のフォルダ）で、`forkA` で作った id を `--resume … --fork-session` | **【確認】** 成功。応答は「PINEAPPLE-42」。新しい記録は **`forkB` 用の場所**（cwd = `forkB`）に置かれた。記録のファイルを写す操作は不要 |
| (f-2) 無い id | `--resume 0000…` | **【確認】** `No conversation found with session ID: …`、終了コード 1 |
| (f-3) 別の設定の場所 | `CLAUDE_CONFIG_DIR=別の場所` で同じ id を fork | **【確認】** `No conversation found …`——**記録は `CLAUDE_CONFIG_DIR`（既定 `~/.claude`）の単位**。別の設定の場所を使うエージェントの会話は、その環境変数なしでは見つからない |
| フック | `--settings` で `SessionStart` フックを足して fork | **【確認】** フックの stdin に `{"session_id":"<新しい id>","hook_event_name":"SessionStart","source":"fork","cwd":"<fork 側のフォルダ>","transcript_path":…}` が来た。**新しい id が来る** |

### 1.3 (f)「記録のファイルを新しいフォルダへ写す」は要るか

**要らない**（【確認】(f)・文書）。id で全プロジェクトを探すのが公式の仕様（v2.1.223 以降。この開発機は 2.1.295）。写す方法は、記録の中の `cwd`・`sessionId` とファイル名の整合を崩しうるので、取らない方がよい【推測】。ただし**古い Claude Code（2.1.223 未満）では、別のプロジェクトの id は見つからない**（git の worktree 同士は探す）【確認:文書】。Sodashitsu の新しい worktree は、元のリポジトリの worktree なので、古い版でも見つかる見込み【推測。未実測】。
**版の下限は決めておく**（`claude --version` を見て 2.1.223 未満なら fork を出さない、など。サーバが見られるかは (3) 参照）。

### 1.4 注意

- fork した会話の最初のターンは、複製した文脈をすべて送る。試した短い会話で 1 ターンが 0.17 ドル（元の 1 ターン目は 0.09 ドル）【確認】。長い会話の fork は費用が大きい【推測】。
- `-p` の `--resume` は `claude -c` の対象に出ない場合がある（文書）が、`--resume <id>` には関係しない。

---

## (2) Sodashitsu が「会話の id」をどこまで知っているか

【確認:コード】
- `Pane.agentSession: AgentSessionRef | null`（`packages/protocol/src/model.ts:108,121`）= `{ kind, sessionId, reportedAt }`。`kind` は `claude|codex|cursor|copilot|devin|droid|grok|qwen|qodercli`。
- 入口は**フック**だけ: `agent-hook-report.cjs`（`server/assets/`）が stdin の `session_id` と環境の pane id を `agent-report.sock` へ送り、`AgentReportSocket` が受ける。Claude Code は `SessionStart`・`PreToolUse(Agent|Task)`・`SubagentStart`・`Stop`・`SubagentStop`・`SessionEnd` に登録（`AgentIntegrationInstaller.ts:210-220`）。
- `agentSession` は保存（`session.json`。`SessionFile.ts:115`）され、サーバ再起動の復元に `resumeCommandFor`（`claude --resume <id>`）で使われる。`pane.agent` が `null` になると `agentSession` も `null` に消える（`SessionService.ts:1152`）。
- id の文字の検査: `SAFE_SESSION_ID = /^[A-Za-z0-9._/-]+$/`（名前・パスも通す広さ。`resumeCommand.ts:9`）。**fork は UUID だけに絞るべき**【推測:設計】。

| 場合 | `agentSession` | fork できるか |
| --- | --- | --- |
| フックを入れた後に起動した Claude Code | あり | できる |
| fork で起こしたエージェント | **新しい id が自動で入る**（`source:"fork"` の SessionStart。実測 1.2 のフック） | できる（孫の fork も） |
| `/clear`・`/compact` 後 | `SessionStart`（source `clear`/`compact`）で新しい id が来る見込み | 【未確認】（対話を実機で試していない） |
| フックを入れていない | `null` | **できない**（理由「フックの導入が要る」を出す） |
| フックを入れる前から動いている | `null` のまま（次の `SessionStart` まで） | できない。エージェントを再起動すれば入る |
| 別のマシンの pane | その機械のサーバが持つ（`BridgeEndpoint`）。ローカルから見た `agentSession` が届くかは【未確認】 | (7) 参照 |

### 他の方法で推すのは危ないか

- **プロセスの引数（`ps`）**: 実測で `claude --resume <id>` が見える（この機械の別のエージェント）。だがこれは**起動時の元の id**で、`--fork-session`・`/clear`・`/compact` の後の現在の id ではない。**別の会話を fork する事故になるので使わない**（【確認】fork で id が変わる／引数は変わらない、は 1.2 から明らか）。
- **記録のファイルの更新時刻**: 同じフォルダに複数のエージェントがいると取り違える。**使わない**【推測だが、事故が起きたときの害が大きい】。
- **`~/.claude/sessions/<pid>.json`**: 実機に `{pid, sessionId, cwd, startedAt, procStart, status, name…}` がある【確認:観測】。pid → 現在の id を引ける有力な手がかりだが、**公式文書には載っていない**（未文書の内部の仕組み）。基本はフックだけにし、これは「分からないときの補助」にもしない方がよい【推測】。**【未確認】** `/clear` 後に更新されるか。

---

## (3) 起動のしかた

【確認:コード】
- `agent.start`（`server/src/agent/AgentStarter.ts`、`protocol/src/agentStart.ts`）: `{ name, kind, paneId, args[], timeoutMs?, callerPaneId? }`。`kind` は固定表（`claude`→`claude`）で、`args` は**クォートして**打ち込む（`buildStartLine`）。名前は必須で一意。制御文字不可・1 行 4000 バイトまで。前面がシェルだけ（`checkShell`。POSIX 系のシェルだけ。fish・pwsh 等は `unsupported_agent_shell`、Windows サーバは未対応）のときだけ打ち込む。busy は CLI 側が 2 秒まで再試行（`START_BUSY_RETRY_MS`）。
- つまり **`claude --resume <id> --fork-session` は `args: ["--resume", id, "--fork-session"]` でそのまま打ち込める**。ブラウザは文字列を送らない形にできる。ただし**既存の `agent.start` は、任意の `args` をクライアントから受ける**（旧来の挙動。fork で新しく生まれる問題ではない）。

**設計の提案**【推測】: 新しい rpc `agent.fork { paneId, target: {kind:"split", direction} | {kind:"worktree", branch}, name? }`。サーバが ① 元の pane の `agentSession`（`kind==="claude"`、UUID の形、`pane.agent` が claude）を引く → なければ `agent_fork_unavailable`（理由つき）、② pane を作る（`pane.split` か `worktree.create`+`workspace.create`）、③ `AgentStarter.start` に `args=["--resume", id, "--fork-session", …]` を渡す。ブラウザが送るのは「どの pane」「どこへ」「ブランチ名」だけ（AC5 を満たす）。
- 新しい pane は作った直後でシェルが準備中のことがある。`agent.start` の busy 再試行をサーバ側に持たせる（CLI の 2 秒再試行はサーバ内にはない）。
- fork 側の旗（権限モード・`--add-dir`・`--effort`）は引き継がれない（1.2）。**元の起動の旗はサーバが知らない**（pane の argv は検知の対象だが、保存していない）【推測】。既定にするか、fork のダイアログで選ばせるか、要判断。
- 最初のプロンプト: `claude --resume <id> --fork-session "<文>"` で最初の入力を渡せる（文書の `claude "query"`）【未確認:fork との併用は実測していない】。worktree で fork するときに「作業フォルダは `<path>` に変わった。元のフォルダは編集しない」と伝えるのに使える（1 の 8）。
- 名前（`name`）は必須・一意。`<元の名前>-fork` に連番を付けて自動で決めるのがよい【推測】。

---

## (4) 新しい worktree を作る道

【確認:コード】
- `worktree.create { workspaceId, branch }`（`WorktreeService.create`）: **workspace の「いまの場所」（`identityCwdOf`）**で `git worktree add -b <branch> <path> HEAD`（ブランチが既にあれば `worktree add <path> <branch>`）。作るだけで workspace は開かない。結果は `{ path }`。→ `workspace.create { cwd: path, label: branch, callerPaneId }` で開く（`cwd` 指定は失敗しても別の場所に回さない）。**つながる**。
- 注意: 枝を切るのは**workspace の cwd の HEAD**。fork 元の pane が別の場所へ `cd` していても、そこの HEAD ではない。fork 元の pane の cwd を使うなら `worktree.create` の呼び出し方を足す必要がある【推測】。
- **未コミットの変更**: `GitInfo` は `branch/ahead/behind/repoKey/isLinkedWorktree/worktreeKey` だけ（`model.ts:12`）。`GitInfoPoller.probe` は `rev-parse`・`rev-list` だけで、`git status` は呼ばない。**サーバは「いま」未コミットの有無も件数も知らない**【確認:コード】。AC3 の「件数つきで確定前に出す」には、`git status --porcelain`（件数と、未追跡を数えるか）を確定前に 1 回呼ぶ rpc が新しく要る（`worktree.list` の応答に足すか、別の rpc）。重い git を定期のポーリングに入れる必要はない【推測】。
- 付いてこないものは未コミットの変更だけでなく、**gitignore されたファイル**（`.env`・`node_modules`・ビルドの成果物）も（worktree は新しい checkout）。確定前の表示で触れるとよい【推測】。
- 注意（要件に無い、重要）: 会話には元のフォルダの**絶対パス**が入っている。fork した側が `Edit /元のフォルダ/src/…` と書くと、**元のフォルダ（元のエージェントの作業場）を書き換える**。US2「互いのファイルを書き換え合わない」を壊す。対策は (3) の最初のプロンプトと、画面の注意書き。完全には防げない【推測】。

---

## (5) グラフの「fork」の線

【確認:コード】`packages/protocol/src/graph.ts`・`server/src/graph/`・`client-core/src/graph/`。

- `LinkKind = "trigger" | "supervise" | "approval"`。ノードは pane（`local:<paneId>`）。線は `GRAPH_LINKS_MAX = 512`、ノードは手元 512＋他マシン 64。`graph.json` に保存し、`GraphSchema`（zod）で読み込みの形を検査。
- `GraphEngine.reconcile` は `kind === "supervise"` だけ飛ばし、**それ以外は trigger/approval としてエンジンに載せる**（`GraphEngine.ts:279`）。新しい kind は、ここ・`reconcileSupervisors`（:344）・:565・:742 を意識して**エンジンから除く処理が必須**（足さないと、設定の形の検査で落ちるか、動いてしまう）。
- `client-core/src/graph/validate.ts`：種類ごとの設定の形（`wantsTrigger`/`wantsApproval`）、重複、`supervise`/`approval` の「配下 1 つにつき監督役 1 つ」の規則。新しい kind の規則を足す。`web/src/components/graph/linkText.ts`、`cli/src/cliArgs.ts`、E2E も kind を列挙している。
- **互換**: `GraphStore` は、知らない形のファイルを「壊れたファイル」として `graph-backups/` に退避して空のグラフで起動する（`GraphStore.ts:22,171`）。**新しい kind を保存した後に古い版へ戻すと、グラフが空になる**（退避されるだけで消えはしない）。`schema` の版の扱い（`schema:1`→`2` の移行の前例あり）に合わせる必要がある。別のマシンのサーバが古い版だと、`graph` の同期でどうなるかは**【未確認】**。
- `AgentLineage`（`server/src/graph/AgentLineage.ts`）: 「誰が pane を作ったか（`noteCreated`）／`agent start` を打ったか（`noteStarted`）」をメモリに覚え、その pane で**エージェントが最初に検出されたとき**に、子 → 親の **`supervise` と `approval` の線**を 1 回の `store.update` で足す（`AUTO_LINK_KINDS`）。重複・上限・取り合いは自分で外す。**同じ仕組みに乗せられる**——ただし **fork の pane に `callerPaneId` を渡すと、fork の子に「元が監督する」線（親が子を監督）が自動で付く**。fork は監督関係ではないので、fork では `callerPaneId` を渡さず（または fork 用の `noteForked` を足して）`fork` の線だけを足す設計にする必要がある【推測】。
- 保存の形（案）: `GraphLink` に `kind:"fork"` を足し、`from=子`・`to=元`、`trigger`/`approval` なし、`limit`/`count`/`paused` は意味が無いので固定値（形の都合）。上限は既存の `GRAPH_LINKS_MAX` の枠を共有（fork を重ねると枠を食う）。1 つのノードの fork 元は 1 つ（監督と同じ規則）にできる。
- **軽い代替**【推測】: 線にせず、`GraphNode` か pane に `forkedFrom: paneId` を持たせ、グラフの画面で薄い破線として描く。エンジン・検証・`graph.update` の ops に触れず、古い版との互換の問題も小さい。ただし線のメニュー・`sodactl graph` の一覧に出ない。要判断。

---

## (6) ほかのエージェント

この開発機に入っているもの: `codex`、`gemini`（Windows 側の npm の shim）、`copilot`（Windows 側）。`opencode` は入っていない。

| エージェント | 結果 |
| --- | --- |
| Codex | **【確認】** `codex fork [SESSION_ID] [PROMPT]`（`--last`・`--all` あり。「Fork a previous interactive session」）。`codex resume` もある。`-C/--cd <DIR>` で作業フォルダ、`--model`、`--sandbox`、`--dangerously-bypass-…` あり。**別フォルダから id で fork できるかは【未確認】**（一覧は既定で cwd で絞る。`--all` で外す） |
| Copilot CLI | **【確認】** `--continue`・`--resume [sessionId]` のみ。**fork の旗は `--help` に見当たらない** |
| Gemini CLI | **【未確認】** `--help` を取れなかった（WSL から Windows 側の shim を呼ぶ形で出力が出なかった） |
| OpenCode ほか | **【未確認】** この機械に無い |

後の作業の候補は Codex（`codex fork <id>`）。`resumeCommandFor` と同じ表（kind → コマンド）で、fork 用の列を持つ設計にできる【推測】。

---

## (7) 危ない点

会話の記録には利用者の秘密（ファイルの中身・コマンドの出力・環境変数の値が出た箇所）が入る。fork は同じ利用者の記録を、もう 1 つの同じ利用者のエージェントに渡すだけ。境界は増えない見込みだが、次の道がある。

| 場合 | 状況 | 対策（案） |
| --- | --- | --- |
| **別のマシンの pane** | 記録は**その機械**にある。ローカルのサーバが `claude --resume <id>` を打つ先は、ローカルの pane（別の機械の記録は見つからない: `No conversation found`）。逆に、リモートの pane を fork してローカルに起こす道は**作らない**（記録を機械の間で運ぶことになる） | fork の pane は「元の pane と同じ機械」だけ。別の機械の pane は項目を出さない／その機械のサーバに処理させる |
| **名前付き session**（`soda serve` を複数） | 記録は `~/.claude`（OS の利用者）の単位で、soda の session の単位ではない。**別の名前付き session の pane の id を指定されても、`agentSession` は元の session のサーバが持つ**ので、ほかの session の記録を引く道は無い。ただし、同じ利用者の別 session のエージェントの記録は同じ場所にあり、id を知れば fork できる | id は**サーバが pane から引く**。クライアントから id を受けない（AC5 の延長） |
| **別の OS の利用者** | 記録は `~/.claude`（`CLAUDE_CONFIG_DIR`）。別の利用者の `soda` は別の home を見る。`CLAUDE_CONFIG_DIR` が違うと**見つからない**（1.2 の f-3）。なので、他人の記録に届く道は無い | pane のシェルの環境が違う（`CLAUDE_CONFIG_DIR` を pane だけで変えている）と fork が `No conversation found` で失敗する。エラーを利用者に返す |
| **id の細工** | フックの報告（`agent-report.sock`）は信頼できない入力。id にシェルの特殊文字が入るとコマンド行の注入になりうる | `SAFE_SESSION_ID` は `/`・`.` を許す広さ。fork は **UUID の形（`^[0-9a-f]{8}-…$`）だけ**に絞る。引数は `quotePosixArg` で包まれる（既存）が、二重に守る |
| **`--resume` に名前・パスが渡る** | `--resume` は名前・`.jsonl` の絶対パスも受ける。細工された値でほかの記録を読み込ませられる | 上の UUID 限定で防ぐ |
| **fork 先の権限** | 元が `bypassPermissions` でも、fork は `default` で始まる（1.2）。逆に利用者が fork の旗で緩めたいと思うかもしれない | 既定は引き継がない（安全側）。緩める選択は明示の操作にする |
| **元の会話に残る秘密を worktree 側が持つ** | fork は会話を丸ごと複製する（1.2 の (b)）。新しい記録も `~/.claude/projects/<新しいフォルダ>/` に残る | 利用者の `~/.claude` の中で完結。worktree を消しても記録は残る（`claude purge` で消す）。文書に書く |

---

## 要件の下書き AC1〜AC7 の判定

| AC | 判定 | 理由・直し |
| --- | --- | --- |
| AC1 メニューに項目、出せないとき理由 | **そのまま作れる**（文言を少し直す） | 出す条件 = `pane.agent` が claude かつ `agentSession` が `kind:"claude"` で UUID の形。「古い版」は「Claude Code の版が 2.1.223 未満（別フォルダの fork が使えない）」に直す。サーバが版を知る手段は【未確認】（`claude --version` を叩くか、検知した版）。出せない理由に「フックを入れていない」を足す |
| AC2 同じフォルダで fork | **そのまま作れる**（条件を足す） | `pane.split` + `agent.start`。元が止まらない・記録が変わらない・覚えている、は確認済み。直し: **権限モード・追加フォルダは引き継がれない**ので、どうするか（既定／選択）を足す。「元が動いている最中」は `-p` で確認、対話は未確認 |
| AC3 新しい worktree で fork | **直すべき** | ① 枝を切るのは workspace の cwd の HEAD（pane の cwd ではない）。② 未コミットの変更の有無・件数は**サーバが知らない**ので、新しい git の呼び出し（確定前）が要る。③ **元のフォルダの絶対パスが会話に残る**ので、最初のプロンプトで作業フォルダの変更を伝える要件を足す。④ 付いてこないものに gitignore のファイルも書く |
| AC4 グラフの fork の線 | **直すべき** | 作れるが重い。新しい kind はエンジン・検証・web・CLI・互換（古い版が `graph.json` を退避）に触る。線にするか、`forkedFrom` の注記にするかを要件の時点で決める。`AgentLineage` の自動の監督線が fork に付かない扱いも明記する |
| AC5 コマンドの文字列を受け取らない | **そのまま作れる** | 新しい `agent.fork`（paneId・行き先・ブランチ名だけ）。id はサーバが `agentSession` から取り、UUID だけ通す。既存の `agent.start` が任意の `args` を受ける点は別（fork の責任ではない） |
| AC6 `sodactl agent fork <pane> [--worktree <ブランチ>]` | **そのまま作れる** | `agent start` の CLI（`cli/src/commands/agentStart.ts`）と同じ形。pane を指定する形に加え、権限などの旗の扱いを決める |
| AC7 文書 | **そのまま作れる** | `docs/sodactl.md` ほか |

作れないものは無い。要件に**足すべきこと**: ① 権限モード等が引き継がれないこと、② 版の下限（2.1.223）、③ 元のフォルダの絶対パス問題、④ 別の機械の pane の扱い、⑤ 費用（長い会話の fork は高い）の注意書き、⑥ 孫の fork（自動で動く）。

## 後始末

試しの会話（`forkA`・`forkB` の `~/.claude/projects/` の記録）は削除した。`~/.claude/settings.json`・既存の記録は触っていない。

---

## T0 の確かめ（2026-10-10。Claude Code 2.1.296。対話の実プロセスを tmux で動かした。haiku・短い会話・費用は合計 約 0.01 ドル）

方法: 一時フォルダの git リポジトリで `claude --settings <記録用のフック> --model claude-haiku-5-5` を対話で起動し、`SessionStart` の stdin を記録した。記録用のフックは 2 本: `matcher: ""`（全部）と `matcher: "startup|resume"`（**Sodashitsu が導入するフックと同じ matcher**。`AgentIntegrationInstaller.ts:29`）。利用者の設定・既存の会話は書き換えていない（一時の会話の記録は削除した）。

| 問い | 結果 |
| :- | :- |
| (1) 対話中の実セッションを、別の端末から fork できるか | **できる**【確認】。元（id `3e81…`）が対話で動いたまま、別の端末で `claude --resume 3e81… --fork-session` が起動し、新しい id（`593d…`）で、会話を覚えていた（「合言葉は?」→ `PINEAPPLE-42`）。元の画面・会話はそのまま |
| (2) 初めてのフォルダで、信頼の確認が出るか | 新しい**普通のフォルダ**で起動すると、「このフォルダを信頼しますか」の確認が出る（`blocked` 相当の画面。Enter 待ち）【確認】。**元のリポジトリの worktree**（`git worktree add` で作った別フォルダ）で fork したときは、**確認は出なかった**（そのまま会話が開いた）【確認】。ただし元のフォルダが信頼済みだった場合だけの確認。A8（確認で止まったら、手が空くまで知らせを送らない）は、普通のフォルダ・信頼されていない元のときのために必要 |
| (3) fork 直後の `idle` | 短い会話では、起動の 2 秒後には入力欄が出ていた。長い会話での読み込みの長さは、費用が大きいので測っていない【未確認】 |
| (4) `/clear` の後の `SessionStart` | **新しい id で `source: "clear"` が来る**【確認】（`3e81…` → `3ab7…`） |
| **フックの matcher** | **`source: "fork"` の `SessionStart` は、`startup|resume` の matcher に一致しない**【確認】。記録用の全部拾うフックには `fork`（新しい id）と `clear`（新しい id）が届き、Sodashitsu と同じ matcher のフックには、**どちらも届かなかった**（起動時の `startup` だけ届いた）。`compact` も同じ matcher では拾えない見込み【推測】 |

### 設計の前提との食い違い（ここで止める）

設計の前提（`design.md`「いまの作り」・`research.md` 1.2 の最後の行・要点 4・(2) の表）: **「fork した側の `pane.agentSession` は、フックの報告で、自動で正しくなる」**。実際は、いま導入されるフックの matcher（`startup|resume`）が `fork` を拾わないので、**fork した pane の `agentSession` は `null` のまま**になる。影響:

- fork したエージェントを、さらに fork できない（AC1 の「孫の fork も」。メニューが「会話の id が分からない」で押せない）。
- fork したエージェントは、サーバの再起動の復元で再開されない（`agentSession` が無いため）。
- 既存の不具合の同種: `/clear` の後も新しい id が届かず、`agentSession` は**古い id のまま**（`/clear` 後に fork すると、**消した会話**を fork する。F3「別の会話を fork しうる」の危険に当たる）。

### 直し方の案（判断をお願いしたい）

1. matcher を `startup|resume|fork|clear|compact` に広げる（`MATCHER` 定数 1 つ。`AgentIntegrationInstaller.ts:29`）。導入済みのフックは「更新が必要」と表示され、利用者が設定画面で入れ直すと効く（利用者の `~/.claude/settings.json` は、利用者の操作でだけ変わる）。または matcher を空（全部）にする（`SessionStart` の source は `startup|resume|clear|compact|fork` の 5 種）。この変更は fork の作業の前提で、`/clear` の古い id の問題も同時に直る。
2. 上を fork の作業に含めるか、先に別の作業として入れるか。含める場合、`AgentIntegrationInstaller` のテスト（`startup|resume` を期待しているもの）と、`docs` の更新が要る。
3. 導入済みの利用者のフックが更新されるまでは、孫の fork と、fork 後の再開は使えない、と文書に書く。

守りの表示（フックの導入が古いときの案内）は、既存の「更新が必要」の仕組みに乗る【推測。コードは未確認】。
