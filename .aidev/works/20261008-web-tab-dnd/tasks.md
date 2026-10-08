# タスク: ブラウザ版の tab バーで、tab をドラッグで並べ替える

## 実装方針

`requirements.md`・`design.md`・`decisions.md` を先に読む。順の計算（純関数）→ ドラッグの処理 → 見た目と自動スクロール → E2E → docs の順に積む。製品コードは `packages/web/src/layout/tabReorder.ts`（新規）と `packages/web/src/components/TabBar.vue` の 2 ファイルだけ。**サーバ・protocol・client-core・端末版・`PaneFrame.vue`・`Sidebar.vue`・`view.ts`・`ActionDispatcher.ts` に触ることになったら、手を止めて `aidev escalate`**（decisions D1）。

環境: `export PATH="/tmp/pnpmbin:$HOME/.local/share/fnm/node-versions/v24.15.0/installation/bin:$PATH"`。動いている 7780 番のサーバには触らない。

## 作業順序と依存関係

下の `依存:` に従う。

- **独立点検（`aidev taskcheck`）を掛けるのは T1・T2 だけ**（AGENTS.md「点検とテストの掛け方」。T1 は順の計算、T2 はドラッグの状態の遷移・フォーカス・クリックの抑止）。T3〜T5（見た目・E2E・docs）には掛けず、全タスクの後の全体の点検（`cross`）に含める。サーバ・protocol を変えるタスクは無い。
- 最後の独立レビュー（差分全体）は省かない。

## リスク / 留意点

- ポインタを捕捉した後の `click` の出方はブラウザで違いうる（design「依拠する既存の事実」の未確認）。`suppressClick` の 3 つの下ろし方（捨てた click・`pointerup` 後の `setTimeout 0`・次の `pointerdown`）を全部入れる。
- jsdom は `getBoundingClientRect` が全部 0 を返す。`TabBar.test.ts` では、根 `.tab-bar`・`.tab-bar-tabs`・各 `.tab-bar-item` の `getBoundingClientRect` を差し替える（`vi.spyOn(el, "getBoundingClientRect")`）。ポインタのイベントの作り方は `PaneFrame.test.ts` の `pointerEvent(...)` と同じにする。
- `requestAnimationFrame` の繰り返しは、ドラッグの終わり・取り消し・`onUnmounted` で必ず止める（単体テストでは `vi.useFakeTimers()` か rAF の差し替え）。

## テスト方針

- 単体（vitest）: `pnpm --filter @sodashitsu/web test`。`tabReorder.test.ts`（T1）と `TabBar.test.ts` への追加（T2・T3）。
- E2E（Playwright）: `packages/e2e/src/specs/tab-dnd.spec.ts`（T4）。`.aidev/conventions/e2e-observe-browser.md` に従い、**実際のポインタの操作**（`page.mouse.move/down/up`。`steps` 付き）で動かし、合否は**ブラウザの DOM**（tab の順・クラス・フォーカス）と**ブラウザが送った要求**（`packages/e2e/src/support/frames.ts` の `routeRecordingWebSocket(page).sent(0)`）で決める。テスト自身のクライアント（`appServer.openClient()`）は、tab を作る前提づくりと、サーバの順の確認にだけ使う。次の操作の前に、ブラウザ側の印（`.tab-bar-item` の数・ラベルの順）を待つ。固定時間の待ちを根拠にしない。
- 全体: `pnpm build`・`pnpm typecheck`・`pnpm test` を流して結果を報告する。E2E は `tab-dnd.spec.ts` と、tab バーに触る既存の `appearance-settings.spec.ts`・`keys-mouse-dialogs.spec.ts`・`workspace-tab-pane.spec.ts` を流す。元から落ちる E2E の切り分けは、作業ブランチと main で各 2 回まで。
- AC10（docs）は目で確かめる。

## タスク

- [ ] T1: 順の計算の純関数を足す（**独立点検あり**）。`slotAt`・`reorderSteps`・`edgeScrollDelta` と定数 `TAB_DRAG_THRESHOLD_PX = 6`・`TAB_EDGE_SCROLL_PX = 24`・`TAB_EDGE_SCROLL_STEP = 8`。形と決まりは design「インターフェース / データ構造」のとおり。DOM に触らない。
      単体テスト `tabReorder.test.ts`:
      (1) `slotAt`: tab の左半分はその tab の前、右半分は次の tab の前、最後の tab の右半分と、どの tab よりも右は n、最初の tab より左は 0、空の配列は 0、あふれて矩形が負の座標にある tab が混ざっても同じ決まり。
      (2) `reorderSteps`: 5 個の tab で、`from`（0〜4）と `slot`（0〜5）の全部の組を回し、`slot === from` と `slot === from + 1` は null、ほかは、`ids` に「`direction` の向きへ隣と入れ替える」を `count` 回当てた結果が「つかんだ tab を抜いて `slot` の位置へ入れた順」と一致する。どの組でも `from ± count` が 0〜4 の中にある（端を越えて回らない）。`draggedId` が無い・`slot` が負・n より大きいは null。tab が 1 個は常に null。
      (3) `edgeScrollDelta`: 左端から 24px 未満は `-8`、右端から 24px 未満は `+8`、その間は 0、列の矩形の外（左・右）もその向きの値。
      対象: `packages/web/src/layout/tabReorder.ts`（新規作成）・`packages/web/src/layout/tabReorder.test.ts`（新規作成） / 先例: `packages/web/src/term/paneDragZone.ts`
      依存: なし
      AC: AC1, AC2, AC3

