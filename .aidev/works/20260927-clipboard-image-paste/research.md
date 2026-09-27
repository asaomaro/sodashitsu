# 調査: クリップボードの画像を pane へ貼り付ける

## 調査の問い

- Q1: herdr はどう実装しているか（どこに置き、何を貼り、いつ消し、何を上限にし、どのキーで始まるか）。
- Q2: ブラウザはクリップボードの画像をどう読めるか（API・許可・ブラウザごとの違い・secure context）。
- Q3: 今の web の貼り付けとキーの経路（xterm.js の paste イベント・`Ctrl+Shift+V`・メニュー・Ctrl+V の行き先・打鍵の順序を保つ仕組み）。
- Q4: サーバ側の入口（RPC の登録・検査・エラーコード・接続ごとの状態・切断の後片付け）と、1 通の大きさの上限・中継（`/ws?machine=`）の制約。
- Q5: 画像を置く場所の候補（OS の一時ディレクトリ・状態ディレクトリ）の権限。
- Q6: エージェントは貼られたパスをどう扱うか。

## 判明した事実

### Q1: herdr

- F1: サーバは `std::env::temp_dir()/herdr-clipboard-images-<euid>` を `create_dir_all` し 0700 に `set_permissions`、
  `client-<clientId>-clipboard-<nanos>-<attempt>.<ext>` を `create_new(true)`・0600 で作って書く。書くたびに 24 時間より古いファイルを消す
  （`scratchpad/herdr/src/server/clipboard_image.rs` `stage`・`ensure_staging_dir`・`cleanup_stale`・`STAGED_CLIPBOARD_IMAGE_MAX_AGE`）。
  拡張子は png/jpg/gif/webp/bmp に丸め、それ以外は png（`sanitize_extension`）。**中身のバイトの検査はしていない**（拡張子だけ）。
- F2: 書いたファイルのパスを、対象の pane への `ClientPaneInputEvent::Paste(path)`（pane の bracketed paste の状態で包む）として入力する。
  対象（pane・popup・直結の端末）が今も有効かを先に確かめ、無効ならファイルを消す（`src/server/headless.rs:1182` `client_clipboard_image_target_is_valid`・
  `:1229` `paste_client_clipboard_image_path`・`:2176` の `ServerEvent::ClientClipboardImage` の処理）。
- F3: クライアントが切れるとそのクライアントが置いたファイルを消す（`headless.rs:1020` `staged_clipboard_files`）。サーバの終了でも消す（`:3449` の `Drop`）。
- F4: 1 通の画像の上限 16 MiB（`src/protocol/wire.rs:32` `MAX_CLIPBOARD_IMAGE_PAYLOAD`）。超えるとサーバは接続を切る（`src/server/client_transport.rs:1097`）、
  クライアントは送らずログだけ（`src/client/clipboard_images.rs` `write_remote_image_to_server`）。**頻度・同時数・置いておく数の上限は無い**。
- F5: きっかけは `keys.remote_image_paste`（既定 `ctrl+v`、空で無効）の生の打鍵、または空の bracketed paste（`\x1b[200~\x1b[201~`）。
  `herdr --remote` のときだけ働く。クリップボードに画像があれば送って打鍵を捨て、無ければ打鍵をそのまま流す
  （`src/client/clipboard_images.rs` `should_bridge_clipboard_image_paste`、`src/client/mod.rs:764-797`）。
  ローカルでは Ctrl+V を横取りしない（`CHANGELOG.md:472` #647：Vim の矩形選択のため）。画像のファイルのドロップも送る（`read_image_file_from_terminal_drop`）。

### Q2: ブラウザ

- F6: `navigator.clipboard.read()` は secure context でだけ使える。一般に text・HTML・PNG を読める（MDN Clipboard.read）。
- F7: **Chromium**: 仕様上許されない読み取りは、文書にフォーカスがあれば `clipboard-read` の許可を求め、許可されていれば成功する（許可は残る）。
  **Firefox・Safari**: 一時的なユーザー操作があれば、「ペースト」1 項目のその場のメニューを出し、利用者が選べば成功する（同一オリジンの内容なら出ない）。
  **`clipboard-read` の許可は Firefox・Safari では対応しておらず予定も無い**（MDN Clipboard API「Security considerations」）。
  → Permissions API で `clipboard-read` を問い合わせられるのは Chromium だけ。Firefox・Safari で Ctrl+V の度に `read()` を呼ぶと、画像でない
  （他のアプリからコピーした）内容のたびにメニューが出る。
