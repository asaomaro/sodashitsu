# タスク: 04-remote（別のマシンのノード）

## 実装方針

architecture「別のマシン」と design D-5 のとおり、グラフに載っているマシンごとに 1 本、`MachineManager.route(id).link.openChannel()` の `LinkChannel` を `WebSocketLike` に合わせる adapter の上に client-core の `Connection`（hello は `external`）を張る（`graph/RemoteLinks.ts`）。その上に `RemoteAgentPort`（`AgentPort` の実装）を置き、`GraphEngine` はノードの鍵のマシンの部分で口を選ぶ（02 で `machine_unavailable` にしていた分岐を置き換える）。
web は、チェックリストのマシンの節と別のマシンのノードの呼び名を足す（03 の申し送り）。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- server → client-core の依存（01 で既に足した）の上で `Connection` をサーバの中で使う。Node の WebSocket でなく `LinkChannel` の adapter。
- 繋がった直後の snapshot は「基準」として流すだけ（切れている間の完了で動かない。D1-6）。切れている間の発火は `skipped/machine_unavailable`。
- リモートの画面の末尾は SNAPSHOT を 1 回受けて末尾を切り出す（`pane.subscribe` → SNAPSHOT → `pane.unsubscribe`。`packages/cli/src/commands/agent.ts:169-184`）。行数の上限 500・タイムアウト 5 秒（architecture の申し送り）。
- 02 の「作業中とみなす」・送信中の印・終了の順序（エンジンを止め → リンクを閉じ → `graph.close()`）をリモートでも保つ。
- 監督の知らせのリモートの配下の表示はマシンの呼び名（02 の懸念 3）。

## テスト方針

- adapter と `RemoteAgentPort` は偽の `LinkChannel` で単体試験（hello・購読・snapshot の基準・切断と再接続・prompt・tail のタイムアウト）。
- 実物のサーバ 2 台（既存の `machines.integration.test.ts` の形）で、手元のノード → リモートのノードの線が 1 回だけ動くこと・切断中の見送り・再接続後に古い完了で動かないこと。
- web は happy-dom の部品の試験。E2E は回さない。

## タスク

- [ ] T1: `LinkChannel` → `WebSocketLike` の adapter と `graph/RemoteLinks.ts`（載っているマシンだけ開き、外れたら閉じる・可用性の通知・終了で閉じる）
      対象: `packages/server/src/machine/MachineLink.ts:359`（openChannel）・`packages/server/src/machine/MachineRelay.ts:45-49`（手本）・`packages/client-core/src/net/Connection.ts`・（新規 `packages/server/src/graph/RemoteLinks.ts`）
      依存: なし
      AC: AC14
- [ ] T2: `graph/RemoteAgentPort.ts`（状態の購読・snapshot の基準・`tail`〔SNAPSHOT の末尾・500 行・5 秒〕・`prompt`・`paneName`）
      対象: `packages/server/src/graph/AgentPort.ts`・`packages/cli/src/commands/agent.ts:169-184`（手本）・（新規 `RemoteAgentPort.ts`）
      依存: T1
      AC: AC14, AC6
- [ ] T3: `GraphEngine` の口の選択をリモートに広げる（`machine_unavailable` の分岐の置き換え・可用性の変化・監督の知らせのマシンの呼び名）と `composeServer` の配線（開始・handoff・終了の順）
      対象: `packages/server/src/graph/GraphEngine.ts:34,91-93,234,499`・`packages/server/src/composeServer.ts`
      依存: T2
      AC: AC14, AC7, AC8, AC9
- [ ] T4: web のチェックリストのマシンの節・別のマシンのノードの呼び名とマシンの表示・選び直しの候補に別のマシンの pane・別のマシンのノードから pane への移動
      対象: `packages/web/src/components/graph/PaneChecklist.vue:52-98`・`packages/web/src/components/graph/GraphNode.vue`・`packages/web/src/components/graph/RekeyPicker.vue`・`packages/web/src/store/machines.ts`
      依存: なし
      AC: AC14, AC1
- [ ] T5: 実物のサーバ 2 台の結合試験（手元 → リモートの線・リモート → 手元の線・切断中の見送り・再接続後の基準・監督役がリモート）
      対象: `packages/server/src/machine/machines.integration.test.ts`（手本）・（新規 `packages/server/src/graph/remote.integration.test.ts`）
      依存: T3
      AC: AC14
