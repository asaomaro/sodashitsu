# デスクトップ立ち絵のモーション

## 動作と参考

`yukkuri-work/skills/video/motion-video/engine.js`のcastMotionで使う呼吸・弾み・発話中の縦伸縮を確認し、デスクトップ用に窓内で収まる動きとして実装。

- 待機中の呼吸、専用エージェント作業中の小さな動き、通知とクリック時の短い弾み、OSボイス再生中の伸縮。
- 全身と顔だけの画像で振幅を変更。画像全体を縮める方向だけに動かし、底辺・右端のアンカーと素材本来の腕・ポーズを維持。
- 既存の標準船長画像の余白補正は内側の画像に維持し、新しい外側ラッパーだけを変形。
- 設定reducedMotion、OSのprefers-reduced-motion、非表示・ロック・スリープ・破棄でRAFを停止し、通知を後から再生しない。
- 立ち絵専用の状態取得IPCはモード・世代・通知番号・停止設定だけを返し、通知本文や操作権限は渡さない。
- 画像・音声の取り込み方式と選択中のキャラクターは維持。口パク・表情差分は追加していない。

## 検証

- desktop-assistant全199テスト通過。型検査・build:host成功。
- ネイティブ状態の通知／発話／軽減設定／ロックと、立ち絵以外から状態IPCを使えないことをテスト。
- 生成UIの実ブラウザで待機・発話・通知・作業のtransform変化、窓内の境界、設定／OS軽減での停止、停止中の通知を解除後に再生しないことを確認。
- 実素材のずんだもん（97×192）・霊夢（192×164）で、待機と発話の描画ピクセル差と窓内への収まりを確認。軽減設定後にブラウザの2フレームを進め、立ち絵側のRAF予約が0件であることを確認。
- `/tmp/motion-zundamon-speaking.png`、`/tmp/motion-reimu-speaking.png`を目視確認。
- 独立レビューreview_character_motion：関連4テスト通過、必須指摘なし。

```text
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS
[{"id":"zundamon","viewport":{"width":97,"height":192},"idle":"scale(0.99931, 0.99362)","speakingChangesPixels":true,"withinWindow":true,"reducedMotionFrames":0},{"id":"reimu","viewport":{"width":192,"height":164},"idle":"scale(0.99938, 0.99455)","speakingChangesPixels":true,"withinWindow":true,"reducedMotionFrames":0}]
```

## 反映

再起動後phase=runningを確認。Windows relayはapp-0ff147ad003da34241cad739c44f2c5a4d9716fd2e685c47dddf674aa3a90a03で起動し、main.mjs・character.html/js・style.cssが最新ビルドと一致。現在選択中のplugin:yukkuri-work/kiritan_nekoと軽減設定falseを維持。
