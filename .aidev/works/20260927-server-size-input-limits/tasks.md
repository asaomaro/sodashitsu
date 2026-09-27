# タスク: サーバ側の大きさと入力の上限

## 実装方針

- 下から積む: protocol（定数・スキーマ・エラーコード）→ server の PTY（量を測る）→ `TerminalHost`（判定）→ `WsGateway`（捨てて知らせる）→
  web・cli（丸め・知らせの表示）→ docs。
- 各タスクで対応するテストを同じファイル群の既存のテストに足す。負の確認（変異）は test 工程でまとめて行う。

## 作業順序と依存関係

- 下の `依存:` に従う。依存の外の順序の指定が 1 つある: T3（実物の node-pty で量が測れるか）は見立てが外れると T4 以降の前提が崩れるので、T1 の直後
  （T2・T7・T8 より先）に行う。

## リスク / 留意点

- node-pty の内部の形（research F8）。T3 の統合テストが形の前提を確かめる。
- 実物の PTY を使うテストは raw モードの読まない子に 1 回だけ書き、必ず kill する（負荷試験にしない。利用者の指示）。
- `ErrorCode` を足すと web の表（`Record<ErrorCode, string>`）が型検査で落ちる——T1 で web の表の項目も一緒に足す（T1 だけで typecheck が通る）。
- prettier は新規ファイルと HEAD で整形済みのファイルにだけ（利用者の規約）。

## テスト方針

- 単体: protocol のスキーマの境界（4096/4097・0・非整数・1000×1000/1000×1001・件数 4096/4097）と `clampTerminalSize`。
  `TerminalHost` の `writeInput`（境界・後回しの待ちを数える・測れない PTY・終了後）・`runModal` の `input_queue_full`・ミラーの応答は捨てない。
  `AdoptedPtyProcess` の `pendingWriteBytes`（実物の PTY の組・slave を raw にして読まない）。web の `measure` の丸め・`clientError` の文言。
  cli の control の警告・attach の丸め。
- 統合: 実物の node-pty（raw モードの読まない子）で `pendingWriteBytes` が書いた量に近いこと（T3）。`WsGateway` を実物の `/ws` で通し、読まない pane に
  1 MiB の INPUT を上限まで送ると `client.error`（`input_queue_full`・paneId）が 1 回届き、間隔の内は届かず、時計を進めると再び届き、接続は閉じない（T5）。
  `client.view`・`pane.attach`・`pane.attach_resize` の上限の外が `invalid_params` で大きさが変わらない（T2）。
