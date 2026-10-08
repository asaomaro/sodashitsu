# タスク: 表示の面の配置と状態（ブラウザ版）— たたみの記憶・帯の上下・帯の行のボタン・パネルの上下左右と D&D・浮いた窓

実装するのは、この文書を読む別のエージェント。**読む順**: この `tasks.md` → `design.md`（型・割り付けの決まり・部品の木・フォーカスの行き先の表・重なりの値・「PR3 の守りとの関係」の表は、そこが正）→ `requirements.md`（AC の本文）→ `research.md`（今の作りの F・守りの G・未確認の U）。
`decisions.md` の D1 が利用者の決定、D3 が「枠を動かさない」の理由、D15 が「押してもフォーカスを取らない部品」の理由、D5〜D13 が、勧める案で書いた点（実装の前に、利用者の答えで変わりうる。変わったら、監督のセッションがこの文書を直す）。

**前提**: PR3（`feature/ext-display-script`。スクリプトが動く形式）が main にマージされていること。マージ前に始めない（同じ部品 `PanePanel.vue`・`PaneBands.vue`・`PaneFrame.vue` を変えるため）。行番号は、PR3 の後の木のもの（`research.md` の冒頭）。
**範囲の外（差分を出さない）**: 端末版の面の描画（`20261008-display-tui`）・`mobile/MobileShell.vue`・`DisplayFrame.vue`・`DisplayScriptMark.vue`・`display/engageEntry.ts`・`focusGuard.ts`・`focusOrigin.ts`・`focusDrop.ts`・`frameMessages.ts`・`frameRegistry.ts`・`packages/web/public/display-view/*`・`20261007-soda-extensions`／`20261007-ext-host` の文書。
`mobile/MobileDisplaySheet.vue` は、枠の `:key` の行と、その import の行だけ。

## PR の分け方

見込みの差分は 80 ファイル前後（テスト込み）なので、**PR を 3 つに分ける**。順に積み、先の PR だけで使える。

| PR | 中身 | タスク | これだけで出来ること |
|---|---|---|---|
| **PR-A: 状態の記憶と既定・帯・帯の行のボタン** | プロトコルの 3 項目（`dock`・`edge`・`collapsed`）・sodactl・設定 3 つ・記憶・割り付けの関数（帯とトレイ）・帯をたたむ／上下・トレイ・表示のメニューとキー・知らせの位置 | T1〜T12 | たたみが覚えられる・初めの状態を設定で選べる・帯をたためて上下に置ける・たたんだ面を帯の行のボタンから開ける（パネルは、まだ右だけ。`--dock` は受け取るが、右に出る） |
| **PR-B: パネルの上下左右と D&D** | 割り付けの 4 つの側・`PanePanel` の側・各側のつまみ・D&D・メニューと設定の置き場所 | T13〜T20 | パネルを上・下・左・右に置ける（D&D・メニュー・設定・`--dock`） |
| **PR-C: 浮いた窓** | 窓の矩形と重なりの関数・`DisplayFloat`・移動と大きさ・キーボード・D&D の中央 | T21〜T27 | パネルを浮いた窓にできる |

- aidev の work は 1 つ（この `tasks.md`）。ブランチは `feature/display-layout` から、PR ごとに切る（例: `feature/display-layout-a-state`・`-b-dock`・`-c-float`。B は A の上、C は B の上）。
- **独立レビュー（差分全体。実装とは別のコンテキスト）は、PR ごとに掛ける**。`aidev` の test・review・deliver を PR ごとに回すか、PR-B・PR-C を別の work に切り出すかは、監督のセッションが決めて `decisions.md` に書く（勧める: PR-B・PR-C を始める前に `aidev new` で別の work に切り出し、該当のタスクを写す）。
- **どの PR のレビューでも見ること**: 上の「範囲の外」のファイルに差分が無い・`DisplayFrame` を置く `:key` が、すべて `placedFrameKey` を通っている・枠（iframe）を持つ `v-for` が並べ替えをしない・押してもフォーカスを取らない部品（`preventDefault`・`@mousedown.prevent`）に、すべて `data-display-keepfocus` が付いている。

## 実装方針

各 PR の終わりで `pnpm build`・`pnpm typecheck`・`pnpm test` が通る状態にする（実装のセッションが 1 回流して報告する。二重に流さない）。

- **PR-A**: protocol（T1）→ server（T2）→ sodactl（T3）→ 設定（T4）→ 記憶（T5）→ 割り付けの関数（T6）→ 部品（T7）→ メニューとキー（T8）→ 知らせ（T9）→ E2E（T10）→ 文書（T11）→ 負の対照（T12。test 工程）。
- **PR-B**: 割り付けの 4 つの側と落とせる場所の関数（T13）→ 部品の側（T14）→ つまみ（T15）→ D&D（T16）→ メニュー・設定・名乗り（T17）→ E2E（T18）→ 文書（T19）→ 負の対照（T20）。
- **PR-C**: 矩形と重なりの関数（T21）→ 窓と層（T22）→ 移動・大きさ・キーボード（T23）→ D&D の中央（T24）→ E2E（T25）→ 文書（T26）→ 負の対照（T27）。

計算（割り付け・導出・矩形・重なりの並び・落とせる場所・知らせの位置）は、純粋な関数にして単体テストする。部品は、その結果を描くだけにする。

独立点検（`aidev taskcheck`）は、壊れやすいタスク（プロトコル・記憶と復元・割り付けや順の計算・安全に関わるもの）だけに掛ける: **T1・T2・T3・T5・T6・T7・T8・T9・T13・T14・T16・T21・T22・T23**（各タスクの末尾に `点検: あり`）。
設定・つまみ・E2E・文書のタスクには掛けず、PR ごとに、その PR のタスクが終わった後で `cross` を 1 回掛ける（AGENTS.md「点検とテストの掛け方」）。

## 作業順序と依存関係

下の `依存:` に従う。補足（不確かな点と、だめだったときの扱い。結果は `decisions.md` に 1 行残す）:

1. **U1（iframe を動かすと `load` が増えるか）** → 作りは「動かさない」（置き場所ごとに、テンプレートの別の位置に `v-if` で置く。同じ `v-for` の中で順を替えない）。E2E（T10・T18・T25）は、`data-display-loads` が 1 であることに加えて、**「変えた面の枠の要素は、前の要素と別（前の要素の `isConnected` が偽）・変えていない面の枠の要素は、前と同じ要素（`isConnected` が真のまま）」**を見る（先例: `display-script-nav.spec.ts:75-79`）。
   負の対照（T12 c・T20 a・T27 c）は、「1 つの入れ物・1 つの `v-for` で、順を入れ替える」版で、**変えていない面の枠が動く**ことを起こす。そのブラウザで `load` が増えなければ（読み込み直さない）、「`load` が 1」の項目は落ちないので、その事実を `test-result.md` に書き、「同じ要素のまま」の項目で判定する。
2. **U3・U4（iframe の上の `elementFromPoint`・ポインタの捕捉）** → T18（D&D）・T25（窓の移動）。だめなら、ドラッグの間、面の枠の上に透明な覆いを置く（`soda-display-dragging` のときだけ）。
3. **`div.pane-frame-center` を足すと、既存の E2E・単体が、端末の祖先の形に依っていないか** → T7 の最初に、`.pane-frame-row > .pane-frame-main` を見ているセレクタ（`grep -rn "pane-frame-main\\|pane-frame-row" packages`）を確かめる。依っていれば、セレクタを直す（端末の作り直しは起こさない）。
4. **メニューを閉じた後のフォーカス** → T8。`ContextMenu` は、開く前の `activeElement` を覚えて、閉じるときに `focus()` する（`ContextMenu.vue:41-46`・`:216-217`）。端末・見出しの［⋮］・トレイから開いたときは、それで足りる。
   **枠（iframe）にフォーカスがあるときに開く場合は、開く前に端末へ移す**（design「たたむ・開く」）。項目の処理は、`ContextMenu` がフォーカスを戻した後に `withDisplayChange` を呼ぶ。
5. **押してもフォーカスを取らない部品・覆いと、PR3 のフォーカスの番**（`decisions.md` D15）→ T7 の `installKeepFocusRelease`。T10 (7) の E2E で、操作中に部品・別の面の覆いを押しても `focus_steal` が送られないことを見る（聞き手の登録の順が `DisplayFrame` の聞き手の前でも後でも、同じタスクの中で端末へ移るので、1 拍後の確認の時点では枠に無い＝成り立つ見込み。2 回目の独立点検が、イベントの順を追って確かめた。動かしては、まだ確かめていない）。
   **送られたら**、聞き手の登録を `window` の capture にする。それでもだめなら、監督のセッションへ知らせる（`DisplayFrame.vue` を変える判断は、実装のセッションでしない）。

