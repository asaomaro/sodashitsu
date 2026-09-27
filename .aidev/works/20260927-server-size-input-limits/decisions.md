# 判断の記録: 20260927-server-size-input-limits

autonomous（humanGates なし）のため、方針は承認者を待たずにここへ書いて進めた（protocol-autonomous.md「方針の事前承認」）。

## D1: profile は full、research を挟む

- 背景: protocol・server・web・cli の 4 パッケージにまたがり（影響が横断的）、入力の上限は node-pty の書き込み待ちの内部の振る舞い
  （公開 API に無い）に依存する（未検証の既存挙動）。protocol.md「4.5」の research の条件のうち 2 つに当たる。
- 決定: full で回し、requirements の後に research を実施する。
- 影響: research.md で node-pty の書き込み待ちを実物で確かめてから design に入る。

## D2: 上限の値（1 辺 4096・面積 1,000,000 セル・visible 4096 件・入力の待ち 16 MiB・知らせ 2 秒に 1 回）

- 背景: 上限が無いと 1 通で壊れる具体例——`pane.attach {cols: 100000, rows: 100000}` を生の `/ws` から送ると、サーバはミラー（headless の xterm）を
  その大きさにし、画面の行（10^10 セル・1 セル 12 バイトとして約 120 GB）をその場で確保しようとしてプロセスが落ちる。サーバが落ちると PTY の master が閉じ、
  **全 pane のシェルとエージェントが SIGHUP で終わる**（research F2）。65536 以上は SNAPSHOT の u16 で化ける（F3）。
- 決定: 1 辺 4096・面積 1,000,000（herdr のクライアントの画面の上限と同じ。F19）。4096×244 や 1000×1000 は通り、画面 1 枚の行はその場で最大 約 12 MB。
  現実の最大（8K の画面・6px の字で 1280×360＝約 46 万セル）は内側。`wtmctl pane control` の 1000×1000 はちょうど面積の上限（どちらの上限の内側）。
  visible の件数 4096 は herdr の描画の `MAX_PANES` と同じで、1 つの tab の pane の数として十分に大きい。
- 入力の待ち 16 MiB の理由（壊れる具体例を両側に置いた）:
  - 小さすぎる例（1 MiB）: `cat 3MB.log | wtmctl pane control <paneId>` で、貼り付けを 1 MB/s ほどでしか読まないエディタ（挿入モードの vim 等）へ流すと、
    wtmctl は LAN の速さで送るので待ちが 3 MB に届き、後ろの 2 MB が捨てられる（requirements の非機能要件「数 MB の流し込みは届く」を満たさない）。
  - 上限が無い例: `yes | wtmctl pane control <paneId>` を `stty raw; sleep 1d` の pane に向けると、サーバの待ちが送りの速さ（100 MB/s 級）で増え、
    1 分足らずでメモリを使い切ってサーバごと落ちる（F9 で raw モードの待ちが減らないことを実測）。
  - 16 MiB は 1 通の上限（1 MiB）の 16 通分で、数 MB の流し込みは余裕で通り、読まない pane 1 つあたりのメモリは 16 MiB＋1 通に留まる。
- 知らせの 2 秒: ブラウザで固まった pane に打ち続けると 1 打鍵ごとに捨てられる。毎回 toast を出すと画面が埋まり、出さないと気づけない。2 秒に 1 回なら
  打ち続けている間は知らせが続き、画面は埋まらない。
- 影響: 値は `terminalLimits.ts`（大きさ）と `TerminalHost.ts`（入力の待ち）・`WsGateway.ts`（間隔）の定数。docs に書く。

## D3: 背圧で待たせず、捨てて知らせる

