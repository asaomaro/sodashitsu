# 設計: エージェントの fork

要件は `requirements.md`、調査は `research.md`（実測の手順と出力。**実装のときは、該当の節を読む**）。

> **追補 01（2026-10-10。独立点検の反映）が、末尾にある。本文と食い違う所は、追補 01 が優先する。** 点検の全文は `doccheck.md`（M1〜M6・S1〜S10）。

## いまの作り（調査で確かめた事実）

- Claude Code は、`claude --resume <会話の id> --fork-session` で、会話を引き継いだ、別のセッションを始める。新しい id になり、元の記録は書き換わらない。元が動いている最中でも、できる。別のフォルダからでも、id で見つかる（v2.1.223 以降。`CLAUDE_CONFIG_DIR` が同じこと）。引き継がれるのは、会話とモデル。権限のモード・`--add-dir` は、引き継がれない。
- fork すると、`SessionStart` のフックが、`source: "fork"` と、新しい id で来る。fork した側の `pane.agentSession` は、今の仕組みのまま、正しくなる。
- Sodashitsu が、pane のエージェントの会話の id を知るのは、フックの報告（`pane.agentSession`）だけ。
- エージェントを起動する方式 `agent.start` は、エージェントの種類ごとの固定の表と、引用符で囲んだ引数で、pane に打ち込む。起動できる pane は、前面がシェルだけのもの。
- `worktree.create` は、workspace のフォルダの `HEAD` から、枝を切る。まだコミットしていない変更の有無・件数を、サーバは、いま、知らない。
- グラフの線の種類（`LinkKind`）を足すと、`GraphEngine`・検証・画面・CLI に及び、古い版は、グラフのファイルを退避して、空で起動する。`GraphNode` は、知らない項目を、黙って落とす（`z.object`）。
- エージェントが起動したエージェントには、`AgentLineage` が、自動で、監督の線と、承認の代理の線を付ける（pane の中の `sodactl` から作られた・起動された pane に限る）。

## 方針

1. **サーバの方式を 1 つ足す: `agent.fork`。** 受け取るのは、pane の id・行き先（同じフォルダ／新しい worktree とブランチ名）・最初の知らせを送るか、だけ。会話の id は、サーバが、その pane の `agentSession` から引く（UUID の形だけを通す）。起動は、いまの `agent.start` の中の処理（固定の表・引数の引用・起動できる pane の確かめ・検知を待つ）を呼び、引数に `--resume <id> --fork-session` を足す。
2. **新しい仕組みを、できるだけ作らない。** pane を足すのは `pane.split`、worktree と workspace は `worktree.create`・`workspace.create`、知らせを送るのは `agent prompt` と同じ処理。
3. **線は、ノードの注記。** `GraphNode` に、省ける項目 `forkedFrom?: NodeKey` を足す。描くのは、ブラウザ（見るだけの線の層）。

## サーバ

### `agent.fork`（`surface/methods/agent.ts`）

入力: `{ paneId, target: { kind: "same" } | { kind: "worktree", branch }, note?: boolean }`。出力: `{ paneId: <新しい pane>, workspaceId, forkedSession: null }`（新しい会話の id は、後から、フックで分かる）。

手順（どこかで失敗したら、そこで止め、できたものを結果に書く）:

1. 元の pane を確かめる: 手元の pane・エージェントが Claude Code・`agentSession` が UUID の形。違えば、`fork_unavailable`（理由の種類つき）。
2. 行き先を作る。
   - 同じフォルダ: 元の pane を、分割の既定の向きで `split`。
   - 新しい worktree: `worktree.create`（元の workspace のフォルダの `HEAD` から）→ `workspace.create`（その worktree のフォルダ）。新しい workspace の、最初の pane を使う。
3. 新しい pane で、Claude Code を起動する（`agent.start` の中の処理に、`--resume <id> --fork-session` を足して）。検知を待つ（今の待ちの上限）。
4. グラフ: 新しい pane のノード（サーバが、すでに足している）に、`forkedFrom: local:<元の pane>` を書く。`AgentLineage` には、fork であることを伝えて、自動の線を付けさせない。
5. 最初の知らせ（worktree のときで、`note` が偽でない）: エージェントが、入力を受けられる状態（手が空いた）になるのを待って（上限 60 秒）、決まった文面を送る。待ちが切れたら、送らずに、結果に書く。

接続の種類: 画面（desktop・mobile）と `external`（`sodactl`）から。`pane.sock` には、載せない。

### `agent.fork_preview`（読み取りだけ）

確定の前の画面のために、`{ paneId, branch? }` → `{ available, reason?, dirtyCount?, targetPath?, claudeVersion? }`。`dirtyCount` は、元の workspace のフォルダで `git status --porcelain` を数える（上限 2 秒。数えられなければ `null`）。`targetPath` は、今の「新しい worktree」のダイアログと同じ決まり。

