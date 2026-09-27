# タスク: 独自コマンドのキー

## 実装方針

architecture.md「tasks への申し送り」の順に、protocol → server（純粋な部品 → SessionService → CommandService → 配線）→ web（keys → store → 画面 →
実行 → popup）→ docs と積む。各タスクは vitest の単体テストを伴い、足した挙動は 1 箇所ずつ壊して落ちることを確かめる（regression-negative-control）。

## 作業順序と依存関係

下の `依存:` に従う。server と web の keys は protocol（T1）だけに依存するので並べられるが、直列で進める（コンテキストの切り替えを減らす）。

## リスク / 留意点

- `web/keys` の `ActionId` → `KeyTargetId` の拡張は既存のテスト（`assign.test.ts`・`keymap.test.ts`・`KeySettings.test.ts`）の型に波及する。既存の振る舞いを変えない。
- `editScrollback` の抜き出し（T4）は既存の `SessionService.test.ts` の edit_scrollback のテストで守る（抜き出しの前後で通ること）。
- popup の xterm.js は happy-dom で描画しない。セルの寸法は既定（9×18）に落ちるので、大きさの計算は `popupSize.ts` の純粋な関数で確かめる。
- Windows の起動は確かめられない（argv の単体テストだけ）。
- E2E・負荷の試験は走らせない（利用者の方針）。
- AC16 のうち backlog の行を割るのは deliver 工程（T12 は docs だけ）。

## テスト方針

- vitest（`pnpm -s test`）で全体を通す。追加：protocol `commands.test.ts`・`messages.test.ts`、server `commandConfig.test.ts`・`commandLaunch.test.ts`・`CommandService.test.ts`・
  `paneEnv.test.ts`・`SessionService.test.ts`（pane 種）・`surface/methods`（command・subscribe）・`WsGateway`（切断）・`composeServer.integration.test.ts`（状態ディレクトリの
  ファイルが一覧になる）、web `commandKeys.test.ts`・`keyPrefs.test.ts`・`keymap.test.ts`・`assign.test.ts`・`KeySettings.test.ts`・`HelpDialog.test.ts`・`ActionDispatcher.test.ts`・
  `StoreAdapter.test.ts`・`popupSize.test.ts`・`CommandPopupSession.test.ts`・`CommandPopup.test.ts`・`TerminalRegistry.test.ts`。
- `pnpm -s build`・`pnpm -s typecheck`（終了コードで判定）・`aidev smoke`。
- 負の確認：各タスクの足した判定（検証の規則・権限・argv・環境・popup の持ち主・キーの登録）を 1 つずつ壊し、テストが落ちる生の出力を test-result.md に残す。

## タスク

- [x] T1: protocol に独自コマンドの型・規則・要求・イベント・code を足す
      対象: `packages/protocol/src/commands.ts`（新規） `packages/protocol/src/messages.ts` `METHOD_SCHEMAS` `MethodResultMap` `packages/protocol/src/events.ts` `ServerEvent` `packages/protocol/src/errors.ts` `ErrorCode` `packages/protocol/src/index.ts` / 根拠: research A7
      依存: なし
      AC: AC1, AC9
- [x] T2: 設定ファイルの読み込みと検証（`commandConfig.ts`）
      対象: `packages/server/src/commands/commandConfig.ts`（新規）
      依存: T1
      AC: AC1, AC2, AC3
- [x] T3: argv と裏での起動（`commandLaunch.ts`）
      対象: `packages/server/src/commands/commandLaunch.ts`（新規）
      依存: T1
      AC: AC7, AC11
- [x] T4: `SessionService` の pane 種・文脈・環境、`paneEnv` の拡張
      対象: `packages/server/src/session/SessionService.ts` `editScrollback` `closePane` `publishPaneClosed` `spawnForPane` `envForPane` `packages/server/src/session/paneEnv.ts` `buildPaneEnv` / 根拠: research A4, A5
      依存: T1
      AC: AC8, AC10
- [x] T5: `CommandService`（一覧・読み直し・run・popup・後始末）
      対象: `packages/server/src/commands/CommandService.ts`（新規）
      依存: T2, T3, T4
      AC: AC1, AC2, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC15
- [x] T6: 要求の登録・購読の拡張・切断の知らせ・組み立てと停止
      対象: `packages/server/src/surface/methods/command.ts`（新規） `packages/server/src/surface/methods/index.ts` `packages/server/src/surface/methods/deps.ts` `packages/server/src/surface/methods/subscribe.ts` `packages/server/src/ws/WsGateway.ts` `packages/server/src/composeServer.ts` / 根拠: research A1, A2, A3, A6
      依存: T5
      AC: AC1, AC4, AC5, AC9, AC15
- [x] T7: web の keys をコマンドへ広げる（型・保存・表・取り込み・Action）
      対象: `packages/web/src/keys/commandKeys.ts`（新規） `packages/web/src/keys/keyPrefs.ts` `packages/web/src/keys/keymap.ts` `resolveKeymap` `packages/web/src/keys/assign.ts` `packages/web/src/keys/actions.ts` / 根拠: research A8
      依存: T1
      AC: AC12, AC13
- [x] T8: web の store（一覧の store・settings の keymap・イベント・接続ごとの取得・失敗の文言）
      対象: `packages/web/src/store/commands.ts`（新規） `packages/web/src/store/settings.ts` `packages/web/src/store/StoreAdapter.ts` `packages/web/src/main.ts` `packages/web/src/net/clientError.ts` / 根拠: research A12, A14
      依存: T7
      AC: AC6, AC7, AC13, AC15
- [x] T9: 設定画面の群「独自コマンド」とキー一覧
      対象: `packages/web/src/components/KeySettings.vue` `packages/web/src/components/HelpDialog.vue` / 根拠: research A9, A10
      依存: T8
      AC: AC12, AC14
- [x] T10: 実行（`runCommand`）と `reload_config` の読み直し
      対象: `packages/web/src/actions/ActionDispatcher.ts` `dispatch` `reloadConfig` `packages/web/src/store/view.ts` `DialogContext` / 根拠: research A11, A13
      依存: T8
      AC: AC6, AC7, AC8, AC13, AC15
- [x] T11: popup（大きさ・1 回分の手続き・部品・registry の外の受け手・配置）
      対象: `packages/web/src/term/popupSize.ts`（新規） `packages/web/src/term/CommandPopupSession.ts`（新規） `packages/web/src/components/CommandPopup.vue`（新規） `packages/web/src/term/TerminalRegistry.ts` `packages/web/src/App.vue` / 根拠: research A12, A13
      依存: T10
      AC: AC4, AC5, AC6, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [x] T12: docs（`custom-commands.md`・herdr-parity H12/H26・verification）
      対象: `docs/custom-commands.md`（新規） `docs/herdr-parity.md` `docs/verification.md`
      依存: T11
      AC: AC16
