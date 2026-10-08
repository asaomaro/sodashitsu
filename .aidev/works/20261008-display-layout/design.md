# 仕様: 表示の面の配置と状態（ブラウザ版）— たたみの記憶・帯の上下・帯の行のボタン・パネルの上下左右と D&D・浮いた窓

## 概要

表示の面（`sodactl display` のパネルと帯）に、**置き場所**（パネル: 右・左・上・下・浮いた窓／帯: 上・下）と **たたみ** を持たせ、その画面（ブラウザ）が覚える。
たたんだ面・閉じた浮いた窓は、**帯の行の、アプリが描くボタン（以下「トレイ」）**から開く。置き場所は、見出しの D&D か、メニューで変える。プログラムは、初めの置き方だけを指定できる。

前提は **PR3（`script-html`）がマージされた後の木**（`research.md`）。PR3 の守り（`research.md` G1〜G7）は、この設計の制約（「PR3 の守りとの関係」の表）。

## 設計方針

1. **枠（iframe）は動かさない。置き場所・たたみが変わるたびに、枠の部品を作り直す**（`decisions.md` D3）。置く側の `:key` を `placedFrameKey(info, slot)`（面の鍵＋置き場所）にする。
   浮いた窓の移動・大きさ・重なりは **スタイルだけ**を変える。重なりは `z-index` で替え、`v-for` の並び（出た順）は替えない。
2. **割り付けは、純粋な関数 1 つ**（`resolvePaneDisplays`）が決める。入力は、pane の箱・セルの大きさ・面の一覧・記憶・設定。出力は、各側の群れ・大きさ・端末の領域・浮いた窓の矩形・トレイ・自動でたたんだ面。部品は、その結果を描くだけ。
3. **「いまの状態」は、記憶・プログラムの指定・設定から、毎回、関数で導く**（`effectiveDock`・`effectiveEdge`・`effectiveCollapsed`）。利用者の操作だけが記憶を書く。自動のたたみ・丸めは、記憶を書かない。
4. **見出しは 1 つの部品**（`DisplayPanelHead`）。右・左・上・下・浮いた窓のどれでも同じ部品が、固定のラベル・印・［操作する］・［操作を終える］を描く（置き場所ごとに描き分けない＝欠ける置き場所を作らない）。
5. **浮いた窓は、端末の領域の箱の中の層**に置く（`decisions.md` D9）。層の箱＝端末の領域で、`overflow: hidden`。窓の矩形は、関数が領域の中へ丸める。
6. **端末（葉）の DOM の位置は変えない**（`research.md` F1）。`PaneFrame` の本体の構造は、面の有無・置き場所に依らず同じで、面の部品だけを `v-if` で出し入れする。
7. **プロトコルに足すのは、指定の 3 項目だけ**（`dock`・`edge`・`collapsed`）。サーバは、検査して見出しに載せるだけで、配置の状態を持たない。

## 対象範囲

| 層 | 変えるもの | PR |
|---|---|---|
| protocol | `display.ts`（指定の 3 項目・定数・検査・機能の名前）・`messages.ts`（`displaySetFields`・`SharedPrefs` の 3 項目・`DEVICE_LOCAL_PREF_KEYS`） | A |
| server | `DisplayService.ts`（見出しに指定を載せる・`renderers()` の 3 種類）| A |
| cli | `cliArgs.ts`・`commands/display.ts`（`--dock`・`--edge`・`--collapsed`・古いサーバでは落とす）・skill ファイル | A |
| client-core | `prefs/load.ts`（設定 3 つの読み）・`keys/bindings.ts`・`keys/actions.ts`（`display_menu`） | A |
| web（状態） | `store/display.ts`・新 `display/displayPrefs.ts`（記憶の読み書きと導出）・新 `display/displayOps.ts`（`withDisplayChange`・`installKeepFocusRelease`）・`display/DisplayController.ts`（名乗り・記憶の掃除）・`main.ts`（`installKeepFocusRelease` を 1 回）・`term/MouseBridge.ts`（メニューの対象の型 `MenuTarget`）・`store/settings.ts`・`store/prefsApply.ts`・`actions/ActionDispatcher.ts` | A（B・C で足す） |
| web（割り付け） | 新 `display/paneDisplayLayout.ts`（`displayLayout.ts` の関数を import して使う。`displayLayout.ts` は残す）・新 `display/toastSlot.ts`・`display/framePage.ts`（`placedFrameKey`） | A（B・C で足す） |
| web（部品） | `PaneFrame.vue`・`PaneBands.vue`・`PanePanel.vue`・新 `DisplayPanelHead.vue`・新 `DisplayTray.vue`・`ContextMenu.vue`・`Toast.vue`・`SettingsDialog.vue` | A |
|  | `PanePanel.vue`（側の一般化）・新 `DisplayDropZones.vue`・新 `display/dockDrag.ts`・`styles/`（ドラッグ中の `soda-display-dragging` の規則） | B |
|  | 新 `DisplayFloat.vue`・新 `display/floatGeometry.ts` | C |
| tui | `TuiDispatcher.ts`（`display_menu` は、`focus_display` と同じ知らせ）・`settings/sections.ts`（3 項目を `BROWSER_ONLY` の注記つきで出す） | A |
| e2e | 新 `display-layout-state.spec.ts`（A）・`display-layout-dock.spec.ts`（B）・`display-layout-float.spec.ts`（C）・`support/displayLayout.ts` | A・B・C |
| docs | `docs/display.md`・`docs/sodactl.md`・`docs/verification.md`・`docs/tui-parity.md`・`AGENTS.md` | A・B・C |

**変えないもの**: `DisplayFrame.vue`（合い札・`load`・見回り・覆い・フォーカスの番。**1 行も変えない**）・`DisplayScriptMark.vue`・`display/engageEntry.ts`・`focusGuard.ts`・`focusOrigin.ts`・`focusDrop.ts`・`frameMessages.ts`・`frameRegistry.ts`・`packages/web/public/display-view/*`・サーバの応答ヘッダ。
`mobile/MobileDisplaySheet.vue` は、枠の `:key` を `placedFrameKey(active, "sheet")` にする行と、その import の行だけ。`mobile/MobileShell.vue` は変えない。レビューで、これらのファイルの差分が無い（か、その 1 行だけ）ことを見る。
面の根の印 `data-display-root="<面の id>"` は、**置く側**の要素に付ける（`PanePanel` の根〔選んでいる面の id〕・`DisplayFloat` の根・帯の 1 行）。

## 依拠する既存の事実

出所は `research.md`（F・G・U の番号）。

- F1（端末の DOM の位置を変えない）・F2（今のパネル）・F3（今の帯）・F4（2 回目の `load` で面が閉じる）・F5（今も、たたむ・タブ・tab の切り替えは作り直し）・F7（知らせは右下）・F8（モバイルは別の描き方）。
- F9・F10（状態と `soda.prefs.v1`・端末ごとの項目）・F11（設定を足すときに触る場所）・F12〜F15（プロトコル・古いサーバ・機能の名乗り）・F16〜F20（キー・メニュー・ドラッグの先例）・F21（重なりの順）。
- **未確認**（U1〜U5）: iframe を DOM の中で動かすと `load` が増えるか（増える前提で、動かさない）／スタイルだけの変更では読み込み直さない／iframe の上の `elementFromPoint`／ポインタの捕捉。E2E（T10・T18・T25）で確かめ、結果を `test-result.md` に書く。

## 画面

### 並び（上・下・左・右）

```
┌ pane（PaneFrame の本体）──────────────────────────────────────────────┐
│▍表示 [▣ diff] [▭ ci] │  帯 status の中身（枠）            │[⋮][×]│ ← 上の帯の行。左がアプリの部分（印とトレイ）
├──────────────────────────────────────────────────────────────────────┤
│ pane のプログラムの表示（隔離）· plan            [⋮][▾][×]            │ ← 上のパネル（pane の幅いっぱい）
│ （枠）                                                                │
├═══════════════════════════════════════════════════════════════════════┤ ← つまみ（上のパネルと端末の境目）
│ …（隔離）· tree │                                  ║ …（隔離）· progress │
│ [⋮][▾][×]       │                                  ║ [スクリプト][操作する][⋮][▾][×]
│ （枠）          ║        端  末                    ║ タブ: progress | log │
│                 ║   （最低 40 列・10 行）          ║ （枠）               │
│  左のパネル     ║                                  ║  右のパネル          │
├═══════════════════════════════════════════════════════════════════════┤ ← つまみ
│ pane のプログラムの表示（隔離）· table           [⋮][▾][×]            │ ← 下のパネル（pane の幅いっぱい）
│ （枠）                                                                │
├──────────────────────────────────────────────────────────────────────┤
│▍表示 │  帯 build の中身（枠）                              │[⋮][×]│ ← 下の帯の行
└──────────────────────────────────────────────────────────────────────┘
```

- 縦の並びは固定: **上の帯 → 上のパネル → 〔左のパネル｜端末｜右のパネル〕 → 下のパネル → 下の帯**。上・下のパネルは pane の幅いっぱい（角は上・下のもの）。左・右のパネルは、その間の高さ。
- 各側は「群れ」（その側に置いたパネルの集まり）。見出しは、選んでいる 1 枚のもの。2 枚以上ならタブ。枠は、選んでいる 1 枚だけ載せる（今と同じ）。
- つまみは、各群れの、端末に面した縁。

### 浮いた窓

```
┌ pane ────────────────────────────────────────────────────────────────┐
│▍表示 [❐ chart]│ 帯 status（枠）                              │[⋮][×]│ ← 帯の行とトレイ（窓は、ここに重ならない）
├───────────────────────────────────────────────┬──────────────────────┤
│ $ make test                                   │ …（隔離）· progress  │
│ ...            ┌ 浮いた窓 ─────────────────┐  │ （右のパネル。窓は、 │
│                │…（隔離）· notes  [⋮][▾][×]│  │  ここにも重ならない）│
│   端末の領域   │ 題                        │  │                      │
│  （窓が動ける  │ （枠）                    │  │                      │
│    のは、この  │                           ◢  │                      │
│    箱の中だけ）└───────────────────────────┘  │                      │
│ $ █                                           │                      │
└───────────────────────────────────────────────┴──────────────────────┘
   [❐ chart] は、閉じている浮いた窓。押すと、覚えた位置と大きさで開く。開いている窓 notes のボタン（図では省略）も、
   トレイに出たまま（押された見た目。`aria-pressed="true"`）で、押すと閉じる。
```

