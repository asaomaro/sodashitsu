# リモートデスクトップの残対応（利用者: 全て進める）

対象は通常Windows画面。既存の認証・許可・secure desktop境界を維持する。実機をロック解除したり実OS入力を自動送信しない。dirty rootを保持し、独立worktreeの小さいPRごとに実装・検証・独立レビュー・merge・反映する。

- [x] helperの入力ACKを映像stdoutから分離（壊れやすい: protocol/入力安全）。旧helper/secure worker互換、診断の非転送、有界parserと実行時negative。
- [x] native60fpsと独立した動画設定（capability交渉、旧peerへ未知fieldを送らない）。画像上限30fpsを保持。
- [x] 実カーソル形状・位置・可視状態の別送とローカル描画。hotspot/alpha/monochrome inversion、現地と遠隔の動き、旧peer fallback。入力と無関係な閲覧権限の範囲でcursorのみ。
- [x] native H264のUDP/WebRTC経路（ICE/DTLS/SRTPまたはSCTP、既存WSSへfallback、有限queue、loss/PLI/IDR回復、適応帯域）。TURN等は明示設定だけを使う。
- [x] nativeシステム音声（WASAPI loopback、マイクなし、要求時のみ、mute/autoplay同意、停止/secure transitionで解放）。
- [ ] 実画面入力を送らない生成画面によるloss/遅延・継続試験、browser描画の観測、性能/限界の記録。

全PRで差分全体の独立レビュー必須。修正にも再レビュー。大きな変更を同一PRへまとめない。userに再承認を求めず必要作業を続ける。実回線の改善率は測定するまで主張しない。

補助画像snapshotも#207で入力ACKから独立したWSへ分離済み（旧peer/開始前失敗は既存経路へ戻す）。
