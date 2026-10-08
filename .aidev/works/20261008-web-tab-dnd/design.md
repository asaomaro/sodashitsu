# 仕様: ブラウザ版の tab のドラッグでの並べ替えと、pane の移動を同じ worktree の中に制限する

この文書は 2 つの部に分かれる。**第 1 部（tab の D&D）**は下の「確かめたこと」から「受け入れ基準との対応」の AC-I5 まで。**第 2 部（pane の移動の制限）**は末尾の「第 2 部」。PR も同じ分け方にする。

## 確かめたこと（research の代わり）

- **端末版のドラッグは、`tab.move` の繰り返し**。離した位置の tab の番号（`to`）と、つかんだ tab の番号（`from`）の差の数だけ、`tab.move {tabId, direction}` を待たずに続けて送る（`packages/tui/src/input/mouse.ts:759` `dropTab`）。押した時点でその tab へ切り替える（同 `:399` の直前の `actions.switchToTab`）。
- **`tab.move` は隣へ 1 つ動かす RPC で、端では反対の端へ回る**（`packages/protocol/src/messages.ts` `TabMoveParams`、`packages/server/src/session/SessionModel.ts:481` `moveTab`）。動いたら `workspace.updated` を配る（`packages/server/src/session/SessionService.ts:681`）。1 回で目的の位置へ動かす tab の RPC は無い（workspace には `workspace.move_to`・`item.move` がある）。
- **ブラウザ版の tab バーにはドラッグの処理が無い**（`packages/web/src/components/TabBar.vue`。tab は `<button role="tab" data-tab-id>` で、`@click` と `@contextmenu` だけ）。tab に閉じるボタンは無く、ダブルクリックの操作も無い（名前の変更・閉じるは右クリックのメニュー。`ContextMenu.vue` の `target.kind === "tab"`）。
- **pane の名前のドラッグは、pane の名前の要素がポインタを捕捉して進み、落とし先を `document.elementFromPoint` の `[data-tab-id]` で探す**（`packages/web/src/components/PaneFrame.vue:169` `dropTargetAt`、`:184` `onNamePointerDown`）。tab のボタンには、そのときポインタのイベントは届かない。tab の強調は `view.paneDrag.overTabId`（`TabBar.vue` の `tab-bar-item-drop-target`）。
- **モバイルの 1 列の画面は tab バーを持たない**（`packages/web/src/App.vue:64` で `MobileShell` と `TabBar` は排他。`MobileShell.vue` は「workspace / tab」の題のボタンからピッカーを開く）。
- **前の作業の要件**: `.aidev/works/20261004-ui-interaction-polish/split-dnd.md` の F9（入る位置の線）・F12（端 24px で自動スクロール）・F13（結果は `move_tab_previous/next` の繰り返しと同じ）・AC8。

## 設計方針

- **RPC は既存の `tab.move` だけ**（decisions D2）。離した時点の tab の順から「何回・どちら向きに動かすか」を求め、その数だけ待たずに送る（端末版と同じ）。先に画面の順を書き換えない（`workspace.updated` が戻って順が変わる。キーの `moveTab` と同じ。`packages/web/src/actions/ActionDispatcher.ts:1317`）。
- **tab のドラッグの状態は `TabBar.vue` の中だけで持つ**（`view` ストアに足さない）。使うのは tab バーだけで、pane のドラッグの状態 `view.paneDrag` と別の入れ物にすることで、取り違えを作りから防ぐ（AC7）。`PaneFrame.vue`・`view.ts`・`Sidebar.vue` は触らない。
- **入る位置は、tab の矩形とポインタの x から計算する**（`elementFromPoint` を使わない）。tab と tab の境目・あふれて隠れた tab・「＋」や右端の帯の上でも同じ式で決まり、単体テストで確かめられる。計算は純関数に切り出す（`paneDragZone.ts` と同じ慣習）。
- **ポインタの扱いは、pane の名前・workspace の行のドラッグと同じ形**（`pointerdown` で押した位置を覚えて捕捉 → 6px で開始 → `pointerup` の実際の座標で確定。捕捉が外れたら取り消し。`Sidebar.vue:519` `onRowPointerDown`・`:854` の `@lostpointercapture`、`PaneFrame.vue:367`）。違いは 2 つ: キーを全部止める（D7）、ドラッグの後の `click` を捨てる（tab は `@click` で切り替えるため。下の「クリックの抑止」）。
- 退けた案: HTML5 の drag and drop（`draggable`）。既存の 2 つのドラッグがポインタのイベントで作られていて、見た目・取り消し・閾値をそろえられない。

## 対象範囲

- `packages/web/src/layout/tabReorder.ts`（新規。純関数）と `tabReorder.test.ts`（新規）
- `packages/web/src/components/TabBar.vue`（ドラッグの処理・見た目）と `TabBar.test.ts`（追加）
- `packages/e2e/src/specs/tab-dnd.spec.ts`（新規）
- `docs/tui-parity.md`・`docs/herdr-parity.md`・`docs/verification.md`
- 触らない: サーバ・protocol・client-core・端末版・`PaneFrame.vue`・`Sidebar.vue`・`view.ts`・`ActionDispatcher.ts`

## 依拠する既存の事実

