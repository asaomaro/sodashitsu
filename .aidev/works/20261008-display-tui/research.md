# 調査: 表示の面の端末版（引数なしの `soda`）

調べた日: 2026-10-08。読んだのは、PR3（`feature/ext-display-script`。先頭 `96ed5fb`）が入った後の木の `packages/tui`・`packages/client-core`・`packages/server`・`docs/`。行番号は、その木のもの。**動かして確かめたものは無い**（読んだだけ）。

## いまの端末版と、表示の面

- T1: 端末版は、表示の面を描かない。`docs/tui-parity.md:161`（W34）「無し（面を描かない。…名乗らないので、`set` の結果の `renderers` に数えない。…`prefix+i` は『表示のパネル・帯はブラウザで使えます。』と知らせる）」。`packages/tui/src` に `display.subscribe` の呼び出しは 0 件。
  `TuiDispatcher.ts:261-264` の `focusDisplay` は知らせだけ。
- T2: 利用者の決定（`20261007-soda-extensions/decisions.md` D8）「端末版にも、文字だけのパネルを出す。ブラウザ版と端末版で、作業を分ける」。D16「面を出せる画面は、名乗りで見分ける。端末版も `desktop` と名乗る（`TuiNet.ts:118-119`）。端末版のパネルは、端末版が同じ名乗りを送るだけで足せ、出せる種類が違っても表せる」。
- T3: サーバの側。`DisplayService.subscribe`（`DisplayService.ts:330-336`）は、`isScreenKind`（`desktop`・`mobile`。`composeServer.ts:355-358`）の接続を受け、`DISPLAY_RENDER_FEATURES` にある種類だけを覚える（知らない種類は黙って捨てる）。`display.get`・`display.action`・`display.dismiss`・`display.report` は、名乗った接続が使える。
  `renderers()`（:487-498）は種類ごとに数える。**端末版が `panel`・`band` と名乗ると、ブラウザと同じ数に入る**（「HTML を描ける画面があるか」を、プログラムが見分けられなくなる）。`DISPLAY_RENDER_FEATURES_MAX = 8`。

## 描画

- T4: セルの格子と差分描画。`render/Screen.ts` の `Grid`（`set`・`fill`・`text`・`copyFrom`）と `Screen.frame`（前のフレームと違うセルだけを ANSI で出す。**セルの文字は、検査せずにそのまま出す**。:250-251）。画面の文字は、`Screen.frame` が格子から作る列として出る。
  **外側の端末への出口は、ほかにもある**: 窓の題（OSC 2。`app/terminalModes.ts:74`・`app/windowTitle.ts:83`）・クリップボード（OSC 52。`app/TuiApp.ts:878-882`）・通知（OSC 9／99／777。`notify/terminalNotify.ts:89-96`）・BEL（`TuiApp.ts:810`）・Kitty の画像（`TuiApp.ts:1210-1216`）・stderr（`app/processIo.ts:79-81`）。いまは、どれにも面の文字列は入らない。
  **`Grid.set` は、文字を検査しない**（`Screen.ts:71-101`）。制御文字を落とすのは `Grid.text` だけ。
  `Renderer.render`（`render/Renderer.ts:68`）が毎フレーム、サイドバー → tab バー → pane ごと（`paintFrame`・`paintScrollbar`・`paintPane`）→ 飾り（`extras.decorate`）→ トースト → 重ねるもの（`extras.overlay`）の順で描く。重なりの順は、この描く順で固定。
- T5: 割り付けは `layout/computeLayout.ts` の純粋な関数。`PaneBox = {paneId, frame, content, sides}`（`content` が「pane の端末の大きさとして申告する」箱。:16-24）。`box()`（:182-192）が `frame` から罫線を引いて `content` を作る。
  PTY の大きさを送るのは 1 か所（`TuiApp.visiblePanes()` → `clampTerminalSize(b.content.w, b.content.h)` → `client.view`。`app/TuiApp.ts:1148-1152`）。**`content` を削れば、PTY の大きさは自動で追従する**。同じ内容の `client.view` は送り直さない。
  `content` を使うほかの場所: `Renderer.ts:135`（描かずに前の格子から写す最適化の鍵）・`render/scrollbar.ts`・`input/mouse.ts`（`inContent`・`paneCoords`・`paneAt`）・選択の反転・落とし先の `zoneAt(box.frame, …)`。
- T6: 最小。`MIN_COLS = 20`・`MIN_ROWS = 5`（これ未満は「端末が小さすぎます」。`computeLayout.ts:81-82`）。pane の中身の最小を定める定数は無い（分割で 1 桁・1 行にもなる）。1 列表示は、幅が `tui.narrowThreshold`（既定 64）未満のとき（焦点の pane だけ・サイドバーなし）。

## 文字列を安全に描く部品

- T7: `Grid.text`（`Screen.ts:132-157`）が、chrome の文字列の出口。**C0・DEL・C1 を描かない**（取り除くだけ。ESC を落とすので、列の残り〔`[2J` など〕は文字として出る）。幅は `charWidth`（xterm の unicode11 と同じ規則）。結合文字は直前のセルへ足す。`maxWidth` で止める。
  **双方向の制御（U+202A〜202E・U+2066〜2069）は落とさない**（幅 0 なので、直前のセルへ足されて外へ出る。:147-151）。U+2028 は幅 1 のセルになる。
