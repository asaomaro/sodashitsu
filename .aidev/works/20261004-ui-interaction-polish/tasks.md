# タスク: 境目の見え方と、サイドバーの区画（サイズ変更・折りたたみ）

## 実装方針

design.md のとおり、下から積む。純関数（T1）→ 色の変数（T2）→ 境目の見た目とドラッグの部品（T3）→ 保存（T4）→ 操作（T5）→ pane の間（T6）→ サイドバーの幅（T7）→ 区画の構造（T8）→ 区画の境目（T9）→ 区画の見出し（T15）→ 端末版（T10・T11）→ E2E（T12・T13）→ 文書（T14）。

**全タスク共通**
- **何が正か**: 決まりの本文は design.md。判断の理由は decisions.md。既存の構造は research.md「追記」G1〜G6。
- パッケージ間の import は `dist` 経由。`protocol`・`client-core` を変えたら `corepack pnpm build` してから下流を見る。server は tui を参照する。Node は 24（`export PATH="$HOME/.local/share/fnm/node-versions/v24.15.0/installation/bin:$PATH"`）。
- 各タスクの完了で `pnpm build`・`pnpm typecheck` と該当パッケージのテストが通ること。回帰テストを足したら、実装の該当行を一時的に壊して落ちることを確かめ、**落ちたときの生の出力**を `review.md` の「タスク点検ログ」に貼る（条項 `regression-negative-control`）。E2E は条項 `e2e-observe-browser`（画面で観測できる結果を見る。内部の状態を覗かない）。
- **独立点検（`aidev taskcheck`）を掛けるのは、T3・T4・T6・T8・T10・T11・T15 だけ**（AGENTS.md「点検とテストの掛け方」。保存・競合・状態の遷移・構造・フォーカスと aria）。ほかのタスクには掛けず、全タスクの後の全体の点検（`cross`）に含める。
- **動いている 7780 のサーバには触れない。**E2E は spec が自前で立てるサーバを使う。テストや確認で起動する子プロセスには、`SODA_PANE_ID`・`SODA_AGENT_REPORT_SOCKET`・`SODA_PANE_SOCKET`・`SODA_SERVER_URL` を継がせない。
- **行の D&D（`Sidebar.vue:463-578`）・タブ・pane の D&D・モバイル・連携のグラフには触れない。**
- 設計と違う判断・確かめた事実は `decisions.md` に足す（D3 から）。

## チェックリスト

- [x] T1: 純関数 `sectionSizing.ts`——`clampRatio`・`ratioFromOffset`・`stepRatio`・`ratioPercent`（`SectionBox = { total, minTop, minBottom }`）。単体テスト（範囲内・下限・上限・`total < minTop + minBottom` で 0.5・端で止まる）と、式を壊して落ちる確認
      対象: `packages/web/src/sidebar/sectionSizing.ts`（新規）、`sectionSizing.test.ts`（新規）
      依存: なし
      AC: AC10, AC20
- [x] T2: 色の変数 `--soda-resize-line`——`uiTokens()` が、`--soda-accent` が `--soda-bg`・`--soda-menu-bg` の両方に 3:1 以上ならそれ、そうでなければ `--soda-fg`（design「境目の見た目」の色）を返す。`ThemeController` の `CSS_VARS` に 1 行と、**`CSS_VAR_LABELS`（`Record<CssVar, string>`。足さないと型検査が落ちる）に「境目の線」**。これは色の上書きの一覧（`SettingsDialog.vue:963`・端末版 `tui/src/settings/sections.ts:284`）にも出る——**上書きの対象にする**（利用者が線の色を変えられる。決め: decisions.md D3）。`App.vue` の `:root` の既定値にも足す（必須。`uiTokens.test.ts` が `Object.keys(uiTokens("dracula")) == CSS_VARS` と `:root` の一致を見る）。単体テスト: 17 のテーマすべてで、両方の背景に 3:1 以上／テーマごとの選び方。`themeOverrides.test.ts:106-113` の「全項目を覆う」「19 個」を 20 個に直す
      対象: `packages/client-core/src/theme/uiTokens.ts`、`packages/web/src/theme/uiTokens.test.ts`（テストはこちら）・`themeOverrides.test.ts`、`packages/client-core/src/theme/themeOverrides.ts:110`（`CSS_VAR_LABELS`）、`packages/web/src/theme/ThemeController.ts`、`packages/web/src/App.vue:117-140`
      依存: なし
      AC: AC1, AC21
