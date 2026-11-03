# 検証

- 独立レビュー: /root/review_bubble_resize が差分全体と台帳を点検。451宣言と属性の不一致なし、必須指摘なし。
- 実ソース由来の操作プローブ（作業ビュー/接続ビュー/再試行/リソース更新/ファイル保存/レポート生成/閉じる/保存）をChromiumで描画し、通常/ダークとも金色を確認。危険操作2種、メニュー/一覧/タブ/スイッチ等の元表示とDracula不変も確認。
- sourceの属性のみを戻したnegative controlが失敗し、バイト一致で復元後に通過。negative-controls.mdに生出力。
- Vue型チェック・Vite build通過。
- 関連7ファイル154テスト通過: ViewerTabBar、TabBar、AssistantSettings、WorkspaceView、KeySettings、ScheduleView、UsageAnalytics。
- 66ファイルは配色data属性を除去すると修正前mainのソースとバイト一致。業務処理・イベント・既存class/typeは変更していない。
