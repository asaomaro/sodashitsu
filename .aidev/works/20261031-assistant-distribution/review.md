# 独立レビュー

review_pointer: 更新stop中disable/newer intentのfence不足mustと固定sleep回帰shouldを修正。apply revisionとstop後再読込、保留stopの決定的回帰、watch到達待ちへ変更。再レビュー追加must/shouldなし。

review_transfer: rollback digest未検証must、未公開target回収/metadata読取上限shouldを修正。全tree digest照合、失敗時自己所有target回収、NONBLOCK/NOFOLLOW通常fileと16385byte実readへ変更。再レビュー追加指摘なし。

ZIP central-directory/CRC追加差分も独立点検し、追加must/shouldなし。レビューは読み取りのみ、OS/信頼設定や実機操作なし。