- [x] T3: 境目の見た目と `useResizeDrag`——`resizeHandle.css`（`.resize-handle`・`-x`／`-y`・`::before` 当たり判定 8px・`::after` 強調の線 3px・hover の 0.15 秒の待ち・`:focus-visible`・`.resize-handle-active`・`html.soda-resizing*`・`prefers-reduced-motion` の規則〔design のセレクタ〕）を `main.ts` から読む。`useResizeDrag`（design「composable」。左ボタンだけ・`enabled`・`preventDefault` でフォーカスを移さない・rAF で 1 回にまとめる・`Esc` で `cancel`・ほかのキーは `preventDefault` と `stopPropagation` の両方・350ms のダブルクリックで `reset`・動かさずに離したら `commit` を呼ばない・pointercancel／lostpointercapture で終わる・`finish()`・unmount で `<html>` のクラスと window のリスナーを外す）。単体テスト（design「テストの方針」の composable の全項目）と壊して落ちる確認
      対象: `packages/web/src/styles/resizeHandle.css`（新規）、`packages/web/src/main.ts`、`packages/web/src/composables/useResizeDrag.ts`（新規）、`useResizeDrag.test.ts`（新規）
      依存: T2
      AC: AC1, AC2, AC14, AC21, AC-I2, AC-I4, AC-I5
- [x] T4: 保存の項目——`sidebarSectionRatio`・`sidebarSectionsCollapsed` を `DEVICE_LOCAL_PREF_KEYS` に足し、`view.ts` に `loadXxx`（壊れた値は「無い」）・ref（名前は design どおり: `sidebarSectionRatio: Ref<number | null>`・`sectionsCollapsed: Ref<{ spaces: boolean; agents: boolean }>`。保存のキー名は `sidebarSectionRatio`・`sidebarSectionsCollapsed`）・`setSectionRatio`・`commitSectionRatio`・`resetSectionRatio`（項目を消す）・`toggleSectionCollapsed(which)`・return。サーバへ送られないことのテスト。単体テストと壊して落ちる確認
      対象: `packages/protocol/src/messages.ts:658`・`messages.test.ts:146-147`、`packages/server/src/persist/PrefsStore.test.ts:119-125`・`packages/web/src/store/prefsApply.test.ts:46, :80`（端末ごとの項目が落ちる・配りで消えないテストに、2 項目を足す）、`packages/web/src/store/view.ts`・`view.test.ts`、`packages/web/src/actions/PrefsSync.ts`・`packages/server/src/persist/PrefsStore.ts` のコメント（research.md「G2」の直す場所の一覧）
      依存: なし
      AC: AC10, AC11, AC17
- [x] T5: 操作 `toggle_spaces_section`（既定 `prefix+shift+b`）・`toggle_agents_section`（既定 `prefix+shift+a`）。`actions.ts` に `{ type: "toggleSidebarSection", section }`、`bindings.ts` に定義（群は `"pane"`）、ブラウザ版の dispatcher は `view.toggleSectionCollapsed` を呼ぶ。端末版の dispatcher の case は T11 で足すので、この時点では型検査を通す最小の受け口（何もしない）にする。`TuiDispatcher.test.ts` の `EFFECTS` 表（:185-205）は、この時点では `{ none: true }`（T11 で `{ host: "toggleSidebarSection" }` に直す）。`ActionDispatcher.test.ts`（`show_subagents` は :2801 にある）に、`toggleSidebarSection` の呼び出しのテストを足す。数を数えるテストを直す（操作 58→60・群 pane 27→29・prefix の後のキー 46→48・`KeySettings` 66→68・`LEGACY_DEFAULT_PREFIX_MAP`・`TuiDispatcher.test.ts` の表）
      対象: research.md「G5」の一覧（`actions.ts`・`bindings.ts`・`ActionDispatcher.ts`・`TuiDispatcher.ts`・`bindings.test.ts`・`keymap.test.ts`・`TuiDispatcher.test.ts`・`KeySettings.test.ts`）。手本は `show_subagents` を足したコミット ccf58e6・ee49c39
      依存: T4
      AC: AC-I3, AC13