### トレイ（帯の行のボタン）と、帯が無いとき

```
帯があるとき（最初に出ている帯の行に置く）:
│▍表示 [▣ diff] [▭ ci] [❐ chart スクリプト] [ほか 2] │ 帯の中身（枠） │ [スクリプト][操作する][⋮][×] │
  └─ アプリが描く（枠の外）────────────────────────┘                  └─ アプリが描く（その帯のもの）┘

出ている帯が無いとき（高さ 24px の、ボタンだけの行。設定「帯の既定の場所」の側）:
│▍表示 [▣ progress] [▭ status]                                                                       │

ボタンの印:  ▣ パネル（ドック）  ❐ 浮いた窓  ▭ 帯     押せないボタン（pane が狭い）は薄く出て、理由が title に出る
```

### D&D の落とせる場所

```
パネルの見出しをつかんで動かしている間（その pane だけに出る。pointer-events: none）:
┌──────────────────────────────────────────┐
│               上に置く                   │   縁から 22% までが、その側。
├────────┬────────────────────────┬────────┤   いちばん近い縁を選ぶ。
│        │                        │        │
│ 左に   │    浮いた窓にする      │ 右に   │   中央は、PR-C から（PR-B では「ここには置けません」で、
│ 置く   │                        │ 置く   │   離しても変わらない）。
├────────┴────────────────────────┴────────┤
│               下に置く                   │   ポインタのある場所だけ、強調の色と実線。ほかは点線。
└──────────────────────────────────────────┘   pane の D&D の表示（縁 30%・中央が赤）とは、文言と色が別。
```

## インターフェース / データ構造

### プロトコル（`packages/protocol/src/display.ts`・`messages.ts`）— PR-A

```ts
export const DISPLAY_DOCKS = ["right", "left", "top", "bottom", "float"] as const;
export const DISPLAY_EDGES = ["top", "bottom"] as const;
export type DisplayDock = (typeof DISPLAY_DOCKS)[number];
export type DisplayEdge = (typeof DISPLAY_EDGES)[number];
/** 読み手の側は、後の版が足す値を受けても落ちない（知らない値は「指定なし」として扱う）。 */
export type DisplayDockValue = DisplayDock | (string & {});
export type DisplayEdgeValue = DisplayEdge | (string & {});

// DisplaySetBody に足す（どれも任意）
dock?: DisplayDock;      // kind が panel のときだけ
edge?: DisplayEdge;      // kind が band のときだけ
collapsed?: boolean;     // true のときだけ意味を持つ（「たたんで始める」）

// DisplayInfo に足す（どれも任意。無ければ「指定なし」）
dock?: DisplayDockValue;
edge?: DisplayEdgeValue;
collapsed?: boolean;
```

- `checkDisplaySet`: `dock` は `kind === "panel"` かつ `DISPLAY_DOCKS` の値、`edge` は `kind === "band"` かつ `DISPLAY_EDGES` の値、`collapsed` は boolean。外れたら `{ok: false}`（サーバは `invalid_display`・sodactl は使い方の誤り）。`collapsed: false` は、載せない（「指定なし」と同じ）。
- 指定は、**`set` のたびに置き換わる**（題・大きさと同じ。省いた `set` で「指定なし」に戻る）。
- `messages.ts` の `displaySetFields` に 3 項目を足す（`/ws` と受け口が同じ定義を使う。受け口は `strictObject` のまま）。
- `readDisplayInfo` は変えない（知らない項目を通す。型だけ足す）。画面は、値を `isDisplayDock`・`isDisplayEdge` で確かめてから使う（知らない値・型の違う値は「指定なし」）。
- 機能の名前: `DISPLAY_FEATURES` に `"layout"`（sodactl とサーバ）。`DISPLAY_RENDER_FEATURES` に `"collapse"`・`"dock"`・`"float"`（計 7。上限 8 の内）。`DisplayRenderers` に `collapse`・`dock`・`float`（数）。
- `SharedPrefs` に `displayPanelInitial?: "open" | "collapsed"`・`displayPanelDock?: DisplayDock`・`displayBandEdge?: DisplayEdge`。`DEVICE_LOCAL_PREF_KEYS` に `"displayLayout"`。
- **位置・大きさ（浮いた窓の x・y・幅・高さ）の項目は、足さない**。`size` は今のまま（パネル 160〜800px。左右に置いたときは幅、上下に置いたときは高さ、浮いた窓では幅の、初めの値）。

### サーバ（`DisplayService.ts`）— PR-A

- `set`: 検査を通った `dock`・`edge`・`collapsed` を、`DisplayInfo` に載せる（無ければ項目ごと無い）。置き換えの `set` では、新しい値で置き換える。ほかの決まり（数・量・冷却）は変えない。
- `renderers()`: `collapse`・`dock`・`float` を数える（今の 4 つと同じ形）。`features()` の `features` に `layout`。
- 配置の状態・記憶は持たない。受け口の操作は増えない（`set` の引数が増えるだけ。対象は今までどおり、名乗った pane だけ）。

### sodactl（`packages/cli`）— PR-A

```
sodactl display set <name> --kind panel|band [--dock right|left|top|bottom|float] [--edge top|bottom] [--collapsed] …（今までの引数）
```

- `--dock` は `--kind panel` だけ・`--edge` は `--kind band` だけ（違えば使い方の誤り＝終了コード 2）。知らない値も同じ。
- 3 つのどれかが付いた `set` は、**送る前に `display.features` を見る**（`script-html` と同じ道）。`features` に `layout` が無ければ、3 項目を外して送り、成功の結果に `"ignored": ["dock", "collapsed"]`（外した項目の名前）を足す。stderr に 1 行（「このサーバは配置の指定を知らないので、指定なしで出しました」）。終了コード 0。
- `sodactl display list` は、サーバの `DisplayInfo` をそのまま出す（`dock`・`edge`・`collapsed` が載る）。`--features` の `sodactl.features` に `layout`。

### 設定（共有の設定）— PR-A（`displayPanelDock` の選択肢は、PR-B・PR-C で増える）

| 項目 | 値 | 既定 | 画面の文言（節「端末」。`displayScriptEnabled` の上） |
|---|---|---|---|
| `displayPanelInitial` | `open`・`collapsed` | `open` | 「表示のパネルの初めの状態」— 開く／たたむ（帯の行のボタンから開く） |
| `displayPanelDock` | `right`・`left`・`top`・`bottom`・`float` | `right` | 「表示のパネルの既定の置き場所」— 右／左／上／下／浮いた窓 |
| `displayBandEdge` | `top`・`bottom` | `top` | 「表示の帯の既定の場所」— 上／下 |

- 読みは `client-core/src/prefs/load.ts` の `loadDisplayPanelInitial`・`loadDisplayPanelDock`・`loadDisplayBandEdge`（知らない値・型の違う値は既定）。UI は `fieldset` ＋ radio（`paneBorders` と同じ書き方）。
- **PR-A の画面は、`displayPanelDock` の選択肢を出さない**（置き場所は右だけ）。PR-B で 右／左／上／下 を出し、PR-C で「浮いた窓」を足す。画面が出せない値（PR-B の画面での `float`）は、`right` として扱う。
- 端末版の設定の画面には、3 項目を「ブラウザ版だけ」の注記つきで出す（`BROWSER_ONLY`。端末版の work が、注記を外す）。

### 記憶（`soda.prefs.v1` の `displayLayout`。その画面だけ）— `display/displayPrefs.ts`（新規）

```ts
export interface FacePref {
  dock?: DisplayDock;                 // パネル（パネルの記憶なら必ずある）
  edge?: DisplayEdge;                 // 帯（帯の記憶なら必ずある）
  collapsed: boolean;                 // 必ずある
  rect?: { x: number; y: number; w: number; h: number };  // 浮いた窓。窓の動ける領域（端末の領域の 4px 内側）の左上からの px
}
export interface DisplayLayoutPrefs {
  v: 1;
  faces: Record<string, FacePref>;                                  // 鍵: `${paneId}|${kind}|${name}`
  names: Record<string, { dock?: DisplayDock; edge?: DisplayEdge }>; // 鍵: `${kind}|${name}`
  sides: Record<string, number>;                                     // 鍵: `${paneId}|${side}`（side は right・left・top・bottom）。px
}
export const FACE_PREFS_MAX = 256, NAME_PREFS_MAX = 64, SIDE_PREFS_MAX = 128;
```

- `loadDisplayLayout(raw: unknown): DisplayLayoutPrefs` — 形が違えば空。項目ごとに検査し、合わないものだけ捨てる（`dock`・`edge` は定数の値・`collapsed` は boolean・`rect` は 4 つとも有限の数で `w`・`h` は 1〜8192、`x`・`y` は 0〜8192・`sides` は 96〜8192 の数）。上限を超えた分は、先頭（古いもの）から捨てる。
- 書くのは、**利用者の操作のときだけ**（下の `setFaceCollapsed` ほか）。**書くときは、その面の、その時点の導出した値を全部書く**（置き場所〔帯は上下〕と、たたみ。変えた項目だけを書かない）。
  → 面の記憶（`faces` のその鍵）は **あるか・無いか** の 2 つだけになる。あれば、置き場所もたたみも記憶の値で、プログラムの指定と設定は、その面には効かない（「1 回でも操作したら、利用者の状態のまま」。AC7・AC23）。
  読むとき、`collapsed` が無い・パネルで `dock` が無い・帯で `edge` が無い記憶は、壊れた値として、その鍵ごと捨てる。書くたびに、その鍵を末尾へ移す（最近使ったものが残る）。`writePrefs({ displayLayout })`（`DEVICE_LOCAL_PREF_KEYS` に入っているので、共有の設定へ送られない）。
