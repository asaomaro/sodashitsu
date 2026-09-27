# タスク: 名前付き session を CLI から止める（`wtm session stop`）

## 実装方針

サーバ側（制御の socket の `stop` → 受け付けの判断 → 停止の手順）を先に作り、次に CLI、最後に smoke・docs。
サーバ側は外に見える表面（socket の op）に触れるので、`HandoffSocket` の単体テストと `composeServer` の結合テストで確かめる。
`main.ts` は単体テストできないので、停止の手順を `serveShutdown.ts` に切り出して単体テストし、配線は smoke（ビルドした `wtm`）で見る。

## 作業順序と依存関係

下の `依存:` に従う。T1（socket と受け付けの判断）が T2（composeServer の配線）の前提、T2（配線）・T3（停止の手順）・T4（CLI）が揃って main の配線（T5）になる。各タスクは自分の単体テストのファイル（テスト方針の列挙）を一緒に書く。

## リスク / 留意点

- `close()` の順序の変更（制御の socket を閉じる位置）で既存の停止・引き継ぎのテストが変わらないか。既存の `composeServer*.test`・`HandoffSocket.test`・`handoffCommand.test`・`sessionCommands.test`・`cliArgs.test` を必ず走らせる（AC15）。
- 止まる途中の socket の接続を `HandoffSocket.close()` が待つ——CLI は 1 行で切るが、テストのクライアントも必ず切る。
- テストで起動したサーバ・子プロセスは必ず片付ける（共有マシン）。負荷試験・E2E はしない。
- prettier は新規ファイルと HEAD で整形済みのファイルにだけ。

## テスト方針

- 単体: `controlRequests.test.ts`（busy・unsupported・alreadyStopping・handler を 1 回だけ・返事を書けなくても handler を呼ぶ・止まる途中の handoff を断る）、`HandoffSocket.test.ts`（`stop` の op）、
  `serveShutdown.test.ts`（止める指示とシグナルが同じ `close()` の経路を通る・止める指示の冪等・止める指示の後のシグナルは 2 回目・token の表示・close の失敗）、`stop/stopCommand.test.ts`（全分岐の文言・code・終了コード・何も作らない）、
  `cliArgs.test.ts`（`session stop` の解釈）、`sessionCommands.test.ts`（delete・token reset の案内）。
- 結合: `composeServer.stop.integration.test.ts`（実物の `composeServer` と実物の socket で stop → handler・close の途中の stop が alreadyStopping・close 後に session.json・lock が無い・handoff を断る）。
- 起動確認: `stopSmoke.ts`（design「受け入れ基準との対応」AC16 の手順どおり: `sessions/smoke` を作る → 動いていない stop が 3 で何も作らない → `--pane-history` で起動し
  `/ws` で印を打つ → stop が 0・`stopped session smoke`・子の終了コード 0・`session list` が stopped・`wtm.lock` が無く `session.json`・`session-history.json` がある →
  もう一度の stop が 3 → 起動し直して同じ pane の id と前回の印が戻る → SIGTERM で片付ける。Windows では何もせず成功）。
- 回帰の負の確認: 主要な判断（alreadyStopping・busy・pid の不一致・時間切れ・socket を閉じる位置・冪等）を 1 行ずつ壊して該当テストが落ちることを確かめる（規約 regression-negative-control）。

## タスク

- [x] T1: 制御の socket に `stop` を足し、受け付けの判断を `controlRequests.ts` に置く（`HandoffController.isBusy` を足す）
      対象: `packages/server/src/handoff/HandoffSocket.ts` `handleLine` `HandoffRequestHandler`・`packages/server/src/handoff/HandoffController.ts` `busy`（`isBusy` を足す。design「インターフェース」）・`packages/server/src/handoff/controlRequests.ts`（新規）・テスト `HandoffSocket.test.ts`・`controlRequests.test.ts`（新規）
      依存: なし
      AC: AC4, AC5, AC7, AC15
- [x] T2: `composeServer` に `onStopRequest`・`markClosing`・制御の socket を閉じる位置の移動を入れ、結合テストを足す
      対象: `packages/server/src/composeServer.ts` `ComposedServer` `listen` の 4.5 `close`・`packages/server/src/composeServer.stop.integration.test.ts`（新規）
      依存: T1
      AC: AC1, AC5, AC7, AC15
- [x] T3: 停止の手順を `serveShutdown.ts` に切り出す（シグナル・止める指示）
      対象: `packages/server/src/main.ts` `runServe` の `shutdown`・`packages/server/src/serveShutdown.ts`（新規）・`serveShutdown.test.ts`（新規）
      依存: なし
      AC: AC1, AC7
- [x] T4: CLI `runSessionStop` を作る
      対象: `packages/server/src/stop/stopCommand.ts`（新規）・`stop/stopCommand.test.ts`（新規）。使うだけ（変更しない）: `packages/server/src/handoff/handoffCommand.ts` `askSocket`・`packages/server/src/persist/namedSession.ts` `findExactEntry`
      依存: T1
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC8, AC9, AC10, AC11, AC12
- [x] T5: 引数の解釈・`main.ts` の分岐と配線・ヘルプ
      対象: `packages/server/src/cliArgs.ts` `parseSessionCommand` `USAGE` `ParsedArgs`・`packages/server/src/main.ts` `printHelp` `main` `runServe`・`cliArgs.test.ts`
      依存: T2, T3, T4
      AC: AC1, AC3, AC14, AC15
- [x] T6: `wtm session delete`・`wtm token reset` の「動いている」の案内に止めるコマンドを添える
      対象: `packages/server/src/persist/namedSession.ts` `deleteSession`・`packages/server/src/config.ts` `stateDirInUseError`・`packages/server/src/sessionCommands.ts` `runTokenReset`（名前を渡す）・`sessionCommands.test.ts`
      依存: なし
      AC: AC13, AC15
- [x] T7: 起動確認 `stopSmoke.ts` と `smokeCommands` の 7 本目
      対象: `packages/server/src/stopSmoke.ts`（新規）・`.aidev/config.yml` `smokeCommands`
      依存: T5
      AC: AC1, AC2, AC16
- [x] T8: docs（herdr-parity H33・verification・tls-setup）
      対象: `docs/herdr-parity.md` H33・`docs/verification.md` 名前付き session の項・`docs/tls-setup.md`「名前付き session」
      依存: T5
      AC: AC14
