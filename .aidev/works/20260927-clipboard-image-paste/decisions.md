# 判断の記録（20260927-clipboard-image-paste）

## D1: 着手の判定・profile・research を挟む理由（2026-09-27・requirements）

- 背景: backlog `product-roadmap.md`「クリップボード画像のリモート貼り付け」（`docs/herdr-parity.md` H44）を autonomous で進める
  （主エージェント経由のユーザーの依頼「残りの herdr の項目を進める」。worktree `feature/clipboard-image-paste`、main 52e244e から）。
  直前に着地した 20260927-multi-host-machines（`/ws?machine=` の中継）の上でも動く必要がある。
  herdr の一次資料を主エージェントが直読した:
  - `scratchpad/herdr/src/server/clipboard_image.rs`: サーバが `temp_dir()/herdr-clipboard-images-<uid>`（0700）に `client-<id>-clipboard-<nanos>-<n>.<ext>`
    を `create_new`・0600 で書き、24 時間より古いファイルを書くたびに消す。拡張子は png/jpg/gif/webp/bmp に丸める（それ以外は png）。
  - `src/server/headless.rs` の `ClientClipboardImage` の処理: 対象（pane・popup・直結の端末）が有効かを確かめ、書いたファイルの**パスを
    その pane への貼り付け（`ClientPaneInputEvent::Paste`＝bracketed paste の規則で包む）として入力する**。クライアントが切れると、その
    クライアントが置いたファイルを消す（`staged_clipboard_files`）。
  - `src/protocol/wire.rs` `MAX_CLIPBOARD_IMAGE_PAYLOAD = 16 MiB`（超えたらサーバは接続を切る、クライアントは送らない）。
  - `src/client/clipboard_images.rs`・`src/client/mod.rs`: `herdr --remote` のときだけ、`keys.remote_image_paste`（既定 `ctrl+v`）の生の打鍵か
    空の bracketed paste（外側の端末が画像だけのクリップボードを貼ると送るもの）を受けたら、手元のクリップボードの画像を読み、あれば
    送って打鍵は捨てる。**画像が無ければ打鍵をそのまま pane へ送る**。画像ファイルのドロップ（パスの貼り付け）も同じ経路。
  - `CHANGELOG.md`: #205（画像を一時ファイルに置いてパスを貼る方式の導入。Claude Code の画像の貼り付けが `--remote` で使える）、
    #647（手元のクライアントでは Ctrl+V を横取りしない＝Vim の矩形選択を守る。`--remote` は既定の ctrl+v のまま）。
  - つまり herdr は「サーバの OS のクリップボードを書き換える」「エージェントの画像の貼り付けを真似る」のどちらでもなく、
    **サーバに一時ファイルを置いてそのパスを貼る**。
- 決定: profile は full（protocol・server・web・中継の 4 層にまたがり、認証済みの口に外からのファイルの書き込みを足す＝安全面を含む）。
  research を挟む（`protocol.md`「4.5」の条件のうち「技術的実現性が未確認」——ブラウザの Clipboard API の画像の読み取り・許可の挙動と
  paste イベントの画像の扱い・xterm.js の貼り付けの経路——と「影響が横断的」に当たる）。
- 理由・代替案: research を省く案は、ブラウザごとの許可の出方（Chromium の許可の問い合わせ・Firefox/Safari の「ペースト」のメニュー）を
  確かめないまま Ctrl+V に読み取りを結び付けることになり、Vim/Emacs の Ctrl+V の度にメニューが出る等の破綻を design で見落とす。
- 影響: requirements の後に research.md を書く。

## D2: 方式は herdr と同じ「サーバに一時ファイルを置いてパスを貼る」（2026-09-27・requirements）

