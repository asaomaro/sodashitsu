# タスク: ブラウザ版の tab のドラッグでの並べ替えと、pane の移動を同じ worktree の中に制限する

## 実装方針

`requirements.md`・`design.md`（第 1 部・第 2 部）・`decisions.md` を先に読む。**PR を 2 つに分ける。**

- **PR1「tab の D&D」= T1〜T5**（AC1〜AC10・AC-I1〜AC-I5）。製品コードは `packages/web/src/layout/tabReorder.ts`（新規）と `packages/web/src/components/TabBar.vue` の 2 ファイルだけ。サーバ・protocol・client-core・端末版・`PaneFrame.vue`・`Sidebar.vue`・`view.ts`・`ActionDispatcher.ts` には触らない（触ることになったら、手を止めて報告する）。
- **PR2「pane の移動の制限」= T6〜T12**（AC11〜AC19）。protocol → client-core → サーバ → ブラウザ版 → 端末版 → E2E → docs の順。`TabBar.vue`・`PaneFrame.vue`・`view.ts` には触らない。PR1 と、製品コード・テストのファイルは重ならないので、ブランチは PR1 の上に積んでも、main から別に切ってもよい（docs の `herdr-parity.md`・`tui-parity.md`・`verification.md` は両方が触るが、行が違う）。

環境: `export PATH="/tmp/pnpmbin:$HOME/.local/share/fnm/node-versions/v24.15.0/installation/bin:$PATH"`。動いている 7780 番のサーバには触らない。

## 作業順序と依存関係

下の `依存:` に従う。

- **独立点検（`aidev taskcheck`）を掛けるのは T1・T2・T6・T7・T8**（AGENTS.md「点検とテストの掛け方」。T1 は順の計算、T2 はドラッグの状態の遷移・フォーカス・クリックの抑止、T6 は protocol と判定の決まり、T7・T8 はサーバの状態と、断る＝安全に関わる所）。T3〜T5・T9〜T12（見た目・画面の配線・E2E・docs）には掛けず、PR ごとの全体の点検（`cross`）に含める。
- 最後の独立レビュー（PR ごとの差分全体）は省かない。

## リスク / 留意点

- （PR1）ポインタを捕捉した後の `click` の出方・DOM が動いたときの捕捉は、ブラウザで違いうる（design「依拠する既存の事実」の未確認）。旗 `suppressClick` の 3 つの下ろし方と、`lostpointercapture` での取り消しを全部入れる。
- （PR1）jsdom は `getBoundingClientRect` が全部 0 を返し、ポインタの捕捉も無い。`TabBar.test.ts` では、根 `.tab-bar`・`.tab-bar-tabs`・各 `.tab-bar-item` の `getBoundingClientRect` を差し替える（`vi.spyOn(el, "getBoundingClientRect")`）。ポインタのイベントは `PaneFrame.test.ts:353` の `pointerEvent(...)` と同じ作り方。
- （PR1）`requestAnimationFrame` の繰り返しは、ドラッグの終わり・取り消し・`onUnmounted` で必ず止める。
- （PR2）既存のテストには、`git: null` の workspace どうしで pane を移しているものがある。2 つの workspace の `cwd` が同じなら新しい決まりでも通る。違うものは、**テストの期待を緩めるのではなく、前提を直す**（同じ `cwd` で作る・両方に同じ `worktreeKey` の判定を入れる）。断られることを確かめるテストは新しく足す。
- （PR2）回帰の負の対照: T7 の「別の worktree へは断る」テストは、`SessionModel.moveToTab`・`moveToNewTab` の確認の行だけを外すと落ちることを確かめ、落ちたときの出力を `test-result.md` に貼る（`.aidev/conventions/regression-negative-control.md`。この作業は不具合の修正ではないが、「どの入口でも断る」の根拠になるテストなので同じ扱いにする）。

## テスト方針

- 単体（vitest）: `pnpm --filter <パッケージ> test`。PR1 は `@sodashitsu/web`。PR2 は `@sodashitsu/protocol`・`@sodashitsu/client-core`・`@sodashitsu/server`・`@sodashitsu/web`・`@sodashitsu/tui`・`@sodashitsu/cli`。
- E2E（Playwright）: PR1 は `packages/e2e/src/specs/tab-dnd.spec.ts`（T4）、PR2 は `pane-move-scope.spec.ts`（T11）。`.aidev/conventions/e2e-observe-browser.md` に従い、**実際のポインタの操作**（`page.mouse.move/down/up`。`steps` 付き）で動かし、合否は**ブラウザの DOM**（tab の順・クラス・フォーカス・トースト）と**ブラウザが送った要求**（`packages/e2e/src/support/frames.ts` の `routeRecordingWebSocket(page)` の `sent(接続の番号)`）で決める。テスト自身のクライアント（`appServer.openClient()`）は、前提づくりと、サーバの状態の確認にだけ使う。次の操作の前に、ブラウザ側の印を待つ。固定時間の待ちを根拠にしない。
- 全体: PR ごとに `pnpm build`・`pnpm typecheck`・`pnpm test` を流して結果を報告する。E2E は、PR1 は `tab-dnd.spec.ts` と、tab バーに触る既存の `appearance-settings.spec.ts`・`keys-mouse-dialogs.spec.ts`・`workspace-tab-pane.spec.ts`。PR2 は `pane-move-scope.spec.ts`・`workspace-groups.spec.ts`・`multi-client.spec.ts`。元から落ちる E2E の切り分けは、作業ブランチと main で各 2 回まで。
- AC10・AC19（docs）は目で確かめる。

## タスク

### PR1: tab の D&D

