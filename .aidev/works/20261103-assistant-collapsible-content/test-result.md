# 検証

- Desktop全テスト30 files / 238 tests成功。
- 関連サーバー3 files / 25 tests成功。新sections.jsの同梱をmanifestで検証。
- `pnpm build`・`pnpm typecheck`: 全パッケージ成功。既存Vite chunkサイズ警告あり。
- `verify:ui`: 実Chromiumで3サイズの会話に40件の長文、256件のroster、長い返答/入力を表示。外側の本文だけがscrollし、nested scrollerが0、会話やrosterが自然高であることをDOMで確認。会話のkeyboard折り畳み、送信ボタンまで全体scrollで到達できることも確認。
- 長いlicenseの全表示と折り畳み、fold内のinvalid controlの展開、clipboardからの長い文章の自動高さ、通知全体/個々のfoldと通知更新後のopen/draft保持を確認。既存の保存/音声/録音/OCR/プラグイン/会話操作の確認も成功。
- negative control 2件: 通知枠の高さ上限/内側scroll、textarea autosizeの停止をそれぞれ戻すとブラウザ確認が失敗。生出力はnegative-controls.md。各回SHA256一致で復元し、最終verify:uiは成功。
- /tmp/soda-sections-conversation.pngと設定画面の生成スクリーンショットを目視確認。実Windowsの表示は稼働反映後の受け入れ範囲。
- 同梱39リソース・6 runtime variantsのmanifest/hash検証成功。

ログ: /tmp/soda-sections-{tests,final-ui,build,typecheck,server-tests}.log。

mainへfast-forward統合し安全なhandoffで反映。6つの実端末を停止せず維持し、8ペインUUID全件を保持した。デスクトップアシスタントのphase=running / stage=readyを確認。
