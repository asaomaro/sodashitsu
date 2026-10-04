# 調査: 操作できる所の見え方（サイズ変更・D&D・サイドバーの区画）

調べたのは `origin/main`（PR #77 まで）の実物。`group-worktree-items`（サイドバーの行と D&D を作り直す作業。実装中）は入っていない。

## 事実

### F1 サイドバーの幅のハンドル（ブラウザ版）
- `packages/web/src/components/Sidebar.vue:582-589` の空の `<div class="sidebar-divider">`。role・aria・tabindex・keydown は無い（キーボードで動かせない）。
- CSS（:783-791）: 右端に重ねた幅 6px・`cursor: col-resize`・`touch-action: none`。背景なし。hover・ドラッグ中の規則は無い。見える線はサイドバーの `border-right: 1px`（:608）だけ。
- Pointer Events と `setPointerCapture`（:391-424）。`pointercancel`・`lostpointercapture` でも終える。350ms 以内の 2 回目の pointerdown で既定の幅へ戻す（:395-402）。畳んでいる間は動かさない。
- 幅は `SIDEBAR_WIDTH = {default: 240, min: 160, max: 360}`（`store/view.ts:168`）。保存は localStorage `soda.prefs.v1` の `sidebarWidth`（端末ごと。`DEVICE_LOCAL_PREF_KEYS`、`protocol/src/messages.ts:628`）。ドラッグの終わりに 1 回書く。

### F2 pane の間のハンドル（ブラウザ版）
- `Splitter.vue:91-105`: `role="separator"`・`aria-orientation`・`aria-valuenow`（5〜95）・`tabindex="0"`。矢印で 2% ずつ（:79-87）。
- 太さ＝当たり判定は `var(--soda-pane-gap, 4px)`（設定 `paneFrameThickness` の thin 2 / thick 6）。通常は `background: var(--soda-menu-border)`、`:focus-visible` で色と outline。**hover・ドラッグ中の規則は無い。**
- pointer capture（:64）。50ms 間隔で `layout.set_split_ratio`。`pointercancel`・`lostpointercapture` のハンドラは無い。ダブルクリックの動きは無い。

### F3 サイドバーの 2 区画（ブラウザ版）
- `.sidebar` が縦の flex で、**サイドバー全体が 1 つのスクロール**（:598-609）。`.sidebar-spaces`・`.sidebar-agents` は高さの指定が無く、中身の高さのまま積まれる（:613-619）。区画の間のドラッグも、区画の折りたたみも無い。
- 見出し `.sidebar-section-header`（:459-464, :547-552）: 題（"spaces"／"agents"）と並び順のボタン。サイドバーを畳むと見出しは出ない。spaces の末尾に［＋ 新規］［メニュー］（:531-543）。いちばん下に `.sidebar-footer`（`margin-top: auto`）。

### F4 サイドバーの 2 区画（端末版）
- 区画ごとに別のスクロール。高さは `prefs.sidebarSpacesRows`（無ければ中身の高さ）から決める（`tui/src/render/chrome/sidebar.ts:214-229`）。区切りの行（`─` と「Agents」と並び順。:291-304）をドラッグして変えられる（`input/mouse.ts:312-313, :591-593`）。保存は手元の `tui-state.json` の `sidebarSpacesRows`（`local/tuiState.ts:17-18`）。**区画の折りたたみは無い。**
- 共有の設定（`SharedPrefs`）に、区画の高さ・折りたたみの項目は無い。

### F5 D&D（ブラウザ版。3 つとも Pointer Events。ドラッグの像は無い）
- **workspace の行**（`Sidebar.vue:285-384`）: 閾値 6px・pointer capture・`Esc` で取り消し。**掴んだ行の見た目は変わらない。**落とし先は行全体の枠（`.sidebar-row-drop-target`＝`outline: 2px solid var(--soda-fg)`。:650-653）で、**挿入位置の線は無い**（効果は「その行の直前へ」）。落とせない所の表示は無い。キーは `move_workspace_previous/next`（既定キーなし）。
- **タブ**（`TabBar.vue`）: **タブ自体のドラッグでの並べ替えは無い**（pane の落とし先としてだけ働く。`.tab-bar-item-drop-target`＝2px dashed accent）。並べ替えはキーの `move_tab_previous/next`。端末版にはタブのドラッグの並べ替えがある（`tui/src/input/mouse.ts:350, :594-597`）。
- **pane**（`PaneFrame.vue:97-231`）: 掴み手は pane の名前（`.pane-frame-name`。枠を出しているときだけ）。掴んでいる間の変化は `cursor: grabbing` だけ。落とし先は、pane の縁の破線と面（縁 30% は分割・中央は入れ替え〔赤〕。:381-419。判定は `term/paneDragZone.ts`）、タブ、サイドバーの workspace の行（`.sidebar-row-pane-drop-target`）。
- workspace と pane の D&D を実ブラウザでドラッグする E2E は無い（単体は `Sidebar.test.ts:820-1064`・`PaneFrame.test.ts:351-`・`TabBar.test.ts:436-`）。幅のドラッグは E2E がある（`settings.spec.ts:48-56, :98-105, :187-`）。