- [x] T6: pane の間の境目（`Splitter.vue`）——`resize-handle` のクラスと `useResizeDrag`（`begin`＝今の比・`cancel`＝始めた比を送る・`reset`＝0.5 を送る。**cancel・reset は、ためていた送信のタイマーと `pendingRatio` を捨ててから送る**）。`.pane-layout-side` に `isolation: isolate`。キーは今のまま。`:focus-visible` の背景と outline は線に置き換える（消す）。`z-index: 1`。単体テスト（ダブルクリック・Esc・取り消しの後に古い比で上書きされない）。`useResizeDrag` が move を rAF で 1 回にまとめるので、`Splitter.test.ts:112` ほかは rAF を流す形に直すと壊して落ちる確認。既存の `Splitter.test.ts`・E2E が通ること
      対象: `packages/web/src/components/Splitter.vue`・`Splitter.test.ts`、`PaneLayout.vue:260-266`
      依存: T3
      AC: AC1, AC2, AC17, AC15
- [x] T7: サイドバーの幅の境目——`.sidebar-divider` を `resize-handle resize-handle-x`・幅 8px に、**位置は nav の内側（`right: 0`）のまま、nav の `overflow` も今のまま**にする（区画ごとのスクロールは T8 で入るので、外へはみ出す `right: -4px`・`overflow: visible` は T8 でまとめて切り替える。T7 だけでサイドバーのスクロールが壊れないように）。`role="separator"`・`aria-orientation`・`aria-label`・`aria-valuenow/min/max`・`tabindex`（畳んでいる間は `-1` と `aria-hidden`）。`useResizeDrag` に置き換え（今の `onDividerPointerDown`／`Move`／`endDrag`・`lastDividerClick` を消す）。キー（`←`／`→` 16px・`Home`・`End`・`Enter`）。`watch(view.modalOpen)` は `finish()`。単体テスト（role・aria・キー・Esc・ダブルクリックで既定）。**既存の `Sidebar.test.ts:744-875` は、`pointermove` の直後に幅を同期で見ている（:751, :763, :787, :794, :816, :829-833, :843-844）ので、rAF を流す形（`vi.stubGlobal` で rAF を同期にする、または fake timers）に直す。**E2E `settings.spec.ts:46-57` が通ること
      対象: `packages/web/src/components/Sidebar.vue`（`.sidebar-divider`・script の幅のドラッグ）、`Sidebar.test.ts`
      依存: T3
      AC: AC1, AC2, AC3, AC15, AC-I2
- [x] T8: 区画の構造（ブラウザ版）——design「区画の構造」の入れ物（`.sidebar-sections`・区画ごとの `.sidebar-section-body`〔スクロール〕・フッタと畳むボタンは固定）と CSS（自動・比あり・片方／両方を畳む・`min-height`〔spaces はフッタを足す・畳んだら 0〕・padding は body）。保存した比・折りたたみ（T4）を `:style`／クラスに反映する。**nav を開いているとき `overflow: visible`、`.sidebar-divider` を `right: -4px`・`z-index: 3` にして外へ出す（T7 から移す）。見出し・フッタの `padding-right: calc(0.8em + 6px)`（`Sidebar.vue:1069-1088, :1114`。6px の境目の分、というコメント付き）は、境目が 4px だけ内側に入るので `+ 4px` に直し、コメントも合わせる。**サイドバーを畳んだ状態は、今の構造に戻す**（`.sidebar-collapsed` で `overflow-y: auto` に分ける）（nav が 1 つのスクロール・区画の折りたたみを無視して全部出す・見出しと境目は出ない）。この時点では見出しはボタンにしない・区画の境目は描かない（T9）。**golden（`Sidebar.defaultLayout.test.ts:94-99` の `rowsHtml`。`.sidebar-row` の outerHTML だけを写す）は更新しない**——区画の入れ物・見出し・境目を足しても行の HTML は変わらないはずで、差分が出たら行の退行（そのまま更新して隠さない）。単体テスト（クラス・`style`・畳んだ状態の DOM）と壊して落ちる確認
      対象: `packages/web/src/components/Sidebar.vue`（template 636-814・style 816-1139）、`Sidebar.test.ts`
      依存: T4, T7
      AC: AC9, AC11, AC15, AC20
