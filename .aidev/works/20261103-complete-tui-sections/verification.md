# 四辺のセクションと透過設定

## 基準と適用

関連データのまとまりは四辺で囲み、操作帯/補足は枠外に置く。共通sectionRule/Sides/Boxを使用。Monitorは全sectionに自動で終了線を補い全内部行の左右線を描く。状況はアカウント/エージェント、予約は一覧/設定/結果、外部接続は各分類/フォームにも適用。ノード/履歴/設定/各種ダイアログは既存の四辺枠を確認した。文字/カーソル/クリック/scrollbar用の列と行を予約する。

透過はfullscreen履歴/外部接続/別窓端末を含む地と静的カード/ヘッダーへ適用。モーダル履歴やメニュー等は不透明を維持し、端末の明示ANSI背景と選択/操作背景は保持。

## 点検

review_bubble_resize/review_resource_monitorが低いConnectionsフォームの操作行と下枠の重なりを指摘。高さ15/幅12未満のフォームでは枠を省略して入力/送信を優先するよう修正し、h11/h13の回帰テストを追加。差分再レビューで追加必須指摘なし。

SectionFramesの各monitorタブ/スクロール中の左右線、既存状況/予約/接続の四辺、履歴fullscreen/modalの透過分岐、静的サマリーと選択背景の透過を検証。GraphTerminalは実snapshotの既定背景とANSI赤背景をfalse/true/falseで検証。修正のみ取り消したnegative-*.txtの各負例が失敗し、元のbytesへ復元している。

## 最終結果

TUI全82ファイル765件成功。root build/typecheck成功。ビルド済みMonitorViewで稼働サーバへread-only RPCを行い、分析/リソース両画面の描画を確認。/tmp/soda-tui-visual-preview.pngで全データ行の左右線と終端線も目視した。
