# 検証

- pnpm build / pnpm typecheck: 全パッケージ成功。
- @sodashitsu/tui test: 80ファイル756件成功。新規8件はモニター状態/取得停止/unknown合計/最新条件キュー/古いホスト応答/狭幅/手動レポート/TuiAppメニュー入力統合を検証。
- 外部cwd /tmpでビルド済みMonitorViewを起動し、稼働サーバの実RPCでanalytics/resourcesを読取・描画。両方成功。モデル呼出・pane作成・PTY attach/resizeなし。/tmp/soda-tui-analytics-live.txt、/tmp/soda-tui-resources-live.txtへ描画を保存。
- 独立レビュー: review_resource_monitorがprefix送信漏れと集計要求重複、review_bubble_resizeが未取得を0表示する問題を検出。全て修正し差分再レビュー済み、追加指摘なし。
- 各修正のみ取り消した負例で、prefixのbinary送信、rapid filter要求1→4件、token未取得→0表示の検査が失敗することを確認。negative-*.txtへ原文保存、修正は元のbytesへ復元・SHA同一を確認。
- 既存「状況」と区別した独立画面。「その他」から起動、Escで戻る。docs/tui.mdとtui-parity.mdへキー、制約、取得対象、明示的CLI分析を記載。

## 稼働反映

main 8abb3fe1としてpush済み。サーバhandoffで10pane UUID/8実行PTYを保持。次に起動する端末版sodaから追加画面を利用可能。既存TUIはprefix+qで切り離して起動し直す。