- [ ] T1: 順の計算の純関数を足す（**独立点検あり**）。`slotAt`・`reorderSteps`・`edgeScrollDelta` と定数 `TAB_DRAG_THRESHOLD_PX = 6`・`TAB_EDGE_SCROLL_PX = 24`・`TAB_EDGE_SCROLL_STEP = 8`。形と決まりは design「インターフェース / データ構造」のとおり。DOM に触らない。
      単体テスト `tabReorder.test.ts`:
      (1) `slotAt`: tab の左半分はその tab の前、右半分は次の tab の前、最後の tab の右半分と、どの tab よりも右は n、最初の tab より左は 0、空の配列は 0、あふれて矩形が負の座標にある tab が混ざっても同じ決まり。
      (2) `reorderSteps`: 5 個の tab で、`from`（0〜4）と `slot`（0〜5）の全部の組を回し、`slot === from` と `slot === from + 1` は null、ほかは、`ids` に「`direction` の向きへ隣と入れ替える」を `count` 回当てた結果が「つかんだ tab を抜いて `slot` の位置へ入れた順」と一致する。どの組でも `from ± count` が 0〜4 の中にある（端を越えて回らない）。`draggedId` が無い・`slot` が負・n より大きいは null。tab が 1 個は常に null。
      (3) `edgeScrollDelta`: 左端から 24px 未満は `-8`、右端から 24px 未満は `+8`、その間は 0、列の矩形の外（左・右）もその向きの値。
      対象: `packages/web/src/layout/tabReorder.ts`（新規作成）・`packages/web/src/layout/tabReorder.test.ts`（新規作成） / 先例: `packages/web/src/term/paneDragZone.ts`
      依存: なし
      AC: AC1, AC2, AC3

- [ ] T2: `TabBar.vue` に、ドラッグの開始・確定・取り消しを足す（**独立点検あり**）。design 第 1 部「振る舞いの詳細」の「開始」「線の位置の計算」「確定 / 取り消し」「クリックの抑止」「外からの変化」「pane のドラッグとの関係」のとおり。
      - tab のボタンに `@pointerdown`・`@pointermove`・`@pointerup`・`@pointercancel`・`@lostpointercapture` を付ける。`@click="selectTab(tab.id)"`・`@contextmenu`・「＋」の `@click` はそのまま。根 `.tab-bar` に `@click.capture="onBarClickCapture"` を付ける。
      - `pointerdown` は、最初に `suppressClick = false`・`clearTimeout(suppressTimer)`、その後で `button !== 0`・`pointerType === "touch"` を弾く。`setPointerCapture?.(...)`。
      - 状態は `press`・`tabDrag`（`ref`）・`suppressClick`・`suppressTimer`・`lastPoint`。`view` ストアに足さない。`view.paneDrag` を読み書きしない（今ある `tab-bar-item-drop-target` の束縛はそのまま）。
      - 線の位置: 根の矩形の外は null。中なら x を `.tab-bar-tabs` の矩形の `left`〜`right` に丸めてから `slotAt`、`reorderSteps` が null なら null。
      - 確定: `reorderSteps` の `count` 回の `conn.request("tab.move", { tabId, direction })`（待たない・失敗は捨てる）→ `selectTab(tabId)` → `nextTick` の後 `registry?.focus(view.focusedPaneId)`。
      - 取り消し `cancelTabDrag(restoreFocus = true)`: 何も送らない。`restoreFocus` で、フォーカスが根の中にあれば `registry?.focus(view.focusedPaneId)`。ポインタの捕捉は外さない。
      - ドラッグ中だけ window の keydown を capture で受け、全部のキーを `preventDefault`・`stopPropagation`、`Escape` で取り消し。
      - `watch` で取り消し: つかんだ tab が `tabs` から消えた・`tabs.length < 2`・`view.workspaceId` が変わった・`view.modalOpen` が true（これだけ `cancelTabDrag(false)`）。`lostpointercapture`（`press` があり `pointerId` が同じ）でも取り消し。`onUnmounted` で片付け（`clearTimeout(suppressTimer)` を含む）。
      - クラス `tab-bar-dragging`（根）・`tab-bar-item-dragging`・`tab-bar-item-insert-before`・`tab-bar-item-insert-after` をテンプレートで付ける（CSS は T3）。
      単体テスト（`TabBar.test.ts` に `describe("TabBar — tab のドラッグでの並べ替え")` を足す。3 個以上の tab と、差し替えた矩形で）:
      (1) 6px 未満で離す → `tab.move` を送らず、続く `click` で今までどおり切り替わる（`tab.focus` が 1 回）。
      (2) 先頭の tab を最後の tab の右半分で離す → `tab.move {direction: "next"}` が（tab の数 − 1）回、その後に `tab.focus`。`view.tabId` がつかんだ tab。`registry.focus` が呼ばれる。
      (3) 最後の tab を先頭の左半分で離す → `previous` が（tab の数 − 1）回。隣へ 1 つ → 1 回。
      (4) ドラッグ中、`tab-bar-item-dragging` と線のクラスが 1 つだけ付く。順が変わらない位置（自分の上・自分の前後の境目）と根の外では線のクラスが無い。離すと全部消える。
      (5) `Escape` → クラスが消え、その後の `pointerup` と `click`（`detail: 1`）で `tab.move` も `tab.focus` も送らず、`view.tabId` が変わらない。keydown が `defaultPrevented` で、window の bubble の聞き手に届かない。ドラッグしていないときの keydown は止めない。
      (6) 根の外で離す・順が変わらない位置で離す・`pointercancel`・`lostpointercapture` → 何も送らない。クラスが消え、その後の keydown を止めない。フォーカスが tab のボタンにあったら `registry.focus(view.focusedPaneId)` が呼ばれる。
      (7) `button: 2`・`button: 1`・`pointerType: "touch"` の `pointerdown` からは始まらない（動かしても `tab-bar-dragging` が付かない）。右クリックのメニュー（今あるテスト）はそのまま通る。
      (8) クリックの抑止: ドラッグの後、`detail: 0` の `click`（キーボード）は捨てない。ドラッグ → 離す → タイマーを進める → `detail: 1` の `click` は切り替える（旗が残らない）。ドラッグ → `watch` での取り消し（`pointerup` 無し）→ タッチの `pointerdown` → `detail: 1` の `click` は切り替える。ドラッグの直後に「＋」へ来た `detail: 1` の `click` は `newTabInWorkspace` を呼ばない。
      (9) ドラッグ中に、つかんだ tab を消す／tab を 1 個にする／`view.setView` で別の workspace にする／ダイアログを開く（`view.modalOpen` が true になる操作）→ クラスが消え、その後の `pointerup` で何も送らない。ダイアログのときは `registry.focus` を呼ばない。tab を 1 つ足すだけならドラッグは続き、離した時点の順で `tab.move` の回数が決まる。
      (10) `view.startPaneDrag` と `view.setPaneDragOverTab` で pane のドラッグ中にしたとき、`tab-bar-item-drop-target` は付き、線・薄さのクラスは付かない。tab のドラッグ中は `view.paneDrag` が null のまま。
      (11) 列があふれている（右へ隠れた tab の矩形が列の右端より右にある）とき、列の右の外（「＋」の上）の x は、見えている右端の tab の位置として計算される（隠れた tab の間にならない）。
      今あるテスト（`クリックで切り替え、tab.focus を送る` ほか）が直しなしで通ること。
      対象: `packages/web/src/components/TabBar.vue`（`selectTab`・テンプレートの根と `button[role=tab]`）・`packages/web/src/components/TabBar.test.ts` / 先例: `packages/web/src/components/Sidebar.vue:519` `onRowPointerDown`〜`onRowPointerCancel`・`:854`、`packages/web/src/composables/useResizeDrag.ts` `onKeydown`、`packages/web/src/components/PaneFrame.test.ts:353` `pointerEvent`
      依存: T1
      AC: AC1, AC6, AC7, AC8, AC9, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5

