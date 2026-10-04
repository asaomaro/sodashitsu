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