- もう無い pane の分（`faces`・`sides`）は、`pruneWidths` と同じ時機（接続のたびの `display.subscribe` の応答の後。pane が 1 つも分からない間は捨てない）に捨てる。`names` は pane に依らないので、上限だけで捨てる。
- **引き継ぎ**: 右の側の大きさは、`sides["<pane>|right"]` が無ければ、今までの `displayPanelWidths[<pane>]` を読む（読むだけ。新しい値は `sides` に書く。`displayPanelWidths` は消さない・書かない）。

導出（純粋。同じファイル）:

```ts
/** 面の記憶（あれば、それで決まり）＞ 同じ名前の記憶 ＞ プログラムの指定 ＞ 設定。画面が出せない値（caps に無い）は飛ばす。 */
export function effectiveDock(info, prefs, settings: { dock: DisplayDock }, caps: readonly DisplayDock[]): DisplayDock;
export function effectiveEdge(info, prefs, settings: { edge: DisplayEdge }): DisplayEdge;
/** 面の記憶があれば、その値。無ければ、パネルは「設定が collapsed か、指定が collapsed」、帯は「指定が collapsed」（同じ名前の記憶は、たたみには使わない）。 */
export function effectiveCollapsed(info, prefs, settings: { initial: "open" | "collapsed" }): boolean;
/** 「プログラムの指定に戻す」を出すか: 面の記憶がある、または、同じ名前の記憶（`names`）が、いまの置き場所を決めている。 */
export function hasFacePref(info, prefs): boolean;
/** その版の画面が出せる置き場所（PR-A: ["right"]／PR-B: 4 つの側／PR-C: 5 つ）。PR ごとに、この定数だけを変える。 */
export const DISPLAY_DOCK_CAPS: readonly DisplayDock[];
```

- `caps` は、その版の画面が出せる置き場所（`DISPLAY_DOCK_CAPS`。PR-A: `["right"]`／PR-B: `["right","left","top","bottom"]`／PR-C: 5 つ）。順に見て、最初の「出せる値」を使う。どれも出せなければ `right`。
- ストア（`store/display.ts`）の操作（どれも記憶を書く）:
  `setFaceCollapsed(info, on)`・`setFaceDock(info, dock)`（`faces` と `names` の両方へ）・`setFaceEdge(info, edge)`（同じ）・`setFaceRect(info, rect)`・`setSideSize(paneId, side, px)`・`clearSideSize(paneId, side)`・`resetFace(info)`（`faces` のその鍵と、`names` のその鍵を消す）。
  面に関わる 4 つ（`setFaceCollapsed`・`setFaceDock`・`setFaceEdge`・`setFaceRect`）は、中で 1 つの関数 `writeFace(info, patch)` を通り、**いまの導出した値に `patch` を重ねた全項目**を書く。
  `resetFace` が `names` を消すと、**同じ名前の面で、自分の記憶を持たないもの（ほかの pane）も、指定か設定の置き場所へ戻る**（枠は作り直し）。docs に書く。
  今の `collapsed`（pane の `Set`。**pane 単位**）・`setCollapsed`・`panelWidths`・`setPanelWidth`・`clearPanelWidth`・`pruneWidths` は、これらに置き換えて消す（**たたみは、pane 単位から面単位に変わる**。呼んでいる場所: `PanePanel.vue`・`ActionDispatcher.focusDisplay`・テスト）。
  `activePanel`・`activePanelOf`・`setActivePanel`（pane ごとの、選んでいるパネル）は、**モバイルの重ね表示（`MobileDisplaySheet`）のために残す**（デスクトップは `activeBySide` を使う）。
- 保存しない状態（ストア）: `floatInitial`（面の id → 初めの矩形。面が消えたら捨てる）・`lastFace`（pane の id → 最後に操作した面の id。その面が操作中になった・利用者が開いた／移した、で更新。`prefix+i` の行き先に使う）・`activeBySide`（`${paneId}|${side}` → 面の id。選んでいるタブ）・`floatOrder`（面の id の並び。末尾が前）・`dockDrag`（D&D の途中）・`floatKeyMode`（キーで動かす／大きさを変える途中）・`layoutRev`（割り付けが変わるたびに 1 増える数。知らせの位置の測り直しの合図）。

### 割り付け（`display/paneDisplayLayout.ts`。新規。純粋）

```ts
export const TERMINAL_MIN_COLS = 40;      // 今の値
export const TERMINAL_MIN_ROWS = 10;
export const DOCK_W_MIN_PX = 160;         // 今の PANEL_MIN_PX
export const DOCK_H_MIN_PX = 96;
export const TRAY_ROW_PX = 24;
export const FLOAT_MIN_W_PX = 240, FLOAT_MIN_H_PX = 120, FLOAT_AREA_INSET_PX = 4, FLOAT_INSET_PX = 8, FLOAT_CASCADE_PX = 24;

export type Side = "right" | "left" | "top" | "bottom";
export interface LayoutInput {
  paneW: number; paneH: number; cellW: number; cellH: number;      // pane の本体の箱（px）と、端末のセル（取れなければ 9×18）
  bands: { id: string; size: number; edge: DisplayEdge; collapsed: boolean }[];   // 出た順
  panels: { id: string; size: number; dock: DisplayDock; collapsed: boolean }[];  // 出た順
  active: Partial<Record<Side, string>>;                             // 側ごとの、選んでいる面
  sideSizes: Partial<Record<Side, number>>;                          // 利用者が決めた大きさ
  floatRects: Record<string, { x: number; y: number; w: number; h: number }>;
  trayEdgeDefault: DisplayEdge;                                      // 設定 displayBandEdge
}
export interface LayoutResult {
  bands: { top: string[]; bottom: string[]; more: string[] };        // 出す帯（側ごと・出た順）と、「ほか N 件」に回った帯
  tray: { edge: DisplayEdge; row: "band" | "own" | "none"; hostBandId: string | null; buttons: TrayButton[] };
  docks: Record<Side, { ids: string[]; activeId: string; size: number; min: number; max: number } | null>;
  floats: { id: string; rect: { x: number; y: number; w: number; h: number } }[];   // 出す窓（出た順）。rect は、窓の動ける領域（端末の領域の 4px 内側）の左上から
  auto: string[];                                                    // 自動でたたんだ面（記憶は変えない）
  terminal: { x: number; y: number; w: number; h: number };          // 端末の領域（本体の箱の左上から）
}
export interface TrayButton { id: string; kind: "panel" | "float" | "band"; open: boolean; disabled: boolean }  // open＝開いている浮いた窓（ほかは false）。disabled＝自動でたたんだ面
export function resolvePaneDisplays(input: LayoutInput): LayoutResult;
```

決まり（この順で計算する）:

1. **帯**: たたんでいない帯を、出た順に足し、高さの合計が `paneH / 3` 以下に収まる分だけ出す（上と下を合わせて数える。今の `visibleBands` と同じ決まり）。収まらない分は `more`（今の「ほか N 件」の 1 行〔20px〕。トレイの側に出す）。
2. **トレイの側と行**: `edge` は、出す帯の最初の 1 本の側。出す帯が無ければ `trayEdgeDefault`。`buttons` は、たたんだドックのパネル・**浮いた窓の面の全部（開いていても。`open` で開閉を表す）**・たたんだ帯・自動でたたんだ面（`disabled`）を、出た順に。
   浮いた窓のボタンを、開いている間も出すのは、**窓の開閉で、トレイの行（24px）が出入りして端末の高さが変わる、を起こさないため**（AC17）。
   `row` は、その側に出す帯があれば `band`（`hostBandId` は、その側の最初の帯）、無くてボタンが 1 つ以上あれば `own`（高さ `TRAY_ROW_PX`）、どちらも無ければ `none`。
   **手順 3〜6 で自動でたたんだ面が出て、行が `none` → `own` に変わったら、行の高さを引いて、手順 3〜6 を 1 回だけやり直す**（やり直しで自動でたたむ面は増えるだけ。2 回目の結果を使う）。
   「ほか N 件」の行は、`more` が 1 本以上あれば、トレイの側に必ず描く（出す帯もトレイの行も無くても。`PaneBands` を載せる条件に入れる）。押すと、面の一覧のメニューが開く（`edge` なしの `PaneBands`＝モバイルでは、今の知らせのまま）。
3. **縦（上・下のパネル）**: `H = paneH − 出す帯の高さの合計 − 「ほか N 件」の行 − トレイの行（own のとき）`。空き `avail = H − TERMINAL_MIN_ROWS × cellH`。
   各側の望む高さは `sideSizes[side] ?? 選んでいる面の size`。範囲は `min = DOCK_H_MIN_PX`、`max = floor(min(H / 2, avail))`。`max < min` の側は、自動でたたむ。
   上と下の両方があり、丸めた後の合計が `avail` を超えるなら、**大きいほう（同じなら「上」。横では「左」）を `max(min, avail − 他方)` まで縮め、まだ超えるなら他方も同じように縮め、それでも超えるなら「上」を自動でたたんで、下だけで計算し直す**。
4. **横（左・右のパネル）**: 幅 `paneW` で、手順 3 と同じ（`avail = paneW − TERMINAL_MIN_COLS × cellW`、`min = DOCK_W_MIN_PX`、`max = floor(min(paneW / 2, avail))`。収まらなければ「左」を先に自動でたたむ）。
5. **端末の領域**: 残り。`terminal` の箱（必ず 40 列・10 行以上。pane そのものがそれより小さいときは、パネルは全部が自動でたたまれ、端末は pane の残り全部）。
6. **浮いた窓**: 窓の動ける領域 `area` は、端末の領域を各辺 `FLOAT_AREA_INSET_PX` ずつ縮めた箱（窓の矩形は、`area` の左上から）。`area` が `FLOAT_MIN_W_PX × FLOAT_MIN_H_PX` より小さければ、窓は全部が自動でたたまれる。そうでなければ、たたんでいない窓ごとに `clampFloatRect(floatRects[id], area)`（`display/floatGeometry.ts`。PR-C）。
   `floatRects[id]` は、**記憶の矩形（`faces` の `rect`）→ 無ければ、その面が初めて窓として出たときに 1 回だけ作って、ストアが持つ矩形（`floatInitial`。保存しない）**。呼ぶ側（`PaneFrame`）が埋めて渡す。
   初めの矩形は `defaultFloatRect(i, size, area)`（`i` は、その時点で開いている窓の数）で、**作った後は、`set --size` の変更・ほかの窓の開閉で動かない**。利用者が動かす・大きさを変える・メニューや D&D で浮かせる、のどれかで、記憶（`rect`）に書かれる。

