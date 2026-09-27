# タスク: サイドバー行の独自トークンと、行の並び・色の条件付け

## 実装方針

architecture.md「tasks への申し送り」の順: protocol（型・schema）→ server の純粋な規則 → server の配線 → cli → web の純粋な規則 → store → `Sidebar.vue` →
設定画面の部品 → smoke・docs。純粋な規則（server `metadataTokens.ts`・web `rowLayout.ts`・`resolveRows.ts`）は herdr の一次資料（research F1〜F15）に 1:1 で
対応させて単体テストで網羅し、配線は偽物・結合テストで確かめる。`Sidebar.vue` を変える前に golden（変更前の描画）を取ってある
（`packages/web/src/components/Sidebar.defaultLayout.test.ts`・`__golden__/`。design の段階で取得済み）。

## 作業順序と依存関係

下の `依存:` に従う。T1（protocol）が server・cli・web の型の前提。web の純粋な規則（T6・T7）は server（T2〜T4）と独立に進められる。

## リスク / 留意点

- 既定の描画のずれ（AC10）——golden の比較と既存の `Sidebar.test.ts` で守る。golden は変更前の `Sidebar.vue` で取ったもので、**更新しない**（更新が要るなら既定の見た目が変わったということ）。
- 外から来た値の描画の安全（AC9）——`v-html` を使わない・色は検証済みだけ・値は `Object.hasOwn` で引く。
- 期限のタイマー——テストは偽の時計とタイマー。既定のタイマーは `unref`。起動したサーバ・子プロセスは片付ける（共有マシン）。負荷試験・E2E はしない。
- `exactOptionalPropertyTypes`——任意の項目は `undefined` を入れず、キーごと付けない。
- prettier は新規ファイルと HEAD で整形済みのファイルにだけ。`pnpm -s` は終了コードで判定する。

## テスト方針

- 単体: `metadataTokens.test.ts`（整え方・検査・seq・キー数・期限・帳簿）、`MetadataService.test.ts`（検査の順・変わらないと配らない・タイマー・閉じたときの破棄・dispose）、
  `SessionModel`/`SessionService` の `tokens` の反映、`messages.test.ts`（schema）、`cliArgs.test.ts`（`--token` の見分け・誤り）、`skill.test.ts`（既存の照合）、
  `rowLayout.test.ts`（読み込みの落とし方・色・名前・条件の当たり方・数の読み方）、`resolveRows.test.ts`（値の有無・行の消え方・代わりの行・条件・見た目）、
  `settings.test.ts`（`sidebarRows` の保存・追従）、`ActionDispatcher` の `reloadConfig` のテスト（`sidebarRows` を読み直す）、`Sidebar.test.ts`（並びを変えた描画・独自トークン・HTML の値・見た目）、`Sidebar.defaultLayout.test.ts`（golden）、
  `SidebarRowsSettings.test.ts`（操作・下書き・確認・フォーカス・上限）。
- 結合: server の RPC → `workspace.updated`/`pane.updated` → snapshot、`session.json` に `tokens` が載らないこと、未認証の接続では RPC に届かないこと（`composeServer` の実物）。
- 起動確認: `packages/cli/src/smoke.ts` に、ビルドした `wtmctl` で `workspace report-metadata` を打ち、`wtmctl snapshot` の workspace に `tokens` が載ることを足す。
- 回帰の負の確認（規約 regression-negative-control）: 検査・正規化・seq・期限・条件・既定の DOM・値の引き方（`hasOwn`）を 1 か所ずつ壊して、該当テストが落ちることを確かめる。

## タスク

- [x] T1: protocol に `Workspace.tokens`・`Pane.tokens` と `workspace.report_metadata`・`pane.report_metadata` の schema・結果・上限の定数を足す
      対象: `packages/protocol/src/model.ts` `Workspace` `Pane`・`packages/protocol/src/messages.ts` `METHOD_SCHEMAS` `MethodResultMap`・`packages/protocol/src/messages.test.ts`
      依存: なし
      AC: AC1, AC2
- [x] T2: server の純粋な規則 `metadataTokens.ts`（整え方・検査・`MetadataTokenBook`）とその単体テスト
      対象: `packages/server/src/metadata/metadataTokens.ts`（新規）・`metadataTokens.test.ts`（新規）
      依存: T1
      AC: AC3, AC4, AC5, AC6