- F8: HTTP（非 secure context）では `navigator.clipboard` 自体が無い（既存の research `20260918-web-terminal-multiplexer/research.md` F10.10・F9.4、
  `docs/tls-setup.md:40`）。paste イベントの `clipboardData` は secure context を要しない（DOM の ClipboardEvent。利用者の貼り付け操作で出る）。

### Q3: web の今の経路

- F9: `Ctrl+Shift+V` は `KeyInputController.resolveTerminalKey` が `readClipboard()`（`readText`）→ `term.paste(text)`（`packages/web/src/keys/KeyInputController.ts:29` `isManualPasteShortcut`・`:199-204`）。
  メニューの「貼り付け」も同じ（`packages/web/src/actions/ActionDispatcher.ts:1184` `pasteIntoPane`）。`readText` が空・失敗なら何もしない。
- F10: Ctrl+V は今どの割り当ても無いので `KeyRouter.handleDirect` が `pass` を返し、xterm.js が `0x16` を送る（`packages/web/src/keys/KeyRouter.ts` `handleDirect`、`keymap.ts` に `ctrl+v` の予約・既定の割り当て無し）。
- F11: 直接のキー（`directMap`）の割り当てはカタログ `ACTIONS`（`packages/web/src/keys/bindings.ts`）の `defaults` に `"ctrl+v"` のように書けば既定になり、
  節「キー」・キー一覧・保存（`keyPrefs.ts`）・衝突の検査（`keymap.ts` `resolveKeymap`）はカタログから自動で扱う。`ctrl+v` は `isDirectChord` を満たし、
  `RESERVED_DIRECT`（`ctrl+shift+v`・`shift+f10`）に当たらない。chord から端末への列は `chord.ts:365` `prefixBytes`（`ctrl+v` → `\x16`）。
- F12: 端末以外にフォーカスがあるときの keydown は `main.ts:352` の window の listener → `KeyInputController.handleDomKey`。直接のキーの action はここでも走る
  （入力欄の Ctrl+V を横取りしうる）。ダイアログ中・xterm の textarea にフォーカスがあるときは何もしない。
- F13: xterm.js 6.0.0 は paste イベントを textarea と要素の両方で受け、`clipboardData.getData('text/plain')` を `paste()` へ渡す。**テキストが空でも**
  `paste("")` を呼び、bracketed paste が有効なら `\x1b[200~\x1b[201~` を送る（`node_modules/.pnpm/@xterm+xterm@6.0.0/.../src/browser/Clipboard.ts:43` `handlePasteEvent`・`:51` `paste`、
  `CoreBrowserTerminal.ts:343-344`）。`paste()` は `\r?\n` を `\r` にし（`prepareTextForTerminal`）、`bracketedPasteMode` と `ignoreBracketedPasteMode` を見て包む（`bracketTextForPaste`）。
  端末の bracketed paste の状態は公開 API `term.modes.bracketedPasteMode` で読める。
- F14: 打鍵の順序を保つ仕組みが既にある: `InputGate.holdInput(paneId)` はその pane 宛ての入力を溜め、`release(to)`/`cancel()` で流す、時間切れ（既定 5 秒）でも流す
  （`packages/web/src/net/InputGate.ts`）。`TerminalRegistry` の `onData`（xterm のキー・貼り付け）と `KeyInputController` の直接送信の両方がここを通る
  （`main.ts:119`・`ActionDispatcher` の `input` オプション）。流すときに**先頭に差し込む列**を渡す口は無い（後から `sendInput` すると溜めた分の後ろに並ぶ）。
- F15: 失敗の日本語は `packages/web/src/net/clientError.ts` の `MESSAGES`（`Record<ErrorCode, string>`＝全 code の網羅を型が要求）と `errorCodeOf`。
  要求のエラーは `Error` に `code` が付いて reject される（`net/Connection.ts:326-331`）。toast は `view.toast`。

### Q4: サーバの入口

- F16: 方式は `protocol/src/messages.ts` の zod スキーマと `MethodName` の表、サーバは `surface/methods/*.ts` で `surface.register(name, {schema, handler})`。
  `ControlSurface.invoke` がスキーマで検査し、`RpcError` の code をそのまま返す（`packages/server/src/surface/ControlSurface.ts`）。ハンドラは `ctx.clientId` を持つ。
  エラーコードは `protocol/src/errors.ts` の `ErrorCode`。
