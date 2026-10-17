# 安全に関わる箇所の独立点検

対象: CDP入力allowlist・一回限り招待・接続単位relay・切断と認証失効。独立コンテキスト `cdp_taskcheck` で点検した。

- cookie認証とOrigin、Node bridgeの一回限りtoken、viewerごとの対応、期限・再利用拒否を確認。
- ローカルとviewerの両方の許可、固定CDP操作のみの入力、停止/失効/切断、入出力上限を確認。
- 任意JS/CDP proxyや別viewerからの画面取得につながる経路は認めなかった。
- 画像外でpointerupを落とす問題を指摘。canvas外でも座標補正してreleaseを送る修正後に再点検し、解消を確認した。
- 全体差分は別途 `cdp_final_review` が点検。結果と最終画像欠落の修正差分の再レビューは `review.md`。
- 実機Windows VSCodeの検証は実施していない。E2Eとnegative controlの生出力は `test-result.md`。