- 自動でたたんだ面は `auto` に入り、トレイの押せないボタンになる。**記憶には書かない**（pane が広がれば、次の計算で戻る）。
- 群れの `activeId` は、`active[side]` がその群れにあればそれ、無ければ群れの最初の面。
- 今の `display/displayLayout.ts`（`panelWidthRange`・`panelWidth`・`visibleBands` と定数）は、**そのまま残し**、この関数が import して中で使う（`TERMINAL_MIN_COLS`・`PANEL_MIN_PX` は、そこから再 export。`PaneBands` の `edge` なしの道と、既存の単体テストが、今のまま使う）。（右だけのときの結果が、今と同じ値になることを、単体テストで見る＝退行の確かめ）。
- PR-A の時点では、`panels` の `dock` は全部 `right`（`caps` が `right` だけ）。手順 3・6 は、PR-B・PR-C で足す。**関数の入出力の形は、PR-A で最後の形にしておく**（PR-B・PR-C は、中の計算を足すだけ）。

浮いた窓の矩形（`display/floatGeometry.ts`。PR-C。純粋）:

```ts
/** 窓の全体を、領域の中へ入れる。先に大きさを [最小, 領域] に丸め、次に位置を [0, 領域 − 大きさ] に丸める。 */
export function clampFloatRect(r: Rect, area: { w: number; h: number }): Rect;
/** 初めの矩形。幅は size（240〜領域−16）、高さは領域の 6 割（120〜領域−16）。右上から、i 番目は 24px ずつ左下へずらす。領域が小さくて範囲が逆転するときも、最後に clampFloatRect を通した値を返す。 */
export function defaultFloatRect(i: number, size: number, area: { w: number; h: number }): Rect;
/** 移動。start に dx・dy を足して丸める。 */
export function moveFloatRect(start: Rect, dx: number, dy: number, area): Rect;
/** 大きさの変更。handle は n・s・e・w・ne・nw・se・sw。動かない側の縁は動かさず、最小と領域に丸める。 */
export function resizeFloatRect(start: Rect, handle: FloatHandle, dx: number, dy: number, area): Rect;
```

### 部品

`PaneFrame.vue` の本体（`enabled` のとき。**構造は、面の有無に依らず同じ**。`<slot />` は、いつも `row > center > main` の中）:

```
div.pane-frame-body.pane-frame-body-displays        （縦の flex。ResizeObserver で箱を測る＝ paneW・paneH）
├ PaneBands edge="top"       v-if 上に出す帯か、トレイの行が上にある
├ PanePanel side="top"       v-if docks.top                                   （PR-B）
├ div.pane-frame-row                                 （横の flex）
│ ├ PanePanel side="left"    v-if docks.left                                  （PR-B）
│ ├ div.pane-frame-center                            （position: relative・flex: 1。いつもある）
│ │ ├ div.pane-frame-main    <slot />                （端末。操作中は薄くする＝今のまま）
│ │ └ div.pane-frame-floats  v-if 出す窓がある       （PR-C。position: absolute・inset: 0・overflow: hidden・pointer-events: none・z-index: 20）
│ │     └ DisplayFloat v-for（出た順。:key は面の id）（pointer-events: auto。重なりは z-index）
│ ├ PanePanel side="right"   v-if docks.right
│ └ div.pane-frame-guide     v-if ドラッグ中         （案内の線。横は left／right、縦は top／bottom で置く）
├ PanePanel side="bottom"    v-if docks.bottom                                （PR-B）
└ PaneBands edge="bottom"    v-if 下に出す帯か、トレイの行が下にある
DisplayDropZones             v-if この pane の面を D&D している               （PR-B。本体の後。pointer-events: none・z-index: 30）
```

- `PaneFrame` が `resolvePaneDisplays` を 1 回呼び（computed）、結果を子へ props で渡す。子は、自分で割り付けを計算しない。
- `div.pane-frame-center` を足すので、この版に上げたとき、`enabled` な pane の端末の祖先が 1 段増える（**面の有無では変わらない**。`PaneFrame.test.ts:776` の「面が出ても `<slot />` の位置が変わらない」は、そのまま通る）。
- 浮いた窓の層は、`.pane-frame-main` の兄弟（操作中に端末を薄くする `opacity` が、窓に掛からない）。層の箱＝端末の領域で、`overflow: hidden`。
- **測る前**: 本体の箱の大きさが、まだ 0×0 の間（載った直後。`ResizeObserver` の最初の知らせの前）は、**面の部品を 1 つも載せない**（全部が自動でたたまれた形を、いったん描かない。葉の箱が、余計に 1 回変わらない）。
- **重なりの値**（同じ pane の中。単一 pane の葉は、重なりの文脈が閉じていないので、pane の外の部品とも比べられる。`research.md` F21）:

| 値 | 部品 |
|---|---|
| 1000・950・900 | メニュー・知らせ・`CommandPopup`／再接続（今のまま。ダイアログは top layer） |
| 30 | 面の D&D の落とせる場所（`DisplayDropZones`）・pane を落とす場所（`.pane-frame-zone`。今は値なし → 30） |
| 26 | 枠のフォーカスの線（`.pane-frame-edge-flush:focus-visible::after`。今は 12 → 26） |
| 25 | つまみのドラッグ中の案内の線（`.pane-frame-guide`。今は 3 → 25） |
| 22 | 各側のパネルのつまみ（`.pane-panel-resize`。今は 2 → 22） |
| 20〜23 | 浮いた窓の層と、その中の窓（20 ＋ 並びの位置。窓は 4 つまで＝パネルの上限。層が重なりの文脈を作るので〔`isolation: isolate`〕、中の値は外と比べられず、層の 20 だけが外と比べられる） |
| 11 以下 | xterm のスクロールバーほか（今のまま） |

- 窓は、端末の領域の縁から **4px 内側**まで（`FLOAT_AREA_INSET_PX = 4`）。領域の縁には、隣の部品のつまみの当たり判定（サイドバーの境目・分割の境目・パネルのつまみ。数 px、領域の内側へはみ出す）があり、窓がそれを覆わないため。

| 部品 | 役割 | PR |
|---|---|---|
| `DisplayPanelHead.vue`（新） | 見出し 1 行: 印「スクリプト」（`DisplayScriptMark part="mark"`）・固定のラベル（`displayLabel`）・［操作する］・［操作を終える］（`DisplayScriptMark`）・［⋮］（面のメニュー）・［たたむ］・［×］。根に `data-display-chrome`・`data-display-head`。props は `info`（その面）と `collapsible`。emit は無い（ボタンは、ストアの操作と `withDisplayChange` を自分で呼ぶ）。ボタン以外の場所（印とラベルの入れ物）が、D&D のつかむ場所で、そこに `data-display-grip` を付ける（根には付けない）。
`PanePanel.vue` の今の見出しを移すが、**印「スクリプト」は、省略されるラベルの箱の外へ出す**（今はラベルの中にあり、ラベルが狭いと一緒に切れる。`flex: none` の兄弟にする）。
並びは `flex-wrap: wrap`: 〔印・ラベル（省略される）〕と〔［操作する］／［操作を終える］・［⋮］・［たたむ］・［×］〕で、収まらなければ 2 行、ボタンの並びも収まらなければ、さらに折る（欠けさせない）。［⋮］［たたむ］［×］とつかむ場所に `data-display-keepfocus`（［操作する］［操作を終える］には付けない＝`DisplayScriptMark` は変えない）。
**今の印（`data-pane-panel-label`・`-fold`・`-close`）は、同じ名前・同じ意味で残す**（見出しへ移っても、`[data-pane-panel]` の子孫のまま。既存の E2E と helper が使う） | A |
| `PanePanel.vue` | 側の群れ（props: `paneId`・`side`・`dock`〔割り付けの結果〕）。`DisplayPanelHead`・タブ・題・操作中の文言・枠（`:key="placedFrameKey(active, 'dock:' + side)"`）・つまみ。**たたんだときの幅 24px の見出し（`v-if="folded"`）は消す**（群れが無ければ、部品ごと載らない）。根に `data-pane-panel`（今のまま）と `data-display-dock="<side>"` | A（側は B） |
| `PaneBands.vue` | props に `edge?`・`layout?`。**`edge` を渡さないときは、今までの動き**（その pane の帯を全部・トレイなし・メニューなし＝モバイルの `MobileShell` が使う。枠の鍵は `placedFrameKey(b, "band:plain")`）。`edge` を渡すと、その側に出す帯だけを描き、`tray.edge === edge` なら、トレイ（`row` が `band` なら `hostBandId` の帯の行の中・`own` なら専用の行）と「ほか N 件」を描く。帯ごとに［⋮］。行のアプリの部分（印・トレイ・右端のボタンの並び）に `data-display-chrome`。枠は `:key="placedFrameKey(b, 'band:' + edge)"` | A |
| `DisplayTray.vue`（新） | トレイのボタンの並び。props: `paneId`・`buttons`。ボタンは `<button data-display-tray-button data-display-name>`（浮いた窓のボタンは `aria-pressed`。押すと開閉が替わる）。中身は、種類の印（▣・❐・▭。`aria-hidden`）・面の名前・（スクリプトの面なら）`DisplayScriptMark part="mark"`。`aria-label` は「表示を開く（<名前>）」。**トレイの幅は、行の幅の 4 割まで**（`max-width: 40%`）。ボタンの名前は 12 文字ぶんで省略（`title` に全部）。`DisplayTray` が、自分の箱を `ResizeObserver` で測って、収まるボタンの数を決め、収まらない分を「ほか N」（押すと、面の一覧のメニュー）にまとめる（割り付けの関数は、幅を知らない）。
帯の行が狭いときに縮む順は、**帯の枠 → トレイ（「ほか N」だけになる）**。右端のその帯の部品（印「スクリプト」・［操作する］・［⋮］・［×］）と、左端の印は縮まない。`@mousedown.prevent`・`data-display-keepfocus`（押しても、フォーカスを取らない） | A |
| `DisplayDropZones.vue`（新） | D&D の間、落とせる場所を描く（文言つき。`pointer-events: none`）。props: `zone`（いまの場所）・`float`（中央を出せるか） | B |
| `DisplayFloat.vue`（新） | 浮いた窓 1 つ。`position: absolute`・`left/top/width/height` は割り付けの結果。`DisplayPanelHead`・題・操作中の文言・枠（`:key="placedFrameKey(info, 'float')"`）・縁と角のつかむ場所 8 つ・操作中の縁。根に `role="dialog"`（モーダルではない。`aria-modal` は付けない）・`aria-label`（固定のラベル）・`data-display-float`・`data-display-root` | C |
| `ContextMenu.vue` | メニューの対象に、`{kind: "displays", paneId}`（面の一覧）と `{kind: "display", id}`（面のメニュー）を足す。pane のメニューに「表示のメニュー…」（面があるときだけ） | A |
| `Toast.vue` | デスクトップでは、`pickToastSlot` の結果の場所に出す（モバイルは、今の「右下へ寄せる」のまま） | A |

