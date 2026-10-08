# 調査: 表示の面の配置と状態（ブラウザ版）

調べた日: 2026-10-08。**読んだのは、PR3（`script-html`。#99）が入った main（`1ff0418`）**。初めは PR3 の途中の版（`96ed5fb`）で書き、マージの後で、main に合わせ直した（変わったのは、フォーカスの脱落の戻し〔G5〕・設定〔G8〕・tab の D&D〔F22〕。`decisions.md` D20）。
行番号は、main（`1ff0418`）のもの。**実機で動かして確かめたものは無い**（コードと記録を読んだだけ。確かめていない前提は、末尾の「実測していない前提」）。

## いまの作り（PR3 の後）

### 部品と配置

- F1: pane の枠は `packages/web/src/components/PaneFrame.vue`。`enabled` のとき、本体は `div.pane-frame-body.pane-frame-body-displays`（縦の flex）で、
  上から `PaneBands`（`v-if="hasBand"`）、`div.pane-frame-row`（横の flex。`div.pane-frame-main` に `<slot />`＝端末、右に `PanePanel`〔`v-if="hasPanel"`〕、ドラッグ中の案内の線）（:339-347）。
  **`<slot />` の位置は、面の有無で変えない**（葉＝端末を作り直さないため。:339 の注釈と `PaneFrame.test.ts:776`）。
- F2: パネルは `PanePanel.vue`。pane ごとに 1 つで、右に固定。見出し（固定のラベル `displayLabel`・印「スクリプト」・［操作する］・［操作を終える］・［たたむ］・［×］）、複数ならタブ（選んでいる 1 枚だけ `DisplayFrame` を載せる。:189）、
  左の縁に幅のつまみ（`useResizeDrag`。ドラッグの間は案内の線だけ・離したとき 1 回確定。:47-69）。たたむと **幅 24px の縦の見出し**（`v-if="folded"`。:148-159）になり、`DisplayFrame` は外れる。
- F3: 帯は `PaneBands.vue`。端末の上に縦に積む。1 本の行は左から、印「▍表示」・印「スクリプト」・枠・［操作する］／［操作を終える］・［×］（:36-57）。高さの合計が pane の 3 分の 1 を超える分は「ほか N 件」の 1 行（`visibleBands`）。**たためない・下に置けない**。
- F4: 枠は `DisplayFrame.vue`。iframe は `:key="gen"`、合い札・待ちの時計は setup で用意する（:481-482）。**`onLoad` は、2 回目の `load` で必ず `closeAndReport("navigated")`**（:164-173。面はサーバごと閉じ、
  `script-html` の面なら、その pane は 5 分の冷却に入る。`DisplayService` の決まり）。
- F5: 置く側は、`:key="frameKey(info)"`（`display/framePage.ts:45-49`。`<id>:<形式>`、スクリプトは `<id>:script-html:<rev>`）で `DisplayFrame` を載せる。**たたむ・タブの切り替え・tab と workspace の切り替え・分割・拡大（zoom）は、
  どれも iframe を動かさず、部品を外して作り直す**（`PaneLayout.vue:194-206` が葉を `v-if`・`:key` で作り直す。`KeepAlive`・`v-show` は無い）。スクリプトの面の状態は、そのたびに消える（中身はストアに残っているので、描き直される）。
- F6: **「iframe の親を替える・兄弟の中で順を替えると、読み込み直しになって `load` がもう 1 回起きる」ことを確かめた記録は、この木に無い**（`moveBefore`・付け替え・reparent の記述 0 件）。今の実装は動かさない作りなので、問題になっていない。
  一般に、ブラウザは iframe を文書から外して入れ直すと読み込み直す。この作業は「動かさない」を決まりにして、E2E で `data-display-loads`（:564）が 1 のままであることを見る。
