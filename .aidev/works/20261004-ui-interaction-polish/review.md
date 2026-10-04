# レビュー

## タスク点検ログ

### 壊して落ちる確認（条項 regression-negative-control。生の出力）

#### T1 `sectionSizing.ts`: `clampRatio` の `Math.min(hi, Math.max(lo, ratio))` を `ratio` に壊す
```
     × spaces の最小を割る比は下限（minTop / total）に収める 3ms
     × agents の最小を割る比は上限（1 − minBottom / total）に収める 1ms
     × 最小を割る位置は収める 0ms
     × 端で止まる 0ms
 FAIL  src/sidebar/sectionSizing.test.ts > clampRatio > spaces の最小を割る比は下限（minTop / total）に収める
AssertionError: expected 0.05 to be close to 0.25, received difference is 0.2, but expected 5e-11
 FAIL  src/sidebar/sectionSizing.test.ts > clampRatio > agents の最小を割る比は上限（1 − minBottom / total）に収める
AssertionError: expected 0.99 to be close to 0.8, received difference is 0.18999999999999995, but expected 5e-11
 FAIL  src/sidebar/sectionSizing.test.ts > ratioFromOffset > 最小を割る位置は収める
AssertionError: expected 0.025 to be close to 0.25, received difference is 0.225, but expected 5e-11
```
