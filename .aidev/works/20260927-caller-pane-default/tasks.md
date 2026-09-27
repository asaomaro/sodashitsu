# タスク: 呼び出し元の pane を既定の対象にする（`wtmctl pane current`・`pane split` の対象の省略・`--pane`・`--current`）

## 実装方針

design のとおり、引数の解釈（`cliArgs.ts`）→ 実行時の解決（`paneTarget.ts`）→ コマンド（`commands/pane.ts`・`main.ts`）→ 結合テスト・smoke → 文書の順に組む。
サーバ・プロトコルは触らない。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- `pane-split` の `paneId` を `target` に置き換えるので、既存のテスト・結合テスト（`main.integration.test.ts`・`agent.integration.test.ts`・`commands/pane.test.ts`）も合わせて直す。
- T1 で `pane-split` の `paneId` を `target` に置き換えるので、T3 までは `commands/pane.ts`・`main.ts`・既存の結合テストの型検査が通らない。T1・T2 は
  それぞれの単体テスト（`vitest run <ファイル>`）だけで確かめ、`typecheck`・全体テストは T3 の後に打つ。
- design が未確認とした 2 点（hello が移動後の状態を返すこと・`pane.split` が存在しない pane に返す code）は、T4 の結合テストと既存のまま出すことで扱う。
- `USAGE_LINES` を変えると `skill.test.ts` が skill の本文に `pane current` を要求する——T6（skill）までは落ちる。T1 と T6 の間は全体テストで確かめない。
- prettier は新規ファイルと HEAD で整形済みのファイルにだけ。

## テスト方針

- 単体: `cliArgs.test.ts`（解釈表の全行・誤り）・`cliArgs.machine.test.ts`（`--machine` の置き換え）・`paneTarget.test.ts`（同じサーバか・フォーカス）・
  `commands/pane.test.ts`（split の 3 種類の対象・current の出力・request を送らない・not_found・接続しない）。
- 結合: `paneCurrent.integration.test.ts`（実サーバで pane を別 tab へ移した後の `pane current`）。
- smoke: ビルド済みの wtmctl に pane の中の環境を与えて `pane current`・対象を省いた `pane split`。
- 負の確認: 解決の分岐（同じサーバの判定・explicit の置き換え・focus の null・対象の数の検査）を 1 つずつ壊し、テストが落ちることを確かめる。
- 全体: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`・`aidev smoke`。

## タスク

- [x] T1: `PaneTarget` 型・`parsePaneTarget`・`pane split` の対象の 4 通り・`pane current` の解釈・`USAGE_LINES`・`parseMachinePrefixed` の置き換えと、その単体テスト
      対象: `packages/cli/src/cliArgs.ts` `parsePane` `parseMachinePrefixed` `USAGE_LINES` / `packages/cli/src/cliArgs.test.ts` / `packages/cli/src/cliArgs.machine.test.ts`
      依存: なし
      AC: AC2, AC3, AC4, AC10, AC11
- [x] T2: 実行時の解決 `resolveCallerPane`・`resolveFocusedPane`・`paneTargetIdBeforeConnect`（`selfPaneId` の export）と単体テスト
      対象: `packages/cli/src/paneTarget.ts`（新規）/ `packages/cli/src/selfGuard.ts` `selfPaneId` / `packages/cli/src/paneTarget.test.ts`（新規）
      依存: T1
      AC: AC9, AC12, AC13, AC14
- [x] T3: `runPaneSplit` の `target` 対応・`runPaneCurrent`・`main.ts` の分岐と help の説明、既存テストの `target` への書き換えと単体テスト
      対象: `packages/cli/src/commands/pane.ts` `runPaneSplit` / `packages/cli/src/main.ts` `printHelp` `main` / `packages/cli/src/commands/pane.test.ts` / `packages/cli/src/main.integration.test.ts` / `packages/cli/src/agent.integration.test.ts`
      依存: T2
      AC: AC1, AC2, AC5, AC7, AC8, AC9, AC12, AC13, AC14, AC15
- [x] T4: 結合テスト——実サーバで pane を別 tab へ移した後の `pane current` が移動後の tab・workspace を返す（呼び出し元〔pane の中の環境〕で打つ）
      対象: `packages/cli/src/paneCurrent.integration.test.ts`（新規）
      依存: T3
      AC: AC6
- [x] T5: smoke——ビルド済みの wtmctl に `WTM_PANE_ID`・`WTM_SERVER_URL` を与えて `pane current`・対象を省いた `pane split`（新しい pane が同じ tab に居る）
      対象: `packages/cli/src/smoke.ts` `main`
      依存: T3
      AC: AC1, AC17
- [x] T6: skill・`docs/wtmctl.md`・`docs/herdr-parity.md`（H39）の更新
      対象: `packages/cli/skills/wtmctl/SKILL.md`「ID と自分の位置」「隣の pane で…」「エージェントを起動して…」「コマンドの一覧」/ `docs/wtmctl.md`「コマンド一覧」「pane の環境変数」「skill ファイル・pane の環境変数」/ `docs/herdr-parity.md` H39
      依存: T1
      AC: AC15, AC16
