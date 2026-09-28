# research: 端末版の描画・入力・外側の端末の機能（cli-mode）

調査日: 2026-09-28。対象: `/workspaces/sodashitsu`（feature/cli-mode）・herdr 0.9.1 のソース（`scratchpad/herdr/src`）。
リポジトリのファイルは変更していない。実験のスクリプトはこのファイルと同じ場所に置いた（`probe.cjs`・`bench.cjs`・`bench2.cjs`。repo の `node_modules` を読むだけ）。

---

## 0. 結論（推奨）

1. **描画はクライアント側で pane ごとに `@xterm/headless` 6.0.0 を持ち、自前のセル格子の合成と差分描画で出す。** TUI フレームワーク（blessed 系・ink・terminal-kit・OpenTUI）は使わない。
   - サーバへの接続は Web 版と同じ経路（`pane.subscribe` → SNAPSHOT＋OUTPUT）をそのまま使える。新しいプロトコルは要らない。
   - 差分描画の組み立ては herdr の `protocol/render_ansi.rs` の手順を写す（同期出力 `?2026`・描く間はカーソルを隠す・変わったセルだけ CUP＋SGR・全角の後ろの無効化・最後に焦点の pane のカーソルへ置く＝IME の候補窓の位置）。
   - サイドバー・tab バー・ポップアップも同じセル格子に描く（小さな自前の部品層）。
2. **入力は stdin の raw バイト列を自前で分解する**（herdr の `raw_input.rs` と同じ方針）。Node 24.2.0 以降は Windows でも `setRawMode(true)` が `ENABLE_VIRTUAL_TERMINAL_INPUT` を立てる（後述）ので、Windows Terminal でも SGR マウス・ブラケットペースト・フォーカスが VT のまま届く。`engines` を `>=24.2` にするか起動時に確かめる。
3. **IME は外側の端末が処理する。** 端末版がすべきことは「毎フレームの最後に本物のカーソルを焦点の pane の入力位置へ置く」ことだけ（herdr も同じ）。
4. **通知は外側の端末ごとに OSC 9 / 777 / 99 を選び、tmux の中では DCS passthrough で包む。** Windows Terminal は OSC 777 に 2026-06 に対応したが既定で無効（`compatibility.allowOSC777`）。VS Code の統合端末・Konsole・Alacritty はどれにも非対応 → ベルと画面内の知らせに落とす。
5. **コピーは OSC 52 を外側の端末へ書く**（SSH 越しでも効く唯一の手段）。gnome-terminal（VTE）は OSC 52 非対応なので、手元で動いているときだけ OS のクリップボードのコマンドへ落とす。
6. **Kitty graphics の透過は「後続（非対応候補）」を推す。** Windows Terminal に経路が無く、herdr 自身も「端末依存」扱い。

代案（herdr 0.9 の「client-rendered shell」方式＝サーバが VT を持ちセル格子の差分を送る）も検討したが、新しいプロトコルとサーバ側の描画が要るため初手には推さない（§2.4）。

---

## 1. 合成の方式：クライアント側の VT（`@xterm/headless`）＋自前の差分描画

### 1.1 既に入っているもの

`node_modules/.pnpm` にある端末系の包み（`ls node_modules/.pnpm | grep -iE 'xterm|blessed|ink|terminal-kit|string-width|…'` の実行結果）:

| 包み | 版 | 使っている所 |
|---|---|---|
| `@xterm/headless` | 6.0.0 | server（`packages/server/package.json:20`） |
| `@xterm/addon-serialize` | 0.14.0 | server（`packages/server/package.json:19`） |
| `@xterm/xterm` | 6.0.0 | web |
| `@xterm/addon-unicode11` | 0.9.0 | web（`packages/web/package.json:16`） |
| `@xterm/addon-image`・`-search`・`-web-links`・`-webgl` | — | web |
| `ansi-regex@5`・`strip-ansi@6`・`ansi-styles@4` | — | 間接依存 |
| `node-pty` | 1.2.0-beta.15 | server |

blessed・ink・terminal-kit・string-width は入っていない。`packages/cli/package.json` の依存は `@sodashitsu/protocol` と `ws` だけ。

### 1.2 `@xterm/headless` 6.0.0 のバッファの API（型定義）

型定義: `node_modules/.pnpm/@xterm+headless@6.0.0/node_modules/@xterm/headless/typings/xterm-headless.d.ts`

- `terminal.buffer: IBufferNamespace`（622 行）→ `active` / `normal` / `alternate`（1016・1021・1027 行）。`IBuffer.type: 'normal' | 'alternate'`（958 行）＝代替画面の判定。
- `IBuffer.cursorX` / `cursorY`（971・965 行）、`viewportY`（976）、`baseY`（982）、`getNullCell()`（1006。セルの読み出し用の使い回しオブジェクト）、`onBufferChange`（1033）。
- `IBufferLine.isWrapped`（1043）、`getCell(x, cell?)`（1063）、`translateToString(trimRight, start, end)`（1073）。
- `IBufferCell`（1079〜1180 行）:
  - `getWidth()`（1087。1＝通常・2＝全角・0＝全角の右半分）、`getChars()`（1096）、`getCode()`。
  - `getFgColorMode()` / `getBgColorMode()`（2 セルの比較用の数値）、`getFgColor()` / `getBgColor()`（1131 付近。パレットなら 0〜255、RGB なら 0xRRGGBB）。
  - `isFgRGB()` / `isFgPalette()` / `isFgDefault()`（1166〜1174）、`isBg*` 同様。
  - `isBold/isItalic/isDim/isUnderline/isBlink/isInverse/isInvisible/isStrikethrough/isOverline`（1147〜1163。戻りは number）、`isAttributeDefault()`（1179）。
