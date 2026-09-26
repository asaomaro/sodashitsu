# タスク: 名前付き session の残り（画面での表示と切り替え・ポートの記憶・環境変数の既定）

## 実装方針

design の順に、server の土台（記録のファイル・オプション・Cookie・pane の環境）→ protocol と一覧の方式 → server の組み立て（composeServer・
起動の表示・main）→ web の純関数 → web のストアと操作 → ダイアログ → サイドバー → docs と積む。各タスクはそのタスクの単体テストを
一緒に書き、vitest で通してから次へ進む。

## 作業順序と依存関係

下の `依存:` に従う。T1〜T4 は互いに独立（対象のファイルが重ならない）だが、点検の変異が同じファイルに入らないよう直列で進める
（20260926-named-session D4 の教訓）。

## リスク / 留意点

- `HostInfo` の省略可能な項目は `exactOptionalPropertyTypes` の下で「無いときは入れない」。
- 既定の session の表示・Cookie・タイトル・案内の文言は既存のテストが完全一致で見ている（変えない）。
- `main.ts` は単体テストできないので、判断はテストできる関数（`applySessionEnv`・`bindFailureHint`・`startupLines`）に置く。
- happy-dom ではネイティブの `<dialog>` のフォーカスの戻り・Tab の閉じ込めを確かめられない（明示の戻しをテストし、Tab は未検証の穴）。
- 負の確認（regression-negative-control）は、この work の新しい振る舞いを担う行を変異させて落ちることを確かめる（test 工程）。

## テスト方針

- vitest（server・protocol・web）の単体・結合テスト。`pnpm -s build` → `pnpm -s typecheck` → `pnpm -s test`（一式を 1 回）。
- `aidev smoke`（既存の 4 本。既定の session のタイトル・起動が変わらないことも smoke が見る）。
- 負の確認: 記録の持ち主の一致・ポートの記憶の条件・Cookie の名前・`WTM_SESSION` の適用と落とし・`sessionTarget` の判定・ダイアログの
  開ける/開けない・サイドバーの表示条件を、行ごとに変異させて落ちるテストがあることを確かめ、生の出力をファイルに残す。
- E2E・負荷試験は行わない。

## タスク

- [x] T1: 起動の記録 `serve.json` の読み書き（`ServeRecordFile`）と単体テスト
      対象: `packages/server/src/persist/ServeRecordFile.ts`（新規）・`packages/server/src/persist/atomicFile.ts:9` `writeFileAtomic` / 根拠: research F7・A5
      依存: なし
      AC: AC10, AC11
- [x] T2: `WTM_SESSION` の適用（`applySessionEnv`）・`ServeOptions` の `sessionRoot`/`portSource`/`sessionSource`・案内（`stateDirInUseError`・`bindFailureHint`・`runTokenReset`）と単体テスト
      対象: `packages/server/src/cliArgs.ts:30` `parseArgs`・`packages/server/src/config.ts:120` `resolveServeOptions`・`config.ts:183` `bindFailureHint`・`config.ts:192` `stateDirInUseError`・`packages/server/src/sessionCommands.ts:74` `runTokenReset`・`packages/server/src/persist/namedSession.ts:15` `SESSION_NAME_RULE` / 根拠: research A3・A4
      依存: なし
      AC: AC13, AC14, AC16
- [x] T3: 名前付き session の Cookie の名前（`sessionCookieName`・`DefaultAuthService` の `cookieName`）と単体テスト
      対象: `packages/server/src/auth/AuthService.ts:9` `SESSION_COOKIE_NAME`・`:182` `parseSessionIdFromCookie`・`:200` `buildSetCookieHeader`・`:207` `buildClearCookieHeader` / 根拠: research A1
      依存: なし
      AC: AC8, AC9
- [x] T4: pane の環境の `WTM_SESSION`（`buildPaneEnv`・`SessionService` の opts）と単体テスト
      対象: `packages/server/src/session/paneEnv.ts:15` `PANE_ENV_DROPPED`・`:30` `buildPaneEnv`・`packages/server/src/session/SessionService.ts:1052` / 根拠: research A7
      依存: なし
      AC: AC15
- [x] T5: protocol の型（`HostInfo.sessionName`・`ServerSessionEntry`・`server.sessions`）と一覧（`listServerSessions`）・方式の登録と単体テスト
      対象: `packages/protocol/src/model.ts:130` `HostInfo`・`packages/protocol/src/messages.ts` `METHOD_SCHEMAS`/`MethodResultMap`・`packages/server/src/persist/namedSession.ts:79` `listSessions`・`packages/server/src/surface/methods/index.ts` `registerAllMethods`・`surface/methods/deps.ts` `MethodDeps`・`surface/methods/serverSessions.ts`（新規） / 根拠: research A6・A8
      依存: T1
      AC: AC4, AC5
- [x] T6: 組み立て（ポートの記憶の読み・記録の書き・`HostInfo.sessionName`・Cookie の名前・`server.sessions` の依存・pane の名前）・起動の表示・`main.ts` の配線と結合テスト
      対象: `packages/server/src/composeServer.ts:105`・`:110`・`:153`・`:264` `listen()`・`packages/server/src/startupBanner.ts:27` `startupLines`・`packages/server/src/main.ts:25` `runServe`・`:121` `main` / 根拠: research A5・A9
      依存: T1, T2, T3, T4, T5
      AC: AC1, AC5, AC10, AC11, AC12, AC13, AC15, AC16, AC17
      （AC15 の配線は composeServer の結合テストで pane の環境を見る。AC13 の main.ts の配線は単体テストできないので applySessionEnv の単体テストと実物の CLI の確認で代える）
- [x] T7: web の純関数（`sessionTarget`・`documentTitle`）とタイトルの配線・単体テスト
      対象: `packages/web/src/serverSession/sessionTarget.ts`（新規）・`packages/web/src/serverSession/documentTitle.ts`（新規）・`packages/web/src/main.ts:298` / 根拠: research A10・F9
      依存: T5
      AC: AC3, AC6, AC17
- [x] T8: web のストアと操作（`namedSessionCount`・`DialogContext` の `sessionSwitch`・`openSessionSwitcher`・`openServerSession`・`refreshServerSessions`・hello のたびの更新）と単体テスト
      対象: `packages/web/src/store/session.ts`・`packages/web/src/store/view.ts:170` `DialogContext`・`packages/web/src/actions/ActionDispatcher.ts:251` `openWorktree`（手本）・`packages/web/src/main.ts:205` `onOpened` / 根拠: research A12・A14
      依存: T5
      AC: AC2, AC7
- [x] T9: session の一覧のダイアログ（`SessionSwitchDialog.vue`）と `App.vue` への配置・コンポーネントのテスト
      対象: `packages/web/src/components/SessionSwitchDialog.vue`（新規）・`packages/web/src/components/GroupPickerDialog.vue`（手本）・`packages/web/src/App.vue` / 根拠: research A11
      依存: T7, T8
      AC: AC7, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [x] T10: サイドバーの上端の session のボタン（表示条件・開く操作）とコンポーネントのテスト
      対象: `packages/web/src/components/Sidebar.vue:380`・`:205` `onButtonKeydown` / 根拠: research A13
      依存: T8
      AC: AC2, AC17, AC-I1, AC-I3
- [x] T11: docs（`docs/herdr-parity.md` H33・`docs/tls-setup.md`・`docs/verification.md`）
      対象: `docs/herdr-parity.md:64`・`docs/tls-setup.md`（名前付き session の節）・`docs/verification.md`（名前付き session の手動確認）
      依存: T6, T9, T10
      AC: AC18