- [ ] T3: 見た目と、端での自動スクロールを足す。design 第 1 部「自動スクロール」「見た目」のとおり。
      - `<style scoped>`: `.tab-bar-dragging` とその中の `.tab-bar-item` に `cursor: grabbing`、`.tab-bar-item-dragging` に `opacity: 0.4`、線は `box-shadow: inset 3px 0 0 var(--soda-resize-line, #f8f8f2)`（before）と `inset -3px 0 0 …`（after）。transition は足さない。`tab-bar-item-drop-target`（pane の落とし先）の決まりは変えない。
      - ドラッグ中だけ `requestAnimationFrame` を回し、`lastPoint` が根の矩形の中で `.tab-bar-tabs` があふれているとき、`edgeScrollDelta` を `scrollLeft` に足す。`scrollLeft` が変わったら線の位置を計算し直す。終わり・取り消し・`onUnmounted` で止める。
      単体テスト（`TabBar.test.ts`）: rAF を差し替え、`.tab-bar-tabs` の `scrollWidth`・`clientWidth`・矩形を差し替えて、(1) 右端から 24px 未満にいるとフレームごとに `scrollLeft` が増える、(2) 中ほどでは変わらない、(3) あふれていないときは変わらない、(4) 離した後・`Escape` の後はフレームを進めても変わらない（rAF が止まっている）。
      対象: `packages/web/src/components/TabBar.vue`（`<style scoped>`・`.tab-bar-tabs`）・`packages/web/src/components/TabBar.test.ts`
      依存: T2
      AC: AC2, AC3