- 背景: requirements は「上限の内側は届く・超えたら捨てて知らせる」。背圧（接続の読み取りを止める）も候補。
- 決定: 捨てて知らせる（herdr と同じ。F20）。
- 退けた案: 背圧——壊れる具体例: ブラウザで pane A（固まった TUI）に大きな貼り付けをした瞬間に `/ws` の読み取りを止めると、同じ接続で運ぶ pane B への打鍵・
  tab の切り替えの RPC・`client.view` まで止まり、画面全体が固まったように見える。中継の先では 1 本の ssh が全チャネルを運ぶので、別の利用者の接続まで止まる（F14）。
  接続を閉じる案——ブラウザは繋ぎ直すが pane は読まないままなので、繋ぎ直しと切断の輪になる。
- 影響: 捨てた分は失われる（知らせで分かる）。`pane control` で流し込みの欠けを避けたいスクリプトは、読む側の速さに合わせて送る必要がある（docs に書く）。
  本当の背圧（クレジット方式）は後続（backlog）。

## D4: 待ちの量は node-pty の内部から読み、測れなければ捨てない

- 背景: node-pty は書き終わりを公開の API で知らせない（F8）。
- 決定: Unix は `_writeStream._writeQueue`、Windows は `_agent.inSocket.writableLength` を読む。形が無い・例外なら `undefined`（測れない＝捨てない）。
  版は固定（`1.2.0-beta.15`）で、実物の PTY で量が測れることを統合テストで確かめる（更新で形が変われば落ちて気づける）。
- 退けた案: 自前で数える（書いた量を足すだけでは書き終わりが分からず、減らせない）。node-pty の書き込みを自前の fd の書き手に替える（D5）。
- 影響: Windows は実機で確かめていない（test-result の未検証の穴に書く）。

## D5: node-pty の busy loop・EBADF と、ほかの `/ws` の大きさの入力は後続にする

- 背景: research F9 で、読まない raw モードの pane に待ちがあると node-pty の `EAGAIN` の書き直しが `setImmediate` の輪で CPU を 1 コア近く（1 秒に user 278ms＋sys 543ms）
  使い続けること、子の終了後に待ちの残りを `EBADF` で捨てること（fd の番号が再利用されていれば別のファイルに書く恐れ）を実測した。上限は量を絞るが、どちらも量に比例しない。
  research F18 で名前・`cwd` の文字列に長さの上限が無いこと、F22 で `pane input`/`pane run` が捨てられても ok を出すこと、F14 で古い版の中継の先には上限が無いことが分かった。
- 決定: この work では変えず、backlog の `[ ]` 行に残す（deliver）。
- 理由: busy loop と EBADF は node-pty が持つ fd の寿命と競合しない書き手が要る別の改修。名前・`cwd` は端末の大きさでも PTY の入力でもなく、UI の入力欄の上限と
  合わせて決める必要がある。`pane input`/`run` の知らせは ack の無い一方向の送信の作りの変更が要る。

## D6: architecture は挟まない

- protocol.md「4.5」の 4 条件を見た: モジュール間の境界は動かさない（既存の `PtyProcess`・`TerminalHost` に任意のメソッドを足し、`WsGateway` の中で使うだけ。
  依存の向きは今までどおり ws → terminal → pty）。新しい構造・パターンの選択は無い。データモデルは定数とスキーマの上限だけ。tasks に直接分解できる粒度で書けている。
- 決定: architecture を実施せず tasks へ進む。

## D7: 負の確認・smoke は test 工程、backlog の行は deliver で消化する

- AC13 の「変異による負の確認」と `aidev smoke` は coding のタスク（T10）ではなく test 工程で行う（tasks の T10 は build・typecheck・test まで）。
- AC11 の「今回埋めないものを backlog の `[ ]` 行に残す」は deliver で `.aidev/backlog/product-roadmap.md` に足す（T9 は docs まで）。

## D8: `pane attach` は入力を捨てた知らせを表示しない（後続）

