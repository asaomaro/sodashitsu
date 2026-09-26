# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [must][conv:-] packages/cli/src/sessionStream.ts:123 `KNOWN_KEYS` が普通のオブジェクトなので `{"type":"constructor"}` 等で関数が引け、`known.includes` が TypeError を投げる（control が落ちる） / 対応: 修正済（T2・ラウンド1。Map にし、プロトタイプの名前の type のテストを追加）
- [should][conv:-] packages/cli/src/sessionStream.test.ts 上の不具合を捕まえるテストが無い / 対応: 修正済（T2・ラウンド1。constructor・__proto__・toString・hasOwnProperty）
- [should][conv:-] packages/cli/src/sessionStream.ts:118 `isCanonicalBase64` が埋め草の直前の余りのビットを見ず `YR==` を通す / 対応: 修正済（T2・ラウンド1。符号化し直して一致を比べる。`YR==`・`YWK=` を非正規の表に追加）
- [nit][conv:-] packages/cli/src/sessionStream.ts:185 bytes を戻した配列が Node の共有プールを指す / 対応: 修正済（T2・ラウンド1。`Uint8Array.from` で独立させ、テストを追加）
- [nit][conv:-] packages/cli/src/cliArgs.ts:355 `--cols 0` 等は「正の整数」、上限超えは「1〜1000」と案内の文言がそろわない / 対応: 修正済（T3・ラウンド1。範囲つきの同じ文言にし、テストを追加）
- （主エージェントが T2 の修正中に追加）理由に入れる利用者の type・キーを JSON 文字列にして 64 文字で切る（制御文字をそのまま stderr に流さない）。テストを追加。
- [should][conv:regression-negative-control] packages/cli/src/sessionStream.test.ts `cell_height_px` の検査を確かめるテストが無い / 対応: 修正済（T2・ラウンド2。負と小数のケースを追加）
- [nit][conv:-] packages/cli/src/sessionStream.ts:158 `trim()` で U+3000 等の Unicode 空白だけの行も黙って無視していた / 対応: 修正済（T2・ラウンド2。JSON の空白〔space・tab・CR〕だけを empty とし、テストを追加）
- [nit][conv:-] packages/cli/src/sessionStream.ts:154 `TextDecoder` の既定で行頭の BOM を黙って落として受理していた / 対応: 修正済（T2・ラウンド2。`ignoreBOM: true` で JSON 不正にし、テストを追加）
- [nit][conv:-] packages/cli/src/sessionStream.ts:75 Buffer を渡すと `slice` が写さずビューを返す / 対応: 修正済（T2・ラウンド2。`Uint8Array.prototype.slice.call` で写し、Buffer を書き換えるテストを追加）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:216 受信を止めたまま正常に終わると `resume()` せずに `close()` し、`ws` が close フレームを読めず closeTimeout（30 秒）まで終われない / 対応: 修正済（T4・ラウンド1。`dispose` で止めていれば再開し、テストを追加）
- [should][conv:regression-negative-control] packages/cli/src/commands/sessionStream.test.ts 最初の SNAPSHOT より前の OUTPUT を捨てる条件を確かめるテストが無い / 対応: 修正済（T4・ラウンド1。テストを追加）
- [nit][conv:-] packages/cli/src/commands/sessionStream.ts:229 SNAPSHOT のフレームで受信を止めると `pane.subscribe` の応答が読めず 10 秒の時間切れで失敗しうる / 対応: 修正済（T4・ラウンド1。応答を受け取るまで止めない `allowPause` を足し、テストを差し替え）
- [nit][conv:regression-negative-control] packages/cli/src/commands/sessionStream.test.ts:436 受信の再開が close() より前であることを確かめていない / 対応: 修正済（T4・ラウンド2。fn の後で close する形にモックし、["pause","resume","close"] の順を確かめる）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:307 hello から `pane.attach` の応答までに届いた pane の終わりで `terminal.closed` を書いた後に attach の失敗を投げうる（始まる前の失敗は stdout に何も書かない、が破れる） / 対応: 修正済（T5・ラウンド1。attach が通るまでイベントをストリームに渡さない。テストを追加）
- [should][conv:regression-negative-control] packages/cli/src/commands/sessionStream.test.ts:601 解放中の pane の終了・切断が released になることを確かめていない（奪取だけ） / 対応: 修正済（T5・ラウンド1。奪取・exited・closed・切断の 4 通りに）
- [nit][conv:-] packages/cli/src/commands/sessionStream.ts:325 受信を止めている間に解放を始めると detach の応答が読めず 10 秒止まり、2 度目の Ctrl+C も効かない / 対応: 修正済（T5・ラウンド1。解放を始めたら受信を再開して以後止めない・2 度目のシグナルは即座に released で終える。テストを追加）
- [nit][conv:-] packages/cli/src/commands/sessionStream.test.ts:645 「所有者になる前」のテストのコメントが実際に通る経路（clientId を知る前）と合っていない / 対応: 修正済（T5・ラウンド1。コメントを実際の経路に合わせた）
- [should][conv:-] packages/cli/src/smoke.ts:133 終了コードを 'exit' で確定させており、stdout の最後の行を読み切る前に判定して間欠的に落ちうる / 対応: 修正済（T7・ラウンド1。'close' で確定し、改行の無い末尾も行に入れる）
- [nit][conv:-] packages/cli/src/smoke.ts:182 control の stdin に 'error' の受け手が無く、先に終わった後の書き込みの EPIPE で smoke が落ちる / 対応: 修正済（T7・ラウンド1）
- [nit][conv:-] packages/cli/src/smoke.ts:122 JSON でない行でどのプロセスの何行目か分からない SyntaxError になる / 対応: 修正済（T7・ラウンド1。行番号つきのエラーにした）
- [nit][conv:-] packages/cli/src/smoke.ts:158 コメントが「所有」を確かめると書くが見ているのは大きさだけ / 対応: 修正済（T7・ラウンド1。コメントを実際に確かめる内容に合わせた）
- [should][conv:-] docs/wtmctl.md:123 `cell_width_px`・`cell_height_px` を「受け付けて使わない」とだけ書き、0 以上の整数でなければ不正になることが無い / 対応: 修正済（T8・ラウンド1）
- [nit][conv:-] docs/wtmctl.md:122 不正の一覧に「type が無い・文字列でない」「text が文字列でない」が無い / 対応: 修正済（T8・ラウンド1。BOM・全角空白も明記）
- [nit][conv:-] docs/wtmctl.md:303 「上の表」の参照先が表ではない / 対応: 修正済（T8・ラウンド1。節の名前で参照）
- [nit][conv:-] docs/wtmctl.md:130 observe の止め方（シグナルでは terminal.closed が出ない）が無い / 対応: 修正済（T8・ラウンド1）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:237 subscribe の応答より先に解放を始めると、応答の `allowPause` が止めてよい状態に戻し、解放中に再び受信を止めて detach の応答が読めなくなる / 対応: 修正済（T5・ラウンド2。解放中は `allowPause` が何もしない。回帰テストを追加）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:324 attach の応答と同じ受信の塊で直後に届いたイベントを `attached = true` の前に捨て、pane の終わりを取りこぼして not_found で終わりうる / 対応: 修正済（T5・ラウンド2。attach までのイベントは溜め、始めてから順に渡す。回帰テストを追加）
- [nit][conv:-] packages/cli/src/commands/sessionStream.ts:378 hello から attach の応答までの切断に気づけず 10 秒の時間切れで終わる / 対応: 修正済（T5・ラウンド2。始める前の切断は stdout に何も書かず connection_closed。始める直前に切れていれば始めてから終える。テストを追加）
- [must][conv:-] packages/cli/src/sessionStream.integration.test.ts:390 AC13 の「pane に何も届かない」が常に成り立つ（stdin の購読が始まる前に送った行は偽の stdin が捨てていた） / 対応: 修正済（T6・ラウンド1。始まる前の行は溜めて購読の開始時に渡す形にし、購読が一度も始まらないことも確かめる）
- [must][conv:-] packages/cli/src/sessionStream.integration.test.ts:286 所有の奪い合いが片方向だけ（pane attach 所有中の control の拒否・control --takeover が pane attach から奪う、が無い） / 対応: 修正済（T6・ラウンド1。両方向を追加）
- [should][conv:-] packages/cli/src/sessionStream.integration.test.ts:391 誤った token の失敗を `toBeInstanceOf(Error)` で判定していた / 対応: 修正済（T6・ラウンド1。AuthError と `login failed: HTTP 401` まで絞った）
- [should][conv:-] packages/cli/src/sessionStream.integration.test.ts:182 「observe は大きさを変えない」を observe を始める前の大きさと比べていない / 対応: 修正済（T6・ラウンド1）
- [should][conv:-] packages/cli/src/sessionStream.integration.test.ts:286 途中で落ちたときの後始末（pane・実行中の observe/control）が無いテストがある / 対応: 修正済（T6・ラウンド1。try/finally で pane を閉じ全ての実行を待つ）
- [nit][conv:-] packages/cli/src/sessionStream.integration.test.ts:183 検査が片方の observe にしか掛かっていない・「不正な行は何も送らない」を確かめていない / 対応: 修正済（T6・ラウンド1。両方の observe を検査し、不正な行の印が出ず後の正しい行の印が出ることを見る）
- [nit][conv:-] packages/cli/src/sessionStream.integration.test.ts:206 observe 開始直後の「大きさ・所有者が変わらない」確認がサーバの処理順を確定させずに読んでいる / 対応: 修正済（T6・ラウンド2。watcher の接続で 1 往復してから見る）
- [nit][conv:-] packages/cli/src/sessionStream.integration.test.ts:387 runThird だけ `.catch` が無く、失敗時に未処理の reject が重なる / 対応: 修正済（T6・ラウンド2）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:216 失敗で終わる（taken_over・connection_closed）と `terminal.closed` を積んだ直後に reject し、`reportAndExit` の `process.exit(1)` でパイプの書き出し待ちが捨てられる（点検者が 3 MiB＋記録で実測） / 対応: 修正済（cross・ラウンド1。`StreamIo.flushOut`〔空の書き込みのコールバック〕を待ってから reject。単体テストを追加。主エージェントも `write("",cb)` の後の exit で 3 MiB＋END が全部届くことを実測）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:254 受信を止めている間は奪取の知らせを読めないのに stdin の入力を送り続ける / 対応: 修正済（cross・ラウンド1。受信を止めている間は stdin も止める〔`onFlowChange`〕。単体テストを追加）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:231 失敗で終わるときの書き出し待ちが、読み手の止まったパイプでは終わらず、その間シグナルも効かない（SIGKILL でしか止まらない） / 対応: 修正済（cross・ラウンド2。書き出しを待つのは 5 秒まで〔FLUSH_TIMEOUT_MS〕。テストを追加）
- [nit][conv:-] docs/wtmctl.md:101 「書いた行は追いついた後に処理する」は、止めている間に終わった場合には当たらない / 対応: 修正済（cross・ラウンド2。「終わる前に追いつけば」に限定）