- [ ] T4: E2E `tab-dnd.spec.ts` を足す。
      共通の前提: `appServer.openClient()` で `tab.create {workspaceId, label}` を呼んで tab を増やし（ラベルは `t1`〜。最初の tab は `tab.rename` で名前をそろえる）、ブラウザ側で `.tab-bar` が見えること・`.tab-bar-item` の数・ラベルの順（`.tab-bar-label` の `allTextContents()`）を待つ。どの tab が選ばれているかは決め打ちにせず、**選びたい tab をクリックして `tab-bar-item-active` を待つ**。`routeRecordingWebSocket(page)` は `page.goto` の前に呼ぶ。送った要求は `sent(接続の番号)`（最初の接続は 0。`page.reload()` の後は 1）で読み、**ドラッグの直前の数との差**で数える（前提のクリックの `tab.focus` を混ぜない）。記録の読み方（`tab.move`・`tab.focus` の差を返す）は 1 つの関数にまとめる。サーバの順は、**新しく `appServer.openClient()` した**クライアントの snapshot の `tabIds` で読む（`helloSnapshot()` は接続した時点のもの）。
      ドラッグ: つかむ tab の中央で `mouse.down` → 12px 動かす（`steps: 3`）→ 目的の座標へ（`steps: 8`）→（確かめ）→ `mouse.up`。座標は `boundingBox()` から作る（左半分＝`x + width * 0.25`、右半分＝`x + width * 0.75`）。先例: `packages/e2e/src/specs/workspace-groups.spec.ts:376` の `dragOver`、2 つのブラウザは `multi-client.spec.ts:39`。
      (1) 4 個の tab。選ばれていない先頭の tab を、3 番目の右半分へ。離す前: 先頭に `tab-bar-item-dragging`、4 番目に `tab-bar-item-insert-before` があり、線のクラスは全体で 1 つ。離した後: ラベルの順が `t2,t3,t1,t4`、`t1` に `tab-bar-item-active`、線・薄さのクラスが 0、フォーカスが端末（`document.activeElement` が `.xterm-helper-textarea`）、ブラウザが送った `tab.move` がちょうど 2 つ（どちらも `direction: "next"`）、その後に `tab.focus` が 1 つ。サーバの順も同じ。`page.reload()` の後も同じ順（AC1・AC2・AC8・AC-I4）。
      (2) 最後の tab を先頭の左半分へ → 先頭になる。`tab.move` が 3 つ（`previous`）。先頭を「＋」の上で離す → 末尾になり、新しい tab の名前の入力は開かない（AC1・AC-I5）。
      (3) 取り消し: 選ばれていない tab をつかんで別の位置まで動かし、`Escape` → 線・薄さが消える → `mouse.up` → 順も、選ばれている tab も変わらず、`tab.move`・`tab.focus` が増えていない。端末の上で離す → 同じ。つかんだ tab の上へ戻して離す → 同じ。どれも、フォーカスが端末にある。「増えていない」が空振りでないことは、同じ関数が (1) で 2 と 1 を数えていることで示す（AC-I2・AC-I4・AC8）。
      (4) 既存の操作: 3px だけ動かして離す → その tab へ切り替わる（`tab.focus` が 1 つ・`tab.move` 無し）。右クリック → メニュー（「名前の変更」）が出る。tab バー上のホイール → 隣の tab へ切り替わる（AC-I1・AC-I5）。
      (5) pane の名前を tab へ落とす（AC7）: `addInitScript` で `soda.prefs.v1` に `paneAgentNameVisible: true` を入れ（prefs の入れ方の先例 `workspace-groups.spec.ts:223`〜`237`）、テスト用クライアントで、移動元の tab を `pane.split` で 2 pane にし、片方に `pane.rename` で名前を付ける（`.pane-frame-name` が出るのを待つ。出し方の先例 `appearance-settings.spec.ts:211`〜`240`）。その名前を別の tab へドラッグ → ドラッグ中その tab に `tab-bar-item-drop-target` が付き、`tab-bar-item-insert-*`・`tab-bar-dragging` は付かない → 離すと `pane.move_to_tab` が送られ、tab の数とラベルの順は変わらない。pane の名前のドラッグの E2E の先例は無い。
      (6) ドラッグ中のキー（AC-I5）: **別のテストにし、`routeRecordingWebSocket` を使わない**（その下では端末への入力が観測できない。`frames.ts:107`）。観測は tab の数: まず、ドラッグしていないときに、新しい tab を作る既定のキー操作（`prefixKey(page, "c")`。`appearance-settings.spec.ts:84`）で名前の入力のダイアログが開くことを確かめて閉じる（対照）。次に、ドラッグ中に同じキー操作 → ダイアログが開かず、prefix の表示も出ない。`Escape` で取り消して離す。端末へ文字が届かないことは、単体 T2 (5) が見る（ドラッグ中のフォーカスは tab のボタンにあり、E2E では実装の有無を見分けられない）。
      (7) あふれ（AC3）: 画面の幅は **800px 以上**（768px 未満はモバイルの 1 列の画面になり、tab バーが出ない。`packages/web/src/mobile/detect.ts:4`）。長いラベル（20 文字ほど）の tab を、列があふれる数（`.tab-bar-tabs` の `scrollWidth > clientWidth` をブラウザで確かめる）だけ作る。先頭の tab をつかんで列の右端の内側 10px へ動かして止める → `scrollLeft` が増えていき、最後の tab の右端が列の中に入るまで `expect.poll` で待つ → 最後の tab の右半分へ動かして離す → 先頭だった tab が末尾。
      (8) tab バーを「下」に（AC4）: `addInitScript` で `soda.prefs.v1` に `tabBarPosition: "bottom"` を入れる（または設定ダイアログの「tab バーの位置」の `select.settings-select`。`SettingsDialog.vue:1089`）。`.tab-bar-bottom` を待ってから、(1) と同じドラッグを 1 回 → 同じ結果。
      (9) 外からの変化（AC6）: ドラッグ中に、テスト用クライアントからつかんだ tab を `tab.close` → 線・薄さが消え、`mouse.up` で `tab.move` が送られない。ドラッグ中に、テスト用クライアントから別の tab を `tab.move` で動かす → ブラウザのラベルの順が変わるのを待つ → 離す → 「ドラッグが続いて、離した位置へ入った」か「取り消しになって、何も送らなかった」のどちらかで、どちらでも線・薄さが残らず、その後のキー操作（`prefixKey(page, "c")` でダイアログが開く）が効く。Chromium でどちらになったかを spec のコメントに書く。ダイアログが開いたときの取り消しは単体 T2 (9) に任せる。
      (10) 2 つのブラウザ（別のコンテキスト。AC5）: 片方でドラッグして離す → もう片方のラベルの順が、再読み込みなしで同じ順になる。
      (11) タッチ（AC9）: `hasTouch: true` のコンテキストで、tab をタップ → 切り替わる。指のなぞり（CDP の `Input.dispatchTouchEvent` で `touchStart` → `touchMove` → `touchEnd`）→ `tab-bar-dragging` が付かず、`tab.move` が送られない。なぞりを再現できなければ、タップだけにして、始まらないことは単体 T2 (7) に任せる旨をコメントに書く。
      対象: `packages/e2e/src/specs/tab-dnd.spec.ts`（新規作成） / 補助: `packages/e2e/src/support/frames.ts:128` `routeRecordingWebSocket`、`packages/e2e/src/support/fixtures.ts`
      依存: T3
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC-I1, AC-I2, AC-I4, AC-I5