- F7: 知らせ（`Toast.vue`）は、表示の面が 1 つでも出ていると右下へ寄る（PR3 の直し。右上だと、面の見出し〔固定のラベル・印・［操作する］〕に重なるため）。`position: fixed`・`z-index: 950`。
- F8: モバイル（幅 767px 以下。`mobile/detect.ts:4`）は、`MobileShell.vue` が帯を自分で描き（:117。`PaneBands` を上部バーの下に置く）、パネルは `MobileDisplaySheet.vue`（`<dialog>` の `showModal()`）。`PaneFrame` は `enabled=false`。

### 状態と設定

- F9: `store/display.ts`。`collapsed`（pane の id の `Set`。**保存しない**。:30-31）、`activePanel`（pane → 面の id。保存しない）、`panelWidths`（pane → px。`soda.prefs.v1` の `displayPanelWidths`。64 件・古い順に捨てる・
  もう無い pane の分は `pruneWidths` が接続のたびに捨てる〔`DisplayController.ts:79-80`〕）。
- F10: `soda.prefs.v1`（`localStorage`）の読み書きは `store/view.ts` の `readPrefs`・`writePrefs` だけ。`writePrefs` は共有の設定（サーバ）へも送るが、**`DEVICE_LOCAL_PREF_KEYS`（`packages/protocol/src/messages.ts:810-819`）の項目は送らない**
  （web の `isDeviceLocalPref`・サーバの `PrefsStore.ts:45-57` の両方で落とす）。`displayPanelWidths` はここに入っている。
- F11: 共有の設定（`SharedPrefs`。`messages.ts:753-801`）に `displayScriptEnabled` がある。設定の画面では、節「端末」の最後の行（`SettingsDialog.vue:1242-1259`）。3 択以上の書き方は `fieldset` ＋ radio（`paneBorders`。:1033-1045）か `<select>`（`tabBarPosition`。:1091-1096）。
  設定を 1 つ足すときに触るのは: `protocol` の `SharedPrefs`・`client-core/src/prefs/load.ts`（読みと正規化）・`web/src/store/settings.ts`・`store/prefsApply.ts`・`actions/ActionDispatcher.ts` の `reloadConfig`（:1510-1547）・`SettingsDialog.vue`・各テスト。端末版は `tui/src/settings/sections.ts`（ブラウザだけの項目は `BROWSER_ONLY` の注記）。

### プロトコルと sodactl

- F12: `packages/protocol/src/display.ts`。`DisplaySetBody`（`name`・`kind`・`format`・`content`・`title?`・`size?`・`ttlMs?`）、`DisplayInfo`（`id`・`paneId`・`name`・`kind`・`format`・`title`・`size`・`rev`・`bytes`・`updatedAt`）。
  `checkDisplaySet` は**知らない項目を落とす**。`readDisplayInfo`（:390-408）は、知っている項目の型だけを見て、**知らない項目を持つ値をそのまま通す**。
- F13: `/ws` の `display.set` の schema は `z.object({ paneId, ...displaySetFields })`（知らない項目は落ちる）。**受け口（`pane.sock`）の schema は `z.strictObject(displaySetFields)`**（`messages.ts:585`。知らない項目があると断る）。
  → 古いサーバへ新しい項目を送ると、`/ws` では黙って落ち、受け口では誤りになる。sodactl は、`script-html` と同じく、**送る前に `display.features` を見る**必要がある（`commands/display.ts:330-331`）。
- F14: 機能の名乗り。`DISPLAY_FEATURES`（sodactl とサーバ）、`DISPLAY_RENDER_FEATURES = ["panel","band","actions","script-html"]`（画面が `display.subscribe` で名乗る）、`DISPLAY_RENDER_FEATURES_MAX = 8`。
  `DisplayService.subscribe` は知らない種類を黙って捨て、`renderers()`（`DisplayService.ts:487-498`）が種類ごとに数える。`DisplayRenderers` は知らない項目を通す。
- F15: サーバは、面の配置・たたみを何も持たない（`size` だけ）。面は保存しない（再起動・`soda handoff` で消える）。

### キー・メニュー・ドラッグ