### F6 色と動き
- 色は `client-core/src/theme/uiTokens.ts` が正で、`ThemeController` が CSS 変数に当てる（`--soda-accent`・`--soda-menu-border`・`--soda-menu-hover-bg`・`--soda-menu-active-bg`・`--soda-fg` など）。D&D の規則の fallback（`var(--soda-accent, #8be9fd)`）は `:root` の値と食い違っている。
- `transition` は web 全体で 0 件。`animation` と `prefers-reduced-motion` の扱いは `graph/GraphEdge.vue:127-145` の 1 件だけ。

### F7 文書
- `docs/tui.md`「マウス」、`docs/tui-parity.md`（H04m・H04w・H19・H19b。H19b は web 版「無し」）、`docs/herdr-parity.md`（H04・H19・H21・H23・H41）、`docs/verification.md`（pane 名の D&D :362-376・サイドバーの幅 :640-654）。

## 設計判断に効く点

1. ブラウザ版の 2 区画は、今は 1 つのスクロールの中に積んであるだけ。区画の間を動かせるようにするには、区画ごとのスクロールに変える必要がある（端末版と同じ形）。
2. 区画の高さと折りたたみは、端末版の高さが手元の保存なのに揃えて、端末ごとの保存にするのが自然（画面の大きさに依るため）。
3. サイドバーの行と D&D は `group-worktree-items` が作り直している（項目単位の移動・グループの見出し・グループなし）。**D&D の表現は、その作業が main に入った後の構造の上に載せる**。先に実装すると衝突する。
4. 動きの表現は今まで無い。足すなら `prefers-reduced-motion` で止める決まりを最初に作る。
5. D&D の E2E が無い。表現を足すときは、ドラッグの途中の画面を観測する E2E を一緒に作る。

## 実装アンカー

- `packages/web/src/components/Sidebar.vue`（:391-424 幅のドラッグ、:285-384 行の D&D、:458-567 区画、:598-791 CSS）
- `packages/web/src/components/Splitter.vue`、`PaneLayout.vue:206-266`
- `packages/web/src/components/PaneFrame.vue:97-231, :315-327, :381-419, :474-476`、`term/paneDragZone.ts`
- `packages/web/src/components/TabBar.vue:159, :236-239`
- `packages/web/src/store/view.ts:55, :168, :669-670`（端末ごとの保存）
- `packages/tui/src/render/chrome/sidebar.ts:214-304`、`input/mouse.ts:312-313, :591-597`、`local/tuiState.ts`

## 追記（2026-10-04。PR #81 が main に入った後の構造。行番号は HEAD 0f9e621）

### G1 `Sidebar.vue`（1139 行。script 1-634・template 636-814・style 816-1139）
- template: `<nav class="sidebar">` 637／セッションの行 638-651／spaces の section 652-752（見出し 653-658〔題 654・並び順 655-657〕・行 659-737・フッタ〔＋ 新規・メニュー〕739-751）／agents の section 754-790（見出し 755-760・行 762-789）／畳むボタン `.sidebar-footer` 792-803／`.sidebar-divider` 805-812。
- CSS: `.sidebar` 821-832（縦の flex・`overflow-y: auto`。**スクロールするのは nav 全体**）／`.sidebar-collapsed` 833-835（`width: 3em !important`）／`.sidebar-spaces, .sidebar-agents` 836-842（padding と border だけ）／見出し・フッタ 1071-1088（`flex: none`。`.sidebar-footer` は `margin-top: auto`）／`.sidebar-divider` 1130-1138（absolute・右端・幅 6px）。
- 幅のドラッグ: 変数 54-57、`onDividerPointerDown` 585-602（畳んでいる間は何もしない・350ms 以内の 2 回目の pointerdown で既定へ・`setPointerCapture`）、`onDividerPointerMove` 604-607、`endDrag` 614-618（pointerup／pointercancel／lostpointercapture）。Esc・キーボード・role・aria は無い。`watch(view.modalOpen)` 625-633 で `endDrag()`。
- 見出しの行（グループ・グループなし）と折りたたみ: `onToggleCollapse` 417-426、ボタン 696-708。行の D&D は 463-578（この作業では触らない）。
- エージェントの行 762-789（件数のボタン 774-786）。`agents` computed 322-338。状態のまとめ `aggregateStateOf` 123-126。
- `view.sidebarCollapsed` の出し分け: 637・648-649・653・660・691・712・715-717・730-731・735・739・755・764/767・796-801、CSS 833・863-870・1047-1050・1119-1121。

