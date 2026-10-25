# 独立レビュー

review_transferが実装と別コンテキストで点検。

- 初回にrevision確認と画像公開の間の競合を指摘。commands.Synchronizeで最終確認/Take/Output/baseline swapをfast入力と同gateに入れて修正。
- Apply直後・ACK前のrevision通知、fast直前のDisplay.Matches検査、通常Apply guard維持を再レビューし指摘解消。
- native ACK等だけを追い越すbarrier数、処理中のcommandを追い越せないgate、例外時fast停止、capacityを最終追加点検。指摘なし。
- commit途中のreader入力をイベントで競合させるpure testを追加。gate撤去negativeで失敗を確認する。

productionをbyte一致で復元後、Windows validationと全体/関連テストを実装側で実行する。
