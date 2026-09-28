# research: グラフ画面（ノードエディタ）の操作パターン

- 対象 work: `.aidev/works/20260927-agent-graph`（requirements の AC1〜AC20・AC-I1〜AC-I5・非機能要件「pane 16 個・線 32 本」「モバイルは閲覧と一時停止・再開のみ」）
- 前提: Vue 3・グラフ用ライブラリなし（decisions D10）。既存 web は `role="dialog"` の `<div>` を自前で使い、ネイティブ `<dialog>` を避けている（`packages/web/src/components/CommandPopup.vue` の注記: Esc を確実に止められないため）。テーマは `packages/web/src/theme/ThemeController.ts`。
- 調べた日: 2026-09-28。各行の末尾の [n] は末尾の出典の番号。

## 0. 結論の要約

| 操作 | 推奨 |
|---|---|
| 開閉 | prefix＋キーとサイドバーで開く／同じキー・`Esc`・閉じるボタンで閉じる。開いている間は全画面の `role="dialog"`（aria-modal）で、キー・ホイールを端末へ漏らさない |
| ノードの追加・除去 | ツールバーの「pane を載せる」ボタン→チェックリストのポップオーバー。除去は確認つき（`Delete` でも同じ確認） |
| ノードの移動 | ドラッグ（しきい値 4px 以上で開始・20px グリッドにスナップ、`Alt` で一時解除）＋矢印キー（1 グリッド、`Shift` で 5 グリッド） |
| パン・ズーム | ホイール＝パン、`Ctrl`/`⌘`＋ホイール（＝トラックパッドのピンチ）＝ズーム、空白のドラッグ／`Space`＋ドラッグ＝パン、`1` またはボタンで全体表示、`+`/`-`/`0`。ミニマップは作らない |
| 線の作成（マウス） | ノードの右端の出力ハンドルからドラッグ→ノード本体のどこへ離しても接続（ハンドルに正確に合わせなくてよい）。空白で離す・`Esc` は何も作らない。接続後に線の設定パネルを開く |
| 線の作成（ドラッグ以外・キーボード） | 「接続モード」：元ノードで `C`（またはハンドルのボタンを押す）→ 矢印／`Tab` で先のノードへ → `Enter` で確定、`Esc` で取消。クリック→クリックでも同じ（WCAG 2.5.7 対応） |
| 選択 | クリックで単一選択、`Tab`/`Shift+Tab` と矢印で移動。範囲選択・複数選択は MVP では作らない（16 ノードでは費用に見合わない） |
| 線の設定 | 右側のサイドパネル（非モーダルではなく、開いている間はグラフ操作を止める軽いモーダル）。`Enter`（単一行欄）・`Ctrl+Enter`（どこでも）・保存ボタンで確定、`Esc`・外側クリックで取消。prompt の textarea では `Enter` は改行 |
| 削除 | `Delete` と `Backspace` の両方。必ず確認ダイアログ（既定のフォーカスは「取り消す」） |
| 種類の見分け | 色だけに頼らない：色（Okabe–Ito 系）×線種（実線・破線・点線・二重線）×矢印の形×短いラベル／アイコン。ダークモードでは同じ色相で明度を上げた別トークン |
| 実行中の表示 | 線上をパルス（`stroke-dashoffset` のアニメーション）で 1〜2 秒、`prefers-reduced-motion: reduce` なら点滅なしの太さ・色の変化＋実行回数のバッジ更新のみ |
| 取り消し（undo） | MVP では作らない。代わりに破壊的操作（削除・除去）は確認、設定は「保存するまで反映しない」。同時編集（AC16）と undo の相性が悪い |
| フォーカス | 開く→直前の pane のノード（無ければ先頭）。設定を閉じる→その線。閉じる→開く前の pane。ノード→pane の移動→その pane |
| 描画方式 | DOM のノード（`<div>`、`transform` で配置）＋SVG の線（1 枚の `<svg>` を背面に）。canvas は使わない |
| 線の当たり判定 | 見えない太い透明パス（幅 16〜20px、`pointer-events: stroke`）を重ねる。加えて各線に中点のラベル（ボタン）を置き、そこをクリック・フォーカスの主な的にする |
| タッチ（モバイル閲覧） | グラフ領域は `touch-action: none`＋Pointer Events で 1 本指パン・2 本指ピンチを自前実装。編集系（ドラッグ接続・移動）は無効。一時停止・再開はノード／線を押して出るシートのボタンで |

## 1. 調べたエディタ

| エディタ | 描画 | 概要 |
|---|---|---|
| React Flow（xyflow）・Vue Flow | ノード＝HTML、線＝SVG | Web のノードエディタの事実上の標準。n8n の新しい canvas は Vue Flow の上にある [5] |
| Node-RED | SVG（d3） | フロー型。ワイヤーを線、編集は右からの「トレイ」 |
| n8n | Vue Flow | 自動化ワークフロー。線上のツールバー、空白で離すとノード作成 |
| ComfyUI | canvas（LiteGraph） | 画像生成のノード。大量ノード向けの canvas 描画 |
| Blender ノードエディタ | ネイティブ | キーボード中心（G・J・Ctrl+右ドラッグで切断） |
| Unreal Blueprints | ネイティブ | 空白で離すとピンに合う候補メニュー |
| draw.io | SVG（mxGraph） | 汎用作図。キーボードでの移動・接続が充実 |