- F16: `focus_display`（`prefix+i`）。`client-core/src/keys/bindings.ts:492-500`、web は `ActionDispatcher.ts:1045-1068`（選んでいるパネル → 無ければ最初の帯。たたんであれば戻す。届かなければモバイルの重ね表示）。
  既定のキーで、`prefix+shift+i` は空いている（`bindings.ts` の既定の一覧に無い）。操作を 1 つ足すと、件数を固定したテスト（`bindings.test.ts:45`・`KeySettings.test.ts`・`TuiDispatcher.test.ts:213`）と、端末版の `TuiDispatcher.run` の case が要る。
- F17: メニューは `ContextMenu.vue`（`position: fixed`・`z-index: 1000`。項目は `{label, run}` だけで、**入れ子・区切り・チェックの印は無い**。`:key="item.label"` なのでラベルは一意）。pane のメニューに「表示をすべて閉じる」（:73）。
  開くのは `actions.openContextMenu(target, at)`。
- F18: pane の D&D は `PaneFrame.vue:144-247`。**つかむのは pane の名前のラベル（`.pane-frame-name`）だけ**。閾値 6px・`setPointerCapture`・`Esc`・ダイアログが開いたら取り消し（`view.modalOpen` の watch。:255-260）。
  落とし先は `document.elementFromPoint` → `closest("[data-pane-id]")` と `zoneAt`（縁 30%・中央）。落とせる場所は `.pane-frame-zone`（`pointer-events: none`）。状態は `view.paneDrag`。
- F19: 境目のドラッグは `composables/useResizeDrag.ts`（左ボタンだけ・フォーカスを移さない・rAF で 1 回にまとめる・`Esc`・ダブルクリックで既定へ・`finish()`）。`PanePanel` の幅のつまみは、ダイアログが開いたときの `finish()` を呼んでいない（`Sidebar`・`Splitter` は呼ぶ）。
- F20: 画面の中で、**位置と大きさを利用者が動かせる浮いた窓の先例は無い**。近いのは `CommandPopup.vue`（モーダル・動かせない）。

- F22: main に、**tab のドラッグでの並べ替え**（`TabBar.vue`。`20261008-web-tab-dnd`）と、**pane を別の worktree の workspace へ移せない制限**（`Sidebar.vue` の、落とせる行の強調と、落とせない行を薄くする表示。pane の名前のドラッグ〔`view.paneDrag`〕の間だけ）が入った。どちらも、パネルの見出しはつかまない。

### 重なりの順

- F21: `z-index` の値。メニュー 1000・知らせ 950・`CommandPopup`／再接続 900・xterm のスクロールバー 11（`xterm.css:245`）・`.pane-frame-edge-flush` のフォーカスの線 12・案内の線 3・パネルのつまみ 2・覆い 1。
  ダイアログ（設定・ask・確認など）は `<dialog>` の `showModal()`（top layer）。`.pane-layout-side` は `isolation: isolate`（分割の子ごとに重なりの文脈が閉じる。`PaneLayout.vue:267`）。単一 pane の葉には掛からない。
  `.pane-frame-zone`・`.pane-frame-name` は `z-index` を持たず、DOM の順で端末の上に出る。

### PR3 の守り（弱めてはいけないもの）