- `terminal.modes: IModes`（645 行・定義は 1335〜1384 行）: `applicationCursorKeysMode`・`applicationKeypadMode`・`bracketedPasteMode`・`insertMode`・`mouseTrackingMode: 'none'|'x10'|'vt200'|'drag'|'any'`・`originMode`・`reverseWraparoundMode`・`sendFocusMode`・`synchronizedOutputMode`・`wraparoundMode`。
- イベント: `onBell`（699）・`onCursorMove`（716）・`onWriteParsed`（742）・`onScroll`（756）。`unicode: IUnicodeHandling`（640。`activeVersion` 1329 行）。

**公開の型に無いもの**（実行時の中身には有る。`probe.cjs` で確認）:

| 欲しい情報 | 公開 API | 実物の場所（minify された `lib-headless/xterm-headless.js`） |
|---|---|---|
| カーソルの表示/非表示（DECTCEM `?25`） | 無し | `_core.coreService.isCursorHidden`（`case 25:this._coreService.isCursorHidden=!1`） |
| カーソルの形（DECSCUSR） | 無し | `_core.coreService.decPrivateModes.cursorStyle` / `cursorBlink`（実測で `\x1b[5 q` → `bar`,`true`） |
| マウスの符号化（1006 SGR / 1016 SGR-Pixels / 既定） | 無し（`mouseTrackingMode` は種類だけ） | `_core.coreMouseService.activeEncoding`（`case 1006:…activeEncoding="SGR"`） |
| 下線の種類・色 | 無し | セルの `getUnderlineStyle()`（実測 `\x1b[4:3m` → 3）・`extended.underlineColor` |
| OSC 8 のリンク | 無し | セルの `extended.urlId` |
| 変わった行の範囲 | 無し | `_core._inputHandler.onRequestRefreshRows`（`{start,end}` を出す。実測 `[{"start":0,"end":0}]`） |

→ **推奨: `_core` に依らず、公開の `parser.registerCsiHandler({prefix:"?",final:"h"/"l"})` と `{intermediates:" ", final:"q"}` で DECSET/DECSCUSR を自分で追う**。サーバの `Mirror.ts:147-149` が既に同じやり方（常に `false` を返して xterm 本体の処理に委ねる。束ねられた Pm を黙って消さないための注意が 141-146 行のコメントにある）をしている。下線の種類・リンクは初期は落としてよい（下線だけは `isUnderline()` で出る）。

**実測で分かった注意点**（`probe.cjs` の出力）:
- 既定色のセルの `getFgColor()` / `getBgColor()` は **`-1`** を返した（型定義のコメントは「0」）。色の判定は必ず `isFgDefault()` 等で行う。
- `a日本` → `日` が幅 2、次のセルが幅 0・文字 `""`。全角は「幅 2 のセルを描き、幅 0 のセルは飛ばす」でよい。
- **絵文字 `👍` が幅 1 になった**（`unicode.activeVersion` が `6`）。外側の端末は多くが幅 2 で描くので桁がずれる。Web 版と同じく `@xterm/addon-unicode11`（0.9.0。既に web の依存）を読み込んで `unicode.activeVersion = "11"` にする。サーバの Mirror も 6 のまま（`Mirror.ts:102-108` で unicode の addon を読んでいない）なので、行の折り返し位置がサーバとクライアントでずれない様、両方の版を揃えるかは design で決める。
- `é`（結合文字）は 1 セルに `é` としてまとまる。

### 1.3 性能の実測（WSL2・Node 24.15.0）

- 解析の速さ（`bench2.cjs`。120×40・SGR 付きの行・日本語混じり・暖機後）: **1 pane あたり約 31 MB/s**。冷えた状態で 16 pane 同時に流すと合計約 6 MB/s（`bench.cjs`）。
- 16 pane × 120×40（76,800 セル）を **全部 `getCell` で読み直すと 1 フレーム約 4.1 ms**（`bench.cjs`）。60fps の予算 16.7ms に収まるが、毎フレーム全部読むのは避け、次の手を組み合わせる:
  - pane ごとに「汚れ」フラグを `onWriteParsed` で立て、汚れた pane だけ読む。
  - 描画は最大 60fps 程度にまとめる（`setImmediate`/タイマでの合流）。キー入力の反映は次のフレームで出るので追加遅延は最大 1 フレーム＋α で p95 50ms に収まる見込み。
  - 行単位の前回値（文字列＋属性のハッシュ）と比べ、変わった行だけセル単位で比較する。
