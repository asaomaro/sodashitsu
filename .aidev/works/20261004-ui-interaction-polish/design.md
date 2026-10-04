# 仕様: 境目の見え方と、サイドバーの区画（サイズ変更・折りたたみ）

## 概要

3 種類の境目（サイドバーとビュー・pane の間・spaces と agents）に、同じ見た目と同じ操作の決まりを与える。見た目は 1 つの CSS のクラス（`.resize-handle`）、ドラッグとキーの決まりは 1 つの composable（`useResizeDrag`）にまとめ、3 か所がそれを使う。ブラウザ版のサイドバーは、区画ごとのスクロールに変え、区画の高さの比と折りたたみをこの機器に保存する。端末版は、区画の折りたたみを足す。

## 設計方針

- **見た目は CSS のクラス 1 つ、動きは composable 1 つ**。境目の要素そのものは 3 か所で違う（位置の決め方・値の意味・保存先が違う）ので、部品（コンポーネント）にはまとめない。
- **強調の線は、境目の要素の疑似要素で重ねる**（通常の細い線は今のまま残す）。当たり判定も疑似要素で広げる。境目の要素の大きさ（＝レイアウト）は変えない。
- **ドラッグ中の状態は、`<html>` のクラスで表す**（`soda-resizing` と向きのクラス）。カーソルの固定・文字の選択の禁止・ほかの要素の hover の抑止を、このクラスの CSS で行う。pointer capture は今までどおり使う。
- **区画の高さは CSS の flex で配り、JS は比を 1 つ持つだけ**。行の数を数えたり、px を計算して当てたりしない（ウィンドウの高さが変わっても、CSS が配り直す）。最小の高さも CSS（`min-height`）。
- **区画の比・折りたたみは、この機器の保存**（`sidebarWidth` と同じ仕組み。サーバへ送らない）。端末版は `tui-state.json`。
- **サイドバーを畳んだ状態では、今の構造に戻す**（nav 全体が 1 つのスクロール。区画の見出し・境目・折りたたみは効かない）。
- **代替案を退けた理由**: 境目を共通のコンポーネントにする → Splitter は比を 50ms ごとにサーバへ送り、サイドバーは離したときに localStorage へ書く、と保存の形が違い、props が膨らむ／区画の高さを px で保存する → ウィンドウの高さが変わるたびに計算し直す必要がある／ドラッグ中に画面全体を覆う要素を置く → pointer capture と二重になり、既存の E2E（`dragDivider`）の座標の扱いが変わる。

## 対象範囲

- `packages/web/src/styles/resizeHandle.css`（新規。`main.ts` から読む）、`packages/web/src/composables/useResizeDrag.ts`（新規）と単体テスト。
- `packages/web/src/components/Sidebar.vue`（幅の境目・区画の構造と CSS・区画の境目・見出しのボタン）、`Splitter.vue`、`packages/web/src/sidebar/sectionSizing.ts`（新規。純関数）、`packages/web/src/store/view.ts`（保存の項目 2 つ）、`packages/protocol/src/messages.ts`（`DEVICE_LOCAL_PREF_KEYS`）。
- `packages/client-core/src/keys/actions.ts`・`bindings.ts`、`web/src/actions/ActionDispatcher.ts`、`tui/src/actions/TuiDispatcher.ts`（操作 2 つ）。
- `packages/tui/src/render/chrome/sidebar.ts`・`input/mouse.ts`・`local/tuiState.ts`・`model/PrefsModel.ts`・`app/TuiApp.ts`（区画の折りたたみ）。
- テスト（単体・E2E `sidebar-sections.spec.ts`〔新規〕・`resize-handles.spec.ts`〔新規〕）、文書 4 点。
- 触らない: 行の D&D（`Sidebar.vue:463-578`）・タブ・pane の D&D、モバイルの画面、連携のグラフ。

## インターフェース / データ構造

### 保存の項目（この機器だけ）

