# 仕様: ブラウザ版の tab バーで、tab をドラッグで並べ替える

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
- **ポインタの扱いは、pane の名前・workspace の行のドラッグと同じ形**（`pointerdown` で押した位置を覚えて捕捉 → 6px で開始 → `pointerup` の実際の座標で確定。`Sidebar.vue:519` `onRowPointerDown`）。違いは 2 つ: キーを全部止める（D7）、ドラッグの後の `click` を捨てる（tab は `@click` で切り替えるため。下の「クリックの抑止」）。
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
let lastPoint = { x: 0, y: 0 };                                                      // 自動スクロールが使う最後の座標
```

DOM のクラス（E2E・単体テストが見る）:

- `.tab-bar-dragging`: 根。ドラッグ中だけ。
- `.tab-bar-item-dragging`: つかんだ tab。ドラッグ中だけ。
- `.tab-bar-item-insert-before`: スロット i（i < n）のとき、i 番目の tab。`.tab-bar-item-insert-after`: スロット n のとき、最後の tab。どちらも同時に高々 1 つ。

## 振る舞いの詳細

**開始**（AC-I1・AC9）
- tab のボタンの `pointerdown`: `ev.button !== 0` または `ev.pointerType === "touch"` なら何もしない。そうでなければ `suppressClick = false`、`press` を覚え、`setPointerCapture`。`preventDefault` はしない（ボタンのフォーカスと `click` は今までどおり）。
- `pointermove`: `press` が無い・`pointerId` が違うなら無視。`tabDrag` がまだ無く、動いた距離が 6px 未満なら無視。6px 以上で開始: `tabDrag = { tabId, slot: null }`、`suppressClick = true`、window の keydown を capture で付ける、自動スクロールの繰り返しを始める。その後（開始した回も含め）`lastPoint` を覚えて、線の位置を計算し直す。
- 「＋」・右端の帯・tab の列の余白（スクロールバー）には `pointerdown` を付けない。

**線の位置の計算**（AC2）: `currentSlot(x, y)`
1. 根 `.tab-bar` の `getBoundingClientRect()` の外（上下左右）なら null。
2. 中なら、いまの `tabs`（ストアの順）の各ボタンの矩形（`[data-tab-id]` を根の中で引く）から `slotAt`。
3. `reorderSteps(ids, tabId, slot)` が null なら null（順が変わらない位置には線を出さない）。そうでなければ slot。

「＋」・右端の帯の上は、根の中で、どの tab の中央よりも右なので、末尾（スロット n）になる。

**自動スクロール**（AC3）: ドラッグ中、`requestAnimationFrame` で毎フレーム、`lastPoint` が根の矩形の中にあり、`.tab-bar-tabs` が横にあふれている（`scrollWidth > clientWidth`）とき、`edgeScrollDelta(.tab-bar-tabs の矩形, lastPoint.x)` を `scrollLeft` に足す。`scrollLeft` が実際に変わったら、線の位置を計算し直す。ドラッグの終わりで止める。

**確定 / 取り消し**（AC1・AC8・AC-I2・AC-I4）
- `pointerup`: まず、`suppressClick` が立っていれば `setTimeout(() => (suppressClick = false), 0)`（この後すぐ来る `click` を捨てた後、または来なかったときに下ろす）。`press` が無い・`pointerId` が違うなら終わり。ドラッグでなかった（`tabDrag` が無い）なら `press = null` で終わり（切り替えは今までどおり `click` が行う）。
- ドラッグだったら: **離した座標で** `currentSlot` と `reorderSteps` を計算し直す（線を出した時点の値を使わない。`PaneFrame.vue` と同じ理由）。片付け（下）の後、
  - 手順があれば（確定）: `count` 回、`conn.request("tab.move", { tabId, direction }).catch(() => undefined)` を待たずに送る → `selectTab(tabId)` → `nextTick` の後、`view.focusedPaneId` があれば `registry?.focus(view.focusedPaneId)`。
  - 無ければ（取り消し）: 何も送らない。フォーカスが tab バーの中にあれば、`view.focusedPaneId` の端末へ `registry?.focus`。
- `pointercancel`: 取り消し。
- keydown（window・capture。ドラッグ中だけ付ける）: どのキーも `preventDefault` と `stopPropagation`。`Escape` なら取り消し。
- 取り消し（`cancelTabDrag()`）: 片付け → フォーカスが tab バーの中にあれば端末へ戻す。**ポインタの捕捉は外さない**（ボタンを離したときに自然に外れる）。`press = null` にするので、その後の `pointermove` は無視され、`pointerup` は上の最初の 1 行（`suppressClick` を下ろす予約）だけを行う。
- 片付け: `press = null`、`tabDrag.value = null`、keydown を外す、`cancelAnimationFrame`。

**クリックの抑止**（AC-I2・AC-I5）: tab の `@click` を `onTabClick(ev, tabId)` に替える。`suppressClick && ev.detail > 0` なら `suppressClick = false` にして何もしない。そうでなければ `selectTab(tabId)`。
- `ev.detail > 0` を見るのは、キーボード（Enter・Space）の `click` は `detail` が 0 で、マウスの `click` は 1 以上だから。旗が下りずに残っても、キーボードでの切り替えを 1 回食べることがない。
- 旗は、ドラッグの開始で立ち、① 捨てた `click`、② `pointerup` の後の `setTimeout 0`、③ 次の `pointerdown` のどれかで下りる。`click` が来ないブラウザでも残らない。

**外からの変化**（AC6）: ドラッグ中（`tabDrag` がある間）、次のどれかで `cancelTabDrag()`。`watch` は DOM が変わる前（既定のタイミング）に動かす。
- つかんだ tab がいまの `tabs` に無い / `tabs.length < 2`（tab バーが隠れる）/ `view.workspaceId` が変わった / `view.modalOpen` が true になった。
- `onUnmounted` でも片付ける。
- tab の数・順だけが変わったときは何もしない（線は次の `pointermove`・フレームで、確定は `pointerup` で、そのときの `tabs` から計算する）。

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
- AC6: 入力はストア（`tabs`・`view.workspaceId`・`view.modalOpen`）の変化。`watch` で `cancelTabDrag()`。
- AC7: 状態を分ける（`tabDrag` はコンポーネントの中、`view.paneDrag` は触らない）。クラスの出どころも分ける。
- AC8: 製品コードの変更は `packages/web` の 2 ファイルだけ。送るのは `tab.move`（`count` 回）と `selectTab` の `tab.focus`。
- AC9: 入力は `pointerdown` の `pointerType`。`"touch"` は始めない。モバイルの画面は `TabBar` を描かない（`App.vue:64`）。
- AC10: docs の 3 ファイルを直す（tasks T5）。
- AC-I1: 入力は `pointerdown` の `button`・`pointerType` と、`pointermove` の移動距離（`TAB_DRAG_THRESHOLD_PX`）。
- AC-I2: 確定は `pointerup` で手順があるとき。取り消しは `Esc`・根の外・順が変わらない位置・`pointercancel`。`Esc` の後の `click` は `suppressClick` が捨てる。
- AC-I3: キー操作（`move_tab_previous`・`move_tab_next`。`packages/client-core/src/keys/bindings.ts`）は触らない。`onTabClick` は `detail` が 0 の `click`（キーボード）を必ず通す。
- AC-I4: 確定は `selectTab` と `registry.focus`。取り消しは `registry.focus(view.focusedPaneId)`（フォーカスが tab バーの中にあるときだけ）。
- AC-I5: 6px 未満は `tabDrag` が立たず、`click` がそのまま `selectTab` を呼ぶ。`@contextmenu`・`@wheel`・「＋」・自動非表示の `watch` は触らない。キーは capture の keydown で止める。