- xterm の書き込みは 12ms ごとにイベントループへ譲る（`xterm-headless.js` の `_innerWrite` の `performance.now()-s>=12)break` → `setTimeout`）。大量出力の pane があってもキー入力と描画は止まらない。
- サーバ側の流量制御が既にある: 送り先が詰まったら出力を捨てて stale にし、戻ったら SNAPSHOT（`packages/server/src/terminal/OutputFanout.ts` の `STALE_THRESHOLD_BYTES = 2MB`・`DRAIN_LOW_WATERMARK_BYTES = 256KB`）。クライアントが遅いと `ws.pause()` で受信を止めれば自動的にこれに乗る（`packages/cli/src/wsClient.ts` の `pause()`/`resume()` のコメント）。
- 画面外の tab の pane も headless は更新し続ける必要がある（スクロールバックの保持）。重ければ「見えていない tab の pane は購読を外し、表示時に SNAPSHOT で取り直す」選択肢がある（Web 版と同じ購読モデル）。
- さらに重い場合の逃げ道: pane の VT を `worker_threads` に移し、主スレッドは合成と入力だけにする（セル格子は `SharedArrayBuffer` で渡す）。初手では不要と見る。

### 1.4 差分描画器の作り（herdr から写す手順）

herdr `src/protocol/render_ansi.rs` 1-27 行の方針と 663-705 行の実装:
1. 初回・大きさが変わったときは全部描く（`\x1b[2J` → 全セル）。以後は前フレームと比べて変わったセルだけ。
2. フレーム全体を `\x1b[?2026h` … `\x1b[?2026l`（同期出力）で包む。
3. 描く前に `\x1b[?25l` でカーソルを隠す。フレームの頭で `\x1b]8;;\x1b\\` を送り OSC 8 の状態を既知にする。
4. SGR は前のセルと違うときだけ出す。隣り合う ASCII 幅 1 のセルは CUP を省く（`next_inline_col`。578-603 行）。
5. **全角の扱い**: 前後いずれかのフレームで幅 2 だったセルの右隣は「無効化」して描き直す（`invalidated = max(affected_width, invalidated) - 1`。597-599 行）。幅 2 のセルを描いたら右の 1 セルは飛ばす（`to_skip`）。
6. 最後にカーソルを焦点の pane の位置へ置き、形（DECSCUSR）と表示を戻してから `?2026l`。
7. IME の候補窓用に、同期出力を閉じた後でカーソル位置をもう一度出す（Windows では出さない。`repeat_ime_anchor_after_sync()` が `#[cfg(windows)] false`。706-716 行）。

セル格子の表現は `Uint32Array`（文字は別の文字列表）等の平たい配列にし、`getCell` で読んだ値をそのまま詰める。

### 1.5 ライブラリの比較（2026-09 時点。`npm view <pkg> time --json` の最終公開日）

| 候補 | 最終公開 | 評価 |
|---|---|---|
| `blessed` 0.1.81 | 2015-09-03 | 保守停止。全角・truecolor・同期出力に弱い。**不可** |
| `neo-blessed` 0.2.0 | 2018-06-13 | 同上。**不可**（`@blessed/neo-blessed` 1.0.0 も 2022 で止まっている） |
| `@unblessed/node` | 1.0.0-alpha.23（2025-12） | α のまま。**不可** |
| `ink` 7.1.1 | 2026-07-16 | 保守は活発。React＋yoga で「文字列の行」を出す作り（依存に `slice-ansi`・`wrap-ansi`・`react-reconciler`・`yoga-layout`）。セル格子の合成・16 pane の高頻度更新・マウスの座標の扱いに向かない。**不採用** |
| `terminal-kit` 3.1.4 | 2026-07-19 | 保守あり。`ScreenBuffer` の差分描画は有るが、端末の判定・入力の分解も独自で、pane の VT とは別に二重の端末モデルを持つことになる。**採用する利点が薄い** |
| `@opentui/core` 0.5.12 | 2026-09-22 | `engines: { bun: '>=1.3.0', node: '>=26.4.0' }`・Zig のネイティブ部品。本製品は Node `>=24`（ルートの `package.json`）なので **不可** |
| `@xterm/headless` 6.0.0 | 6.0.0 は既存・beta は 2026-08-30 | 既にサーバで使っていて挙動を把握済み。Web 版の xterm.js と同じ解釈器なので **表示が Web 版と一致する**。**採用** |

文字幅の計算（サイドバー等の自前の文字列）: pane の中は headless が幅を出すので不要。自前の文字列には `get-east-asian-width` 1.7.0（2026-09-17）または `string-width` 8.3.0（2026-09-24）が保守されている。ただし pane 側（unicode11）と規則を揃える必要があるので、design で「どちらの規則で測るか」を決める（素朴には headless の unicode11 の表と同じ結果になる実装を選ぶ）。

---

## 2. herdr のやり方

### 2.1 構成要素

`scratchpad/herdr/Cargo.toml`: `ratatui = 0.30`・`crossterm = 0.29`・`unicode-width`・`unicode-segmentation`。VT は **libghostty-vt を同梱**して FFI で使う（`build.rs` 34-60 行 `vendor/libghostty-vt`、`src/ghostty/mod.rs`）。vt100 crate ではない。