枠の鍵（`display/framePage.ts` に足す。**置く側は、必ずこれで `:key` を作る**）:

```ts
/** 置き場所つきの枠の鍵。slot は "dock:right" | "dock:left" | "dock:top" | "dock:bottom" | "float" | "band:top" | "band:bottom" | "band:plain"（モバイルの帯）| "sheet"（モバイルの重ね表示）。 */
export function placedFrameKey(info, slot: string): string { return `${frameKey(info)}@${slot}`; }
```

### メニュー

`ContextMenu` は入れ子を持てないので、2 段に開く。項目のラベルは一意（面の名前は、pane の中で一意）。

- **面の一覧**（`{kind: "displays", paneId}`。`display_menu`・pane のメニューの「表示のメニュー…」・トレイの「ほか N」から）: 面ごとに 1 行「<種類> <名前> — <置き場所>・<開いている｜たたんでいる｜出せない>」。選ぶと、その面のメニューが、同じ位置に開く。
- **面のメニュー**（`{kind: "display", id}`。見出し・帯の行の［⋮］、面の一覧から）:

| 項目 | 出る条件 | すること | PR |
|---|---|---|---|
| 開く／たたむ | いつも（どちらか 1 つ） | `setFaceCollapsed` | A |
| 上に置く／下に置く | 帯（今と違う側だけ） | `setFaceEdge` | A |
| 右に置く／左に置く／上に置く／下に置く | パネル（今と違う側だけ） | `setFaceDock` | B |
| 浮いた窓にする | パネル（今が窓でない） | `setFaceDock(info, "float")` | C |
| キーで動かす／キーで大きさを変える | 開いている浮いた窓 | `floatKeyMode` を始める | C |
| プログラムの指定に戻す | 記憶がある（`hasFacePref`） | `resetFace` | A |
| この表示を閉じる | いつも | `controller.dismiss({id})`（今の［×］と同じ） | A |

- メニューを開く位置は、押したボタンの箱の下（キーで開いたときは、pane の本体の左上）。閉じ方・`Esc` で開く前の場所へ戻すのは、`ContextMenu` の今の決まりのまま（開く前のフォーカスが端末なら、端末へ戻る）。

### キー

| 操作 | 既定 | 動き |
|---|---|---|
| `focus_display`（今ある） | `prefix+i` | 行き先を選び直す: ① 開いているパネル（最後に操作した面〔ストアの `lastFace`〕→ 無ければ出た順。ドック・浮いた窓を問わない）→ ② たたんだパネル（開いてから移る＝利用者の操作なので、記憶に「開く」を書く）→ ③ 出ている帯 → ④ たたんだ帯（開いてから）。自動でたたまれた面は飛ばす。面が無ければ、今の知らせ |
| `display_menu`（新） | `prefix+shift+i` | フォーカス中の pane の、面の一覧のメニューを開く。面が無ければ「この pane に表示はありません」。モバイルでは、重ね表示を開く（`focus_display` と同じ）。端末版は「表示のパネル・帯はブラウザで使えます。」 |

- **モバイル**（`store.sheetAvailable` が真）では、`focus_display` は今の動きのまま（記憶を見ない・書かない。パネルは重ね表示を開く）。`display_menu` も、重ね表示を開く（`sheetRequest++`）。
- 浮いた窓の見出し・ドックの見出しのボタンにフォーカスがあるときの `Esc`: その pane の端末へ戻る（窓は閉じない）。見出しの根の `keydown` で受け、`stopPropagation` する。
- つまみのキーは、今の決まりを側ごとに一般化する: **端末の側へ向く矢印で広く・逆で狭く**（右のパネルは `←` で広く〔今と同じ〕、左は `→`、上は `↓`、下は `↑`）。`Shift` で 64px・`Home` 最小・`End` 最大・`Enter` で利用者の大きさを消す。
- 浮いた窓の「キーで動かす」「キーで大きさを変える」: 窓の根（`tabindex="-1"`）へフォーカスを移し、矢印で 16px（`Shift` で 64px）ずつ、`clampFloatRect` を通して動かす。`Enter` で確定（記憶に書く）・`Esc` で始める前へ戻す・フォーカスが窓の根から出たら確定。`Enter`・`Esc` の後、フォーカスは、モードを始める前の場所（メニューを開く前の場所＝端末か、見出しの［⋮］）へ戻す（窓の根に残さない＝端末へ打てなくならない）。その間、見出しに `aria-live` で「矢印キーで動かします（Enter で確定・Esc で戻す）」。キーは `preventDefault`・`stopPropagation`（端末へ流さない）。

## 振る舞いの詳細

### たたむ・開く

- たたむ: 見出しの［たたむ］・面のメニュー。開く: トレイのボタン・面のメニュー・`prefix+i`。どれも `setFaceCollapsed`（記憶を書く）。
- たたむと、その面の枠の部品は外れる（中身は取らない。今と同じ）。開くと、新しい枠が載り、ストアの中身（無ければ取る）を描く。
- **操作の前のフォーカスの始末**（`display/displayOps.ts` の `withDisplayChange(info, viaKeyboard, change, focusAfter)`。たたむ・開く・置き場所の変更・窓を閉じる、が全部これを通る）:
  1. `document.activeElement` が、その面の根（`[data-display-root="<id>"]`）の中にあるかを見る。
  2. 枠（iframe）にあるなら、`endEngageFrame(id)`（スクリプトの面の操作を終える）を呼び、`host.focusTerminal(paneId)` で端末へ戻す。
  3. その面の部品（見出しのボタン・トレイのボタン）にあるなら、変更の後（`nextTick`）に、決まった行き先（`focusAfter`）へ移す（下の表）。**押し方（キーボードかマウスか）は見ない**: マウスで押したときは、ボタンが `@mousedown.prevent` でフォーカスを取らないので、もともと、ここに当たらない。
  4. どの場合でも、変更の後（`nextTick`）に `document.activeElement` が `body`・文書に無い要素なら、その pane の端末へ移す。
  → 変更の前後で、フォーカスが「文書に残っているが見えない要素」「`body`」に落ちたままになる瞬間を作らない（`research.md` G5 の遮断器に数えられない）。

フォーカスの行き先は、**操作の直前に、フォーカスがどこにあったか**で決まる:

| 操作の直前のフォーカス | 変更の後の行き先 |
|---|---|
| その面の枠（iframe）の中（操作中） | その pane の端末（先に `endEngageFrame`） |
| その面の見出しのボタン（`Tab` で届いて押した・そこから開いたメニューを閉じて戻った） | たたんだ → その面のトレイのボタン／置き場所を変えた → 移った先の見出しの［⋮］ |
| その面のトレイのボタン（`Tab` で届いて押した） | 開いた → その面の見出しの［たたむ］。浮いた窓のボタンは、開閉の後もトレイにあるので、そのまま |
| 端末・ほかの場所（マウスで押した・端末から開いたメニュー・`display_menu`） | 動かさない |
| 行き先の部品が無い（自動でたたまれた等）・変更の後に `body` | その pane の端末 |

- **メニューから実行するとき**: `ContextMenu` は、項目を選ぶと「閉じる → 開く前の場所へフォーカスを戻す → 項目の処理」の順で動く（`ContextMenu.vue:161-166`）。項目の処理は、その後で `withDisplayChange` を呼ぶので、上の表が、そのまま当たる（［⋮］から開いたなら 2 行目、端末から開いたなら 4 行目）。
- **枠にフォーカスがあるときにメニューを開く**: 表示のメニュー（一覧・面のメニュー）を開く側は、開く前に、`document.activeElement` が面の枠（`iframe[data-display-frame]`）なら、`endEngageFrame` と `host.focusTerminal` で端末へ移してから開く。
  （`ContextMenu` は、開く前の `activeElement` を覚えて、閉じるときに `focus()` する。枠を覚えさせると、アプリが枠へ `focus()` することになり、スクリプトの面では「取った」と数えられる。）
- 操作中で**ない**スクリプトの枠にフォーカスがあった場合（＝取られていた）は、`withDisplayChange` は何もしない。枠が外れるときの `DisplayFrame` の片づけ（戻して、1 回知らせる）に任せる（数え方を変えない）。
- **自動のたたみ**（pane が狭くなった）で、フォーカスのあった見出しが消えたときも、手順 4（端末へ）を働かせる（`PaneFrame` が、割り付けの `auto` が変わった後の `nextTick` で見る）。
- **押しっぱなし**: `Enter`・`Space` のキーの繰り返し（`KeyboardEvent.repeat`）では、たたむ・開く・置き場所の変更を実行しない（見出し・トレイのボタンの `keydown` で、`repeat` のとき `preventDefault`）。開いた先のボタンへフォーカスが移って、押しっぱなしで往復しないため。

