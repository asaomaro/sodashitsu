# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/protocol/src/errors.ts:55-60 ErrorCode を足すと web の `clientError.ts` の `MESSAGES`（全 code の網羅）が型で壊れる / 対応: 修正済（T1 で文言を足した・ラウンド1）
- [nit][conv:-] packages/protocol/src/image.ts `isPastablePath` が双方向の書式制御・行区切り・対になっていないサロゲートを通す / 対応: 修正済（断る・テスト追加。T1・ラウンド1）
- [nit][conv:-] packages/protocol/src/image.test.ts 長さの足りない入力を PNG でしか確かめていない / 対応: 修正済（JPEG・GIF・WebP を追加。T1・ラウンド1）
- [should][conv:-] packages/server/src/image/ImageStore.test.ts 今書いたファイルを 24 時間の判定から外す条件がテストで効いていない / 対応: 修正済（時計を 48 時間進めるテスト。T2・ラウンド1）
- [should][conv:-] packages/server/src/image/ImageStore.test.ts 今書いたものを先頭に並べる比較がテストで効いていない / 対応: 修正済（mtime が未来の既存ファイルのテスト。T2・ラウンド1）
- [should][conv:-] packages/server/src/image/ImageStore.test.ts symlink のテストに Windows の除外が無い / 対応: 修正済（`it.runIf(posix)`。T2・ラウンド1）
- [nit][conv:-] packages/server/src/image/ImageStore.test.ts「24 時間ちょうど」のテストが 24h−1s しか見ていない / 対応: 修正済（ちょうど 24h。T2・ラウンド1）
- [nit][conv:-] packages/server/src/image/ImageStore.test.ts 不要な `now += 1`・重複 import / 対応: 修正済（T2・ラウンド1）
- [should][conv:-] packages/web/src/net/InputGate.ts:126-129 終わった保持の first を関所に通す分岐がテストで効いていない / 対応: 修正済（後の保持に溜まる・古い保持を追い越さないの 2 件を追加。T4・ラウンド1）
- [nit][conv:-] packages/web/src/net/InputGate.ts:8 「時間切れ」だけでなく 2 度目の呼び出しでも first を送る / 対応: 修正済（コメントを直し、ImagePaster は 1 度だけ終える。T4・ラウンド1）
- [nit][conv:-] design.md 画像の保持（20 秒）が先頭にある間は後の分割等の保持も流れない（打った順を保つ規則どおり）ことが書かれていない / 対応: 修正済（decisions D11。T4・ラウンド1）
- [should][conv:-] packages/server/src/image/ImageUploads.ts:91,124 保存を待っている画像が同時数の上限の外になり、保存が遅いとメモリが積み上がる / 対応: 修正済（保存中も `maxActive` に数える・テスト追加。T3・ラウンド1）
- [nit][conv:-] packages/server/src/image/ImageUploads.ts:149 `dispose` の後も保存が書き続け・begin を受ける / 対応: 修正済（`dispose` を async にし以後の begin を断り、書いている途中の保存を待つ。`close` はロックを放す前に await。T3・ラウンド1）
- [nit][conv:-] imagePaste.integration.test.ts 中継側の `WsGateway` の `onClientGone` の配線を確かめるテストが無い / 対応: T6（中継越しの結合テスト）で確かめる（T3・ラウンド1）
- [nit][conv:-] packages/server/src/image/ImageUploads.ts:124 保存を待つ間の次の begin・切断・cancel のテストが無い / 対応: 修正済（T3・ラウンド1）
- [should][conv:regression-negative-control] packages/server/src/composeServer.ts 中継側の `onClientGone` の配線を外すとテストが落ちることを実際に確かめていない / 対応: test 工程の負の確認（変異）の一覧に入れる（T6・ラウンド1）
- [nit][conv:-] machines.integration.test.ts テストの効きが「時間切れ 30 秒 > 待ち 15 秒」の大小に黙って頼る / 対応: 修正済（待ちを `idleMs / 2` から決め、コメントを付けた。2 つの結合テストとも。T6・ラウンド1）
- [should][conv:-] packages/web/src/term/ImagePaster.ts:133-137 直列の列の `.catch` がテストで効いていない（消すと以後の貼り付けが黙って止まる） / 対応: 修正済（仕事の中で投げるテストと、次の貼り付けが動くことの確認を追加。T5・ラウンド1）
- [nit][conv:-] packages/web/src/term/ImagePaster.ts:99-105 読み取りが投げると fallback（\x16）が失われる / 対応: 修正済（`fromKey` の中で読み取りの例外を画像無しとして扱う。T5・ラウンド1）
- [nit][conv:-] packages/web/src/term/ImagePaster.ts:129-131 保持の 20 秒を渡しているかのテストが無い / 対応: 修正済（T5・ラウンド1）
- [nit][conv:-] packages/web/src/term/ImagePaster.ts:109-127 `pasteClipboard` は読み取りの後に保持を作るので、読み取りの間に打ったキーが画像のパスより先に届く / 対応: 許容（decisions D12。テキストの経路と同じ。T5・ラウンド1）
- [should][conv:-] packages/web/src/keys/KeyInputController.ts:146 端末以外で Ctrl+V を押しっぱなしにすると 2 回目以降が食われる（入力欄の連続の貼り付けが 1 回に） / 対応: 修正済（`KeyRouter.directActionOf` でルーターの状態を変えずに先に見る・テスト追加。端末での繰り返しは 1 回だけ＝decisions D13。T7・ラウンド1）
- [nit][conv:-] packages/web/src/keys/assign.ts:119-124 既定で ctrl+v を使うため prefix を ctrl+v にできない / 対応: 許容（先に割り当てを外せばできる。decisions D13 に記す。T7・ラウンド1）
- [nit][conv:-] packages/web/src/keys/KeyInputController.ts:146 prefix の後のキーに割り当てたとき、端末以外で 2 打目が入力欄に文字として入る / 対応: 修正済（prefix 経由は食う・テスト追加。T7・ラウンド1）
- [nit][conv:-] KeyInputController.test.ts 各モードで Ctrl+V が画像を読まないことのテストが無い / 対応: 修正済（T7・ラウンド1）
- [must][conv:-] docs/verification.md:706 `cat -v` では行の規律が Ctrl+V（lnext）を食うので `^V` が出ない / 対応: 修正済（`stty lnext undef` を先に。T8・ラウンド1）
- [must][conv:-] docs/verification.md:714 BMP で「対応していない形式」のトーストは実装では出ない / 対応: 修正済（実際の結果に書き換え。T8・ラウンド1）
- [should][conv:-] docs/herdr-parity.md:77 状態ディレクトリは自分だけが書ける場所に置く前提（D9）が無い / 対応: 修正済（T8・ラウンド1）
- [nit][conv:-] docs/verification.md:699,705 既定の置き場所・権限の期待が POSIX の固定の書き方 / 対応: 修正済（XDG・Windows・POSIX 限定を明記。T8・ラウンド1）
- [nit][conv:-] docs/herdr-parity.md:77 HTTP ではキーから読めないことが無い / 対応: 修正済（T8・ラウンド1）
- [nit][conv:-] docs/machines.md:106-107 文体（常体）と置き場所（Windows の項目の続き） / 対応: 修正済（ます体の独立した段落へ。T8・ラウンド1）
- [should][conv:-] packages/web/src/term/ImagePaster.ts 仕事がマシンを覚えず、途中でマシンを切り替えると別のマシンの同じ id の pane へ画像・パス・溜めたキーが届く / 対応: 修正済（`resetForMachineSwitch` の世代で捨てる・`InputHold.discard`・`main.ts` の `resetView` から呼ぶ・テスト追加。cross・ラウンド1）
- [should][conv:-] packages/web/src/term/ImagePaster.ts:196 端末が LRU で捨てられただけでも「閉じた」とみなし、保存済みの画像のパスを黙って貼らない / 対応: 修正済（pane の有無は `paneExists`〔session〕で見て、始めたときの bracketed paste の状態で貼る・テスト追加。cross・ラウンド1）
- [nit][conv:-] decisions D7 溜める 20 秒の根拠が base64 の膨らみを数えていない / 対応: decisions D14 で訂正（cross・ラウンド1）
- [nit][conv:-] docs/machines.md リモートが古い版だと使えないことが無い / 対応: 修正済（cross・ラウンド1）
- [nit][conv:-] packages/web/src/keys/KeyInputController.ts prefix の後のキーに割り当てたとき、画像が無いと 2 打目の列を fallback に送りうる / 対応: 修正済（fallback は直接のキーのときだけ・テスト追加。cross・ラウンド1）
- [should][conv:-] packages/web/src/term/ImagePaster.ts:116-131 `resetForMachineSwitch` が保持をその場で捨てず、読み取りで止まっている間に次のマシンの同じ id の pane の文字を拾い・時間切れで前のマシンの文字を次のマシンへ流す / 対応: 修正済（始めて終わっていない仕事の保持を切り替えのときにすぐ `discard`・テスト追加。cross・ラウンド2）

