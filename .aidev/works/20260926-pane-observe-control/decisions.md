# 判断の記録: 20260926-pane-observe-control

autonomous（humanGates なし）のため、方針は承認者を待たずにここへ書いて進めた（protocol-autonomous.md「方針の事前承認」）。

## D1: サーバを変えず、既存の RPC・イベント・フレームだけで作る

- 採用: CLI（`packages/cli`）だけ。control の所有者と大きさは `pane.attach`/`attach_resize`/`detach`、出力は `pane.subscribe`、入力は INPUT フレーム。
- 退けた案: サーバに observe/control 専用の RPC とストリームを足す——所有者の表が `pane attach` と二重になり、奪い合いの規則を 2 か所で持つことになる。
  既存の部品で要件が満たせる（research F1〜F5）。

## D2: フレームは生の出力の区切り。observe は `--cols/--rows` を持たない

- herdr はサーバで観測者の大きさに描き直したフレームを送る。web-tn-multiplexer は生の PTY の出力を流す設計（`pane attach` も同じ）で、観測者ごとの大きさを持つ部品が無い。
- 退けた案: `--cols/--rows` を受け付けて無視する——効かない値を受け付けると、ブリッジの作者が描画の崩れの原因を探せない。
- 退けた案: サーバのミラーで観測者の大きさに描き直す——ミラーは pane に 1 つで、観測者ごとの端末を作るのはサーバのメモリと大きな改修が要る。後続の `[ ]` に残す。

## D3: フレームから端末への問い合わせを取り除く

- `pane attach` の `TerminalQueryFilter` を通す。ブリッジが列を端末エミュレータに流すと、エミュレータの答えが `terminal.input` で戻り、サーバのミラーの答えと二重になる。
  herdr のフレームは描き直した画面で問い合わせを含まないので、取り除いた方が herdr に近い。
- 代償: 生の出力を完全には再現しない（録画の用途で問い合わせの列が消える）。UTF-8 として正しくない列は U+FFFD になる（SNAPSHOT が既に文字列なので同じ扱い）。

## D4: 読み手が遅いときは `ws` の受信を止める（切らない）

- stdout の書き出し待ちが 1 MiB を超えたら `pause()`、`drain` で `resume()`。止めている間はサーバの流量制御（2 MB で購読を止め出力を捨て、戻ったら SNAPSHOT）に乗る。
- 退けた案 A: 上限を超えたら `output_stalled` で終わる（requirements の初版）——`cat` で大きなファイルを出すだけで、一時的に遅いブリッジが死ぬ。
- 退けた案 B: 何もしない——読まない読み手のぶんだけ wtmctl のメモリが増え続ける（research F3）。
- herdr は 30 秒書けなければ切る。ここでは切らない（サーバは出力を捨てるのでメモリは増えない）。読み手が永久に読まなければ wtmctl は残る——リスクとして記録。

## D5: 不正な入力行は読み飛ばして続ける。検査は herdr より厳しい

- herdr と同じく stderr に理由を出して続ける（1 行の誤りで長いセッションを落とさない）。
- herdr（serde の既定）は知らないキーを無視し、base64 も寛容。ここではキーの白リスト・正規の base64・整数の範囲を確かめる（ユーザーの指示「known types only・strict」）。
  herdr の `terminal.resize` の `cell_width_px`/`cell_height_px` は知っているキーとして受け付け、使わない（herdr 向けのブリッジを壊さない）。

## D6: 大きさは 1〜1000

- サーバの `PaneAttachParams` に上限が無く（research F4）、巨大な大きさはサーバのミラーのメモリを食う。herdr は 1〜65535。CLI で 1000 に絞る。
  サーバ側の上限（`client.view` を含む）は別の課題として backlog に残す。

## D7: `terminal.scroll` は未対応

- サーバ側のスクロール（`pane attach` の「直結中のサーバ側のスクロール」）と同じ土台が要る。既存の backlog 項目に合流させる。

## D8: 対象は pane ID だけ

- herdr は pane・terminal・agent の対象を受ける。エージェントの名前での指定は `agent attach <name>` と同じ後続（既存の backlog 項目）に合流させる。

## D9: 受信を止めるのは `pane.subscribe` の応答の後だけ。解放を始めたら再開し、以後は止めない（coding・タスク点検 T4/T5 から）

- 止めると socket を読まないので、その後に届く RPC の応答（subscribe・detach）が読めず、要求の時間切れ（10 秒）で失敗する。
  subscribe の応答までは止めず（SNAPSHOT が 1 MiB を超えて届いても）、応答の後で書き出し待ちが上限を超えていれば止める。
  control の解放では detach の応答を読むために再開する。終わるときも止めていれば再開する（`ws` の close が相手の close フレームを読めず 30 秒待つため）。
- design「共通のストリーム」の一時停止の条件に、この 2 つの例外が加わる（振る舞いの趣旨は D4 のまま）。

## D10: control は `pane.attach` が通るまで pane のイベントをストリームに渡さない（タスク点検 T5）

- hello から attach の応答までに pane が閉じると、`terminal.closed` を書いた後に attach の `not_found` を投げることになり、
  「始まる前の失敗は stdout に何も書かない」（design「終わり方」）が破れる。その間の pane の終わりは attach の失敗で分かる。

## D11: control の 2 度目のシグナルは detach の応答を待たずに `released` で終える（タスク点検 T5）

- 1 度目で detach を送り応答を待つ。応答が来ない（サーバが詰まっている等）ときに Ctrl+C が効かなくならないように、2 度目は即座に終える
  （所有は接続を閉じれば `onClientGone` で解放される）。

## D12: 失敗で終わる前に stdout を書き出す・受信を止めている間は stdin も止める（タスク横断点検 cross）

- 終了コード 1 の終わり方は `reportAndExit` が即 `process.exit(1)` するので、`terminal.closed` の後に `flushOut` を待ってから知らせる。
  読み手が永久に読まなければ終われない（D4 と同じ扱い。切らない）。
- 受信を止めている間（D4）は `pane.attach_changed` が読めない。その間に奪われても入力を送り続けないよう、stdin も止める（行は stdin に残り、再開後に処理される）。

## D13: review ラウンド 1 の対応

- `WsWtmClient.close()` で待ち中の要求の時間切れのタイマーを消す（決着しない Promise は捨てる）。サーバ側からの切断（'close' イベント）では消さない——
  既存のコマンドは要求の時間切れで待ちを終えるものがあるため。サーバ側から切れた場合も、`withSession` が最後に `close()` するので残らない。
- 不正な行の警告は stderr の書き出し待ちが 64 KiB を超えている間は捨てる（`MAX_WARN_PENDING_BYTES`）。
- control の入力の背圧（pane が読まないとサーバの PTY の書き込みキューが増える）は既存の INPUT の経路と同じ性質で、サーバを変えない本作業の範囲外。backlog に起こす。