### 2.2 2 つの描画方式（`src/protocol/wire.rs:43-48`）

```
pub enum RenderEncoding {
    /// Send full semantic FrameData values. This is the local/default mode.
    SemanticFrame,
    /// Send already-diffed terminal ANSI byte streams.
    TerminalAnsi,
}
```

- **TerminalAnsi（薄いクライアント）**: サーバが AppState を持ち、クライアントごとに ratatui の仮想バッファ（`TestBackend`）へ描き、`BlitEncoder` で ANSI の差分にして送る（`src/server/render_stream.rs:1-48`）。クライアントは受けたバイト列を stdout へ書くだけ（`src/client/frame_output.rs`）、入力は stdin の生バイトを `ClientMessage::Input { data }` で送る（`wire.rs:481-485`）。`src/client/mod.rs:1-13` の説明がこの形。
- **SemanticFrame（client-rendered shell）**: サーバが pane の VT を持ち、**pane の中身をセル（`CellData { symbol, fg, bg, modifier, skip, hyperlink }`。`wire.rs:703-716`）の格子**として送る。差分は `surface_delta`（`src/protocol/surface_delta.rs`。変わった行の範囲だけ）。クライアント（`src/client/shell/*`）がサイドバー・tab・ポップアップを自分で描き、pane の格子と合成する（`client/shell/composition.rs`）。pane ごとのメタ情報（`PaneSurfacePane`。`wire.rs:1096-1109`）に `mouse_reporting`・`sgr_pixel_mouse`・`alternate_screen_active`・スクロールの量が入る。

どちらでも最終の出力は `render_ansi.rs` の差分描画器（§1.4）を通る。

### 2.3 個別の扱い

- **pane → セル**: `src/pane/terminal.rs:2312-2420` の `render()`。ghostty の render state から行・セルを反復し、ratatui のバッファの `(area.x+x, area.y+y)` に `set_symbol`・`set_style`。行が足りない所は既定色で埋める。最後に「汚れ」をクリアし（`ghostty_clear_render_dirty`）、見えているカーソルを `frame.set_cursor_position` で置く。
- **全角**: 幅は VT 側（`basic.wide`）に従い、右半分は空の記号を置く（`ghostty_blank_symbol_for_width`）。出力時は §1.4 の 5。
- **マウスの転送**: クライアントは `hit.inner_rect`（pane の内側の矩形）で当たりを取り、`hit.mouse_reporting` なら pane へ、そうでなければ選択（`client/shell/mouse.rs:888-935`・`2185-2197`）。座標は `mouse.column - inner_rect.x` 等で pane ローカルに直す。符号化は `src/input/encode.rs:100-175`（ボタン番号＋修飾 Shift+4/Alt+8/Ctrl+16、SGR は `\x1b[<cb;col;row{M|m}`、既定形式は `\x1b[M` と 32 足しのバイト、UTF-8 形式も有る。1 始まりの座標）。
- **外側の端末の設定**（`src/client/terminal_setup.rs`）: マウスは `EnableMouseCapture`（1000/1002/1003/1006）＋必要なら `?1016h`（390-394 行）、終わりに `\x1b[?1006l\x1b[?1016l\x1b[?1015l\x1b[?1005l\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?9l`（697 行）。フォーカス（`EnableFocusChange`）とブラケットペーストを戻す（466-471 行）。kitty keyboard を push/pop（480-497 行。Windows では何もしない）、modifyOtherKeys を `\x1b[>4;0m` で戻す（442-447 行）。
- **kitty keyboard のフラグ**: `ime_compatible_keyboard_enhancement_flags()` = DISAMBIGUATE_ESCAPE_CODES | REPORT_EVENT_TYPES | REPORT_ALTERNATE_KEYS（`src/input/model.rs:263-267`）。
- **Windows**: `SetConsoleMode` で `ENABLE_VIRTUAL_TERMINAL_INPUT`（0x0200）を立て、立ったか読み直して確かめる（`terminal_setup.rs:227-290`・`windows_virtual_terminal_input_mode` は `mode | 0x0200`）。さらに win32-input-mode `\x1b[?9001h`（510-520 行）でキーの完全な情報を取る。
- **入力の分解**: `src/raw_input.rs`。ESC 単独の判定待ちは 10ms、マウス操作中は 150ms（`RAW_INPUT_IDLE_FLUSH_TIMEOUT_MS`・`MOUSE_ACTIVE_ESCAPE_SEQUENCE_FLUSH_TIMEOUT_MS`。19-22 行付近）。出てくる事象は `Key`・`Text`・`Paste`・`Mouse`・`OuterFocusGained/Lost`・配色の返答等（`RawInputEvent`。44-66 行）。ブラケットペーストは `\x1b[200~`…`\x1b[201~` の丸ごとで判定（26-37 行）。
- **OSC 52**: pane のクリップボード書き込みはサーバからクライアントへ `ServerMessage::Clipboard { data }`（`wire.rs:1381-1384`）で運び、クライアントが自分の stdout に OSC 52 を書く（`client/mod.rs:12`、`selection.rs:358-369` の `write_osc52_bytes`。「一部の端末は BEL 終端しか受けないので BEL で出す」とコメント。手元の OS のクリップボードへ書ける場合はそちらを優先）。
- **通知**: `src/terminal_notify.rs`。`TERM_PROGRAM`・`TERM`・`KITTY_WINDOW_ID` で端末を判定し、Ghostty・iTerm2・WezTerm は OSC 9、kitty は OSC 99。判定できなければ出さない。`$TMUX` があれば `\x1bPtmux;` で包み中の ESC を二重にする（`wrap_tmux_passthrough`）。本文から ESC・BEL・0x9c を除き改行を空白に。
- **入れ子**: 環境変数 `HERDR_ENV=1` の中で起動したら拒否（`experimental.allow_nested` で許可）。`src/main.rs:3-4, 444-470`。
- **tmux の中**: 動かしてよい（`docs/versions/0.9.1/.../agents.mdx:90`「Herdr can run inside tmux as the outer terminal environment」）。
- **Windows の既知の限界**（`docs/versions/0.9.1/.../windows-beta.mdx:57-68, 89-91`）: CJK IME の候補窓の位置は partial、Kitty graphics は端末依存、カーソルの描画は partial（ConPTY 由来のちらつきは避けられないと明記）。

