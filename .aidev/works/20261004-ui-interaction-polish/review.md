# レビュー

## タスク点検ログ

- [nit][conv:-] packages/web/src/composables/useResizeDrag.ts:119-126 ドラッグ中の 2 本目のポインタの pointerdown が 350ms 以内だと reset が呼ばれ、ドラッグが続いたまま lastDown が 0 になる / 対応: 修正済（T3・ラウンド1。`dragging` なら何もしない。テストを足した）
- [nit][conv:-] packages/web/src/composables/useResizeDrag.test.ts:105-112 `releasePointerCapture` が lostpointercapture を同期で起こすと二重に commit しうる（`dragging` を下ろすのが最後）／その確認が無い / 対応: 修正済（T3・ラウンド1。`detach` の先頭で下ろす。同期で再入するテストを足した）

- [should][conv:-] packages/web/src/actions/ActionDispatcher.ts:1492-1497 reload_config が `sidebarWidth`・`sidebarCollapsed` は読み直すのに、新しい 2 項目を読み直さない / 対応: 修正済（T4・ラウンド1。読み直しとテストを足した）
- [nit][conv:-] packages/protocol/src/messages.ts:601 端末ごとの項目の説明が旧 2 項目のまま / 対応: 修正済（T4・ラウンド1。`DEVICE_LOCAL_PREF_KEYS` を指す形に）
- [nit][conv:regression-negative-control] view.test.ts の NaN は JSON を通ると null になり `Number.isFinite` を覆わない／PrefsSync 側に `undefined` の書き込みと新しい 2 項目のテストが無い / 対応: 修正済（T4・ラウンド1。load 関数を直接見るテストと、PrefsSync が送らないテストを足した）

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

#### T4・T5（生の出力）
```
変異: loadSidebarSectionRatio の `raw > 0 && raw < 1` を `raw > 0` に
     × 壊れた値は『無い』（範囲外・数でない比、true でない折りたたみ） 4ms
AssertionError: 1: expected 1 to be null
変異: resetSectionRatio の writePrefs({ sidebarSectionRatio: undefined }) を null に
     × resetSectionRatio は null にして、保存から項目を消す（ほかの項目は残す） 4ms
AssertionError: expected true to be false // Object.is equality
変異: DEVICE_LOCAL_PREF_KEYS から "sidebarSectionRatio" を消す
     × サイドバーの区画の比と折りたたみは端末ごとの設定（サーバへ送らない。20261004-ui-interaction-polish） 3ms
     × 端末ごとの項目なので、共有の項目として取り出さない 7ms
変異: reload_config の `this.view.sectionsCollapsed = loadSidebarSectionsCollapsed(...)` を消す
     × localStorage（soda.prefs.v1）の今の値を settings・view ストアへ読み直し、トーストを出す（AC13・AC14） 12ms
変異: isDeviceLocalPref が sidebarSection* を端末ごとと見ない
     × 区画の比・折りたたみ（端末ごとの項目）の保存・消去は送らない（undefined で項目を消す書き込みも含む。20261004-ui-interaction-polish） 7ms
```
