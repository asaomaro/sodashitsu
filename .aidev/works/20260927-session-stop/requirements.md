# 要件: 名前付き session を CLI から止める（`wtm session stop`。herdr H33 の残り）

## 背景 / 課題

名前付き session（20260926-named-session・20260926-named-session-ui）は `wtm session list` で動いているかと pid が見えるが、
**動いている `wtm serve` を外から止める手段が無い**。止めるには、その `wtm serve` を起動した端末で Ctrl+C を押すか、
一覧の pid へ `kill` を打つしかない（`docs/herdr-parity.md` H33 の⑤）。

- 起動した端末が手元に無い（別の tmux の窓・systemd・`nohup` で起動した）と Ctrl+C を押せない。
- pid へのシグナルは、`wtm.lock` に書かれた pid が既に別のプロセスに再利用されていれば**無関係なプロセスを止める**
  （`packages/server/src/persist/StateDirLock.ts` の「扱わないこと」、backlog `product-roadmap.md` の注記）。
- `wtm session delete <名前>`・`wtm token reset` は動いている session には断るが、「止めてから」と言うだけで止め方を示せない。

herdr には `herdr session stop <name> [--json]` がある（一次資料 `scratchpad/herdr/src/cli.rs` の `session_stop`、`src/session.rs` の
`stop_session_with_timeout`。decisions D1）: session の API socket に停止を送り、止まるまで待って `stopped session <name>` を出す。

## 目的 / ゴール

- 動いている session（既定・名前付き）を、**名前だけで、起動した端末に触れずに**止められる状態。止め方は Ctrl+C と同じ正常な停止
  （`session.json` の保存・有効なら画面履歴の保存・pane のプロセスの終了・`wtm.lock` の解放）で、止めた結果の状態は Ctrl+C と区別がつかない。
- 止める指示が**同じ利用者の同じマシンの中だけ**で届き、新しいネットワークの待ち受けを作らず、pid の再利用で無関係なプロセスを止めない状態。
- 止められなかったとき（動いていない・古い版で止める指示を受け付けない・引き継ぎの最中・別のホスト・非対応の OS）に、
  **何が起きたかと次に何をすればよいかが CLI の出力と終了コードで分かり**、サーバは指示の前のまま動き続けている状態。
  指示を受け付けた後に時間内に止まりきらなかったときは、止まったとは報告されず、サーバは停止の途中にある（止め直しでなく `server.log` を見る）と分かる状態。
- 止めるコマンドを使わない利用者には、今までの動作（Ctrl+C・`wtm handoff`・`wtm session list`/`delete`）が何も変わらない状態。

## ユーザーストーリー

- US1: 名前付き session を複数動かしている利用者として、名前を指定して session を止めたい。なぜなら、起動した端末を探して Ctrl+C を押すのは面倒で、
  端末が手元に無いこともあるから。（受け入れ: AC1, AC2, AC7, AC10, AC16）
- US2: 利用者として、止めても次の起動でレイアウトと画面履歴が戻ってほしい。なぜなら、Ctrl+C で止めたときと同じ状態で再開したいから。（受け入れ: AC1）
- US3: 運用者として、止める口が同じ利用者に限られ、pid の再利用で別のプロセスを止めないでほしい。なぜなら、止めるのは全 pane のプロセスを
  終わらせる操作で、他人が叩けたり取り違えたりすると作業が失われるから。（受け入れ: AC4, AC9）
- US4: スクリプト・エージェントから使う開発者として、止まったか・動いていなかったか・失敗したかを終了コードと `--json` で機械的に見分けたい。
  なぜなら、止めた後に `wtm session delete` や起動し直しを続けて打ちたいから。（受け入れ: AC2, AC3, AC8, AC10, AC11）
- US5: 利用者として、止められないとき（古い版・引き継ぎの最中・時間切れ・Windows）に理由と次の手が知りたい。なぜなら、黙って失敗されると
  Ctrl+C に戻るべきかどうか判断できないから。（受け入れ: AC5, AC6, AC8, AC11, AC12）
- US6: `wtm session delete`・`wtm token reset` を打って「動いている」と断られた利用者として、止め方を案内してほしい。なぜなら、断られた後に
  止め方を調べ直す手間を省きたいから。（受け入れ: AC13）
- US7: herdr から移ってきた利用者として、`herdr session stop` との違いを docs で知りたい。（受け入れ: AC14）
- US8: 止めるコマンドを使わない利用者として、今までと同じに動いてほしい。（受け入れ: AC15）

## スコープ

### 対象

