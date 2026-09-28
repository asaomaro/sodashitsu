# タスク: 03-web-graph（グラフ画面）

## 実装方針

design「web」「振る舞いの詳細」の全画面のグラフ画面を、01 の `GraphView.vue`（ネイティブの `<dialog>`・showModal）の中に作る。描画は DOM のノード＋背面の SVG 1 枚、外部ライブラリなし（D-6）。座標・線の経路・当たり判定は client-core/graph の純関数（01 の geometry）を使う。
サーバとのやりとりは `store/graph.ts`（`graph.get|update|pause|resume|history`・`graph.changed`・`graph.fired`）に集める。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- `recordRun` は rev を上げずに `graph.changed` を配る（decisions D5-14）。store は同じ rev の `graph.changed` も当てる。`graph.update` の `rev_conflict` は最新で作り直して送り直し、パネルの編集中なら「他で変わりました」の知らせ。
- ドラッグ中はサーバの値でノードの位置を上書きしない（Splitter と同じ）。
- `graphOpen` の間は dialog モード（キーは xterm へ行かない）。トースト・再接続の表示は dialog の中へ Teleport 済み（01 の 3407a82）。
- 別のマシンのノードの呼び名・チェックリストのマシンの節は 04。03 は手元の pane と、別のマシンのノードの `pane <id>` の表示まで。
- SettingsDialog.test のメモリの漏れで web の vitest はヒープを 4GB にしてある（D4）。新しい試験は `unmount` を忘れない。

## テスト方針

- happy-dom＋@vue/test-utils の部品の試験（store・ノード・線・パネル・チェックリスト・履歴・キーの操作・フォーカスの戻り先・モバイルのシート）。
- 座標・経路は client-core/graph の単体試験（01 のものに足す）。
- E2E は依頼が無いので回さない。

## タスク

- [x] T1: `store/graph.ts`（取得・`graph.changed`〔同じ rev も当てる〕・`graph.fired`・履歴・楽観的な配置とドラッグ中の保護・`rev_conflict` での作り直しと送り直し）
      対象: （新規 `packages/web/src/store/graph.ts`）・`packages/web/src/store/StoreAdapter.ts`（イベントの振り分け）・`packages/web/src/store/session.ts`（pane の要約）
      依存: なし
      AC: AC2, AC10, AC16
- [x] T2: `GraphView.vue` の本体（ツールバー・SVG の線の層・DOM のノードの層・パン/ズーム・全体表示・`GraphNode.vue`・`GraphEdge.vue`〔種類ごとの線種・矢印・ラベル・チップ・無効の ⚠〕・`graph.fired` の光り〔reduced-motion〕）と `usePointerDrag.ts`（ノードの移動・スナップ）
      対象: `packages/web/src/components/graph/GraphView.vue`・（新規 `GraphNode.vue`・`GraphEdge.vue`・`usePointerDrag.ts`）・`packages/client-core/src/graph/geometry.ts`
      依存: T1
      AC: AC1, AC2, AC10, AC-I5
- [x] T3: 線の作成と設定（ハンドルのドラッグ・接続モード `c`・`LinkPanel.vue`〔保存・Ctrl+Enter・取り消しの確認・削除の確認・delegate の注意〕）・一時停止/再開（全体・線ごと）・上限の知らせ（トースト）
      対象: （新規 `packages/web/src/components/graph/LinkPanel.vue`）・`GraphView.vue`・`GraphEdge.vue`
      依存: T2
      AC: AC3, AC11, AC12, AC-I2
- [x] T4: `PaneChecklist.vue`（載せる/外す・外すときの確認で消える線の本数）・`HistoryPanel.vue`・ノードから pane へ移動・入口（サイドバーのメニュー「連携（グラフ）」・モバイルの上部バー）
      対象: （新規 `PaneChecklist.vue`・`HistoryPanel.vue`）・`packages/web/src/components/Sidebar.vue`・`packages/web/src/App.vue`
      依存: T2
      AC: AC1, AC10, AC13
- [x] T5: キーボードとフォーカス（Tab・矢印の移動・Esc の段階・同じ prefix+a で閉じる・開いたときと閉じたときのフォーカス）とモバイルの閲覧（1 本指パン・ピンチ・`MobileGraphSheet.vue` で一時停止/再開だけ）
      対象: `GraphView.vue`・`packages/web/src/main.ts`（dialog モードの keydown）・（新規 `MobileGraphSheet.vue`）
      依存: T3, T4
      AC: AC20, AC-I1, AC-I3, AC-I4, AC-I5
