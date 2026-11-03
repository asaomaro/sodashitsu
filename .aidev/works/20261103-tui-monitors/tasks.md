# 端末版の利用分析・リソースモニター

- [x] 独立screenと「その他」の導線、render/input/prefix/mouse連携。
- [x] 既存RPCによる集計、期間/CLI/親子の切替、概要/比較/親子ツール/収集状況/明示的AIレポート。
- [x] Resource全対象合計/null件数/ホスト/プロセス一覧、group/sort。
- [x] 表示/接続中のみpoll、停止/復帰/reset/dispose、古い応答を無視、集計要求single-flightと最新条件の予約。
- [x] 関連単体・TuiApp統合テスト、独立レビュー及び指摘差分の再レビュー、docs。
- [x] 最終ビルド/全TUIテスト/型検査/実RPC読取smoke。main反映は検証記録へ追記。

状態・プロトコル境界の実装は全体独立レビューで重点点検。review_resource_monitorがbusy/入力境界、review_bubble_resizeが未取得/表示/導線を担当し、指摘修正後も各差分を再レビュー済み。別セッションへの実装委任はしない。
