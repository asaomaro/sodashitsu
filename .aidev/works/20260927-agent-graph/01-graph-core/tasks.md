# タスク: 01-graph-core（型・保存・方式・開く操作）

## 実装方針

design「インターフェース / データ構造」の protocol・`GraphStore`・`graph.*` の方式（実行はまだ無い。02 で足す）と、architecture の client-core/graph（検証・既定値・文面・座標）を作る。
操作表に `open_graph`（既定 prefix+a）を足し、web は `view.graphOpen` を開閉するだけ（画面は 03）、端末版は「ブラウザで開けます」と知らせる（decisions D1-8）。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- 操作表の件数を固定した試験（client-core `bindings.test.ts`・web `KeySettings.test.ts`・tui `TuiDispatcher.test.ts`）と tui の網羅（`satisfies never`）を一緒に直す（research F7.4）。
- `session.json` が読めなかった起動では手元のノードを `stale` にする（research F1.2）。`composeServer.ts:543-548` の読み込みの結果を `GraphStore` に渡す。

## テスト方針

- client-core/graph の単体試験（検証の全規則・既定値・文面の `{output}`・制御文字の除去・座標の計算）。
- `GraphStore` の単体試験（保存・rev・壊れたファイル・`stale`）と、実物のサーバでの `graph.*` の結合試験（取得・更新・`rev_conflict`・一時停止/再開・`graph.changed` の配布・再起動後の復元・未認証の拒否）。
- `open_graph`: web は `graphOpen` の開閉、tui は知らせ。

## タスク

- [x] T1: protocol に graph の型・方式（`graph.get|update|pause|resume|history`）・イベント（`graph.changed`・`graph.fired`）を足す
      対象: `packages/protocol/src/messages.ts:709`（METHOD_SCHEMAS）・`packages/protocol/src/events.ts`・`packages/protocol/src/model.ts`
      依存: なし
      AC: AC13, AC16, AC18
- [x] T2: client-core/graph（`nodeKey`・`validate`・`defaults`・`message`・`geometry`）
      対象: （新規 `packages/client-core/src/graph/`）・`packages/client-core/src/index.ts`
      依存: T1
      AC: AC3, AC6, AC11
- [x] T3: server の `GraphStore`（`graph.json`・`stale`）と `surface/methods/graph.ts`（実行なし。`history` は空）・`composeServer` の配線（読み込み・flush・handoff）
      対象: `packages/server/src/persist/PrefsStore.ts`（手本）・`packages/server/src/composeServer.ts:543-548`・`packages/server/src/surface/methods/index.ts`・（新規 `persist/GraphStore.ts`・`surface/methods/graph.ts`）
      依存: T2
      AC: AC13, AC16, AC18, AC19
- [x] T4: 操作表の `open_graph`（既定 prefix+a）・web の `view.graphOpen` の開閉・tui の知らせ・件数の試験の更新
      対象: `packages/client-core/src/keys/bindings.ts`・`packages/web/src/store/view.ts:308-312`・`packages/web/src/actions/ActionDispatcher.ts`・`packages/tui/src/actions/TuiDispatcher.ts:237-239`
      依存: なし
      AC: AC1, AC19