- [x] T3: `MetadataService`（検査の順・帳簿の表・タイマー・bus の購読）と `SessionModel`/`SessionService` の `setWorkspaceTokens`・`setPaneTokens`・`hasWorkspace`・`hasPane`
      対象: `packages/server/src/metadata/MetadataService.ts`（新規）・`MetadataService.test.ts`（新規）・`packages/server/src/session/SessionModel.ts`・`SessionService.ts`・それぞれのテスト
      依存: T2
      AC: AC1, AC2, AC4, AC5, AC6, AC7
- [x] T4: RPC の登録と `composeServer` の組み立て・終了、結合テスト（RPC → イベント → snapshot・session.json に載らない・未認証では届かない）
      対象: `packages/server/src/surface/methods/deps.ts` `MethodDeps`・`workspace.ts`・`pane.ts`・`packages/server/src/composeServer.ts`（組み立て `:223-250`・`close()` `:474-510`）・
      `packages/server/src/composeServer.metadata.integration.test.ts`（新規）
      依存: T3
      AC: AC1, AC2, AC7, AC18
- [x] T5: `wtmctl workspace|pane report-metadata` の解釈・実行・help・skill ファイル・`docs/wtmctl.md`
      対象: `packages/cli/src/cliArgs.ts` `USAGE_LINES` `parseFlags` `parseWorkspace` `parsePane`・`packages/cli/src/commands/workspace.ts`・`commands/pane.ts`・`packages/cli/src/main.ts`・
      `packages/cli/skills/wtmctl/SKILL.md`・`docs/wtmctl.md`・`packages/cli/src/cliArgs.test.ts`・`packages/cli/src/skill.test.ts`（既存の照合を通す。必要なら更新）
      依存: T1
      AC: AC8
- [x] T6: web の並びの規則 `rowLayout.ts`（型・既定・読み込み・色と名前の検査・条件の当たり方・数の読み方）とその単体テスト
      対象: `packages/web/src/sidebar/rowLayout.ts`（新規）・`rowLayout.test.ts`（新規）
      依存: なし
      AC: AC9, AC11, AC13, AC14
- [x] T7: web のトークンの解決 `resolveRows.ts` とその単体テスト
      対象: `packages/web/src/sidebar/resolveRows.ts`（新規）・`resolveRows.test.ts`（新規）
      依存: T1, T6
      AC: AC12, AC13, AC14
- [x] T8: 設定 `sidebarRows`（保存・`setSidebarLayout`・`storage` の追従・`reloadConfig`）
      対象: `packages/web/src/store/settings.ts` `useSettingsStore`・`packages/web/src/actions/ActionDispatcher.ts` `reloadConfig`・`packages/web/src/store/settings.test.ts`・`ActionDispatcher` の `reloadConfig` の既存のテスト（読み直しを足す）
      依存: T6
      AC: AC11, AC15
- [x] T9: `Sidebar.vue` を並びで描く（主の行・補足の行・代わりの行・畳んだとき・手動グループの見出し・見た目の style）。golden・独自トークン・HTML の値のテスト
      対象: `packages/web/src/components/Sidebar.vue` `SpaceRow` `workspaceRow` `agents`・テンプレート `:433-495`・`Sidebar.test.ts`・`Sidebar.defaultLayout.test.ts`（走らせるだけ。golden は変えない）
      依存: T7, T8
      AC: AC9, AC10, AC12, AC13
- [x] T10: 設定画面の並びの編集の部品 `SidebarRowsSettings.vue` と `SettingsDialog.vue` への配置
      対象: `packages/web/src/components/SidebarRowsSettings.vue`（新規）・`SidebarRowsSettings.test.ts`（新規）・`packages/web/src/components/SettingsDialog.vue`（節「表示」`:684-827`）
      依存: T8
      AC: AC11, AC13, AC14, AC15, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [x] T11: 起動確認の追加と docs（H21）・backlog
      対象: `packages/cli/src/smoke.ts`・`docs/herdr-parity.md` H21・`.aidev/backlog/product-roadmap.md`
      依存: T4, T5, T9, T10
      AC: AC16, AC17