- 背景: ブラウザとサーバが別のマシンだと、pane の中のエージェント（Claude Code・Codex 等）はブラウザ側のクリップボードに触れない。
- 決定: ブラウザがクリップボードの画像を認証済みの `/ws` で送り、サーバ（pane のあるマシン）が私的なディレクトリにファイルとして置き、
  そのファイルの絶対パスを pane へ貼り付ける（herdr と同じ）。サーバの OS のクリップボード（xclip・wl-copy・pbcopy）は書き換えない。
- 理由・代替案:
  - (a) 採用: パスの貼り付け。Claude Code は貼り付けられた画像ファイルのパスを画像として扱い、Codex 等もファイルを読める。
    サーバの外部コマンドにも表示サーバ（X・Wayland）の有無にも依らず、Linux・macOS・Windows・SSH 越しのマシンで同じに動く。
  - (b) 却下: サーバの OS のクリップボードに書いてからエージェントの貼り付けキーを送る。**ヘッドレスのサーバ（SSH で入った Linux・
    WSL2 の外の VM）には X/Wayland が無く、xclip・wl-copy が動かない**——リモートこそが対象なのに、まさにそこで動かない。
    さらにエージェントごとに貼り付けキー（Claude Code の Ctrl+V・Codex の Ctrl+V/Alt+V 等）が違い、利用者の OS のクリップボードを
    黙って上書きする副作用もある。herdr もこの方式を採っていない。
  - (c) 却下: エージェントの画像の貼り付けの真似（端末の画像プロトコルで送る等）。エージェントごとに方式が違い、公開された仕様が無い。
- 影響: requirements の機能要件・対象外に反映する。

## D3: 画像は分けて送る（begin / chunk / commit）（2026-09-27・design）

- 背景: 画像は herdr と同じく 16 MiB まで受けたい（4K のスクリーンショットの PNG は数 MiB になる）。`/ws` の 1 通と中継の 1 通は 4 MiB（research F17）。
- 決定: 生の 768 KiB（base64 で 1 MiB）ずつ `pane.image.chunk` で送り、前の応答を待ってから次を送る。
- 理由・代替案:
  - (a) 採用: 分けて送る。`/ws`・中継の上限を変えず、中継の送り待ち（8 MiB）も 1 片分しか溜まらない。
  - (b) 却下: 1 通で送る。base64 で 4 MiB＝画像 3 MiB が上限になり、**4K の Retina のスクリーンショット（5〜8 MiB の PNG）が送れない**。
  - (c) 却下: `/ws` の上限を 24 MiB に上げる。全ての接続（認証前の upgrade の直後も）の 1 通の上限が上がり、中継の `BRIDGE_LIMITS` も変える必要がある。
  - (d) 却下: HTTP の `POST /api/...` で送る。`/ws?machine=` の中継は WebSocket しか通さないので、**保存した SSH のマシンの pane では使えない**（AC5 を満たせない）。
- 影響: サーバは送信の途中の状態（接続ごと）を持ち、時間切れ・切断で捨てる。

## D4: パスの入力はブラウザが行う（サーバは返すだけ）（2026-09-27・design）

- 背景: herdr はサーバがパスを pane へ入力する。本製品にはブラウザ側に打鍵の順序を保つ `InputGate` があり、テキストの貼り付けもブラウザ（xterm.js の `paste`）が行う。
- 決定: サーバは `commit` の応答でパスを返し、ブラウザが検査（`isPastablePath`）してから、溜めたキーの前に差し込んで流す（`InputHold.cancel(first)`）。
- 理由・代替案:
  - (a) 採用: ブラウザが入力する。Ctrl+V の後に続けて打ったキーが、パスの後に確実に並ぶ（`InputGate` 1 か所で順序が決まる）。bracketed paste の包み方がテキストの貼り付けと同じになる。
  - (b) 却下: サーバが入力する。サーバの書き込みとブラウザが溜めたキーの流し出しが別の経路になり、**時間切れで先に流れたキーとパスの順序がサーバとブラウザの両方の事情で決まる**。
    またサーバに bracketed paste の状態を読む配線（`agentInput.pastePayload` の経路）を方式のハンドラへ引く必要がある。
