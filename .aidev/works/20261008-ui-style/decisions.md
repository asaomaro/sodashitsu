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

## PR3（重なる部品）の決定

| # | 事項 | 決定 |
| :- | :- | :- |
| Q1 | 影のトークン | `--soda-shape-shadow`（モダンだけ定義）。`0 8px 24px` ＋ `0 1px 3px`、黒の 22%・18%（`color-mix(in srgb, black N%, transparent)`）。`uiStyle.test.ts` は、この形に限って `color-mix`・`black` を許し、影のトークンの中だけ・30% 以下であることを確かめる。部品は `box-shadow: var(--soda-shape-shadow, none)`（クラシックは影なし＝今のまま）。対象 18 の面: メニュー（表示の面のメニューも `ContextMenu`）・ask・確認・名前・worktree 2・グループ選択・セッション切替・ヘルプ・設定・通知の一覧・サブエージェント一覧・移動先（goto）・はじめの案内・拡張の承認・コマンドのポップアップ・再接続・トースト |
| Q2 | 余白・高さ | `--soda-shape-pad`（ダイアログの内側。モダン 20px。クラシックの `1em` はフォールバック）・`--soda-shape-menu-radius`・`--soda-shape-menu-pad-y`。ボタン・入力は `min-height: var(--soda-shape-control-h, auto)`（もとから `min-height` を持つ所は、フォールバックにその値を移した）。UA の既定のボタンの左右の余白は、ブラウザごとに違うので触れない（高さだけ） |
| Q3 | 変えなかったもの | `<ask-form>` の中・`view`・表示の面の枠の中・グラフ系の面（`GraphConfirm`・`RekeyPicker`・`PaneChecklist` ほか。PR4）・モバイルの骨組み。拡張の承認・確認のダイアログの文言・ボタンの順・フォーカス・待ち・コマンドの全文は、コードに触れていない（余白・高さ・影だけ）。`--soda-shape-pad` を使う所は、承認のダイアログの本文の左右・下の余白 |
| Q4 | 撮る画面 | 32 → 44 枚（表示の面のメニュー・サイドバーの行のメニュー・トースト〔設定の読み直し〕・通知の一覧・畳んだサイドバー・モバイルのダイアログ〔設定〕を足した）。比較は、元の側でも、同じ spec（working tree のもの）で撮るので、足した画面は両側に出る |
| Q5 | S1〜S3（PR2 のレビュー） | S1: 意味の無い単体テストを消し、モダンの E2E（4 つの設定の全組み合わせで、辺ごとの余白が設定どおり）に。S2: 畳んだサイドバーは `--soda-shape-pad-x` を `0.8em` に戻す（内側の幅がクラシックと同じ）。S3: pane の角は `min(角, すき間 × 1.5)`（細い 4px → 6px） |
| Q6 | 読みやすさ（T13d） | モダンが足す重なりは、影（部品の外側）・角・余白だけで、文字・地・枠の色は変えない。E2E で、全 17 テーマ × 設定・トースト・メニュー・メニューの行の色がクラシックと同じ・比が下がらない・影が inset でなく 30% 以下・フォーカスの輪（キーボードで届いた状態）が消えないことを確かめる |

## PR4（モダンの配置）の決定

