# タスク: エージェントが起動したエージェントを連携のグラフに自動で載せる

## 実装方針

design.md のとおり、下から積む。(1) プロトコルに省略可能な `callerPaneId` を足す → (2) sodactl が確認できたときだけ送る → (3) サーバの `AgentLineage` の状態と購読 → (4) グラフへ足す処理（`attach`）→
(5) ハンドラと `composeServer` に配線する → (6) 実物の結合試験（実 PTY の偽 `claude` の検出）で通す → (7) 文書。`GraphEngine`・web は触らない。
各タスクの完了で `pnpm typecheck` と該当パッケージのテストが通ること。回帰テストは `regression-negative-control` に従い、実装を一時的に壊して落ちることを確かめる。

**全タスク共通**: 回帰テストを足したら、実装の該当行を一時的に壊してそのテストが落ちることを確かめ（`regression-negative-control`）、`review.md` の点検ログに残す。`AgentLineage` に `fs`・`/proc`・`pane.sock` への依存を持ち込まない（Windows の要件。レビューで import を見る）。

## チェックリスト

- [x] T1: プロトコル——`WorkspaceCreateParams`・`TabCreateParams`・`PaneSplitParams`・`AgentStartParams` に省略可能な `callerPaneId`（`paneId` と同じ形）を足す。単体テストで、項目あり・なし・空文字（`invalid_params`）と、**未知の項目を持つ旧形・新形が `strict` でないスキーマで無視されること**（古いサーバ相当）を見る
      対象: `packages/protocol/src/messages.ts:16`（`paneId`）、`:148`（`WorkspaceCreateParams`）、`:221`（`TabCreateParams`）、`:249`（`PaneSplitParams`）、`:727`（`AgentStartParams`）、既存の `messages` のテストの隣
      依存: なし
      AC: AC13
- [x] T2: sodactl——4 コマンドが同じ分岐になるので、`selfGuard.ts` に共通の `callerPaneParam(opts)`（`selfPaneId(opts)` が確認できたときだけ `{callerPaneId}`、無ければ空）を足し、`pane split`・`workspace create`・`tab create`・`agent start` の要求に展開する（`agent start` で対象の `paneId` と取り違えない）。`--machine`・`SODA_PANE_ID` なし・接続先が違うときは送らないことを、偽サーバの要求で見る単体テスト。`selfPaneId` が undefined でも送るよう壊して落ちることを確かめる
      対象: `packages/cli/src/selfGuard.ts:39` `selfPaneId`、`packages/cli/src/cliArgs.ts:354, 1020-1026`（caller の作成と破棄）、`packages/cli/src/commands/pane.ts`（`pane split` が `PaneSplitParams` を作る箇所）、`workspace.ts:27`（`workspace.create`）、`tab.ts:20`（`tab.create`）、`agentStart.ts:38`（`agent.start`）
      依存: T1
      AC: AC4, AC13
- [x] T3: `AgentLineage`（新規）の状態と購読——`noteCreated`・`noteStarted`（`started` が `created` に勝つ）・`forgetStart(paneId, callerPaneId)`（その親の記録だけ消す）・`close`、`pane.agent_status_changed`（`agent !== null`・`attempted` に無い・親が分かる）で pane ごとに 1 回だけ `queueMicrotask` で `attach` を呼ぶ、`pane.closed` で 3 つの記録から消す、購読の入口の try/catch。`attach` は差し替えられる関数として受ける。偽 bus の単体テスト（`AgentLineage.test.ts`）: 親の決まり方（AC3）・1 回だけ（再検出・入れ替わり）・呼び出し元なしで何もしない（AC4）・検出前に閉じる（AC10）・同期に例外を投げる購読者がいても他が動く。`attempted` を外す／`started` を優先しない／`pane.closed` で消さないよう壊して落ちることを確かめる
      対象: `packages/server/src/graph/AgentLineage.ts`（新規）、手本は `packages/server/src/graph/GraphEngine.test.ts` の偽 bus、`packages/server/src/graph/LocalAgentPort.ts:34`（`bus.subscribe` と `pane.closed`）、`packages/server/src/session/SessionService.ts:1060`（`pane.agent_status_changed`）
      依存: T1
      AC: AC1, AC2, AC3, AC4, AC10, AC11