- [ ] T5: docs を合わせる（PR1 の分）。
      - `docs/tui-parity.md`: H04m（34 行目あたり）と M12（120 行目あたり）の「Web版」の列を「無し」から「あり」に。端末版の扱いの列は、今の内容を保って「Web 版も `tab.move` を動かす数だけ送る」を一言足す。
      - `docs/herdr-parity.md`: H04 の行（30 行目あたり）の tab の並べ替えの説明に、20261008-web-tab-dnd で、ブラウザ版でも tab バーの tab をドラッグで並べ替えられるようになったこと（同じ workspace の中だけ・入る位置に線・`Esc` で取り消し・RPC は既存の `tab.move` を動かす数だけ・タッチとモバイルの 1 列の画面は対象外・キー `move_tab_previous`/`move_tab_next` は今までどおり）を足す。「対応 AC」の列にこの作業の AC を足す。
      - `docs/verification.md`: pane の名前のドラッグの項目（376 行目あたり）の近くに、手で確かめる項目を足す: tab を 3 つ以上作り、tab をつかんで別の位置で離す（線の位置に入る・つかんだ tab が選ばれる）／`Esc`・tab バーの外で離すと変わらない／クリック・右クリック・ホイールは今までどおり／あふれるときに端で自動スクロール／別のブラウザに反映／tab バーを「下」にしても同じ／pane の名前を tab へ落とす移動は今までどおり。
      - `docs/tui.md` は端末版の文書なので直さない。
      対象: `docs/tui-parity.md`（H04m・M12 の行）・`docs/herdr-parity.md`（H04 の行）・`docs/verification.md`（「pane の名前」のドラッグの項目の近く）
      依存: T2
      AC: AC10

### PR2: pane の移動の制限

- [ ] T6: protocol の結果に `reason` を足し、判定の純関数を client-core に足す（**独立点検あり**）。design 第 2 部「インターフェース / データ構造」のとおり。
      - `messages.ts`: `PaneMoveBlock`（`"different_worktree"`）の型を足し、`PaneMoveToTabResult`・`PaneMoveToNewTabResult` に `reason?: PaneMoveBlock`。要求のスキーマ（zod）は変えない。
      - `paneMoveScope.ts`: `paneMoveBlock(source, target, opts?)` と `paneMoveBlockMessage(reason)`。`index.ts` から出す。
      単体テスト `paneMoveScope.test.ts`（design の表の全部の行を、`lenient` あり・なしの両方で）:
      (1) 同じ id は、`git`・`cwd` が何でも null。
      (2) 両方に同じ `worktreeKey` → null（`representative` が違っても・`cwd` が違っても〔サブフォルダで開いた〕同じ）。
      (3) 違う `worktreeKey` → `different_worktree`。`repoKey` が同じ（同じリポジトリの本体と linked worktree）でも断る。`cwd` が同じでも断る（片方の先頭の pane が `cd` した場合）。
      (4) 両方 `git: null`: `cwd` が同じ → null、違う → `different_worktree`。末尾の `/` だけが違う（`/a` と `/a/`）→ null。根（`/` どうし）→ null。
      (5) 片方に `worktreeKey`、片方が `git: null`（両方の向き・`cwd` が同じでも）→ `different_worktree`。
      (6) `git` はあるが `worktreeKey` が無い（項目が無い・`null`）workspace が絡む: `lenient` → null、なし → `different_worktree`（相手が `git: null` でも・`worktreeKey` ありでも）。
      (7) `groupId` が同じでも違っても結果は変わらない。文言は空でない。
      `messages.test.ts`: 今ある 2 つの出現（要求のスキーマ）が通ること。
      対象: `packages/protocol/src/messages.ts:369`・`:380`（`PaneMoveToTabResult`・`PaneMoveToNewTabResult`）・`packages/client-core/src/workspace/paneMoveScope.ts`（新規作成）・`packages/client-core/src/workspace/paneMoveScope.test.ts`（新規作成）・`packages/client-core/src/index.ts` / 先例: `packages/client-core/src/workspace/workspaceGrouping.ts:62` `isRepresentative`
      依存: なし
      AC: AC11, AC13, AC14, AC15, AC17