- tab バーの構造: 根 `.tab-bar`（`v-if="tabs.length !== 1"`）の中に、横スクロールする `.tab-bar-tabs`（`overflow-x: auto`）・「＋」`.tab-bar-new`・右端の帯 `.tab-bar-right`。位置の「下」は `order: 1` とクラス `tab-bar-bottom` だけで、中の並びは同じ（`TabBar.vue` のテンプレートと `<style>`）。
- tab の切り替え: `selectTab(tabId)` が `view.setView`・`view.focusPane(tab.focusedPaneId)`・`tab.focus` を行う（`TabBar.vue` `selectTab`）。端末へのフォーカスは、`TerminalPane.vue` が作られたとき（`:50`）と `view.focusedPaneId` が変わったとき（`:67`）に自分で取る。**選ばれている tab をもう一度選んだときは、どちらも起きない**ので、フォーカスは押したボタンに残る。端末へ移すには `registry.focus(paneId)`（`packages/web/src/term/TerminalRegistry.ts:180`。`TabBar.vue` は `TerminalRegistryKey` をすでに inject している）。
- tab の順の反映: `workspace.updated` → `session.workspaceUpserted`（`packages/web/src/store/StoreAdapter.ts:124`）→ `TabBar.vue` の `tabs`（`ws.tabIds` の順）。
- 閾値 6px: `PaneFrame.vue` `DRAG_THRESHOLD_PX`、`Sidebar.vue:464` `WORKSPACE_DRAG_THRESHOLD_PX`。
- ダイアログが開いたらドラッグを取り消す先例: `PaneFrame.vue` の `watch(() => view?.modalOpen === true, …)`。`view.modalOpen` はダイアログ・グラフ画面・質問のフォームのどれかが開いているとき true（`packages/web/src/store/view.ts:382`）。
- ドラッグ中のキーを止める先例: `packages/web/src/composables/useResizeDrag.ts` の `onKeydown`（capture。`preventDefault` と `stopPropagation`。`stopPropagation` だけでは xterm が文字を送る、と実測済み）。キーの入口は `packages/web/src/main.ts:484` の window の keydown（bubble）。
- 線の色: `--soda-resize-line`（`packages/web/src/App.vue:144`。テーマごとに 3:1 を満たす色を選ぶ変数。`PaneFrame.vue:550`・`styles/resizeHandle.css:38` が使う）。
- **未確認**: ポインタを捕捉した要素の上で `pointerup` した後、ブラウザが `click` をその要素へ送るか（Chromium は送る、という理解。Firefox・Safari は確かめていない）。送っても送らなくても正しく動く作りにする（下の「クリックの抑止」）。E2E（Chromium）で、ドラッグの後に切り替えが二重に起きないことを確かめる。
- **未確認**: ほかの画面の並べ替えで、Vue がつかんだ tab のボタンの DOM を動かしたとき（keyed の並べ替えは取り外しと挿入になりうる）に、ポインタの捕捉が保たれるか。外れたら `lostpointercapture` で取り消す（下の「確定 / 取り消し」）。保たれればドラッグは続く。どちらでも残り物が無い。E2E（T4 の (9)）で、Chromium での実際を記録する。
- **未確認**: 捕捉している要素が DOM から消えたとき（tab バーの自動非表示）の、その後の `pointerup` の届き先。届かなくても残り物が無いよう、消える前（`watch`）に片付ける。

## インターフェース / データ構造

`packages/web/src/layout/tabReorder.ts`（新規。DOM に触らない純関数と定数）:

```ts
export const TAB_DRAG_THRESHOLD_PX = 6;
export const TAB_EDGE_SCROLL_PX = 24;   // 列の端からこの幅で自動スクロール
export const TAB_EDGE_SCROLL_STEP = 8;  // 1 フレームに動かす px

export interface TabRect { id: string; left: number; right: number }

/** 入る位置（スロット）。0〜n。i は「i 番目の tab の前」、n は「末尾の後」。x が tab の中央より左ならその tab の前。 */
export function slotAt(tabs: readonly TabRect[], x: number): number;

/** スロットへ入れるための手順。順が変わらない（slot が from か from+1）・draggedId が無い・slot が範囲外なら null。 */
export function reorderSteps(
  ids: readonly string[], draggedId: string, slot: number,
): { direction: "previous" | "next"; count: number; toIndex: number } | null;

/** 列の端に近いときのスクロール量（-STEP・0・+STEP）。x が row.left+EDGE より左なら負、row.right-EDGE より右なら正。 */
export function edgeScrollDelta(row: { left: number; right: number }, x: number): number;
```

- `slotAt`: 先頭から見て、`x < (left + right) / 2` になる最初の tab の番号。無ければ `tabs.length`。空なら 0。
- `reorderSteps`: `from = ids.indexOf(draggedId)`。`toIndex = slot > from ? slot - 1 : slot`（つかんだ tab を抜いた後の番号）。`count = |toIndex - from|`、`direction = toIndex > from ? "next" : "previous"`。`count` は必ず 1 以上・`ids.length - 1` 以下で、**端を越えて回る送り方にはならない**（`from + count` も `from - count` も範囲の中）。

`TabBar.vue` の中の状態（コンポーネントの中だけ）:

