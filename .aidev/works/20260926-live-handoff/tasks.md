# タスク: 更新時の引き継ぎ（live handoff）

## 実装方針

design.md の部品を下から順に作る: 受け渡しの中身（純粋な部品）→ 引き継いだ PTY → 端末の層 → 復元 → 古い版の側の制御と受け口 →
preflight → 起動の配線 → CLI → docs。各部品は依存を注入できる形にして単体テストで確かめ、最後に実物の `dist/main.js` を子プロセスで
起動する通しの確認（`wtm serve` → pane のシェルの pid を記録 → `wtm handoff` → 同じ pid・同じ画面・入出力）で通しを確かめる。
通しの確認は execve で `dist/main.js` を読み直すので、vitest の中ではなく**ビルドした成果物を使う smoke の 1 本**（`dist/handoffSmoke.js`）にする
（vitest は TypeScript のソースを変換して走らせるので、execve の先の新しい版を用意できない）。

## 作業順序と依存関係

- 下の `依存:` に従う。
- T2（引き継いだ PTY）は execve をまたぐので、単体テストでは同じプロセスの中で node-pty と同じ fd を二重に読まない（research「実装時の注意」）。
  子プロセスで node-pty の PTY を開き execve する形の結合テストで確かめる。

## リスク / 留意点

- `process.execve` の fd の持ち越しは Node の文書に無い（research F2.2・R1）→ preflight（T6）で毎回確かめる。
- 結合テストはサーバと pane のシェルを実際に起動する。テストの後始末で必ず止める（サーバへ SIGTERM・残ったシェルへ SIGKILL）。
  負荷の高い繰り返しはしない（ユーザーの指示）。
- 既存の `PtyProcess`/`TerminalHost` の偽物（テスト）を壊さないよう、足すメソッドは interface では任意にする。

## テスト方針

- 単体（vitest）: manifest の検査（形・nonce・pid・期限・fd の確認・必ず消す・`closeOrphanPtyMasters`）、`AdoptedPtyProcess`（node-pty のネイティブの `open` で
  同じプロセスの中に PTY の組を作り、slave の側から入出力・大きさ・終了を確かめる。終了コードの解釈は依存の差し替え）、
  `TerminalHost.holdForHandoff`/`releaseHandoffHold`/`nudgeRedraw`・`TerminalManager.adopt`、`SessionService.restore` の引き継ぎの分岐（会話の再開・画面履歴を流さない・失敗したら新しいシェル）、
  `HandoffController` の状態遷移と元に戻す経路、`HandoffSocket` の要求・返事、preflight の判定（子の起動を差し替え）、起動時の引き継ぎの処理（`applyTakenHandoff`：
  ポートの優先・使わなかった fd の後始末・`broken`・結果の記録）、`FileLogger.flush`、CLI の引数と終了コード（接続先を差し替え）。
- 通し（smoke・ビルドした成果物）: 実物の `wtm serve` と `wtm handoff`（AC1〜AC3・AC5・AC7・AC8 のファイル・AC12）、preflight の実物（fd が残る Node か）。
  負の確認で通しを回すのは、単体で捕まえられない配線（execve の引数・環境変数）だけにする（負荷の高い繰り返しを避ける）。
- 負の確認（規約 regression-negative-control）: 主要な判定（nonce・pid・期限・`isPtyMaster`・preflight の `dev:ino`・会話の再開を流さない・使わなかった fd を閉じる）を
  変異させてテストが落ちることを確かめる。
- smoke: 既存の 5 本に、`wtm handoff` の「動いていない」（終了コード 3）の入口を 1 本足す。

## タスク

- [x] T1: 受け渡しの中身（`HandoffManifest.ts`）: 型・定数・`writeHandoffManifest`・`removeHandoffManifest`・`parseHandoffManifest`・`takeHandoff`・`isPtyMaster`・`closeOrphanPtyMasters`
      対象: `packages/server/src/handoff/HandoffManifest.ts`（新規）・`packages/server/src/persist/atomicFile.ts` `writeFileAtomic`（使うだけ） / 根拠: research A10
      依存: なし
      AC: AC8
- [x] T2: 引き継いだ PTY（`AdoptedPtyProcess`）と `PtyProcess.handoffFd?`・`PtyBackend.adopt?`（node-pty の master の fd の取り出し・ネイティブの resize）
      対象: `packages/server/src/pty/AdoptedPtyProcess.ts`（新規）・`packages/server/src/pty/PtyBackend.ts`・`packages/server/src/pty/NodePtyBackend.ts` `NodePtyProcess` / 根拠: research A1, A2, F3.1〜F3.4, F4.2
      依存: なし
      AC: AC2, AC7