- [ ] T7: `SessionModel` で断る（**独立点検あり**）。新しい状態は持たない。
      - `paneMoveBlockFor(paneId, targetWorkspaceId): PaneMoveBlock | null`（pane・移動元・移動先が実在しなければ null。投げない。client-core の `paneMoveBlock` を `lenient` なしで呼ぶ）。
      - `moveToTab`: `targetTab` の確認の後・書き換えの前に、`this.paneMoveBlockFor(paneId, targetTab.workspaceId) !== null` なら `false`。`moveToNewTab`: `ws` の確認の後、同じく `null`。戻り値の型は変えない。
      単体テスト（`SessionModel.test.ts` に `describe("pane の移動の範囲（20261008-web-tab-dnd）")` を足す。`moveToTab`・`moveToNewTab` の両方で。判定は `updateWorkspaceGit(id, { kind: "git", git: {…} })` で入れる）:
      (1) 同じ `worktreeKey` の 2 つの workspace（代表と、代表でない 2 つ目）の間 → 両方の向きで移る。
      (2) 違う `worktreeKey`（同じ `repoKey` の本体と linked worktree／別の `repoKey`）→ `false`・`null`。移す前と後で、`panes`・`tabs`・`workspaces`・フォーカス（`getFocus()`）が 1 つも変わっていない。`paneMoveBlockFor` は `different_worktree`。
      (3) 判定の無い workspace どうし（`updateWorkspaceGit` を呼んでいない・`unmanaged` を入れた・`unknown` だけを入れた）: `cwd` が同じ → 移る、違う → 断る。
      (4) 片方に判定・片方に無い（`cwd` が同じでも）→ 断る。無い側に同じ `worktreeKey` の判定を入れると移る。
      (5) 同じ workspace の中（別の tab へ・新しい tab へ）は、判定が何でも移る。
      (6) 保存から戻した workspace（復元の作り方は今ある復元のテストにならう）: `worktreeKey` つきで戻したものどうしは、同じなら移り、違えば断る。`repoKey` だけで `worktreeKey` が無いものは断る。
      (7) 抜け道が無いこと: `swapPaneWith`・`moveToEdge`・`replacePane` に、別の workspace の pane を相手として渡しても、何も変わらない（今ある「同じ tab でなければ何もしない」が効いている）。
      既存のテストの直し: 落ちるのは `SessionModel.test.ts:635`・`:759`（`/home/u` と `/home/u/other`）・`:1232`・`:1242`（`/a` と `/b`）——`git: null` どうしで `cwd` が違う workspace の間で移している。ほかの出現（25 のうち残り）も 1 つずつ見る。**期待を変えずに前提を直す**（同じ `cwd` で作る、または両方に同じ `worktreeKey` の判定を入れる）。直したテストの名前と直し方を `test-result.md` に並べる。
      負の対照: (2) のテストが、`moveToTab`・`moveToNewTab` の確認の行だけを外すと落ちることを確かめ、出力を `test-result.md` に貼り、元に戻して差分が無いことを確かめる。
      対象: `packages/server/src/session/SessionModel.ts:918` `moveToTab`・`:949` `moveToNewTab`・`packages/server/src/session/SessionModel.test.ts`
      依存: T6
      AC: AC11, AC12, AC13, AC14, AC15, AC16

- [ ] T8: `SessionService` とハンドラで理由を返す（**独立点検あり**）。
      - `SessionService.paneMoveBlockToTab(paneId, targetTabId)`・`paneMoveBlockToWorkspace(paneId, targetWorkspaceId)`（pane・tab・workspace が無ければ null。投げない）。
      - `pane.ts` の `pane.move_to_tab`・`pane.move_to_new_tab`: 先に理由を問い合わせ、あれば `{ ok: false, reason }` を返して終わり（`sizeAuthority.noteInteraction` を呼ばない）。無ければ今までどおり（実在しない pane への今のエラーも変えない）。
      単体テスト:
      (1) `SessionService.test.ts`: 別の worktree への `moveToTab`・`moveToNewTab` で、bus に 1 つもイベントが出ず、保存の予約（`persist.touch`）も呼ばれない。同じ worktree では今までどおりのイベントの並び。
      (2) ハンドラ（`packages/server/src/surface/methods/` の今あるテストの形で。`pane.move_to_*` のハンドラのテストが無ければ `index.test.ts` に足す）: 別の worktree → `{ ok: false, reason: "different_worktree" }`、同じ worktree → `{ ok: true }`（`move_to_new_tab` は `tab` 付き）、自分自身の tab・存在しない tab・存在しない workspace → `reason` の無い `{ ok: false }`（今までどおり）。
      (3) `packages/cli/src/paneCurrent.integration.test.ts:147`: `cwd` を渡さずに作った 2 つの workspace の間で移している（場所は同じ）。片方だけ判定が入った瞬間は断られる（design「作った直後」）ので、`reason` がある間は少し待って試し直す形に直す（上限の時間つき。固定の待ちにしない）。
      既存のテストの直し: 落ちるのは `SessionService.test.ts:506`・`:538`・`:584`（`/home/u` と `/home/u/other`）・`:964`・`:972`（`/a` と `/b`）。ほかの出現（16 のうち残り）も 1 つずつ見て、T7 と同じく前提を直す。
      対象: `packages/server/src/session/SessionService.ts:1000` `moveToTab`・`:1029` `moveToNewTab`・`packages/server/src/surface/methods/pane.ts:126`・`:136`・`packages/server/src/session/SessionService.test.ts`・`packages/server/src/surface/methods/index.test.ts`・`packages/cli/src/paneCurrent.integration.test.ts:147`
      依存: T7
      AC: AC12, AC14, AC16, AC17

