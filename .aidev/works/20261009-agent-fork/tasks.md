# タスク: エージェントの fork

`design.md`（**末尾の追補 01 が優先**）と、点検の全文 `doccheck.md` に従う。★ = タスクごとの独立点検。

## PR1: サーバと `sodactl`

- [x] T0: 実物での確かめ（スパイク。**最初に行う**。製品のコードは、まだ変えない）。実際の Claude Code（この開発機の版）で、短い会話を使って: (1) **対話中の、実際のセッション**を、別の端末から `claude --resume <id> --fork-session` で fork できるか (2) 初めてのフォルダ（新しい worktree）で fork したとき、信頼などの確認が出るか・出たときの画面の判定（`blocked` か）(3) fork した直後に、`idle` と判定されるのは、会話の読み込みが終わった後か（長めの会話で）(4) `/clear` の後、`SessionStart`（`source: clear`）で、会話の id が替わるか・Sodashitsu のフック（`matcher`）は、それを拾うか。結果を `research.md` に追記する。**結果が、設計（追補 01 の A8 ほか）と食い違うときは、止めて報告する。** 費用は最小に（3〜4 回の実行）。利用者の設定・既存の会話は、書き換えない。
      依存: なし
      AC: AC2, AC3
- [x] T0b: フックの matcher を `startup|resume|fork|clear|compact` に（決定 B1〜B6。`decisions.md`）。インストーラのテスト・結合テスト・`docs/verification.md`。導入済みの人は「更新が必要」になる。
      依存: T0
      AC: AC1（孫の fork）
- [x] T1: サーバの待ちの関数と、`agent.fork_preview`。エージェントの検知・手が空くのを待つ関数（サーバの中のできごとを聞く。上限つき）。作ったばかりの pane が、入力を受けられるのを待つ関数（追補 01 A2）。`agent.fork_preview`（読み取りだけ: fork できるか・理由・コミットしていない変更の数〔`git status --porcelain`。上限 2 秒〕・作成先・ブランチ名が既にあるか）。`pane.sock` から呼べないこと。単体テスト。
      依存: T0b
      AC: AC1, AC3, AC7
- [x] T2: `agent.fork` の、同じフォルダ（**独立点検あり**）。`AgentForkRunner`（追補 01 A1）。元の pane の確かめ・会話の id を、サーバが引く（UUID の形だけ。A7）・`split`（A9）・入力を受けられるのを待つ（A2）・起動（固定の表と、既存の引用の関数。`--resume <id> --fork-session`）・進み具合のできごと。`.strict()` の入力（A4。`sessionId`・`argv`・`args` を付けると、断られる）。偽の `claude`（引数を記録して、フックの報告を真似るスクリプト）での結合テスト（起動の引数が、期待どおり・元の pane は、そのまま・同じ pane を 2 回続けて fork・元の pane が、途中で閉じた）。
      依存: T1
      AC: AC2, AC5, AC7
- [x] T3: `agent.fork` の、新しい worktree と、最初の知らせ（**独立点検あり**）。ブランチ名が既にあれば断る（A6）→ `worktree.create` → `workspace.create`（A10）→ 起動 → 最初の知らせ（A8: 送る予定として持ち、手が空いたら送る。上限 10 分。`noteStatus`）。手順ごとの失敗で、何が残るか（A11）。パスに制御文字があるときは、送らない。結合テスト。
      依存: T2
      AC: AC3, AC7
- [x] T4: グラフの注記（**独立点検あり**）。`GraphNode.forkedFrom`（省ける項目）。サーバの内部の更新で書く（`GraphOp` は足さない。A12）。`GraphPaneCleanup` の掃除と、`rekey_node` の付け替え（A5）。**この変更の前の `GraphSchema`・`validateGraph` で、`forkedFrom` のあるファイルが、読める**（退避されない）ことのテスト。`sodactl graph show --json`。
      依存: T2
      AC: AC4
- [x] T5: `sodactl agent fork`（既定で、最後まで待つ。`--no-wait`・`--worktree`・`--no-note`・`--json`）・文書（`docs/agent-fork.md`・`docs/sodactl.md`・`docs/agent-graph.md`・`AGENTS.md`）。実物の Claude Code で、通しの確かめ（同じフォルダと、新しい worktree を、1 回ずつ）。`pnpm build`・`typecheck`・`pnpm test`（負荷が低いときに）・起動確認。
      依存: T3, T4
      AC: AC6, AC8

## PR2: 画面

- [ ] T6: メニューの項目と、ダイアログ（`AgentForkDialog.vue`）。pane の右クリックのメニュー・グラフのノードのメニュー。fork できないときの、押せない項目と理由。ダイアログ（行き先・ブランチ名〔既にあれば、確定を押せない〕・作成先・注意・最初の知らせ）。進み具合と、「最初の知らせを、まだ送っていません」の表示。E2E（偽の `claude` で）。
      依存: T5
      AC: AC1, AC2, AC3
- [ ] T7: グラフの「fork」の線（見るだけ）。別の空間のときの印。E2E・絵。クラシックの基本画面が、メニューの項目のほかは、変わらないこと（比べる道具）。
      依存: T6
      AC: AC4, AC8