## 2. 操作ごとの比較と推奨

### 2.1 エディタを開く / 閉じる

| エディタ | 方法 |
|---|---|
| Node-RED・n8n・ComfyUI | エディタそのものがアプリの主画面。サブ画面（トレイ・ノード詳細）は `Esc`/閉じるで閉じる。Node-RED のトレイは `Ctrl+Enter` 確定・`Ctrl+Esc` 取消 [7] |
| Blender | エディタは「領域」の種類の切替。フルスクリーンは `Ctrl+Space` |

推奨: requirements AC-I1 どおり。加えて:
- グラフ画面は全画面のオーバーレイ（`role="dialog"`・`aria-modal="true"`・`aria-label="連携のグラフ"`）。既存 `CommandPopup.vue` と同じく `<div>` で自作し、`keydown` を捕まえて `stopPropagation`（端末の xterm にキーを渡さない＝AC-I5）。
- `Esc` は「いちばん内側のものを閉じる」階層: 接続中の線の取消 → 開いているパネル/ポップオーバー → 選択の解除 → グラフ画面を閉じる。1 回の `Esc` で 1 段だけ戻す（接続中の `Esc` でグラフ画面ごと閉じる事故を防ぐ）。
- 開閉のキーは prefix＋キーで「同じキーでトグル」。グラフ画面が開いている間は prefix の他の操作を無効にするか、トグルのキーだけ通す。

### 2.2 ノードの追加 / 除去

| エディタ | 追加 | 除去 |
|---|---|---|
| Node-RED | パレットからドラッグ、`Ctrl+クリック`でクイック追加 [6] | `Delete`、`Ctrl+Delete` で前後を繋ぎ直して削除 [6] |
| n8n | 「+」・線上の「+」・空白で線を離す→ノード作成パネル [5] | `Delete` [4] |
| ComfyUI | ダブルクリックで検索 [8] | `Delete`/`Backspace` [8] |
| Blender | `Shift+A`、線を空白で離すと検索（3.1〜）[10] | `X`/`Delete`、`Ctrl+X` で繋ぎ直し |
| Unreal | 右クリックで候補メニュー [11] | `Delete` [11] |
| draw.io | ライブラリからドラッグ、ダブルクリックで追加 [12] | `Backspace`/`Delete`、`Ctrl+Delete` で接続も削除 [12] |

Sodashitsu のノードは「作る」ものではなく「既存の pane を載せる」もの（F2）。推奨:
- ツールバーの「pane を載せる」ボタン → pane の一覧（マシン別、チェックボックス、検索欄）のポップオーバー。`Esc`/外側クリックで閉じると未確定の変更は捨てる（AC-I1）。キーボードでは一覧は `role="listbox"`（`aria-multiselectable`）か、チェックボックスの列。
- 新しく載ったノードは空いている位置（既存の外接矩形の右隣、グリッドに合わせて）へ置き、全体表示を必要なら更新。
- 除去: ノードを選んで `Delete`/`Backspace` またはノードのメニュー「グラフから外す」→ 確認ダイアログ（繋がる線の本数を明記: 「この pane に繋がる線 3 本も消えます」）。AC-I2。

### 2.3 ノードの移動（ドラッグ・矢印キー・スナップ）

| エディタ | ドラッグ | キーボード | スナップ |
|---|---|---|---|
| React Flow | ノードのどこでも（`nodrag` クラスで除外） [2] | 選択中のノードを矢印で移動、`Shift` で速く [1] | `snapToGrid`/`snapGrid`（既定オフ）[2] |
| Node-RED | ドラッグ | 矢印で 1 単位 [7] | グリッドへのスナップあり |
| n8n | ドラッグ | 矢印は「隣のノードへ選択を移す」（移動ではない）[4] | 20px グリッド [5] |
| ComfyUI | ドラッグ | — | `Shift` 押しでグリッドへ、設定で常時 [9] |
| Blender | ドラッグ・`G` | `G` 後にマウス | `Ctrl` で切替 |
| Unreal | ドラッグ | 矢印で少しずつ [11] | グリッド |
| draw.io | ドラッグ（`Alt` でグリッド無視） | 矢印＝1pt、`Shift+矢印`＝グリッド 1 つ [12] | グリッド |