- 影響: 中継先のリモートのサーバが返すパスを信用しないので、ブラウザが制御文字・長さを検査する（AC11）。

## D5: 置き場所は状態ディレクトリの下、消すのは時間・数・合計（切断では消さない）（2026-09-27・design）

- 背景: herdr は `temp_dir()/herdr-clipboard-images-<uid>` に置き、切断で消す（research F1・F3）。
- 決定: `<状態ディレクトリ>/clipboard-images/`（0700。作った後に lstat で種類・持ち主・権限を確かめる）。24 時間・100 個・256 MiB を超えた古いものを書くたびに消す。切断では消さない。
- 理由・代替案:
  - 置き場所: (a) 採用: 状態ディレクトリ。利用者のホームの下で他人が先回りして作れず、名前付き session・`--state-dir` ごとに分かれ、サーバの再起動・`wtm handoff`（pane のプロセスを生かしたまま入れ替える）でも同じ場所。
    (b) 却下: `/tmp/wtm-clipboard-images-<uid>`。**Linux の `/tmp` は誰でも書けるので、他の利用者が同じ名前のディレクトリやシンボリックリンクを先に作れる**（herdr は作った後に chmod するだけ）。
    (c) 却下: `mkdtemp` で起動ごとに作る。再起動の度に場所が変わり、前の起動の分を消す手がかりが無くなる。
  - 消す時機: (a) 採用: 時間・数・合計。(b) 却下: 切断で消す（herdr）。**ブラウザはスリープ・回線の揺れ・再読み込みで頻繁に繋ぎ直すので、パスを貼った直後に繋ぎ直すと、
    エージェント（Codex 等はプロンプトを送った時にファイルを読む）が読む前にファイルが消える**。
- 影響: `--state-dir` を他人も書ける場所にした場合も lstat の検査で断る（`image_store_failed`）。Windows では権限の検査はせず、種類だけ見る。

## D6: キー（Ctrl+V）から読むのは Chromium で許可が拒否されていないときだけ（2026-09-27・design）

- 背景: Firefox・Safari は `clipboard-read` の許可に対応せず、読む度に「ペースト」のメニューを出す（research F7）。
- 決定: `navigator.permissions.query({name:"clipboard-read"})` が `granted`/`prompt` を返すときだけキーから `read()` する。投げる（Firefox・Safari）・`denied`・`read` が無い（HTTP）ときは読まずに fallback を送る。
- 理由・代替案: (b) 却下: どのブラウザでもキーから読む。**Firefox で Vim の Ctrl+V（矩形選択）を押す度にメニューが出て、選ぶまで入力が止まる**。
  Firefox・Safari の利用者は paste イベント（Cmd+V・ブラウザのメニュー）・`Ctrl+Shift+V`・右クリックの「貼り付け」で画像を送れる。
- 影響: Chromium では初めて Ctrl+V を押したときに許可の画面が出る（拒否すれば以後 Ctrl+V はそのまま届く）。docs に書く。

## D7: 上限の値（2026-09-27・design）

- 決定: 画像 16 MiB（herdr と同じ）・1 片 768 KiB・同時は接続 1／全体 4（メモリ 64 MiB まで）・頻度は接続 20／60 秒・全体 60／60 秒・続きが 30 秒来なければ捨てる・
  置いておくのは 24 時間／100 個／256 MiB・パス 4096 文字・入力を溜めるのは 20 秒。
- 理由: 利用者が手で貼る頻度（1 分に数回）より十分に多く、1 つの接続が暴走してもディスク 256 MiB・メモリ 64 MiB で止まる。溜める 20 秒は 16 MiB を 1 MB/s 程度の回線で送れる長さ
  （これを超えるとキーが先に流れるが、失われない）。herdr には頻度・数の上限は無い（research F4）ので、本製品の追加。
- 影響: 値は `packages/protocol/src/image.ts` とサーバの `ImageUploads`・`ImageStore` の既定値に置く。

