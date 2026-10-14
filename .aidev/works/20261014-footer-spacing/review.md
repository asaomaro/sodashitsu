# フッターの左余白

フッターの外側padding 0 8pxとボタン・内容間gap 1emを0にする。24px幅のボタン直後から情報が始まり、ペインstatuslineと一致する。

独立レビュー `/root/review_footer_spacing`: 指摘なし。項目間のgap、横スクロール、高さは保持。
Web build通過、既存のフッターE2E 1ケース通過（Web/mobile設定・共有・空項目からの再設定）。生成したモバイル画面 `/tmp/system-footer-mobile.png` で24pxボタン直後の文字表示を目視確認。低影響のCSS修正として新規テストは追加しない。
