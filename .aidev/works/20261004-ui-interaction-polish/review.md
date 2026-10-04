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

#### T2 `uiTokens.ts`: `resizeLineColor` の `if (floor(accent) >= MIN_RESIZE_LINE_RATIO) return accent;` を `return accent;` に壊す（client-core を build し直して web のテストを実行）
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 9 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/theme/uiTokens.test.ts > uiTokens(tokyo-night-day) > 境目の線（--soda-resize-line）は、背景と枠の背景の両方に対して 3 以上（AC21）
AssertionError: expected 2.6904456445876304 to be greater than or equal to 3
 FAIL  src/theme/uiTokens.test.ts > uiTokens(tokyo-night-day) > 境目の線は、accent が両方の背景に 3 以上ならそれ、そうでなければ fg
AssertionError: expected '#3682ea' to be '#0f1a34' // Object.is equality
 FAIL  src/theme/uiTokens.test.ts > uiTokens(solarized-light) > 境目の線（--soda-resize-line）は、背景と枠の背景の両方に対して 3 以上（AC21）
AssertionError: expected 2.9404237748404474 to be greater than or equal to 3
 FAIL  src/theme/uiTokens.test.ts > uiTokens(solarized-light) > 境目の線は、accent が両方の背景に 3 以上ならそれ、そうでなければ fg
AssertionError: expected '#2f90d4' to be '#1d2426' // Object.is equality
 FAIL  src/theme/uiTokens.test.ts > uiTokens(rose-pine-dawn) > 境目の線（--soda-resize-line）は、背景と枠の背景の両方に対して 3 以上（AC21）
AssertionError: expected 2.9128298521561975 to be greater than or equal to 3
 FAIL  src/theme/uiTokens.test.ts > uiTokens(rose-pine-dawn) > 境目の線は、accent が両方の背景に 3 以上ならそれ、そうでなければ fg
```
