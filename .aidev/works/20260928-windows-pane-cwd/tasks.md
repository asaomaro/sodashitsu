# タスク: Windows で pane の場所（cwd）が `cd` に追従する

## 実装方針

design の D-1〜D-6。差し込みの判定と組み立ては純粋な関数（`pty/shellCwdTracking.ts`）にし、Windows の組み立てを単体試験で網羅する。受け取りは `Mirror` の OSC 9;9。設定は共有の設定 `shellCwdTracking`。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- Windows の実機が無い。PowerShell・cmd の実際の振る舞いは確かめられない（未検証の穴）。組み立てた引数・環境・スクリプトの文字列を試験で固定する。
- Linux・WSL2・macOS の起動を変えないこと（AC8）。`platform` を注入して試験する。

## テスト方針

- `shellCwdTracking` の単体試験（シェルの判定・大文字小文字・既存の引数での見送り・文字列の引数・`PROMPT` の有無・設定の切・win32 以外）。
- `Mirror` の OSC 9;9（引用符あり・なし・通知の OSC 9 を妨げない）。
- `TerminalManager`／`SessionService` の配線（対話の pane だけ `trackCwd`、独自コマンドの pane は無し）。
- 設定の読み込み（client-core）・web と tui の設定画面の項目。

## タスク

- [x] T1: `pty/shellCwdTracking.ts`（純粋な判定と組み立て）と `TerminalManager` の `trackCwd`・`SessionService` の対話の pane だけ `trackCwd: true`・`composeServer` から `hostname` と設定の読み取りを渡す
      対象: `packages/server/src/terminal/TerminalManager.ts:62-75`・`packages/server/src/session/SessionService.ts:1188-1201`・`packages/server/src/composeServer.ts`・（新規 `packages/server/src/pty/shellCwdTracking.ts`）
      依存: T3
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC8
- [x] T2: `Mirror` の OSC 9;9 の受け取り
      対象: `packages/server/src/terminal/Mirror.ts:132-135,370-384`
      依存: なし
      AC: AC7, AC1
- [x] T3: 共有の設定 `shellCwdTracking`（protocol・client-core の読み込み・web と tui の設定画面の「端末」の節）
      対象: `packages/protocol/src/messages.ts`（SharedPrefs）・`packages/client-core/src/prefs/load.ts`・`packages/web/src/components/SettingsDialog.vue`・`packages/web/src/store/settings.ts`・`packages/tui/src/settings/sections.ts`
      依存: なし
      AC: AC6
- [x] T4: docs（`docs/verification.md` の既知の制約・`docs/tui.md` の設定・`docs/custom-commands.md`・`docs/herdr-parity.md` の cwd の注記）
      対象: `docs/verification.md:449-452`・`docs/tui.md`・`docs/custom-commands.md`・`docs/herdr-parity.md`
      依存: T1, T2, T3
      AC: AC9