```ts
let press: { tabId: string; x: number; y: number; pointerId: number } | null = null; // 押している（ドラッグ前を含む）
const tabDrag = ref<{ tabId: string; slot: number | null } | null>(null);            // 閾値を超えた後。slot は線の位置（無ければ null）
let suppressClick = false;                                                           // ドラッグの後の click を 1 回捨てる
let suppressTimer: ReturnType<typeof setTimeout> | undefined;                        // 旗を下ろす予約
let lastPoint = { x: 0, y: 0 };                                                      // 自動スクロールが使う最後の座標
```

DOM のクラス（E2E・単体テストが見る）:

- `.tab-bar-dragging`: 根。ドラッグ中だけ。
- `.tab-bar-item-dragging`: つかんだ tab。ドラッグ中だけ。
- `.tab-bar-item-insert-before`: スロット i（i < n）のとき、i 番目の tab。`.tab-bar-item-insert-after`: スロット n のとき、最後の tab。どちらも同時に高々 1 つ。

## 振る舞いの詳細

**開始**（AC-I1・AC9）
- tab のボタンの `pointerdown`: **最初に**（ボタン・タッチの判定より前に）`suppressClick = false` と `clearTimeout(suppressTimer)`。`ev.button !== 0` または `ev.pointerType === "touch"` ならそこで終わり。そうでなければ `press` を覚え、`setPointerCapture?.(ev.pointerId)`（先例と同じく `?.` 付き。jsdom に無い）。`preventDefault` はしない（ボタンのフォーカスと `click` は今までどおり）。
- `pointermove`: `press` が無い・`pointerId` が違うなら無視。`tabDrag` がまだ無く、動いた距離が 6px 未満なら無視。6px 以上で開始: `tabDrag = { tabId, slot: null }`、`suppressClick = true`、window の keydown を capture で付ける、自動スクロールの繰り返しを始める。その後（開始した回も含め）`lastPoint` を覚えて、線の位置を計算し直す。
- 「＋」・右端の帯・tab の列の余白（スクロールバー）には `pointerdown` を付けない。

**線の位置の計算**（AC2）: `currentSlot(x, y)`
1. 根 `.tab-bar` の `getBoundingClientRect()` の外（上下左右）なら null。
2. 中なら、x を tab の列 `.tab-bar-tabs` の見えている範囲（その矩形の `left`〜`right`）に丸めてから、いまの `tabs`（ストアの順）の各ボタンの矩形（`[data-tab-id]` を根の中で引く）で `slotAt`。丸めるのは、列があふれているとき、右へ隠れた tab の矩形が「＋」・右端の帯の下まで伸びていて（`getBoundingClientRect` は切り取られない）、丸めないと「＋」の上で離したときに見えない位置へ入るため。
3. `reorderSteps(ids, tabId, slot)` が null なら null（順が変わらない位置には線を出さない）。そうでなければ slot。

「＋」・右端の帯の上は、列の右端に丸められる。あふれていなければ、どの tab の中央よりも右なので末尾（スロット n）。あふれていれば、見えている右端の tab の前か後ろで、自動スクロールが末尾に着いた後は末尾になる。

**自動スクロール**（AC3）: ドラッグ中、`requestAnimationFrame` で毎フレーム、`lastPoint` が根の矩形の中にあり、`.tab-bar-tabs` が横にあふれている（`scrollWidth > clientWidth`）とき、`edgeScrollDelta(.tab-bar-tabs の矩形, lastPoint.x)` を `scrollLeft` に足す。`scrollLeft` が実際に変わったら、線の位置を計算し直す。ドラッグの終わりで止める。

**確定 / 取り消し**（AC1・AC8・AC-I2・AC-I4）
- `pointerup`: まず、`suppressClick` が立っていれば `suppressTimer = setTimeout(() => (suppressClick = false), 0)`（この後すぐ来る `click` を捨てた後、または来なかったときに下ろす）。`press` が無い・`pointerId` が違うなら終わり。ドラッグでなかった（`tabDrag` が無い）なら `press = null` で終わり（切り替えは今までどおり `click` が行う）。
- ドラッグだったら: **離した座標で** `currentSlot` と `reorderSteps` を計算し直す（線を出した時点の値を使わない。`PaneFrame.vue` と同じ理由）。片付け（下）の後、
  - 手順があれば（確定）: `count` 回、`conn.request("tab.move", { tabId, direction }).catch(() => undefined)` を待たずに送る → `selectTab(tabId)` → `nextTick` の後、`view.focusedPaneId` があれば `registry?.focus(view.focusedPaneId)`。
  - 無ければ（取り消し）: 何も送らない。フォーカスが tab バーの中にあれば、`view.focusedPaneId` の端末へ `registry?.focus`。