## リスク / 留意点

- **枠を動かさない**（`decisions.md` D3）。`DisplayFrame` を置く場所は、置き場所ごとにテンプレートの別の位置にする。同じ `v-for` の中で、面の順を入れ替えない（窓の重なりは `z-index`）。`Teleport` で枠を別の場所へ送らない。
- **`DisplayFrame.vue` を変えない**。フォーカスの始末は、置く側（`withDisplayChange`・`installKeepFocusRelease`）で、`frameRegistry` の `endEngageFrame` と `DisplayHost.focusTerminal` を使う。
- **記憶を書くのは、利用者の操作だけ**。自動のたたみ・丸め・プログラムの指定・アプリの都合で書かない。**書くときは、全項目**（design「記憶」の `writeFace`）。
- **端末の大きさ（`client.view`）を送りすぎない**。つまみのドラッグの間・浮いた窓の操作では、葉（端末）の箱を変えない。
- **たたみは、pane 単位から面単位に変わる**（今は、pane のパネルを全部まとめてたたむ。新しい作りは、選んでいる 1 枚だけ）。たたんだときの幅 24px の見出し（`data-pane-panel-unfold`）は無くなる。これに依る既存のテストは、**弱めない形で**直す（T10 (9) と T7 の「対象:」に一覧）:
  `display-flows.spec.ts:63-81`（2 枚出して 1 枚をたたみ、列数が増えるのを待っている → 2 枚ともたたんで列数が戻る・トレイにボタン 2 つ）・`:267-268`（自動のたたみで `[data-pane-panel-unfold]` が無効・幅 24 → トレイの押せないボタン・`[data-pane-panel]` が 0 件）・
  `display-script-nav.spec.ts:76-78`（fold → unfold → ［たたむ］→ トレイのボタン）・`PanePanel.test.ts:44-49`・`:82`・`:109`・`ActionDispatcher.test.ts:2927-2933`。
- 既定（設定を変えない・指定なし）では、今までと同じ場所・同じ印で出ること。**今の印は、同じ名前・同じ意味で残す**: `data-pane-panel`（根）とその `data-display-engaged`・`data-pane-panel-label`・`-fold`・`-close`・`-tab`・`-title`・`-engaged-note`・`-ring`・`-resize`・`data-pane-bands`・`data-pane-band`・`data-pane-band-mark`・`-close`・`data-pane-bands-more`・`data-pane-frame-main`・`data-pane-frame-guide`（helper `support/displayScript.ts:9-12`・`displayBrowser.ts:13-14` が使う）。
- 件数を固定したテストは、操作 `display_menu` で 1 増える: `bindings.test.ts:45`（62）・`:54`（`pane` の群れ 30）・`keymap.test.ts:78`・`:83`（50）・`KeySettings.test.ts:77`・`:822`・`:846`（70）・`TuiDispatcher.test.ts:207`・`:213`（62）。
- ログ・`console` に、面の中身・題を書かない（今の決まり）。

## テスト方針

- **単体（vitest）**
  - protocol: `checkDisplaySet`（`dock` は panel だけ・`edge` は band だけ・知らない値・`collapsed: false` は載らない）・`displaySetFields`（受け口の `strictObject` が 3 項目を通し、ほかを断る）・`readDisplayInfo` が 3 項目つきの値を通す・定数の値。
  - server: `set` が 3 項目を見出しに載せる・省いた `set` で消える・`renderers()` の 3 種類・`features()` に `layout`・受け口からほかの pane を対象にできない（既存のテストが通る）。
  - cli: 引数の検査（`--dock` と `--kind band` の組など）・古いサーバ（`layout` なし）で 3 項目を外して送り `ignored` が出る。
  - web: `displayPrefs.ts`（読み・検査・上限・末尾へ移す・pane の掃除・`displayPanelWidths` の引き継ぎ・`effective*` の表の全行・`caps`・`writeFace` が全項目を書く・項目の欠けた記憶を捨てる）・`paneDisplayLayout.ts`（決まり 1〜6 の境界: 3 分の 1・トレイの行の出入りとやり直し・浮いた窓のボタンは開いていても出る・両側の縮め方・自動でたたむ順・40 列と 10 行のちょうど・右だけのときに今の `panelWidth` と同じ値）・
    `floatGeometry.ts`（丸め・最小・領域より大きい矩形・8 つのつかむ場所・`raiseFloat`／`insertFloat` の決まり 1〜3）・`dockDrag.ts` の `dockZoneAt`（箱の外・0.22 の境界・角）・`toastSlot.ts`（空きの選び方・空きが足りないとき）・
    `displayOps.ts`（`withDisplayChange` の、フォーカスの行き先の表の全行・`installKeepFocusRelease`）・部品（`DisplayPanelHead`・`DisplayTray`・`PaneBands`・`PanePanel`・`DisplayFloat`: 属性・キー・`placedFrameKey`）・`ContextMenu`（2 つの対象の項目）・`ActionDispatcher`（`focusDisplay` の順・`displayMenu`・モバイルの枝）。
- **E2E（Playwright。実ブラウザ）**: 判定はブラウザの側（DOM・箱・`document.elementFromPoint`・`document.activeElement`・ブラウザが送った `client.view`〔`watchClientViews`〕・`display.*`〔`watchSentDisplay`〕）。`.aidev/conventions/e2e-observe-browser.md`。
  面を出すのは `support/display.ts` の `runDisplay`（pane の中の `sodactl` を模す）。固定時間の待ちだけを根拠にしない。
- **負の対照**（`.aidev/conventions/regression-negative-control.md`。test 工程。T12・T20・T27）: 対策を外した版をビルドし直して、該当の E2E・単体が落ちることを確かめ、生の出力を `test-result.md` に貼る。落ちなければ、テストを書き直すか、理由を記録して別の確かめ方に替える。確かめた後、戻して `diff` で一致を見る。
- **既存のテスト**: `display-*.spec.ts` の 15 本（PR-B・PR-C では、先の PR の `display-layout-*.spec.ts` も）と、`PanePanel.test.ts`・`PaneFrame.test.ts`・`DisplayScriptMark.test.ts`・`DisplayController.test.ts`・`store/display.test.ts`・`displayLayout.test.ts` が通ること（「リスク」に挙げた箇所だけ直す。弱めない）。

## タスク

独立点検（`taskcheck`）を掛けるのは T1・T2・T3・T5・T6・T7・T8・T9・T13・T14・T16・T21・T22・T23。

### PR-A: 状態の記憶と既定・帯・帯の行のボタン

- [ ] T1: protocol に指定の 3 項目と定数を足す: `DISPLAY_DOCKS`・`DISPLAY_EDGES`・`DisplayDock`・`DisplayEdge`・`DisplayDockValue`・`DisplayEdgeValue`・`isDisplayDock`・`isDisplayEdge`。`DisplaySetBody` と `DisplayInfo` に `dock?`・`edge?`・`collapsed?`。`checkDisplaySet` の検査（`dock` は panel だけ・`edge` は band だけ・`collapsed` は boolean で、`false` は載せない）。
      `messages.ts` の `displaySetFields` に 3 項目（`/ws` と受け口の両方に効く。受け口は `strictObject` のまま）。`DISPLAY_FEATURES` に `layout`（サーバの `features()` は、この定数を返すので、ここで入る）、`DISPLAY_RENDER_FEATURES` に `collapse`・`dock`・`float`、`DisplayRenderers` に同じ 3 つ
      （**型に必須の項目を足すので、サーバの `renderers()` の初めの値〔`DisplayService.ts:489`〕に `collapse: 0, dock: 0, float: 0` を、このタスクで足す**。数える処理は T2）。
      `SharedPrefs` に `displayPanelInitial`・`displayPanelDock`・`displayBandEdge`。`DEVICE_LOCAL_PREF_KEYS` に `displayLayout`。**位置・大きさの項目は足さない**。単体テスト（「テスト方針」の protocol）。既存のテストがそのまま通る
      対象: `packages/protocol/src/display.ts`・`display.test.ts`、`packages/protocol/src/messages.ts:497-505`（`displaySetFields`）・`:753-801`（`SharedPrefs`）・`:810-819`、`packages/protocol/src/messages.test.ts`・`paneSocket.test.ts`、`packages/server/src/display/DisplayService.ts:489`、`packages/server/src/persist/PrefsStore.ts:49`（注釈の列挙） / 根拠: design「プロトコル」、research F12〜F14
      依存: なし
      AC: AC7, AC8, AC23
      点検: あり
