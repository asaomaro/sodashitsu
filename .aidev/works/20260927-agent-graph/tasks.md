# タスク: agent-graph — 親（split 判定と割れ目）

## 実装方針

split 判定: **subtask 分割する**。グラフの型・保存・実行の仕組み・画面・別のマシン・sodactl は相互に依存し（画面と sodactl はサーバの方式と実行が無いと検証できない）、単独ではデリバリできないが、規模が大きく漸進的に点検する価値がある。
割れ目は `architecture.md`「tasks への申し送り」の 5 つ。各 subtask の詳細な `tasks.md` はその subtask の tasks 工程で作る。

| subtask | 担う範囲 | 主な AC |
|---|---|---|
| `01-graph-core` | protocol の型と方式・client-core/graph（検証・既定値・文面・座標）・`GraphStore`（`stale` を含む）・`graph.*` の方式（実行なし）・`open_graph` の操作表と端末版の知らせ | AC13, AC16, AC18, AC19 |
| `02-engine-local` | `TriggerState`・`SupervisorNotifier`・`AgentPort`・`LocalAgentPort`・`GraphEngine`（手元の pane）・履歴・上限・一時停止 | AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12 |
| `03-web-graph` | グラフ画面（表示・配置・線の作成と設定・削除・一時停止・履歴・接続モード・モバイルの閲覧）と入口 | AC1, AC2, AC3, AC10, AC12, AC16, AC20, AC-I1〜AC-I5 |
| `04-remote` | `RemoteLinks`・`RemoteAgentPort`・別のマシンのノード（チェックリスト・呼び名）・切断中の見送り | AC14 |
| `05-cli-docs` | `sodactl graph …`・SKILL.md・docs・性能（16 ノード・32 線・発火までの時間）の測定 | AC15, AC17 |

## 作業順序と依存関係

- 01 → 02 → 03 → 04 → 05 の直列（各 subtask の `dependsOn` に前の兄弟）。03 は 01 だけでも作り始められるが、実行の表示（`graph.fired`）の確認に 02 が要るので 02 の後に置く。04 は `AgentPort`（02）の上に載る。

## リスク / 留意点

- 「1 回だけ」の判定（`TriggerState`）が最大のリスク。純粋な状態機械にして変化の列の試験と変異の網羅で押さえる。
- 操作表に `open_graph` を足すと、端末版の網羅（`satisfies never`）と件数の試験（web・client-core・tui）が壊れる。01 で一緒に直す。
- サーバが client-core に依存するのは新しい向き（04）。ビルドの順序（client-core → server）を確かめる。

## テスト方針

- 各 subtask: vitest。サーバは `composeServer.*.integration.test.ts` の形で実物のサーバを起動し、偽のエージェント（既存の試験の形）で状態を変えて、線が 1 回だけ動くこと・待ち・見送り・上限・一時停止・再起動後の復元を確かめる。
- web は happy-dom＋@vue/test-utils。座標は純関数（client-core/graph）で試験する。
- 親の統合 test: 実物のサーバ＋ブラウザ相当のクライアント＋sodactl で、線を作る → 元のエージェント（偽）が完了 → 先へ送られる → 履歴・回数、を一巡。E2E（ブラウザ）は依頼が無いので回さない。

## タスク

各 subtask の `tasks.md` に置く（親ではチェックリストを持たない）。
