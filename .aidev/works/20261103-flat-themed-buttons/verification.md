# テーマボタンのフラット表示

色だけを変更するとブラウザ標準のoutset枠が残る。共通ボタンCSSにappearance:none、1px solid枠、影の解除を追加。配色なしでも基本のフラット表示を適用。部品独自の枠・danger/plain・選択/フォーカスの表示は維持する。

- 実RemoteDesktopWindowの操作ボタン/情報設定ボタンをChromiumのソース検証へ追加。
- 全19テーマ×3段階で配色とフラット枠を検証、成功。
- 修正CSSのみHEADへ戻す負例でnative button bevel remainsとして失敗。CSS復元SHA256: 6364e4114afce7e7e774778a308c6c1e86da114d4e18b4b92031666966228245。出力はnegative-control.txt。
- Web Vite build成功、CSSのみの変更。review_bubble_resize独立レビュー完了、必須指摘なし。

稼働Webで対象ボタン464個を検出し、立体枠0個を確認。mainへpush済み。