## D8: architecture を挟まない（2026-09-27・design）

- 背景: `protocol.md`「4.5」の architecture の 4 条件を当てた。
- 決定: 挟まない。
- 理由: (1) 境界は動かさない——新しい部品は既存の差し込み口に付くだけ（サーバは `MethodDeps` の任意の依存〔`metadata`・`agentStarter` と同じ形〕と `WsGateway` の `onClientGone`、
  web は `KeyInputController.bind` の port・`TerminalRegistryOptions` の任意の関数・`ActionDispatcherOptions` の任意の依存。`keys/` から `term/ImagePaster` を import しない）。
  (2) 新しい構造の選択は decisions D3〜D5 で済んでいる。(3) 型・状態遷移（送信の状態機械・シーケンス）は design の「インターフェース」「振る舞いの詳細」に図つきで具体化してある。
  (4) tasks で直接分解できる粒度（ファイル・シグネチャ・上限の値）まで決まっている。
- 影響: tasks は design から直接分解する。

## D9: 状態ディレクトリ自体を他人が書ける場合の残る穴は受け入れる（2026-09-27・design）

- 背景: design の doccheck の指摘。`clipboard-images/` を lstat で確かめてからファイルを `open` するまでの間に、親（状態ディレクトリ）を書ける他人は `clipboard-images/` を差し替えられる。
- 決定: 受け入れる（親の検査はしない）。docs に「状態ディレクトリは自分だけが書ける場所に置く」と書く。
- 理由・代替案: 既定の状態ディレクトリは利用者のホームの下（`~/.local/state`・`%LOCALAPPDATA%`）で他人は書けない。親を他人が書けるなら、同じ場所の `auth.json`（token）・
  `session.json`・`bridge.sock` も既に差し替えられる（画像より重い）。Node には `openat` が無く、ディレクトリの fd に対して作る方法で穴を塞げない。
- 影響: `docs/herdr-parity.md`・`verification.md` に置き場所と前提を書く。

## D10: T9（全体の確認）は test 工程で消化する（2026-09-27・tasks）

- 決定: T9 は coding の承認時に未チェックで残し、test 工程で build・typecheck・全テスト・smoke を通して閉じる。

## D11: 画像の保持の間は、後から始めた分割等の入力も待つ（2026-09-27・coding T4）

- 背景: T4 の独立点検。`InputGate` は保持を古い順に流すので、Ctrl+V の画像の保持（最大 20 秒）が応答待ちの間は、その後に `prefix+v` 等で作った新しい pane へ打った文字も流れない。
- 決定: そのまま受け入れる（打った順を保つ規則のとおり）。画像を送っている間は toast が出ない代わりに、送り終わる（通常 1 秒未満）か 20 秒で必ず流れる。
- 理由・代替案: 保持ごとに独立に流すと、Ctrl+V の後に分割して打った文字が画像のパスより先に届く（押した順と逆）。
- 影響: docs（verification.md）に「画像を送っている間に打ったキーは、送り終わってから届く」と書く。

## D12: `Ctrl+Shift+V`・メニューの「貼り付け」は読み取りの後に保持を作る（2026-09-27・coding T5）

- 背景: T5 の独立点検。`pasteClipboard` はクリップボードを読んでから（テキストか画像かが分かってから）画像のときだけ保持を作るので、読み取りの間
  （Firefox・Safari の「ペースト」のメニューを選ぶまで）に打ったキーは、画像のパスより先に届く。
- 決定: 受け入れる。
- 理由・代替案: テキストの貼り付け（今までの経路）も読み取りの間のキーを溜めておらず、同じ振る舞い。読む前に保持を作ると、テキストの経路（`term.paste`＝xterm の onData）が
  自分の保持に溜まり、テキストの貼り付けの動きまで変わる。キー（Ctrl+V）の経路は読む前に保持を作るので順序を保つ。
- 影響: なし（docs には書かない。利用者がメニューを選ぶ間に打鍵することは通常無い）。

