# 決定の記録: 画面の様式（20261008-ui-style）

## PR1a・PR1b の実装で、設計と違えた点・見つけた穴

| # | 事項 | 決定 |
| :- | :- | :- |
| E1 | 端末を隠す方法（D12 は `mask`） | `.xterm` は pane より大きい（840×840。親が切っている）ので、`mask` は隣のサイドバーまで覆う。`page.screenshot` の `style` で `.xterm { visibility: hidden }`（配置は変わらない） |
| E2 | 画素の比較に `pngjs`・`pixelmatch` を足さない | E2E の依存に無い。Playwright 同梱の Chromium の canvas で比べる（lockfile は変わらない） |
| E3 | 撮る画面の幅 | 1700×900（1280 では、表示の面の左のパネルが「端末の最小」で自動でたたまれ、4 つの側が撮れない） |
| E4 | 同じコミットどうしで揺れた差の原因と対処 | ①サイドバーの workspace の行（作業フォルダが detached HEAD だと git の枝が出ない）→ git の外の一時フォルダに workspace を作る ②設定「拡張」の置き場所（サーバの一時フォルダ名）→ `.ext-path` を隠す ③グラフのノードの初めの置き場所が pane の UUID の順で決まる → `graph.update` で決まった場所へ置く |
| E5 | `uiStyle` の `theme-boot.js` での扱い | 控えの `uiStyle` が `"modern"` のときだけ `data-ui-style` を当てる。それ以外（無い・壊れている・知らない値）は何もしない。テーマの組が壊れていても様式は当てる（互いに独立）。`ThemeController` は、動いている間は `classic`・`modern` のどちらも属性に書く |
| E6 | vitest の既定では CSS が空に置き換わる（`?raw` も空） | `packages/web/vitest.config.ts` の `test.css.include` に `uiStyle.css` だけを入れる（`uiStyle.test.ts` が中身を検査するため） |
| E7 | **T8 の「クラシックは `origin/main` との差が 0」の例外（設計の見落とし）** | 設定の画面に、ラジオ「画面の様式」を足す（T7）ので、設定ダイアログの画像のうち、この項目の下にある部分・スクロールバーのつまみが変わる（32 枚中 10 枚。差の画像で、差は追加したラジオ・その下へずれた内容・つまみだけと確認）。**これは、機能の追加そのもの**で、避けられない。ほかの 22 枚は差 0。モダンを選んでも（`UI_STYLE=modern`）、差の枚数・画素数は classic とまったく同じ（どの部品も、まだトークンを読まないため） |

## T9: `border-radius` の全行の仕分け（PR1c）

94 行（`packages/web/src`。`public/` の `ask-view`・`display-view` と `third_party/` は、対象外で数えない）→ **置き換える 77 行・置き換えない 17 行**。

決めたこと: `4px`→`--soda-shape-radius`（55）・`3px`→`-s`（9）・`6px`→`-l`（9）。片側だけの丸は、4 つの角と同じ 4px の角の一部（上だけ／右だけ）なので、同じトークンに置き換えてよい（`4px 4px 0 0`〔`AskViewer`・`PanePanel`・`MobileDisplaySheet`〕と `0 4px 4px 0`〔`SettingsDialog`〕の 4 行）。置き換えない: `2px`・`999px`・`50%`・`em`・`9px`・`7px`・`10px`・守りのファイルの中。