#### 押してもフォーカスを取らない部品と、操作中の枠（PR3 のフォーカスの番を、誤って働かせない）

`DisplayFrame.vue` は、操作中に枠の外を押すと操作を終え（`onDocPointerDown`。:408-417）、1 拍後に「まだ枠にフォーカスがあれば、取られた」と数える（`checkScriptFocus` → `focusGuard.observe`）。**押してもフォーカスを取らない部品**（`preventDefault` する部品）を、操作中に押すと、フォーカスが枠に残ったままなので、**利用者の押下が `focus_steal` に数えられる**（3 回で、その pane のスクリプトの面が閉じて、5 分の冷却）。
今の見出しの［たたむ］［×］は、押すとボタンがフォーカスを取るので、数えられない。この作業は、フォーカスを取らない部品を増やす（見出しの［⋮］［たたむ］［×］・つかむ場所・トレイのボタン・各側のつまみ・窓の縁と角）ので、次で防ぐ（`DisplayFrame.vue` は変えない）:

- それらの部品に `data-display-keepfocus` を付ける。`display/displayOps.ts` の `installKeepFocusRelease(host)`（`main.ts` で 1 回）が、`document` の `pointerdown`（capture）を聞き、
  **押した先が `[data-display-keepfocus]` の中で、`document.activeElement` が面の枠（`iframe[data-display-frame]`）なら、その場で（同期で）、その枠の pane の端末へフォーカスを移す**（`host.focusTerminal(paneId)`。pane は、枠の祖先の `[data-pane-id]`。見つからなければ `host.focusSelectedTerminal()`）。
  1 拍後の確認の時点では、フォーカスは枠に無いので、数えられない。静的な形式の枠でも同じに働く（操作中の表示が、押した瞬間に消える）。
- 今のパネルの幅のつまみ（`useResizeDrag` が `preventDefault` する）でも、同じことが起きうる（PR3 の木での疑い。確かめていない）。パネルのつまみは、この作業で `data-display-keepfocus` を付けるので、直る。
  分割の境目・サイドバーの境目（表示の面の部品ではない）は、この作業では触らない（`decisions.md` D15 に、PR3 の側へ知らせる点として残す）。

### 置き場所の変更

- `setFaceDock`（パネル）・`setFaceEdge`（帯）。`faces` と `names` の両方に書く。枠の鍵（`placedFrameKey`）が替わるので、枠は作り直しになる。
- 移った面は、移った先の側の「選んでいるタブ」になる（`activeBySide`）。
- 浮いた窓 → ドック、ドック → 浮いた窓でも同じ。窓の矩形の記憶（`rect`）は消さない（もう一度浮かせると、前の位置）。
- 端末の大きさは、`ResizeObserver` → 既存の道で、1 回だけ変わる（葉の箱が変わったときだけ `client.view`）。浮いた窓どうし・窓の移動では、葉の箱は変わらない。

### D&D（`display/dockDrag.ts`。PR-B。浮いた窓は PR-C）

- つかむ: 見出しの `[data-display-grip]`（ボタンの上は除く）で `pointerdown`（左ボタン）。`setPointerCapture`。フォーカスは移さない（`preventDefault`）。6px 動くまでは、ただの押下（何もしない）。
- 動かす: `store.dockDrag = {id, paneId, zone}`。`zone` は `dockZoneAt(本体の箱, x, y, {float})`（純粋）:
  箱の外 → `null`。箱の中では、4 つの縁までの距離（幅・高さで割った比）のうち最小のものが 0.22 以下なら、その縁の側。そうでなければ `float`（`float` が偽なら `null`）。
  `DisplayDropZones` が、5 つの場所と文言（「上に置く」ほか）を描き、いまの場所を強調する。いまの置き場所と同じ場所は「ここにあります」。
- **浮いた窓をつかんだとき**（PR-C）: 窓は、ポインタに付いて、その場で動く（`moveFloatRect`。スタイルだけ）。ポインタが、本体の箱の縁から 16px 以内に入ったときだけ、その側が落とせる場所として強調される（窓を縁の近くへ寄せるだけで、ドックに吸われないように、ドックのときより狭い）。
- 離す: `zone` が側なら `setFaceDock`、`float` なら `setFaceDock(info, "float")` と、離した位置を左上にした矩形（丸める）を `setFaceRect`。`null`・今と同じ場所なら、何もしない（浮いた窓の移動だけは、位置を `setFaceRect`）。
- 取り消し: `Esc`（`keydown` を capture で受け、`preventDefault`・`stopPropagation`）・`pointercancel`・`lostpointercapture`・`view.modalOpen` が真になった（`PaneFrame` の名前の D&D と同じ watch）・部品が外れた。浮いた窓は、始める前の矩形へ戻す。
- ドラッグの間、`<html>` に `soda-display-dragging` を付け、`iframe[data-display-frame] { pointer-events: none }`（枠の上でもポインタを取りこぼさない。U4 の備え）。ドラッグ中のキーは、端末へ流さない。
- **pane の D&D との見分け**: つかむ場所が別（pane は名前のラベル `.pane-frame-name`、面は見出し）。状態が別（`view.paneDrag` と `store.dockDrag`。ポインタの捕捉は 1 つなので、同時には起きない）。面の D&D は、自分の pane の外へは落とせない。
  pane の D&D の落とし先の判定（`closest("[data-pane-id]")`）は変えない（パネル・窓の上へ落としても、その pane への落とし）。pane を落とす場所の表示（`.pane-frame-zone`）に `z-index: 30` を付け、浮いた窓の上に出す。

### つまみ（各側。PR-B）

- 今の `PanePanel` のつまみ（`useResizeDrag`）を、側ごとにする: 左右の側は `axis: "x"`、上下は `axis: "y"`。ドラッグの間は `guide`（案内の線。`emit("guide", { side, px } | null)`。`px` は、その側の縁から測った、いま指している大きさ）を親へ知らせるだけで、大きさは変えない。
  案内の線（`.pane-frame-guide`）は、**本体（`.pane-frame-body-displays`。`position: relative`）の直下**に置き、本体の箱を基準に、`side` と `px` と、その側の外にあるもの（帯の行・上下のパネル）の大きさから位置を決める（今の、`.pane-frame-row` の中の `right: <px>` を置き換える。右だけのとき、見える位置は今と同じ）。離したとき `setSideSize` を 1 回。`Esc` で取り消し・ダブルクリックで `clearSideSize`。
- 範囲は、割り付けの結果の `min`・`max`。`role="separator"`・`aria-orientation`（左右の側は `vertical`、上下は `horizontal`）・`aria-valuenow/min/max`。
- ダイアログが開いたら `finish()`（`Sidebar`・`Splitter` と同じ watch を、ここにも足す。今は無い。`research.md` F19）。

### 浮いた窓（PR-C）

- **出す**: `effectiveDock` が `float` で、たたんでいない面。矩形は割り付けの結果（記憶 → 無ければ `defaultFloatRect`）。出たとき、フォーカスは動かさない。
- **動かす・大きさを変える**: 見出し（D&D と同じつかむ場所）と、縁・角の 8 つのつかむ場所（幅 6px。角は 12px）。`useResizeDrag` と同じ決まり（左ボタン・捕捉・rAF で 1 回・`Esc`・ダイアログで確定）で、**その場で**スタイルを変える（端末の箱は変わらないので、`client.view` は出ない）。離したとき `setFaceRect`。
- **重なり**: 層の中の窓は、`z-index: 20 + floatOrder の位置`（`floatOrder` は pane ごとの、面の id の並び。末尾が前）。**`v-for` の配列の順は、出た順のまま**（DOM を並べ替えない＝iframe が動かない）。並びの決まり（純粋な関数 `raiseFloat`・`insertFloat`。`floatGeometry.ts`）:
  1. **操作中の面（`focusedDisplayId`）の窓は、いつも最前面**。面が操作中になったら、末尾へ移す。
  2. 利用者が窓を押した（`pointerdown` の capture）ら、その窓を末尾へ。ただし、操作中の別の窓があれば、その 1 つ後ろまで（別の窓を押すと、操作中の窓は操作が終わる＝`DisplayFrame` の今の動き。終わった後は、次に押したときに最前面になる）。
  3. **新しく出た窓・開き直した窓は、操作中の窓があれば、その 1 つ後ろ**に入れる（操作中の窓が無ければ最前面）。プログラムが後から出した窓で、操作中の窓の見出し（印・［操作を終える］・操作中の文言）を覆えない。
- **閉じる**: ［たたむ］か、トレイのその窓のボタン（`setFaceCollapsed(info, true)`。ボタンは、開いている間もトレイにある）。面そのものを閉じるのは［×］。
- **領域が変わったとき**（pane の大きさ・ドックの開閉・帯の出入り）: 割り付けが `clampFloatRect` で中へ寄せる。記憶は変えない（広がれば、元の位置へ戻る）。領域が最小より小さくなったら、自動でたたむ。
- **tab・workspace・拡大・分割**: 窓は pane の DOM の中にあるので、pane が外れれば一緒に外れ、戻れば、記憶の位置で作り直される（ドックのパネルと同じ。`research.md` F5）。
- 窓の背景は不透明（見出しはアプリの色・枠は今の `--soda-bg`）。操作中の縁・端末を薄くする表示は、ドックのパネルと同じ。

### プログラムの指定と、利用者の記憶

| 場面 | パネルの置き場所 | たたみ |
|---|---|---|
| 記憶なし・指定なし | 設定 `displayPanelDock` | 設定 `displayPanelInitial` |
| 記憶なし・`--dock bottom` | 下 | 設定 |
| 記憶なし・`--collapsed` | 設定 | たたむ |
| 記憶なし・設定「たたむ」・`--collapsed` なし | 指定か設定 | たたむ（プログラムは開かせられない） |
| 同じ名前の記憶あり（別の pane で決めた） | その置き場所 | （引き継がない）設定か指定 |
| この pane で利用者が、その面を 1 回でも操作した（開く・たたむ・移す・窓を動かす、のどれでも） | 記憶（操作の時点の値） | 記憶（操作の時点の値） |
| 利用者が操作した後、プログラムが指定を変えて `set` | 記憶のまま | 記憶のまま |
| 「プログラムの指定に戻す」 | 指定 → 設定 | 指定・設定 |

