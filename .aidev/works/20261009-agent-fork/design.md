# 設計: エージェントの fork

要件は `requirements.md`、調査は `research.md`（実測の手順と出力。**実装のときは、該当の節を読む**）。

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