| ファイル:行 | 値 | 扱い | 置き換え後／理由 |
| :- | :- | :- | :- |
| `components/OnboardingDialog.vue:345` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/OnboardingDialog.vue:373` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/OnboardingDialog.vue:416` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/AskViewer.vue:190` | `4px 4px 0 0` | 置き換える | `var(--soda-shape-radius) var(--soda-shape-radius) 0 0` |
| `components/SidebarRowsSettings.vue:943` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SidebarRowsSettings.vue:1005` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/GroupPickerDialog.vue:123` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SettingsDialog.vue:1435` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/SettingsDialog.vue:1479` | `0 4px 4px 0` | 置き換える | `0 var(--soda-shape-radius) var(--soda-shape-radius) 0` |
| `components/SettingsDialog.vue:1534` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SettingsDialog.vue:1560` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SettingsDialog.vue:1574` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |
| `components/SettingsDialog.vue:1594` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SettingsDialog.vue:1672` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SessionSwitchDialog.vue:192` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SessionSwitchDialog.vue:216` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |
| `mobile/MobileShell.vue:183` | `4px` | 置き換えない | 守りのファイル |
| `mobile/MobileShell.vue:203` | `4px` | 置き換えない | 守りのファイル |
| `components/AskDialog.vue:359` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/PanePanel.vue:272` | `4px 4px 0 0` | 置き換える | `var(--soda-shape-radius) var(--soda-shape-radius) 0 0` |
| `components/NotificationHistoryDialog.vue:186` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/NotificationHistoryDialog.vue:225` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/NotificationHistoryDialog.vue:246` | `999px` | 置き換えない | 丸（ピル） |
| `components/Toast.vue:209` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/Toast.vue:242` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ReconnectOverlay.vue:95` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/ReconnectOverlay.vue:110` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |
| `components/DisplayScriptMark.vue:76` | `4px` | 置き換えない | 守りのファイル |
| `components/DisplayScriptMark.vue:88` | `4px` | 置き換えない | 守りのファイル |
| `components/DisplayTray.vue:178` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/WorktreeOpenDialog.vue:147` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/WorktreeOpenDialog.vue:184` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/DisplayFrame.vue:624` | `4px` | 置き換えない | 守りのファイル |
| `components/PrefixIndicator.vue:21` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ExtensionApprovalDialog.vue:367` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/ExtensionApprovalDialog.vue:405` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ExtensionApprovalDialog.vue:413` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ExtensionApprovalDialog.vue:429` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ExtensionApprovalDialog.vue:451` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/NotificationBell.vue:47` | `2px` | 置き換えない | 小さな丸（3px に寄せると 1px 変わる） |
| `components/NotificationBell.vue:59` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/NotificationBell.vue:74` | `999px` | 置き換えない | 丸（ピル） |
| `components/graph/MobileGraphSheet.vue:126` | `10px 10px 0 0` | 置き換えない | シートの上だけの丸（固有の値） |
| `components/graph/MobileGraphSheet.vue:175` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/LoginView.vue:214` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |
| `components/KeySettings.vue:848` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/KeySettings.vue:871` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/KeySettings.vue:914` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |
| `components/KeySettings.vue:927` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/KeySettings.vue:938` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/KeySettings.vue:960` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/KeySettings.vue:981` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/KeySettings.vue:992` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |
| `components/HelpDialog.vue:275` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/NameDialog.vue:141` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/RekeyPicker.vue:153` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/graph/RekeyPicker.vue:185` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/PaneChecklist.vue:262` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/graph/PaneChecklist.vue:280` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/PaneChecklist.vue:304` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/WorktreeCreateDialog.vue:92` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/HistoryPanel.vue:166` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SubagentListDialog.vue:125` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `mobile/MobileDisplaySheet.vue:138` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `mobile/MobileDisplaySheet.vue:156` | `4px 4px 0 0` | 置き換える | `var(--soda-shape-radius) var(--soda-shape-radius) 0 0` |
| `components/graph/GraphConfirm.vue:85` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/graph/GraphConfirm.vue:105` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ConfirmDialog.vue:171` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/DisplayPanelHead.vue:190` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/StateIcon.vue:85` | `50%` | 置き換えない | 丸 |
| `components/ExtensionSettings.vue:302` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ExtensionSettings.vue:319` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ExtensionSettings.vue:334` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |
| `components/ExtensionSettings.vue:355` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/ExtensionSettings.vue:372` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |
| `components/ExtensionSettings.vue:449` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/SubagentPanel.vue:108` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `mobile/ExtraKeys.vue:131` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/Sidebar.vue:1237` | `0.6em` | 置き換えない | em の丸 |
| `components/Sidebar.vue:1311` | `9px` | 置き換えない | 固有の値 |
| `components/Sidebar.vue:1434` | `2px` | 置き換えない | 小さな丸（3px に寄せると 1px 変わる） |
| `components/graph/GraphNode.vue:187` | `6px` | 置き換える | `var(--soda-shape-radius-l)` |
| `components/graph/GraphNode.vue:253` | `7px` | 置き換えない | 固有の値 |
| `components/graph/GraphNode.vue:275` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/GraphNode.vue:287` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/GraphNode.vue:302` | `50%` | 置き換えない | 丸 |
| `components/GotoPicker.vue:332` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/GotoPicker.vue:358` | `999px` | 置き換えない | 丸（ピル） |
| `components/graph/GraphView.vue:1716` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/GraphView.vue:1785` | `10px` | 置き換えない | 固有の値（シート） |
| `components/graph/GraphView.vue:1825` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/graph/LinkPanel.vue:533` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/CommandPopup.vue:242` | `4px` | 置き換える | `var(--soda-shape-radius)` |
| `components/SubagentList.vue:53` | `3px` | 置き換える | `var(--soda-shape-radius-s)` |

## T9 の追補（PR1c の後に main から入ったファイル）

| ファイル:行 | 値 | 扱い | 置き換え後／理由 |
| :- | :- | :- | :- |
| `components/ScreenSwitcher.vue:50` | `3px` | 置き換える | `var(--soda-shape-radius-s)`（PR1c の開始後に main から入ったファイル。レビュー N1） |
| `components/graph/GraphCanvas.vue:1813` | `10px` | 置き換えない | 固有の値（`GraphView.vue` の `10px` が、グラフの主な領域の画面化で移ったもの） |

`origin/main` を取り込み直して、`git grep` で、対象（`4px`・`3px`・`6px`・片側の形）が残っていないことを確かめた（守りのファイルを除く）。

## PR2（pane のすき間と基本画面の枠組み）の決定

| # | 事項 | 決定 |
| :- | :- | :- |
| P1 | 太さの表 | `PANE_FRAME_THICKNESS_PX_BY_STYLE`（`store/settings.ts`）。クラシックは今の表、モダンは 4・8・12px（仮置き）。`App.vue` の 1 か所（`--soda-pane-gap`）で配る。`resolvePaneChrome`（4 つの設定の意味）は様式を引数に持たない |
| P2 | pane の枠の角（T12b） | 枠（`.pane-frame-edge`。余白の外側）にだけ `border-radius: var(--soda-shape-pane-radius, 0)`。端末の箱は切らない（端末の角は、丸みの内側に収まる）。表示の面の枠も切らない |
| P3 | 高さ・余白（T12c） | `min-height: var(--soda-shape-row-h/-control-h, auto)`・`padding-inline: var(--soda-shape-pad-x, <今の値>)`。クラシックは未定義で、値は今のまま。行は `justify-content: center`（クラシックでは余りが無いので見た目は同じ）。対象: サイドバーの行・フッター・セッションの行・小ボタン・tab・「＋」・tab バーの右端・画面の切り替え |
| P3a | 変えなかったもの | pane の名前の行（枠線の legend。上の余白は `1.2em` で配置の計算に入る）・表示の面の見出し・帯・トレイ（`DisplayPanelHead`・`PaneBands`・`DisplayTray`。px の高さが、表示の面の配置の計算〔最小の高さ 96px など〕と結び付いている）。モダンでは、これらはクラシックの高さのまま。PR3 以降で、配置の計算とあわせて扱うか、利用者の判断を待つ |
| P4 | E2E をモダンで流したときの失敗 | `appearance-settings` の太さの項（クラシックの 4・6・2px を直に確かめる）は、モダンでは値が違って落ちる＝想定どおり。`sidebar-sections` の 2 件・`display-layout-state` の `(7)(c)` は、**クラシックでも・`origin/main` でも落ちる**（環境・負荷） |
| P5 | 絵の端末の文字 | 左が欠けて見えるのは、クラシックでも同じ（headless の端末の入れ物が pane より大きい既知の挙動。E1）。様式の差ではない |