- [ ] T2: server: `DisplayService.set` が、検査を通った `dock`・`edge`・`collapsed` を `DisplayInfo` に載せる（無ければ項目ごと無い。置き換えの `set` で、省けば消える）。`renderers()` が `collapse`・`dock`・`float` を数える。配置の状態は持たない。
      単体テスト（載る・消える・`list` と `display.updated` に出る・数える・`features()` に `layout`）と、結合テスト（受け口からログインなしで `dock: "bottom"`・`collapsed: true` つきの `set` → 名乗った `/ws` の接続の `display.updated` に 3 項目・`collapse` を名乗った接続が `renderers.collapse` に数えられる・**受け口から、ほかの pane の面は今までどおり触れない**）
      対象: `packages/server/src/display/DisplayService.ts:157-237`（`set`）・`:487-498`（`renderers`）、`DisplayService.test.ts`、`display.integration.test.ts` / 根拠: design「サーバ」
      依存: T1
      AC: AC7, AC8
      点検: あり
- [ ] T3: sodactl: `display set` に `--dock <値>`・`--edge <値>`・`--collapsed`。検査（`--dock` は `--kind panel` だけ・`--edge` は `--kind band` だけ・値は定数のもの。違えば使い方の誤り＝終了コード 2）。
      3 つのどれかが付いていたら、送る前に `display.features` を見て、`layout` が無ければ 3 項目を外して送り、結果に `"ignored": [外した項目]` を足し、stderr に 1 行（終了コード 0）。`--features` の `sodactl.features` に `layout`。`USAGE_LINES`・SKILL.md。
      単体テストと、結合テスト（実サーバ: ログインなしの経路と `/ws` の経路で、`list` に 3 項目が出る）。古いサーバの模しは、`display.features` の応答から `layout` を抜いた偽のサーバで（`script-html` の未対応のテストと同じ形）
      対象: `packages/cli/src/cliArgs.ts:82`（`USAGE_LINES`）・`:759-820`（`display set` の引数）、`packages/cli/src/commands/display.ts:330-331` 付近（機能の確かめ）・`:374-375`（要求の組み立て）、各テスト、`packages/cli/src/display.integration.test.ts`、`packages/cli/skills/sodactl/SKILL.md` / 根拠: design「sodactl」、research F13
      依存: T1, T2
      AC: AC7, AC8
      点検: あり
- [ ] T4: 設定 3 つ（共有の設定）: `loadDisplayPanelInitial`・`loadDisplayPanelDock`・`loadDisplayBandEdge`（知らない値は既定）。`store/settings.ts` に ref と setter（`writePrefs`）と `storage` の追従、`store/prefsApply.ts`、`ActionDispatcher.reloadConfig`。設定の画面の節「端末」（`displayScriptEnabled` の上）に、
      「表示のパネルの初めの状態」（開く／たたむ）と「表示の帯の既定の場所」（上／下）を `fieldset` ＋ radio で（**「既定の置き場所」は、PR-A では画面に出さない**。値の読みと ref は入れておく。T17 で出す）。
      端末版の設定の画面の節「表示」（`displaySection`。`sections.ts:368`）に、**3 項目とも**、`BROWSER_ONLY` の注記つきで出す（端末版は、値を表示・変更できるだけ。効くのはブラウザ版）。単体テスト
      対象: `packages/client-core/src/prefs/load.ts:89` 付近、`packages/web/src/store/settings.ts:163`・`:313-314` 付近、`store/prefsApply.ts:56` 付近、`actions/ActionDispatcher.ts:1518` 付近、`components/SettingsDialog.vue:1242` の前、`packages/tui/src/settings/sections.ts:368` の節（`BROWSER_ONLY` の先例は :404・:413）・`packages/tui/src/model/PrefsModel.ts`（読み）、各テスト / 根拠: design「設定」、research F11
      依存: T1
      AC: AC2, AC4, AC16
- [ ] T5: 記憶と導出: `display/displayPrefs.ts`（`FacePref`・`DisplayLayoutPrefs`・`loadDisplayLayout`〔項目の欠けた記憶は鍵ごと捨てる〕・鍵を作る関数・上限と「末尾へ移す」・pane の掃除・`DISPLAY_DOCK_CAPS`〔PR-A は `["right"]`〕・`effectiveDock`〔`caps` つき〕・`effectiveEdge`・`effectiveCollapsed`〔記憶が無く、置き場所が `float` なら、たたむ〕・`hasFacePref`・右の大きさの `displayPanelWidths` からの引き継ぎ）。
      `store/display.ts` に `layoutPrefs`・`writeFace`（**その時点の導出した値に重ねて、全項目を書く。置き場所は、`caps` で丸める前の値**）・`setFaceCollapsed`・`setFaceDock`・`setFaceEdge`・`setFaceRect`・`setSideSize`・`clearSideSize`・`resetFace`・`pruneLayout`・`activeBySide`・`lastFace`・`layoutRev`・`layoutByPane`（割り付けの結果の写し。書くのは T7 の `PaneFrame`）。
      **今の `collapsed`・`setCollapsed`・`panelWidths`・`setPanelWidth`・`clearPanelWidth`・`pruneWidths` は、このタスクでは触らずに残す**（pane 単位の古い意味のまま。T7・T8 で呼び出しを新しいものへ替えた時点で、消す）。`activePanel`・`activePanelOf`・`setActivePanel` は、モバイルのために残す（消さない）。
      `DisplayController.onOpened` の掃除に `pruneLayout` を足す。単体テスト（「テスト方針」の `displayPrefs.ts`。**design「プログラムの指定と、利用者の記憶」の表の全行**と、「帯を移しただけの面は、後から `collapsed` の指定でたたまれない」「`caps` が `["right"]` の画面で、`dock: "bottom"` の指定の面をたたむと、記憶の `dock` は `bottom`」「記憶が無く、置き場所が `float` の面は、たたんで始まる」）
      対象: `packages/web/src/display/displayPrefs.ts`（新規）・`.test.ts`（新規）、`packages/web/src/store/display.ts`・`display.test.ts`、`packages/web/src/display/DisplayController.ts:79-80` / 根拠: design「記憶」、research F9・F10
      依存: T1, T4
      AC: AC1, AC2, AC4, AC7, AC9, AC12, AC16, AC23
      点検: あり
- [ ] T6: 割り付けの関数（帯・トレイ・右のパネル）: `display/paneDisplayLayout.ts` に `LayoutInput`・`LayoutResult`・`TrayButton`・定数・`resolvePaneDisplays`。**入出力の形は design の最後の形**で、中の計算は、手順 1（帯）・2（トレイ。やり直しを含む）・4（横。この時点では右だけ）・5（端末の領域）。手順 3・6 は、該当の面が無いものとして空を返す（T13・T21 で足す）。
      **`displayLayout.ts` は残し**、その `panelWidthRange`・`panelWidth`・`visibleBands` と定数を import して使う（`displayLayout.test.ts` と、モバイルの `PaneBands` の道が、今のまま）。**右のパネルだけ・帯が上だけ・たたみ無しのとき、今と同じ大きさになる**ことを単体テストで見る。`display/framePage.ts` に `placedFrameKey`。単体テスト（「テスト方針」の `paneDisplayLayout.ts` のうち、この範囲）
      対象: `packages/web/src/display/paneDisplayLayout.ts`（新規）・`.test.ts`（新規）、`packages/web/src/display/framePage.ts:45-49` の後・`framePage` のテスト / 根拠: design「割り付け」
      依存: T5
      AC: AC3, AC4, AC5, AC13
      点検: あり
