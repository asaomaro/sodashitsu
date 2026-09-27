# テスト結果: 01-client-core

## 実行したもの
- `pnpm build` — exit 0（protocol → client-core → web の順。vite build を含む）
- `pnpm typecheck` — exit 0
- `pnpm test`（vitest 全体）— 281 files / 5211 passed / 0 failed / 0 skipped（移動の前は 280 files / 5211。`seen.test.ts` の純粋な関数の部分を `agentState.test.ts` へ分けたのでファイルが 1 増え、件数は同じ）
- `npx eslint . --ext .ts` — exit 1（23 errors / 10 warnings。**すべて今回触っていない packages/cli・packages/server の既存の赤**。client-core・web は 0 件）

## 受け入れ基準ごとの判定
- AC19: pass（この subtask の分）— web の既存のテストは移した先（client-core・node 環境）と web（happy-dom）で全部通り、件数は移動の前後で同じ。web の中身は import の付け替えだけ（点検 T3）。

## 失敗の証跡
このラウンドでは失敗が発生していない（途中で `vitest --project` の名前の誤りで起動できなかったのは実行の誤りで、テストの失敗ではない）。

## 起動確認（smoke）
subtask では打たない（記録は家族の根に一本化。親の統合 test で `aidev smoke` を打つ）。

## 未検証の穴（skip / 環境不足）
- ブラウザでの実物の動作（E2E）は回していない（依頼が無い。memory）。web の変更は import の付け替えだけ。