- G1: **`load` は 1 回だけ**（F4）。2 回目は、理由を問わず「移った」。
- G2: **固定のラベルと印**。`displayLabel`（`display/displayLabel.ts`）と `DisplayScriptMark.vue`（印「スクリプト」・［操作する］・［操作を終える］）は、枠の外の、アプリの DOM。`info.format` から決める。
- G3: **覆いと、操作を始める入口**。スクリプトの面は、［操作する］と `prefix+i` で始めるまで、覆い（`.display-frame-cover`）の下（`engageEntry.ts`。枠・覆いを押しても始まらない）。
- G4: **フォーカスの番**。操作中でないのに枠がフォーカスを取ったら、元の場所へ戻して、サーバへ知らせる（pane ごとに 3 回で、その pane のスクリプトの面を全部閉じて 5 分の冷却）。部品が外れるときにも見る（`DisplayFrame.vue:497-503`）。
- G5: **フォーカスの脱落の戻しと、その画面だけの遮断器**（`display/focusDrop.ts`・`focusOrigin.ts`。`20261007-soda-extensions/decisions.md` D38・D39）。スクリプトの枠が 1 つ以上載っているあいだ、25ms の見回り・`focusout`（`relatedTarget` なし）・窓の `blur`／`focus` のたびに、**状態を持たずに**見る:
  `activeElement` が `body`（か無し）・文書がフォーカスを持つ・操作中の枠が無い → **理由を問わず**、最後にフォーカスのあったアプリの要素（枠・覆い・［操作する］でない要素。Shadow DOM の中も。無い・外れた・隠れているなら、選んでいる pane の端末。modal のダイアログが開いていれば、その外へは出さない）へ戻す。
  **「利用者が自分で外した」「直前の要素が消えた」の免除は無い**。実際に `body` から動かせた戻しは、**すべて数える**（枠ごとの番が戻した分も同じ数に入る）。**3 秒に 15 回**で、その画面のスクリプトの枠をすべて DOM から外し、固定の文言と［再開］を出す（サーバへは知らせない）。10 秒に 5 回で、知らせ（トースト）。
  → **アプリ自身の操作でも、フォーカスが 25ms 以上 `body` に居れば、1 回の戻しとして数えられる**。この作業の操作（たたむ・開く・置き場所の変更・メニュー・キーのモード）は、フォーカスを `body` に落とさない作りにする（design「たたむ・開く」）。
- G8: **スクリプトが動く表示は、設定で有効にしたときだけ**（共有の設定 `displayScriptEnabled`。既定は無効。D36）。無効のとき、`DisplayFrame` は枠を作らず、固定の文言「スクリプトが動く表示は、設定で無効になっています」を出し、印・［操作する］も出さない。遮断器の後は、固定の文言と［再開］（どちらも、枠の箱の中の、アプリの DOM）。
- G6: **知らせが見出しに重ならない**（F7）。
- G7: 枠からアプリへの知らせは、`readFrameMessage`（`display/frameMessages.ts`）が通す決まった種類だけ（`pong`・`rejected`・`failed`・`action`・`key`・`foreign-focus`・`rendered`）。**大きさ・位置・配置に関わる種類は無い**。

## 端末版（引数なしの `soda`）

端末版は、いまは表示の面を描かない（`docs/tui-parity.md:161` の W34。`display.subscribe` を呼ばない。`prefix+i` は「ブラウザで使えます」）。利用者の決定（`20261007-soda-extensions/decisions.md` D8）で
「端末版にもパネルを出す。作業は分ける」。**この作業の途中で、利用者が端末版も対象に入れた**（2026-10-08）。端末版は「面を描くこと」から作るので、別の work（`20261008-display-tui`）に切り出し、調べた事実はそちらの `research.md` に書く（`decisions.md` D2）。

## 実測していない前提

- U1: iframe を DOM の中で動かしたとき（親の付け替え・兄弟の順の入れ替え）に、Chromium で `load` がもう 1 回起きるか。**起きる前提で設計する**（起きなくても、作りは変えない）。T10 の E2E が、配置の変更・たたむ／開く・窓の重なりの入れ替えで `load` が増えないことを見る。
- U2: `position: absolute` の窓の位置・大きさを style で変えるだけなら、中の iframe は読み込み直さない。**変えない前提**（T25 の E2E で見る）。
- U3: `document.elementFromPoint` が、iframe の上では iframe の要素を返す（pane の D&D の落とし先の判定が、浮いた窓の上でも `closest("[data-pane-id]")` で pane を見つける）。今のパネルの上で動いているので、同じ前提。
- U4: ポインタを捕捉している間、iframe の上を通っても `pointermove` が捕捉した要素へ届く（幅のつまみで既に頼っている）。浮いた窓の移動と大きさの変更でも同じ前提。念のため、ドラッグの間は枠に `pointer-events: none` を当てる。
- U5: Firefox・Safari・実機。今までどおり Chromium だけで確かめる。