```ts
// localStorage soda.prefs.v1（ブラウザ版）。どちらも DEVICE_LOCAL_PREF_KEYS に足す。
sidebarSectionRatio?: number;            // spaces の取り分（0〜1）。無い＝自動の配分
sidebarSectionsCollapsed?: { spaces?: true; agents?: true };  // 畳んでいる区画だけを持つ

// tui-state.json（端末版）
sidebarSectionsCollapsed?: { spaces?: true; agents?: true };
```

- 読むとき: `sidebarSectionRatio` は有限の数で 0 より大きく 1 より小さいものだけを採る（それ以外は「無い」）。`sidebarSectionsCollapsed` は、値が `true` のキーだけを採る。
- ストア（`view.ts`）: `sidebarSectionRatio: Ref<number | null>`・`sectionsCollapsed: Ref<{ spaces: boolean; agents: boolean }>`、`setSectionRatio(r)`（反映だけ）・`commitSectionRatio()`（保存）・`resetSectionRatio()`（null にして、保存から項目を消す）・`toggleSectionCollapsed(which)`（反映と保存）。

### 純関数（`sectionSizing.ts`）

```ts
interface SectionBox { total: number; minTop: number; minBottom: number }   // total: 2 区画に配れる高さ（px。境目を除く）。minTop／minBottom: spaces／agents の最小（見出し＋2 行分。spaces はフッタを足す）
/** 比を、どちらの区画も min を割らない範囲に収める。total < minTop + minBottom なら 0.5。 */
function clampRatio(ratio: number, box: SectionBox): number;  // SectionBox = { total, minTop, minBottom }
/** 区画の入れ物の上端からのポインタの位置（px）→ 比。 */
function ratioFromOffset(offsetPx: number, box: SectionBox): number;
/** キーで 1 段（stepPx）動かす。 */
function stepRatio(ratio: number, deltaPx: number, box: SectionBox): number;
/** 読み上げ用の値（spaces の取り分の百分率。整数）。 */
function ratioPercent(ratio: number): number;
```

### composable（`useResizeDrag.ts`）

```ts
interface ResizeDragOptions<T> {
  axis: "x" | "y";
  /** ドラッグを始められるか（畳んでいる間は false、など）。 */
  enabled?: () => boolean;
  /** 始めた時点の値を返す（Esc で戻すため）。 */
  begin(ev: PointerEvent): T;
  /** ポインタの位置から値を反映する（1 回の描画につき 1 回にまとめて呼ばれる）。 */
  move(ev: PointerEvent, start: T): void;
  /** 確定（離した・ダイアログが開いた）。 */
  commit(start: T): void;
  /** 取り消し（Esc）。start へ戻す。 */
  cancel(start: T): void;
  /** ダブルクリック（350ms 以内の 2 回目の pointerdown）。 */
  reset(): void;
}
function useResizeDrag<T>(o: ResizeDragOptions<T>): {
  dragging: Ref<boolean>;
  onPointerDown(ev: PointerEvent): void;   // 左ボタンだけ。preventDefault でフォーカスを移さない
  onPointerMove(ev: PointerEvent): void;
  onPointerEnd(ev: PointerEvent): void;    // pointerup / pointercancel / lostpointercapture
  finish(): void;                          // 外から確定させる（ダイアログが開いたとき）
};
```

