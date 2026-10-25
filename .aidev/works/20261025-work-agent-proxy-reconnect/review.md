# 独立レビュー

review_transferが実装とは別コンテキストで点検。

1. 初回: live connectionの非plugin scope/claim失効でproxyが残り再起動を妨げる点を指摘。rejected後にraw channelで読み取り再検証し、明示拒否だけtarget_validation_failedで終了。通常のversion競合等では維持。再レビューで解消。
2. candidateを検証中にproxyが閉じられた場合も即時にcandidateを解放する追加修正を点検。late connect/二重close/採用時の所有移管を含め指摘なし。
3. exec専用channelのauthority拒否もprimaryで検証する経路、通常plugin status拒否でproxyを残す経路、固定causeだけのログ追加を最終点検。指摘なし。

scope/claim再検証、送信済み操作の無再送、cancel所有socket、復旧猶予と期限、old clientとの終了通知互換、secret/本文の非記録を点検。

実装側が8種類のnegativeと復元byte一致、isolated A/B、CLI IPC、ブラウザ、全体テストを実施して結果を記録する。