| # | 事項 | 決定 |
| :- | :- | :- |
| R1 | 出し分けの口 | `composables/useUiStyle.ts` の `modernLayout`（モダンで、かつ 1 列のモバイルでない）。Sidebar・TabBar・ContextMenu はこれだけを読む。`isModern` は DOM の出し分けが要る所向け |
| R2 | 「新規」のメニュー | 新しいメニューの対象 `{ kind: "new" }` を足し、既存の `ContextMenu`（キーボード・フォーカスの戻りつき）に載せた。項目は今ある操作を呼ぶだけ: workspace＝`newWorkspace`・pane＝`split` の既定（`split_vertical`＝右）・グループ…＝`createGroupForWorkspace(いまの workspace)`。グラフの画面では pane を出さない（見えない基本画面を変えるため）。最下部のボタンから開くので、メニューは点の上に開く（`MenuAt.flipUp`。ほかのメニューの位置は変えない） |
| R3 | たたむ印 | 境の線の上の印（`.sidebar-edge-toggle`・当たり 24px・z-index 4＝つまみの上）。畳んだ nav は `overflow-x: hidden` で外へはみ出せないので、畳んだ状態は内側の右端（同じ縦の中央）。つまみとは兄弟の要素なので、印の押下はつまみへ届かない |
| R4 | フォーカスの移り | 様式を切り替える（`flush: "pre"`）とき、サイドバーの中の押している部品の役割（たたむ・新規・メニュー）を調べ、描いた後に対応する部品へ。無ければ端末。tab バーが消えるときは、TabBar の既存の `watch(visible)` が端末へ戻す |
| R5 | `aidev taskcheck` | この環境の `aidev`（`/mnt/c/git/ibmi-dokubako/tools/aidev-cli`）は、CRLF で直接は動かず、`taskcheck` の命令も無い版だった。T15c の点検の記録は打てていない（実装後の全体の点検に回す） |
| R6 | 撮影の揺れ | `ui-style-shots.spec.ts` の作業フォルダを、乱数の名前から固定の名前へ（グラフのノードにフォルダ名が出るようになり、撮るたびに 500 画素ほど差が出たため。様式の差ではない）。撮る画面は 44 → 48 枚（新規のメニュー・tab が 1 つ） |
| R7 | モダンで流した既存の E2E | `tab-dnd`・`key-bindings` は通る。`sidebar-sections`（最下部の配置）・`workspace-tab-pane`（tab が 1 つなら tab バーなし・最下部の畳むボタン）・`workspace-groups`（右クリックの「新しいグループを作る…」・spaces の［＋ 新規］を手順に使う）は、クラシックの配置を前提にしているので、モダンでは落ちる。既存は変えず、モダン版を `ui-style-layout.spec.ts` に別に書いた |

## pane の操作ボタン（PR4 の続き）の決定

| # | 事項 | 決定 |
| :- | :- | :- |
| S1 | Tab の順 | ボタンは `tabindex="-1"`（Tab の順に入れない）。キーボードは、いまのキー（分割・拡大表示・閉じる）と、pane の枠へ Tab → Enter で開くメニューで足りる。ボタンまで足すと、pane の数 × 4 回の Tab が増え、選ばれている pane の枠だけが Tab で止まる今の決まり（roving tabindex）が崩れる |
| S2 | 置き場所の分け方 | 名前の行が「確保されている」（`reserveNameSpace`＝名前の表示の設定が入で枠が出ている）ときは、名前が空でも行の右端。そうでなければ端末の領域（`.pane-frame-center`）の右上の隅。隅は表示の面の見出し・帯・パネルの外（端末の領域の中）で、浮いた窓の層（z-index 20）より下（19）に置き、窓を邪魔しない |
| S3 | 名前の行の高さ | モダンは 28px（`--soda-shape-name-h`。ボタン 24px が入る）。クラシックは未定義＝今の 1.2em のまま。インラインの style の文字列も、クラシックでは今のまま（`nameRowH`） |
| S4 | 閉じる | `closePaneWithConfirm`（必ず確認。ダイアログは `confirmClose` と同じ）。押したときに、その pane を選んで端末へフォーカスを移してから開く（確認が、いま選ばれている pane について出る。取りやめると端末へ戻る）。キー・右クリックの経路は変えない |
| S5 | 入りきらないとき | 箱の幅が（全部のボタン＋名前の最小 48px＋余白）より狭ければ、分割の 2 つを隠す。最大化と閉じるは、どんなに狭くても残す。名前は省略記号で切る（最大幅からボタンの分を引く） |
| S6 | 隅のボタンの見え方 | 隠れている間は `opacity: 0` ＋ `pointer-events: none`（見えないものを押せない）。pane の上にポインタがある（`:hover`）・選ばれている・ボタンにフォーカスがある間だけ出す。地は `--soda-menu-bg` を 88% 混ぜた半透明（色の値は足さない） |
| S7 | 狭い pane の名前 | 最大化と閉じるだけでも名前の入る幅が残らない pane は、名前を出さない（名前の箱の左右の余白が最大幅の外に足され、ボタンに重なるため）。名前が D&D の掴み手でもあるが、そこまで狭い pane は、ボタンの押しやすさを優先 |
| S8 | モダンで流した既存の E2E（pane の操作ボタン後） | `pane-move-scope`・`display-script-engage` は通る。`appearance-settings`（tab バーが 1 つで隠れる前提・太さ 4px の値）・`keys-mouse-dialogs`（枠の外寸 4px・spaces の区画のメニュー）・`display-script-noreturn` の幅のつまみ（つまみの縦の中央を狙う＝そこに境の印があるため。印の上では、幅のドラッグが始まらないのが仕様）は、モダンでは落ちる（クラシックの配置・数値の前提）。既存は変えない |
| S9 | 区画の見出しの文字（AC23） | クラシックの見出しは、ボタン（`.sidebar-btn` の 0.85em）の中の題（0.85em）で、実効は行の 0.72 倍だった。モダンは、ボタン 0.95em・中の 1em＝実効 0.95 倍、濃さ 0.9（クラシック 0.75）。トークンは 3 つ（`-font`・`-inner`・`-opacity`）。`uiStyle.test.ts` の「font の宣言が無い」検査は、宣言（`font-size:` ほか）だけを見るよう、変数名の `font` を除いた（`font-family` は引き続き禁止） |

