# タスク: `wtmctl pane observe` / `wtmctl pane control`

## 実装方針

design の部品を下から積む: `WtmClient` の受信の一時停止（T1）と純粋な処理（記録・行の切り出し・コマンドの検査。T2）と引数（T3）を先に作り、
それらの上に observe（T4）→ control と入口（T5）を組む。実サーバの結合テスト（T6）と smoke（T7）で配線を確かめ、文書（T8）で閉じる。

## 作業順序と依存関係

下の `依存:` に従う。T4 で共通のストリーム（フレームの書き出し・受信の一時停止・終わり方の骨組み）を作り、T5 はそれに入力と所有者を足すだけにする
（observe と control で終わり方の処理を二重に持たない）。

## リスク / 留意点

- stdin の listener を外し忘れるとプロセスが終わらない（research「実装時の注意」）。smoke（子プロセスが終わること）で確かめる。
- stdout の 'error' に受け手が無いと EPIPE で落ちる。`processStreamIo` が常に受ける。
- `ws` の `pause()` の後も溜まっていたぶんのイベントは届きうる（research F3）——終わりの判定は 1 回だけにしてあるので二重には終わらない。
- 負荷試験・E2E はしない（ユーザーの指示）。流量制御の再開（2 回目の SNAPSHOT）は単体テストで確かめ、実サーバで大量の出力を流すことはしない。

## テスト方針

- 単体（vitest）: `sessionStream.test.ts`（記録・行の切り出し・コマンドの検査・base64）・`commands/sessionStream.test.ts`（偽の client と偽の `StreamIo` で
  observe/control の全ての終わり方・入力・大きさ・一時停止）・`cliArgs.test.ts`（引数）・`wsClient.test.ts`（pause/resume が `ws` に届く）。
- 結合（実サーバ・実 PTY）: `sessionStream.integration.test.ts`——observe 2 本と control の同時使用・奪取（control 同士・`pane attach` との間）・release・pane の終了・未認証。
- smoke: ビルド済みの `wtmctl` を子プロセス（パイプ）で observe と control を一巡。
- 負の確認（`.aidev/conventions/regression-negative-control.md`）: 検査・終わり方・一時停止の要所を変異させてテストが落ちることを確かめる（test 工程）。
- 全体: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`（終了コードで判定）・`aidev smoke`。

## タスク

- [x] T1: `WtmClient` に `pause()`/`resume()` を足し、`WsWtmClient` が `ws` の `pause`/`resume` を呼ぶ（constructor の型を広げる）。単体テスト。
      対象: `packages/cli/src/wsClient.ts` `WtmClient`・`WsWtmClient` / 根拠: research A3
      依存: なし
      AC: AC14
- [x] T2: `packages/cli/src/sessionStream.ts`（新）——`FrameWriter`・`LineSplitter`・`parseControlLine`・`isCanonicalBase64`・定数。単体テスト。
      対象: `packages/cli/src/sessionStream.ts`（新規作成）
      依存: なし
      AC: AC1, AC2, AC11, AC12
- [x] T3: `pane observe`・`pane control` の引数（`Command`・`USAGE`・`--cols/--rows` の 1〜1000 と既定 120×40・`--takeover`）。単体テスト。
      対象: `packages/cli/src/cliArgs.ts` `parsePane`・`Command`・`USAGE` / 根拠: research A4
      依存: なし
      AC: AC6
- [x] T4: `packages/cli/src/commands/sessionStream.ts`（新）——`StreamIo`・`processStreamIo`・共通のストリーム（SNAPSHOT/OUTPUT → フレーム・問い合わせの除去・大きさの追従・
      受信の一時停止と再開・終わり方）と `runPaneObserve`。単体テスト。
      対象: `packages/cli/src/commands/sessionStream.ts`（新規作成）・`packages/cli/src/commands/attach.ts` `attachSession`（手本）/ 根拠: research A1, A2
      依存: T1, T2, T3
      AC: AC1, AC2, AC3, AC4, AC5, AC14
- [x] T5: `runPaneControl`（所有者・stdin の行 → INPUT/`attach_resize`/`detach`・不正な行の warn・release/EOF/シグナル・奪取）と `main.ts` の入口・`printHelp`。単体テスト。
      対象: `packages/cli/src/commands/sessionStream.ts`・`packages/cli/src/main.ts` の `switch`・`printHelp` / 根拠: research A4
      依存: T4
      AC: AC6, AC7, AC8, AC9, AC10, AC11, AC12
- [x] T6: 実サーバ・実 PTY の結合テスト（observe 2 本＋control・奪取・release・pane の終了・未認証）。
      対象: `packages/cli/src/sessionStream.integration.test.ts`（新規作成）・`packages/cli/src/attach.integration.test.ts`（足場の手本）/ 根拠: research A5
      依存: T5
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC13
- [x] T7: smoke にビルド済みの `wtmctl pane observe`/`pane control` の一巡（子プロセス・パイプ）を足す。
      対象: `packages/cli/src/smoke.ts` `main` / 根拠: research A5
      依存: T5
      AC: AC4, AC7, AC9
- [x] T8: `docs/wtmctl.md` の節（記録の形・コマンド・終了コード・herdr との違い・所有者は安全の境界ではない）と `docs/herdr-parity.md` の H40。backlog の消し込みは deliver で行う。
      対象: `docs/wtmctl.md`・`docs/herdr-parity.md` / 根拠: research A6
      依存: T5
      AC: AC15
