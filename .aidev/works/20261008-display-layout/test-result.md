# テスト結果

## PR-A（T1〜T12）

実行は worktree `agent-abd91f990c85c37b8`（ブランチ `feature/display-layout`。main `d5fe6bf` を取り込み済み）。

### 全体
- `pnpm build`・`pnpm typecheck`: 通る。
- `pnpm test`: 9127 件通り、3 件失敗＝既知（`packages/server/src/tui.integration.test.ts` の 3 件。worktree のパスが長いと main でも落ちる）。`server/src/extensions`・`display` は 326 件全部通る。
- E2E（Chromium。`--workers=1`）:
  - display の 16 本（PR1〜PR3 の分と `display-layout-state`。noreturn・drop の 3 本を除く）: 131 件通り・1 件失敗（`display-flows` の (13) prefix+i。時間切れ。単独で 2 回、ファイル全体で 1 回流すと全部通る＝既知の揺れ）。
  - `display-script-noreturn` 24 件・`display-script-drop` 24 件・`display-script-noreturn-mobile` 2 件: それぞれ単独で全部通る（退行なし）。
  - `display-layout-state` 15 件・`display-mobile`・`display-script-mobile`: 通る（main 取り込み後に再実行）。
  - `tab-dnd`・`pane-move-scope`: 通る。
  - `settings`・`theme-settings`・`appearance-settings`（「settings」で絞って流した）: 失敗 8 件 = appearance-settings:113・:130（既知）と settings.spec:167・:187・theme-settings:193・:271・:354・:528。後者 6 件は、main（`1ff0418`）の別 worktree で 2 回流して **2 回とも同じ 6 件が落ちた**ので、退行ではない。

### installKeepFocusRelease の実測（T10 (7)(e)）
本物の押下（Playwright のマウス）で、操作中の `script-html` のパネルに対し、［⋮］・つかむ場所・幅のつまみ・帯の行の［⋮］・別の `script-html` の帯の覆い（2 回）・別の面のトレイのボタンを順に押し（そのたび［操作する］で戻す）、`focus_steal` は **0 回**。面は残り、`activeElement` は端末。**`DisplayFrame.vue` を変えずに成り立った**（`window` の `pointerdown` の capture で先に走る設計のとおり）。負の対照 (f) で、呼ばない版は 1 回目（［⋮］）から `focus_steal` が 1 件出て落ちることを確認した。

### 負の対照（T12）
どれも、対策を外してビルドし直し → 該当の E2E を流し → 戻して `git diff` が空であることを確認。生の出力は `/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/neg/*.out`（作業用。リポジトリ外）。
- (a) トレイを `position: absolute` で帯の枠の上に重ねる → `(4) トレイ` が落ちる: `expect(intersects(トレイのボタン, 帯の枠)).toBe(false)` で Expected false / Received true。
- (b) `pickToastSlot` を通さず右下へ寄せる版 → `(8) 知らせ` が落ちる: `chrome #5` Expected false / Received true（下の帯の行の部品と重なる）。
- (c) 上下の帯を 1 つの入れ物・1 つの `v-for`（鍵は面の id）で描く版 → `(6) load と枠の要素` が落ちる（帯を下へ移した直後に `[data-pane-band]` が 2 本あるはずが 0 本になった＝この版の描き方が壊れて、枠の要素の比較まで届かなかった）。「変えていない面の枠は同じ要素のまま」の項目そのものに当てた確認にはなっていない。ブラウザが iframe の移動で `load` を増やすかの実測（U1）は、この作業では取れていない（置き方を「動かさない」にしてあるので、結論は変わらない）。**不確かな点として残す**。
- (d) `effectiveCollapsed` が記憶より指定を先に見る版 → `(5)` が落ちる（開いたはずの面の `[data-pane-panel-tab]` が 2 でなく 0）。
  `writeFace` が変えた項目だけを書く版（`collapsed` が欠けた記憶は指定へ落とす）→ `(5)` が「帯を下へ移しただけの後、--collapsed つきの set でたたまれない」で落ちる（`[data-pane-bands-edge="bottom"] [data-pane-band]` が 1 でなく 0）。
