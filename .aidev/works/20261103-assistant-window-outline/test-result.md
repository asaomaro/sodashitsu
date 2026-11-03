# 検証

- `pnpm build`・`pnpm typecheck`: 全パッケージ成功。既存Vite chunkサイズ警告あり。
- Desktop全テスト: 30 files / 237 tests成功。8方向/極端delta/小画面/負座標、gesture失効、画面撤去後restore、shell権限拒否、remote rendererのpreload無し、bounds追従、破棄されたview参照を模擬したchildcloseを検証。
- サーバー側関連: AssistantHostBundle / AssistantLaunchController / ManagedAssistant、3 files / 25 tests成功。合成Electron exportへWebContentsViewを追加し、新panel/windowリソースの同梱も確認。
- `verify:ui`: 成功。設定・ツール・panelの520×670/360×480で、透過body・カードのx/y=0・viewport全幅・header30px以下・ページ外スクロール無し・尻尾無しを実Chromium DOMで確認。panel枠からresize-startが発生するpointer操作も観測。既存設定/会話/ツールの一連の検証を継続。
- `/tmp/soda-assistant-{settings,tools,panel}-styled.png`を生成。panel画像を目視し、外側の帯が無く小さいヘッダーであることを確認。panelの本文はブラウザ検証用の生成した文字であり、本物の操舵室ではない。
- 実Electron45.1.0（Linux ozone=headless、隔離userData、一時データのみ）でもlocal shell＋WebContentsViewを起動。header30/body透過/slot y42、別rendererへのchar入力、親閉鎖時のchild破棄を確認。native capturePageはheadlessで1×1を返すため、nativeの画素検証としては扱わない。Windows実機でのcompositor描画と操作の確認は別途。
- 3件のnegative control: opaque外周、未補正restore、破棄後view参照へそれぞれ戻すと対象確認が失敗。SHA256一致で復元し、Desktop全237テストとverify:uiを再実行して成功。生出力はnegative-controls.md。

ログ: `/tmp/soda-outline-{final-build,final-typecheck,final-tests,final-ui,server-tests,native}.log`。

## 稼働反映

同梱38リソース・6 runtime variantsのmanifest/hash検証成功。mainへfast-forward統合後、安全なhandoffで6つの実端末を停止せず維持した。反映前8ペインのUUID全件が反映後も存在することを確認。デスクトップアシスタントはphase=running / stage=ready。
