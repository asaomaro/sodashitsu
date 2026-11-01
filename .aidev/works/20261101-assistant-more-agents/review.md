# 独立レビュー

`review_transfer` がサーバ/RPC/記録pathの安全境界、`review_pointer` がnative会話/UI/型/復元を別コンテキストで読取点検。実agent/OS操作や編集なし。

- transfer: must/shouldなし。固定UUID、canonical親、非link/nlink1、FD identity、1MiB再読一致、推論/tool除外、専用device/actor/verified sessionとawait後の再検査を確認。実記録との互換性は未検証。
- pointer: resetテストが同じIDの置換だけではclear欠落を検出できない点をshouldとして指摘。
- 修正: 同じsessionIdの空snapshotで全消去をassert、保留RPCのactor交代をcodex/copilot/agyに展開。reset clear欠落のprivate copyで2ケースともAssertionError、現在sourceに戻すと成功。
- pointer再レビュー: should解消、追加must/shouldなし。文書の専用assistant限定/部分対応/実機未検証も確認。

最終build/typecheck/全体test/CIの結果はtest-result.mdに記録する。
