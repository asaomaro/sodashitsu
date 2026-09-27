# タスク: 複数ホストの集約（保存した SSH のマシン）

## 実装方針

architecture.md「tasks への申し送り」の順に、下の層（protocol・枠・受け口）から積む。サーバ側は偽の子プロセス（Duplex の対）と、2 つの `composeServer` を同じプロセスで起こす結合テストで確かめ、
ブラウザ側は既存の部品に口（`retarget`・`disposeAll`・scope・reset）を足してから、マシンのストア・軽い接続・切り替え・サイドバーを載せる。ビルドした成果物の通し（本物の子の `ssh`〔偽の
スクリプト〕→ `wtm bridge` → `bridge.sock`）は smoke で見る。

## 作業順序と依存関係

- 下の `依存:` に従う。2 つ目の `WsGateway` は T3 の結合テストで先に確かめ、T8（中継と配線の結合テスト）が多重化と upgrade の分岐を実物で確かめる最初の地点なので、web に入る前に通す。

## リスク / 留意点

- 2 つの `composeServer` を同じプロセスで起こす結合テストは pane のシェルを実際に起動する。1 本ずつ・後始末を必ず行う（負荷をかけない）。
- `Connection.retarget` は既存の再接続の状態機械（detach・4401・rejected・origin の疑い）に割り込む。既存のテストを全部通すこと。
- サイドバーは既存の D&D・グループ・navigate の選択を持つ。マシンが無いときの描画を変えない（既存のテストがそのまま通る）。
- `prettier --write` は新しいファイルか HEAD で整形済みのものだけ。

## テスト方針

- 単体: 枠の codec（往復・分割受信・目印の読み飛ばし・上限・違反）、`/ws?machine=` の検証（400・404・503・401 の順）、登録簿（規則・読み書き・セレクタ）、ssh の引数、`MachineLink`（偽の子: HELLO・PING・失敗の分類・チャネル）、
  `MachineManager`（偽の Link・偽の時計: 状態・間隔・60 秒の規則・登録簿の反映）、`MachineRelay`（上限・code の消毒・通す種類）、`wtm machine`・`wtm bridge`（依存の差し替え）、
  cli の `--machine`、web の各口と `MachineSwitcher`（順序・後勝ち）・`MachineSummaryClient`・machines ストア・サイドバー（相互作用の AC）。
- 結合: 2 つの `composeServer`（リモート＝`bridge.sock` を待ち受け、手元＝登録簿と偽の spawn）で `/ws?machine=` の hello・workspace の作成・入出力・404/503/401、リモートを止めたときの状態。
- 負の確認（`.aidev/conventions/regression-negative-control.md`）: 安全の要（宛先の検証・`--`・`?machine=` の検証と認証の順・code の消毒・枠の上限・目印・切り替えの端末の破棄）を変異で壊し、テストが落ちることを生ログで確かめる。
- 起動確認: `machineSmoke.ts`（AC17）を `.aidev/config.yml` に足し `aidev smoke`。E2E・負荷試験はしない。

## タスク

- [x] T1: protocol に `MachineState`・`MachineStatus`・`machine.list`（params・result）・`machine.changed` を足し、スキーマのテストを足す
      対象: `packages/protocol/src/model.ts` `packages/protocol/src/messages.ts:502-619` `METHOD_SCHEMAS` `packages/protocol/src/events.ts:116-138` `ServerEvent` / 根拠: research A6
      依存: なし
      AC: AC7
- [x] T2: 中継の枠の codec（`bridgeFrames.ts`: 目印・9 バイトの見出し・7 種・上限・`BridgeFrameDecoder`）と単体テスト
      対象: `packages/server/src/machine/bridgeFrames.ts`（新規）
      依存: なし
      AC: AC4, AC12, AC14
- [x] T3: リモート側の受け口 `BridgeEndpoint`（`WsServer` 実装・0600・チャネル → `WsConnection`・PING/PONG・違反で切断）と、`composeServer` の配線（2 つ目の `WsGateway`・listen/close/closeClients）。結合テスト（socket に繋いで hello）
      対象: `packages/server/src/machine/BridgeEndpoint.ts`（新規）`packages/server/src/composeServer.ts:251-254,282-285,449-510` / 根拠: research A1, A2
      依存: T2
      AC: AC4
- [x] T4: `wtm bridge`（素通し・動いていなければ 3・Windows は 2）と `cliArgs`・`main.ts`・ヘルプ
      対象: `packages/server/src/machine/bridgeCommand.ts`（新規）`packages/server/src/cliArgs.ts` `parseArgs` `packages/server/src/main.ts:17-29,121-163` / 根拠: research A4
      依存: T3
      AC: AC4, AC16
- [x] T5: 規則 `machineRules`（`MachineProfile`・`targetProblem`・`labelProblem`。純粋）と登録簿 `MachineCatalog`（形・読み書き 0600・`resolveSelector`・`newMachineId`）と単体テスト
      対象: `packages/server/src/machine/machineRules.ts` `packages/server/src/machine/MachineCatalog.ts`（新規）`packages/server/src/persist/namedSession.ts:24-34` `packages/server/src/persist/atomicFile.ts` / 根拠: research A5
      依存: なし
      AC: AC3, AC6, AC12
- [x] T6: `sshArgs` と `MachineLink`（spawn・目印/HELLO 20 秒・PING 15 秒/45 秒・チャネル 64・番号を再利用しない・`MachineLink.pendingBytes` とチャネルごとの `pendingBytes`〔write の callback で減らす〕・stderr 8KiB・`classifyLinkFailure`）と単体テスト（偽の子）
      対象: `packages/server/src/machine/sshArgs.ts` `packages/server/src/machine/MachineLink.ts`（新規）
      依存: T2, T5
      AC: AC5, AC10, AC12, AC14