- [ ] T2: `TabBar.vue` に、ドラッグの開始・確定・取り消しを足す（**独立点検あり**）。design「振る舞いの詳細」の「開始」「線の位置の計算」「確定 / 取り消し」「クリックの抑止」「外からの変化」「pane のドラッグとの関係」のとおり。
      - tab のボタンに `@pointerdown`・`@pointermove`・`@pointerup`・`@pointercancel` を付け、`@click="selectTab(tab.id)"` を `@click="onTabClick($event, tab.id)"` に替える。`@contextmenu` はそのまま。
      - 状態は `press`・`tabDrag`（`ref`）・`suppressClick`・`lastPoint`。`view` ストアに足さない。`view.paneDrag` を読み書きしない（今ある `tab-bar-item-drop-target` の束縛はそのまま）。
      - 確定: `reorderSteps` の `count` 回の `conn.request("tab.move", { tabId, direction })`（待たない・失敗は捨てる）→ `selectTab(tabId)` → `nextTick` の後 `registry?.focus(view.focusedPaneId)`。
      - 取り消し: 何も送らない。フォーカスが根の中にあれば `registry?.focus(view.focusedPaneId)`。ポインタの捕捉は外さない。
      - ドラッグ中だけ window の keydown を capture で受け、全部のキーを `preventDefault`・`stopPropagation`、`Escape` で取り消し。
      - `watch` で取り消し: つかんだ tab が `tabs` から消えた・`tabs.length < 2`・`view.workspaceId` が変わった・`view.modalOpen` が true。`onUnmounted` で片付け。
      - クラス `tab-bar-dragging`（根）・`tab-bar-item-dragging`・`tab-bar-item-insert-before`・`tab-bar-item-insert-after` をテンプレートで付ける（CSS は T3）。
      単体テスト（`TabBar.test.ts` に `describe("TabBar — tab のドラッグでの並べ替え")` を足す。3 個以上の tab と、差し替えた矩形で）:
      (1) 6px 未満で離す → `tab.move` を送らず、続く `click` で今までどおり切り替わる（`tab.focus` が 1 回）。
      (2) 先頭の tab を最後の tab の右半分で離す → `tab.move {direction: "next"}` が（tab の数 − 1）回、その後に `tab.focus`。`view.tabId` がつかんだ tab。`registry.focus` が呼ばれる。
      (3) 最後の tab を先頭の左半分で離す → `previous` が（tab の数 − 1）回。隣へ 1 つ → 1 回。
      (4) ドラッグ中、`tabDrag` に応じて `tab-bar-item-dragging` と線のクラスが 1 つだけ付く。順が変わらない位置（自分の上・自分の前後の境目）と根の外では線のクラスが無い。離すと全部消える。
      (5) `Escape` → クラスが消え、その後の `pointerup` と `click`（`detail: 1`）で `tab.move` も `tab.focus` も送らず、`view.tabId` が変わらない。keydown が `defaultPrevented` で、window の bubble の聞き手に届かない。ドラッグしていないときの keydown は止めない。
      (6) 根の外で離す・順が変わらない位置で離す・`pointercancel` → 何も送らない。フォーカスが tab のボタンにあったら `registry.focus(view.focusedPaneId)` が呼ばれる。
      (7) `button: 2`・`button: 1`・`pointerType: "touch"` の `pointerdown` からは始まらない（動かしても `tab-bar-dragging` が付かない）。右クリックのメニュー（今あるテスト）はそのまま通る。
      (8) ドラッグの後、`detail: 0` の `click`（キーボード）は捨てない。ドラッグ → 離す → タイマーを進める → `detail: 1` の `click` は切り替える（旗が残らない）。
      (9) ドラッグ中に、つかんだ tab を消す／tab を 1 個にする／`view.setView` で別の workspace にする／ダイアログを開く（`view.modalOpen` が true になる操作）→ クラスが消え、その後の `pointerup` で何も送らない。tab を 1 つ足すだけならドラッグは続き、離した時点の順で `tab.move` の回数が決まる。
      (10) `view.startPaneDrag` と `view.setPaneDragOverTab` で pane のドラッグ中にしたとき、`tab-bar-item-drop-target` は付き、線・薄さのクラスは付かない。tab のドラッグ中は `view.paneDrag` が null のまま。
      今あるテスト（`クリックで切り替え、tab.focus を送る` ほか）が直しなしで通ること。
      対象: `packages/web/src/components/TabBar.vue`（`selectTab`・テンプレートの `button[role=tab]`）・`packages/web/src/components/TabBar.test.ts` / 先例: `packages/web/src/components/Sidebar.vue:519` `onRowPointerDown`〜`onRowPointerCancel`、`packages/web/src/composables/useResizeDrag.ts` `onKeydown`、`packages/web/src/components/PaneFrame.test.ts` の `pointerEvent`
      依存: T1
      AC: AC1, AC6, AC7, AC8, AC9, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5