- `pointercancel`: 取り消し。
- `lostpointercapture`: `press` がまだあり、`pointerId` が同じなら取り消し（ブラウザが捕捉を外した。先例 `PaneFrame.vue:367`・`Sidebar.vue:854`）。ふつうの `pointerup`・`Esc` の後は `press` が null なので何も起きない。これが無いと、`pointerup` が届かないまま、キーを全部止める受け口が残る。
- keydown（window・capture。ドラッグ中だけ付ける）: どのキーも `preventDefault` と `stopPropagation`。`Escape` なら取り消し。
- 取り消し（`cancelTabDrag(restoreFocus = true)`）: 片付け → `restoreFocus` で、フォーカスが tab バーの中にあれば端末へ戻す（ダイアログが開いたときの取り消しだけ `false`。開きかけのダイアログとフォーカスを取り合わない。先例の `PaneFrame.vue` `cancelDrag` もフォーカスに触らない）。**ポインタの捕捉は外さない**（ボタンを離したときに自然に外れる）。`press = null` にするので、その後の `pointermove` は無視され、`pointerup` は上の最初の 1 行（`suppressClick` を下ろす予約）だけを行う。
- 片付け: `press = null`、`tabDrag.value = null`、keydown を外す、`cancelAnimationFrame`。`onUnmounted` では `clearTimeout(suppressTimer)` も。

**クリックの抑止**（AC-I2・AC-I5）: 根 `.tab-bar` に capture の `click` の聞き手を 1 つ付ける（`@click.capture="onBarClickCapture"`）。`suppressClick && ev.detail > 0` なら `ev.stopPropagation()`・`ev.preventDefault()` して `suppressClick = false`。そうでなければ何もしない。tab の `@click="selectTab(tab.id)"` と「＋」の `@click="onNewTab"` は今のまま（根で捨てるので、`click` が離した先〔たとえば「＋」〕へ行くブラウザでも、どちらも動かない）。
- `ev.detail > 0` を見るのは、キーボード（Enter・Space）の `click` は `detail` が 0 で、マウスの `click` は 1 以上だから。旗が下りずに残っても、キーボードでの切り替えを 1 回食べることがない。
- 旗は、ドラッグの開始で立ち、① 捨てた `click`、② `pointerup` の後の `setTimeout 0`、③ 次の `pointerdown`（タッチ・左以外のボタンを含む）のどれかで下りる。`click` が来ないブラウザでも残らない。

**外からの変化**（AC6）: ドラッグ中（`tabDrag` がある間）、次のどれかで `cancelTabDrag()`。`watch` は DOM が変わる前（既定のタイミング）に動かす。
- つかんだ tab がいまの `tabs` に無い / `tabs.length < 2`（tab バーが隠れる）/ `view.workspaceId` が変わった / `view.modalOpen` が true になった（これだけ `cancelTabDrag(false)`）。
- `onUnmounted` でも片付ける。
- tab の数・順だけが変わったときは、こちらからは何もしない（線は次の `pointermove`・フレームで、確定は `pointerup` で、そのときの `tabs` から計算する）。その変化でブラウザが捕捉を外したら、`lostpointercapture` で取り消しになる。

**pane のドラッグとの関係**（AC7）: `tabDrag` と `view.paneDrag` は別の状態で、どちらもポインタを捕捉した要素だけがイベントを受けるので、同時には進まない。tab のドラッグは `view.paneDrag` を読まず・書かない。入る位置の線のクラスは `tabDrag` だけから決め、`tab-bar-item-drop-target`（pane の落とし先）は今のまま `view.paneDrag.overTabId` だけから決める。

**見た目**（AC2）
- `.tab-bar-dragging`・その中の tab: `cursor: grabbing`。
- `.tab-bar-item-dragging`: `opacity: 0.4`。
- 線: `.tab-bar-item-insert-before` は `box-shadow: inset 3px 0 0 var(--soda-resize-line, #f8f8f2)`、`.tab-bar-item-insert-after` は `inset -3px 0 0 …`。`box-shadow` なので tab の幅は変わらない（線の出入りで並びが揺れない）。
- 動き（transition）は足さない。

## エラー処理 / 異常系

- `tab.move` の失敗（途中で tab が閉じられた等）は捨てる（キーの `moveTab` と同じ）。
- 送っている最中にほかの画面が同じ workspace の tab を閉じる・動かすと、狙いと違う位置に止まることがある（D2 の弱点 2）。直す仕組みは入れない。
- `conn` が無い（未接続）ときは何も送られず、順は変わらない。

## 受け入れ基準との対応

