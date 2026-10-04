# レビュー

## タスク点検ログ

- [nit][conv:-] packages/web/src/composables/useResizeDrag.ts:119-126 ドラッグ中の 2 本目のポインタの pointerdown が 350ms 以内だと reset が呼ばれ、ドラッグが続いたまま lastDown が 0 になる / 対応: 修正済（T3・ラウンド1。`dragging` なら何もしない。テストを足した）
- [nit][conv:-] packages/web/src/composables/useResizeDrag.test.ts:105-112 `releasePointerCapture` が lostpointercapture を同期で起こすと二重に commit しうる（`dragging` を下ろすのが最後）／その確認が無い / 対応: 修正済（T3・ラウンド1。`detach` の先頭で下ろす。同期で再入するテストを足した）

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

#### T3 `useResizeDrag.ts`（生の出力。変異ごと）
```
変異: if (ev.button !== 0) return; を消す
     × 左ボタン以外では始めない 8ms
AssertionError: expected [ 'begin' ] to deeply equal []
変異: requestAnimationFrame(flush) を flush() に
     × 続けて届いた move は 1 回の描画で 1 回にまとまり、最後のイベントが使われる（AC21） 5ms
     × Esc で cancel（commit は呼ばれず、ためた移動は捨てる） 1ms
変異: if (moved) o.commit(s); を o.commit(s); に
     × 動かさずに離したら commit を呼ばない 4ms
変異: 350ms の判定を if (false) に
AssertionError: expected [ 'begin', 'begin' ] to deeply equal [ 'begin', 'reset' ]
変異: window.removeEventListener("keydown", ...) を消す
     × ドラッグ中のほかのキーは preventDefault と stopPropagation の両方で止める 4ms
     × unmount で <html> のクラスと window のリスナーを外す 7ms
変異: ev.stopPropagation(); を消す（キーを body へ dispatch する形に直した後）
     × ドラッグ中のほかのキーは preventDefault と stopPropagation の両方で止める 5ms
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
変異: pointerdown の ev.preventDefault() を void 0 に
     × pointerdown でフォーカスを移さず（preventDefault）、pointer capture と begin を呼ぶ 3ms
AssertionError: expected "vi.fn()" to be called at least once
```