- (e) `withDisplayChange` の手順 2〜4 を全部外す版 → `(7)(c)` が落ちる: `__bodyHits` Expected 0 / Received 1（`activeElement` が `body` になった）。「前に移す」そのものは、単体 `displayOps.test.ts`（変更の時点で `activeElement` が端末・`body` を通らない）で見る。
- (f) `installKeepFocusRelease` を呼ばない版 → `(7)(e)` が落ちる: `head ⋮` で `stealReports` Expected 0 / Received 1。

### 設計から外れた点・補足
- 開いた面を、その側の「選んでいるタブ」にした（`setFaceCollapsed(info, false)`。トレイで開いたのに別のタブが出たままになるため。E2E で見つけた）。
- 面のメニューを画面の下・右にはみ出さない位置へずらす（下の帯の［⋮］から開くと項目が画面の外に出たため）。
- `DisplayTray` の `title` は `displayLabelPrefix`（拡張の出どころの文）つき（main の PR1 に合わせた）。拡張の面にも `dock`・`edge`・`collapsed` が効く（`ExtensionApi.test.ts` に項目を足した）。
- 設定の画面（ブラウザ版）の項目は 2 つ（初めの状態・帯の既定の場所）。「既定の置き場所」は design どおり PR-A では出さない（端末版の設定の画面には 3 つとも出る）。
- 「設定で無効」の文言の E2E は、共有の設定を変えるとサーバが面を閉じるので、ストアの値だけを変えて見た。

### スクリーンショット
`/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/display-layout-a/`（`light-*`・`dark-*`。1 ボタンだけの細い行・帯の行のトレイ・スクリプトの面のボタンの印・帯のメニュー・たたんだ帯・帯を下・設定の画面）。

## PR-A レビューの指摘の修正後（2026-10-08）
- `pnpm build`・`pnpm typecheck`: 通る。`pnpm test`: 9130 件通り・4 件失敗 = 既知の `tui.integration.test.ts` 3 件＋ `web/src/store/notifications.test.ts` の 1 件（全体の実行中だけ落ちる揺れ。単独で 3 回流すと全部通る。差分に関係しない）。
- E2E（`--workers=1`）: display 系（`display-layout-state` を含む。noreturn・drop の 3 本を除く）190 件通り・1 件スキップ。`display-script-noreturn` 26・`display-script-drop` 24・`display-script-noreturn-mobile` 2 件、単独でそれぞれ全部通る。
- 負の対照（外してビルド → 落ちることを確認 → 戻す）:
  - S1: スナップショットから `placement` を外す → (8b) が落ちる（知らせと chrome #2 が重なる）。
  - S2: 帯の下限を 0 にする → (13) が落ちる（幅 257px で `[data-pane-band-close]` の右端が帯の箱の外）。
  - S3: 備えの watch を外す → (14a)(14b) が落ちる（`activeElement` が端末にならない）。
  - S4: 3 つの部品の `ev.repeat` の分岐を外す → (7)(c2) が落ちる（パネルの出入り 40 回 / 上限 1）。
  - S5: 割り付けが変わるたびに帯の枠を DOM で動かす版（実際に 1 つの `v-for` にした版は、スクリプトの枠が「移動した」と数えられて面が閉じ、枠の比較の前に落ちた。静的な枠の (6b-html) で、動かす版は `data-display-loads` の比較で落ちる）。
  - N1: `isTrusted` の確認を外す → 単体 1 件が落ちる。
- U1 の実測: iframe を DOM で動かすと同じ要素のまま `load` が 1 増える（decisions D23）。
- スクリーンショット: `/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/display-layout-a/fix-*.png`。

## PR-B（T13〜T20。パネルの上下左右と D&D。2026-10-09）

実行は worktree `agent-abd91f990c85c37b8`（ブランチ `feature/display-layout-b`。main `833dc18` から）。E2E は `env -u DISPLAY -u WAYLAND_DISPLAY`（この環境で DISPLAY・WAYLAND_DISPLAY が設定されたままだと、Chromium が画面のフレームを描かず E2E が止まる。アプリの不具合ではない）をつけて流した。