- [ ] T7: 部品（PR-A の分）:
      (1) `DisplayPanelHead.vue`（props は `info`・`collapsible`。design「部品」の表）を作り、`PanePanel.vue` の見出しを移す。印「スクリプト」は、ラベルの箱の外の `flex: none` の兄弟に。`flex-wrap` で、狭いときは折る。［⋮］［たたむ］［×］とつかむ場所（印とラベルの入れ物に `data-display-grip`）は `@mousedown.prevent`・`data-display-keepfocus`。`keydown` の `repeat` を止める。
      根に `data-display-chrome`・`data-display-head`。**今の印（`data-pane-panel-label`・`-fold`・`-close`）は残す**。［⋮］は、`actions.openContextMenu({kind: "display", id}, 位置)` を呼ぶ（項目は T8）。
      (2) `PaneFrame.vue`: `resolvePaneDisplays` を computed で 1 回呼び、design「部品」の木にする（`div.pane-frame-center` を足す・`PaneBands` を上と下に・`PanePanel side="right"`。上・下・左のパネルと窓の層は、まだ置かない）。**本体の箱が 0×0 の間は、面の部品を 1 つも載せない**。割り付けが例外なら、面なしへ落とす。
      割り付けの結果を watch して（`flush: "post"`）、変わったら `store.layoutRev++` と `store.layoutByPane` への写し（`auto`・窓の動ける領域。外れるときに消す）、`auto` が変わってフォーカスが `body` に落ちていたら端末へ。案内の線（`.pane-frame-guide`）は、PR-A では今の位置のまま（T15 で移す）。重なりの値（design の表）のうち、案内の線 25・枠のフォーカスの線 26。
      (3) `PanePanel.vue`: props を `paneId`・`side`・`dock`（割り付けの結果）にし、**たたんだときの幅 24px の見出しを消す**（古い `store.collapsed`・`setCollapsed`・`panelWidths` の呼び出しを、`setFaceCollapsed`・`setSideSize`・`clearSideSize` に替える）。枠の `:key` を `placedFrameKey(active, "dock:right")`。根に `data-pane-panel`（今のまま）・`data-display-dock`・`data-display-root`。操作中の文言の行とタブの行に `data-display-chrome`。つまみに `data-display-keepfocus`（`z-index` は 22）。
      (4) `PaneBands.vue`: `edge?`・`layout?` の props。`edge` なしは今の動き（モバイル。枠の鍵は `placedFrameKey(b, "band:plain")`・「ほか N 件」は今の知らせ）。`edge` ありは、その側の帯・トレイ・「ほか N 件」（押すと面の一覧）・帯ごとの［⋮］。`edge` ありのときは、帯の行の［⋮］［×］も `@mousedown.prevent`・`data-display-keepfocus`。`paneHeightPx` の prop は残す（モバイルが渡す）。枠の `:key` を `placedFrameKey(b, "band:" + edge)`。帯の 1 行に `data-display-root`、アプリの部分に `data-display-chrome`。**上の帯と下の帯は、別の `PaneBands`（別の入れ物）**。
      (5) `DisplayTray.vue`（ボタン〔`data-display-tray-button`・`data-display-id`・`data-display-name`〕・印・`max-width: 40%`・自分の箱を測って「ほか N」・押せないボタンの `title`・`@mousedown.prevent`・`data-display-keepfocus`・`repeat` を止める）。
      (6) `display/displayOps.ts`: `withDisplayChange(info, change, focusAfter, host)`（design「たたむ・開く」の手順 1〜4 と、行き先の表）と `installKeepFocusRelease(host)`（`main.ts` で 1 回呼ぶ。`DisplayHost` は、いま `app.provide` の引数の中で作っているので、変数へ出して両方に渡す。
      **対象は、押した先が `[data-display-keepfocus]` か `[data-display-cover]` の中で、`activeElement` が「操作中のスクリプトの枠」か「静的な形式の枠」のとき**＝枠の包みの `data-display-engaged` が `"1"` か、属性なし。`"0"`〔操作中でないスクリプトの枠〕には、何もしない）。たたむ・開く・帯の上下は、すべて `withDisplayChange` を通す。
      (7) `MobileDisplaySheet.vue` の枠の `:key` を `placedFrameKey(active, "sheet")`（と import）。 (8) `DISPLAY_SUBSCRIBE_FEATURES` に `collapse`。
      (9) メニューの対象の型 `MenuTarget` に `{kind: "displays", paneId}`・`{kind: "display", id}` を足す（`ContextMenu` は、この時点では、その 2 つに空の一覧を返す。項目は T8）。`ContextMenu` の外側の押下の処理（`ContextMenu.vue:202-208`）に、「押した先が `[data-display-keepfocus]` か `[data-display-cover]` の中なら、`restoreFocus()` してから閉じる」を足す。古い `collapsed`・`setCollapsed`・`panelWidths`・`setPanelWidth`・`clearPanelWidth`・`pruneWidths` を、呼び出しが無くなった時点で消す（`ActionDispatcher.focusDisplay` の呼び出しは、`setFaceCollapsed` に替える。行き先の順の作り直しは T8）。
      単体テスト（属性・`placedFrameKey`・たたむとボタンになる・`withDisplayChange` の表の全行・`installKeepFocusRelease`〔操作中のスクリプトの枠・静的な枠にフォーカスがあるとき、`[data-display-keepfocus]`・`[data-display-cover]` の `pointerdown` で端末へ移る。枠に無い・操作中でないスクリプトの枠なら、何もしない〕・メニューを開いたまま、フォーカスを取らない部品を押すと、開く前の場所へ戻る・`repeat`・0×0 では載らない・モバイルの `PaneBands` が今のまま）。
      既存の単体を直す: `PaneFrame.test.ts:776-787`（「面が出ても `<slot />` の位置が変わらない」。**箱の大きさを与える形**〔`ResizeObserver` の差し替え〕に直す。見ている中身は弱めない）・`PanePanel.test.ts`（props・`:44-49`・`:82`・`:109`）・`DisplayScriptMark.test.ts:38,49,56,72`（`PanePanel` の props）・`DisplayController.test.ts:52`（名乗りの一覧）・`store/display.test.ts`
      対象: `packages/web/src/components/DisplayPanelHead.vue`（新規）・`DisplayTray.vue`（新規）・`PanePanel.vue`・`PaneBands.vue`・`PaneFrame.vue:339-347`・`:476`・`:552`・各 `.test.ts`・`DisplayScriptMark.test.ts`、`packages/web/src/display/displayOps.ts`（新規）・`.test.ts`（新規）、`packages/web/src/main.ts`（`DisplayHost` を組み立てている :531-560 付近）、`packages/web/src/display/DisplayController.ts:28`・`DisplayController.test.ts:52`、
      `packages/web/src/term/MouseBridge.ts:14`（`MenuTarget`）・`components/ContextMenu.vue`、`packages/web/src/store/display.ts`・`actions/ActionDispatcher.ts:1057`、`packages/web/src/mobile/MobileDisplaySheet.vue:6`・`:80` / 根拠: design「部品」「たたむ・開く」「押してもフォーカスを取らない部品と、操作中の枠」「PR3 の守りとの関係」G1・G2・G4・G5
      依存: T5, T6
      AC: AC1, AC3, AC4, AC5, AC6, AC8, AC21, AC22, AC24, AC25, AC26, AC-I1, AC-I4
      点検: あり
