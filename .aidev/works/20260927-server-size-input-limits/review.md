# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:-] packages/web/src/net/clientError.ts:9 冒頭の説明が「サーバが client.error で送るのは invalid_params だけ」のまま / 対応: 修正済（T1・ラウンド1。input_queue_full を説明に足した）
- [must][conv:-] packages/server/src/pty/NodePtyBackend.integration.test.ts 2 本の PTY の READY を 1 本ずつ onData を付けて待つので、先に出た側の READY を取りこぼして時間切れになりうる（点検者の実行で再現） / 対応: 修正済（T3・ラウンド1。spawn の直後に受ける）
- [should][conv:-] packages/server/src/pty/NodePtyBackend.integration.test.ts 待ちの合計が vitest の既定 5 秒を超えうる / 対応: 修正済（T3・ラウンド1。15 秒を渡す）
- [nit][conv:-] packages/server/src/pty/NodePtyBackend.ts Windows の ready 前の `_deferreds` は数えない点が説明に無い / 対応: 修正済（T3・ラウンド1。コメントに明記）
- [nit][conv:-] packages/server/src/pty/AdoptedPtyProcess.ts 相手が閉じた後も queue の残りを待ちとして返す / 対応: 修正済（T3・ラウンド1。閉じた後は 0）
- [should][conv:-] packages/server/src/surface/methods/attach.test.ts 上限ちょうどの陽性の対照が面積（1000×1000）だけで、1 辺 4096・visible 4096 件が通ることを見ていない / 対応: 修正済（T2・ラウンド1。4096×244・244×4096・4096 件を足した）
- [nit][conv:-] packages/server/src/surface/methods/attach.test.ts attach_resize の上限近くの陽性の対照が無い / 対応: 修正済（T2・ラウンド1）
- [nit][conv:-] packages/server/src/surface/methods/attach.test.ts `{cols: 0}` は上限と関係なく断られる / 対応: 修正済（T2・ラウンド1。外した）
- [nit][conv:-] packages/server/src/surface/methods/attach.test.ts size_changed の件数を条件式で決めていた / 対応: 修正済（T2・ラウンド1。前の件数と比べる）
- [nit][conv:-] packages/server/src/terminal/TerminalHost.test.ts 終了後の writeInput のテストが戻り値だけで、write に任せたか（pty に届いたか）を見ていない / 対応: 修正済（T4・ラウンド1）
- [nit][conv:-] packages/cli/src/commands/sessionStream.ts `warnLine` を挟んだ位置で `pending` の JSDoc が `let pending` から離れた / 対応: 修正済（T8・ラウンド1。warnLine を JSDoc の前へ）
- [nit][conv:-] docs/wtmctl.md・docs/verification.md 捨てる条件を「16 MiB に達したら」と書いていたが、判定は「溜まった量＋今回の長さ > 16 MiB」 / 対応: 修正済（T9・ラウンド1）
- [nit][conv:-] docs/wtmctl.md 「wtmctl・ブラウザは丸める」とあるが丸めるのはブラウザと pane attach だけ（pane control は 1〜1000 の外を断る） / 対応: 修正済（T9・ラウンド1）
- [nit][conv:-] docs/wtmctl.md 「サーバ側の上限」が observe/control の小節の間に割り込んでいた / 対応: 修正済（T9・ラウンド1。独立した ## にした）
- [should][conv:-] docs/wtmctl.md `pane attach`・`pane input`・`pane run` は input_queue_full の知らせを表示しないのに、docs は「送った接続に知らせる」とだけ書いていた。`pane attach` は検討も無かった / 対応: 修正済（cross・ラウンド1。docs に明記し、attach の表示は decisions D8 で後続へ）
- [nit][conv:-] packages/cli/src/sessionStream.ts `MAX_STREAM_DIMENSION` とサーバの上限の関係を確かめるテストが無い / 対応: 修正済（cross・ラウンド1。sessionStream.test.ts に足した）

## ラウンド 1（2026-09-27。別コンテキストのレビュアー・opus）
- [must][conv:-] packages/server/src/terminal/TerminalHost.ts:190・packages/server/src/pty/NodePtyBackend.ts:123 上限がバイト数だけで件数を見ない。1 バイトの INPUT を大量に送ると 16 MiB に届くまでに 1,600 万件（1 件約 197 バイト→約 3 GB）積まれ、しかも判定が INPUT ごとに待ち行列の全件を走査する（100 万件で 1 回約 64 ms）ので、満杯の前後でイベントループが止まり他の pane を巻き込む（レビュアーの実測と外挿） / 対応: 差し戻し（1 件あたりの手間を数え、量は O(1) で出す）
- [nit][conv:-] packages/cli/src/commands/attach.ts:165 最初の大きさで `term.size()` を 2 回呼ぶ / 対応: 差し戻しで一緒に直す
- [nit][conv:-] packages/server/src/pty/NodePtyBackend.ts:66-67 Windows の ready 前の `_deferreds` は数えない（ConPTY が ready にならなければ上限が無い。推測） / 対応: 許容（test-result の未検証の穴に記載済み。backlog にも残す）
- [should][conv:-] packages/server/src/pty/NodePtyBackend.ts 覚えた長さを詰め直すのが判定の時だけで、判定を通らない書き込み（問い合わせへの応答等）だけが続く pane で際限なく増える / 対応: 修正済（T11・ラウンド1。1024 件を超えたら書き込みのたびに詰め直す）
- [should][conv:-] packages/server/src/pty/NodePtyBackend.ts Windows は件数を数えず review の must が解けていない / 対応: 修正済（T11・ラウンド1。socket の内部の待ちの件数を読む。実機は未確認）
- [nit][conv:-] packages/server/src/pty/NodePtyBackend.integration.test.ts O(1) の道を通ったかを区別できず、多バイトの文字を書いていない / 対応: 修正済（T11・ラウンド1）
- [nit][conv:-] packages/server/src/terminal/TerminalHost.ts:73 「16 通分」のコメントが件数の手間と食い違う / 対応: 修正済（T11・ラウンド1）
- [nit][conv:-] design.md の判定式に件数の手間が無い / 対応: 修正済（T11・ラウンド1）
- [should][conv:-] packages/server/src/pty/NodePtyBackend.ts windowsSocketChunks は writev の束を 1 件と数え、束の件数−1 だけ少なく数える / 対応: 許容（T11・ラウンド2。バイト数の上限は別に効き、最悪で件数の約 2 倍。コメントと decisions D10 に明記。Windows の実機は未確認）
- [nit][conv:-] packages/server/src/pty/NodePtyBackend.ts 書いている途中を writableLength で判断していた / 対応: 修正済（T11・ラウンド2。`_writableState.writing` を見る）
- [nit][conv:-] packages/server/src/pty/NodePtyBackend.ts SentLengths の JSDoc がクラスから離れた / 対応: 修正済（T11・ラウンド2）

## ラウンド 2（2026-09-27。別コンテキストのレビュアー・opus。範囲はラウンド 1 の指摘の解消とその後の差分）
- ラウンド 1 の must（件数を見ない・O(n) の走査）は解消（バイト数＋件数×256・償却 O(1)。node-pty の同梱ソースと前提を突き合わせ済み）。nit（term.size の 2 回）も解消。
- [nit][conv:-] .aidev/works/20260927-server-size-input-limits/decisions.md:86 D9 の「影響」の Windows の件数の記述が D10 と食い違う / 対応: 許容（decisions は追記式なので D11 で D10 が改めたことを明記）