- ドラッグ中は `document.documentElement` に `soda-resizing` と `soda-resizing-x`／`-y` を付け、window の `keydown`（capture）で `Esc` を受けて `cancel`（`preventDefault`・`stopPropagation`。ほかのキーは、ドラッグ中は端末へ通さない——`preventDefault` と `stopPropagation` の**両方**。`stopPropagation` だけでは、keypress と、フォーカスのある textarea への入力〔`input`〕が止まらず、xterm が文字を送る。実測で確かめた）。終わったら外す。
- `move` は `requestAnimationFrame` で 1 回にまとめる（最後のイベントだけを使う）。確定・取り消しの前に、ためた分を捨てる（取り消し）か、反映する（確定）。
- 350ms 以内の 2 回目の pointerdown は `reset()` を呼び、ドラッグを始めない。
- 動かさずに離した・ダブルクリックの 1 回目では、`commit` は何もしない（始めた値と同じなら呼ばない。自動の配分〔比 null〕を比に変えない・null を書かない）。
- `pointerdown` の `preventDefault()` は、フォーカスを移さないために使う。互換のマウスイベント（mousedown・mouseup）が出なくなるが、境目の上にそれに頼る処理は無い（実測で、pointer capture と後続の pointermove・pointerup は届くことを確かめた）。

### 操作

| id | 表示名 | 群 | 既定のキー | Action |
|---|---|---|---|---|
| `toggle_spaces_section` | サイドバーの spaces を折りたたむ／開く | `"pane"`（`toggle_sidebar` と同じ群の名前。`bindings.ts:398-403`） | `prefix+shift+b` | `{ type: "toggleSidebarSection", section: "spaces" }` |
| `toggle_agents_section` | サイドバーの agents を折りたたむ／開く | `"pane"` | `prefix+shift+a` | `{ type: "toggleSidebarSection", section: "agents" }` |

`prefix+b` がサイドバー全体の開閉なので、その shift を spaces に、agents は頭文字にした（どちらも空いている。research.md「G5」）。

## 振る舞いの詳細

### 境目の見た目（`.resize-handle`）

- 境目の要素に `class="resize-handle resize-handle-x|y"` を付ける。`position: relative`（サイドバーの幅の境目は今の absolute のまま）・`z-index` を持ち、隣の要素の上に疑似要素を出せるようにする。
- `::before`＝当たり判定: 境目の中心から両側へ、合計 8px 以上になるように広げる（`inset` を負の値で。太さ 2px の pane の境目でも 8px）。透明。
- `::after`＝強調の線: 境目の中心に、太さ 3px・`background: var(--soda-accent)`・`opacity: 0`。`pointer-events: none`。
- 出る条件: `:hover`（`transition: opacity 0.12s ease 0.15s`——0.15 秒の待ちは `transition-delay` で作る）、`:focus-visible`、ドラッグ中（`.resize-handle-active`。待ちなし）。消えるときは待ちなし・0.12 秒。
- `@media (prefers-reduced-motion: reduce)`: `.resize-handle::after, .resize-handle:hover::after, .resize-handle:focus-visible::after, .resize-handle.resize-handle-active::after { transition-duration: 0s }`（`transition-delay` の 0.15 秒は残す。requirements F24。詳細度の高い規則も覆う。実測で、全部の状態を並べた規則で duration 0s・delay 0.15s になることを確かめた）。
- ドラッグ中（`html.soda-resizing`）: `html.soda-resizing-x, html.soda-resizing-x * { cursor: col-resize !important }`（y は `row-resize`）、`html.soda-resizing * { user-select: none !important }`、`html.soda-resizing .resize-handle:not(.resize-handle-active)::after { opacity: 0 }`。行・ボタンの hover は、pointer capture で境目が受け続けるので出ない（E2E で確かめる。出る要素があれば、`html.soda-resizing` の下で `pointer-events: none` を当てる）。
- `:focus-visible` の outline は出さない（線が印になる）。Splitter の今の `:focus-visible` の背景と outline は、線に置き換える。
- 色: CSS 変数 `--soda-resize-line`。テーマは 17 ある（`protocol/src/theme.ts`）。`--soda-accent` は、dracula（既定。menu-bg に対して 2.94）・tokyo-night-day・solarized-light・rose-pine-dawn で、背景とのコントラストが 3:1 を割る（実測）。そこで `uiTokens()` が、**`--soda-accent` が `--soda-bg` と `--soda-menu-bg` の両方に 3:1 以上ならそれ、そうでなければ `--soda-fg`**（`--soda-fg` の方が両方に対して高ければ。両方を満たすものが無いときは、より高い方）を `--soda-resize-line` として返す。`client-core/src/theme/uiTokens.ts` に足し、`ThemeController` の `CSS_VARS` に 1 行足す。単体テスト `uiTokens.test.ts`: 17 のテーマすべてで、`--soda-resize-line` が `--soda-bg`・`--soda-menu-bg` に 3:1 以上。選び方（accent か fg か）がテーマごとに期待どおり。`.resize-handle::after` の `background` はこの変数。

