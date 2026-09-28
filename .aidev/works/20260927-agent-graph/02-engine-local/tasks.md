# タスク: 02-engine-local（手元の pane での実行）

## 実装方針

architecture の `TriggerState`（純粋な状態機械）・`SupervisorNotifier`（純粋）・`AgentPort`/`LocalAgentPort`・`GraphEngine`（配線・タイマー・履歴）を `packages/server/src/graph/` に作る。
送信は `ControlSurface.invoke({clientId:"graph"}, "agent.prompt", …)`、材料は `mirror.bottomLines(n)`（design D-2）。別のマシンのノードは 04 まで `skipped/machine_unavailable`（`AgentPort` を選べないため）。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- 「1 回だけ」の判定が最大のリスク（親 tasks）。`TriggerState` は時刻を入力に取り、変化の列を与えて決定を確かめる試験で網羅し、負の確認は行・記号ごとの変異の網羅で行う（規約 regression-negative-control・memory の変異の網羅）。
- instanceId が変わった直後の値は「基準」として覚えるだけ（再起動・再検出で completionSeq が 0 に戻る）。起動直後の最初の状態も基準。
- 待ちのタイマーと終了: 終了では待ちを取り消し（履歴に残さない）、`GraphStore.close()` の後に書かない。01 の未検証（`composeServer` の終了で `close()` を呼ぶ行）をここで試験する。
- 購読者は try/catch（ひとつの線の失敗で他を止めない。research F3.3）。

## テスト方針

- `TriggerState`・`SupervisorNotifier`: 純粋な単体試験（変化の列 → 決定）。変異の網羅の負の確認を test-result に残す。
- `GraphEngine`: 偽の `AgentPort`・偽の時計で単体試験（待ち・置き換え・30 分・上限での一時停止・一時停止中の見送り・stale・履歴 50 件・`graph.fired`）。
- 実物のサーバの結合試験（`composeServer.*.integration.test.ts` の形・偽のエージェントの状態の変化）: 線を作る → 元が完了 → 先へ 1 回送られる → 履歴・回数・`graph.history`。

## タスク

- [ ] T1: `graph/TriggerState.ts`（線ごとの状態機械。完了の鍵 `(instanceId, completionSeq)`・承認待ち 1 秒・whenBusy wait/skip・待ちの置き換え・30 分・一時停止・上限・先の不在/blocked）
      対象: （新規 `packages/server/src/graph/TriggerState.ts`）・`packages/client-core/src/graph/defaults.ts`（既定値）
      依存: なし
      AC: AC4, AC5, AC11, AC12
- [ ] T2: `graph/SupervisorNotifier.ts`（監督の知らせの印・2 秒のまとめ・手が空いたら送る決定、承認の代理 delegate/notify の文面の選択）
      対象: （新規 `packages/server/src/graph/SupervisorNotifier.ts`）・`packages/client-core/src/graph/message.ts`
      依存: なし
      AC: AC7, AC8, AC9
- [ ] T3: `graph/AgentPort.ts`・`graph/LocalAgentPort.ts`（`pane.agent_status_changed` の購読・今の状態・`bottomLines` の末尾〔制御文字を除く〕・`agent.prompt`）
      対象: `packages/server/src/session/SessionService.ts:1051,1079`（イベント）・`packages/server/src/terminal/Mirror.ts:195`（bottomLines）・`packages/server/src/surface/methods/agent.ts`（agent.prompt）・（新規 `graph/AgentPort.ts`・`graph/LocalAgentPort.ts`）
      依存: なし
      AC: AC4, AC6
- [ ] T4: `graph/GraphEngine.ts`（GraphStore の変化で対象を更新・決定の実行・count と上限での `paused:"limit"`・履歴〔線ごと直近 50 件・メモリ〕・`graph.fired`・1 秒の見回り・終了での取り消し）と `graph.history`・`composeServer` の配線（`agentMonitor.start()` の前に始め、終了で止めてから `graph.close()`）
      対象: `packages/server/src/surface/methods/graph.ts:43`・`packages/server/src/composeServer.ts:296-316,506-569,648-649`・（新規 `graph/GraphEngine.ts`）
      依存: T1, T2, T3
      AC: AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12
- [ ] T5: 実物のサーバの結合試験（トリガ 1 回・待ち・見送りの理由・受け渡しの行・監督の知らせ・承認の代理・上限・一時停止・stale のノードは動かない・終了後に graph.json を書かない）
      対象: （新規 `packages/server/src/composeServer.graph.integration.test.ts`）
      依存: T4
      AC: AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12
