# PCアイコンによる接続状態表示

- リモートデスクトップ起動ボタンをSVGのPCアイコンへ変更。ローカルPCは操作のないimg roleのspanとして同じ状態表示。
- 接続済み=テーマのstate-done、接続/再接続中=warn、要対応=error。状態表示はアクセント配色より優先し、plainクラスで共通ボタン塗りを除外。
- 可視の状態文字列を削除し、titleとaria-labelの状態説明は保持。既存の接続条件/起動動作は維持。
- Sidebar.machines関連8テスト成功。実ソースSVG/CSSのChromium検証で通常/ダーク/Draculaの3状態の色が区別できることを確認。
- Web build（vue-tscを含む）成功。review_bubble_resizeの独立レビューと追加role/assert差分の再レビュー完了、指摘なし。