- CLI `wtm session stop <名前> [--state-dir D] [--json]`（名前は必須。`default` は既定の session。decisions D3）。
- 動いている `wtm serve` が、状態ディレクトリの制御の socket（既存の `handoff.sock`）で止める指示を受け、Ctrl+C と同じ正常な停止を行うこと（decisions D2）。
- 止める指示と、引き継ぎ（`wtm handoff`）・Ctrl+C（終了のシグナル）・もう一度の止める指示が重なったときの扱い。
- 動いていない・名前の無い session・別のホストの session・古い版・時間切れの、はっきりした報告と終了コード。
- `wtm session delete`・`wtm token reset` が動いている session に断るときの案内に、止めるコマンドを添えること。
- ヘルプ・使い方の表示、`docs/herdr-parity.md` の H33、`docs/verification.md` の更新。
- Linux で実物（ビルドした `wtm`）を使って確かめる。macOS は同じ仕組みで動く設計にするが実機では確かめない（未検証として記す）。

### 対象外

- **Windows での `wtm session stop`**（非対応と答えて終わる。decisions D2。backlog に `[ ]` で残す）。
- 名前を省いたときに `WTM_SESSION` の session を止めること（decisions D3）。
- 画面（ブラウザ）から session を止める操作・`server.sessions` の一覧からの停止（backlog の「画面の続き」とは別。必要なら後続）。
- 複数の session をまとめて止める（`--all` 等）。herdr にも無い。
- 別のホストで動いている session を止めること（そのホストで打つよう案内するだけ）。
- 起動の途中（復元が終わる前）の `wtm serve` を待って止めること（制御の socket が立つ前なので、「まだ起動中か古い版」と案内して終わる）。
- 止める指示の後、正常な停止が時間内に終わらないサーバを強制的に終わらせること（案内だけ）。

## 機能要件

- `wtm session stop <名前>` は、その session の状態ディレクトリの `wtm.lock` の持ち主（このホスト）へ、制御の socket で止める指示を送る。
- サーバは指示を受けたら、返事（自分の pid を含む）を返してから、Ctrl+C と同じ停止の経路で止まり、終了コード 0 で終わる。
- CLI は、返事の pid が `wtm.lock` の持ち主と一致することを確かめ、その持ち主が `wtm.lock` から居なくなる（プロセスが終わる）まで待ってから
  「止まった」と報告する。上限時間を過ぎたら、止まったとは言わずに失敗として報告する。
- 引き継ぎの最中の止める指示は断る（サーバはそのまま）。止める指示を受けた後の引き継ぎの指示は断る。
- 止める指示が重なっても（2 回目の `wtm session stop`、Ctrl+C の後の止める指示）、正常な停止を途中で打ち切らない。
- `--json` のときは、成功・失敗を 1 行の JSON で出す（`wtm session delete` と同じ形）。
- 名前の検証（規則・存在・綴り）と、動いていない（終了コード 3）・別のホスト・Windows（非対応）の判定は、何かを送る前・何かを作る前に CLI だけで行う。
  socket に繋げなかったときは `wtm.lock` をもう一度見て、持ち主が居なければ動いていない（3）とする（AC7）。
- `wtm session delete`・`wtm token reset` の「動いている」の案内に止めるコマンドを添え、ヘルプ・使い方・docs に止めるコマンドを載せる。

## 非機能要件 / 制約

- 止める指示の経路は、状態ディレクトリの中の、権限 0600 の Unix ドメイン socket だけ（同じ利用者に限る）。新しい TCP の待ち受けを作らない。
  pid へのシグナルは送らない。
- 既存の `handoff.sock` の名前・`handoff`・`status` の操作は変えない（新しい CLI と古いサーバの組で `wtm handoff` が壊れないため。decisions D2）。
- 動いていない session に対して、`wtm session stop` はファイル・ディレクトリを作らない。
- 負荷試験・E2E は行わない（共有マシン。ユーザーの指示）。単体・結合テストと smoke で確かめる。

## 完了条件 (受け入れ基準)

- [ ] AC1: 動いている session（既定・名前付き）に `wtm session stop <名前>` を打つと、サーバは Ctrl+C と同じ停止（`session.json` の保存・
  `--pane-history` なら画面履歴の保存・pane のプロセスの終了・`wtm.lock` の解放）を行って終了コード 0 で終わり、CLI は
  `wtm: stopped session <名前>` を出して終了コード 0 で終わる。その後の `wtm session list` はその session を `stopped` と表示し、同じ名前で
  起動し直すとレイアウトが戻り、`--pane-history` で動かしていたなら前回の画面も戻る。停止はサーバの中で Ctrl+C（終了のシグナル）と同じ停止の
  手順（`composeServer.close()` を待ってから終了コード 0）を通る。