## D13: 端末での Ctrl+V の押しっぱなしは 1 回だけ・prefix を ctrl+v にするには先に外す（2026-09-27・coding T7）

- 背景: T7 の独立点検。Ctrl+V を直接のキーにしたので、直接のキーの規則（押しっぱなしの繰り返しは食う。分割等の連発を防ぐ）が効き、端末で Ctrl+V を押し続けても 1 回になる
  （以前は xterm が `0x16` を繰り返し送っていた）。また prefix を ctrl+v に変えようとすると「直接のキーに使われている」と断られる。
- 決定: どちらも受け入れる。端末以外の入力欄での繰り返しは `KeyRouter.directActionOf` で先に見て、ブラウザの既定に任せる（食わない）。
- 理由・代替案: 繰り返しのたびにクリップボードを読むと画像が何枚も貼られる。`0x16` を連打する用途は稀（Vim の矩形選択は 1 回）。prefix を ctrl+v にしたい利用者は
  節「キー」で「クリップボードの画像を貼り付け」を外してから変えられる（既に prefix を ctrl+v で保存している人は、既定の側が黙って落ちるだけで壊れない）。
- 影響: なし（docs の herdr-parity にキーの既定を書いた）。

## D14: 溜める 20 秒の根拠の訂正と、マシンの切り替え・LRU への対応（2026-09-27・coding cross 点検）

- 背景: cross の点検。(1) D7 の「16 MiB を 1 MB/s ほどで送れる長さ」は base64 の膨らみ（4/3）を数えておらず、実際に送るのは約 21.3 MiB（1 MB/s で約 22 秒）。
  (2) pane の id はマシンをまたいで重なるので、送信の途中でマシンを切り替えると次のマシンの同じ id の pane へ届きうる。(3) 端末は LRU で捨てられる（モバイルは 2 枚）ので、
  端末が無いことは pane が閉じたことを意味しない。
- 決定: (1) 20 秒のままにする（超えても溜めたキーが先に流れるだけで失われない。16 MiB の画像を遅い回線で送るのは稀）。根拠は「約 1.1 MB/s 以上なら 16 MiB でも間に合う」と読み替える。
  (2) `ImagePaster.resetForMachineSwitch`（世代）で切り替えの前の仕事を捨て、保持は `InputHold.discard` で溜めた分ごと捨てる。(3) 閉じたかどうかは session の pane の有無で見て、
  端末が無ければ仕事を始めたときの bracketed paste の状態で貼る。
- 影響: `main.ts` の `resetView`（マシンの切り替え）から呼ぶ。

## D15: review ラウンド 1 の修正（後片付けの時機・読み取りの上限・合計の期限）（2026-09-27・review → coding）

- 背景: review ラウンド 1 の should 2 件・nit 2 件。
- 決定: (1) 後片付けを書くときに加えて、`listen`（状態ディレクトリのロックを取った後）の起動時と 1 時間ごとに行う（`ImageStore.startSweeping`。`close` と起動の失敗で止める）。
  (2) キーから読むときの読み取り（許可の問い合わせ＋`read()`）に 2 秒の上限を付け、超えたら画像無しとして fallback を送る——Chromium の初めての許可の画面に
  2 秒以内に答えないと、その回は `^V` が送られる（許可してからもう一度押す）。(3) 送信に begin からの合計の期限 5 分を付ける（小さな片で枠を占め続けさせない）。
  (4) `IMAGE_HOLD_TIMEOUT_MS` のコメントを D14 に合わせる。
- 理由・代替案: (2) 上限を付けずに列を分ける案（読み取りだけ並行）は、2 つ目の Ctrl+V の `\x16` が 1 つ目の読み取りを追い越せず結局待つ。許可の画面は初回だけなので、2 秒で打ち切る方が
  Vim の利用者の打鍵を守れる。
- 影響: docs（herdr-parity の H44・verification の Chromium の手順）を直した。
