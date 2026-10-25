# 独立レビュー

2026-10-26、実装とは別のコンテキストでprotocol、A/B、DesktopNativeVideo、ブラウザ、C# helper、synthetic helperと追加テストを点検した。現製品差分に修正必須の指摘はない。git diff --checkは成功した。

## 確認した境界

- native-rateのviewer提示、B capability、helper readyの確認が揃う場合だけnativeMaxFps=60をviewerへ返す。新optionは対応Bだけへ送り、Bは未確認のhelper ready fieldを従来readyへ漏らさない。
- native FPS設定を旧peerや非native経路へ転送せず、従来の画像FPSを維持する。DesktopOptions.fpsの上限30は変更していない。secureではnative動画自体を許可しない。
- helperのnativeRateCeilingとMFの上限60を分け、設定の許容範囲を保っている。主ループの次回時刻は実際の開始時刻に1000.0/fpsを加え、待ちはceilで切り上げるため、整数切り捨てによる過剰送出を避ける。
- encoderのsample duration/GOP/frame-rate設定、既存GPU/memory fallback、3枚window、入力・観測・権限・表示guardを維持する。
- header提示なしの隔離A/B回帰、独立60fps上限のunit、ブラウザがmedia.settings.fps=60を送って画像のstart FPSは30以下を維持する検査、Windows hardwareの60fps入力と小数待機検査が追加されている。

## 補足

UIの既存「適用中 … fps上限」は画像の設定値なので、動画60fpsと併記される際は「画像」と明示することを勧めた。helperだけがnativeMaxFpsを未提示の場合の交渉回帰も追加すると、helper確認条件を直接検証できる。

最終の実行結果はこの静的レビューとは別にtest-result.mdへ記録する。上限60fpsへの対応は実画面・回線を通した60fps到達を保証するものではない。