### G2 端末ごとの保存（`store/view.ts`）
- `PREFS_KEY` 55・`readPrefs` 65-74・`writePrefs` 100-109・`SIDEBAR_WIDTH` 168・`loadSidebarWidth` 174-177・ref 413-428・`setSidebarWidth` 687-689・`commitSidebarWidth` 692-694・return 736-737。
- 端末ごとの項目は `DEVICE_LOCAL_PREF_KEYS`（`protocol/src/messages.ts:658`。今は `sidebarWidth`・`sidebarCollapsed`・`fileLocality`）。ここに入れないとサーバへ送られて共有になる。サーバ側でも落とす（`server/src/persist/PrefsStore.ts:45-49`）。テスト: `view.test.ts:395-437`・`prefsApply.test.ts:45,79`・`protocol/src/messages.test.ts:146-147`。

### G3 `Splitter.vue`（130 行）
- props `splitId`・`tabId`・`ratio`・`dir`。`STEP = 0.02`・`SEND_INTERVAL_MS = 50`。`onPointerDown` 56-65・`onPointerMove` 67-73・`onPointerUp` 75-77（**pointercancel／lostpointercapture・ダブルクリック・Esc・ドラッグ中のクラスは無い**）・`onKeydown` 79-87（矢印 2 つだけ）。CSS 112-129（太さ `var(--soda-pane-gap, 4px)`。hover の規則なし）。
- `--soda-pane-gap` は `App.vue:62` が配る。`.pane-layout-side` は `overflow: hidden`（`PaneLayout.vue:260-266`）。
- テスト: `Splitter.test.ts`（8 件）、E2E `workspace-tab-pane.spec.ts:172-191`・`keys-mouse-dialogs.spec.ts:266, :330`（`Tab` の順に `role=separator`）、サイドバーの幅 `settings.spec.ts:46-57`。

### G4 端末版
- `tui/src/render/chrome/sidebar.ts`: 高さの計算 449-464、spaces の見出しの行 503-517（**見出しの行そのものの hit は無い**。「+」と並び順だけ）、区切りの行 531-545（hit `sectionDivider`。**agents が 0 件だと出ない**）、最下行「«」547-553。
- `tui/src/input/mouse.ts`: `Drag` の `{ kind: "section"; top }` 128（`startY`・`moved` を持たない）、押した時点 356-357、動かした・離した時点 635-637（どちらも `setSidebarSpacesRows`。**動かさずに離しても保存される**）。クリックとドラッグを分ける手本は `item`（330-339・643-650）。
- 手元の保存: `tui/src/local/tuiState.ts` 9-19・24-45、`model/PrefsModel.ts:170-174`、`app/TuiApp.ts:264, :411-413, :1030-1034`。

### G5 操作の足し方（手本: `show_subagents` を足した ccf58e6・ee49c39）
- `client-core/src/keys/actions.ts:47-96`・`bindings.ts`（`ACTIONS`）・`web/src/actions/ActionDispatcher.ts`（`toggleSidebar` :162）・`tui/src/actions/TuiDispatcher.ts`（:158）。
- 数を数えるテスト: `bindings.test.ts:41-51`（操作 58・群 7／24／27）、`keymap.test.ts:60-76, :383`（prefix の後のキー 46）、`TuiDispatcher.test.ts:191-205`、`web/src/components/KeySettings.test.ts:70, :77, :822, :846`（66 = 58 + 8）。
- 空いている既定のキー: 無修飾 `d f i m t u y`、shift つき `a b c e f i m o q u v y z`。

### G6 エージェントの状態
- `AgentState = "blocked" | "working" | "idle" | "unknown"`、`DisplayState` は `done` を足したもの（`protocol/src/model.ts:4-6`）。**入力待ちと承認待ちは、どちらも `blocked` の 1 つの値**。まとめる純関数 `aggregate`（`client-core/src/agent/agentState.ts:23`）、アイコン `web/src/components/StateIcon.vue`。
