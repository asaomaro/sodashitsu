# 検証

- Desktop全テスト: 30 files / 238 tests成功。設定・ツール・操舵室の3窓で最大化→moveイベント→元サイズ/非最大化通知→直後のresize→再度の最大化/復元を実main handlerで確認。実OSのドラッグはイベントで模擬し、Windows実機の受け入れ範囲として残る。
- `verify:ui`: 成功。3画面・2サイズの実Chromium DOMで、最大化時の重なり矩形2path、通常時の単一rect、ボタンの名前・data-maximized、外部状態変更時の更新、古いrevisionで表示が戻らないことを確認。ホスト部分は生成preloadを使い、別途mainのテストで検証。
- move購読とアイコン切替をそれぞれ一時的に戻すと回帰確認が失敗。SHA256一致で復元してDesktop全238テストとverify:uiを再実行して成功。生出力はnegative-controls.md。

ログ: /tmp/soda-maximize-{final-tests,final-ui,build,typecheck}.log。

`pnpm build`と`pnpm typecheck`は全パッケージ成功。関連サーバー3 files / 25 testsも成功。同梱38リソース/6 runtime variantsのmanifest/hash検証成功。独立レビューの必須指摘なし。

mainへfast-forward統合し安全なhandoffで反映。6つの実端末と8ペインUUID全件を維持。デスクトップアシスタントのphase=running / stage=readyを確認した。
