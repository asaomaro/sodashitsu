# 検証記録

- 3段階: none（標準）/actions（操作のみ）/features（操作＋機能展開、既定）。全19テーマ。保存、共有設定の正規化、初期描画、監視解除を検証。
- Web関連32ファイル715テスト成功（theme、prefsApply、display、DisplayFrame系）。設定画面のテーマ関連8件成功。
- Chromiumで全19テーマ×3段階、実SFCの操作/サイドバー開閉/ペインフッター/画面フッター、非対象メニュー/タブ/ラベル、危険操作の配色を検証。
- 実script.htmlのsandbox iframeで3テーマ×3段階を変更。soda.theme、CSS配色、入力ノードの同一性/値、script実行1回を確認。静的iframeも単体テストで内容維持を確認。
- pnpm build / pnpm typecheck 成功。最終Webビルド・Web型検査も成功。
- 設定画面全件を同時に走らせると既知の設定テストのヒープ消費でOOM。テーマ関連に絞って再実行し成功。全件成功とは扱わない。
- 独立レビュー: review_bubble_resizeが配色範囲/設定保存/初期描画を、review_resource_monitorが隔離frame/専用port/状態維持を確認。必須指摘なし。style専用setterの追加差分も再レビュー済。
- CSSクラス規則はdocs/ui-style.md、プラグイン入口はdocs/plugin-packages.md、display APIはdocs/display.mdへ記載。
- デスクトップアシスタント設定の固定フッターは直前mainのda61317aで完了。本変更の稼働更新と同時に配布する。

稼働更新の結果はmain反映後に追記する。
