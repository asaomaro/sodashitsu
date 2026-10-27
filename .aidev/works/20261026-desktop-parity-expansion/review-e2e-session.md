# 暗号化した人操作の製品経路: 独立レビュー

対象: feat/desktop-e2e-session、source cca7bd2a。read-onlyの別コンテキスト2件（review_pointer/review_transfer）と修正差分の再レビューを実施。

- localStorage markerだけ消えるとIDB pinが残っていても通常接続を選ぶ問題: requiredをIDBにも保存、両方を読んだ後に接続方式を選ぶ非同期adapterへ変更。保留中のdispose/pin変更で世代を検査。actual browserのLS部分喪失と修正前buildの負例で検証。
- Bの既存endpoint dirに鍵/markerがない場合の通常接続への復帰: 不整合として停止。保存済みdir/ファイルは初期化で作り直さない。
- 必須設定の保存前/途中のstatusが旧falseを適用する競合: 変更中guardと直列refresh、保存開始/完了両方でpolicy世代を更新。古いsnapshotを保存完了後に解放し、Providerへfalseが一度も渡らない回帰を追加。
- owner suspend/rollback後に遅延initializeが開始され得る問題: refresh後/保存後のlifetime検査、handoffのmutation drain。

再レビューではdual storage/selectorの世代、B保存・owner境界、childのparent/protocol/fresh hello HMACとone-use、private root公開前のactive確認、親停止時のchild停止を確認。追加mustなし。修正再レビュー後、E2E typed handlerのみPlaywright overloadを満たす変更と文書更新を再読し、追加指摘なし。

実OS入力・実画面capture・実録音/再生・driver導入は実行していない。独立レビューを実機互換性の保証として扱わない。
