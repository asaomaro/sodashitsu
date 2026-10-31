# 検証結果

- build / typecheck / smoke: PASS。
- Protocol / Provider / SharedCapture / Vue: 107 PASS。Relay の追加4件も PASS。
- 全体: 13,326 PASS、1 SKIP、既存の独立socket idle通知テスト1件が時間切れ。対象1件の単独再実行は PASS（assertion/製品コードの変更なし）。
- 私有copyで main の旧poolへ差し替えると、pool専用allowSharedVirtualがphysical helperへ漏れるassertionでFAIL。現コードへ復元するとPASS。raw結果はnegative-control.txt。元sourceのbyte一致を確認。
- ブラウザ: Chromium 1217で2viewerの仮想共有・H.264生成画素・各窓ACK・片方停止後の継続描画・操作権取得とキー入力・最後のencoder停止を確認。生成fixtureのみ、OS driver/service/実画面/実音声は変更していない。
- 当環境のChromium 1243は通常ページ初期化後にrendererが待機し、main a29113dbの既存native-sharing E2Eでも同様に停止。ソフトウェア描画でも2viewer試験は停止した。既存インストール済み1217へSODA_E2E_CHROMIUM_PATHで切り替えて確認した。デフォルトbrowserや製品のGPU経路は変えない。
- 実仮想driver・実マイク機器・native Linux/macOS機器の検証は未実施。