- [x] T9: 区画の境目（ブラウザ版）——`role="separator"`・`aria-orientation`・`aria-label`・`aria-valuenow/min/max`・`tabindex`・`useResizeDrag`（`begin`＝今の比〔null を含む〕・`move`＝`.sidebar-sections` の rect とポインタから `ratioFromOffset`・`commit`・`cancel`・`reset`＝`resetSectionRatio`）・`box = { total: clientHeight − 1, minTop: 見出し＋2 行＋フッタ, minBottom: 見出し＋2 行 }` の実測・キー（`↑`／`↓` 24px・`Home`・`End`・`Enter`＝自動）・`aria-valuenow` の測り直し（`.sidebar-sections` の `ResizeObserver`・行の数が変わったとき）。両方を開いているときだけ出す。単体テストと壊して落ちる確認
      対象: `packages/web/src/components/Sidebar.vue`、`Sidebar.test.ts`
      依存: T1, T8
      AC: AC10, AC17, AC-I2, AC-I3
- [x] T10: 端末版の保存と描画——`tuiState.ts` の `sidebarSectionsCollapsed`（読み込みの検証・書き出し）、`PrefsModel` の getter、`sidebar.ts` の高さの計算（design「端末版」の 4 通り。agents が 0 件のときは今のまま）・見出しの行（`▾ Spaces`／`▸ Spaces <数>`）・区切りの行（`─ ▾ Agents ─…`／`─ ▸ Agents <数> <状態> ─…`。畳んでいる間は並び順のラベルなし・狭い幅では印と題だけ）・hit `sectionHeader`。単体テスト（4 通りの高さ・文字・hit・保存）
      対象: `packages/tui/src/local/tuiState.ts`・`model/PrefsModel.ts`・`render/chrome/sidebar.ts`、`sidebar.test.ts`・`PrefsModel.test.ts`・`render/Renderer.test.ts:111-123`
      依存: T4
      AC: AC13
- [x] T11: 端末版の操作——`mouse.ts`: `Drag` の `{ kind: "section" }` に `startY`・`moved` を足し、**動かしたときだけ**高さを変える・動かさずに離したら agents の切り替え（どちらかを畳んでいる間は動かしても高さを変えない）。見出しの行のクリックで spaces の切り替え。`TuiApp`/`TuiDispatcher` の host に `toggleSidebarSection`（`setLocalState`）。操作 `toggleSidebarSection` の case（T5 の受け口を埋める。`TuiDispatcher.test.ts` の `EFFECTS` 表を `{ host: "toggleSidebarSection" }` に直し、`harness().host` の模擬にも足す）。navigate に入ると畳んだ spaces を開く。単体テスト（クリックとドラッグの区別・保存・操作）と壊して落ちる確認。既存の `mouse.test.ts:417-423` が通ること
      対象: `packages/tui/src/input/mouse.ts`・`mouse.test.ts`、`app/TuiApp.ts:411-413, :1030-1034`、`actions/TuiDispatcher.ts`・`TuiDispatcher.test.ts`
      依存: T5, T10
      AC: AC13, AC-I3