### 全体
- `pnpm build`・`pnpm typecheck`: 通る。`pnpm test`: 9202 件通り・失敗 0。
- E2E（`--workers=1`）: display 系 16 本＋`tab-dnd`＋`pane-move-scope`＋`settings-menu` の 200 件通り・1 件スキップ・失敗 0。`display-script-noreturn` 24 件・`display-script-drop` 24 件・`display-script-noreturn-mobile` 2 件は単独で全部通る。新しい `display-layout-dock` は 17 件。

### 負の対照（T20。外して `vite build` → E2E → 戻して `git diff` が空）
- (a) 割り付けが変わるたびに、面の枠の入れ物を DOM で動かす版 → `(6-script-html)`・`(6-html)` が落ちる。**実際に落ちたのは「枠の要素が同じ」「`load` が 1」より前の、面の数の確認**: 動かした枠が `load` を増やし、アプリの「移動した（navigated）」の守りが面を閉じるため（D23 の実測のとおり）。出力: `Expected: 4 / Received: 0`（`iframe[data-display-frame]` の数）。1 つの `v-for` にした版そのものは、PR-A で同じ理由で枠の確認の前に落ちたので、作っていない。
- (b) 端末の最小（`TERMINAL_MIN_COLS`・`TERMINAL_MIN_ROWS`）を引かない版 → `(3) 横` が `1280: 列数 Expected: >= 40 / Received: 27`、`(3) 縦` が `800: 行数 Expected: >= 10 / Received: 5` で落ちる。
- (c) `installKeepFocusRelease` を呼ばない版 → `(6c)` が `right:grip#0 Expected: 0 / Received: 1`（`focus_steal`）で落ちる。
- 生の出力: `/tmp/claude-1000/-workspaces-sodashitsu--claude-worktrees-agent-abd91f990c85c37b8/ab9fdce8-c23f-440a-b067-4eb494833d52/scratchpad/neg/{a,b,c}.out`（作業用）。

### 補足
- 帯・パネルの 1 pane の上限は、帯 2 本（`display_limit`）。E2E の面の数はそれに収めた。
- スクリーンショット: `/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/display-layout-b/`。


## PR-C（T21〜T27。浮いた窓。2026-10-09）

実行は worktree `agent-abd91f990c85c37b8`（ブランチ `feature/display-layout-c`。main `d26bb6d` から）。E2E は `env -u DISPLAY -u WAYLAND_DISPLAY`・`--workers=1`。

### 全体
- `pnpm build`・`pnpm typecheck`: 通る。`pnpm test`: 486 ファイル・9541 件すべて通る（失敗 0）。
- E2E（`--workers=1`）:
  - `display-layout-float`（新規）: 22 件通る。
  - 既存の display 系（`display-layout-dock`・`display-layout-state`・`display-flows`・`display-isolation`・`display-mobile`・`display-resize`・`display-script-app`・`-engage`・`-focus`・`-isolation`・`-measure`・`-mobile`・`-nav`・`-review`・`-setting`・`display-script`）: 156 件通る・1 件スキップ（元から）。
  - PR3 のフォーカスの E2E 3 本は、ほかの spec と一緒に流さず 1 本ずつ: `display-script-noreturn` 24 件・`display-script-drop` 24 件・`display-script-noreturn-mobile` 2 件、すべて通る。
  - 見出しの最小の幅を直した後に流し直し（`display-layout-dock`・`display-layout-state`・`display-script-engage`・`display-script-review`）: 71 件通る。

### U3・U4（iframe の上の `elementFromPoint`・ポインタの捕捉）の実測
窓の移動・大きさの変更（ポインタを窓の外へ大きく動かしても追う）・D&D（中央へ落とす）は、`useResizeDrag`／`createDockDrag` のポインタの捕捉と、`<html>` のクラス（`soda-resizing`・`soda-display-dragging`）で枠の `pointer-events` を切る作りで、枠（iframe）の上でも `pointermove`・`pointerup` を取りこぼさなかった。透明な覆いを足す必要は無かった。