- F17: `/ws` の 1 通の上限は 4 MiB（`packages/server/src/ws/WsServerWs.ts` `MAX_WS_PAYLOAD_BYTES`）。中継の手元→リモートも 4 MiB（`machine/bridgeFrames.ts` `BRIDGE_LIMITS.maxMessageBytes`）、
  チャネルの送り待ちが 8 MiB を超えると閉じる（`machine/MachineRelay.ts` `RELAY_MAX_UPSTREAM_BYTES`）。中継は TEXT を解釈せずに通す（同 `relayToMachine`）。
  → 16 MiB の画像を base64 の 1 通では送れない（4 MiB × 3/4 ≒ 3 MiB が上限）。分けて、応答を待ってから次を送れば送り待ちも溜まらない。
- F18: 接続の切断は `WsGateway` の `onClientGone(clientId)` で知らせる（`packages/server/src/ws/WsGateway.ts`、`composeServer.ts:306-313` で `/ws` と `bridge.sock` の 2 つの `WsGateway` に渡している）。
- F19: 中継先のリモートのサーバは信用しない方針（`machine/MachineRelay.ts` の冒頭のコメント）。リモートから返る値をブラウザが検査する必要がある。

### Q5: 置き場所

- F20: 状態ディレクトリは Linux/macOS で `$XDG_STATE_HOME`（既定 `~/.local/state`）`/web-tn-multiplexer`（名前付き session は `sessions/<名前>`）、Windows は `%LOCALAPPDATA%\web-tn-multiplexer`
  （`packages/server/src/config.ts:66` `defaultStateDir`）。作るのは `mkdir(recursive)` の既定の権限で、0700 にはしていない（`persist/StateDirLock.ts:106`）。
  `--state-dir` で任意の場所（`/tmp` の下も）を指定できる。
- F21: 既存の一時ファイルの例は `mkdtemp(tmpdir()/wtm-scrollback-)` ＋ `writeFile(..., {flag:"wx", mode:0o600})`（`packages/server/src/terminal/scrollbackEditor.ts` `writeScrollbackFile`）。

### Q6: エージェント

- F22: Claude Code は、画像のパスが **bracketed paste として届いたとき**に `[Image #N]` として添付する（打鍵で入れた文字列はテキストのまま）。パスは SSH・tmux を越えて使える
  （2026 年の解説記事 smartscope.blog「How to Attach Images in Claude Code」・getinvoke.dev、Web 検索の要約。一次資料〔Claude Code のソース〕は読んでいない）。
  → pane が bracketed paste を有効にしていない（シェルの素のプロンプト等）ときはパスが文字列として入るだけで、それで困らない。

## 影響範囲

- protocol: 方式 3 つ程度とエラーコード。server: 新しい部品（受け取り・検査・保存・後片付け）、方式の登録、`composeServer` の配線、`onClientGone`。
- web: キーのカタログ（`bindings.ts`）・`actions.ts` の `Action`・`KeyInputController`（Ctrl+V の経路と `Ctrl+Shift+V`）・`TerminalRegistry`（paste イベントの捕捉）・
  `ActionDispatcher`（メニューの貼り付け）・`InputGate`（先頭に差し込んで流す口）・`term/clipboard.ts`（画像の読み取り）・`clientError.ts`（新しい code の文言）。
- 中継（`MachineRelay`）は変えない（TEXT をそのまま通すので、1 通 4 MiB 未満に分ければ通る）。
- docs: `herdr-parity.md` H44・`machines.md:106`・`verification.md`。

## 実現性 / リスク

- 実現できる。リスク:
  - R1: Firefox・Safari で Ctrl+V から `read()` を呼ぶと、打つ度に「ペースト」のメニューが出て Vim の Ctrl+V が使えなくなる（F7）→ 許可を問い合わせられるブラウザでだけキーから読む。
  - R2: 確かめている間に打ったキーが Ctrl+V（`0x16`）を追い越す（F14 の口が無い）→ `InputGate` に「先頭に差し込んで流す」口を足す。
  - R3: 16 MiB を 1 通で送れない（F17）→ 分けて送る。
  - R4: `--state-dir` を他人も書ける場所にされたとき、画像のディレクトリを先回りして作られる・シンボリックリンクにされる → 作った後に lstat で持ち主・種類・権限を確かめる。
  - R5: Chromium で初めて Ctrl+V を押したときに許可の画面が出る（許可を拒否すれば以後は Ctrl+V がそのまま届く）——docs に書く。