### サイドバーの幅の境目

- `.sidebar-divider` に `role="separator"`・`aria-orientation="vertical"`・`aria-label="サイドバーの幅"`・`aria-valuenow`（px）・`aria-valuemin`／`max`（160／360）・`tabindex="0"`。サイドバーを畳んでいる間は `tabindex="-1"`・`aria-hidden="true"`（今までどおり動かせない）。
- ドラッグは `useResizeDrag`（`begin`＝今の幅、`move`＝`view.setSidebarWidth`、`commit`＝`view.commitSidebarWidth`、`cancel`＝始めた幅へ戻して保存しない、`reset`＝既定の幅にして保存）。今の `onDividerPointerDown`／`Move`／`endDrag` と `lastDividerClick` を置き換える。`watch(view.modalOpen)` は `finish()` を呼ぶ。
- キー（境目にフォーカスがあるとき）: `←`／`→` で 16px、`Home`＝160、`End`＝360、`Enter`＝240。押すたびに保存する。ほかのキーは今までどおり（端末へは行かない——フォーカスが境目にあるため）。
- 位置: nav の右の罫線（`border-right`）の上に中心を置く: `right: -4px`・幅 8px（`::before` は使わず、要素そのものが当たり判定の 8px）。nav は開いているとき `overflow: visible`（区画のスクロールは `.sidebar-sections` が `overflow: hidden`・body が `overflow-y: auto` で受ける）にして、外側へはみ出した分が切られないようにする。`z-index: 3`（ビューの pane より上）。畳んだ状態は境目を使えないので、今のまま。実測で、nav が `overflow: hidden` だと外側の当たり判定が 0px になることを確かめた。

### pane の間の境目（`Splitter.vue`）

- `class` に `resize-handle resize-handle-x|y` を足す。太さ（レイアウト）は今のまま `--soda-pane-gap`。当たり判定は `::before` が 8px に広げる（`.pane-layout-side` の `overflow: hidden` は隣の要素の中だけなので、Splitter の疑似要素は切られない）。**`.pane-layout-side` に `isolation: isolate` を足し**、Splitter は `z-index: 1`（xterm のスクロールバーは `z-index: 11` で、同じ重なりの文脈にあると、境目の中心から 3px の所をスクロールバーが奪う。実測で、isolate を付けると両側 3px とも境目になることを確かめた）。
- ドラッグは `useResizeDrag`（`begin`＝今の比、`move`＝今の計算、`commit`＝何もしない〔送信は今までどおり 50ms ごと〕、`cancel`＝始めた比を送る、`reset`＝0.5 を送る。**`cancel`・`reset` のときは、ためていた送信のタイマー（`scheduleSend` の 50ms）と `pendingRatio` を捨ててから送る**——捨てないと、取り消しの後にドラッグ中の比で上書きされる）。`pointercancel`・`lostpointercapture` でも終わる。
- キーは今のまま（矢印で 2%）。`Enter`・`Home`／`End` は足さない（requirements F4）。

### 区画の構造（ブラウザ版）

