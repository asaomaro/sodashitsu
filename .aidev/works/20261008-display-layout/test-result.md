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