- [ ] T9: ブラウザ版: 落とせない行の見せ方と、知らせ。design 第 2 部「ブラウザ版」のとおり。`PaneFrame.vue`・`view.ts`・`TabBar.vue` は変えない。
      - `Sidebar.vue`: `view.paneDrag` がある間だけ、ドラッグ元の pane の workspace を求め、workspace を持つ行ごとに `paneMoveBlock(移動元, row.workspace, { lenient: true })` を `computed` で持つ（移動元がストアに無ければ、どの行も断らない）。断る行に `sidebar-row-pane-drop-disabled`（新しい CSS: `opacity: 0.45`）。ポインタが上にある行（`view.paneDrag.overWorkspaceId` が一致）は、断らないなら今までどおり `sidebar-row-pane-drop-target`、断るなら `sidebar-row-drop-invalid`（`sidebar-row-pane-drop-target` は付けない）。workspace の並べ替えの「落とせない行」の今の条件は残す。
      - `ActionDispatcher.movePaneToNewTab`: 送る前に `paneMoveBlock(…, { lenient: true })`（移動元・移動先がストアに無ければ確認を飛ばす）。断るなら `view.toast(paneMoveBlockMessage(block))` で終わり。応答が `!r.ok && r.reason` ならトースト。`movePaneToTab`: 応答の `reason` だけトースト。
      単体テスト:
      (1) `Sidebar.test.ts`: `view.startPaneDrag(paneId)` の後、別の `worktreeKey` の workspace の行・`git: null` で `cwd` が違う行に `sidebar-row-pane-drop-disabled` が付き、同じ `worktreeKey` の行・自分の workspace の行・グループの見出しには付かない。`view.setPaneDragOverWorkspace(断る行)` で、その行に `sidebar-row-drop-invalid` が付き `sidebar-row-pane-drop-target` が付かない。断らない行では逆。`view.endPaneDrag()` で全部消える。`git` はあるが `worktreeKey` の無い workspace（古いサーバ）には、どのクラスも付かない（今までどおり落とせる先）。workspace の並べ替えの「落とせない行」の今あるテストが通る。
      (2) `ActionDispatcher.test.ts`: 別の worktree への `movePaneToNewTab` → 要求を送らず、文言のトースト、表示もフォーカスも動かない。同じ worktree・自分の workspace → 今までどおり送る。`worktreeKey` の無い `git` の workspace（古いサーバ）→ 送る。応答 `{ok: false, reason: "different_worktree"}` → トースト、表示は動かない。応答 `{ok: false}`（`reason` 無し）→ トースト無し（今までどおり）。`movePaneToTab` も、応答の `reason` でトースト。今ある 21 の出現のうち、別の workspace へ移すものは、ストアの 2 つの workspace が「同じ `cwd` で `git: null`」か「同じ `worktreeKey`」になっているかを確かめ、なっていなければ前提を直す（期待は変えない）。
      (3) `PaneFrame.test.ts` の今ある 5 の出現と、`Sidebar.test.ts:1993` 付近の今ある pane の落とし先のテスト（ドラッグ元がストアに無い＝どの行も断らない）が、直しなしで通ること。
      対象: `packages/web/src/components/Sidebar.vue:843`〜`844`（行のクラス）・`:1174`〜`1185`（CSS）・`packages/web/src/actions/ActionDispatcher.ts:942` `movePaneToTab`・`:967` `movePaneToNewTab`・`packages/web/src/components/Sidebar.test.ts`・`packages/web/src/actions/ActionDispatcher.test.ts`
      依存: T6
      AC: AC17, AC18

- [ ] T10: 端末版: 断るときの知らせ。design 第 2 部「端末版」のとおり。`mouse.ts`・`TuiApp.ts` は変えない（workspace の行・tab の落とし先の強調は、もともと描いていない。tab バーに並ぶのは表示中の workspace の tab だけ）。
      - `TuiDispatcher.movePaneToNewTab`: 送る前に `paneMoveBlock(移動元の workspace, 移動先の workspace, { lenient: true })`（どちらかがモデルに無ければ確認を飛ばす）。断るなら `ui.toast(paneMoveBlockMessage(block))` で終わり（送らない）。応答が `!r.ok && r.reason` ならトースト。
      - `TuiDispatcher.movePaneToTab`: 送る前の確認は足さない。応答の `reason` だけトースト。
      単体テスト（`TuiDispatcher.test.ts`）: 別の `worktreeKey` の workspace への `movePaneToNewTab` → 要求を送らず、文言のトースト、表示が動かない。同じ `worktreeKey`・自分の workspace → 今までどおり送る。`worktreeKey` の無い `git` の workspace（古いサーバ）→ 送る。応答 `{ok: false, reason: "different_worktree"}` → トースト。応答 `{ok: false}` → トースト無し。`movePaneToTab` も、応答の `reason` でトースト。今ある 6 の出現（`:1336`〜`1349`）と `mouse.test.ts:246` は、`testing/fixtures.ts` の workspace が `cwd: "/"`・`git: null` なので直しなしで通ること。
      対象: `packages/tui/src/actions/TuiDispatcher.ts:942` `movePaneToTab`・`:959` `movePaneToNewTab`・`packages/tui/src/actions/TuiDispatcher.test.ts`
      依存: T6
      AC: AC17, AC18

