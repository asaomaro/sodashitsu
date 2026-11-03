# 検証結果

- `pnpm build`: 成功（既存Vite chunkサイズ警告あり）。
- `pnpm typecheck`: 全パッケージ成功。
- Desktop全テスト: 30 files / 234 tests成功。既存の初回設定表示・専用ツール・録音/OCRの終了処理に加え、window-actionの自窓限定・3操作・不正値/子frame/会話窓の拒否を確認。
- `verify:ui`: 成功。生成した設定状態を実Chromiumへ与え、520×670と360×480で外側のスクロール無し・金枠・丸角・テーマ付き内部スクロール・固定ヘッダー・尻尾無しをDOM/レイアウトで検証。ヘッダーボタンのIPC呼び出しと、従来の設定保存・ツールのキーボード/録音/OCR/プラグインの操作を確認。
- `/tmp/soda-assistant-{settings,tools}-styled.png` を生成し、両方を目視確認。
- 同梱host resource検査: 37 entries・6 runtime variants、manifest/hashの検証成功。配布物の実行は行わない。
- Native frameと内部スクロールCSSをそれぞれ一時的に戻すnegative controlで、対応した確認が失敗することを検証。生出力はnegative-controls.md。各変更はbyte-identicalに復元し、Desktop全234テストとブラウザ確認を再実行して成功。
- ブラウザ確認はElectron API部分を生成したpreloadで置き換えている。nativeウィンドウの実際の移動/リサイズ/最大化はOS実機の受け入れ範囲として残る。ホストの操作dispatchと送信元制限は実main.tsをテストしている。

元ログ: /tmp/soda-window-style-{build,typecheck,final-tests,final-ui}.log。