```
<nav class="sidebar">                         ← 開いているとき overflow: hidden・縦の flex
  .sidebar-session                            ← flex: none
  .sidebar-sections                           ← flex: 1 1 0; min-height: 0; 縦の flex（区画に配れる高さ）
    <section class="sidebar-spaces">          ← 縦の flex
      .sidebar-section-header                 ← flex: none（見出しのボタン＋並び順）
      .sidebar-section-body                   ← flex: 1 1 auto; min-height: 0; overflow-y: auto（行の一覧）
      .sidebar-section-footer                 ← flex: none（＋ 新規・メニュー）
    <div class="sidebar-section-divider resize-handle resize-handle-y" role="separator">  ← 両方開いているときだけ
    <section class="sidebar-agents">          ← 縦の flex
      .sidebar-section-header
      .sidebar-section-body                   ← overflow-y: auto
  .sidebar-footer                             ← flex: none（畳むボタン）
  .sidebar-divider                            ← 幅の境目（absolute）
</nav>
```

- 配り方（`.sidebar-sections` の中。`--section-min` は見出し＋2 行分＝ `calc(1.9em + 2 * 1.6em)` 程度。実測して決め、定数にする）:
  - **自動（比が無い）**: spaces `flex: 0 1 auto`、agents `flex: 1 1 0`、どちらも `min-height: var(--section-min)`。spaces は中身の高さ、多ければ agents の最小を残して縮む。
  - **比あり**: spaces `flex: <r> 1 0`、agents `flex: <1 − r> 1 0`、`min-height` は同じ。CSS が、ウィンドウの高さに合わせて比で配り、最小を優先する。
  - **片方を畳んでいる**: 畳んだ区画は `flex: none` **と `min-height: 0`**（見出しだけ。body と footer は `display: none`。`min-height` を 0 にしないと最小のまま残る——実測）、もう片方は `flex: 1 1 0`。境目は描かない。
  - **両方を畳んでいる**: どちらも `flex: none`・`min-height: 0`。`.sidebar-sections` の残りは空く。
  - **区画の `min-height`**: spaces は `--section-min`（見出し＋2 行分）**＋フッタの高さ**（フッタは `flex: none` で、足さないと body が 2 行分に足りない——実測で 21px）、agents は `--section-min`。
  - **padding**: 区画の上下 padding（0.5em）は section ではなく body に付ける（section に付けると、比あり `flex: r 1 0` が padding を除いた残りを配り、高さの比がずれる——実測）。比は、`.sidebar-sections` の高さから境目の 1px を引いた値に対して取る。
- spaces の中身が少なくて自動の配分のとき、agents が残りを全部使う（今は agents の下が空いて、畳むボタンが下に貼り付く。見え方は同じ）。
- **サイドバーを畳んだ状態**（`.sidebar-collapsed`）: `.sidebar` は `overflow-y: auto` に戻し、`.sidebar-sections` と区画は `display: block`・`flex: none`・`min-height: 0`、body は `overflow: visible`、body・footer の `display: none` は当てない（区画の折りたたみを無視して全部出す）。区画の境目は描かない。

### 区画の境目

- `role="separator"`・`aria-orientation="horizontal"`・`aria-label="spaces と agents の境目"`・`aria-valuenow`（`ratioPercent`。自動のときは、実際の高さから計算した値）・`aria-valuemin="0"`・`aria-valuemax="100"`・`tabindex="0"`。高さ 1px（今の `border-top` の代わり。agents の `border-top` は外す）。
- ドラッグは `useResizeDrag`（`begin`＝今の比〔null を含む〕、`move`＝`.sidebar-sections` の rect とポインタから `ratioFromOffset` → `view.setSectionRatio`、`commit`＝`view.commitSectionRatio`、`cancel`＝始めた比へ戻す、`reset`＝`view.resetSectionRatio`）。`box.total` は `.sidebar-sections` の `clientHeight − 1`（境目）、`box.min` は区画ごとの最小（spaces は見出し＋行×2＋フッタ、agents は見出し＋行×2 の実測。`clampRatio` は `{ total, minTop, minBottom }` を受ける形にする）。`aria-valuenow` は、比があるときは比から、自動のときは spaces の実際の高さから計算し、`.sidebar-sections` の `ResizeObserver` と、spaces の body の中身が変わったとき（行の数）に測り直す。
- キー: `↑`／`↓` で 24px、`Home`／`End` で最小・最大、`Enter` で自動。押すたびに保存。