推奨:
- ドラッグ: ノードのヘッダ（名前の行）で開始。ポインタが 4px 以上動くまではクリック扱い（「クリックで選択」と「ドラッグで移動」を両立）。`setPointerCapture` でノード外に出ても追従。
- スナップ: 20px グリッドに常時スナップ、`Alt` 押下中は解除（draw.io と同じ）。16 ノードでは整列の手間を減らす効果が大きい。
- 矢印キー: フォーカス中のノードを 1 グリッド、`Shift+矢印` で 5 グリッド移動（React Flow・draw.io・Unreal 型）。n8n の「矢印で隣のノードへ移る」は AC-I3「ノードの選択・移動」を両方キーで満たすには移動と衝突するので、ノード間の移動は `Tab`/`Shift+Tab`（draw.io も Tab で次へ [12]）に割り当てる。
- 保存: ドラッグ終了（`pointerup`）・矢印キーの連打が止まって 300ms 後にサーバへ送る（ドラッグ中は送らない。AC16 の他ブラウザへは確定値だけ届く）。
- 移動したノードはビューの外に出たら自動でパン（React Flow の `autoPanOnNodeFocus` 相当 [1]）。

### 2.4 パン / ズーム

| エディタ | ホイール | Ctrl＋ホイール | パン | 全体表示 | ミニマップ |
|---|---|---|---|---|---|
| React Flow（既定） | ズーム（`zoomOnScroll: true`）、`panOnScroll` で切替可 [2] | ピンチ＝ズーム [2] | 空白ドラッグ（`panOnDrag`）、`Space`（`panActivationKeyCode`）[2] | `fitView` | `<MiniMap>` あり |
| n8n | パン（縦スクロール） | ズーム [4] | `Ctrl+左ドラッグ`・中ボタン・`Space+ドラッグ`・2 本指 [4] | `1` [4] | なし |
| Node-RED | スクロール | — | スクロールバー・ドラッグ | — | Navigator あり [13] |
| ComfyUI | ズーム（`Ctrl+スクロール` と記載）[8] | ズーム | `Space+ドラッグ` [8] | `.`（選択に合わせる）[8] | 近年追加 |
| Blender / Unreal | ズーム | — | 中ボタン / 右ドラッグ [11] | `Home` | なし |
| draw.io | 縦スクロール、`Shift+ホイール` 横 | `Ctrl`（`Alt`）＋ホイールでズーム [12] | `Space`/右ドラッグ [12] | `Ctrl+Shift+H` [12] | Outline パネル |

トラックパッドのピンチは、Chrome/Edge/Firefox とも `ctrlKey: true` の `wheel` イベントとして届く（事実上の標準）[14][15]。

推奨（ブラウザの文書と同じ感覚＝n8n・draw.io 型）:
- ホイール（2 本指スクロール）＝パン、`Ctrl`/`⌘`＋ホイール（＝ピンチ）＝カーソル位置を中心にズーム。理由: ノートPCのトラックパッドで 2 本指スクロールがズームになると誤操作が多い（React Flow も `panOnScroll` を用意している）。マウスホイール 1 つで「ズームしたい」人は Ctrl を足すだけで済む。
- `wheel` リスナーは `{ passive: false }` で登録して必ず `preventDefault`（ページのスクロールとブラウザのページズームを止める＝AC-I5）[16]。
- パンのドラッグ: 空白での左ドラッグ＝パン（範囲選択を作らないので空白ドラッグを空けておける）。`Space+ドラッグ`・中ボタンドラッグも受ける。
- キー: `+`/`=` ズームイン、`-` ズームアウト、`0` 100%、`1` 全体表示（n8n と同じ）[4]。画面の隅にズームのボタン群（＋・−・全体表示）も置く（ポインタだけで完結・モバイルでも使える）。
- ズーム範囲 0.25〜2（React Flow 既定は 0.5〜2 [2]。16 ノードを小さな画面で全体表示するため下限を下げる）。
- 開いた直後は保存されたビュー（パン・ズーム）を復元、無ければ全体表示。ビューは端末ごと（localStorage）でよく、サーバへは保存しない（他のブラウザの見え方を動かさない）。
- ミニマップ: 作らない。16 ノードは全体表示 1 回で収まり、ミニマップの実装・キーボード対応の費用に見合わない。

### 2.5 線の作成

| エディタ | ドラッグ元 | 空白で離したとき | 取消 | キーボード/ドラッグ以外 |
|---|---|---|---|---|
| React Flow | ハンドル。`connectionRadius`（既定 20px）内でハンドルへ吸着 [2] | 何も作らない。`onConnectEnd` で「そこにノードを作る」も書ける [3] | 離す | `connectOnClick`（既定 true）でクリック→クリック [2]。キーボード接続は PR #6012 で提案中（ハンドルで Enter/Space→先のハンドルで Enter/Space、Esc 取消）[17] |
| Node-RED | ポート | 何も作らない（`Ctrl` 押下で離すとクイック追加）[6] | — | `Ctrl+クリック`でポート→先をクリック [6] |
| n8n | 出力ハンドル | ノード作成パネルを開く [5] | `Esc` | — |
| ComfyUI | スロット | 既定で文脈メニュー、`Shift` でノード検索（設定で変更可）[9] | — | — |
| Blender | ソケット | 合うノードの検索メニュー（3.1〜）[10] | 右クリック/`Esc` | `J`（選んだノード同士を繋ぐ）[18] |
| Unreal | ピン | ピンに合う候補メニュー [11] | — | — |
| draw.io | ホバーで出る矢印・接続点 | 新しい図形を複製して繋ぐ [19] | `Esc` | `Alt+Shift+矢印`: その方向に図形があれば繋ぐ、無ければ複製して繋ぐ [19] |