- [ ] T3: 見た目と、端での自動スクロールを足す。design「自動スクロール」「見た目」のとおり。
      - `<style scoped>`: `.tab-bar-dragging` とその中の `.tab-bar-item` に `cursor: grabbing`、`.tab-bar-item-dragging` に `opacity: 0.4`、線は `box-shadow: inset 3px 0 0 var(--soda-resize-line, #f8f8f2)`（before）と `inset -3px 0 0 …`（after）。transition は足さない。`tab-bar-item-drop-target`（pane の落とし先）の決まりは変えない。
      - ドラッグ中だけ `requestAnimationFrame` を回し、`lastPoint` が根の矩形の中で `.tab-bar-tabs` があふれているとき、`edgeScrollDelta` を `scrollLeft` に足す。`scrollLeft` が変わったら線の位置を計算し直す。終わり・取り消し・`onUnmounted` で止める。
      単体テスト（`TabBar.test.ts`）: rAF を差し替え、`.tab-bar-tabs` の `scrollWidth`・`clientWidth`・矩形を差し替えて、(1) 右端から 24px 未満にいるとフレームごとに `scrollLeft` が増える、(2) 中ほどでは変わらない、(3) あふれていないときは変わらない、(4) 離した後・`Escape` の後はフレームを進めても変わらない（rAF が止まっている）。
      対象: `packages/web/src/components/TabBar.vue`（`<style scoped>`・`.tab-bar-tabs`）・`packages/web/src/components/TabBar.test.ts`
      依存: T2
      AC: AC2, AC3