## ラウンド 1（独立レビュー・opus）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:393 2 度目のシグナル・解放中の切断で released で終えても、未応答の `pane.detach` の要求の 10 秒のタイマー（`wsClient.ts:141`。unref されず `close()` でも消えない）がプロセスを最大 10 秒残す / 対応: 差し戻し（自分で閉じたら待ち中の要求のタイマーを消す）
- [should][conv:-] packages/cli/src/commands/sessionStream.ts:67 不正な行の警告を stderr の書き出し待ちを見ずに書き続け、stderr を読まない相手だと wtmctl のメモリが増え続ける / 対応: 差し戻し（書き出し待ちが上限を超えたら警告を捨てる）
- [nit][conv:-] packages/cli/src/commands/sessionStream.ts:415 control の入力に背圧が無く、pane が読まないとサーバの PTY の書き込みキューが増える（既存の INPUT の経路と同じ性質） / 対応: backlog へ（サーバの INPUT の経路の課題。deliver で `[ ]` を起こす）
- [nit][conv:-] docs/wtmctl.md:134 解放を始めた後の奪取・切断は released・終了コード 0 になる例外が終了コードの節に無い / 対応: 差し戻し（1 行足す）

## ラウンド 2（独立レビュー・opus。範囲はラウンド 1 の指摘の解消と、その修正の差分）
- 指摘なし（ラウンド 1 の should 2 件・nit 1 件は解消、nit 1 件〔入力の背圧〕は backlog へ回すことを確認）