### 2.4 本製品への当てはめ

| | A: クライアント側 VT（推奨） | B: herdr の SemanticFrame 型（サーバがセルを送る） |
|---|---|---|
| プロトコル | 既存の `pane.subscribe`・OUTPUT・SNAPSHOT のまま | pane のセル格子と差分の新しいメッセージが要る |
| サーバの負荷 | 変わらない | 接続ごと・pane ごとに格子の差分を作る |
| クライアントの負荷 | 16 pane 分の VT の解析（§1.3 で足りる見込み） | 軽い |
| スクロールバック・選択・copy モード | 手元の headless のバッファで完結（Web 版と同じ構図） | サーバへ問い合わせが要る |
| pane の大きさ ≠ 自分の大きさ（F8） | headless は SNAPSHOT の cols/rows に合わせ、描くときに切り取る/余白 | 同様 |
| SSH 越しの帯域 | pane の生出力（大量出力時は多い）。流量制御で上限あり | 見える差分だけ |

A は Web 版と同じ層の構成（ブラウザの xterm.js ↔ 端末版の headless）で、サーバ・プロトコルを変えない。B は将来の最適化（遠隔の低帯域向け）として残す。

---

## 3. Node での入力

### 3.1 raw モードと Windows

- **Node 24.2.0 以降、`setRawMode(true)` は libuv の `UV_TTY_MODE_RAW_VT` を使う**。`src/tty_wrap.cc` の `TTYWrap::SetRawMode`:
  - v24.15.0: `uv_tty_set_mode(&wrap->handle_, args[0]->IsTrue() ? UV_TTY_MODE_RAW_VT : UV_TTY_MODE_NORMAL);`（https://raw.githubusercontent.com/nodejs/node/v24.15.0/src/tty_wrap.cc）
  - v24.0.0・v24.1.0・v22.9.0: `uv_tty_set_mode(&wrap->handle_, args[0]->IsTrue());`（＝`UV_TTY_MODE_RAW`）。v24.2.0 から `RAW_VT`（各タグの `tty_wrap.cc` を取得して確認）。
  - 変更は nodejs/node PR #58358「tty: use terminal VT mode on Windows」（commit db2aae8、2025-05-18）。説明:「the terminal itself translate keypresses into control sequences」「required to support some control sequences at all on Windows, such as bracketed paste mode」。
  - libuv の定義: `UV_TTY_MODE_RAW_VT`「Raw input mode. On Windows ENABLE_VIRTUAL_TERMINAL_INPUT is also set.」、`UV_TTY_MODE_RAW`「On Windows, ENABLE_WINDOW_INPUT is also enabled」（https://docs.libuv.org/en/v1.x/tty.html）。
  - さらに 2026-08-23 の commit 0b89f8f（PR #64140「tty: add raw-vt and io raw modes」）で `setRawMode('raw'|'io')` が足された。版は未割り当て（REPLACEME）。この環境の Node 24.15.0 の `lib/tty.js` は `flag = !!flag` のまま（`node -e` で関数の中身を表示して確認）。
- **古い経路の既知の問題**（`UV_TTY_MODE_RAW` のとき＝Node 24.1 以前）:
  - Windows Terminal でマウスの列が届かない（nodejs/node issue #56338、v22.9.0、not planned で閉じ。libuv が `ReadConsoleInput` の記録から自前で VT を作り、マウスを含めないため）。
  - Shift+Enter・Alt+Enter が Enter と同じ `\r` になる（anthropics/claude-code issue #92771。libuv の変換表が `VK_RETURN` で修飾を見ない。回避策として `ENABLE_VIRTUAL_TERMINAL_INPUT` を挙げている）。
  - → **端末版は Windows では Node 24.2.0 以上を要求する**（ルートの `engines` は `>=24` なので、起動時に `process.versions.node` を確かめて案内するか engines を上げる。design で決める）。