### 負の対照（T27）
どれも、対策を外して `vite build` → 単体・E2E を流し → 戻して `git diff` が空であることを確認（生の出力は `<scratchpad>/neg/{a..i}.out`）。
- (a) `clampFloatRect` を通さない版 → 単体 `floatGeometry` が 10 件落ちる。E2E `(2)` が「左上: 窓の箱が端末の箱の中」で落ちる（Expected true / Received false）。
- (b) 窓の層を `position: fixed`（画面全体）にした版 → E2E `(3)` が「左上: 帯の行の印 の点が窓の中の要素でない」で落ちる（Expected false / Received true）。
- (c) 重なりを `v-for` の配列の並べ替えで替える版 → 単体 `PaneFrame.test` が `expected [ 'b', 'a' ] to deeply equal [ 'a', 'b' ]` で落ちる。E2E `(5)` は、最初の窓の問い合わせの時点でタイムアウトした（並べ替えで枠が動いて `load` が増え、面が「移動した」と数えられて閉じる＝窓が消えた。「枠の要素が同じ」「`load` が 1」の項目より前に落ちた。PR-B の負の対照 (a) と同じ形）。
- (d) 窓を開くときに枠へ `focus()` する版 → E2E `(4)` が「窓の出現で端末のフォーカスが動かない」で落ちる（Expected true / Received false）。
- (e) `insertFloat` が新しい窓をいつも最前面に入れる版 → 単体 2 件が落ちる（`expected [ 'a', 'b', 'n' ] to deeply equal [ 'a', 'n', 'b' ]`）。**最初の E2E `(5b)` は通ってしまった**（後から `setFocused` が操作中の窓を前へ出し直すので、結果の z-index では見分けられない）→ 窓の `z-index` を DOM が変わるたびに記録して「出た瞬間から A が最前面」を見る形に強めた。強めた `(5b)` は「B が出た瞬間から A が最前面」で落ちる（Expected > 21 / Received 20）。
- (f) 開いている窓のボタンをトレイから外す版 → 単体 3 件が落ちる。E2E `(1b)` が `aria-pressed` で落ちる（開いている窓のボタンが無い）。
- (g) `effectiveCollapsed` から「置き場所が浮いた窓ならたたむ」を外す版 → 単体 2 件が落ちる。E2E `(1)` が「閉じて始まる」で落ちる（`aria-pressed` Expected false / Received true）。
- (h) 窓を開く操作が記憶に `rect` を書かない版 → 単体 2 件が落ちる。E2E `(2c)` が「--size を変えても動かない」で落ちる。
- (i)（実装中に見つけた不具合の負の対照）見出しのつかむ場所の最小の幅を `4em` に戻す版 → E2E `(7)` が「操作中: [data-display-script-mark] と [data-display-end] が重ならない」で落ちる。最小の窓（240px）で、印「スクリプト」が［操作を終える］に隠れていた（スクリーンショットで見つけた）。

### 設計から外れた点・補足
- `decisions.md` D25 に記載（D&D の中央の矩形・面に依らない部品・縁のつかむ場所・キーのモードの終わり方 ほか）。
- 窓の見出しの印がボタンに隠れる不具合（上の (i)）を直した（`DisplayPanelHead.vue`。つかむ場所の最小の幅を 7.5em に。ドックのパネルでも、足りなければボタンの並びが次の行へ折れる）。
- E2E で、本体の箱の縁から 16px 以内で窓を離すとドックへ置かれる（設計どおり）ので、窓を隅へ寄せる確かめでは、縁から離れた点で離している。
- `xterm.js` 6 は `.xterm-viewport` の `scrollTop` を使わないので、ホイールの確かめは、スクロールバーのつまみの位置（`style.top`）で見る。

### スクリーンショット
`<scratchpad>/display-layout-c/`（`dracula-*`・`catppuccin-latte-*`: 1 窓が 2 枚と右のパネル・2 最小の窓で操作中・3 キーで動かすモード・4 D&D の中央・5 窓が 3 枚）。`<scratchpad>` は `/tmp/claude-1000/-workspaces-sodashitsu--claude-worktrees-agent-abd91f990c85c37b8/3d938499-872a-4ab8-9297-feead72f5a42/scratchpad`。
