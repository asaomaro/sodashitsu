# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:-] packages/client-core/tsconfig.json:7 `types: ["node"]` で Node のグローバルが型の上で使えてしまい、web で壊れるコードが tsc を通りうる / 対応: 修正済（`.eslintrc.cjs` に client-core 用の `no-restricted-globals` を足した。T1・ラウンド1）
- [should][conv:-] packages/web/src/store/seen.test.ts 純粋な関数のテストが web に残り、client-core の agentState.ts にテストが無い / 対応: 修正済（`packages/client-core/src/agent/agentState.test.ts` へ分けた。T2・ラウンド1）
- [should][conv:-] 0b505da 単体では web がビルドできない（T2/T3 の中間） / 対応: 許容（計画どおりの中間コミット。merge は squash で 1 コミットにする。decisions D6）
- [nit][conv:-] packages/client-core/src/net/Connection.ts:94,98 既定の fetch・WebSocket が裸のグローバル / 対応: 許容（tasks.md が許した形。tui は生成を注入する）
- [nit][conv:-] packages/web/src/components/*.vue・SettingsDialog.symbolsNote.test.ts のコメントが旧パス / 対応: 修正済（T3・ラウンド1）

## ラウンド 1（2026-09-27）
- 指摘なし（要件: AC19 の「web の挙動を変えない」は、import の付け替えだけの差分と件数の一致で確かめた。規約: 索引の条項〔e2e-observe-browser・regression-negative-control〕はこの差分に当たらない。タスク点検で出た should 2 件は修正済・許容の記録あり）