- 実機（Windows Terminal ＋ Windows ネイティブの Node）で SGR マウス・ブラケットペースト・フォーカスが届くことは **未確認**（この環境は WSL2）。design/test で実機確認の項目に入れる。
- herdr は更に win32-input-mode（`?9001h`）を使う（§2.3）。本製品では VT 入力で足りるなら使わない（Node は `ReadConsoleInputW` の記録から文字を取り出すので、`?9001` の列もそのまま文字として届くはずだが未確認）。

### 3.2 分解する列（自前の分解器）

既存の `AttachKeyFilter`（`packages/cli/src/attachKeys.ts`）はバイト単位の prefix 判定だけなので、端末版には次を扱う分解器を新しく書く（herdr の `raw_input.rs` を参考に。Apache-2.0 の表示に注意）:
- 通常のキー: C0（Ctrl+A〜Z）、`ESC x`（Alt）、CSI の矢印・機能キー（`CSI 1;<mod> A` 形式の修飾 = 1+Shift1+Alt2+Ctrl4）、SS3（`ESC O A`）。
- ESC 単独と列の頭の区別: タイムアウト（herdr は 10ms、マウス中 150ms）。
- SGR マウス `CSI < b ; x ; y M/m`（1006）。1016（ピクセル）は使わない。
- ブラケットペースト `CSI 200~ … CSI 201~`（途中で読み取りが分かれる前提で持ち越す）。
- フォーカス `CSI I` / `CSI O`（外側に `?1004h` を出したとき）。
- 外側の端末への問い合わせの返答（DA1・kitty フラグ `CSI ? flags u`・OSC 10/11 の色・`CSI ? 997 ; n n` の明暗）を入力と混ぜない。
- 修飾付きキー（Ctrl+Shift+X 等）を区別したい場合: kitty keyboard（`CSI > flags u` で push、`CSI < u` で pop）を外側が対応していれば使う。対応端末: kitty・WezTerm（設定 `enable_kitty_keyboard`）・Ghostty・foot・**Windows Terminal 1.25 Preview 以降**（https://4sysops.com/archives/windows-terminal-preview-125-kitty-protocol-settings-search-and-gui-for-key-bindings/）。VS Code の統合端末（xterm.js）は非対応: `@xterm/xterm@6.0.0` の `lib/xterm.js` に `kitty` の文字列が 0 件（`grep -c`）。
  - **pane 側は kitty keyboard を持たない**（サーバの Mirror も Web の xterm.js も非対応。上の grep）。外側で kitty を有効にしたら、pane へ送る前に**従来の列へ戻す**変換が要る。初期は kitty を使わず、prefix（Ctrl+B＝0x02）方式だけにするのが安全。Web 版の直接キー・カスタム割り当てで従来の列で区別できない組（例 Ctrl+Shift+文字・Ctrl+Enter の一部）は「端末では不可」と AC15 の表に書くか、kitty 対応端末でだけ効くとする。

### 3.3 pane へ送る列の組み立て

- キーは基本的に外側の端末が作った列をそのまま送る。ただし pane の `applicationCursorKeysMode` と外側の状態が違う（外側は通常モード）ので、矢印・Home/End は pane のモードで `CSI A` ↔ `SS3 A` を付け替える（herdr の `encode.rs:85-95` 付近が同じことをしている）。サーバの `Mirror.inputModes()`（`Mirror.ts:179-184`）と同じ判定を手元の headless の `modes` でできる。
- 貼り付け: 外側から受けたペースト本文を、pane の `bracketedPasteMode` が真なら `\x1b[200~`…`\x1b[201~` で包み、偽なら生で送る。本文中の `\x1b[201~` は取り除く（包みの抜け出し対策）。
- マウス: pane の `mouseTrackingMode`（none/x10/vt200/drag/any）で送る事象を絞り、符号化（SGR か既定か）は §1.2 の方法で追った値で herdr の `encode_mouse_cb` と同じ形に作る。Shift を押しながらのドラッグは端末版の選択に回す（tmux・herdr と同じ慣習）。
- フォーカス: pane の `sendFocusMode` が真のときだけ `CSI I/O` を送る。外側のフォーカスの出入りと、端末版の中での pane の切り替えの両方で送るかは design。

### 3.4 IME

- TUI では IME の変換は外側の端末（とその OS の IME）が行い、確定した文字列だけが UTF-8 として stdin に届く。端末版は変換中の文字を知らない。
- 候補窓の位置は外側の端末の**本物のカーソル位置**で決まる。herdr は毎フレームの最後に焦点の pane のカーソルへ本物のカーソルを置き、同期出力の後にもう一度置く（`render_ansi.rs:12-17, 684-716`。「external IMEs can place candidate windows at the real input position」）。pane がカーソルを隠していても置き場所は決める（690-694 行のコメント）。
- Windows では完全ではない（herdr の windows-beta 表で「CJK IME composition anchoring: partial」）。

---

## 4. 外側の端末の機能

### 4.1 デスクトップ通知