### グラフ

- `GraphNode` に `forkedFrom?: NodeKey`（`protocol/src/graph.ts`。`GraphSchema` に、省ける項目として）。`GraphOp` に `set_node_note`（ノードの鍵と、`forkedFrom` か `null`）。利用者の `graph.update` からは、受け付けない（サーバの内部の更新だけ）。
- 掃除: `forkedFrom` の指すノードが無くなったら、`reconcileGraph` が、注記を消す。
- `sodactl graph show --json` のノードに、`forkedFrom` が出る。

## 画面

- pane の右クリックのメニュー・グラフのノードのメニューに、「このエージェントを fork…」。押すと、小さなダイアログ（`AgentForkDialog.vue`。既存のダイアログの部品）: 行き先（同じフォルダ／新しい worktree）・ブランチ名（worktree のとき。候補は、サーバが作る）・作成先・注意（引き継がれないもの・コミットしていない変更の数）・「最初の知らせを送る」（worktree のとき。既定で入）・［取りやめ］［fork する］。
- fork できないときは、メニューの項目を、押せない形にして、理由を `title` と読み上げに。
- グラフ: 見るだけの線の層（サブエージェントの枝〔別の作業〕と同じ考え方）。元のノードから、fork したノードへ、破線と、小さな札「fork」。線は、選べない・設定を持たない。別の空間にあるときは、今の「別の空間との線の印」と同じ形の印。
- 色は既存の `--soda-*`、角・高さは様式のトークン。クラシックの基本画面は、メニューの項目が 1 つ増えるほかは、変えない。

## `sodactl`

`sodactl agent fork <pane> [--worktree <ブランチ>] [--no-note] [--json]`。

## 壊れやすい所

| 所 | 危険 | 点検 |
| :- | :- | :- |
| 会話の id | 別の会話を fork する・ブラウザから id を差し込まれる | ★。サーバが引く・UUID だけ・単体と結合のテスト |
| 起動の引数 | 引数の引用の誤りで、別のコマンドが走る | ★。固定の表と、既存の引用の関数だけを使う |
| 半端な状態 | worktree だけ出来て、起動に失敗する | ★。手順ごとの失敗のテスト |
| グラフの保存の形 | 古い版が、グラフのファイルを読めなくなる | ★。古い `GraphSchema` で、新しいファイルが読めることのテスト |
| 自動の線 | fork に、監督の線・承認の代理の線が付く | テスト |
| 最初の知らせ | エージェントが、起動の途中に、文面を、別の入力として受け取る | 手が空くのを待つ・待ちが切れたら送らない |

## PR の分け方

| PR | 中身 |
| :- | :- |
| 1 | サーバ（`agent.fork`・`agent.fork_preview`・グラフの注記）・`sodactl agent fork`・文書 |
| 2 | 画面（メニュー・ダイアログ・グラフの線） |

## 追補 01: 独立点検の反映

点検で、本文が、**いまは CLI の側にある仕組みを、サーバにあるものとして書いていた**ことなどが分かった。実装のときは、`doccheck.md` の該当の節（根拠のファイルと行・直し方の案）を、必ず読む。

### 事実の訂正

- `agent.start`（`AgentStarter.start`）は、**pane に打ち込んだ時点で返る**。エージェントの検知を待つ・`agent_pane_busy` のときに 2 秒やり直す、のは、CLI（`sodactl agent start`）の側の処理で、サーバには無い。
- 作ったばかりの pane は、シェルが入力を受けられる前に打ち込むと、**打鍵を捨てる**ことがある（起動のときの、先頭の Ctrl-C の扱い。実際に起きた事故がある）。
- 接続の種類（画面か、`external` か）を検査する、共通の仕組みは、`agent.*` の方式には無い。`agent.start` は、`/ws` の認証済みの、すべての接続から使える。
- protocol の入力の検証は、知らない項目を、黙って落とす（断らない）。
- `reconcileGraph` は、pane のノードの有無と、置き場所を直す関数で、ノードの注記の掃除を置く所ではない。pane が閉じたときの後始末は `GraphPaneCleanup`。ノードの鍵の付け替え（`rekey_node`）もある。
- `worktree.create` は、ブランチ名が既にあると、`HEAD` から切らず、そのブランチを取り出す。
- `AgentLineage` の自動の線は、**pane の中の `sodactl`** から作られた・起動された pane にだけ付く。サーバの方式（`agent.fork`）が作った pane には、付かない（何もしなくてよい）。

### 決め直し

