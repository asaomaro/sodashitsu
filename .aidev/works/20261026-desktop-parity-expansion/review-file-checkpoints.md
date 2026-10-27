# 切断後の転送再開の独立レビュー

review_transfer: 独立taskcheck/全体レビュー。mustは(1)checkpoint取消の受付時同期失効不足、(2)別窓の生存IDB記録を取消確認前に消せること。shouldは空registryのpulse残存。

修正: cancel(root,owner,token)が同期的にmapから外れ、公開直前fenceで拒否。新しい取消競合回帰を追加。ブラウザはcomponent/job別WebLockを保持し、所有中の他窓jobを復元から除外。全mutation/payloadでownerを再検査し、B取消確認前にはデータを削除しない。pulseはjob存在中だけ動作。review_transfer再レビューでmust/should全件解消、追加mustなし。

review_pointer: 全差分と新規modulesを独立読取。permission/root/owner、再attach中の取消、lost response、全体hash/offset、有限容量/TTL、IDB atomic progress、旧peer gateを確認。追加mustなし。monotonic deadlineとIDB close、test-only action/offset観測、文書の追加差分も再レビュー済み。releaseAllはdb.then(close)とownチェックで解放し、late-successへの明示reject guardは実装していない（レビュー依頼文の記述を訂正）。