- AC1: 入力は `pointerup` の座標と、そのときの `tabs`。`reorderSteps` の `count` 回の `tab.move` → サーバの `moveTab` → `workspace.updated` → `tabs` の順。
- AC2: 入力は `pointermove` の座標（と自動スクロール後の `lastPoint`）。`tabDrag.slot` からクラスを付ける。順が変わらない位置・根の外は `currentSlot` が null。
- AC3: 入力は `lastPoint` と `.tab-bar-tabs` の矩形・`scrollWidth`。`edgeScrollDelta` を毎フレーム `scrollLeft` に足す。
- AC4: 位置の設定は根の `order` とクラスだけを変える。計算は根と tab の実際の矩形から行うので、分岐は無い。E2E で確かめる。
- AC5: 既存の `workspace.updated` の配布（サーバは全クライアントへ配る）。この作業で足すものは無い。E2E で確かめる。
- AC6: 入力はストア（`tabs`・`view.workspaceId`・`view.modalOpen`）の変化と、`lostpointercapture`。`cancelTabDrag()`。
- AC7: 状態を分ける（`tabDrag` はコンポーネントの中、`view.paneDrag` は触らない）。クラスの出どころも分ける。
- AC8: tab の D&D の製品コードの変更は `packages/web` の 2 ファイルだけ。送るのは `tab.move`（`count` 回）と `selectTab` の `tab.focus`。
- AC9: 入力は `pointerdown` の `pointerType`。`"touch"` は始めない。モバイルの画面は `TabBar` を描かない（`App.vue:64`）。
- AC10: docs の 3 ファイルを直す（tasks T5）。
- AC-I1: 入力は `pointerdown` の `button`・`pointerType` と、`pointermove` の移動距離（`TAB_DRAG_THRESHOLD_PX`）。
- AC-I2: 確定は `pointerup` で手順があるとき。取り消しは `Esc`・根の外・順が変わらない位置・`pointercancel`。`Esc` の後の `click` は `suppressClick` が捨てる。
- AC-I3: キー操作（`move_tab_previous`・`move_tab_next`。`packages/client-core/src/keys/bindings.ts`）は触らない。根の `click` の聞き手は `detail` が 0 の `click`（キーボード）を必ず通す。
- AC-I4: 確定は `selectTab` と `registry.focus`。取り消しは `registry.focus(view.focusedPaneId)`（フォーカスが tab バーの中にあるときだけ）。
- AC-I5: 6px 未満は `tabDrag` が立たず、`click` がそのまま `selectTab` を呼ぶ。`@contextmenu`・`@wheel`・「＋」・自動非表示の `watch` は触らない。キーは capture の keydown で止める。

---

# 第 2 部: pane の移動を同じ worktree の中に制限する

## 確かめたこと（第 2 部）