- 全体: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`・`aidev smoke`。E2E・負荷試験はしない。
- 負の確認: 変更した判定（比較演算子・定数・refine・間引き・丸め・知らせの条件）を行ごとに壊してテストが落ちることを、生のログをファイルに残して確かめ、cmp で戻す。

## タスク

- [x] T1: protocol に端末の大きさの上限と入力の待ちのエラーを足す——`terminalLimits.ts`（`TERMINAL_SIZE_MAX`・`TERMINAL_CELLS_MAX`・`VIEW_VISIBLE_PANES_MAX`・
      `terminalDimension`・`withinCellLimit`・`clampTerminalSize`）を新規に作り `index.ts` から export、`ClientViewParams`・`PaneAttachParams`・
      `PaneAttachResizeParams` を上限つきに、`ErrorCode` に `input_queue_full`（web の `clientError.ts` の表の項目も同時に足す）、`ClientErrorEvent.data.paneId?`。
      protocol の単体テスト。
      対象: `packages/protocol/src/messages.ts:39-43` `ClientViewParams`・`:81-98` `PaneAttachParams`/`PaneAttachResizeParams`・`packages/protocol/src/errors.ts:2-52`・
      `packages/protocol/src/events.ts:114-117`・`packages/protocol/src/index.ts`・`packages/protocol/src/terminalLimits.ts`（新規）・
      `packages/web/src/net/clientError.ts:12-84` / 根拠: research A1・A7・A8
      依存: なし
      AC: AC1, AC2, AC3, AC4
- [x] T2: サーバで上限の外の `client.view`・`pane.attach`・`pane.attach_resize` が `invalid_params` になり pane の大きさが変わらないことをテストで確かめる
      （コードはスキーマ経由で効くので、変えるのはテストだけ）。
      対象: `packages/server/src/surface/methods/attach.test.ts`・`packages/server/src/surface/ControlSurface.ts:34-36`（読むだけ） / 根拠: research A2・A11
      依存: T1
      AC: AC1, AC2, AC3
- [x] T3: `PtyProcess.pendingWriteBytes?()` を足し、`NodePtyProcess`（Unix `_writeStream._writeQueue`・Windows `_agent.inSocket.writableLength`・形が無ければ undefined）と
      `AdoptedPtyProcess`（自前の queue）で実装する。実物の node-pty（raw モードの読まない子に 2 MiB を 1 回）と PTY の組（slave を raw にして読まない）のテスト。
      対象: `packages/server/src/pty/PtyBackend.ts:22-46` `PtyProcess`・`packages/server/src/pty/NodePtyBackend.ts:39-98` `NodePtyProcess`・
      `packages/server/src/pty/AdoptedPtyProcess.ts:92`・`:127-172`・`packages/server/src/pty/NodePtyBackend.integration.test.ts`・
      `packages/server/src/pty/AdoptedPtyProcess.test.ts` / 根拠: research A4・F8〜F11
      依存: なし
      AC: AC5, AC14
- [x] T4: `TerminalHost` に `MAX_PENDING_INPUT_BYTES`・`inputBacklog()`・`writeInput()` を足し、`runModal` で上限を超える入力を `input_queue_full` の RpcError で断る。
      ミラーの応答の経路は変えない。`TerminalHost.test.ts` にテスト（境界・後回しの待ち・測れない PTY・終了後・モード付き入力・ミラーの応答）。
      対象: `packages/server/src/terminal/TerminalHost.ts:21-51` `TerminalHost`・`:173-244` `write`/`writeModal`/`runModal`/`drainQueue`・`packages/server/src/terminal/TerminalHost.test.ts` / 根拠: research A5・A6
      依存: T1, T3
      AC: AC5, AC7, AC10, AC14
- [x] T5: `WsGateway` の INPUT を `writeInput` で書き、false なら `client.error`（`input_queue_full`・paneId）を同じ接続・同じ pane に 2 秒に 1 回だけ送り、
      `LogThrottle` で間引いて warn を残す（不正なフレームの数には数えない）。`writeInput` の無い host には今までどおり `write`。
      テストは実物の `/ws` と実物の node-pty（raw モードの読まない子）の統合テスト 1 本: 上限まで送ると `client.error` が 1 回届き、間隔の内は届かず、
      時計を進めると再び届き、接続が閉じないこと、上限の内側の 1 MiB のフレームは届くこと（1 回だけ・後始末する）。
      対象: `packages/server/src/ws/WsGateway.ts:23-28` `ConnState`・`:100-123` `onBinary`・`packages/server/src/log/LogThrottle.ts`・
      `packages/server/src/ws/WsGateway.integration.test.ts`（`startTestServer` の `commandFor`・`gatewayNow`） / 根拠: research A3・A10・A11
      依存: T1, T4
      AC: AC5, AC6, AC7
- [x] T7: web の `measure` で `clampTerminalSize` に丸め、`input_queue_full` の文言（T1 で足した表の項目）を引けることをテストする。
      対象: `packages/web/src/term/measure.ts:18-22`・`packages/web/src/term/measure.test.ts`・`packages/web/src/net/clientError.test.ts` / 根拠: research A8
      依存: T1
      AC: AC4, AC9
- [x] T8: `wtmctl pane control` が制御中の pane の `input_queue_full` の `client.error` を stderr に出し（書き出し待ちの上限で捨てる・attach の前でもすぐ出す）、
      `wtmctl pane attach` が `pane.attach`・`pane.attach_resize` の大きさを `clampTerminalSize` で丸める。テスト。
      対象: `packages/cli/src/commands/sessionStream.ts:358-366`・`:405-408` `runPaneControl`・`packages/cli/src/commands/attach.ts:165-170`・`:230-236`・
      `packages/cli/src/commands/sessionStream.test.ts`・`packages/cli/src/commands/attach.test.ts` / 根拠: research A9
      依存: T1
      AC: AC8, AC15, AC4
- [x] T9: 文書: `docs/wtmctl.md`（大きさの上限・control の入力を捨てた警告・流し込みの注意）・`docs/verification.md`（ブラウザの文言）・`docs/machines.md`
      （中継の先のサーバで判定。古い版の先には効かない）。research/decisions への点検の記録は済み（AC11 の backlog の行は deliver で足す——decisions D7）。
      対象: `docs/wtmctl.md`・`docs/verification.md`・`docs/machines.md` / 根拠: research「影響範囲」
      依存: T5, T7, T8
      AC: AC12, AC15
- [x] T10: 全体の確認（`pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`）。負の確認と `aidev smoke` は test 工程で行う（decisions D7）。
      AC11 の backlog の `[ ]` 行は deliver で足す（decisions D7。この T10 の AC 欄は消化を追うために載せる）。
      対象: リポジトリ全体 / 根拠: AGENTS.md・利用者の指示
      依存: T2, T5, T7, T8, T9
      AC: AC13, AC11
- [x] T11: review ラウンド 1 の対応——入力の待ちを「バイト数＋件数×256」で数え（`INPUT_CHUNK_COST_BYTES`・`PtyProcess.pendingWriteChunks`）、量を O(1) で出す
      （`NodePtyProcess` は渡した長さを覚える `SentLengths`、`AdoptedPtyProcess`・`TerminalHost` は数を増減）。attach の `term.size()` を 1 回に。テスト・docs。
      対象: `packages/server/src/pty/NodePtyBackend.ts`・`packages/server/src/pty/AdoptedPtyProcess.ts`・`packages/server/src/pty/PtyBackend.ts`・
      `packages/server/src/terminal/TerminalHost.ts`・`packages/cli/src/commands/attach.ts`・各テスト・`docs/wtmctl.md` / 根拠: review.md ラウンド 1・decisions D9
      依存: T10
      AC: AC5, AC7
