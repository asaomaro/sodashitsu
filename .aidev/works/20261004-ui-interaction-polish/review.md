# レビュー

## タスク点検ログ

- [nit][conv:-] packages/web/src/composables/useResizeDrag.ts:119-126 ドラッグ中の 2 本目のポインタの pointerdown が 350ms 以内だと reset が呼ばれ、ドラッグが続いたまま lastDown が 0 になる / 対応: 修正済（T3・ラウンド1。`dragging` なら何もしない。テストを足した）
- [nit][conv:-] packages/web/src/composables/useResizeDrag.test.ts:105-112 `releasePointerCapture` が lostpointercapture を同期で起こすと二重に commit しうる（`dragging` を下ろすのが最後）／その確認が無い / 対応: 修正済（T3・ラウンド1。`detach` の先頭で下ろす。同期で再入するテストを足した）

- [should][conv:-] packages/web/src/actions/ActionDispatcher.ts:1492-1497 reload_config が `sidebarWidth`・`sidebarCollapsed` は読み直すのに、新しい 2 項目を読み直さない / 対応: 修正済（T4・ラウンド1。読み直しとテストを足した）
- [nit][conv:-] packages/protocol/src/messages.ts:601 端末ごとの項目の説明が旧 2 項目のまま / 対応: 修正済（T4・ラウンド1。`DEVICE_LOCAL_PREF_KEYS` を指す形に）
- [nit][conv:regression-negative-control] view.test.ts の NaN は JSON を通ると null になり `Number.isFinite` を覆わない／PrefsSync 側に `undefined` の書き込みと新しい 2 項目のテストが無い / 対応: 修正済（T4・ラウンド1。load 関数を直接見るテストと、PrefsSync が送らないテストを足した）

- [should][conv:regression-negative-control] review.md に T6 の壊して落ちる確認の出力が無い / 対応: 修正済（T6・ラウンド1。下に貼った）
- [nit][conv:-] packages/web/src/components/Splitter.vue:73 `axis` を setup 時の `props.dir` で 1 回だけ決めている / 対応: 許容（分割の向きは分割ごとに固定で、`dir` が変わる再利用は無い）
- [nit][conv:-] Splitter.test.ts の Esc のテストが「描画後」の 1 経路だけ / 対応: 修正済（T6・ラウンド1。描画前に Esc のテストを足した）

- [nit][conv:-] T8 の独立点検は 2 件（前のセッションが実施。指摘の本文は記録前にセッションが止まった）/ 対応: 区画の外側の `overflow: visible` への切り替え・見出し／フッタの `padding-right` の `+ 4px`・畳んだサイドバーの構造の分離として実装に反映済み。

- [should][conv:-] Sidebar.vue 畳んだサイドバーから開き直して区画が畳まれて現れるとき、見出しのボタンが未描画でフォーカスが移らない / 対応: 修正済（T15・ラウンド1。`nextTick` 後に移す）
- [should][conv:regression-negative-control] 他マシンの件数の枝・spaces 側の並び順・SubagentListDialog の差し込み DOM のテストが薄い / 対応: 許容（cross の点検で見る。decisions D4）
- [nit][conv:-] 畳んだ見出しの読み上げ名に件数の意味が無い / 対応: 修正済（T15・ラウンド1。aria-label に「n 件」）
- [nit][conv:-] navigate の watch はサイドバーを畳んでいる間も保存する / 対応: 許容（仕様どおり。decisions D4）

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

```
T5 変異: ActionDispatcher の toggleSectionCollapsed(action.section) を void action に
     × toggleSidebarSection: その区画の折りたたみを切り替える（何も送らない・サイドバーを畳んでいても変わる・フォーカスは動かさない） 9ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — help/goto/toggleSidebar/detach > toggleSidebarSection: その区画の折りたたみを切り替える（何も送らない・サイドバーを畳んでいても変わる・フォーカスは動かさない）
```