- [ ] T8: メニューとキー: `ContextMenu.vue` の対象 `{kind: "displays", paneId}`（面の一覧。選ぶと、同じ位置に面のメニュー）と `{kind: "display", id}`（面のメニュー。PR-A の項目: 開く／たたむ・帯の 上に置く／下に置く・プログラムの指定に戻す・この表示を閉じる）。pane のメニューに「表示のメニュー…」。項目の処理は `withDisplayChange` を通す。
      **表示のメニューを開く前に、フォーカスが面の枠（操作中のスクリプトの枠か、静的な形式の枠。見分けは T7 (6) と同じ）にあれば、`endEngageFrame` と `host.focusTerminal` で端末へ移す**（開く関数を 1 つにして、［⋮］・「ほか N」・「ほか N 件」・キー・pane のメニューが、全部それを通る）。
      `ACTIONS` に `display_menu`（`group: "pane"`・既定 `prefix+shift+i`・`action: {type: "displayMenu"}`）、`Action` の型、`ActionDispatcher`（`displayMenu()` と、`focusDisplay()` の行き先の選び直し＝design「キー」の ①〜④。「最後に操作した面」は `store.lastFace`〔面が操作中になった・利用者が開いた／移した、で更新する処理も、ここで入れる〕。自動でたたまれた面は、`store.layoutByPane` の `auto` で見分けて飛ばす（面の一覧のメニューの「出せない」も、これを読む）。たたんだ面を開くときは `withDisplayChange`。
      **モバイル〔`store.sheetAvailable`〕では、`focusDisplay` は今の動きのまま・`displayMenu` は `sheetRequest++`・記憶を見ない／書かない**）、端末版の `TuiDispatcher.run` の case（`focusDisplay` と同じ知らせ）。見出しのボタンの上の `Esc` で端末へ。件数を固定したテスト（「リスク」の一覧）を直す。
      単体テスト（2 つの対象の項目・枠にフォーカスがあるときに開くと端末へ移ってから開く・`focusDisplay` の ①〜④ と自動でたたまれた面を飛ばす・モバイルの枝・`resetFace`）
      対象: `packages/web/src/components/ContextMenu.vue:57-159`・`ContextMenu.test.ts`、`components/DisplayPanelHead.vue`・`PaneBands.vue`・`DisplayTray.vue`（開く関数の呼び出し・`Esc`）、`packages/client-core/src/keys/bindings.ts:492-500` の後・`actions.ts:96` の後・`bindings.test.ts:45,54`・`keymap.test.ts:78,83`、`packages/web/src/actions/ActionDispatcher.ts:273-275`・`:1045-1068`・`.test.ts`（`:2881` の describe・`:2927-2933`）、`packages/web/src/components/KeySettings.test.ts:77,822,846`、`packages/web/src/store/display.ts`（`lastFace`）、`packages/tui/src/actions/TuiDispatcher.ts:261-264`・`.test.ts:207,213` / 根拠: design「メニュー」「キー」「たたむ・開く」、research F16・F17
      依存: T7
      AC: AC3, AC4, AC7, AC24, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
      点検: あり
- [ ] T9: 知らせの位置: `display/toastSlot.ts` の `pickToastSlot`（純粋）と、`Toast.vue`（デスクトップで面があるとき、`[data-display-chrome]` を測って、空きに出す。知らせが出ている間だけ、design「知らせの位置」の時機で測り直す〔`MutationObserver`・`ResizeObserver`・`layoutRev`・知らせの数・ウィンドウの大きさ〕。`overflow-y: auto` は今のまま。モバイルは今の「右下へ寄せる」のまま）。単体テスト（空きの選び方・空きが足りない・`chrome` が無い）
      対象: `packages/web/src/display/toastSlot.ts`（新規）・`.test.ts`（新規）、`packages/web/src/components/Toast.vue` / 根拠: design「知らせの位置」、decisions D14、research F7・G6
      依存: T7
      AC: AC10
      点検: あり
- [ ] T10: E2E（PR-A）`display-layout-state.spec.ts` と helper `support/displayLayout.ts`（トレイのボタン・面のメニュー・箱を取る・枠の要素を控えて後で比べる関数）:
      (1) パネルをたたむ → 再読み込み → たたんだまま（トレイにボタン・`[data-pane-panel]` が無い）。開く → 再読み込み → 開いたまま。別の context（別の `localStorage`）は既定のまま。面を `close` → 同じ名前で `set` → 同じ状態。
      (2) 設定「初めの状態」を「たたむ」→ 新しい名前のパネルはボタンで出る・(1) で開いた面は開いたまま・`--collapsed` なしの `set` で開かない。
      (3) 帯（`--size 96`）をメニューからたたむ → 行が消え・端末の箱が高くなり・`client.view` の行数が増え（1 回）・ボタンが出る → 押すと戻る。帯を下へ → 帯の箱が端末の箱の下・覚える。`--edge bottom`・設定の既定。
      (4) トレイ: 帯があるときは帯の行の中・無いときは 24px の行・面が無ければ行が無い。たたんだパネルは、端末の横に幅を使わない（端末の箱の幅＝本体の幅）。ボタンの中心の `elementFromPoint` がボタン自身で、**帯の枠（`iframe[data-display-frame]`）の箱と、トレイのボタン・印の箱が交わらない**。
      **帯の中身（`html` と `script-html`）に、`position: fixed`・大きな負の margin・`z-index` で外へ描こうとする中身を入れても同じ**。狭い pane（分割して）で、たたんだ面を 5 つにすると「ほか N」が出て、押すと面の一覧が開き、その帯の右端の［×］が欠けない。
      (5) `--collapsed`・`--edge` が記憶の無い面に効く。`--dock bottom` は `sodactl display list` に載るが、**PR-A の画面では右に出る**（落ちない）。利用者が操作（たたむ／開く・帯の上下）した後は、指定を変えた `set` でも変わらない（**帯を下へ移しただけの後、`--collapsed` つきの `set` をしても、たたまれない**）。「プログラムの指定に戻す」で戻る。
      (6) **`load` と枠の要素**: 帯を 2 本上に出し、パネルを 2 枚出す。(a) 帯の最初の 1 本を下へ移す → 移した帯の枠は別の要素・**もう 1 本の帯の枠と、パネルの枠は、同じ要素のまま**。(b) パネルの 1 枚をたたむ／開く・タブの切り替え・帯をたたむ／開く、でも同じ見方。どの後でも、出ている枠の `data-display-loads` が `1`・`sodactl display list` に面が残る・ブラウザが `display.report`（`navigated`）を送っていない。
      `script-html` の面でも同じで、開いた直後は覆いがあって操作中でなく、直後の `script-html` の `set` が通る（冷却に入っていない）。
      (7) フォーカス: (a) 端末にフォーカスを置いて、トレイのボタン・［たたむ］・帯の行の［×］でない場所（帯の行の［⋮］は、メニューを `Esc` で閉じた後）をマウスで押す → `activeElement` は端末・打った文字が pane に届く。メニューを開いたまま、見出しのつかむ場所を押して閉じる → `activeElement` は端末（`body` でない）。(b) `prefix+shift+i` → 矢印 → `Enter` → 「たたむ」→ マウス無しでたためて、端末にフォーカス。
      (c) `Tab` で見出しの［たたむ］へ → `Enter` → `activeElement` が、その面のトレイのボタン → `Enter` → `activeElement` が［たたむ］。これを 20 回 → `body` に落ちない・遮断器の知らせが出ない・スクリプトの面が止まらない。(d) 静的な面の枠の中をクリックしてから、メニューでたたむ → `activeElement` が端末。
      (e) **`script-html` のパネルで［操作する］→ ［たたむ］でない場所（見出しの［⋮］・つかむ場所・トレイの別の面のボタン・幅のつまみ・帯の行の［⋮］・**別の `script-html` の帯の覆い**）を、マウスで 1 回ずつ、合わせて 6 回押す（そのたびに［操作する］で操作中に戻す）→ ブラウザが `display.report`（`focus_steal`）を 1 回も送っていない（`watchSentDisplay`）・面が残る・`activeElement` が端末**。
      既存の `display-script-focus`・`display-script-engage`（操作中でない枠が取ったら、数えられる）が、そのまま通る。
      (8) 知らせ: 帯を下に置き、知らせを出す → 知らせの箱が、`[data-display-chrome]` のどの箱とも重ならない。
      (9) 既存の `display-*.spec.ts`（15 本）が通る（「リスク」に挙げた箇所を直す。弱めない）。
      (10) 右のパネルを最小の幅（160px）にして、`script-html` の面の印「スクリプト」・［操作する］・［⋮］・［たたむ］・［×］の箱が、パネルの箱の中・中心の `elementFromPoint` が自身
      対象: `packages/e2e/src/specs/display-layout-state.spec.ts`（新規）、`packages/e2e/src/support/displayLayout.ts`（新規）、`packages/e2e/src/specs/display-flows.spec.ts:63-81`・`:267-268`・`display-script-nav.spec.ts:76-78` / 根拠: 規約 `e2e-observe-browser`、helper は `support/display.ts`・`displayBrowser.ts`・`displayScript.ts`
      依存: T3, T8, T9
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC10, AC21, AC22, AC23, AC24, AC25, AC26, AC-I1, AC-I3, AC-I4
- [ ] T11: 文書（PR-A）: `docs/display.md`（たたみの記憶・優先の表・設定・帯のたたみと上下・帯の行のボタン・表示のメニューと `prefix+shift+i`・`prefix+i` の行き先・「たたむ／置き場所の変更で、スクリプトの状態と入力の途中の値は消える」・たたみは面ごと・限界〔帯の中身は、ボタンに似た絵を描ける。押しても開かない／同じ名前の面は置き場所を引き継ぐ。「プログラムの指定に戻す」は、同じ名前のほかの pane の面にも効く〕・新旧の表）・
      `docs/sodactl.md`（`--dock`・`--edge`・`--collapsed`・`ignored`・`--features` の `layout` と 3 つの数）・`docs/verification.md`・`docs/tui.md` と `docs/tui-parity.md`（`display_menu` は端末版では知らせ。端末版の面は `20261008-display-tui`）・`AGENTS.md` の案内の 1 行
      対象: 上のファイル / 根拠: requirements AC27
      依存: T10
      AC: AC27