| # | 事項 | 決定 | 点検 |
| :- | :- | :- | :- |
| A1 | 手順の進め役 | **サーバに、`AgentForkRunner` を作る**（1 回の fork の、手順と待ちを持つ）。エージェントの検知を待つ・手が空くのを待つ、は、サーバの中のできごと（`pane.agent_status_changed`）を聞く、小さな待ちの関数として、サーバに足す（CLI の `StartWait` と、同じ決まり。CLI の側は、変えない）。`agent.fork` は、起動のコマンドを打ち込むところまで（下の A2 の後）で、**新しい pane の id を返す**。その後の、検知・注記・最初の知らせは、裏で続け、進み具合は、できごと（`agent.fork_progress`。pane の id・段階・結果）で配る。`sodactl agent fork` は、既定で、最後まで待つ（`--no-wait` で、待たない） | M1 |
| A2 | 作ったばかりの pane への打ち込み | シェルが、入力を受けられるようになるのを待ってから、打ち込む: その pane が「起動できる pane」（前面が、シェルだけ）と判定され、かつ、出力が 300ms 静まるまで（上限 5 秒。切れたら、`fork_shell_not_ready` で止め、pane は残す）。fork が作った pane では、先頭の Ctrl-C を送らない（打ちかけが無いため） | M2 |
| A3 | 接続の種類 | 検査しない。`/ws` の認証済みの、すべての接続から使える（`agent.start` と同じ）。`pane.sock` には、登録しない（テスト: `pane.sock` から呼ぶと `unknown_op`） | M3 |
| A4 | 余計な項目 | `AgentForkParams`・`AgentForkPreviewParams` は、`.strict()` にして、知らない項目（`sessionId`・`argv`・`args` など）を、**断る** | M4 |
| A5 | 注記の後始末 | 元の pane が閉じたときの掃除は、`GraphPaneCleanup`（ノードを消すのと、同じ更新の中で、その鍵を指す `forkedFrom` を消す）。`rekey_node` では、`forkedFrom` も、新しい鍵へ付け替える。`reconcileGraph` には、足さない。ノードが、`reconcileGraph` で作り直されることは無い（位置を直すだけ）が、注記を落とさないことを、テストで確かめる | M5 |
| A6 | ブランチ名が、既にあるとき | **断る**（`fork_branch_exists`）。`agent.fork_preview` が、`branchExists` を返し、ダイアログでは、確定を押せなくする | M6 |
| A7 | 偽の会話の id | サーバは、`pane.agentSession` の id を、**UUID の形のときだけ**使う（Claude Code は、名前や絶対のパスでの指定も許すが、fork では通さない）。これで、コマンドの行への注入は、起きない。残るのは、「pane の中のプログラムが、偽の報告で、**同じ利用者の、別の会話**を fork させる」ことで、同じ OS の利用者のプログラムは信頼する、という今の前提の中（文書に書く） | S1 |
| A8 | 最初の知らせ | fork した直後に、Claude Code が、確認（初めてのフォルダの信頼 など）で止まることがある（`blocked`）。**知らせは、「送る予定」として持ち、エージェントの手が空いた時点で送る**（上限 10 分。利用者が、確認に答えた後に、届く）。その間、画面に「最初の知らせを、まだ送っていません（エージェントが、確認を待っています）」と出す。結果・進み具合に、`noteStatus`（`sent`・`pending`・`timed_out`・`skipped`）。文面に埋めるフォルダのパスは、制御文字・改行を含むなら、知らせを送らない（`skipped`。理由つき） | S2・S3 |
| A9 | 同じフォルダの fork | 分割の向きは、元の pane の、広いほうの辺。新しい pane の、開く場所は、元の pane の、いまの場所（分からなければ、workspace の場所） | S4 |
| A10 | 新しい worktree の「元のフォルダ」 | 元の workspace の、リポジトリの根。元の pane が、その下のサブフォルダにいても、新しい workspace は、worktree の根で開く。知らせの文面には、根どうしを書く | S5 |
| A11 | 途中の失敗で、残すもの | 手順ごとに決める（`doccheck.md` S6 の表を、そのまま採る）。作った pane・workspace・worktree は、消さずに残し、結果に、何が残ったかを返す | S6 |
| A12 | グラフの注記の入れ方 | `GraphOp` は、足さない。サーバの内部の更新（`store.update` に渡す関数）で、ノードに `forkedFrom` を書く。`applyGraphOps`・`validateGraph` は、`forkedFrom` を、そのまま通す（指す先が無くても、壊れたファイルにしない）。古い版のサーバは、項目を落として読み、書き直すと、注記が消える（線が見えなくなるだけ。文書に書く） | S7 |
| A13 | 実物での確かめを、先に | タスクの最初に、実際の Claude Code での確かめ（スパイク）を置く | S2・S10 |

### 要件の読み替え

- AC5 の「画面からと、`sodactl`（ログイン済み）から使える」は、「`/ws` の認証済みの接続から使える」。
- AC3 の「起動した後、最初の知らせを 1 回送る」は、A8 のとおり（確認で止まっている間は、送らず、手が空いたら送る）。
- AC7 に、`fork_branch_exists`・`fork_shell_not_ready` を足す。