## 実装アンカー

- A1: キーのカタログ（`packages/web/src/keys/bindings.ts` `ACTIONS`）— `remote_image_paste` を足す。`Action` の型は `packages/web/src/keys/actions.ts`。
- A2: 端末のキーの経路（`packages/web/src/keys/KeyInputController.ts` `resolveTerminalKey`・`dispatch`・`handleDomKey`・`inject`）。
- A3: chord → 端末への列（`packages/web/src/keys/chord.ts:365` `prefixBytes`、`chordOf`）。
- A4: paste イベントを取る場所（`packages/web/src/term/TerminalRegistry.ts` `create`：`element` に capture の listener を足せる。xterm は子の要素と textarea で受ける）。
- A5: メニューの貼り付け（`packages/web/src/actions/ActionDispatcher.ts:1177-1190` `pasteFromMenu`・`pasteIntoPane`）。
- A6: 入力の関所（`packages/web/src/net/InputGate.ts` `holdInput`・`finish`）。
- A7: クリップボード（`packages/web/src/term/clipboard.ts`）。
- A8: 失敗の文言（`packages/web/src/net/clientError.ts` `MESSAGES`）。
- A9: 配線（`packages/web/src/main.ts:119` の `InputGate`・`ActionDispatcher`・`TerminalRegistry` の生成）。
- A10: 方式のスキーマ（`packages/protocol/src/messages.ts` の `PaneEditScrollbackParams` の隣と `MethodName`/結果の表 `:608`・`:675` 付近）。エラーコード `packages/protocol/src/errors.ts`。
- A11: 方式の登録（`packages/server/src/surface/methods/pane.ts`・`index.ts` `registerAllMethods`・`deps.ts` `MethodDeps`）。
- A12: サーバの配線（`packages/server/src/composeServer.ts:263-313`：`options.stateDir`・`registerAllMethods`・2 つの `WsGateway` の `onClientGone`）。
- A13: pane の存在の確かめ（`deps.session` の pane の引き方——未特定。coding 側で `SessionService` の公開の getter を探す）。

## 実装時の注意

- `KeyInputController.handleTerminalKey` は `false` を返すとき必ず `preventDefault()` する（D89）。Ctrl+V を action にしたら既定動作（xterm の `0x16`）は止まる——
  画像が無いときの `0x16` は自分で送る。
- paste イベントを xterm より先に取るには、xterm の要素の祖先（`TerminalRegistry` の `element`）に capture で付け、画像を扱うときだけ `stopPropagation`＋`preventDefault` する
  （テキストのときは触らない＝今までどおり xterm が扱う）。
- `InputGate` はフォーカスの報告・ポインタ由来の入力を溜めない（そのまま）。溜める時間の既定 5 秒は分割等のためのもので、画像の送信には短いかもしれない。
- `clientError.ts` の `MESSAGES` は全 `ErrorCode` の網羅を型が要求する——code を足したら文言も足す。
- prettier は新しいファイルか HEAD で整形済みのファイルにだけかける（利用者のメモ）。

## design への申し送り

- キーから読むのは `navigator.permissions.query({name:"clipboard-read"})` が `granted`/`prompt` を返すとき（Chromium）だけにし、問い合わせられない・`denied`・
  `navigator.clipboard.read` が無いときは読まずにすぐそのキーの列を送る（R1・F7）。
- 送信は分けて送る方式（F17）。上限の値（数・合計・同時・頻度・時間・パスの長さ）を決める。
- 置き場所: 状態ディレクトリの下か OS の一時ディレクトリか（F20・F21・R4）。消す時機: herdr の「切断で消す」はブラウザの繋ぎ直し（スリープ・回線の揺れ）で
  エージェントが読む前に消える恐れがある——時間（24 時間）と数・大きさで消す案を比べる。
- パスの貼り付けをサーバでするかブラウザでするか（F2 はサーバ。ブラウザなら `InputGate` の順序と pane の bracketed paste の状態〔F13〕をそのまま使える）。
