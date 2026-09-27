# レビュー記録（20260926-kitty-graphics）

## タスク点検ログ

- T1 [nit] `encodePng` が整数でない幅・高さを通し、IHDR と行の長さが食い違う PNG を作りえた → `Number.isInteger` の検査を足し、テストを追加（`png.ts`・`png.test.ts`） [conv:-]
- T1 [nit] `isPng` が長さ 0 でない IEND と、途切れて再び来る IDAT を通した → どちらも偽にし、テストを追加 [conv:-]
- T1 [nit] IHDR の長さ 13 の条件と IEND の後のチャンクを確かめるテストが無く、条件を消す変異が生き残った → テストを追加し、変異で落ちることを確かめた（scratchpad/neg/t1c.log） [conv:regression-negative-control]
- T3 [nit] 文字の領域の画素を Mirror で手計算し、cellPixels.ts の windowPixels と式が 2 か所に分かれていた → windowPixels を使う形に直した [conv:-]
- T2 [should] 番号（`I`）から id への対応表が、画像を捨てても・保存しなくても縮まず、番号を変えて送り続ける出力でサーバのメモリを際限なく使えた → 捨てるときに対応も消し、保存できたときだけ対応を作る。テストを追加し変異で確かめた（scratchpad/neg/t2c.log） [conv:regression-negative-control]
- T2 [should] ミラーの行送りに LF を使っていたので、LNM（`CSI 20 h`）が有効だと x が 0 に戻り、画像が 0 列目以外から始まるとミラーとブラウザの列がずれた → IND（`ESC D`）に替え、LNM のテストを追加（decisions D12） [conv:-]
- T2 [nit] APC の中の ESC の直後に空の出力が来ると ST を取りこぼした → 空の出力は何もしない。テストを追加 [conv:-]
- T4 [nit] `windowPixels` が 0 以下のセル数で 0 画素を返し、下限 1 に丸める PTY とずれた → 下限 1 に丸める。テストを追加 [conv:-]
- T4 [nit] 生成時に画素の大きさを設定しないので、大きさの変更が一度も来ない pane では `ws_xpixel` が 0 のまま → decisions D9 のとおり（起動のたびの SIGWINCH を避ける）。その間はミラーが `CSI 14/16 t` に答える。変更なし [conv:-]
- T7 [nit] XTSMGRAPHICS の握りつぶしが設定の操作（Pa=2・3）も捨てることがコメントから読めなかった → 意図（交渉の相手がいない・後から接続したブラウザと状態がそろう）をコメントに書いた [conv:-]
- T7 [nit] テストの代役が応答を出さないので `responses` の断定が修正前でも通った → 代役に応答を出させ、設定（Pa=3）の列も送る形にした。握りつぶしを消す変異で落ちることを確かめた（scratchpad/neg/t7b.log） [conv:regression-negative-control]
- T6 [nit] addon の `activate` が途中で投げたとき（応答するハンドラを登録した後）を確かめるテストが無かった → 偽の addon で足し、握りつぶしが勝つことを確かめた [conv:-]
- T6 [nit] XTSMGRAPHICS の握りつぶしで Sixel のパレットの設定も捨てる副作用が decisions に無かった → D4 に既知の制約として書いた [conv:-]
- T6 [nit] `storageLimit` 32MB×端末 24 個＝最悪 768MB の見積もりが記録に無かった → 16MB（最悪 384MB）に下げ、D5・コメント・docs に見積もりを書いた [conv:-]
- cross [should] 1 枚 16 MiB まで通すと、base64 で配信の stale の閾値（2MB）を超え、画像が捨てられる・すぐ消える → ブラウザへ送る PNG の上限 `maxPngBytes`（1.25 MiB）を足し、テストと変異で確かめた（scratchpad/neg/t2e.log・decisions D5） [conv:regression-negative-control]
- cross [should] ブラウザで画像を置けなかったとき（addon 無し・復号の失敗・壊れた PNG）にミラーだけが下がる経路が docs に無かった → decisions D13・docs H13・backlog に既知の制約として書いた [conv:-]
- cross [should] DECSDM（`CSI ? 80 h`）でブラウザの addon だけが置き方を替え、カーソルが食い違う → 同上（安定した口が無いので既知の制約。D13） [conv:-]
- cross [nit] 起動直後は `ws_xpixel` が 0 でミラーの `CSI 14/16 t` と食い違う → decisions D9 のとおり。変更なし [conv:-]

## ラウンド 1（独立レビュー・委譲）

- [should] 1 MiB 前後の画像を続けて出すと、ブラウザへ送るバイト数が流量制御に入らないため `bufferedAmount`（2MB）を超えて購読者が stale になり、SNAPSHOT からやり直して既に届いた画像も含めて消える。docs・decisions・backlog は 1 枚の場合しか扱っていない — 根拠: packages/server/src/terminal/TerminalHost.ts:121-123, packages/server/src/terminal/OutputFanout.ts:69 [conv:-]
- [should] 生の画素から作り直す PNG が行のフィルタ 0・deflate level 1 固定でほとんど縮まず、pane に収まる大きさの写真でも `maxPngBytes` を超えて `EFBIG` になりうる。docs の「大きな写真は EFBIG」が実態と合わない — 根拠: packages/server/src/terminal/png.ts:95,108, docs/herdr-parity.md:36 [conv:-]
- [nit] `imageAddon.ts` のメモリの見積もり（16×24＝384MB）が、addon が新しい 1 枚を `storageLimit` を超えても保持する実装と合わない。「サーバが送る PNG（16 MiB 以下）」が古い — 根拠: packages/web/src/term/imageAddon.ts:9-12 [conv:-]

### ラウンド 1 の対応

- 続けて出る画像の流量: 既知の制約として docs H13・backlog (5)・decisions D14 に書いた（流量制御の設計を変えないため）。
- PNG の圧縮: 各行 Paeth（先頭 Sub）・level 6 にした（decisions D14。5 種を試す方式は主スレッドを約 1 秒止めたので採らない）。テストで復号の往復（ばらつきの大きい画素を含む）とフィルタ 0 だけより縮むことを確かめ、
  変異で確かめた（scratchpad/neg/r1png.log。生き残り 2 は同等変異: Paeth の同点の順序は a==b のときだけ異なり値が同じ／全行 Sub も正しい PNG）。docs の表現を実態に合わせた。
- メモリの見積もり: `imageAddon.ts` のコメント・decisions D5 を addon の実装（新しい 1 枚は上限を超えても保持）に合わせ、古い「16 MiB」を直した。

## ラウンド 2（独立レビュー・委譲。範囲はラウンド 1 の解消と、その差分の must/should）

- [nit] `png.test.ts` のテスト名「行ごとのフィルタ（0〜4）を選び」が、先頭 Sub・残り Paeth に固定した実装と合わない → テスト名を直した — 根拠: packages/server/src/terminal/png.test.ts:50 [conv:-]
- ラウンド 1 の 3 件は解消を確認（docs H13・backlog (5)・D14、level 6 とフィルタ、imageAddon.ts・D5 の見積もり）。must・should は 0。

通算（ラウンド指摘）: must 0・should 2・nit 2（タスク点検ログの件数は含めない）。