## ラウンド 1（2026-09-27）
- [should][conv:-] packages/server/src/image/ImageStore.ts:97・packages/server/src/composeServer.ts:270-274 古い画像を消すのは次に保存したときだけで、貼らなくなると 24 時間を過ぎても無期限に残る（目的「古いものは自動で消える」・AC8・docs と食い違う） / 対応: 差し戻し（起動時と 1 時間ごとに後片付け）
- [should][conv:-] packages/web/src/term/ImagePaster.ts:133,188-197 キーの経路の読み取りに時間の上限が無く、Chromium の許可の画面に答えないと列が止まり、後の Ctrl+V の `\x16` が続くキーより後に届く（AC2・AC-I5） / 対応: 差し戻し（読み取りに上限を付け、超えたら画像無しとして fallback）
- [nit][conv:-] packages/server/src/image/ImageUploads.ts:158,218-223 小さな片を 30 秒未満ごとに送り続けると同時数の枠を無期限に占められる / 対応: 差し戻し（begin からの合計の期限）
- [nit][conv:-] packages/web/src/term/ImagePaster.ts:18 `IMAGE_HOLD_TIMEOUT_MS` のコメントが D14 の訂正を反映していない / 対応: 差し戻し（コメントを直す）

## ラウンド 2（2026-09-27）
- ラウンド 1 の 4 件（should 2・nit 2）はすべて解消を確認（`startSweeping` の起動・停止、キーからの読み取りの 2 秒、合計 5 分、コメント）。main（#65）の取り込みの衝突は `docs/herdr-parity.md` の H39/H44 の行だけで両方残っている。
- [nit][conv:regression-negative-control] packages/server/src/image/ImageStore.ts:154-158 1 時間ごとの後片付けと `stop()` を確かめるテストが無い（起動時だけ） / 対応: 修正済（`startSweeping` の単体テストを足した）
- [nit][conv:-] docs/herdr-parity.md:77 H44 に begin からの合計 5 分とキーからの読み取りの 2 秒が無い / 対応: 修正済