- [x] T7: `MachineManager`（登録簿の 1 秒の監視と反映・状態・繋ぎ直しの間隔・`route`・`onChanged`）と単体テスト（偽の Link・偽の時計）
      対象: `packages/server/src/machine/MachineManager.ts`（新規）
      依存: T5, T6
      AC: AC3, AC5, AC7, AC10, AC11, AC15
- [x] T8: `MachineRelay`・`WsServerWs` の `?machine=` の分岐（400・404・503・401 の単体テストを含む）・`machine.list` の方式・`composeServer` の配線（`MachineManager` の start/stop・`machine.changed`・internal の `machineSpawn`）と、2 つの `composeServer` の結合テスト
      対象: `packages/server/src/machine/MachineRelay.ts`（新規）`packages/server/src/ws/WsServerWs.ts:84-120` `packages/server/src/surface/methods/deps.ts` `packages/server/src/surface/methods/machines.ts`（新規・`machine.list`）`packages/server/src/surface/methods/index.ts` `packages/server/src/composeServer.ts` / 根拠: research A2, A3, A6
      依存: T1, T3, T7
      AC: AC5, AC6, AC7, AC11, AC14, AC15
- [x] T9: `wtm machine add/list/rename/enable/disable/remove`（確かめ・終了コード・出力）と `cliArgs`・`main.ts`・ヘルプ、単体テスト
      対象: `packages/server/src/machine/machineCommands.ts`（新規）`packages/server/src/cliArgs.ts` `packages/server/src/main.ts` / 根拠: research A4
      依存: T5, T6
      AC: AC1, AC2, AC3, AC16
- [x] T10: `wtmctl --machine`（前置きの解釈・`/ws?machine=`・404/503 の分類・`caller` を外す）・`USAGE_LINES`・`skills/wtmctl/SKILL.md`、単体テスト
      対象: `packages/cli/src/cliArgs.ts:188-260` `packages/cli/src/wsClient.ts:214-226` `packages/cli/src/withSession.ts` `packages/cli/src/output.ts:32-43` `packages/cli/skills/wtmctl/SKILL.md` / 根拠: research A10
      依存: T8
      AC: AC13, AC15, AC16
- [x] T11: web の土台: `Connection.retarget`・`TerminalRegistry.disposeAll`・`session.clear`・`view` の scope/`rememberView`/`forgetStoredView`/`resetForMachineSwitch`・`seen` の scope と `getSeenSeqIn`・`NotificationController.resetForMachineSwitch`・`StoreAdapter`（`resetBaseline`・`machine.changed`）と単体テスト
      対象: `packages/web/src/net/Connection.ts` `packages/web/src/term/TerminalRegistry.ts` `packages/web/src/store/session.ts` `packages/web/src/store/view.ts:18-30,314-334` `packages/web/src/store/seen.ts` `packages/web/src/notify/NotificationController.ts` `packages/web/src/store/StoreAdapter.ts` / 根拠: research A7, A8
      依存: T1
      AC: AC9, AC11
- [x] T12: web の `store/machines.ts`（一覧・選択・要約・折りたたみ）・`net/MachineSummaryClient.ts`・`net/machineUrl.ts` と単体テスト
      対象: `packages/web/src/store/machines.ts` `packages/web/src/net/MachineSummaryClient.ts` `packages/web/src/net/machineUrl.ts`（新規）
      依存: T1, T11
      AC: AC7, AC8, AC9, AC11, AC15
- [x] T13: web の `actions/MachineSwitcher.ts`（手順・世代の後勝ち・切れていれば何もしない）と `main.ts` の配線（一覧の出所・軽い接続の張り外し・選択の消失でローカルへ・`onOpened` の `workspace.focus`・session のボタンの抑止・モバイルの 1 列の画面ではマシンの機能を使わない・origin の疑いをローカルだけに）と単体テスト
      対象: `packages/web/src/actions/MachineSwitcher.ts`（新規）`packages/web/src/main.ts` `packages/web/src/actions/ActionDispatcher.ts:243-259` `packages/web/src/injection.ts` / 根拠: research A7
      依存: T11, T12
      AC: AC9, AC11, AC15, AC-I2, AC-I4
- [x] T14: サイドバー: `MachineHeader.vue`・`MachineRows.vue` と `Sidebar.vue` への組み込み（まとまりの順・選んでいるマシンは今までの行・ほかは要約の行・薄い表示・折りたたみ・session のボタン）と相互作用のテスト
      対象: `packages/web/src/components/Sidebar.vue:388-470` `packages/web/src/components/MachineHeader.vue` `packages/web/src/components/MachineRows.vue`（新規） / 根拠: research A9
      依存: T12, T13
      AC: AC8, AC11, AC15, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [x] T15: 起動確認 `machineSmoke.ts`（ビルドした `dist/main.js`・2 つの状態ディレクトリ・偽の `ssh` のスクリプト・`wtm machine add` → 手元の `wtm serve` → `/ws?machine=` の hello・workspace の作成・echo）と `.aidev/config.yml`
      対象: `packages/server/src/machineSmoke.ts`（新規）`.aidev/config.yml` `smokeCommands` / 根拠: research A11
      依存: T4, T8, T9
      AC: AC17
- [x] T16: docs: `docs/machines.md`（新規・使い方・herdr との違い・対象外・未検証）・`docs/herdr-parity.md` H43・`docs/wtmctl.md`
      対象: `docs/machines.md`（新規）`docs/herdr-parity.md:76` `docs/wtmctl.md`
      依存: T9, T10, T14
      AC: AC16
