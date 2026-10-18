# 独立レビュー

review_view_maximize（実装とは別コンテキスト）へ依頼。

設計点検で、Host完全一致と実TLSブラウザ試験を必須として確認。
差分レビューで以下2件を再現・指摘。

1. 旧probeのconnectが遅れて完了したとき、新probeをkeyだけでcleanupしてしまう。
   修正: timer/gone/catchのcleanupに期待entryを渡し、置換後のentryを閉じない。遅延connectの回帰試験を追加。
2. proof消費時のlistener close待ちにstopが入り、停止完了後にhelperを起動する。
   修正: startWithProofでproofの同期消費からhelper予約までawaitを置かない。listener closeを遅らせた停止競合の回帰試験を追加。

修正差分の再レビュー完了。両指摘の修正と、キャンセル後も接続待ちを上限へ数えることを確認。追加の必須指摘なし。最終E2Eも2件成功。