推奨:
- マウス: 各ノードの右端に出力ハンドル（丸、見た目 10px・当たり 24px）。そこからドラッグ → 仮の線がポインタに追従 → **先のノードの本体のどこで離しても接続**（Sodashitsu の線は「ポートの種類」を持たないので、入力ハンドルに正確に合わせさせる必要がない。React Flow の `connectionRadius` の考えを「ノード全体」に広げる）。吸着対象のノードは枠を強調。
- 空白で離す・`Esc`・元のノード自身で離す・既に同じ種類の線がある組: 線を作らずに終わる（AC-I2）。n8n/Blender の「空白で離す→追加メニュー」は採らない（載っていない pane を選ばせる UI になり、AC-I2 と矛盾する）。
- 作った直後は線の設定パネルを「新規」状態で開く（種類の選択が先頭）。パネルで `Esc`/取消したら線そのものを作らない（仮の線として持ち、保存で初めてサーバへ送る）。こうすると「設定を決めずに線だけ残る」状態が生まれない。
- ドラッグ中にビューの端へ近づいたら自動でパン（React Flow `autoPanOnConnect` [2]）。
- **ドラッグ以外の接続（WCAG 2.5.7 Dragging Movements、AA [20]）とキーボード接続（AC-I3）を同じ「接続モード」で**:
  1. 元ノードにフォーカスして `C`（またはノードのメニュー「ここから線を結ぶ」、または出力ハンドルをクリック）。
  2. 画面上部に「線の先を選んでください（Esc で取消）」の帯と live region の読み上げ。
  3. `Tab`/矢印で先のノードへ移動（元ノードは選べない）→ `Enter`/`Space` で確定、またはマウスで先のノードをクリック。
  4. 設定パネルが開く。どこでも `Esc` で何も作らずに終わる。
  これは React Flow のクリック接続・提案中のキーボード接続 [17]、Node-RED の `Ctrl+クリック` 接続 [6]、WCAG の「列の項目をクリック→相手をクリックで線が引かれる」例 [20] と同じ形。

### 2.6 選択（クリック・範囲・複数）

| エディタ | クリック | 追加選択 | 範囲選択 |
|---|---|---|---|
| React Flow | クリック | `Ctrl`/`⌘`（`multiSelectionKeyCode`）[2] | `Shift+ドラッグ`（`selectionKeyCode`）、`selectionOnDrag` で空白ドラッグ [2] |
| Node-RED | クリック | `Ctrl+クリック` [21] | 空白ドラッグで投げ縄 [21]。線は 1 本ずつ [21] |
| n8n | クリック | — | 空白ドラッグ（パンは Ctrl/Space）[4] |
| Blender | クリック | `Shift` [22] | `B`・ドラッグ [22] |
| Unreal | クリック | — | 左ドラッグ [11] |
| draw.io | クリック | `Ctrl`/`Shift` [12] | 空白ドラッグ（Rubberband）[12] |

推奨:
- MVP は単一選択だけ。対象はノードか線のどちらか 1 つ。空白クリックで解除、`Esc` でも解除（2.1 の階層）。
- 理由: 16 ノード・32 本では一括移動・一括削除の必要が小さく、範囲選択を入れると「空白ドラッグ＝パン」と競合する（n8n はパンを `Ctrl`/`Space` に逃がしている）。一括削除は確認ダイアログの文言も複雑になる。必要になれば後で `Shift+ドラッグ` の範囲選択を足せる形（選択を集合で持つ）にしておく。
- 選択とフォーカスは一致させる（フォーカスしたものが選択。React Flow は Enter/Space で選択 [1] だが、単一選択なら分ける利点がない）。

### 2.7 線の設定の編集

| エディタ | 形 | 確定 / 取消 |
|---|---|---|
| Node-RED | 右から出るトレイ（エディタは見えたまま）| 完了ボタン・`Ctrl+Enter` / 取消・`Ctrl+Esc` [7] |
| n8n | ノード詳細のモーダル（ほぼ全画面）| 自動保存、`Esc` で閉じる |
| React Flow | ライブラリ外（アプリ次第）| — |
| Blender | サイドバー（`N`）に常時表示 | 即時反映・`Ctrl+Z` |
| draw.io | 右の Format パネル／`Enter`・`F2` でラベル直接編集、`Esc` 等で終了 [12] | 即時反映・undo |