- [ ] T11: E2E `pane-move-scope.spec.ts` を足す。
      前提: 一時のフォルダに、git のリポジトリ A（1 つコミットする。作り方の先例 `packages/e2e/src/specs/workspace-tab-pane.spec.ts:489` `makePlainRepo`）と、A の linked worktree（`git worktree add`。先例 `workspace-groups.spec.ts`）、別のリポジトリ B、管理外のフォルダ U を作る。起動のときからある最初の workspace は、先に閉じる（先例 `workspace-groups.spec.ts:252` `dropInitial`）。テスト用クライアントで workspace を作る: A を 2 つ（A1・A2。同じフォルダ）、A の worktree を 1 つ（AW）、B を 1 つ、U を 2 つ（U1・U2）。**判定が入ったことはブラウザで待つ**: 既定の行の並びでは、同じフォルダの 2 つ目（A2）や単独のリポジトリ（B）の行にブランチ名が出ず、判定の前後で見た目が変わらない（`packages/web/src/components/Sidebar.vue:162`、`packages/client-core/src/sidebar/rowLayout.ts:85`）。そこで、`addInitScript` の prefs でサイドバーの行の並び（`sidebarRows`）の spaces の 1 行目に `branch` のトークン（`packages/client-core/src/sidebar/resolveRows.ts:92`。判定があれば常に出る）を足し、A1・A2・AW・B の行にブランチ名が出るのを待ってから操作する。U1・U2 は判定の前後で結果が同じ（design の表の 3・5）なので待たない。pane の名前を出す: `addInitScript` で `soda.prefs.v1` に `paneAgentNameVisible: true`（prefs の入れ方の先例 `workspace-groups.spec.ts:223`〜`237`）、テスト用クライアントで移動元の tab を `pane.split` で 2 pane にし、動かす pane に `pane.rename`（`.pane-frame-name` を待つ。先例 `appearance-settings.spec.ts:211`〜`240`）。`routeRecordingWebSocket(page)` で送った要求を記録し、ドラッグの直前との差で数える（(5) だけは使わない）。動かす pane のある workspace を表示していること（サイドバーの行をクリックして、その行が選ばれるのを待つ）を、ドラッグの前に確かめる。
      (1) 見せ方（AC18）: A1 の pane の名前をつかんで 12px 動かした時点で、AW・B・U1・U2 の行に `sidebar-row-pane-drop-disabled` があり（`opacity` が 1 未満であることも `getComputedStyle` で見る。カーソルの形は見ない）、A1・A2 の行には無い。B の行の上へ動かす → `sidebar-row-drop-invalid` があり、`sidebar-row-pane-drop-target` が無い。A2 の行の上へ → `sidebar-row-pane-drop-target`。`Escape` → 全部のクラスが消える。
      (2) 断る（AC12・AC18）: A1 の pane を B の行で離す → トースト「別の worktree の workspace へは移せません…」が出て、`pane.move_to_new_tab` が 1 つも送られておらず、表示中の workspace・tab・pane の数が変わらない。同じリポジトリの別の worktree（AW）の行で離しても同じ。
      (3) 移せる（AC11）: A1 の pane を A2 の行で離す → `pane.move_to_new_tab` が 1 つ送られ、表示が A2 の新しい tab に移り、動かした pane の名前がそこにある。
      (4) 管理外（AC13）: U1 を表示し、U1 の tab を 2 pane にして名前を付けておく。U1 の pane を U2 の行で離す → 移る。U1 の pane を A1 の行で離す → 断られる（トースト・要求なし）。
      (5) サーバで断ること（画面の確認を通らない入口。AC12・AC16・AC17）: **別のテストにし、`routeRecordingWebSocket` を使わず、`watchReceivedEvents(page)`（`frames.ts:82`。CDP。`page.routeWebSocket` の下では使えない）でブラウザが受けたイベントを数える**（`routeRecordingWebSocket` の `frames` はバイナリしか記録しない。`frames.ts:145`）。テスト用クライアントから直接 `pane.move_to_new_tab`（A1 の pane → B）と `pane.move_to_tab`（A1 の pane → B の tab、A1 の pane → AW の tab）→ どれも `{ok: false, reason: "different_worktree"}`。その間、**ブラウザが受けたイベント**に `pane.updated`・`tab.created`・`layout.updated` が増えておらず、ブラウザのサイドバー・tab バーが変わらない。対照として、同じ呼び方で A1 の pane → A2 の tab は `ok: true` で、ブラウザにイベントが届く（「増えていない」が空振りでないことを、同じ数え方で示す）。
      (6) 同じ workspace の中（AC15）: pane の名前を、同じ workspace の別の tab へ → 今までどおり移る（`pane.move_to_tab` が送られ、その tab に pane がある）。自分の workspace の行へ落とす → 新しい tab へ切り出される。
      対象: `packages/e2e/src/specs/pane-move-scope.spec.ts`（新規作成） / 補助: `packages/e2e/src/support/frames.ts:128` `routeRecordingWebSocket`・`:82` `watchReceivedEvents`
      依存: T8, T9
      AC: AC11, AC12, AC13, AC15, AC16, AC17, AC18

- [ ] T12: docs を合わせる（PR2 の分）。書く中身: pane を別の workspace へ移せるのは、同じ worktree（同じフォルダ。worktree グループの代表を決めるのと同じ `worktreeKey`）の workspace の間だけ／同じリポジトリでも別の worktree へは断る（一覧の行と中身がずれるため）／管理外・判定前の workspace どうしは、開いた場所が同じときだけ／同じ workspace の中（tab の間・新しい tab・分割・置き換え）は今までどおり／pane の中で `cd` して別の worktree へ移るのは対象外（今までどおり）／断るときの応答は `{ok: false, reason: "different_worktree"}`（古い画面は黙って何もしない）／作った直後に続けて移すスクリプトは、`reason` がある間、待って試し直す／利用者が作るグループ・worktree グループは単位にしない／ブラウザ版はドラッグ中、落とせない行が薄くなり、落とすと理由が出る。端末版は落とすと理由が出る／管理外の workspace の場所は文字列で比べる（リンク経由の別の書き方は別の場所になる）／落とせる相手が畳んだグループの中にあるときは、広げてから落とす。**以前（20260924-pane-move-cross-tab）は、どの workspace の行へも落とせた**ことと、変わった点が分かるように書く。
      - `docs/herdr-parity.md`: H41 の行（78 行目あたり）。herdr との違いとして書き、「対応 AC」にこの作業の AC を足す。
      - `docs/tui-parity.md`: H41（92 行目あたり）・W03（130 行目あたり）。
      - `docs/tui.md`: 「マウス」の pane の名前のドラッグの行（183 行目あたり）。
      - `docs/sodactl.md`: 「pane は別の tab・workspace へ移せ」とある所（701 行目あたり）と 934 行目あたり。
      - `docs/verification.md`: 手で確かめる項目（T11 の (1)〜(4) と同じ操作。端末版でも）。
      対象: `docs/herdr-parity.md`（H41）・`docs/tui-parity.md`（H41・W03）・`docs/tui.md`（「マウス」）・`docs/sodactl.md`（701・934 行目あたり）・`docs/verification.md`
      依存: T8, T9, T10
      AC: AC19