### 区画の見出し

- 見出しの題を `<button class="sidebar-section-toggle" :aria-expanded :aria-controls>` にする: 印（▾／▸）・題（spaces／agents）。畳んでいるときは、続けて件数と、agents では状態のアイコン。
  - 件数: spaces は、選んでいるマシンの workspace の数。agents は、一覧に出るエージェントの数（`agents` computed の長さ）。
  - 状態のアイコン（agents だけ）: 一覧のエージェントの状態に `blocked` が 1 つ以上あれば `<StateIcon state="blocked">`（入力待ち・承認待ちは、どちらも `blocked`。research.md「G6」）。無ければ出さない。
- クリック・`Enter`／`Space` で `view.toggleSectionCollapsed`。並び順のボタンは兄弟の要素で、今のまま（互いのクリックは伝わらない）。畳んでいる間は、並び順のボタンを出さない（中身が見えないため）。
- 畳むとき、フォーカスがその区画の body・footer の中にあれば、見出しのボタンへ移す。
- 見出しは、サイドバーを畳んだ状態では出ない（今のまま `v-if`）。
- **ダイアログ（サブエージェントの一覧）を閉じたときのフォーカスの戻り先**（`data-agent-pane` の行）が、agents を畳んでいて `display: none` のときは、agents の見出しのボタンにする。
- **navigate モード**（行の選択）に入るとき、spaces を畳んでいたら開く（今、畳んだマシンのまとまりを開く `Sidebar.vue:45-50` と同じ。状態は保存される）。agents は navigate の対象外。
- 操作 `toggleSidebarSection` は `view.toggleSectionCollapsed(section)` を呼ぶ（サイドバーを畳んでいる間も状態は変わるが、見た目には出ない）。フォーカスは動かさない。

### 端末版

- 保存: `tui-state.json` の `sidebarSectionsCollapsed`。`PrefsModel` に getter。`TuiApp.setLocalState` で書く。
- 見出しの行: spaces の見出しを `▾ Spaces`／`▸ Spaces <数>`、区切りの行を `─ ▾ Agents ─…`／`─ ▸ Agents <数> <状態> ─…` にする（状態は `blocked` があるときの字形。`stateGlyph`）。**agents が 0 件のときは、今までどおり区切りの行を出さない**（spaces が全部の高さを使う。畳む対象が無い）。spaces を畳んでいて agents が 0 件なら、見出しの 1 行だけが出る。畳んでいる区画の見出し・区切りの行には、並び順のラベルは出さない（web と同じ）。見出しを広げると、狭いサイドバーで「+」や並び順が入らなくなる（`sidebar.ts:507-512` の `inner >= 10` の条件）ので、その幅では印と題だけにする。
- 高さの計算（`bodyH`・見出し 1 行・区切り 1 行は今のまま）:
  - 両方開いている: 今のまま（agents が 0 件のときも今のまま）。
  - spaces を畳んでいる: `spacesH = 0`、`agentsH = max(0, bodyH − 2)`。
  - agents を畳んでいる: `agentsH = 0`、`spacesH = max(0, bodyH − 2)`。区切りの行は spaces のすぐ下ではなく、**いちばん下（「«」の上）**に置く。
  - 両方: `spacesH = agentsH = 0`。区切りの行は見出しのすぐ下。
  - navigate に入ったとき、spaces を畳んでいたら開く（web と同じ）。
