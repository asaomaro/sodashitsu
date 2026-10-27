# 接続ビューの通知競合の試験修正

root統合後のマイク共有PCM/暗号化Opusの2ケースが90秒で時間切れ。traceのchooser clickでtoast-actionがpointer eventsを反復して遮っていた。共有開始前の試験補助処理の問題で、マイクruntimeの失敗とは判定しない。

既存toast locator handlerをchooser clickより前に登録し、そのclickもfinallyによる解除対象へ移した。既存のUI導線、描画とマイク状態の検証は維持する。修正前2失敗に対して修正後2成功（12.3秒）。実デバイスは使わず生成oscillator/private sinkのみ。端末中継2ケース、root build/typecheck、798files/11903 tests、smokeは別途通過。製品sourceの再変更はないため全体試験は重複しない。

独立レビュー: review_pointer、差分全体を点検、指摘なし。git diff --check成功。