推奨: **右側のサイドパネル**（幅 360px 前後。モバイル編集は対象外なので狭い幅は考えない）。
- ポップオーバーは項目（種類・トリガの状態・prompt の複数行・行数・上限・受け付けられない時の扱い・承認待ちの扱い・一時停止・履歴へのリンク）が多すぎる。全画面モーダルはグラフ（どの線を編集しているか）が隠れる。Node-RED 型のトレイが最も近い。
- 開いている間は編集中の線を強調し、グラフの他の操作（ドラッグ・接続）は止める（未保存の値と他の操作を混ぜない）。フォーカスはパネル内に閉じ込め（APG のダイアログ [23]）、`role="dialog"`・`aria-labelledby` で「線: A → B（状態トリガ）」と名乗る。
- 確定/取消（AC-I2）:
  - 保存ボタン、`Ctrl+Enter`/`⌘+Enter`（どの欄でも。Node-RED と同じ）、単一行の入力欄・選択欄での `Enter` → 保存。
  - prompt の `<textarea>` では `Enter` は改行（prompt は複数行になる。ここで `Enter` 確定にすると改行が打てない）。この区別をパネル下部に「Ctrl+Enter で保存」と表示。
  - `Esc`・取消ボタン・外側（グラフ）のクリック → 捨てて閉じる。値が変わっていれば「変更を捨てますか」を出すかは design で決める（AC-I1 は「確定せずに閉じたら値が変わらない」なので、黙って捨てても AC は満たす。誤操作での入力消失が気になるなら確認）。
  - IME 変換中の `Enter`/`Esc` は無視（`event.isComposing`）。日本語の prompt を打つので必須。
- 他のブラウザが同じ線を同時に変えた（AC16）ときは、パネルの上に「他の場所で変更されました（再読込／上書き）」を出す。黙って上書きしない。
- 閉じたらフォーカスはその線へ戻す（AC-I4）。

### 2.8 削除（Delete/Backspace と確認）

| エディタ | キー | 確認 |
|---|---|---|
| React Flow | `deleteKeyCode` 既定 `Backspace`（a11y の説明では `Delete`）[1][2]。`onBeforeDelete` で中止・確認を挟める | なし（undo はアプリ次第） |
| Node-RED | `Delete`/`Backspace` [7] | なし、`Ctrl+Z` で戻す |
| ComfyUI | `Delete`/`Backspace` [8] | なし、undo |
| draw.io | `Backspace`/`Delete` [12] | なし、undo |

多くのエディタは「確認なし＋undo」。requirements は「確認を挟む」（AC-I2）ので、推奨:
- `Delete` と `Backspace` の両方で削除要求（macOS のキーボードには Delete が無い）。入力欄にフォーカスがある間は反応しない。
- 確認ダイアログ（`role="alertdialog"`）: 何が消えるか（線の種類・元→先・実行回数）を書き、既定のフォーカスは「取り消す」。`Enter` で既定ボタン、`Esc` で取り消し。取り消したらフォーカスは元の線/ノードへ。
- 実行中・一時停止中でも同じ確認（AC-I2）。実行中の線は「実行中です。削除しても送信済みの prompt は取り消せません」と添える。
- 線を選んだときに出る線上のボタン（n8n の線ツールバー [5] に倣う: 設定・一時停止・削除）でもポインタから削除できる。

### 2.9 線の種類の見せ方（色・破線・矢印・ラベル、色覚・ダークモード）

参考: 色だけで区別させない（WCAG 1.4.1 [24]）、線・矢印など意味のある図形は背景とのコントラスト 3:1 以上（WCAG 1.4.11 [25]）。色覚の多様性に配慮した配色として Okabe–Ito（Color Universal Design）[26]。React Flow の線は `markerEnd`（矢印）・`label`・`ariaLabel`・`animated` を持つ [27]。ComfyUI は線の描き方を Spline/Linear/Straight から選べる [9]。

推奨（4 種類 × 色＋線種＋矢印＋ラベルの 3 重の符号化）:

| 種類 | 色（Okabe–Ito 由来） | 線種 | 矢印 | ラベル/アイコン |
|---|---|---|---|---|
| 状態トリガ | 青 `#0072B2`（ダーク: `#56B4E9`） | 実線 | 塗りの三角 | 「▶ done」のように状態名 |
| 出力の受け渡し | 橙 `#E69F00`（ダーク: 同系の明るめ） | 実線・太め（2.5px） | 塗りの三角 | 「⇢ 40 行」 |
| 監督関係 | 青緑 `#009E73`（ダーク: 明るめ） | 破線 `6 4` | 白抜きの菱形（監督役側）→ 配下側に矢印 | 「監督」 |
| 承認待ちの代理 | 赤紫 `#CC79A7` | 点線 `2 3` | 白抜きの三角 | 「承認: 返答/通知」 |