## PR4 のレビュー後の修正の決定

| # | 事項 | 決定 |
| :- | :- | :- |
| T1 | B1（`keys-mouse-dialogs.spec.ts:281` の落ち） | **コードの退行ではなかった**。同じコミットを別のパスで流すと通る。直前のクリックのポインタが端末の入力欄（＝シェルのプロンプトの末尾。cwd のパスの長さで位置が変わる）に残り、worktree のパスでは x=830 で、開いた pane のメニュー（x 762〜985）の 2 番目の行に載る。`ContextMenu` の `mouseenter` が選択を 1 つ進め、ArrowDown 4 回が 1 つ余計に進んだ（main をそのパスで流しても同じ位置に残る）。クラシックの動きは変わっていない。試験の期待は変えず、キーボードだけの試験なので、Enter の前にポインタを画面の隅へ退けた（`page.mouse.move(2, 2)`）。この直しは別のコミット |
| T2 | 指摘 3 | `PaneFrame` は `modernLayout` を読む（`isModern` をやめる）。狭い窓（1 列の配置）では、ボタンも 28px の名前の行も出ない |
| T3 | 指摘 2（S6 の訂正） | 隅のボタンの箱は何も受けず（地・縁・余白なし）、ボタンごとに不透明な地と縁（`box-shadow` の inset）。押せるのは見えている間のボタンだけ（`--pane-actions-events`）。半透明の帯はやめた |
| T4 | 指摘 5 | 最大化中の［右へ分割］は、キーと同じ結果になることを E2E で確かめた（`SPLIT_WHILE_ZOOMED`） |
| T5 | 指摘 6 | 実寸で重なっていた（畳んだ幅 48px。行の印 13〜29px に対し、印の当たり 24〜48px）。畳んだ状態は、当たりを右の 18px（30〜48px）に絞った。E2E で矩形を比べる |
| T6 | 指摘 1・4・8 | 文書に書いた（`docs/ui-style.md`）。1: 「新規 → グループ…」は、いま開いている workspace を入れたグループを作る。4: 印の当たり（境の両側 12px）が、縦の中央で主な領域の左端を覆う。8: 数値は仮置き |
