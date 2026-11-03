# 操作ボタンに限定した配色

## 原因と修正

HTMLのbutton要素すべてに金色の面・角丸・選択枠を適用していたため、操作にbuttonを用いるメニュー項目やサイドバー見出しまでボタン表示になっていた。

配色の対象を既存の操作用クラス、フォーム送信、明示data-assistant-action等に限定。hover/focus/選択の装飾も同じ対象へ絞る。設定のスイッチ印に対する代替配色を削除し、元のコンポーネント表示へ戻す。スクロールバーの金色は維持。

## 検証

- packages/e2e/scripts/verify-assistant-controls.mjs: 実VueコンポーネントのCSSをChromiumで読み、通常/ダーク/Draculaでメニュー、画面切替、sidebar見出し/並べ替え/グループ/接続先/アイコン、設定目次/スイッチが配色CSS適用前後で不変と確認。操作ボタンだけ金色、スクロールバーは金色を確認。
- negative-controls.md: 配色修正だけを戻すとサイドバー見出しの背景/角丸が変わって失敗。元へバイト一致で戻して再検証成功。
- pnpm --filter @sodashitsu/web build（Vue型チェック・Vite配布物生成）成功。
- /root/review_bubble_resizeの差分全体の独立レビューで必須指摘なし。