- **pane が workspace をまたぐ RPC は 2 つだけ**: `pane.move_to_tab`（`packages/server/src/surface/methods/pane.ts:126` → `SessionService.moveToTab` `packages/server/src/session/SessionService.ts:1000` → `SessionModel.moveToTab` `packages/server/src/session/SessionModel.ts:918`）と `pane.move_to_new_tab`（`pane.ts:136` → `SessionService.ts:1029` → `SessionModel.ts:949`）。同じ tab の中の `pane.swap_with`・`pane.move_to_edge`・`pane.replace` は、相手の pane が同じ tab でなければ何もしない（`SessionModel.ts:1030`〜`1076` の `other.tabId !== pane.tabId`・`target.tabId !== pane.tabId`）。tab ごと別の workspace へ移す・workspace を統合する RPC は無い（`packages/protocol/src/messages.ts` の `tab.*`・`workspace.*` の一覧に無い。tab の D&D でも足さない）。
- **入口は pane の名前のドラッグだけ**: ブラウザ版 `packages/web/src/components/PaneFrame.vue:234`・`:236` → `ActionDispatcher.movePaneToTab`・`movePaneToNewTab`（`packages/web/src/actions/ActionDispatcher.ts:942`・`:967`）。端末版 `packages/tui/src/input/mouse.ts:816`・`:817` → `TuiDispatcher.movePaneToTab`・`movePaneToNewTab`（`packages/tui/src/actions/TuiDispatcher.ts:942`・`:959`）。メニュー（`ContextMenu.vue` の pane の項目）・キー（`packages/client-core/src/keys/bindings.ts`）・モバイル（`packages/web/src/mobile/PanePicker.vue` は pane を選ぶだけ）・`sodactl`（`packages/cli/src/commands/pane.ts` に移動のコマンドが無い）には、pane を別の tab・workspace へ移す入口が無い（`move_to_tab`・`move_to_new_tab`・`movePaneTo` を `packages/*/src` で検索して確かめた）。
- **tab バーに並ぶのは表示中の workspace の tab だけ**（ブラウザ版 `TabBar.vue` の `tabs`、端末版 `packages/tui/src/render/chrome/tabBar.ts:171` `model.tabsOf(model.workspaceId)`）。どちらも、pane の名前を tab へ落とす操作は必ず同じ workspace の中。workspace をまたぐのは、サイドバーの workspace の行へ落とす `pane.move_to_new_tab` だけ（自分の workspace の行へ落とすと、同じ workspace の新しい tab へ切り出す）。
- **結果の形**: どちらの RPC も、何も起きなかったときは `{ok: false}` を返す（`packages/protocol/src/messages.ts:369` `PaneMoveToTabResult`・`:380` `PaneMoveToNewTabResult`）。画面は `ok` が false なら何もしない。
- **worktree の鍵**: `Workspace.git.worktreeKey`（その worktree のフォルダを一意に示す絶対パス。`packages/protocol/src/model.ts` `GitInfo`。型は `worktreeKey?: string | null`）。同じ値の workspace のうち最初の 1 つが代表で、2 つ目以降は代表でない通常の行になる（同じファイルの `Workspace.representative` の説明）。**古いサーバは `worktreeKey` を配らない**。新しいサーバの判定は、`worktreeKey` が取れなければ `unknown`（`packages/server/src/git/GitInfoPoller.ts:202`）なので、判定が入った `git` には必ず文字列がある。**古い保存から戻した直後**は、`git`（`repoKey`）はあるが `worktreeKey` が無いことがある（`packages/server/src/persist/SessionFile.ts:52`〜`55`、`SessionModel.ts:1415`）。
- **`Workspace.git` は、管理外でも・判定前でも `null`**（`SessionModel.ts:315`。判定の結果は `git`・`unmanaged`・`unknown` の 3 つで、`unknown` は何も変えない。`:140` `GitJudgement`・`:1187` `updateWorkspaceGit`）。
- **端末版の落とし先の強調は、pane の上の矩形だけ**（`packages/tui/src/app/TuiApp.ts:1276`〜`1283` の `drop?.kind === "pane"`）。workspace の行・tab の落とし先には、今も何も描かれない。
- **`Workspace.cwd` は開いた場所**で、作成と復元でしか書かれず、先頭の pane の `cd` には付いていかない。渡された文字列がそのまま入る（実パスにしない。`SessionService.ts:335`、`packages/server/src/session/newCwd.ts:96`）。git の判定と自動の名前は「いまの場所」（最初の tab の先頭の pane のフォルダ。`SessionService.ts:389` の説明・`identityCwdOf`）で決まり、これはサーバだけが持つ。
- **サーバは client-core の純関数を使っている**（`SessionModel.ts:28` が `@sodashitsu/client-core` から `repoMembers` などを import）。判定の関数を client-core に置けば、サーバ・ブラウザ版・端末版が同じものを使える。
- **判定はいつ走るか**: `DefaultGitInfoPoller` は `composeServer.ts:295` で作られ、起動で `start()`（最初の 1 周をすぐ走らせる）、以後は周期と、pane・workspace のイベント（`GitInfoPoller.ts` `FOLLOW_EVENTS`）で見直す。
- **別のマシン**: 中継は RPC をそのマシンのサーバへ渡す。workspace はマシンごとのサーバのもので、マシンをまたぐ pane の移動は無い。制限は、そのマシンのサーバが新しければ働く。中継は中身を解釈せずに通す（`packages/server/src/machine/MachineRelay.ts:7`〜`9`）ので、応答の `reason` は落ちない。
- **サイドバーの「落とせない行」の見た目**: `sidebar-row-drop-invalid`（`packages/web/src/components/Sidebar.vue:1174`。点線と `not-allowed`）。pane の落とし先の強調は `sidebar-row-pane-drop-target`（`:844`・`:1182`。`view.paneDrag.overWorkspaceId`）。ドラッグ元の pane は `view.paneDrag.sourcePaneId`（`packages/web/src/store/view.ts:407`）。
- **影響する既存のテスト**（`move_to_tab`・`move_to_new_tab`・`moveToTab`・`moveToNewTab`・`movePaneTo` の出現数）: `SessionModel.test.ts` 25・`SessionService.test.ts` 16・`ActionDispatcher.test.ts` 21・`TuiDispatcher.test.ts` 6・`PaneFrame.test.ts` 5・`messages.test.ts` 2・`mouse.test.ts` 1・`packages/cli/src/paneCurrent.integration.test.ts` 1（`:147`。作った直後の別の workspace へ `pane.move_to_new_tab`。どちらの workspace も `cwd` を渡さずに作っている）。E2E（`packages/e2e`）には pane の移動のテストが無い。別の workspace へ移しているテストのうち、2 つの workspace の `cwd` が同じで `git` が `null` のものは、新しい決まりでもそのまま通る（下の表の 3）: `ActionDispatcher.test.ts`（`makeWorkspace` は `cwd: "/"`）・`TuiDispatcher.test.ts`・`mouse.test.ts`（`testing/fixtures.ts` は `cwd: "/"`）・`PaneFrame.test.ts`・`Sidebar.test.ts:1993`（ドラッグ元がストアに無い）。**落ちるのは、`git: null` どうしで `cwd` が違うもの**: `SessionModel.test.ts:635`・`:759`（`/home/u` と `/home/u/other`）・`:1232`・`:1242`（`/a` と `/b`）、`SessionService.test.ts:506`・`:538`・`:584`・`:964`・`:972`。前提を直す（T7・T8）。`packages/e2e`・`scripts/` に pane の移動の呼び出しは無い。
- **docs の、別の workspace への移動に触れている所**: `docs/herdr-parity.md:78`（H41）、`docs/tui-parity.md:92`（H41）・`:130`（W03）、`docs/tui.md:183`、`docs/sodactl.md:701`・`:934`。

## 設計方針（第 2 部）

- **判定は 1 つの純関数**（client-core）で、入力は配られている `Workspace`（`id`・`cwd`・`git`）だけ。サーバ・ブラウザ版・端末版が同じ関数を使い、同じ結果を出す（decisions D12）。サーバに新しい状態は持たない。
- **断る場所は `SessionModel`**（状態を書き換える一番奥。どの入口・どの呼び出し元から来ても通る）。理由は、ハンドラが先に問い合わせて応答に載せる。`SessionModel.moveToTab`・`moveToNewTab` の戻り値の型は変えない（今あるテストと `SessionService` の呼び出しを壊さない）。
- **応答は `ok: false` に `reason` を足すだけ**（decisions D13）。
- **落とせる相手が少ないので、ドラッグが始まった時点で、落とせない行を薄くして見せる**（decisions D14）。離したときは送らずに知らせる。サーバが断ったとき（`reason` 付き）も知らせる。