- [ ] T12: 負の対照（PR-A。test 工程）: (a) トレイを、帯の枠の上に重ねて置く版（`position: absolute` で、枠の箱の中）→ T10 (4) の「箱が交わらない」が落ちる。(b) `pickToastSlot` を通さず、今の「右下へ寄せる」に落とす版 → T10 (8) が落ちる。
      (c) 上と下の帯を、1 つの入れ物・1 つの `v-for`（鍵は面の id。配列は 上の帯 → 下の帯 の順）で描く版 → T10 (6)(a) の「もう 1 本の帯の枠は、同じ要素のまま」か「`load` が 1」が落ちる（「作業順序」の 1）。
      (d) `effectiveCollapsed` が記憶より指定を先に見る版 → T10 (5) が落ちる。`writeFace` が変えた項目だけを書く版（`loadDisplayLayout` の「項目の欠けた記憶は捨てる」も外し、欠けた項目は指定へ落とす）→ T10 (5) の「帯を下へ移しただけの後、`--collapsed` でたたまれない」が落ちる。(e) `withDisplayChange` の行き先へ移す処理（手順 3・4）を外す版 → T10 (7)(c) が落ちる。(f) `installKeepFocusRelease` を呼ばない版 → T10 (7)(e) が落ちる。生の出力を `test-result.md` に
      対象: `.aidev/works/20261008-display-layout/test-result.md` / 根拠: 規約 `regression-negative-control`
      依存: T10
      AC: AC28

### PR-B: パネルの上下左右と D&D

- [ ] T13: 割り付けの 4 つの側と、落とせる場所の関数: `resolvePaneDisplays` に、手順 3（縦。上・下）と、手順 4 の左を足す（両側の縮め方〔同じ大きさなら、上・左を先に縮める〕・自動でたたむ順・`TERMINAL_MIN_ROWS`）。上下の高さの望む値は、`sideSizes` → 選んでいる面の `size`（`decisions.md` D8）。`display/dockDrag.ts` に `dockZoneAt(rect, x, y, opts)`（純粋。箱の外は `null`・0.22・いちばん近い縁・中央は `opts.float` が真のときだけ `float`）。
      単体テスト（4 つの側が同時・片方だけ・40 列と 10 行のちょうど・合計が超えるときの縮め方の各段・上が先にたたまれる・左が先にたたまれる・トレイの行のやり直し・`dockZoneAt` の境界）。**PR-A のテスト（右だけ）が、変更なしで通る**
      対象: `packages/web/src/display/paneDisplayLayout.ts`・`.test.ts`、`packages/web/src/display/dockDrag.ts`（新規）・`.test.ts`（新規） / 根拠: design「割り付け」の決まり 3・4、「D&D」
      依存: T6
      AC: AC11, AC12, AC13, AC15
      点検: あり
- [ ] T14: 部品の側: `PanePanel.vue` を `side`（right・left・top・bottom）で描き分ける（境の線・つまみの縁・上下は横に長い見出し）。`PaneFrame.vue` に、上・左・下の `PanePanel` を置く（design「部品」の木の位置。**4 つは、テンプレートの別の位置の `v-if`**。1 つの `v-for` にしない）。枠の `:key` は `placedFrameKey(active, "dock:" + side)`。タブは側ごと（`activeBySide`）。
      `DISPLAY_DOCK_CAPS` を `["right","left","top","bottom"]` に。`setFaceDock` で移った面が、移った先で選ばれる。`withDisplayChange` を通す（フォーカスの行き先は、design の表）。単体テスト（4 つの側の属性・鍵・置き場所を変えると前の側から消える）
      対象: `packages/web/src/components/PanePanel.vue`・`PaneFrame.vue`・各 `.test.ts`、`packages/web/src/display/displayPrefs.ts`（`DISPLAY_DOCK_CAPS`）・`.test.ts`、`packages/web/src/store/display.ts` / 根拠: design「部品」「置き場所の変更」「PR3 の守りとの関係」G1・G2
      依存: T13, T7
      AC: AC11, AC12, AC21, AC22, AC24, AC25
      点検: あり
- [ ] T15: 各側のつまみ: `useResizeDrag` を側ごとに（左右は `x`・上下は `y`）。ドラッグの間は案内の線だけ（`emit("guide", { side, px } | null)`。`PaneFrame` の `.pane-frame-guide` を、本体の直下へ移し、本体の箱を基準に、縦と横の両方を置く。design「つまみ」）・離したとき `setSideSize` を 1 回・`Esc`・ダブルクリックで `clearSideSize`。キー（端末の側へ向く矢印で広く）。
      `role="separator"`・`aria-orientation`・値。ダイアログが開いたら `finish()`（`view.modalOpen` の watch）。**右の側の `data-pane-panel-resize`・`data-pane-frame-guide`・`aria-label`「パネルの幅」・見える位置は、今のまま**（`display-resize.spec.ts:56-81,111-113` が見ている）。単体テスト
      対象: `packages/web/src/components/PanePanel.vue:47-93`・`PaneFrame.vue:345`・`:544-553`（案内の線）・各 `.test.ts` / 根拠: design「つまみ」、research F19
      依存: T14
      AC: AC14, AC-I2
- [ ] T16: D&D: `display/dockDrag.ts` に、つかむ・動かす・離す・取り消すの処理（`[data-display-grip]` の `pointerdown`・6px・捕捉・`store.dockDrag`・`Esc` を capture で止める・`pointercancel`・`lostpointercapture`・`view.modalOpen`・部品が外れた）。`DisplayDropZones.vue`（5 つの場所と文言・いまの場所の強調・「ここにあります」・`pointer-events: none`・`z-index: 30`）。
      ドラッグの間 `<html>` に `soda-display-dragging`（枠に `pointer-events: none`）。`.pane-frame-zone` に `z-index: 30`。離したら `withDisplayChange` で `setFaceDock`。PR-B では中央は「ここには置けません」（何も変わらない）。
      単体テスト（6px 未満は何もしない・各場所で離す・取り消しの 5 通り・ボタンの上からは始まらない・ドラッグ中のキーが外へ流れない・`view.paneDrag` が立たない）
      対象: `packages/web/src/display/dockDrag.ts`・`.test.ts`、`packages/web/src/components/DisplayDropZones.vue`（新規）・`.test.ts`（新規）、`DisplayPanelHead.vue`、`PaneFrame.vue:439-446`（`.pane-frame-zone`）、`packages/web/src/store/display.ts`（`dockDrag`）、`packages/web/src/styles/`（`soda-display-dragging` の規則。`resizeHandle.css` と同じ置き方） / 根拠: design「D&D」、research F18
      依存: T14
      AC: AC15, AC-I2, AC-I5
      点検: あり
- [ ] T17: メニュー・設定・名乗り（PR-B）: 面のメニューに「右に置く／左に置く／上に置く／下に置く」（今と違う側だけ）。設定の画面に「表示のパネルの既定の置き場所」（右／左／上／下）。`DISPLAY_SUBSCRIBE_FEATURES` に `dock`。`focusDisplay` が、どの側のパネルにも移れる。単体テスト
      対象: `packages/web/src/components/ContextMenu.vue`・`SettingsDialog.vue`・`packages/web/src/display/DisplayController.ts:28`・`DisplayController.test.ts:52`・`actions/ActionDispatcher.ts`・各テスト / 根拠: design「メニュー」「設定」「画面の名乗り」
      依存: T14, T8
      AC: AC12, AC16, AC8, AC-I3