#### T6 `Splitter.vue`（生の出力。変異ごと）
```
変異: cancel/reset の dropPendingSend(); を消す
     × Esc で始めた比へ戻し、ためていた送信（ドラッグ中の比）は捨てる——取り消しの後に古い比で上書きしない 11ms
     × ダブルクリックでも、ためていた送信を捨てる 5ms
変異: cancel の sendNow(start.ratio) を localRatio.value = start.ratio に
     × Esc で始めた比へ戻し、ためていた送信（ドラッグ中の比）は捨てる——取り消しの後に古い比で上書きしない 12ms
変異: @pointercancel="drag.onPointerEnd" を消す
     × pointercancel でもドラッグは終わる 7ms
変異: @lostpointercapture="drag.onPointerEnd" を消す
     × lostpointercapture でもドラッグは終わる 7ms
（T3 の変異「requestAnimationFrame を flush() に」は composable 側で useResizeDrag.test.ts が落ちる。Splitter.test.ts の描画待ちは、rAF を流さないと aria-valuenow が変わらない形に直してある）
```

#### T7 `Sidebar.vue` 幅の境目（生の出力。変異ごと）
```
== s/const WIDTH_KEY_STEP = 16;/const WIDTH_KEY_STEP = 8;/
     × ← → で 16px ずつ、押すたびに保存する。範囲で止まる 17ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — 幅の境目（role・aria・キー・Esc） > ← → で 16px ずつ、押すたびに保存する。範囲で止まる
AssertionError: expected '248px' to be '256px' // Object.is equality
== s/  cancel: (start) => view.setSidebarWidth(start.width),/  cancel: () => undefined,/
     × Esc でドラッグを取り消すと、始めた幅へ戻り、保存しない 13ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — 幅の境目（role・aria・キー・Esc） > Esc でドラッグを取り消すと、始めた幅へ戻り、保存しない
AssertionError: expected '320px' to be '240px' // Object.is equality
== s/  enabled: () => !view.sidebarCollapsed,/  enabled: () => true,/
     × 畳んでいる間は、境目を動かしても幅も保存値も変わらない 19ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — 幅を覚える > 畳んでいる間は、境目を動かしても幅も保存値も変わらない
AssertionError: expected 340 to be 240 // Object.is equality
== s/      aria-label="サイドバーの幅"//
     × role=separator・aria-orientation・aria-label・aria-valuenow/min/max・tabindex=0 を持ち、resize-handle のクラスが付く 28ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — 幅の境目（role・aria・キー・Esc） > role=separator・aria-orientation・aria-label・aria-valuenow/min/max・tabindex=0 を持ち、resize-handle のクラスが付く
AssertionError: expected undefined to be 'サイドバーの幅' // Object.is equality
== s/    case "End":/    case "Endx":/
     × Home＝最小・End＝最大・Enter＝既定（240） 10ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — 幅の境目（role・aria・キー・Esc） > Home＝最小・End＝最大・Enter＝既定（240）
AssertionError: expected '160px' to be '360px' // Object.is equality
== s/      widthDrag.finish();/      void 0;/
     × ドラッグ中にダイアログが開いたら、その時点で終えて保存し、以後の pointermove を無視する 8ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — 幅を覚える > ドラッグ中にダイアログが開いたら、その時点で終えて保存し、以後の pointermove を無視する
AssertionError: expected undefined to be 320 // Object.is equality
```

#### T8 `Sidebar.vue` 区画の構造（生の出力。変異ごと）
```
変異: sectionFlex の ` || spacesFolded.value || agentsFolded.value` を外す
     × spaces を畳むと、spaces は folded・agents は fill（比は使わない） 11ms
AssertionError: expected 'flex-grow: 0.3; flex-shrink: 1; flex-…' to be undefined
変異: spacesFolded の `!view.sidebarCollapsed &&` を外す
     × サイドバーを畳んだ状態では、区画の折りたたみも比も効かない（今の構造のまま全部出す） 17ms
AssertionError: expected [ 'sidebar-spaces', …(1) ] to not include 'sidebar-section-folded'
```