## 対象範囲（第 2 部）

- `packages/protocol/src/messages.ts`（結果に `reason` を足す）
- `packages/client-core/src/workspace/paneMoveScope.ts`（新規）・`packages/client-core/src/index.ts`（出口）
- `packages/server/src/session/SessionModel.ts`・`SessionService.ts`・`packages/server/src/surface/methods/pane.ts`
- `packages/web/src/actions/ActionDispatcher.ts`・`packages/web/src/components/Sidebar.vue`
- `packages/tui/src/actions/TuiDispatcher.ts`
- 上のテスト・`packages/cli/src/paneCurrent.integration.test.ts`・E2E（新規 `pane-move-scope.spec.ts`）・docs
- 触らない: `TabBar.vue`（第 1 部だけが触る）・`PaneFrame.vue`・`view.ts`・端末版の `mouse.ts`・`TuiApp.ts`・`sodactl` のコマンド・保存の形式（`SessionFile`）・`GitInfoPoller`

## インターフェース / データ構造（第 2 部）

`packages/protocol/src/messages.ts`:

```ts
/** pane の移動を断った理由（20261008-web-tab-dnd）。古いサーバは返さない。 */
export type PaneMoveBlock = "different_worktree";
export interface PaneMoveToTabResult { ok: boolean; reason?: PaneMoveBlock }
export interface PaneMoveToNewTabResult { ok: boolean; tab?: Tab; reason?: PaneMoveBlock }
```

`packages/client-core/src/workspace/paneMoveScope.ts`（新規）:

```ts
type Ws = Pick<Workspace, "id" | "cwd" | "git">;
/**
 * pane を source の workspace から target の workspace へ移せるか。移せるなら null、断るなら理由。
 * lenient（画面が渡す）: git はあるのに worktreeKey が無い workspace（古いサーバ）が絡むときは、断らない（サーバに任せる）。
 */
export function paneMoveBlock(source: Ws, target: Ws, opts?: { lenient?: boolean }): PaneMoveBlock | null;
/** 知らせる文言。 */
export function paneMoveBlockMessage(reason: PaneMoveBlock): string;
```

決まり（上から順に見る。`key(ws)` は `ws.git?.worktreeKey` が文字列ならその値、そうでなければ無し）:

| # | 場合 | 結果 |
|---|---|---|
| 1 | 同じ workspace（`id` が同じ） | null（判定を通さない） |
| 2 | 両方に `key` がある | 同じなら null、違えば `different_worktree` |
| 3 | 両方とも `git` が `null`（管理外・判定前） | `cwd` が同じ文字列（末尾の `/` を落として比べる。根の `/` はそのまま）なら null、違えば `different_worktree` |
| 4 | `git` はあるのに `key` が無い workspace が絡む（古いサーバ・古い保存から戻した直後） | `lenient` なら null、そうでなければ `different_worktree` |
| 5 | それ以外（片方に `key`、片方は `git` が `null`） | `different_worktree` |

文言: 「別の worktree の workspace へは移せません（同じフォルダを開いた workspace へだけ移せます）」。

サーバ（`lenient` は渡さない）:

- `SessionModel.paneMoveBlockFor(paneId: PaneId, targetWorkspaceId: WorkspaceId): PaneMoveBlock | null`: pane・移動元の workspace・移動先の workspace が実在しなければ null（実在しないときの扱いは今ある `ok: false` に任せる。投げない）。そうでなければ client-core の `paneMoveBlock(source, target)`。
- `SessionModel.moveToTab`: 「自分自身の tab」「移動先の tab が無い」の確認の後、状態を書き換える前に、`this.paneMoveBlockFor(paneId, targetTab.workspaceId) !== null` なら `false`。`moveToNewTab`: 移動先の workspace の確認の後、同じく `null`。
- `SessionService.paneMoveBlockToTab(paneId, targetTabId)`・`paneMoveBlockToWorkspace(paneId, targetWorkspaceId)`: モデルへの問い合わせ（pane・tab が無ければ null。投げない）。
- `pane.ts` のハンドラ: 先に理由を問い合わせ、あれば `{ ok: false, reason }` を返して終わり（`sizeAuthority.noteInteraction` も呼ばない＝何もしていない）。無ければ今までどおり（実在しない pane への今のエラーも変えない）。

ブラウザ版（`lenient: true`）:

- `Sidebar.vue`: `view.paneDrag` がある間、ドラッグ元の pane（`view.paneDrag.sourcePaneId` → `session.panes` → `session.tabs` → `session.workspaces`）の workspace を求め、workspace を持つ行ごとに `paneMoveBlock(移動元, row.workspace, { lenient: true })` を計算する（`computed` で、ドラッグ中だけ。移動元がストアに無ければ、どの行も断らない）。
  - 断る行に `sidebar-row-pane-drop-disabled`（新しいクラス。`opacity: 0.45`。ドラッグ中ずっと）。
  - ポインタが上にある行（`view.paneDrag.overWorkspaceId` が一致）: 断らない行は今までどおり `sidebar-row-pane-drop-target`、断る行は `sidebar-row-drop-invalid`（`sidebar-row-pane-drop-target` は付けない）。
  - workspace を持たない行（グループの見出し等）は、今までどおり何も付けない。