| 端末 | OSC 9 | OSC 777 | OSC 99 | 出典 |
|---|---|---|---|---|
| Windows Terminal | ✗（ConEmu 系の別機能。9;4 進捗等） | ✓（**既定は無効**。`compatibility.allowOSC777`、窓に焦点がある間は出さない。PR #20012 が 2026-06-04 に main へ。安定版の版は未確認） | ✗ | https://github.com/microsoft/terminal/pull/20012 |
| WezTerm | ✓ | ✓（notify のみ） | 記載なし | https://wezterm.org/escape-sequences.html |
| kitty | ✓ | ✓ | ✓ | https://github.com/alessaba/termnotify（表） |
| Ghostty | ✓ | ✓ | ✓ | 同上 |
| iTerm2 | ✓ | ✗ | ✗ | 同上 |
| VTE（gnome-terminal 等） | ✗ | △（版・アプリ次第） | ✗ | 同上 |
| VS Code 統合端末 | ✗ | ✗ | ✗ | 同上 |
| Konsole / Alacritty | ✗ | ✗ | ✗ | 同上 |

- 判定: herdr と同じく `TERM_PROGRAM`（`WezTerm`・`iTerm.app`・`ghostty`・`vscode`）、`TERM`（`xterm-kitty`・`xterm-ghostty`）、`KITTY_WINDOW_ID`、`WT_SESSION`（Windows Terminal）で選ぶ。SSH 越しでは `TERM_PROGRAM` が届かないことが多い（SSH は既定で `TERM` だけを送る）ので、設定で明示できるようにする（design）。
- BEL（`\x07`）はほぼ全端末で音・タスクバーの点滅・tab の印になる（外側の設定次第）。**最低限の保証はベル**とし、通知の列は判定できた端末でだけ出す。
- 出す列は本文から ESC・BEL・0x9c を除く（herdr `terminal_notify.rs` の `sanitize_text`）。

### 4.2 OSC 52（クリップボード）

- 書き込み: Windows Terminal ✓（microsoft/terminal issue #2946 で実装）、WezTerm ✓（読み出しは無視。上記 wezterm の文書）、kitty・Ghostty・iTerm2 ✓、VS Code 統合端末 ✓（多バイト文字の化けが 1.123 で出て修正済み：microsoft/vscode #319821）、**VTE（gnome-terminal・Ptyxis）は未実装**（GNOME/vte issue #2495、https://miliucci.org/post/linux-terminals-osc-52-escape/）。
- tmux の中: `set-clipboard`（既定 external）で tmux が OSC 52 を外側へ中継する（`man tmux`「set-clipboard [on | external | off]」）。
- 本製品の現状: pane が出す OSC 52 は Web 版でも扱っていない（`packages/web/src/term`・`packages/server/src` に `registerOscHandler(52` が無い）。端末版では手元の headless に `registerOscHandler(52, …)` を付け、外側へ中継できる（書き込みだけ。`?` の読み出しは中継しない。`attachOutput.ts:135` も読み出しを取り除いている）。
- 選択とコピー: 端末版の選択は OSC 52（BEL 終端。herdr `selection.rs:358-360`）で外側へ書く。VTE 等で効かない場合の逃げ道として、端末版が手元（SSH でない）で動いているときだけ `wl-copy`/`xclip`/`clip.exe` を使う（herdr も `platform::write_clipboard` を先に試す）。

### 4.3 Kitty graphics の透過

- サーバには既に Kitty graphics の受け取りがある（`packages/server/src/terminal/KittyGraphics.ts`、Mirror の CSI 14t/16t の応答 `Mirror.ts:150-152`）。Web 版は `@xterm/addon-image` で描く。
- 端末版で外側へ透過するには、pane の位置・スクロール・重なり（ポップアップ）に合わせて配置を出し直す必要があり、herdr はそのための専用の層（`src/kitty_graphics.rs`・`client/direct_graphics.rs`・`client/frame_output.rs` の ID 管理）を持つ。
- **Windows Terminal はこの経路を持たない**（herdr `windows-beta.mdx:85`「Windows Terminal does not expose the Kitty graphics path Herdr uses」）。WT が対応するのは Sixel。
- tmux の中では `allow-passthrough on` が要り、しかも pane が見えているときだけ通る（`man tmux`「If set to on, passthrough sequences will be allowed only if the pane is visible」）。
- → **AC15 では「非対応（後続）」を推す**。理由: 対象の 3 環境の主力の Windows Terminal で出せない・実装量が大きい。クリップボードの画像の貼り付けは、端末は画像を stdin に流さないので、端末版が手元で OS のクリップボードを読む（herdr の `ClientMessage::ClipboardImage`、`wire.rs:487-495`）方式になる。これも後続候補。

### 4.4 tmux の中で動かすとき

- 通知・画像等の「外側の端末に向けた列」は `\x1bPtmux;` ＋（ESC を二重にした本体）＋`\x1b\\` で包む。tmux 側で `allow-passthrough on` が要る（tmux 3.3 以降の既定は off。この環境の tmux 3.4 の man で確認）。herdr の `wrap_tmux_passthrough`（`terminal_notify.rs`）と同じ。
- OSC 52 は包まずに出せば tmux の `set-clipboard` が扱う。
- フォーカスは `focus-events on`、修飾キーの拡張は `extended-keys on|always` が tmux 側に要る（`man tmux`）。同期出力（`?2026`）は tmux 3.4 が解釈する。
- prefix の衝突: 本製品も tmux も既定 Ctrl+B。tmux の中では tmux が先に取るので、利用者は Ctrl+B を 2 回押す（tmux の send-prefix）か、端末版の prefix を変える。`$TMUX` を見て起動時に案内を出すかは design。

