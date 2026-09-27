# タスク: 03-tui-core（端末版の本体：接続・モデル・描画・入力・切り離し）

## 実装方針

`packages/tui`（`@sodashitsu/tui`）を作り、`soda`（引数なし）で開いて、サイドバー・tab バー・分割された pane が描かれ、焦点の pane にキーが届き、`prefix+q` で抜けられる所まで作る。
操作（51＋D-7）・モード・マウスの全操作は 04、設定画面・通知・複数ホスト等は 05。ここでは 04/05 が載る骨組み（`TuiApp`・モデル・描画の予約・入力の分解・オーバーレイの差し込み口）を固める。

- 通信: client-core の `Connection` に `ws` を注入（Cookie・Origin・Host・`certSha256` の照合）。hello は `kind: "desktop"`。手順は hello → `client.view` → `pane.subscribe`（`research-protocol.md` R1.4〜R1.7）。4401/401 で `target.login()`→再接続。
- モデル: web の `StoreAdapter`（`packages/web/src/store/StoreAdapter.ts:102-157`）と同じイベントの適用を、pinia 無しの `SessionModel` に。既読（`done`）は client-core の `agentState` で手元に持つ。
- pane: `PaneTerminal`（headless＋unicode11）。SNAPSHOT は `\x1bc`＋本文で作り直し（`packages/client-core/src/net/ports.ts` の説明と同じ）、OUTPUT を書く。`registerCsiHandler` でカーソルの表示・形・マウスの符号化を追う。`onData` は捨てる。
- 割り付け: `computeLayout`（純粋）。サイドバー（`tui-state.json`→`tui.sidebarCols`→26）・tab バー 1 行・tab の分割の木（`LayoutNode` の `ratio`）を枠つきの矩形へ。zoom は焦点の pane だけ。
- 描画: `Screen`（セル格子の差分→ANSI。`?2026`・カーソルを隠す・CUP＋SGR・全角・最後に本物のカーソル）と、pane の中身・サイドバー（workspace とエージェントの行・状態の記号。client-core の `groupedWorkspaceRows`・`resolveRows`・`stateIndicator`）・tab バー・枠の最小限の chrome。`render/color.ts`（テーマ→SGR）。
- 大きさ: 自分の割り付けの各 pane の大きさを `client.view` で申告し、実際の大きさ（`pane.size_changed`）が違えば左上を合わせて切り取る。
- 入力: `decode`（キー・SGR マウス・ブラケットペースト・フォーカス）。client-core の `KeyRouter` を通し、prefix 以外は焦点の pane へ（DECCKM に合わせて符号化）。この subtask で動かす操作は `detach` と、pane の焦点の移動（`focus_pane_*`）・`toggle_sidebar` の骨組みだけ（残りは 04）。
- 終了: 外側の端末のモードを必ず戻す（`packages/cli/src/commands/attach.ts` の作法を写す）。
- server の `main.ts` の仮の入口を `import("@sodashitsu/tui").runTui(target)` に差し替える。

## 作業順序と依存関係

下の `依存:` に従う。T4（描画）と T5（入力）は T3 の後で互いに独立。

## リスク / 留意点

- headless の既定色は -1（research F4.2）。
- 全角の右隣・行末の全角・結合文字の幅（unicode11）。
- SNAPSHOT はいつでも来る（流量制御の回復）。
- 端末のモードの復元漏れは利用者の端末を壊す。異常終了（例外・シグナル）の経路をテストする。

## テスト方針

- 純粋な部品（`computeLayout`・`Screen.diff`・`decode`・キーの符号化・`SessionModel` のイベントの適用）は単体テスト。
- `runTui` は `TuiIo`（stdin/stdout/大きさ/環境）を注入し、実物のサーバ（server の integration test と同じ形・一時の状態ディレクトリ）に繋いで、出力の列を headless に流して画面の文字を確かめる（「サイドバーに workspace 名が出る」「pane にコマンドの出力が出る」「prefix+q で終わり、モードが戻る」）。
- `soda`（引数なし）を node-pty の中で起動する結合テストを 1 本（起動→描画→q で抜ける→再び起動して同じ画面）。

## タスク

- [ ] T1: `packages/tui` を作り、`runTui(target, io?)` の入口・`TuiApp` の骨組み・外側の端末のモードの有効化と復元（終了・シグナル・例外）を作る
      対象: `packages/client-core/package.json`（写す元）・`packages/cli/src/commands/attach.ts`（モードの復元の作法）・（新規 `packages/tui/`）
      依存: なし
      AC: AC3
- [ ] T2: 接続（`ws` の注入・Cookie/Origin/Host・証明書の指紋・再ログイン・再接続）と `SessionModel`（イベントの適用・既読）
      対象: `packages/client-core/src/net/Connection.ts`・`packages/cli/src/wsClient.ts:210-273`・`packages/web/src/store/StoreAdapter.ts:102-157`・`packages/web/src/store/session.ts`
      依存: T1
      AC: AC10, AC11, AC12
- [ ] T3: `PaneTerminal`（headless＋unicode11・SNAPSHOT/OUTPUT・モードの追跡）と購読の管理（見えている pane の subscribe/unsubscribe）
      対象: `packages/server/src/terminal/Mirror.ts:141-149,196`・`packages/web/src/term/TerminalRegistry.ts:258-259`・`packages/web/src/term/ViewSync.ts:44-58,96-111,152-156`
      依存: T2
      AC: AC6, AC3
- [ ] T4: 割り付け（`computeLayout`）・`Screen`（差分描画）・`color.ts`・pane の中身と最小限の chrome（サイドバー・tab バー・枠）・大きさの申告と切り取り
      対象: `packages/client-core/src/layout/layoutOrder.ts`・`packages/client-core/src/sidebar/*`・`packages/client-core/src/workspace/workspaceGrouping.ts`・`packages/client-core/src/theme/*`・`scratchpad/herdr/src/protocol/render_ansi.rs:578-603`（手順の参考）
      依存: T3
      AC: AC2, AC6, AC10, AC11
- [ ] T5: 入力（`decode`・`KeyRouter`・pane へのキーの符号化・ブラケットペースト・フォーカスの報告）と `detach`・`focus_pane_*`・`toggle_sidebar`
      対象: `packages/client-core/src/keys/KeyRouter.ts`・`packages/client-core/src/keys/chord.ts`・`packages/cli/src/attachKeys.ts`
      依存: T3
      AC: AC3, AC6, AC-I5
- [ ] T6: `soda`（引数なし）から `runTui` を呼ぶ（server の仮の入口を差し替え）・node-pty での結合テスト（起動・描画・切り離し・再び開く）。端末版の切り離し・終了で `/api/logout` を送る（02 の review ラウンド 2）。server の `launch/localHttp.ts` の証明書の照合の写しを `@sodashitsu/tui/pinnedTls` に寄せる。tui の devDependency の server との循環を解く
      対象: `packages/server/src/main.ts`・`packages/server/src/launch/findOrStart.ts`（02 で作ったもの）・`packages/server/package.json`
      依存: T4, T5
      AC: AC1, AC2, AC3, AC4