- `ActionDispatcher.movePaneToNewTab`: 送る前に `paneMoveBlock(…, { lenient: true })`（移動元・移動先がストアに無ければ確認を飛ばして送る）。断るなら `view.toast(paneMoveBlockMessage(block))` で終わり（送らない）。応答が `!r.ok && r.reason` なら同じくトースト。`movePaneToTab`: 送る前の確認は足さず（ブラウザ版では必ず同じ workspace）、応答の `reason` だけトーストする。
- `PaneFrame.vue`・`view.ts` は変えない（落とし先の種類は今のまま `view.paneDrag.overWorkspaceId` に入り、落とせるかどうかはサイドバーとディスパッチャが同じ関数で決める）。

端末版（`lenient: true`）:

- `TuiDispatcher.movePaneToNewTab`: ブラウザ版と同じ（送る前の `paneMoveBlock` と `ui.toast`、応答の `reason` の `ui.toast`）。`movePaneToTab`: 送る前の確認は足さず、応答の `reason` だけ `ui.toast`。
- `mouse.ts`・`TuiApp.ts` は変えない（workspace の行の落とし先の強調はもともと無い。離すと今までどおり `actions.movePaneToNewTab` が呼ばれ、そこで断る）。

## 振る舞いの詳細 / 異常系（第 2 部）

- 断ったとき、サーバは状態を変えず、イベントを 1 つも配らず、保存の予約（`persist.touch`）もしない（`SessionService.moveToTab`・`moveToNewTab` は、モデルが `false`・`null` を返すとすぐ戻る。今ある作り）。
- **作った直後**: 同じフォルダで workspace をもう 1 つ開いた直後は、古い方に判定があり新しい方に無い（表の 5）ので、判定が入るまでの短い間は断られる。判定が入れば同じ `worktreeKey` になり、移せる。続けて移すスクリプト・テストは、`reason` がある間、待って試し直す。どちらも判定前なら、場所が同じなので移せる（表の 3）。
- **先頭の pane が `cd` した workspace**: 判定は「いまの場所」で決まるので、開いた場所が同じ 2 つの workspace でも、片方の先頭の pane が別の worktree へ `cd` していれば `worktreeKey` が違い、断る（一覧の行が別の worktree を指しているので、利用者の決定のとおり）。pane の `cd` そのものは止めない。
- **移した結果で判定が変わる**: 先頭の pane を移すと、移動元の workspace の「いまの場所」が変わりうる。同じ worktree の中でしか移せないので、`worktreeKey` は変わらないのがふつう。変わる場合（`cd` 済みの pane が先頭になった）も、今までどおり `GitInfoPoller` が後から直す。
- **判定が `unknown` しか返らない workspace**（git が時間切れ・起動できない）: 直前の判定のまま。1 度も入っていなければ `git: null` で、表の 3・5 のとおり（開いた場所が同じ、判定の無い相手とだけ移せる）。
- **古いサーバ**（`worktreeKey` を配らない・断らない）: 画面は `lenient` なので、`git` のある workspace どうしを自分では断らず、薄くもしない。送れば今までどおり通る（AC17）。古いサーバでも `git` が `null` どうしで `cwd` が違う相手は、画面が断る（表の 3 は新旧を見分けられない。AC17 の例外）。
- **古い保存から戻した直後**（`git` はあるが `worktreeKey` が無い）: サーバは断り（表の 4）、画面は断らずに送って、サーバの `reason` でトーストが出る。最初の判定が入るまでの短い間だけ（判定が `unknown` のまま入らなければ続く。まれ）。

## 受け入れ基準との対応（第 2 部）

- AC11: 入力は移動元・移動先の `Workspace.git.worktreeKey`。表の 2 の「同じなら null」。`representative` を見ないので、代表でない workspace も同じ。
- AC12: 入力は RPC の `paneId` と `targetTabId`・`targetWorkspaceId`。`SessionModel` の中の確認で書き換えの前に戻り、ハンドラが `reason` を載せる。同じリポジトリの別の worktree は `worktreeKey` が違う（表の 2）。
- AC13: 入力は `Workspace.git`（`null`）と `Workspace.cwd`。表の 3・5。
- AC14: 表の 4・5（確かめられない組み合わせは断る）。判定が入ると `worktreeKey` が配られ、表の 2 になる。
- AC15: 表の 1。同じ tab の中の操作は、この関数を通らない。pane の `cd` は、どこにも確認を足さない。
- AC16: 確認は `SessionModel.moveToTab`・`moveToNewTab` の中にあり、この 2 つを通らずに pane の `tabId` を別の workspace の tab に書き換える所が無い（「確かめたこと」の 1 つ目。T7 のテストで確かめる）。
- AC17: 結果の型に `reason` を足すだけ（任意の項目）。画面は `reason` が無い `ok: false` を今までどおり扱い、`lenient` で古いサーバの workspace を断らない。
- AC18: 入力は画面のストアの `Workspace` と `view.paneDrag`（`sourcePaneId`・`overWorkspaceId`）。ブラウザ版は `Sidebar.vue` のクラス。離したとき・応答の `reason` は、ブラウザ版・端末版のディスパッチャがトーストする。
- AC19: docs を直す（tasks T12）。