- 状態トリガと出力の受け渡しは、requirements では出力の受け渡しが「トリガのときに含める」設定でもあるため、design で「種類」か「状態トリガの属性」かを決める必要がある。属性にするなら線は 3 種類＋「出力つき」の二重線表現が素直。
- 状態の重ね掛け: 無効（pane が閉じた。F10）＝灰色＋破線＋「⚠ 無効」ラベル、一時停止＝不透明度 50%＋「⏸」、上限到達＝「⛔ 上限」。いずれも色以外（記号と文字）を必ず併記。
- 色はテーマのトークン（CSS 変数）として `:root` とダーク用に 2 組定義し、ライト背景・ダーク背景それぞれで 3:1 を確認する（Okabe–Ito の黄 `#F0E442` はライト背景で 3:1 に届かないので使わない）。
- ラベルは線の中点に小さな「チップ」（`<button>`）として置き、そこが選択・フォーカスの的（2.12）。32 本でラベルが重なるときは、ズームが小さい（< 0.6）間は記号だけにする。
- 線の形は 3 次ベジェ（右の出力→左の入力）。往復（A→B と B→A）がある組は曲がりを逆向きにずらして重ならないようにする。同じ組に複数の種類があるときもオフセットを付ける。

### 2.10 実行中の表示（パルス・アニメーション・reduced motion）

- React Flow の `animated` は破線の `stroke-dashoffset` を流し続ける表現 [27]。n8n は実行中のノードに回転表示、実行後の線に件数を出す。
- 動く表現は `prefers-reduced-motion` を尊重すべき [28]。操作に連動しない動き（自動で流れるアニメ）は WCAG 2.2.2（5 秒を超えて動くものは止められること）[29]、動作に起因するアニメは 2.3.3（AAA）[30]。

推奨:
- 線が実行されたら、その線を 1.5 秒だけ「流れる破線」（`stroke-dashoffset` を CSS アニメーション）で表示し、中点のチップの実行回数を更新（例 `3/10`）。常時流し続けない（5 秒ルールに触れない、32 本が一斉に動く騒がしさを避ける）。
- 送信の結果（送った・見送った・失敗）をチップの記号で直後の 1 回だけ示す（✓・⏭・✕）。詳細は履歴。
- `@media (prefers-reduced-motion: reduce)` では流れる表現をやめ、線を一時的に太く＋チップの背景色を変える（動きなし）だけにする。
- スクリーンリーダー向けには、実行ごとに読み上げると騒がしいので、live region（`aria-live="polite"`）へは「上限に達した」「一時停止した」など利用者が気づくべき出来事だけを流す [31]。React Flow も `aria-live` の領域を持つ [1]。
- ノードの状態（5 状態）は既存の状態表示（色＋文字）を流用し、状態変化は 2 秒以内に反映（AC1）。

### 2.11 取り消し / やり直し（undo/redo）の期待

- Node-RED・ComfyUI・draw.io・Blender・n8n はいずれも `Ctrl+Z`/`Ctrl+Y` を持ち [7][8][12][5]、削除に確認を出さない代わりに undo で戻す設計。
- 推奨: **MVP では undo を作らない**。理由:
  - requirements は削除に確認を挟むこと（AC-I2）を求めており、「失われない」は確認で満たす。
  - 線はサーバで実行される実体（F4）で、複数ブラウザ・sodactl と共有される（AC15・AC16）。「他の人（や sodactl）の変更の後に自分の削除を undo」の意味が曖昧で、履歴の整合が難しい。
  - 位置の移動は失っても害が小さい。
- ただし利用者は `Ctrl+Z` を押しうるので、押したら「元に戻す機能はありません」をトーストで一度だけ知らせる程度にし、端末へは漏らさない（AC-I5）。後で足すなら「自分の直近の操作をコマンドとしてスタックに積み、サーバへ逆操作を送る」形。

### 2.12 フォーカスの管理（キーボードと支援技術）

参考: APG のキーボード操作（複合ウィジェット内は roving tabindex か `aria-activedescendant`）[32]、ダイアログのフォーカスの閉じ込めと戻し先 [23]、`aria-roledescription` は有効な role を持つ要素にだけ付け、空にせず、ローカライズする [33]。React Flow はノード・線を `Tab` で巡回でき（`nodesFocusable`/`edgesFocusable` 既定 true）、既定の role は `group`、`aria-roledescription` を `domAttributes` で付けられ、フォーカス時に自動でパンし、`aria-live` で告知する [1][2]。

推奨:
- ノード: `<div role="group" tabindex aria-roledescription="ノード" aria-label="impl（local）Claude Code・作業中・出る線 2 本・入る線 1 本">`。
- 線: 中点のチップを `<button aria-roledescription="線" aria-label="状態トリガ: impl → review（done のとき）・実行 3/10・有効">`。SVG の `<path>` そのものはフォーカスさせない（SVG 要素のフォーカス・読み上げはブラウザ差がある。チップが HTML のボタンなら確実）。
- `Tab` の順番: ツールバー → ノード（左上から読み順）→ 線のチップ → ズームのボタン。ノード数が 16 なので roving tabindex にせず全部 `Tab` で巡回してよい（React Flow と同じ）。代わりに `Tab` の順番は配置の変更に追従させる。
- フォーカスしたノード/線がビューの外なら自動でパン（React Flow と同じ [1]）。フォーカスの枠は 2px 以上・3:1、固定のツールバーやパネルに隠れないようにパンで余白を取る（WCAG 2.4.11）。
- ノードのキー: `Enter` で pane へ移動（AC2・AC-I4）、`C` で接続モード、`Delete` で除去、`P` で関係する線の一時停止（design で決める）、`?` でキー一覧。線のキー: `Enter` で設定、`Delete` で削除、`P` で一時停止・再開。
- AC-I4 の戻り先は、閉じる時点でその要素が消えていたら（他のブラウザで削除された等）隣の要素→先頭ノード→グラフ画面の見出し、の順で代替。