- 記憶の無い面は、プログラムが `set` のたびに指定を変えると、そのたびに置き場所が変わる（枠は作り直し）。`close` → `set` で出来ることと同じで、`set` の頻度の上限（毎秒 10 回）の内。利用者が 1 回でも動かせば、止まる。

### 知らせの位置（`display/toastSlot.ts`。PR-A。純粋）

```ts
/** 右の縁の帯 [stripLeft, stripRight] の中で、chrome の矩形と重ならない縦の空きを選ぶ。 */
export function pickToastSlot(a: { viewportH: number; stripLeft: number; stripRight: number; chrome: Rect[]; need: number; margin: number }): { top: number; maxHeight: number };
```

- 帯と横に重なる `chrome` の矩形を縦に並べ、`[margin, viewportH − margin]` の中の空きの区間を出す。**下から見て、高さが `need`（知らせの並びの今の高さ）以上の最初の区間**を選ぶ。無ければ、いちばん高い区間。`top`・`maxHeight` は、その区間（知らせは、区間の下端に寄せる。区間を超える分は、今までどおり `overflow-y: auto` で、区間の中でスクロールできる）。
- `Toast.vue`: 面が 1 つも無ければ、今までどおり（右上）。面があり、デスクトップなら、`document.querySelectorAll("[data-display-chrome]")` の箱を測って `pickToastSlot`。**知らせが 1 つ以上出ている間だけ**、次のときに測り直す（`nextTick` の後・1 フレームに 1 回にまとめる）: 知らせの数が変わった・ウィンドウの大きさが変わった・`[data-display-chrome]` の要素が増えた／減った（アプリの根への `MutationObserver`。`childList`・`subtree`）・その要素の箱が変わった（`ResizeObserver`）・`store.layoutRev` が変わった。
  `layoutRev` を増やすのは 2 か所: `PaneFrame` が、割り付けの結果を watch して（`flush: "post"`）変わったとき・浮いた窓のドラッグ中に矩形を変えたとき（PR-C）。
- 空きは、ふつうは十分ある（端末は 10 行以上。右にパネルがあるときは、その見出しの下の本体）。右の縁に見出しが縦に並んで、知らせの高さの空きが無いときは、いちばん高い区間に、スクロールつきで出す（重ねない）。
- `data-display-chrome` を付けるもの: 見出し（`DisplayPanelHead`）・**操作中の文言の行**・タブの行・帯の行のアプリの部分（印・トレイ・右端のボタン）。
- 負の対照で外すときは、今の「右下へ寄せる」（`toast-list-low`）へ落とす（下の帯の行と重なる）。

### 画面の名乗り

`DISPLAY_SUBSCRIBE_FEATURES` に、PR-A で `collapse`、PR-B で `dock`、PR-C で `float` を足す。古いサーバは、知らない種類を黙って捨てる（`research.md` F14）。

## PR3 の守りとの関係

| 守り（`research.md`） | この作業が足すもの | 弱めないための作り | 確かめ |
|---|---|---|---|
| G1 `load` は 1 回だけ | 置き場所の変更・たたむ／開く・帯の上下・浮いた窓の移動／大きさ／重なり | 置き場所・たたみが変わるときは、`placedFrameKey` が替わって**枠の部品ごと作り直す**（新しい合い札・`load` は 0 から）。部品は、置き場所ごとに、テンプレートの別の位置（別の親）に `v-if` で載る＝Vue は動かさずに外して作る。浮いた窓・帯の `v-for` は出た順のまま並べ替えない。窓の移動・大きさ・重なりはスタイルだけ | AC21。E2E で、すべての操作の後に `data-display-loads="1"`・面が残る・冷却に入らない。負の対照 2 つ（鍵を替えない版・重なりを DOM の順で替える版） |
| G2 固定のラベルと印 | 5 つの置き場所・最小の大きさ・トレイのボタン・**窓どうしの重なり** | 見出しは `DisplayPanelHead` の 1 つ。印「スクリプト」とボタンは `flex: none`（縮まない）、ラベルだけが省略される（今と同じ）。窓の最小の幅 240px・左右の最小 160px で、印・［操作する］・［⋮］・［たたむ］・［×］が 1 行に入らないときは、**ラベルの行と、ボタンの行の 2 行に折る**（`flex-wrap`。欠けさせない）。帯の行は、枠 → トレイの順に縮み、右端の印とボタンは縮まない。トレイのボタンにも印「スクリプト」。**操作中の窓は、いつも最前面**で、後から出た窓に見出しを覆われない（「浮いた窓」の重なりの決まり） | AC22。置き場所 5 つ × 最小の大きさで、印とボタンの矩形と `elementFromPoint`。操作中に別の窓を出しても、［操作を終える］の `elementFromPoint` が自身 |
| G3 覆いと入口 | 浮いた窓・上下左右の枠 | `DisplayFrame`・`DisplayScriptMark` は変えない（どの置き場所でも同じ部品）。トレイのボタン・D&D・メニュー・窓を前へ出す操作は、**操作を始めない**（`engageFrame` を呼ぶのは、今までどおり［操作する］と `prefix+i` だけ） | AC24。浮いた窓の覆いを押しても始まらない・［操作する］で始まる |
| G4 フォーカスの番 | 開く・動かす・前へ出す・**押してもフォーカスを取らない部品が増える**・メニュー | **操作中に、見出し・トレイ・つまみ・窓の縁をマウスで押しても、`focus_steal` に数えさせない**（`installKeepFocusRelease`。押した瞬間に、枠から端末へフォーカスを移す）。表示のメニューは、枠にフォーカスがあるときは、端末へ移してから開く（閉じるときに、枠へ `focus()` を戻させない）。アプリは、これらの操作で `iframe.focus()` を呼ばない。枠が外れるときの「取られていたら戻して知らせる」（`DisplayFrame` の片づけ）は、作り直しのたびに今までどおり働く。操作中の面をたたむ・移すときは、先に `endEngageFrame` と端末へのフォーカス | AC24。窓の中のスクリプトが `focus()` → 戻る・サーバが数える・3 回で閉じる。操作中に、見出しのボタン・トレイ・つまみ・つかむ場所を 5 回押しても、ブラウザが `focus_steal` を 1 回も送らない。負の対照（`installKeepFocusRelease` を外す） |
| G5 その画面の遮断器 | たたむ・置き場所の変更・窓を閉じる（フォーカスのあった要素が消える） | `withDisplayChange` が、変更の前に、フォーカスを端末か次の行き先へ移す。見出し・トレイのボタンは、マウスではフォーカスを取らない | AC25。操作を 20 回続けて、遮断器が落ちない・`activeElement` が `body` でない |
| G6 知らせが見出しに重ならない | 見出し・帯の行が、下・左・窓の中にも来る | `pickToastSlot`（測って、重ならない空きに出す） | AC10。帯が下・パネルが下と右・窓が右下、で矩形が重ならない |
| G7 枠からの知らせ | —（足さない） | `frameMessages.ts` を変えない。配置・位置・大きさ・たたみを変える知らせの種類を足さない。プログラムの口は、検査つきの 3 項目（初めの値）だけ | AC23。知らない種類が捨てられる単体・記憶がある面は `set` で動かない E2E |
| 浮いた窓が、押下とキーを横取りしない | 浮いた窓 | 窓の層＝端末の領域の箱（`overflow: hidden`）。窓の矩形は `clampFloatRect` で領域の 4px 内側。つまみ（22）・案内の線（25）・枠のフォーカスの線（26）は、窓より上。層は pane の DOM の中（`position: absolute`）で、メニュー（1000）・知らせ（950）・ダイアログ（top layer）より下、pane を落とす場所の表示（30）より下。モーダルでない・出現でフォーカスを取らない | AC19。窓を 4 隅へ寄せて、帯・トレイ・ドックの見出し・隣の pane・tab バーの上の `elementFromPoint` |
| スクリプトが、窓を動かせない | 浮いた窓 | 窓の矩形は、ストアの記憶と、アプリの DOM の上のポインタ・キーだけが変える。枠の中のイベントは親へ届かない（別の文書）。枠の中から窓の箱を変える API は無い（`resizeTo`・`moveTo` は、iframe では効かない。sandbox に `allow-top-navigation` も無い） | AC23。スクリプトが `window.resizeTo`・`moveTo`・`soda.action` を呼んでも、窓の矩形が変わらない |

## ドメイン固有の考慮

### 脅威と対策

| # | 脅威 | 対策 |
|---|---|---|
| L1 | プログラムが、置き場所の変更を装って面を動かし続け、利用者の押下を誘う | 利用者が 1 回操作すれば、記憶が勝つ。位置・大きさは指定できない。`set` の頻度の上限は今のまま |
| L2 | 浮いた窓が、ほかの pane・帯の行のボタン・ほかの面の印の上に重なる | 層を端末の領域で切る（D9） |
| L3 | 帯の中身が、トレイのボタンに似せた絵を描く | ボタンは枠の外。枠の箱とボタンの箱は重ならない。似せた絵を押しても、面は開かない（限界として docs に書く） |
| L4 | 置き場所の変更で `load` が増え、面が閉じる・冷却に入る（アプリ自身が、守りを誤って働かせる） | 枠を動かさない（D3）。E2E と負の対照 |
| L5 | 面を開く操作（トレイ・`prefix+i`）で、スクリプトの面がすぐ入力を取る | 開いても、覆いの下で始まる。`prefix+i` は今までどおり、キーが上がってから操作を始める（`engageEntry`） |
| L6 | 記憶（`localStorage`）に、壊れた値・大きすぎる値が入る | 読むときに項目ごとに検査・上限。矩形は、描くたびに領域の中へ丸める |
| L7 | 同じ名前を使う別のプログラムが、前のプログラムのために決めた置き場所を引き継ぐ | 引き継ぐのは置き場所だけ（たたみ・位置は引き継がない）。「プログラムの指定に戻す」で消せる。docs に書く |
| L8 | 知らせが、下・左の見出しを覆う | L 字に逃げず、測って空きに出す（D14） |

