# 独立レビュー

2026-10-26、実装とは別のコンテキストでprotocol、A/B、DesktopNativeVideo、ブラウザ、C# helper、synthetic helperと追加テストを点検した。現製品差分に修正必須の指摘はない。git diff --checkは成功した。

## 確認した境界

- native-rateのviewer提示、B capability、helper readyの確認が揃う場合だけnativeMaxFps=60をviewerへ返す。新optionは対応Bだけへ送り、Bは未確認のhelper ready fieldを従来readyへ漏らさない。
- native FPS設定を旧peerや非native経路へ転送せず、従来の画像FPSを維持する。DesktopOptions.fpsの上限30は変更していない。secureではnative動画自体を許可しない。
- helperのnativeRateCeilingとMFの上限60を分け、設定の許容範囲を保っている。主ループの次回時刻は実際の開始時刻に1000.0/fpsを加え、待ちはceilで切り上げるため、整数切り捨てによる過剰送出を避ける。
- encoderのsample duration/GOP/frame-rate設定、既存GPU/memory fallback、3枚window、入力・観測・権限・表示guardを維持する。
- header提示なしの隔離A/B回帰、独立60fps上限のunit、ブラウザがmedia.settings.fps=60を送って画像のstart FPSは30以下を維持する検査、Windows hardwareの60fps入力と小数待機検査が追加されている。

## 追加差分の再レビュー

UI captionが「画像設定」へ変更され、helperだけがnativeMaxFpsを未提示の場合も従来10fpsを維持する隔離A/B回帰が追加された。初回の補足提案は解消している。

生成GPU検証のoptional fpsと-Fps 60を確認した。既定30を維持し、GPU直接入力・memory入力の両方へ同じfpsと丸めたtimestampを渡す。640×360、1280×800、1920×1200で各90frame成功と、動画のCpuReadbacks増分0の生ログを確認した。平均encoder処理約31msという結果から60fps到達を主張せず、media type受け入れと実速度を分ける検証記録は妥当。

native上限、選択rate、helper交渉の3種類のnegative生出力も確認した。コンパイル失敗ではなく実行時の拒否/assertion失敗であり、対象の退行を捕捉している。追加製品差分に修正必須点はない。

文書について、既存の「FPS上限は既存の設定値（最大30）のままです」は新60fps説明と衝突しないよう「画像のFPS上限」へ限定する修正を依頼した。GPU直接入力だけのhelper更新手順と、今回のA/B/Web更新が必要な60fps交渉の反映手順も区別するよう補足した。

最終の実行結果はこの静的レビューとは別にtest-result.mdへ記録する。上限60fpsへの対応は実画面・回線を通した60fps到達を保証するものではない。