## 3. 描画方式: SVG / canvas / DOM（16 ノード・32 本）

| 方式 | 利点 | 欠点 | 採用例 |
|---|---|---|---|
| DOM ノード＋SVG の線 | ノードの中身（名前・状態・ボタン）を普通の Vue コンポーネントで書ける。フォーカス・読み上げ・テキスト選択・既存 CSS がそのまま。線は `<path>` で当たり判定をブラウザに任せられる | 数千要素では重い | React Flow / Vue Flow / n8n [1][5] |
| 全部 SVG | 1 つの座標系で完結、書き出しが楽 | ノード内の複雑な UI（ボタン・入力）を `foreignObject` 無しで書くのが大変。フォーカス管理の実績が弱い | Node-RED、draw.io |
| canvas | 数百〜数千ノードでも速い | 当たり判定・フォーカス・読み上げ・テキストを全部自作。a11y を別の DOM で二重に作る必要 | ComfyUI（LiteGraph）[9] |

推奨: **DOM ノード＋背面の SVG 1 枚**。16 ノード・32 本は React Flow 系が想定する規模の 1〜2 桁下で、性能の心配はない。AC-I3/I4 の要求（フォーカス・キーボード）は DOM でないと費用が跳ね上がる。
- 構造: ビューポート `<div>` に `transform: translate(x,y) scale(k)` を 1 つだけ掛け、その中に `<svg>`（線、`overflow: visible`）とノードの `<div>`（`position:absolute` で座標）を置く。パン・ズームは 1 要素の transform 変更だけ。
- ドラッグ中は `requestAnimationFrame` でまとめ、動いたノードに繋がる線だけ path を再計算（Vue の computed で線ごとに依存させれば自然にそうなる）。
- ノードの大きさは `ResizeObserver` で測り、ハンドル位置の計算に使う。
- AC17 の測定: 16 ノード・32 本でドラッグ中のフレーム時間（Performance パネルか `performance.now()`）と、状態変化から描画までの時間を design で測り方ごと決める。

### 線の当たり判定

- SVG の `<path>` は `pointer-events: stroke` で線の上だけが当たる [34]。見える線（1.5〜2.5px）とは別に、同じ `d` の透明で太い path（`stroke: transparent; stroke-width: 16〜20px`）を上に重ね、そこでクリック・ホバーを受ける（React Flow の `interactionWidth` と同じ考え [27]）。
- タッチ・キーボード向けには中点のチップを主な的にする（細い線をタップさせない）。
- 重なった線は、ホバー中・選択中の線を最前面へ（React Flow の `elevateEdgesOnSelect` 相当 [2]）。
- 接続ドラッグ中の「どのノードの上か」は `document.elementFromPoint`（または保持しているノードの矩形との当たり）で判定。ドラッグ中の仮の線自身は `pointer-events: none`。

## 4. タッチ（モバイルは閲覧＋一時停止・再開のみ）

- draw.io はタッチで「ドラッグ＝移動/パン、長押し＝選択/範囲、ピンチ＝ズーム、タップ＝メニュー」[12]。n8n は 2 本指でパン [4]。
- 推奨:
  - モバイル（既存の mobile 判定）ではグラフを読み取り専用で描く: ハンドル・ドラッグ移動・接続モード・削除は出さない。
  - グラフ領域に `touch-action: none` を付け、Pointer Events で 1 本指ドラッグ＝パン、2 本指＝ピンチズーム（2 点間の距離の比と中点）を自前で処理 [35]。`touch-action: none` は領域内のブラウザのズームも止めるので、グラフ以外（ヘッダ等）には付けず、画面の拡大縮小ボタン（＋・−・全体表示）を必ず置く（低視力の利用者向け [35]）。
  - タップ（移動 < 8px・300ms 以内）でノード/線のシートを下から出す: 状態・実行回数・履歴・「一時停止/再開」ボタン。グラフ全体の一時停止/再開は常時見えるツールバーのボタン（AC20）。
  - 16 ノードを縦長の画面で見るため、開いたら全体表示。あるいは design で「モバイルはグラフの代わりに線の一覧（リスト）」も比較候補（小さな画面ではリストの方が一時停止の操作は確実）。

## 5. design へ渡す未決事項

1. 出力の受け渡しを「線の種類」にするか「状態トリガの属性」にするか（見せ方 2.9 に影響）。
2. 設定パネルを変更ありで `Esc` したときに確認を出すか。
3. ノードの 1 文字キー（`C`・`P` など）の割り当てと、prefix キーとの衝突の有無（既存の `packages/web/src/keys`）。
4. モバイルをグラフ表示にするか、リスト表示にするか。
5. 実行回数のチップの表記（`3/10` など）と、上限到達の告知の出し先（トースト・通知・live region）。