### そのほか

- **モバイル**: `MobileShell` は変えない（`MobileDisplaySheet` は枠の鍵の 1 行だけ）。`PaneBands` は `edge` を渡さないので今の動き。重ね表示は、その pane のパネルを全部（置き場所・たたみに依らず）出す＝今のまま（`store.panelsOf`）。枠の鍵だけ `placedFrameKey(active, "sheet")` にする。
  幅が 768px をまたぐと、本体ごと入れ替わる（今と同じ）。記憶は消さない。
- **別のマシン**: pane の id は UUID なので、マシンをまたいで鍵が重ならない。`names` は、マシンに依らず同じ。
- **端末版**: この work では描かない。`display_menu` は、端末版では `focus_display` と同じ知らせ。3 つの設定は、端末版の設定の画面に「ブラウザ版だけ」の注記つきで出す。端末版の描き方は `20261008-display-tui`。

## エラー処理 / 異常系

| 場面 | 動き |
|---|---|
| `localStorage` が読めない・書けない | 記憶なしで動く（その画面の間だけ、ストアの値で効く）。今の `readPrefs`・`writePrefs` と同じ |
| 記憶の値が壊れている | その項目だけ捨てる（`loadDisplayLayout`） |
| 面の `dock`・`edge` が知らない値（後の版のサーバ） | 「指定なし」として扱う |
| pane が、端末の最小（40 列・10 行）より小さい | パネル・窓は全部、自動でたたむ。帯は今の決まり（3 分の 1 まで） |
| D&D の途中で、その面が消えた・pane が閉じた・切断した | 取り消す（`dockDrag` を下ろす・クラスを外す） |
| D&D・窓の移動の途中で、ダイアログが開いた | 取り消す（D&D）／そこで確定する（窓の移動・つまみ。`useResizeDrag` の `finish()`） |
| 古いサーバへ、指定つきの `set` | sodactl が指定を落として送る（結果に `ignored`） |
| 割り付けの計算が例外を投げた | `PaneFrame` は、面なしの割り付け（端末が本体の全部）へ落とす（面は出ないが、pane は生きる）。`console.error` に 1 回（中身・題は書かない） |

## 受け入れ基準との対応

- AC1: `displayPrefs.ts` の `faces`（鍵は pane・種類・名前）と `setFaceCollapsed`。入力は、利用者の［たたむ］・トレイのボタン。単体（T5）・E2E（T10。再読み込み・出し直し・別の `localStorage`）。
- AC2: 設定 `displayPanelInitial`（T4）と `effectiveCollapsed`（記憶が無いときだけ設定を見る）。単体（T4・T5）・E2E（T10）。
- AC3: `PaneBands` の［⋮］→ `setFaceCollapsed`。`resolvePaneDisplays` の手順 1・2 が、たたんだ帯を行から外してトレイへ。単体（T6）・E2E（T10。`client.view`・箱）。
- AC4: `effectiveEdge`（記憶 ＞ 同じ名前 ＞ `info.edge` ＞ 設定 `displayBandEdge`）と、`PaneFrame` の上下の `PaneBands`。単体（T5・T6）・E2E（T10）。
- AC5: `resolvePaneDisplays` の `tray`（側・行・ボタン）と `DisplayTray`。たたんだパネルは `docks` に入らない（幅を使わない）。単体（T6・T7）・E2E（T10）。
- AC6: `DisplayTray` は、帯の枠（iframe）の兄弟の、アプリの DOM。帯の枠は自分の箱の外へ描けない（別の文書）。E2E（T10。`elementFromPoint`）・負の対照（T12 a）。
- AC7: protocol の 3 項目と検査（T1）・サーバが見出しに載せる（T2）・sodactl の引数（T3）・`effective*` が記憶を先に見る（T5）・`resetFace`（T8）。単体・結合（T1〜T3・T5）・E2E（T10）。
- AC8: sodactl が `display.features` の `layout` を見て、無ければ 3 項目を外す（T3）。画面は、知らない項目を読まない版なら今の場所（`readDisplayInfo` は知らない項目を通すだけ）。`renderers()` の 3 種類（T2）と、画面の名乗り（T7 で `collapse`・T17 で `dock`・T22 で `float`）。単体・結合（T2・T3）。
- AC9: `loadDisplayLayout`（検査・上限）・`DEVICE_LOCAL_PREF_KEYS` の `displayLayout`（T1）・`pruneLayout`・`displayPanelWidths` の引き継ぎ。単体（T5）。
- AC10: `pickToastSlot` と `Toast.vue`、固定の部品の印 `data-display-chrome`。単体（T9）・E2E（T10・T18・T25）・負の対照（T12 b）。
- AC11: `resolvePaneDisplays` の手順 3〜5 と、`PaneFrame` の部品の木（上の帯 → 上 → 左｜端末｜右 → 下 → 下の帯）。端末の箱の変化は、既存の `ResizeObserver` → `client.view`。単体（T13）・E2E（T18）。
- AC12: 側ごとの群れ（`docks[side].ids`）と `activeBySide`。`names`（同じ名前の置き場所の引き継ぎ）。単体（T5・T13）・E2E（T18）。
- AC13: `resolvePaneDisplays` の手順 3・4（範囲・両側の縮め方・自動でたたむ順）と `auto`（記憶に書かない）。単体（T6・T13）・E2E（T18）・負の対照（T20 b）。
- AC14: `PanePanel` のつまみ（側ごとの `useResizeDrag`・案内の線・`setSideSize`）。単体（T15）・E2E（T18。`client.view` の回数）。
- AC15: `dockDrag.ts`（つかむ・`dockZoneAt`・離す・取り消し）と `DisplayDropZones`。pane の D&D とは状態が別（`store.dockDrag`）。単体（T13・T16）・E2E（T18・T25）。
- AC16: 設定 `displayPanelDock`（T4・T17）と `effectiveDock` の順（記憶 ＞ 同じ名前 ＞ 指定 ＞ 設定）。単体（T5）・E2E（T18）。
- AC17: 窓は `.pane-frame-floats`（端末の箱に重なる層）にあり、葉の箱を変えない。窓のボタンは、開いていてもトレイに出る（開閉で、トレイの行が出入りしない）。単体（T21・T22）・E2E（T25。`client.view` が出ない）。
- AC18: `clampFloatRect`・`moveFloatRect`・`resizeFloatRect` と、`setFaceRect`。単体（T21・T23）・E2E（T25）・負の対照（T27 a）。
- AC19: 層の箱＝端末の領域・`overflow: hidden`・`z-index: 20`（メニュー 1000・知らせ 950・ダイアログの top layer・落とす場所の表示 30 より下）。出現でフォーカスを取らない。単体（T22）・E2E（T25。`elementFromPoint`）・負の対照（T27 b・d）。
- AC20: `floatOrder` と `z-index`（`v-for` は出た順のまま）。操作中の窓は最前面・新しい窓はその後ろ（`raiseFloat`・`insertFloat`）。窓は pane の DOM の中（pane と一緒に外れて、記憶から作り直される）。単体（T22）・E2E（T25）・負の対照（T27 c）。
- AC21: `placedFrameKey` と、置き場所ごとにテンプレートの別の位置へ置く作り（「PR3 の守りとの関係」G1）。E2E（T10・T18・T25）・負の対照（T12 c・T20 a・T27 c）。
- AC22: `DisplayPanelHead`（どの置き場所でも同じ部品・印とボタンは縮まない・狭いときは 2 行）。単体（T7）・E2E（T18・T25）。
- AC23: protocol に位置・大きさの項目が無い（T1）・`frameMessages.ts` を変えない・`effective*` が記憶を先に見る（T5）。単体（T1・T5 と、既存の `frameMessages` のテスト）・E2E（T10・T25）・負の対照（T12 d）。
- AC24: `DisplayFrame`・`DisplayScriptMark` を変えない（どの置き場所でも同じ部品）。操作中の面の変更は `withDisplayChange` が先に `endEngageFrame`。フォーカスを取らない部品の押下は `installKeepFocusRelease` が、枠から端末へ移す（`focus_steal` に数えさせない）。単体（T7）・E2E（T10・T18・T25）・負の対照（T12 f・T20 c）。
- AC25: `withDisplayChange`（変更の前にフォーカスを移す）と、ボタンの `@mousedown.prevent`。単体（T7）・E2E（T10・T18・T25）・負の対照（T12 e）。
- AC26: `PaneBands` は `edge` なしで今の動き・`MobileShell` を変えない・`MobileDisplaySheet` は枠の鍵だけ。既存の E2E（`display-mobile`・`display-script-mobile`）がそのまま通る（T10）。
- AC27: 文書（T11・T19・T26）。
- AC28: 負の対照（T12・T20・T27）。記録は `test-result.md`。
- AC-I1: トレイのボタン・面のメニュー・`focusDisplay`（開く）、見出しの［たたむ］（たたむ）。面は消えない（`dismiss` を呼ばない）。単体（T7・T8）・E2E（T10・T25）。
- AC-I2: D&D・窓の移動・つまみの「離して確定・`Esc` で戻す」（`dockDrag.ts`・`useResizeDrag`）、`floatKeyMode` の `Enter`／`Esc`、`resetFace`。単体（T15・T16・T23）・E2E（T18・T25）。
- AC-I3: `display_menu`（`prefix+shift+i`）→ 面の一覧 → 面のメニュー。メニューの項目が、D&D・ボタン・つまみで出来ることを全部持つ。単体（T8・T17・T23）・E2E（T10・T18・T25）。
- AC-I4: `withDisplayChange` の行き先（マウスは動かさない・キーボードは決まった場所）と、`ContextMenu` の「開く前へ戻す」。単体（T7・T8）・E2E（T10・T25）。
- AC-I5: ドラッグ中のキーを capture で止める・窓の層は端末の領域の中だけ・見出しの `Esc` は端末へ（窓は閉じない）・`focusDisplay` と pane の D&D の判定は変えない。単体（T8・T16・T23）・E2E（T18・T25）。