- hit: spaces の見出しの行に `{ kind: "sectionHeader", section: "spaces" }`（「+」と並び順の桁を除く残り）。区切りの行は `sectionDivider` のまま。
- マウス: 見出しの行のクリック → spaces の切り替え。区切りの行は、`Drag` に `startY`・`moved` を足し、**動かしたときだけ**高さを変える（今は動かさずに離しても保存される——それをやめる）。動かさずに離したら agents の切り替え。どちらかを畳んでいる間は、動かしても高さを変えない。
- 操作 `toggleSidebarSection` は `TuiDispatcher` から host の `toggleSidebarSection(section)` を呼ぶ。

### 既存のテストへの影響

- `keys-mouse-dialogs.spec.ts:266, :330`（`Tab` の順の `role=separator`）: サイドバーの幅の境目と区画の境目が `Tab` の順に入る。期待を直す。
- `settings.spec.ts:46-57`（`dragDivider`）: 動きは同じ。ダブルクリックは pointerdown 2 回のまま。
- `Sidebar.test.ts` の golden（`__golden__/sidebar-default-*.html`）: 構造が変わるので更新する（差分が、区画の入れ物・見出しのボタン・境目だけであることを確かめる）。
- 操作の数: 58 → 60、群は pane 27 → 29（全体 7・workspace / tab 24 は変わらない）、prefix の後のキー 46 → 48、`KeySettings` の 66 → 68（research.md「G5」）。
- `tui/src/render/Renderer.test.ts:111-123`（当たりの並びに `sectionHeader` が入る）と `mouse.test.ts:417-423`（区切りのドラッグ。動かしてから離すので、「動かしたときだけ高さを変える」と衝突しない）。E2E は `keys-mouse-dialogs.spec.ts`・`settings.spec.ts`。

## エラー処理 / 異常系

- 保存の値が壊れている（比が範囲外・折りたたみが真偽でない）→ 無いものとして扱う（自動の配分・開いた状態）。
- `.sidebar-sections` の高さが、2 区画の最小の合計より小さい（ウィンドウが低い）→ CSS が両方を最小まで縮め、はみ出した分は `.sidebar-sections` が切る（`overflow: hidden`）。比の計算は `clampRatio` が 0.5 を返す。境目のドラッグは何も変えない。
- ドラッグ中に境目の要素が消える・割り込まれる（ドラッグ中はキーを全部止めるので、キーでの畳む操作は来ない。起きうるのは、`sodactl ask` などのダイアログ〔`view.modalOpen`〕と、unmount）→ `modalOpen` の watch か `lostpointercapture`・unmount で `finish()`。`<html>` のクラスと window のリスナーを必ず外す（`onBeforeUnmount` でも）。
- `requestAnimationFrame` の前に確定・取り消しが来た → ためた移動は、確定なら反映してから確定、取り消しなら捨てる。
- 端末版で、画面が低くて `bodyH < 3` → 今の計算の `max(0, …)` のまま（区切りの行が描けないときは描かない）。

## テストの方針