## 出典

1. React Flow — Accessibility: https://reactflow.dev/learn/advanced-use/accessibility
2. React Flow — `<ReactFlow />` API（既定値: zoomOnScroll, panOnScroll, panActivationKeyCode, selectionKeyCode, multiSelectionKeyCode, deleteKeyCode, connectionRadius, connectOnClick, autoPanOnConnect, elevateEdgesOnSelect, minZoom/maxZoom, nodesFocusable/edgesFocusable）: https://reactflow.dev/api-reference/react-flow
3. React Flow — Add Node On Edge Drop: https://reactflow.dev/examples/nodes/add-node-on-edge-drop
4. n8n Docs — Keyboard shortcuts: https://docs.n8n.io/build/keyboard-shortcuts
5. DeepWiki — n8n Workflow Canvas and Node Management（Vue Flow 上の Canvas.vue、20px グリッド、線上ツールバー、historyStore）: https://deepwiki.com/n8n-io/n8n/6.2-workflow-canvas-and-node-management （二次資料）
6. Node-RED — Wires: https://nodered.org/docs/user-guide/editor/workspace/wires
7. FlowFuse — Node-RED Keyboard Shortcuts（Ctrl+Enter / Ctrl+Esc でトレイの確定/取消、矢印で移動、Ctrl+Z/Y）: https://flowfuse.com/node-red/keyboard/
8. ComfyUI — Keyboard and Mouse Shortcuts: https://docs.comfy.org/interface/shortcuts
9. ComfyUI — LiteGraph (Canvas) Settings（Link Release、Snap to Grid、Link Render Mode、Low Quality Rendering）: https://docs.comfy.org/interface/settings/lite-graph
10. Blender — Node Editor: Link Drag Search Menu（3.1）: https://projects.blender.org/blender/blender/commit/11be151d58e ／ https://developer.blender.org/docs/release_notes/3.1/
11. Unreal Engine — Blueprint Editor Cheat Sheet: https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-editor-cheat-sheet-in-unreal-engine
12. draw.io — Keyboard shortcuts（一覧 SVG）: https://www.drawio.com/docs/reference/shortcuts/ ／ https://app.diagrams.net/shortcuts.svg
13. Node-RED — Workspace（Navigator・ズーム）: https://nodered.org/docs/user-guide/editor/workspace/
14. Chromium — trackpad pinch を ctrl+wheel として送る: https://issues.chromium.org/issues/40332613
15. Kenneth Auchenberg — Detecting multi-touch trackpad gestures in JavaScript: https://kenneth.io/post/detecting-multi-touch-trackpad-gestures-in-javascript
16. MDN — Element: wheel event（passive と preventDefault）: https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event
17. xyflow PR #6012 — feat(a11y): create connections with keyboard（2026-09 時点で open）: https://github.com/xyflow/xyflow/pull/6012 ／ issue #5620: https://github.com/xyflow/xyflow/issues/5620
18. Blender Manual — Editing Nodes（Make Links `J`、Cut Links `Ctrl+RMB`）: https://docs.blender.org/manual/en/latest/interface/controls/nodes/editing.html
19. draw.io — Alt+Shift+arrow keys to clone and connect shapes: https://www.drawio.com/blog/shortcut-clone-connect
20. WCAG 2.2 Understanding SC 2.5.7 Dragging Movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
21. Node-RED — Selection: https://nodered.org/docs/user-guide/editor/workspace/selection
22. Blender Manual — Selecting Nodes: https://docs.blender.org/manual/en/latest/interface/controls/nodes/selecting.html
23. WAI-ARIA APG — Dialog (Modal) Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
24. WCAG 2.2 Understanding SC 1.4.1 Use of Color: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
25. WCAG 2.2 Understanding SC 1.4.11 Non-text Contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
26. Okabe & Ito — Color Universal Design: https://jfly.uni-koeln.de/color/
27. React Flow — Edge type（animated, markerEnd, label, ariaLabel, focusable, interactionWidth）: https://reactflow.dev/api-reference/types/edge
28. MDN — prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
29. WCAG 2.2 Understanding SC 2.2.2 Pause, Stop, Hide: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
30. WCAG 2.2 Understanding SC 2.3.3 Animation from Interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
31. MDN — aria-live: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live
32. WAI-ARIA APG — Developing a Keyboard Interface（roving tabindex / aria-activedescendant）: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
33. WAI-ARIA 1.2 — aria-roledescription: https://www.w3.org/TR/wai-aria-1.2/#aria-roledescription
34. MDN — SVG pointer-events 属性: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/pointer-events
35. MDN — CSS touch-action: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action

注: [5] は二次資料（n8n のソースの解説）。n8n の「空白で離すとノード作成パネル」は同資料の記述で、一次資料で未確認。xyflow のキーボード接続 [17] は未マージの提案。WCAG 2.4.11 の本文は取得していない（一般知識による）。
