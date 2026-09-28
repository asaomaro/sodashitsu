# タスク: 05-tui-features（設定画面・通知・複数ホスト・テーマ・クリップボード・画像・独自コマンド）

## 実装方針

03/04 の上に、design「設定画面（端末版）」「通知」「複数ホスト」と tui のモジュール表の `notify/`・`clipboard.ts`・`image/`・`render/color.ts` を載せる。
設定は 02 の `prefs.*`（共有）と `tui-state.json`（手元）。通知の方針は client-core の `routesFor`（web と同じ）。複数ホストは web の `MachineWiring`・`MachineSummaryClient`（client-core）と同じ形。
独自コマンド（`commands.json`・`command:<id>`）は web の `CommandPopupSession`・独自コマンドの実行と同じ RPC。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- 設定画面は項目が多い（web の 5 節＋`tui` 節）。web の `SettingsDialog.vue` の項目と同じ意味・同じ保存先にする。
- 通知の端末の判定は環境変数に頼る。SSH 越しでは判定できないので `tui.notifyDelivery` の上書きを必ず効かせる。
- Kitty graphics は対応する外側の端末だけ。Windows Terminal・VS Code では `[画像]` の印に落とす。
- クリップボードの画像の読み取りは OS の道具（`wl-paste`/`xclip`/PowerShell）。無ければ知らせる。

## テスト方針

- 設定画面: キーの列 → 画面の文字と `prefs.set` の中身（各節）。Esc の 2 段（項目→節の一覧→閉じる）。
- 通知: 状態のイベント → 経路（`routesFor`）→ 出力の列（トースト・BEL・OSC 9/99/777・tmux の包み）。端末の判定は環境変数の表。
- 複数ホスト: 偽の接続でマシンの一覧・要約・選んだマシンの画面の接続。実物は server の machine の結合テストの形（`machineSmoke.ts`）。
- クリップボード・画像: 出力の列と、OS の道具の呼び出し（差し替え）。

## タスク

- [x] T1: 設定画面（通知・テーマ・表示・端末・キー・`tui` 節。項目の一覧・切り替え・選択肢・入力欄・キーの割り当ての待ち）と `mouseCapture` の実行中の切り替え
      対象: `packages/web/src/components/SettingsDialog.vue`・`packages/web/src/store/settings.ts`・`packages/tui/src/model/PrefsModel.ts`・`packages/client-core/src/keys/assign.ts`・`presets.ts`
      依存: なし
      AC: AC8, AC11, AC-I1, AC-I2, AC-I3, AC-I4
- [x] T2: テーマの配色（`themeOverrides`・明暗の自動・`client.theme` の送信）とサイドバーの行のカスタマイズ（`sidebarRows`・`resolveRows`）
      対象: `packages/tui/src/render/color.ts`・`packages/web/src/theme/themeOverrides.ts`・`packages/web/src/theme/ThemeController.ts`・`packages/client-core/src/sidebar/resolveRows.ts`
      依存: T1
      AC: AC2, AC11
- [x] T3: 通知（`routesFor`・フォーカスの報告・トースト・BEL・OSC 9/99/777・tmux の包み・`tui.notifyDelivery`・`prefix+o`・通知の一覧・トーストのクリック）
      対象: `packages/client-core/src/notify/policy.ts`・`describe.ts`・`packages/web/src/notify/NotificationController.ts`・（新規 `packages/tui/src/notify/`）
      依存: なし
      AC: AC13, AC-I1, AC-I3, AC-I4
- [x] T4: 複数ホスト（マシンの一覧・要約の接続・選んだマシンの画面の接続・サイドバーのマシンの見出し・マシンをまたぐ移動）
      対象: `packages/client-core/src/net/MachineSummaryClient.ts`・`packages/web/src/`（`MachineWiring`。場所は未特定）・`packages/tui/src/net/`
      依存: なし
      AC: AC14
- [x] T5: クリップボード（OSC 52・OS の道具・コピーと貼り付け）と画像（Kitty graphics の出し直し・`[画像]` の印・`remote_image_paste`）
      対象: `packages/web/src/term/ImagePaster.ts`・`packages/server/src/terminal/KittyGraphics.ts`・（新規 `packages/tui/src/clipboard.ts`・`image/`）
      依存: なし
      AC: AC7, AC15
- [x] T6: 独自コマンド（`commands.json` のキー・popup の端末・pane/shell の実行）と `agent_integration.changed`・`command.*` のイベント
      対象: `packages/client-core/src/keys/commandKeys.ts`・`packages/web/src/term/CommandPopupSession.ts`・`packages/tui/src/model/SessionModel.ts:162`
      依存: なし
      AC: AC5, AC8
- [x] T7: herdr の端末画面にあって端末版で「非対応」にしていたものを作る（06 の一覧の清書で見つかった。requirements は herdr の端末画面の機能を全部対応にする）: 外側の端末のタイトル（H14・`window_title`。終わるときに戻す）、tab バーの位置・右端の表示・1 個なら隠す（H22・共有の設定を読む）、pane の枠の描画モードとエージェント名の表示（H23）、onboarding（H25b）、pane の BEL を外側の端末へ（H29d・前面のとき）、閉じる確認を切る・名前を先に聞く設定（H50・`tui` 節）
      対象: `docs/tui-parity.md:43,52,54,59,72,93`・`packages/tui/src/render/chrome/tabBar.ts`・`packages/tui/src/render/chrome/frame.ts`・`packages/tui/src/app/terminalModes.ts`・`scratchpad/herdr/src`（参考）
      依存: なし
      AC: AC2, AC15
