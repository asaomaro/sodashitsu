# タスク: 05-cli-docs（sodactl graph・docs・性能の測定）

## 実装方針

`sodactl graph …` を既存のコマンドの形（`packages/cli/src/cliArgs.ts` の解析・`commands/*.ts`・`withSession`・`output.ts` の表と JSON）で足し、`graph.get|update|pause|resume|history` を呼ぶ。線・ノードの組み立てと検証は client-core/graph（ops・validate・defaults）を使い、画面と同じ規則にする。
`sodactl skill`（`packages/cli/src/skill.ts`）と docs に連携の使い方を書く。性能（16 ノード・32 線の描画、状態の変化から発火までの時間）を試験で測って記録する（AC17）。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- 別のマシンの pane を指す線は `--machine <名前>` の既存の書き方にそろえる（ノードの鍵は `<machineId>:<paneId>`。名前から id を引く）。
- `rev_conflict` は最新を取り直して 1 回だけ送り直し、それでも衝突したら終了コード非 0。
- 無効なノードの選び直し（`rekey_node`）を足す（decisions D6-9 の申し送り）。
- 操作の結果は画面へ即座に反映される（`graph.changed`）。既存の web の試験で担保済みなので、05 ではサーバの結合試験で `graph.changed` が出ることを確かめる。

## テスト方針

- cli の引数の解析と出力の単体試験（既存の `cliArgs.test.ts`・`output.test.ts` の形）。
- 実物のサーバの結合試験（`agent.integration.test.ts` の形）: 線の作成 → 一覧 → 一時停止 → 再開 → 削除・全体の一時停止/再開・ノードの追加と選び直し・履歴、`rev_conflict` の送り直し。
- 性能: server の実物の `GraphEngine` で 16 ノード・32 線、状態の変化から `agent.prompt` までの時間を測る試験（2 秒以内）。web は 16 ノード・32 線の描画の時間を happy-dom で測る（目安の記録）。

## タスク

- [x] T1: `sodactl graph` の引数の解析（`show`・`link add|set|rm|pause|resume`・`pause`・`resume`・`node add|rm|rekey`・`history`、`--machine`・`--json`）と出力
      対象: `packages/cli/src/cliArgs.ts`・`packages/cli/src/output.ts`・（新規 `packages/cli/src/commands/graph.ts`）・`packages/client-core/src/graph/ops.ts`
      依存: なし
      AC: AC15
- [x] T2: `sodactl graph` の実行（`withSession` で `graph.*` を呼ぶ・`rev_conflict` の送り直し・終了コード）と実物のサーバの結合試験
      対象: `packages/cli/src/main.ts`・`packages/cli/src/withSession.ts`・`packages/cli/src/commands/graph.ts`・（新規 `packages/cli/src/graph.integration.test.ts`）
      依存: T1
      AC: AC15, AC16
- [ ] T3: `sodactl skill` に連携の使い方（監督役が読む前提。線の作り方・監督・承認の代理・上限・一時停止）
      対象: `packages/cli/src/skill.ts`・`packages/cli/src/skill.test.ts`
      依存: T1
      AC: AC15, AC7
- [ ] T4: docs（新規 `docs/agent-graph.md`〔画面の操作とキー・線の種類・待ちと見送り・上限・一時停止・履歴はメモリで再起動で消える・受け渡しはプロンプト注入になりうる・別のマシン・無効なノード〕、`docs/sodactl.md`・`docs/tui.md`〔端末版はブラウザで開けますと知らせる〕・`docs/machines.md`・`docs/verification.md`〔実機の確認の手順〕・`docs/herdr-parity.md`・`AGENTS.md` の docs の案内）
      対象: `docs/sodactl.md`・`docs/tui.md`・`docs/machines.md`・`docs/verification.md`・`docs/herdr-parity.md`・`AGENTS.md`・（新規 `docs/agent-graph.md`）
      依存: T2, T3
      AC: AC15, AC10
- [ ] T5: 性能の測定（16 ノード・32 線。状態の変化から送信までの時間をサーバの試験で測り 2 秒以内を確かめる・web の描画の時間の記録）と結果の記録
      対象: `packages/server/src/graph/GraphEngine.ts`・（新規 `packages/server/src/graph/perf.integration.test.ts`・`packages/web/src/components/graph/GraphView.perf.test.ts`）
      依存: なし
      AC: AC17
