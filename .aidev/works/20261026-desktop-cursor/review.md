# 独立レビュー

2026-10-26、実装とは別のコンテキストでSDCU protocol、A/Bのshape cache、C# capture/cursor worker、ブラウザrenderer、native/unit/browser回帰を点検した。

## 指摘と修正確認

SodaDesktopCursor.Disposeがjoin期限超過を無視し、worker未停止でもwatchdogを無効にしてcapture破棄へ進む経路を指摘した。修正後はStop(1000)で停止完了を確認し、期限超過時はwatchdogが生きたままEnvironment.Exit(1)へ進む。MFT/captureを破棄するのは停止成功時だけで、watchdogを最後に解放する。修正差分を再点検し、この指摘を解消した。

agent_state受信時のcontrol=false直後にもclearPredictionが追加され、agentへの引継ぎ直後に以前のローカル予測位置が残る問題を解消した。

## 確認した境界

- viewer header・B capability・helper readyの確認、secure/旧peer/showCursor指定の従来経路、viewerからのcursor注入拒否を確認。cursor更新は画像frameAt/seq/scene hash/入力権限を更新しない。
- metadata 2KiB、raw shape 512KiB、形状256×256、厳密なshape byte数、1件cache、位置の輻輳drop後のshape再添付、hide優先は整合している。
- capture/render/poll/init/disposeはcaptureGateで直列化し、通常経路のOutputGateとMFT multithread lockに明白な逆順保持は見つからない。入力ACKは独立stderrを維持する。
- overlayは別canvasへ描画し、alpha cursorは読み戻さず、背景依存XORだけ小矩形を参照する。元画像canvasへ書き戻さず、hotspot/fit/等倍/端clipを維持する。
- GetIconInfo fallback、CopyIcon/DeleteIconとmask/color bitmap解放、DXGI pointer shape ABI、AND/XOR演算を点検した。生成iconのDrawIconEx比較と実ブラウザのcanvas/予測/hide/reconnect回帰が追加されている。

## 追加修正の再点検

PollCursorのAcquireFrame例外ではcursorStateを消して再throwし、workerがhide/従来焼込みへ戻る修正を確認した。capture identity変更時にも古いdriver形状・handleを消し、別driverの状態を再利用しない。FromIconは元bitmapのdepthを確認し、24bpp bitmapの未定義alphaを色付きalphaと誤認しない。

WindowsCursorChecksのCheckStopは実workerをOutputGateで待たせ、Stop(20)が期限内にfalse、gate解放後のStop(1000)がtrueを返し、停止後にdesktop queryを呼ばないことを確認する。/tmp/desktop-cursor-native-stop.logの成功を確認した。

現差分に修正必須の指摘はない。git diff --checkは成功した。進行中の既存native/role/旧peer等の最終回帰結果はtest-result.mdへ記録する。