- 背景: cross の点検で、`pane attach` が `client.error`（`input_queue_full`）を黙って捨てることが分かった（`packages/cli/src/commands/attach.ts` の `onEvent`）。
- 決定: この work では表示を足さず、docs に「表示しない」と明記し、backlog に残す。
- 理由: 直結中の手元の端末は raw モード・代替画面で pane の画面を描いており、stderr に 1 行書くと pane の画面が崩れる。表示の場所（状態行・代替画面を出た後の要約等）を決める
  必要があり、この work の範囲（サーバ側の上限）の外。入力を捨てること自体はサーバで効いているので、メモリの上限は守られる。

## D9: 入力の待ちは「バイト数＋1 件あたり 256 バイト」で数え、量は O(1) で出す（review ラウンド 1 の must）

- 背景: 上限をバイト数だけで数えると、1 バイトの INPUT を大量に送ると 16 MiB に届くまでに約 1,600 万件（node-pty の待ちの 1 件は約 197 バイト）＝約 3 GB 積まれる。
  さらに判定が INPUT ごとに待ち行列の全件を走査するので、満杯の前後でイベントループが止まる（1 件ずつの JSON 行を流すスクリプトで起きる）。
- 決定:
  - 待ちの量＝バイト数＋件数×`INPUT_CHUNK_COST_BYTES`（256。node-pty の 1 件のおおよその大きさ）。上限は同じ 16 MiB。1 バイトの入力なら約 6.5 万件で止まる（実メモリ約 13 MB）。
    `cat 3MB.log | wtmctl pane control`（80 字の行×約 3.7 万通）は 3 MB＋9.5 MB≒12.5 MB で、D2 の「数 MB の流し込みは届く」を保つ。
  - 量は O(1) で出す。`PtyProcess` に `pendingWriteChunks?()` を足す。`NodePtyProcess` は自分が node-pty に渡した長さを同じ順で覚えておき（両端キュー）、
    node-pty の待ちの件数（`_writeQueue.length`）との差で書き終えた先頭を捨て、先頭の `offset` を引く（償却 O(1)）。覚えた件数と合わなければ（想定外）今までの全件の走査に戻す。
    `AdoptedPtyProcess`・`TerminalHost` の後回しの待ちは、積む・書く・捨てる所で数を増減する。
- 退けた案: 件数だけの上限（herdr の 1024 件）——行ごとに 1 通送る `pane control` で、読みの遅いエディタへの数 MB の流し込みが 1024 件で欠ける（D2 の小さすぎる例と同じ）。
- 影響: Windows は `writableLength`（O(1)）だけで件数は数えない（`net.Socket` の書き込み待ちは件数を公開しない）。

## D10: Windows の件数は socket の内部の待ちから読む（T11 の点検）

- `net.Socket` の `_writableState.buffered.length - bufferedIndex`（＋書いている途中の 1 件）を件数とする。Windows の実機では確かめていない（形が違えば 0 とみなし、バイト数だけの判定に戻る）。
- ready の前の `_deferreds` は引き続き数えない（backlog）。
- 追記（T11 の点検ラウンド 2・上限の 2 回目）: `net.Socket` は writev を持ち、書いている途中の束を 1 件と数えるので、束の件数−1 だけ少なく数える（最悪で件数の約 2 倍まで積まれうる。バイト数の 16 MiB は別に効く）。
  点検の上限（2 回）に達したので、この許容と「書いている途中は `_writableState.writing` で見る」直しは review ラウンド 2 に委ねる。

## D11: D9 の「影響」の Windows の件数は D10 で改めた（review ラウンド 2 の nit）

- D9 の「Windows は `writableLength` だけで件数は数えない」は、D10（`net.Socket` の内部の待ちの件数を数える）で改めた。D9 は当時の判断として残す（追記式）。
- review ラウンド 2 の BACKLOG（AdoptedPtyProcess の kill と書き込みの戻りの行き違いで `queuedBytes` が負になりうる——`pendingWriteBytes` は閉じた後 0 を返すので今は害が無い）は backlog に残す。