- [ ] T18: E2E（PR-B）`display-layout-dock.spec.ts`:
      (1) メニューで 右 → 下 → 左 → 上 → 右 と移す。そのたびに、箱の並び（上の帯 → 上のパネル → 左｜端末｜右 → 下のパネル → 下の帯）・上下のパネルの幅＝本体の幅・`client.view` が 1 回で、列数と行数が端末の箱に合う・端末の箱がはみ出さない。
      (2) 右と下に同時に置く・同じ側に 2 枚でタブ。再読み込みの後も同じ。別の pane で同じ名前の面を出すと、最後に決めた置き場所から始まる（たたみは引き継がない）。
      (3) pane を狭める・低くする（分割・ウィンドウの大きさ）: 端末が 40 列・10 行を下回らない。両側の合計が超えると縮む。それでも入らないと、上（左）が先にトレイの押せないボタンになる。広げると戻る。記憶は変わらない（再読み込みで確かめる）。
      (4) つまみ: 4 つの側で、ドラッグの間は `client.view` を送らず、離して 1 回。`Esc`・ダブルクリック・キー・`aria-valuenow`。覚える。
      (5) D&D: 見出しをつかんで各場所へ（落とせる場所の文言が見える・離すと移る）。`Esc`・pane の外で離す・6px 未満 → 変わらない。ドラッグの間、`.pane-frame-zone` が出ない。pane の名前の D&D は今までどおり（パネルの上へ落としても、その pane への落とし）。ドラッグの間に打ったキーが pane に届かない。
      (6) **`load` と枠の要素**: パネルを 3 枚（右に 2 枚・下に 1 枚）と帯を 1 本出して、右の 1 枚を左へ移す → 移した面の枠は別の要素・**ほかの面（右に残った 1 枚・下の 1 枚・帯）の枠は、同じ要素のまま**。(1)(2)(5) の移動のたびに、枠の `data-display-loads` が `1`・面が残る・`navigated` を送っていない。
      `script-html` の面で、移した後も覆いがあり、［操作する］で始まり、冷却に入っていない。操作中に移すと、操作が終わり、端末にフォーカス。**操作中に、見出しのつかむ場所・各側のつまみ・［⋮］をマウスで 5 回押しても、`focus_steal` を 1 回も送らない**。
      (7) 固定の部品: 4 つの側 × 最小の大きさで、固定のラベル・印「スクリプト」・［操作する］・［⋮］・［たたむ］・［×］の箱が、パネルの箱の中・中心の `elementFromPoint` が自身。
      (8) 知らせ: パネルが下と右にあるとき、知らせの箱が `[data-display-chrome]` と重ならない。
      (9) `--dock bottom`・設定の既定の置き場所。
      (10) 既存の `display-*.spec.ts`（15 本）と `display-layout-state.spec.ts` が通る
      対象: `packages/e2e/src/specs/display-layout-dock.spec.ts`（新規）、`packages/e2e/src/support/displayLayout.ts` / 根拠: 規約 `e2e-observe-browser`
      依存: T15, T16, T17
      AC: AC7, AC10, AC11, AC12, AC13, AC14, AC15, AC16, AC21, AC22, AC24, AC25, AC-I2, AC-I3, AC-I5
- [ ] T19: 文書（PR-B）: `docs/display.md`（置き場所・並びの図・タブ・最小と自動のたたみ・各側のつまみ・D&D とメニュー・設定）・`docs/sodactl.md`（`--dock` の 4 つの値が効く）・`docs/verification.md`
      対象: 上のファイル
      依存: T18
      AC: AC27
- [ ] T20: 負の対照（PR-B。test 工程）: (a) 4 つの側の `PanePanel` を、1 つの入れ物・1 つの `v-for`（鍵は側）にして、配列の順を替える版か、面を持つ `DisplayFrame` を 1 つの `v-for`（鍵は面の id）で並べて、置き場所で順を替える版 → T18 (6) の「ほかの面の枠は、同じ要素のまま」か「`load` が 1」が落ちる（「作業順序」の 1）。
      (b) 最小の丸め（`TERMINAL_MIN_ROWS`・`TERMINAL_MIN_COLS`）を外す版 → T18 (3) が落ちる。(c) `installKeepFocusRelease` を呼ばない版 → T18 (6) の「操作中に、つかむ場所・各側のつまみ・［⋮］を押しても、`focus_steal` を送らない」が落ちる（`withDisplayChange` の手順 2 は、マウスでは `installKeepFocusRelease` が先に働くので、E2E では落とせない。単体で見る）。生の出力を `test-result.md` に
      対象: `.aidev/works/20261008-display-layout/test-result.md`
      依存: T18
      AC: AC28

### PR-C: 浮いた窓

- [ ] T21: 窓の矩形と重なりの関数、割り付けの手順 6: `display/floatGeometry.ts`（`clampFloatRect`・`defaultFloatRect`・`moveFloatRect`・`resizeFloatRect`・`FloatHandle`・`raiseFloat`・`insertFloat`。純粋）。`resolvePaneDisplays` に手順 6（窓の動ける領域＝端末の領域の 4px 内側・それが最小より小さければ自動でたたむ・渡された矩形を丸める）と、トレイの `kind: "float"`（**開いている窓もボタンに入れ、`open` を立てる**）。
      単体テスト（領域より大きい・負の位置・最小・8 つのつかむ場所で動かない側の縁が動かない・領域が縮んだ後・`NaN` と無限大を受けても有限の矩形を返す・ずらしが領域を出ない・**重なりの決まり 1〜3**〔操作中の窓は最前面・押した窓は操作中の窓の後ろまで・新しい窓は操作中の窓の後ろ〕・窓の開閉で、トレイの行の有無が変わらない）
      対象: `packages/web/src/display/floatGeometry.ts`（新規）・`.test.ts`（新規）、`packages/web/src/display/paneDisplayLayout.ts`・`.test.ts` / 根拠: design「割り付け」の決まり 6、「浮いた窓の矩形」「浮いた窓」の重なり
      依存: T13
      AC: AC17, AC18, AC19, AC20, AC22
      点検: あり
- [ ] T22: 窓と層: `DisplayFloat.vue`（`DisplayPanelHead`・題・操作中の文言・枠〔`:key="placedFrameKey(info, 'float')"`〕・操作中の縁・`role="dialog"`・`aria-label`・`data-display-float`・`data-display-root`・不透明な背景）。`PaneFrame.vue` に窓の層 `div.pane-frame-floats`（`.pane-frame-center` の中・`.pane-frame-main` の兄弟・`position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 20; isolation: isolate`。窓は `pointer-events: auto`）。
      窓の根に `tabindex` を付けない（キーのモードの間だけ。T23）。枠（`DisplayFrame`）以外の部分（題・操作中の文言・縁）は `@mousedown.prevent`・`data-display-keepfocus`。
      **`v-for` は出た順・`:key` は面の id。重なりは `z-index: 20 + floatOrder の位置`**（`floatOrder` は pane ごと。更新は `raiseFloat`・`insertFloat`: 窓の `pointerdown` の capture・`focusedDisplayId` の変化・窓が開いた）。初めの矩形 `floatInitial`（初めて窓として開いたときに 1 回だけ、開く操作の中で作る〔`store.layoutByPane` の窓の動ける領域を使う。割り付けの computed の中では書かない〕。`set --size` の変更・ほかの窓の開閉で動かない。面が消えたら捨てる）。
      **記憶の無い浮いた窓は、閉じて始まる**（T5 の `effectiveCollapsed`）。
      `DISPLAY_DOCK_CAPS` に `float`。`DISPLAY_SUBSCRIBE_FEATURES` に `float`。面のメニューに「浮いた窓にする」（そのとき、初めの矩形を `setFaceRect`）。設定の「既定の置き場所」に「浮いた窓」。トレイの ❐ のボタン（`aria-pressed`。押すと開閉）。`focusDisplay` が窓にも移れる。
      窓の出現・前へ出す操作で、アプリは枠へフォーカスを移さない。E2E の helper に、窓の枠を取る選び方（`[data-display-float] iframe[data-display-frame]`）。単体テスト（層の属性・`z-index` だけが変わり、DOM の順が変わらない・［たたむ］とトレイのボタンで開閉・`withDisplayChange`・`floatInitial` が動かない）
      対象: `packages/web/src/components/DisplayFloat.vue`（新規）・`.test.ts`（新規）、`PaneFrame.vue`・`.test.ts`、`DisplayTray.vue`、`ContextMenu.vue`、`SettingsDialog.vue`、`packages/web/src/display/displayPrefs.ts`（`DISPLAY_DOCK_CAPS`）、`packages/web/src/display/DisplayController.ts:28`・`DisplayController.test.ts:52`、`store/display.ts`（`floatOrder`・`floatInitial`）、`actions/ActionDispatcher.ts`、`packages/e2e/src/support/displayLayout.ts` / 根拠: design「部品」「浮いた窓」「PR3 の守りとの関係」
      依存: T21, T14, T8, T17
      AC: AC8, AC17, AC19, AC20, AC21, AC22, AC24, AC25, AC-I1, AC-I4
      点検: あり