#### T9 `Sidebar.vue` 区画の境目（生の出力。変異ごと）
```
変異: SECTION_KEY_STEP 24 → 12
     × ↑ ↓ で 24px（400px に対し 0.06）ずつ、押すたびに保存する。範囲で止まる 12ms
AssertionError: expected 0.53 to be close to 0.56, received difference is 0.030000000000000027, but expected 0.000005
変異: cancel を何もしない
     × Esc で、始めた比（自動＝null を含む）へ戻り、保存しない 16ms
AssertionError: expected 0.25 to be null
変異: sectionDrag.finish() を外す
     × ドラッグ中にダイアログが開いたら、その時点で終えて保存する 28ms
AssertionError: expected undefined to be close to 0.25, received difference is NaN, but expected 0.000005
変異: move の ratioFromOffset（最小で収める）を (ev.clientY - top) / 400 に
     × ドラッグ: 入れ物の上端からの位置が比になり、最小を割らない。離すと保存する 15ms
AssertionError: expected 0.025 to be close to 0.25, received difference is 0.225, but expected 0.000005
```

#### T15 `Sidebar.vue` 区画の見出し・`SubagentListDialog.vue`（生の出力。変異ごと）
```
変異: agents を畳んだとき見出しへフォーカスを移す処理を外す
     × 畳んだ区画の中にフォーカスがあれば、見出しのボタンへ移る（操作で畳んでも） 52ms
AssertionError: expected <div data-v-6dec5f19 …(3)>…(2)</div> to be <button data-v-6dec5f19 …(4)>…(3)</button>
変異: navigate で畳んだ spaces を開く 1 行を消す
     × navigate に入ると、畳んだ spaces を開く（agents は開かない） 19ms
AssertionError: expected { spaces: true, agents: true } to deeply equal { spaces: false, agents: true }
変異: agentsBlocked を `agents.length > 0` に
     × agents の件数は一覧の数。入力待ちが無ければ状態の印は出ない・あれば出る（畳んでいる間だけ） 27ms
AssertionError: expected true to be false // Object.is equality
変異: SubagentListDialog の戻り先（畳んだ agents なら見出し）を `if (false)` に
     × agents を畳んでいる（行が display: none）: 見出しのボタンへ戻る 15ms
AssertionError: expected <button …(2)></button> to be <button …(1)></button>
変異: spaces の並び順のボタンの `v-if="!spacesFolded"` を外す
     × 押すと畳み（aria-expanded=false・印 ▸・件数）、もう一度で開く。並び順のボタンは畳んでいる間は出ない 20ms
AssertionError: expected true to be false // Object.is equality
```

#### T10 `tui/render/chrome/sidebar.ts`（生の出力。変異ごと）
```
変異: spaces を畳んでも spacesH を 0 にしない
     × spaces を畳む: 見出しは「▸ Spaces 3」・spaces は 0 行・区切りは見出しのすぐ下・agents が残りを使う 6ms
     × 両方畳む: どちらも 0 行・区切りは見出しのすぐ下 1ms
AssertionError: expected 22 to be 1 // Object.is equality
変異: blocked の字形を出さない（const blocked = false）
     × 畳んだ agents の見出しに、入力待ち（blocked）があるときだけ状態の字形が付く 4ms
AssertionError: expected '─ ▸ Agents 2 ────…' not to be '─ ▸ Agents 2 ────…'
変異: 畳んでも agents の並び順を出す（if (!agentsFolded) → if (true)）
     × agents を畳む: 区切りはいちばん下… 5ms
AssertionError: expected '─ ▸ Agents 2 ───────────────グループ順─' not to contain 'グループ順'
```

#### T11 `tui/input/mouse.ts`・`TuiApp.ts`（生の出力。変異ごと）
```
変異: 区切りの `moved` を常に true に
     × 区切りの行を動かさずに離すと agents を畳む。高さは変えない・保存しない 62ms
AssertionError: expected { spaces: false, agents: false } to deeply equal { spaces: false, agents: true }
変異: 畳んでいる間も高さを変える
     × どちらかを畳んでいる間は、区切りを動かしても高さを変えず、畳み直しもしない 62ms
AssertionError: expected 4 to be undefined
変異: 動かさずに離したときの agents の切り替えを消す
     × 区切りの行を動かさずに離すと agents を畳む。高さは変えない・保存しない 61ms
変異: navigate に入ったとき spaces を開く 1 行を消す
     × navigate に入ると、畳んだ spaces を開く（agents は開かない） 67ms
AssertionError: expected { spaces: true, agents: true } to deeply equal { spaces: false, agents: true }
```