- [x] T3: 端末の層: `DefaultTerminalHost` の `holdForHandoff`・`releaseHandoffHold`・`nudgeRedraw`・大きさの記録、`TerminalManager.adopt`
      対象: `packages/server/src/terminal/TerminalHost.ts`・`packages/server/src/terminal/TerminalManager.ts` `DefaultTerminalManager.create` / 根拠: research A3, A4, A11
      依存: T2
      AC: AC2, AC3
- [x] T4: 復元の引き継ぎの分岐: `SessionService.restore(…, { adopted })`・`adoptForPane`・戻り値 `adoptedPaneIds`・`handoffScrollbackEditors`・`adoptScrollbackEditors`
      対象: `packages/server/src/session/SessionService.ts` `restore` `restorePaneProcess` `spawnForPane` `wireExit` `scrollbackEditors` / 根拠: research A5, F5.7
      依存: T1, T3
      AC: AC1, AC3, AC7, AC9, AC14
- [x] T5: 古い版の側の制御と受け口: `HandoffController`（確認・停止・書き込み・返事・execve・元に戻す・status）と `HandoffSocket`（`handoff.sock` 0600・Windows では作らない）・`FileLogger.flush()`
      対象: `packages/server/src/handoff/HandoffController.ts`・`packages/server/src/handoff/HandoffSocket.ts`（新規）・`packages/server/src/log/Logger.ts` `FileLogger`・`packages/server/src/agent/AgentReportSocket.ts`（手本） / 根拠: research A9
      依存: T1, T3, T4
      AC: AC1, AC4, AC6
- [x] T6: preflight（`__handoff-preflight` の 1 段目・2 段目と親の側の判定）
      対象: `packages/server/src/handoff/preflight.ts`（新規） / 根拠: decisions D5・research F2.6
      依存: T1
      AC: AC4
- [x] T7: 起動と停止の配線: 起動時の引き継ぎの処理を `applyTakenHandoff`（`handoff/startup.ts`。ポートの優先・`restore(adopted)` の組み立て・使わなかった fd と `rejected` の後始末・
      `broken` の `closeOrphanPtyMasters`・`recordTaken`）に切り出し、`composeServer.listen` で `takeHandoff` とともに呼ぶ。`HandoffController` の依存の実物
      （`pausePollers`/`resumePollers`＝git・エージェントの判定・画面履歴の定期保存、`closeClients`/`reopenClients`＝`/ws` の 1012 と受け付けの戻し、`flushSession`＝`persist.flush`、
      `flushLog`＝`FileLogger.flush`、`boundPort`、`preflight`＝T6）を組み立てて受け口（T5）を起動し、`close` で受け口を閉じる。`main.ts` の結果の表示
      対象: `packages/server/src/handoff/startup.ts`（新規）・`packages/server/src/composeServer.ts` `listen` `close`・`packages/server/src/main.ts` `runServe` / 根拠: research A6
      依存: T4, T5, T6
      AC: AC1, AC5, AC8, AC13
- [x] T8: CLI `wtm handoff`（引数・`WTM_SESSION`・動いていない・非対応・拒否と preflight の失敗の表示・結果の待ち）と、隠しコマンド `__handoff-preflight [--stage 2 --probe …]` の
      引数の解釈、`main.ts` の 2 つの入口（`wtm handoff`・`__handoff-preflight` を T6 の処理へ渡す）
      対象: `packages/server/src/cliArgs.ts` `parseArgs` `applySessionEnv`・`packages/server/src/handoff/handoffCommand.ts`（新規）・`packages/server/src/main.ts` `main`・`packages/server/src/sessionCommands.ts` `runTokenReset`（手本） / 根拠: research A8
      依存: T5, T6
      AC: AC4, AC6, AC10, AC12
- [x] T9: 通しの確認（smoke）: `dist/handoffSmoke.js` が実物の `dist/main.js` で `wtm serve` を子として起動 → pane の pid と画面の印を記録 → `wtm handoff` →
      サーバが同じ pid・pane が同じ id と pid・画面の印・入出力・大きさ・終了・`handoff.json` が残らない、を確かめ、後始末する。`wtm handoff` の「動いていない」（終了コード 3）も確かめる。
      `.aidev/config.yml` の `smokeCommands` に 1 本足す
      対象: `packages/server/src/handoffSmoke.ts`（新規）・`.aidev/config.yml` `smokeCommands`・`packages/server/src/smoke.ts`（手本）
      依存: T7, T8
      AC: AC1, AC2, AC3, AC4, AC5, AC7, AC8, AC12, AC13
- [x] T10: docs（利用者向けの `wtm handoff` の説明・対応 OS・既知の制約）と `docs/herdr-parity.md` の H32
      対象: `docs/tls-setup.md`・`docs/verification.md`・`docs/herdr-parity.md`（H32 の行）
      依存: T8
      AC: AC11