- **単体（純関数）** `sectionSizing.test.ts`: `clampRatio`（範囲内・下限・上限・`total < 2*min`）、`ratioFromOffset`、`stepRatio`（端で止まる）、`ratioPercent`。
- **単体（composable）** `useResizeDrag.test.ts`: 左ボタン以外は始めない／`enabled` が false なら始めない／続けて届いた move が 1 回の描画で 1 回にまとまる（AC21）／離して `commit`／`Esc` で `cancel`（`commit` は呼ばれない）／350ms 以内の 2 回目で `reset`／`pointercancel`・`lostpointercapture` で終わる／`<html>` のクラスとリスナーが外れる／`finish()`。
- **単体（色）**: 17 のテーマすべてで `--soda-resize-line` と背景（`--soda-bg`・`--soda-menu-bg`）のコントラスト ≥ 3（AC21。`uiTokens.test.ts`）。
- **単体（ストア）** `view.test.ts`: 2 つの項目の読み込み（壊れた値）・保存・`resetSectionRatio` で項目が消える・サーバへ送られない（`messages.test.ts` の `DEVICE_LOCAL_PREF_KEYS`）。
- **単体（部品）** `Sidebar.test.ts`・`Splitter.test.ts`: role／aria／tabindex、キー、見出しのボタン（`aria-expanded`・件数・状態のアイコン）、畳んだときの DOM、サイドバーを畳んだ状態、並び順のボタンと混ざらない、Splitter のダブルクリック・Esc。
- **単体（端末版）** `sidebar.test.ts`・`mouse.test.ts`・`PrefsModel.test.ts`: 4 通りの高さ、見出しの文字、hit、クリックとドラッグの区別、保存。
- **E2E** `resize-handles.spec.ts`（AC1・AC2・AC3・AC14・AC17・AC-I2・AC-I4・AC-I5 の境目の分）と `sidebar-sections.spec.ts`（AC9〜AC12・AC20・AC-I1・AC-I3・AC-I4、操作のキー）。観測は画面（計算後のスタイル・`boundingBox`・`aria-*`・`activeElement`）。hover の線は、`page.mouse.move` の後に `::after` の `opacity` を `getComputedStyle(el, "::after")` で待つ。動きを減らす設定は `page.emulateMedia({ reducedMotion: "reduce" })` で `transition-duration` を見る。端末版（AC13）は単体と、`docs/verification.md` の実機の手順。
- **実機のみ**（`docs/verification.md`）: 17 のテーマでの線の見え方・タッチでの境目のサイズ変更・OS の「動きを減らす」。

## 受け入れ基準との対応

- AC1: `.resize-handle` の `::after`（3 か所で同じクラス）。入力は hover。
- AC2: `useResizeDrag` の `resize-handle-active` と `html.soda-resizing`。pointer capture。
- AC3: サイドバーの幅の境目の role／aria／tabindex とキー。
- AC9: 区画の構造（body がスクロールし、見出し・フッタは `flex: none`）。
- AC10: 区画の境目（`useResizeDrag`・`sectionSizing`）と `sidebarSectionRatio` の保存。最小は CSS の `min-height` と `clampRatio`。
- AC11: 見出しのボタンと `sidebarSectionsCollapsed`。配り方の表の「片方」「両方」。
- AC12: 畳んだ見出しの件数と `StateIcon`（`blocked`）。
- AC13: 端末版の見出し・区切りの行・`Drag` の `moved`・`tui-state.json`、操作 `toggleSidebarSection`。
- AC14: `prefers-reduced-motion` の規則。
- AC15: 行の D&D・並び順・サイドバーを畳む動きには触らない。畳んだ状態の CSS。保存済みの `sidebarWidth` はそのまま読む。
- AC16: 文書 4 点。
- AC17: `::before` の当たり判定（8px）、Splitter の `reset`（0.5）、区画の境目の `reset`（`resetSectionRatio`）。
- AC20: 自動の配分（spaces `flex: 0 1 auto`・agents `flex: 1 1 0`・`min-height`）。
- AC21: 色の単体テスト、`useResizeDrag` の rAF のまとめ。
- AC-I1: 見出しの `<button aria-expanded>`。
- AC-I2: `useResizeDrag` の `commit`／`cancel`。
- AC-I3: 境目のキーと、見出しのボタン・操作のキー。
- AC-I4: `onPointerDown` の `preventDefault`（フォーカスを移さない）。畳むときのフォーカスの移動。
- AC-I5: ドラッグ中の window の keydown（capture・`stopPropagation`）。`modalOpen` で `finish()`。見出しのボタンと並び順のボタンは兄弟。

## 依拠する既存の事実

research.md「追記」G1〜G6（PR #81 の後の構造）。未確認: `onPointerDown` で `preventDefault` したとき、pointer capture と後続の `pointermove` が今までどおり届くこと（Chromium。E2E で確かめる）／`transition-delay` だけを残した `prefers-reduced-motion` の規則の計算後の値／17 のテーマの `--soda-accent` のコントラスト（T の最初で計算する）。