- T8: `plainText`（`modes/SubagentList.ts:31`）: C0・DEL・C1・U+2028/2029・双方向の制御を空白にする。`stripControl`（`client-core/src/graph/message.ts:24`）: OSC・DCS／SOS／PM／APC・CSI・その他の ESC の列・8 ビットの C1 の列を落とし、C0（改行・タブは残す）・DEL・C1・双方向の上書きを落とす。
  **面の中身には使えない**（独立点検での実測。node v24.15.0）: 終端を遅延一致で探す正規表現（:12-13・:17）なので、終端の無い `ESC ]`・`ESC P`・U+0090 が並ぶと、長さの 2 乗の時間が掛かる（256 KiB で 6〜18 秒。上限の 2 MiB では、外挿で十数分。同期なので止められない）。
  落とさないものもある: U+200B・U+200E・U+200F・U+061C・U+2060・U+FEFF・U+00AD・U+2028・U+2029・U+180E・タグ文字（U+E0000 台）・異体字セレクタ。終端の無い OSC は、始まりの 2 文字だけが落ちる。
  幅と切り詰めは `render/width.ts`（`charWidth`・`stringWidth`・`truncate`）。折り返しは `modes/overlay.ts:100` の `wrapText`（文字単位）。
- T9: **Markdown・HTML を端末向けに描く部品は無い**（`packages/tui`・`client-core` に 0 件。端末版は `sodactl ask` も出さない＝`tui-parity.md:160` の W32）。新しく作る。Markdown の字句解析のライブラリ（`marked`）が、端末版から使える依存にあるかは **未確認**。

## 重ねるもの・フォーカス

- T10: 重ねる部品は `Overlay`（`modes/overlay.ts:23-37`）で、`OverlayHost` が **1 つずつ**開く。開いている間は、キー・貼り付け・マウスを全部その部品へ渡す（`TuiApp.handleInput`。`app/TuiApp.ts:743-757`）。**開いたまま pane を操作できる（モーダルでない）重ねる部品・位置と大きさを動かせる窓の先例は無い**（近いのは `CommandPopup`。pane の真ん中に固定・全キーを取る）。
  出しっぱなしのパネル・帯は、`Overlay` ではなく、割り付け（`PaneBox`）か、飾りの層に置く形になる。
- T11: キーの行き先は、client-core の `KeyRouter` のモード（terminal・prefix・copy・navigate・resize）。**「パネルにフォーカスがある」状態は無い**（新しく要る）。
- T12: メニューは `modes/ContextMenu.ts` の `menuItems`（`{label, run}`）。pane のメニューは、マウスの右クリックでしか開けない（`docs/tui.md:68`）。

## マウスと、キーでの代わり

- T13: `input/mouse.ts` の `MouseController`。ドラッグの種類（`Drag`。:107-146）に、分割の境界・サイドバーの幅・tab・サイドバーの項目・**pane の名前**（枠の上辺をつかみ、別の pane の縁〔`zoneAt`。縁 30%〕・中央・tab・workspace へ落とす。:448-457・:792-820）がある。
  落とせる場所は、`MouseController.dropTarget` を `TuiApp.decorate` が読んで、そのセルの背景を強調色に塗る（`app/TuiApp.ts:1275-1283`）。`Esc` での取り消しは、サイドバーの項目のドラッグだけ。
- T14: 設定「マウスを使う」は共有の設定 `tui.mouseCapture`（既定は入）。切のときは「端末版の操作はキーだけ」（`docs/tui.md:187`）。キーでの代わりの先例: 境界は `resize_mode`（`prefix+r`）、入れ替えは `swap_pane_*`、並べ替えは見出しのメニューの「上へ移動」「下へ移動」。

## 状態と設定

- T15: `tui-state.json`（`local/tuiState.ts`）。型 `TuiState`（`sidebarCols`・`sidebarCollapsed`・`colorMode`・`sidebarSpacesRows`・`sidebarSectionsCollapsed`）。読みは項目ごとに型を確かめ、合わないものは捨てる。**知らないキーは、読むときに捨てる**（次の書き込みで、ファイルからも消える）。上限の丸めは、読みには無い。書きは、一時ファイル → rename・0600。
- T16: 共有の設定は `PrefsModel`（`model/PrefsModel.ts`）が読む。端末版だけの項目は `tui` の節（`SharedTuiPrefs`）。設定の画面は `settings/sections.ts`（`toggleItem`・`choiceItem`・`numberItem`。ブラウザだけの項目は `BROWSER_ONLY` の注記）。`displayScriptEnabled` を読む場所は、端末版に無い。

## テスト

- T17: 単体は vitest で、スナップショットではない。アプリごと（`testing/appHarness.ts` の `startedApp`。出力の ANSI を、試験用の外側の端末〔`OuterTerminal`。headless xterm〕へ流し、見えている文字列を比べる）・格子を直に（`Grid.rowText`・`cell`）・純粋な関数。
  本物のサーバとの結合は `packages/server/src/tui.integration.test.ts`。**`packages/e2e` に、端末版の spec は無い**。PTY で `soda` を起動して画面を読むのは、手で流す `scripts/tui-pty-verify.mjs` だけ。

## 実測していない前提

- V1: （確かめた）`Grid.text` は、双方向の制御・U+2028/2029 を落とさない（T7）。面の文字は、自前の無害化を通す。
- V2: Markdown・HTML の字句解析のライブラリは、このリポジトリのどの `package.json` にも無い（`marked`・`markdown-it`・`micromark` は 0 件）。端末版の依存に足すと、どれだけ増えるかは未確認。design で決める。
- V5: 外側の端末と、端末版の幅の表（unicode11）が食い違う文字（新しい絵文字・曖昧幅・異体字セレクタつきの列）で、面の箱の右隣のセルが壊れるか。試験用の外側の端末は同じ表を使うので、単体では見えない。
- V3: 面の領域を `content` の外に置いたとき、前の格子から写す最適化（T5）が、面の領域を描き残さないか。
- V4: 1 つの面の中身（2 MiB まで）を、端末向けに描く前処理（無害化・折り返し）に掛かる時間。