- [ ] T23: 移動・大きさ・キーボード: 縁と角の 8 つのつかむ場所（`data-display-keepfocus`。`useResizeDrag` と同じ決まりで、その場でスタイルを変え、`store.layoutRev++`、離したとき `setFaceRect`。`Esc` で戻す・ダイアログで確定）。面のメニューの「キーで動かす」「キーで大きさを変える」（`floatKeyMode`。窓の根に `tabindex="-1"` を付けてフォーカス〔終えたら外す〕・矢印 16px・`Shift` 64px・`Enter`・`Esc`・フォーカスが出たら確定・`aria-live` の案内・キーを外へ流さない・**終えたら、始める前の場所へフォーカスを戻す**）。
      見出しのボタンの上の `Esc` で、窓を閉じずに端末へ。窓の上のホイールが、端末のスクロールバックを動かさない。単体テスト
      対象: `packages/web/src/components/DisplayFloat.vue`・`.test.ts`、`ContextMenu.vue`・`ContextMenu.test.ts`、`store/display.ts`（`floatKeyMode`） / 根拠: design「浮いた窓」「キー」
      依存: T22
      AC: AC18, AC-I2, AC-I3, AC-I4, AC-I5
      点検: あり
- [ ] T24: D&D の中央と、窓のつかみ: `dockZoneAt` の `float` を有効に（中央で離すと `setFaceDock(info, "float")` と、離した位置の矩形を `setFaceRect`）。浮いた窓の見出しをつかむと、その場で動き（`moveFloatRect`）、本体の箱の縁から 16px 以内でだけ側が強調される。離すと、側なら `setFaceDock`・そうでなければ `setFaceRect`。`Esc` で、始める前の矩形へ。単体テスト
      対象: `packages/web/src/display/dockDrag.ts`・`.test.ts`、`components/DisplayDropZones.vue`、`DisplayFloat.vue` / 根拠: design「D&D」
      依存: T22, T16
      AC: AC15, AC17, AC18, AC-I2
- [ ] T25: E2E（PR-C）`display-layout-float.spec.ts`:
      (1) メニュー・D&D の中央で、窓になって開く。**`--dock float`・設定で浮いた窓になった、記憶の無い面は、閉じて始まる**（トレイの ❐ のボタンだけ・窓の要素が無い）→ ボタンを押すと開く。窓を開く・［たたむ］で閉じる・トレイの ❐ で開く・動かす・大きさを変える・前へ出す、のどれでも、ブラウザが `client.view` を送らない（ドックから移したときと、その pane で最初にトレイの行が出るときの 1 回を除く）。**帯が 1 本も無い pane で、窓を開く・閉じるを 3 回繰り返しても、`client.view` を送らず、トレイの行が出たまま**（開いている窓のボタンは `aria-pressed="true"`）。
      (2) 窓を、4 隅と 4 辺の外へ大きく動かす・大きくする → 窓の箱が、いつも端末の箱（`[data-pane-frame-main]`）の中。240×120px より小さくならない。pane を狭めた後も中。領域が最小より小さいと、トレイの押せないボタン。再読み込みの後、同じ位置と大きさ。移動の途中の `Esc` で戻る。
      まだ動かしていない窓（`--dock float` で出て、ボタンで開いた）は、プログラムが `--size` を変えて `set` し直しても・ほかの窓を開閉しても、箱が動かない。
      (3) **重ならない**: 窓を各隅へ寄せて、帯の行（印・トレイのボタン・［×］）・ドックのパネルの見出しとつまみ・隣の pane（分割して）の端末と面・分割の境目・サイドバーの境目・tab バー・サイドバーの上の点の `elementFromPoint` が、窓の中の要素でない。pane のメニュー・設定のダイアログ・知らせ・pane を落とす場所の表示・つまみのドラッグ中の案内の線は、窓の上（その箱の中心の `elementFromPoint` が、その部品）。
      (4) 窓が開いているだけで、端末に打った文字が pane に届く（窓の出現・移動・前へ出す操作・**窓の題や余白を押した**後も、`activeElement` は端末）。窓の外の端末を押せる・選べる。窓の上のホイールで、端末のスクロールバックが動かない。
      (5) 2 つの窓: 押した窓の `z-index` が上。**前へ出しても、どちらの枠も `data-display-loads` が `1`・枠の要素が同じ（`isConnected` のまま）**。tab を切り替えて戻る・workspace を切り替えて戻る・拡大・分割の後も、同じ pane に、覚えた位置で出る。pane を閉じると消える。
      **`script-html` の窓 A を操作中にして、プログラムが別の窓 B を、A に重なる位置に出す → A の［操作を終える］・印・操作中の文言の中心の `elementFromPoint` が、A のその要素自身**（B は A の後ろ）。
      (6) **`load`**: ドック ↔ 窓の移動・たたむ／開く・移動・大きさ、の後に `data-display-loads` が `1`・面が残る・`navigated` を送っていない（移した面の枠は別の要素・ほかの面の枠は同じ要素）。`script-html` の窓: 覆いがあり、窓・覆いを押しても始まらず、［操作する］で始まる。操作の前にスクリプトが `focus()` → フォーカスが元へ戻り、ブラウザが `display.report`（`focus_steal`）を送る。3 回で閉じる。
      **操作中に、窓の見出しのつかむ場所・縁と角・題・トレイのボタン・別の `script-html` の窓の覆い（押して前へ出す）を、マウスで 6 回押しても、`focus_steal` を 1 回も送らない。**
      スクリプトが `window.resizeTo`・`moveTo`・`soda.action` を呼んでも、窓の箱が変わらない。利用者が動かした後、プログラムが `--dock right` で `set` しても、窓のまま。
      (7) 固定の部品: 最小の窓（240×120px）で、印「スクリプト」・［操作する］・［⋮］・［たたむ］・［×］が、窓の箱の中・`elementFromPoint` が自身。知らせ: 窓が右下にあるとき、知らせの箱が窓の見出しと重ならない（窓を動かした後も）。
      (8) キーボードだけ: `prefix+shift+i` → 面 → 「浮いた窓にする」→「キーで動かす」→ 矢印 → `Enter` → `activeElement` が端末（打った文字が pane に届く）。開く／たたむを 20 回 → 遮断器が落ちない。
      (9) 既存の `display-*.spec.ts`（15 本）と `display-layout-state`・`display-layout-dock` が通る
      対象: `packages/e2e/src/specs/display-layout-float.spec.ts`（新規）、`packages/e2e/src/support/displayLayout.ts` / 根拠: 規約 `e2e-observe-browser`
      依存: T23, T24
      AC: AC10, AC17, AC18, AC19, AC20, AC21, AC22, AC23, AC24, AC25, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T26: 文書（PR-C）: `docs/display.md`（浮いた窓: 出し方・動かし方・キーボード・端末の領域の中だけ・重なり〔操作中の窓が最前面〕・覚え方・限界〔窓は pane の中だけ・小さい pane では出せない・置き場所の変更でスクリプトの状態は消える〕）・`docs/sodactl.md`（`--dock float`・`renderers.float`）・`docs/verification.md`
      対象: 上のファイル
      依存: T25
      AC: AC27
- [ ] T27: 負の対照（PR-C。test 工程）: (a) `clampFloatRect` を通さない版 → T25 (2) が落ちる。(b) 窓の層を `PaneFrame` の外（`body` への `Teleport`・`position: fixed`）に置く版 → T25 (3) が落ちる。(c) 重なりを、`v-for` の配列の並べ替えで替える版 → T25 (5) の「枠の要素が同じ」か「`load` が 1」が落ちる（「作業順序」の 1）。
      (d) 窓を開くときに枠へ `focus()` する版 → T25 (4) が落ちる。(e) `insertFloat` が、新しい窓をいつも最前面に入れる版 → T25 (5) の「操作中の窓の見出しが覆われない」が落ちる。(f) 開いている窓のボタンをトレイから外す版 → T25 (1) の「帯の無い pane で `client.view` を送らない」が落ちる。生の出力を `test-result.md` に
      対象: `.aidev/works/20261008-display-layout/test-result.md`
      依存: T25
      AC: AC28