- [x] T4: `attach`——`store.get()` から ops を組む: `addMissingNodeOps(g, [親, 子])`、親または子のノードが `stale` なら足さない（`parent_stale`／`child_stale`）、`supervise` と `approval`（`defaultApprovalConfig()`・`LINK_LIMIT_DEFAULT` を import）。重複・同じ kind と from の別の監督役・逆向きの線はその線だけ外す、追加後のノード 64・線 128 の超過は何も足さない、ops が空なら `update` を呼ばない、`GraphRevConflictError` は `get()` からやり直して最大 3 回、`GraphInvalidError` はログ、ログの reason 全種（`parent_gone`・`parent_stale`・`child_stale`・`reverse_link`・`duplicate_link`・`supervisor_taken`・`too_many_nodes`・`too_many_links`・`conflict`・`invalid`）を、偽 store の単体テスト（`AgentLineage.attach.test.ts`）で 1 種ずつ見る。重複判定・上限の判定・逆向きの判定・再試行を壊して落ちることを確かめる
      対象: `packages/server/src/graph/AgentLineage.ts`（T3 の続き）、`packages/client-core/src/graph/ops.ts:147` `addMissingNodeOps`、`validate.ts`（`duplicate_link`・`supervisor_taken`・`too_many_*` の条件）、`defaults.ts`（`defaultApprovalConfig`・`LINK_LIMIT_DEFAULT`）、`packages/server/src/persist/GraphStore.ts:30, 41, 135, 140`
      依存: T3
      AC: AC1, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12
- [x] T5: 配線——`pane.split`・`workspace.create`・`tab.create` のハンドラが結果の `pane.id` で `noteCreated`、`agent.start` は `starter.start` の `onAccepted` の中で `noteStarted`（`writeModal` の失敗で `forgetStart`）、`MethodDeps` に `lineage` を足し、`composeServer` で `registerAllMethods` の前（graph の構築の後）に構築して、停止の並び（`graphEngine.stop()` の隣）で `close`。handoff の `pausePollers` では止めない（購読だけでメモリの記録は引き継ぎで消える。design「引き継ぎ」）。ハンドラの単体テスト: `callerPaneId` なし・実在しない・対象と同じは何もしない／拒否された `agent start`（`agent_pane_busy`）は記録しない。`onAccepted` の外で呼ぶ／`forgetStart` を外すよう壊して落ちることを確かめる。`pane.sock` の操作の登録（`PaneOpRegistry`）にこれらが載っていないことを既存のテストへ 1 行足して見る
      対象: `packages/server/src/surface/methods/pane.ts:23`、`workspace.ts:14`、`tab.ts:6`、`agent.ts:137`、`methods/deps.ts`、`packages/server/src/composeServer.ts:359-400`（graph の構築）、`:729`・`:756`・`:776`（停止の並び。`graphEngine.stop()`〜`graph.close()`）、`packages/server/src/agent/AgentStarter.ts:62-63, 115`、`packages/server/src/panesocket/`（`askOp.ts`・登録の既存テスト）
      依存: T3, T4
      AC: AC1, AC3, AC4, AC11, AC13
- [ ] T6: 結合試験——実物の `composeServer` で、`callerPaneId` つきの `pane.split` → 偽の `claude` を実 PTY で検出 → `graph.get` に子と親のノード・監督・承認の線が出て、`graph.changed` が配信され rev が 1 進む。`agent start` 経由・打ち込み経由・`workspace.create` 経由／手で置いたノードの位置・設定が変わらない（AC8）／手動で外した子は戻らず、外した親は次の子で戻る（AC7）／親 pane を閉じてから子を検出すると何も足さない（AC10）／上限／別の監督役／旧形の params（`callerPaneId` なし）が従来どおり動く。sodactl の結合（`runAgentStart` に `SODA_PANE_ID` を設定）を 1 本。`attempted` を外す／`queueMicrotask` を同期に変えるよう壊して落ちる（または意味のある差が出る）ことを確かめる
      対象: `packages/server/src/composeServer.graph.integration.test.ts`、`packages/cli/src/agentStart.integration.test.ts`（偽 `claude` の実検出の手本）、`packages/cli/src/graph.integration.test.ts`
      依存: T2, T5
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13
- [ ] T7: 文書——`docs/agent-graph.md`（自動で載る条件・載らない条件・外し方・上限・引き継ぎ・Windows）、`docs/sodactl.md`（`callerPaneId` を送る条件）、`packages/cli/skills/sodactl/SKILL.md`、`docs/verification.md`（「共通：エージェントが起動したエージェントの自動載せ」の節を新設し実機の手順を書く）。`AGENTS.md` の索引は変えない
      対象: `docs/agent-graph.md`「pane を載せる（ノード）」、`docs/sodactl.md`「呼び出し元の pane を対象にする」、`packages/cli/skills/sodactl/SKILL.md`、`packages/cli/skills/sodactl/skill.test.ts`（skill と docs の一致の検査）、`docs/verification.md`（「共通：…」の形式の節）
      依存: T6
      AC: AC14