---

## 5. 既存コードで再利用できるもの

| ファイル | 中身 | 端末版での扱い |
|---|---|---|
| `packages/cli/src/wsClient.ts` | `/ws` の接続・RPC・`onOutput(paneId, chunk)`・`onSnapshot(paneId, cols, rows, text)`・`sendInput`・`pause/resume`（1-60 行の `SodaClient`） | **そのまま使う**（複数 pane の出力が paneId 付きで多重化されている）。ただし hello の `kind: "external"` を端末版用にするかは design |
| `packages/cli/src/commands/attach.ts` | raw モード・代替画面・SIGHUP/SIGTERM・resize・終了時の端末の復元（`RESTORE_SCREEN`、40-45 行。マウス全種・1004・2004・DECCKM・DECKPAM・1049 を戻す）、`processTerminal()`（49-94 行。EIO を握りつぶす） | **端末の出入りの部品として切り出して流用**。復元の列は端末版が有効にするもの（kitty keyboard の pop・`?2026`・カーソル形）を足す |
| `packages/cli/src/attachOutput.ts` | `TerminalQueryFilter`：出力から問い合わせ（DA・DSR/CPR・DECRQM・XTVERSION・DECRQSS・色・kitty フラグ・XTGETTCAP・窓の報告・OSC 52 読み出し）を除く。列が区切りをまたいでも持ち越す | 端末版は pane の出力を外側へ直接書かない（headless に入れて描く）ので**不要**。ただし headless 自身が `onData` で問い合わせに答えるので、**手元の headless の `onData` はサーバへ送らない**こと（答えるのはサーバの Mirror だけ。decisions D8・D17 と同じ原則） |
| `packages/cli/src/attachKeys.ts` | Ctrl+B q の切り離し・Ctrl+B Ctrl+B で素通し（34 行） | 考え方（prefix を pane へ送る手段・読み取りの区切りをまたぐ）は同じ。実装は §3.2 の分解器＋キー割り当てに置き換わる |
| `packages/cli/src/ansiStrip.ts` | CSI・OSC を正規表現で除く（19 行） | 端末版の描画には使わない（通知の本文・タイトルの掃除程度） |
| `packages/server/src/terminal/Mirror.ts` | headless の包み。ESM での読み込みの注意（1-15 行：`import xtermHeadless from "@xterm/headless"` の default を取り出す）、parser のフックの付け方（常に false で委譲）、`flush()`（空書き込みのコールバック）、`inputModes()` | **読み込み方・フックの作法を写す**。クラスそのものはサーバ用（応答・OSC 7/9 の取得等）なので、端末版用に薄い別の包みを作る。共通化するなら `@sodashitsu/protocol` とは別の共有パッケージが要る（design） |
| `packages/web/src/keys/chord.ts`・`keymap.ts`・`bindings.ts`・`actions.ts`・`presets.ts`・`CopyMode.ts`・`NavigateMode.ts`・`ResizeMode.ts` 等 | キー割り当ての正規形（chord の文法。herdr の `format_key_combo` に合わせてある）・既定キー・プリセット・各モード | Vue に依存していない（`grep -l 'from "vue"'` に `keys/` は `KeyboardLockController.ts` だけ）。ただし入力は DOM の `KeyboardEventLike`（`chord.ts` の 17-30 行）なので、**端末の列 → `KeyInput` の変換を足せば割り当ての照合を共有できる**。共有パッケージへ移すかは design |
| `packages/web/src/store/*` | セッション・設定・通知・既読・機械の状態 | `session.ts`・`settings.ts`・`notifications.ts`・`view.ts` 等は Vue に依存する（上の grep）。ロジックの一部を抜き出すか、端末版で書き直すかは design |

---

## 6. design へ渡す未決

1. サーバの Mirror と端末版の headless の Unicode 版（6 と 11）をどう揃えるか（§1.2）。
2. 端末版の Node の最低版（Windows で 24.2.0 以上。§3.1）と、Windows Terminal ネイティブでのマウス・ペースト・フォーカスの実機確認。
3. kitty keyboard を使うか（使うなら pane へ送る前に従来の列へ戻す変換）。使わない場合に区別できないキーの一覧（AC15 へ）。
4. 通知の端末判定と、SSH 越しで判定できないときの設定での上書き。
5. OSC 52 の中継（pane → 外側）を Web 版にも入れるか（今は Web 版も扱っていない）。
6. Kitty graphics・クリップボードの画像を後続にするか（推奨: 後続）。
7. tmux の中での prefix の衝突の案内。入れ子（端末版の中の端末版）は herdr と同じく環境変数で検出して拒否（上書きの設定あり）。
8. 見えていない tab の pane の購読を外すか（性能と再表示の SNAPSHOT のコストの兼ね合い）。
