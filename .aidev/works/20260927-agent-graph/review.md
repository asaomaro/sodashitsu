# レビュー記録（親の統合レビュー）

各 subtask の点検・レビューは `0*/review.md`。

## ラウンド 1（2026-09-29）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:682-711・packages/web/src/store/graph.ts:186-232 線の設定の保存の rev_conflict でフォームの trigger・limit を丸ごと送り直し、他（sodactl 等）の変更を黙って上書きする（docs「黙って上書きしない」と食い違う） / 対応: 修正済（ae07d50・7d8b66b・dc9fc64・9fe90a6・cee23c3・63131c9・58915f0・8f49c46。D9。負の確認は test-result）
- [should][conv:-] packages/client-core/src/graph/message.ts:109 delegate の文面の --machine の名前を引用符なしで埋め、空白を含む名前で監督役のコマンドが壊れる / 対応: 修正済（ae07d50・7d8b66b・dc9fc64・9fe90a6・cee23c3・63131c9・58915f0・8f49c46。D9。負の確認は test-result）
- [should][conv:-] packages/client-core/src/graph/message.ts:50-55・packages/server/src/graph/GraphEngine.ts:585-597 受け渡す末尾にバイト数の上限が無く、1MB を超えると毎回 failed になる（{output} の複数の差し込みでも） / 対応: 修正済（ae07d50・7d8b66b・dc9fc64・9fe90a6・cee23c3・63131c9・58915f0・8f49c46。D9。負の確認は test-result）
- [nit][conv:-] packages/web/src/store/graph.ts:201-204 変えていない limit も毎回送るので、保存の応答待ちの間に上限に届いても知らせが出ない / 対応: 修正済（ae07d50・7d8b66b・dc9fc64・9fe90a6・cee23c3・63131c9・58915f0・8f49c46。D9。負の確認は test-result）
- [nit][conv:-] packages/client-core/src/graph/ops.ts:74-90 別のマシンへの rekey_node をサーバが断らない / 対応: 修正済（ae07d50・7d8b66b・dc9fc64・9fe90a6・cee23c3・63131c9・58915f0・8f49c46。D9。負の確認は test-result）
- [nit][conv:-] packages/web/src/store/graph.ts:309-311,343-353 モバイルの幅では別のマシンのノードが常に未接続と出る / 対応: 修正済（ae07d50・7d8b66b・dc9fc64・9fe90a6・cee23c3・63131c9・58915f0・8f49c46。D9。負の確認は test-result）
- [nit][conv:-] docs/agent-graph.md:137-138 session.json を読めた起動でも nextId 以上の手元のノードを無効にすることが docs に無い / 対応: 修正済（ae07d50・7d8b66b・dc9fc64・9fe90a6・cee23c3・63131c9・58915f0・8f49c46。D9。負の確認は test-result）