- [ ] AC2: 動いていない session（`wtm.lock` の持ち主が居ない）には、何も送らず・何も作らずに `session <名前> is not running` を出し、終了コード 3 で終わる。
- [ ] AC3: 存在しない名前付き session・規則に合わない名前・名前の無い呼び出しは、何も作らずに終了コード 2（使い方・案内つき）で終わる。
  大文字小文字を区別しない FS で綴りの違う名前は、`wtm session delete` と同じく断る（終了コード 2）。
- [ ] AC4: 止める指示は状態ディレクトリの権限 0600 の Unix ドメイン socket（`handoff.sock`）でだけ受け付け、サーバは新しい TCP の待ち受けを作らない。
  CLI は pid へシグナルを送らず、返事の pid と `wtm.lock` の持ち主の pid が違えば止まったと報告しない（終了コード 1）。
- [ ] AC5: 引き継ぎ（`wtm handoff`）の最中に止める指示を受けたら断り（サーバは動き続ける）、CLI は理由を出して終了コード 1 で終わる。
  止める指示を受けた後に届いた引き継ぎの指示は断る。
- [ ] AC6: 止める指示を受け付けない相手（`stop` を知らない古い版・まだ起動中で socket が無い・socket に繋げない）には、サーバに何も起こさず、
  理由と次の手（Ctrl+C 等）を出して終了コード 1 で終わる。
- [ ] AC7: 止める指示が重なっても（止める指示の 2 回目・終了のシグナルを受けて止まる途中の止める指示）、サーバは正常な停止を打ち切らず
  （`session.json` の保存とロックの解放を済ませて）終了コード 0 で終わる。停止の途中に届いた `wtm session stop` は「既に止まる途中」として受け付けられ、
  AC1 と同じく止まったのを確かめて 0 で終わる（停止の途中も制御の socket は `wtm.lock` を放す直前まで開いている）。既に `wtm.lock` の持ち主が
  居なければ AC2（3）。socket に繋げなかった直後に `wtm.lock` を見直して持ち主が居なくなっていれば、AC6（1）ではなく AC2（3）とする。socket を閉じてからロックを放すまでの
  ごく短い間に繋げなかったときだけは AC6（1）になり、その案内は「古い版・起動中・既に止まる途中」のいずれかであることを示す（停止を打ち切りはしない）。
- [ ] AC8: 止める指示を受け付けた後、上限時間の内に `wtm.lock` の持ち主が居なくならなければ、CLI は止まったとは言わず、`server.log` を見るよう案内して
  終了コード 1 で終わる。
- [ ] AC9: `wtm.lock` の持ち主が別のホストなら、何も送らず、そのホストで打つよう案内して終了コード 1 で終わる。
- [ ] AC10: `--json` のとき、成功は `{"stopped":true,"session":{…}}`（`session` は名前・既定か・状態ディレクトリ・止めた pid）、失敗は `{"error":{"code":…,"message":…}}` を
  1 行で出す（終了コードは上と同じ。`code` の値は AC12 の場合ごと。引数の解釈の誤り——名前が無い・未知のオプション——は他のコマンドと同じくテキスト）。
- [ ] AC11: Windows では `wtm session stop` は非対応と答えて終了コード 2 で終わる（何も送らない）。
- [ ] AC12: 止める指示の結果の報告は、止まった・動いていなかった・断られた（理由つき）・時間切れ・繋げない／古い版・別のホスト・pid の不一致・非対応の OS を
  区別して出す（テキストの文言と、`--json` の `code` の値が場合ごとに違う。値の一覧は design で決める）。
- [ ] AC13: `wtm session delete <名前>`・`wtm token reset` が「動いている」と断るとき、案内に `wtm session stop <名前>` を添える。
- [ ] AC14: `wtm --help`・使い方の表示に `wtm session stop` があり、`docs/herdr-parity.md` の H33 と `docs/verification.md` が、対応した範囲・herdr との違い・
  Windows の非対応・macOS の未検証を記している。
- [ ] AC15: 止める指示を使わないとき、今までの動作（Ctrl+C の停止・`wtm handoff` の `handoff`/`status`・`wtm session list`/`delete`）が変わらない
  （既存のテストがそのまま通る）。
- [ ] AC16: ビルドした `wtm`（`dist/main.js`）を Linux で実際に起動し、`wtm session stop` で止まること・止まった後に 3 になることを起動確認（smoke）で確かめる。

## 未確定事項 / 確認したいこと

- CLI の待つ上限時間（herdr は 15 秒）。本製品の停止は画面履歴の保存を含むので長めにするか——design で決める。
- 止める指示の返事の形と、断る理由の語彙（既存の `HandoffReply` の `reason` と揃えるか）、`--json` の `code` の値——design で決める。
