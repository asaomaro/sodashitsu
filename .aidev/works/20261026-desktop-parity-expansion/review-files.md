# 第2段階 独立レビュー

review_transfer: 受付時abortのsticky失効、root確認await後とfd.stat後のsync fence、activeIds expiry cleanupを指摘し修正。最終再点検でmust/should解消、追加指摘なし。

review_pointer: 一覧取得時folder固定・古い応答の世代、5paused keepalive同時送信、解除より先にabort群が枠を埋める問題を指摘し修正。再点検のcontrol queue admission不足も修正し、通常16/control18と制御枠が満杯なら専用laneを閉じる方式へ変更。最終再レビューはこれから。

実装側はそれぞれに実FileTransferまたはDOM/browser frames/client queueの回帰を追加し、修正除去の7負例と復元を確認。最終全体検証は別記録へ追記する。