- [x] T12: E2E `resize-handles.spec.ts`——3 か所の境目（サイドバーの幅・pane の間・区画の境目）で: hover で線が出て離すと消える（`getComputedStyle(el, "::after")` の `opacity` を待つ）／ドラッグ中は外れても線とカーソルが続く・端末の文字が選択されない・通った行に hover が出ない／`Esc` で元の大きさ／ダブルクリックで既定（サイドバーは既定の幅・pane は半分・区画は自動）／太さ 2px の pane の境目の中心から 3px で掴める／サイドバーの境目に `Tab` → 矢印・`Home`・`End`・`Enter`／`page.emulateMedia({ reducedMotion: "reduce" })` で transition-duration 0s／ドラッグ中に打った文字が端末へ漏れない。観測を壊して落ちる確認。2 回続けて同じ結果
      対象: `packages/e2e/src/specs/resize-handles.spec.ts`（新規）。手本は `settings.spec.ts:46-57`（`dragDivider`）・`workspace-tab-pane.spec.ts:172-191`。`keys-mouse-dialogs.spec.ts:256-270, :330`（`describeFocus` は `role=separator` をすべて `"splitter"` と返す）は、サイドバーの境目と pane の境目を区別できる形に直し、`Tab` の順の期待を確かめる
      依存: T6, T9, T7
      AC: AC1, AC2, AC3, AC14, AC17, AC15, AC-I2, AC-I4, AC-I5
- [ ] T13: E2E `sidebar-sections.spec.ts`——workspace とエージェントが多いとき区画ごとにスクロールし、見出し・＋新規・メニュー・畳むボタンが見えたまま／区画の境目のドラッグ・キー・読み込み直しで配分が同じ・最小を割らない／見出しを押して畳む・開く（印・`aria-expanded`・片方が空きを使う・両方畳む・境目が消える・読み込み直しで同じ）／畳んだ見出しの件数と、agents の入力待ちの印／操作のキー（`prefix+shift+b`・`prefix+shift+a`）／サイドバー全体を畳むと区画の折りたたみに関わらず全部のアイコンが出る／畳んだ区画の中にあったフォーカスが見出しへ移る／並び順のボタンが開閉を起こさない。観測を壊して落ちる確認。2 回続けて同じ結果
      対象: `packages/e2e/src/specs/sidebar-sections.spec.ts`（新規）
      依存: T9, T15
      AC: AC9, AC10, AC11, AC12, AC20, AC15, AC-I1, AC-I3, AC-I4, AC-I5
- [ ] T14: 文書——`docs/herdr-parity.md`・`docs/tui-parity.md`（「Spaces／Agents の境界のドラッグ」の web 版の欄と、区画の折りたたみの行）・`docs/tui.md`（「マウス」の見出しのクリック・区切りのクリックとドラッグの区別・`prefix+shift+b`／`a`）・`docs/verification.md`（実機の手順: 17 のテーマでの線の見え方・タッチでの境目のサイズ変更・OS の「動きを減らす」。自動テストの範囲と分ける）
      対象: `docs/herdr-parity.md`・`docs/tui-parity.md`・`docs/tui.md`・`docs/verification.md`
      依存: T13, T11
      AC: AC16
- [x] T15: 区画の見出し（ブラウザ版）——見出しを `<button class="sidebar-section-toggle" aria-expanded aria-controls>`（印 ▾／▸・題）にし、畳んだときの件数（spaces は選んでいるマシンの workspace の数・agents は一覧の数）と、agents の `StateIcon`（`blocked` があるとき）。並び順のボタンは兄弟のまま（畳んでいる間は出さない・互いのクリックは伝わらない）。畳むとき中にあったフォーカスは見出しのボタンへ。操作 `toggleSidebarSection` の動き（フォーカスは動かさない）。navigate に入ると畳んだ spaces を開く。サブエージェントの一覧を閉じたときの戻り先（`data-agent-pane` の行）が畳んだ agents なら見出しのボタン。単体テスト（`aria-expanded`・件数・状態のアイコンの出入り・フォーカスの移動・並び順のボタンと混ざらない・navigate・戻り先）と壊して落ちる確認
      対象: `packages/web/src/components/Sidebar.vue`、`Sidebar.test.ts`、`packages/web/src/components/SubagentListDialog.vue`（戻り先だけ）
      依存: T8
      AC: AC11, AC12, AC-I1, AC-I3, AC-I4, AC-I5
