# 作業

- [x] Muse初期調査・起動/セッションフック/状態ルール/UUID再開（既存作業）
- [x] 5種類の能力差分を確定し共通アダプタの設計と段階を記録
- [x] 会話・過去一覧・作業文脈・ToDo・監督の連携
- [x] デスクトップのモデル/effort・会話・応答・通知
- [x] 利用状況と保存履歴/親子/ツール/比較/レポート
- [x] 隔離した要約・分析のモデル実行、必要な作業起動の連携
- [x] 種類別の権限と残る固有制約の能力表示/文書
- [x] 各段階のテスト、壊れやすい保存/プロトコル/安全境界の独立点検
- [x] 全体のビルド・型・テスト・ブラウザ・独立レビュー
- [x] 稼働環境へ安全なhandoff、既存pane保持、mainへpush

初期Muse実績: core3ファイル115件pass、専用会話等3ファイル62件pass、設定/検出等4ファイル207件pass、全体typecheck pass。新E2Eは不正なfixture名と透明textareaへのclickを修正し、実ブラウザで起動・hookID・idle/working/blocked/idleを確認して1件pass。実Muse1.4.14-R7309.1のローカルechoでSessionStartの環境剥離/親PID一致/会話抽出/UUID再開を確認し、Metaモデルは呼んでいない。core独立レビュー必須指摘なし。AssistantConversationは未レビュー。