- [ ] T4: E2E `tab-dnd.spec.ts` を足す。前提づくり: `appServer.openClient()` で `tab.create {workspaceId, label}` を呼んで tab を増やし（ラベルは `t1`〜。最初の tab は `tab.rename` で名前をそろえる）、ブラウザ側で `.tab-bar-item` の数とラベルの順（`.tab-bar-label` の `allTextContents()`）を待つ。`routeRecordingWebSocket(page)` は `page.goto` の前に呼ぶ。ドラッグは、つかむ tab の中央で `mouse.down` → 12px 動かす（`steps: 3`）→ 目的の座標へ（`steps: 8`）→（確かめ）→ `mouse.up`。座標は `boundingBox()` から作る（左半分＝`x + width * 0.25`、右半分＝`x + width * 0.75`）。先例: `packages/e2e/src/specs/workspace-groups.spec.ts:376` の `dragRowOver`、2 つのブラウザは `multi-client.spec.ts:39`、tab バーの位置の設定は `appearance-settings.spec.ts`。
      (1) 4 個の tab。選ばれていない先頭の tab を、3 番目の右半分へ。離す前: 先頭に `tab-bar-item-dragging`、4 番目に `tab-bar-item-insert-before` があり、線のクラスは全体で 1 つ。離した後: ラベルの順が `t2,t3,t1,t4`、`t1` に `tab-bar-item-active`、線・薄さのクラスが 0、フォーカスが端末（`document.activeElement` が `.xterm-helper-textarea`）、ブラウザが送った `tab.move` がちょうど 2 つ（どちらも `direction: "next"`）、その後に `tab.focus` が 1 つ。サーバの順（テスト用クライアントの `client.hello` の snapshot の `tabIds`）も同じ。`page.reload()` の後も同じ順（AC1・AC2・AC8・AC-I4）。
      (2) 最後の tab を先頭の左半分へ → 先頭になる。`tab.move` が 3 つ（`previous`）。最後の tab の後ろ（「＋」の上）へ先頭を落とす → 末尾になる（AC1）。
      (3) 取り消し: 選ばれていない tab をつかんで別の位置まで動かし、`Escape` → 線・薄さが消える → `mouse.up` → 順も、選ばれている tab も変わらず、`tab.move`・`tab.focus` が増えていない。端末の上で離す → 同じ。つかんだ tab の上へ戻して離す → 同じ。どれも、フォーカスが端末にある（AC-I2・AC-I4・AC8）。
      (4) 既存の操作: 3px だけ動かして離す → その tab へ切り替わる（`tab.focus` が 1 つ・`tab.move` 無し）。右クリック → メニュー（「名前の変更」）が出る。tab バー上のホイール → 隣の tab へ切り替わる。pane の名前（`.pane-frame-name`。設定「pane の名前を出す」〔`paneAgentNameVisible`〕を入れ、pane に名前を付けたときだけ出る。出し方は `appearance-settings.spec.ts:216`〜`247` にならう。pane の名前のドラッグの E2E の先例は無い）を別の tab へ落とす → ドラッグ中その tab に `tab-bar-item-drop-target` が付き、線のクラスは付かず、離すと `pane.move_to_tab` が送られ、tab の順は変わらない（AC7・AC-I1・AC-I5）。
      (5) ドラッグ中のキー: ドラッグ中に文字のキー（`a`）を押して `Escape` → 端末への入力（`watchSentInput(page)`）が増えていない（AC-I5）。
      (6) あふれ: 画面の幅を 700px にし、長いラベルの tab を、列があふれる数（`.tab-bar-tabs` の `scrollWidth > clientWidth` をブラウザで確かめる）だけ作る。先頭の tab をつかんで列の右端の内側 10px へ動かして止める → `scrollLeft` が増えていき、最後の tab の右端が列の中に入るまで `expect.poll` で待つ → 最後の tab の右半分へ動かして離す → 先頭だった tab が末尾（AC3）。
      (7) tab バーを「下」にして (1) と同じドラッグを 1 回 → 同じ結果（AC4）。
      (8) 2 つのブラウザ（別のコンテキスト）。片方でドラッグして離す → もう片方のラベルの順が、再読み込みなしで同じ順になる（AC5）。
      (9) ドラッグ中に、テスト用クライアントからつかんだ tab を `tab.close` → 線・薄さが消え、`mouse.up` で `tab.move` が送られない。ドラッグ中に名前のダイアログを開く経路があれば（無ければ単体テストに任せ、その旨をコメントに書く）同じく取り消し（AC6）。
      (10) タッチ: `hasTouch: true` のコンテキストで、tab の上を指でなぞる（CDP の `Input.dispatchTouchEvent`、または `page.touchscreen` で足りる範囲）→ `tab-bar-dragging` が付かず、`tab.move` が送られない。タップで切り替わる。指のなぞりを再現できなければ、単体テスト T2 (7) に任せ、その旨をコメントに書く（AC9）。
      負の対照: (1) の「`tab.move` がちょうど 2 つ」と (3) の「増えていない」が空振りでないことを、同じ記録が (1) で実際に 2 つ数えていることで示す（記録の取り方を 1 つの関数にまとめる）。
      対象: `packages/e2e/src/specs/tab-dnd.spec.ts`（新規作成） / 補助: `packages/e2e/src/support/frames.ts` `routeRecordingWebSocket`・`watchSentInput`、`packages/e2e/src/support/fixtures.ts`
      依存: T3
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC-I1, AC-I2, AC-I4, AC-I5

- [ ] T5: docs を合わせる。
      - `docs/tui-parity.md`: H04m（34 行目あたり）と M12（120 行目あたり）の「Web版」の列を「無し」から「あり」に。端末版の扱いの列は「対応（Web 版と同じく `tab.move` を動かす数だけ送る）」のように、今の内容を保って一言足す。
      - `docs/herdr-parity.md`: H04 の行の tab の並べ替えの説明に、20261008-web-tab-dnd で、ブラウザ版でも tab バーの tab をドラッグで並べ替えられるようになったこと（同じ workspace の中だけ・入る位置に線・`Esc` で取り消し・RPC は既存の `tab.move` を動かす数だけ・タッチとモバイルの 1 列の画面は対象外・キー `move_tab_previous`/`move_tab_next` は今までどおり）を足す。「対応 AC」の列にこの作業の AC を足す。
      - `docs/verification.md`: pane の名前のドラッグの項目（376 行目あたり）の近くに、手で確かめる項目を足す: tab を 3 つ以上作り、tab をつかんで別の位置で離す（線の位置に入る・つかんだ tab が選ばれる）／`Esc`・tab バーの外で離すと変わらない／クリック・右クリック・ホイールは今までどおり／あふれるときに端で自動スクロール／別のブラウザに反映／tab バーを「下」にしても同じ／pane の名前を tab へ落とす移動は今までどおり。
      - `docs/tui.md` は端末版の文書なので直さない。
      対象: `docs/tui-parity.md`（H04m・M12 の行）・`docs/herdr-parity.md`（H04 の行）・`docs/verification.md`（「pane の名前」のドラッグの項目の近く）
      依存: T2
      AC: AC10
