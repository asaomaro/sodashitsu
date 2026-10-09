# タスク: エージェントの fork

`design.md` の PR の分け方に従う。★ = タスクごとの独立点検。実際の Claude Code を起動する確かめは、費用がかかるので、**結合テストは、偽の `claude`（引数を記録して、フックの報告を真似るスクリプト）で行い、実物での確かめは、最後に 1〜2 回**（短い会話で）。

## PR1: サーバと `sodactl`

- [ ] T1: `agent.fork_preview`（読み取りだけ）。fork できるか・理由・コミットしていない変更の数（`git status --porcelain`。上限 2 秒）・作成先。接続の種類の検査。単体テスト。
      依存: なし
      AC: AC1, AC3
- [ ] T2: `agent.fork` の、同じフォルダ（**独立点検あり**）。元の pane の確かめ・会話の id を、サーバが引く（UUID の形だけ）・`split`・起動（`agent.start` の中の処理に、`--resume <id> --fork-session`。固定の表と、既存の引用の関数）・検知を待つ。ブラウザ・`sodactl` から、会話の id やコマンドの文字列を、差し込めないこと（方式の入力に、余計な項目を足しても、断られる）。偽の `claude` での結合テスト（起動の引数が、期待どおり・元の pane は、そのまま）。
      依存: T1
      AC: AC2, AC5, AC7
- [ ] T3: `agent.fork` の、新しい worktree と、最初の知らせ（**独立点検あり**）。`worktree.create` → `workspace.create` → 起動 → 手が空くのを待って、知らせを送る（上限 60 秒。切れたら送らない）。手順ごとの失敗（ブランチ名の重複・起動の失敗・待ちの時間切れ）で、何が残るかを、結果に返す。結合テスト。
      依存: T2
      AC: AC3, AC7
- [ ] T4: グラフの注記（**独立点検あり**）。`GraphNode.forkedFrom`・内部の更新 `set_node_note`（利用者の `graph.update` からは断る）・`reconcileGraph` の掃除・`AgentLineage` が、fork に自動の線を付けない。**古い `GraphSchema`（この変更の前の版）で、`forkedFrom` のあるファイルが、読める**ことのテスト（退避されない）。`sodactl graph show --json`。
      依存: T2
      AC: AC4
- [ ] T5: `sodactl agent fork`・文書（`docs/agent-fork.md`・`docs/sodactl.md`・`docs/agent-graph.md`・`AGENTS.md`）。実物の Claude Code での確かめ（1〜2 回。対話中の実際のセッションを fork できるか——`research.md` の残りの問い）。`pnpm build`・`typecheck`・`pnpm test`。
      依存: T3, T4
      AC: AC6, AC8

## PR2: 画面

- [ ] T6: メニューの項目と、ダイアログ（`AgentForkDialog.vue`）。pane の右クリックのメニュー・グラフのノードのメニュー。fork できないときの、押せない項目と理由。ダイアログ（行き先・ブランチ名・作成先・注意・最初の知らせ）。E2E（偽の `claude` で）。
      依存: T5
      AC: AC1, AC2, AC3
- [ ] T7: グラフの「fork」の線（見るだけ）。別の空間のときの印。E2E・絵。クラシックの基本画面が、メニューの項目のほかは、変わらないこと（比べる道具）。
      依存: T6
      AC: AC4, AC8
