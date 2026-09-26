# 要件: `wtmctl pane observe` / `wtmctl pane control`——pane の NDJSON 閲覧ストリームと制御ストリーム

## 背景 / 課題

herdr には、手元の端末を pane に直結する `terminal attach` のほかに、**第三者のブリッジ（別のプログラム）向け**の
`terminal session observe`（閲覧専用・NDJSON）と `terminal session control`（書き込み可能・NDJSON の入出力）がある
（`docs/herdr-parity.md` の H40。一次資料の要点は下の「herdr の仕様」）。

web-tn-multiplexer は 20260926-pane-direct-connect で `wtmctl pane attach`（手元の端末の直結・書き込み所有者の排他・大きさの鍵）を持ったが、
これは**人が端末で使う**ためのもので、raw モードの端末が要る（stdin/stdout が端末でなければ `not_a_tty`）。
プログラムから pane の画面を取り続ける手段は `wtmctl pane read --follow` だけで、これは

- 出力を**文字列のまま**流すので、どこからどこまでが 1 回の出力か・画面の描き直し（SNAPSHOT）か・pane の大きさがいくつかがプログラムに分からない。
- pane が閉じても終わらない（サーバが接続を閉じるまで待つ）。
- 書き込み（入力・大きさ）の経路が無く、入力は別プロセスの `pane input` を毎回起動するしかない。所有者（直結の排他）にも加われない。

このため、「pane の画面を別の UI（チャットのボット・別のターミナル・録画）へ中継する」「エージェントを別のプログラムから対話的に操る」ブリッジが作れない。

## herdr の仕様（一次資料で確かめたこと）

`/workspaces/web-tn-multiplexer/scratchpad/herdr/` を主エージェントが直読した。

- 使い方: `herdr terminal session control <target> [--takeover] [--cols N] [--rows N]`・`herdr terminal session observe <target> [--cols N] [--rows N]`
  （`docs/next/website/src/content/docs/cli-reference.mdx:366-367`）。`--cols/--rows` の既定は 120×40・1〜65535（`src/cli.rs:624-625`・`:670-684`）。
- observe: 閲覧専用。stdout に NDJSON の `terminal.frame`（base64 の ANSI バイト）を出し、サーバがストリームを閉じたら `terminal.closed` を出す。
  **複数の観測者**が同じ端末を見られ、入力・大きさ・スクロール・奪取の権限を持たない（`cli-reference.mdx:379-383`・`persistence-remote.mdx:137-147`）。
- フレームの形: `{"type":"terminal.frame","seq":…,"encoding":"ansi","width":…,"height":…,"full":…,"bytes":"<base64>"}`、
  終わりは `{"type":"terminal.closed","reason":…}`（`src/client/terminal_sessions.rs` の `write_terminal_session_output`）。
- control: 書き込み可能。observe と同じフレームを出し、stdin の NDJSON を読む——`terminal.input`（`text` か base64 の `bytes`。両方は不可）・
  `terminal.resize`（`cols`/`rows` が 0 なら不可）・`terminal.scroll`（`direction` up/down・`lines`>0・`source` wheel/page_key）・
  `terminal.release`（所有を返して終わる）。**所有者は 1 端末に 1 つ**で `--takeover` で置き換える
  （`cli-reference.mdx:373-378`・`persistence-remote.mdx:149-159`・`terminal_sessions.rs` の `terminal_control_command_from_json`）。
- control の不正な行は stderr に `terminal session control input ignored: <理由>` を出して**読み飛ばし**、続ける。空行は無視。
  stdin が終わったら所有を返す（`terminal_sessions.rs` の入力スレッド）。
- herdr のフレームはサーバが描き直した画面（観測者の `--cols/--rows` の大きさ）。

## 目的 / ゴール

- 別のプログラムが、`wtmctl` を子プロセスとして起動するだけで、pane の出力を**区切り・種類（描き直しか差分か）・大きさ付きの機械可読な記録**として
  受け取り続けられ、pane の終わりを記録として知れる状態。複数のプログラムが同じ pane を同時に見ても、互いにもブラウザにも影響しない状態。
- 別のプログラムが、stdin に 1 行 1 コマンドを書くだけで pane へ入力・大きさの変更・所有の返却を行え、`wtmctl pane attach` と同じ
  「書き込み所有者は pane に 1 つ・`--takeover` で奪う」規則に乗る状態。
- 不正な・巨大な・未知の入力行が、pane にもサーバにも何も起こさずに読み飛ばされ、理由が stderr で分かる状態。

## ユーザーストーリー

- US1: pane の画面を別の UI へ中継するブリッジの作者として、`wtmctl pane observe <paneId>` の stdout を 1 行ずつ JSON として読みたい。
  なぜなら、バイト列の区切り・描き直しか差分か・pane の大きさ・終わりが分かれば、端末エミュレータに正しく流し込めるから。（受け入れ: AC1, AC2, AC3, AC4, AC5）
- US2: エージェントを別のプログラムから操る自動化の作者として、`wtmctl pane control <paneId>` の stdin に NDJSON を書いて入力・大きさの変更・終了を行いたい。
  なぜなら、1 本の子プロセスで出力の購読と入力を往復でき、毎回 `pane input` を起動せずに済み、人の直結（`pane attach`）と奪い合っても混乱しないから。
  （受け入れ: AC6, AC7, AC8, AC9, AC10, AC11, AC12）
- US3: サーバの運用者として、閲覧・制御の両ストリームが既存の認証・Origin 検査の内側だけで動き、壊れた入力・読まない読み手でサーバや pane や wtmctl が乱れないことを確かめたい。
  なぜなら、pane の画面を読める・書き込める新しい入口は、覗き見・乗っ取りと資源の食い潰しの経路になりうるから。（受け入れ: AC11, AC12, AC13, AC14）
- US4: wtmctl の利用者（ブリッジの作者）として、記録の形・コマンド・終了コード・herdr との違いを文書で知りたい。なぜなら、herdr 向けに書いたブリッジを
  どこまでそのまま使えるかを、試す前に判断したいから。（受け入れ: AC15）

## スコープ

### 対象

- `wtmctl pane observe <paneId>`: 閲覧専用の NDJSON ストリーム（stdout）。書き込み所有者・大きさには一切触れない。
- `wtmctl pane control <paneId> [--takeover] [--cols N] [--rows N]`: 書き込み可能な NDJSON ストリーム（stdout にフレーム・stdin にコマンド）。
  所有者と大きさは 20260926-pane-direct-connect の `pane.attach`／`pane.attach_resize`／`pane.detach`（サーバの `SizeAuthority`）に載せ、`pane attach` と所有を共有する。
- stdin のコマンド: `terminal.input`・`terminal.resize`・`terminal.release`。`terminal.scroll` は**種類としては知っているが未対応**として読み飛ばす（理由を stderr）。
- `docs/wtmctl.md` の節・`docs/herdr-parity.md` の H40 の更新・backlog の消し込み（残りは `[ ]` で起こす）。

### 対象外

- `terminal.scroll`（サーバ側のスクロール。`pane attach` の「直結中のサーバ側のスクロール」と同じ土台が要る。既存の backlog 項目に合流させる）。
- observe の `--cols/--rows`（観測者ごとの大きさでサーバが描き直したフレーム）。web-tn-multiplexer は生の PTY の出力を流す設計で、観測者ごとの大きさを持たない。
  フレームには pane の実際の大きさを載せる。
- pane ID 以外の対象（エージェントの名前・herdr の `w1:p1` 形式）。`agent attach <name>` と同じ後続にする。
- ブラウザ（`packages/web`）の変更・サーバの新しい RPC・新しい HTTP の入口。
- herdr の `cell_width_px`/`cell_height_px`（ピクセルの大きさ。受け取っても使わない）。
- herdr の `--cols/--rows` の範囲 1〜65535（大きすぎる端末はサーバのミラーのメモリを食うので 1〜1000 に絞る）。

## 機能要件

- FR1（observe の開始）: 既存の認証（`wtmctl login` のセッション・`--url/--token`）で繋ぎ、pane が無ければ stdout に何も出さず `not_found` で終わる。
- FR2（フレーム）: 最初に pane の見えている画面を `full: true` のフレームで出し、以後の出力を `full: false` のフレームで出す。
  サーバが描き直し（SNAPSHOT）を送り直したら、それも `full: true` で出す。各フレームは 1 行の JSON で、`seq` は 1 から 1 ずつ増え、`width`/`height` はその時点の pane の大きさ。
- FR3（終わり）: pane の終了・close で `terminal.closed`（理由付き）を出して終了コード 0。サーバとの接続が切れたら `terminal.closed` を出し終了コード 1。
- FR4（閲覧専用）: observe は所有者・大きさ・入力に関わる要求を一切送らない。何本同時に動かしても、互いにも `pane attach`／`pane control` にもブラウザにも影響しない。
- FR5（control の開始）: pane の所有者になり、pane の大きさを `--cols`×`--rows`（既定 120×40・1〜1000。範囲外・整数でなければ使い方の誤りで繋がない）にしてからフレームを出し始める。
  別の所有者がいて `--takeover` が無ければ stdout に何も出さず `pane_attached` で終わる。
- FR6（control の入力）: `terminal.input` の `text`（UTF-8 で送る）か `bytes`（base64）を pane へ送る。両方・どちらも無い・base64 でない・長すぎる行は読み飛ばす。
  `terminal.scroll` は種類としては受け付けるが未対応として、何も送らず読み飛ばす（FR9 と同じく stderr に理由）。
- FR7（control の大きさ）: `terminal.resize` の `cols`/`rows`（1〜1000 の整数）で pane の大きさを変える。範囲外は読み飛ばす。
- FR8（control の終わり）: `terminal.release`・stdin の終わり・SIGINT/SIGTERM/SIGHUP で所有を返し、`terminal.closed`（`released`）を出して終了コード 0。
  奪われたら `terminal.closed`（`taken_over`）を出して終了コード 1（`attach_taken_over`）。pane の終了・接続断は observe と同じ。
- FR9（入力の検査）: 1 行は 1 MiB まで。超えた行は次の改行まで捨てて読み飛ばす。JSON でない・`type` が未知・知らないキーがある・値の型が違う行も読み飛ばし、
  stderr に 1 行（`wtmctl: pane control input ignored: <理由>`）を出して続ける。空行は黙って無視する。
- FR10（出力の詰まり）: stdout を読む側が止まって書き出し待ちが上限を超えたら、サーバからの受信を止め（wtmctl のメモリを上限の範囲に留める）、
  読む側が追いついたら受信を再開する。止めている間に捨てられた出力の代わりに、サーバの描き直し（`full: true` のフレーム）から続ける（FR2）。

## 非機能要件 / 制約

- サーバ・プロトコル・ブラウザは変えない（既存の `/ws` の上の既存の RPC とイベントとフレームだけを使う）。
- 既存の `pane attach`・`pane read` の振る舞いを変えない。
- 負荷試験・E2E は行わない（共有マシン。ユーザーの指示）。検証は vitest の単体・結合テストと smoke。

## 完了条件 (受け入れ基準)

- [ ] AC1: `wtmctl pane observe <paneId>` の stdout の最初の行が `{"type":"terminal.frame","seq":1,"encoding":"ansi","width":W,"height":H,"full":true,"bytes":…}` で、
  `bytes` を base64 で戻すと pane の見えている画面を含み、W×H が pane の大きさである。
- [ ] AC2: observe 中に pane に出た出力が、`full: false` のフレームとして `seq` が 1 ずつ増えて届き、全フレームの `bytes` を連結すると出力が含まれる。
  最初の後にサーバが SNAPSHOT を送り直すと、それは `full: true` のフレームとして出る。
- [ ] AC3: pane の大きさが変わると、以後のフレームの `width`/`height` が新しい大きさになる。
- [ ] AC4: pane が終わる（シェルの `exit`・pane の close）と observe は `{"type":"terminal.closed","reason":"pane_closed"}` を出して終了コード 0 で終わる。
  接続が切れると `terminal.closed`（`connection_closed`）を出し終了コード 1。pane が無ければ stdout に何も出さず `not_found`（終了コード 1）。
- [ ] AC5: 2 本の observe と 1 本の `pane attach`（または control）が同じ pane を同時に使っても、observe は所有者・大きさを変えず、両方の observe に同じ出力が届く。
  observe がサーバへ送る要求は購読（とその解除）だけである（ブラウザの大きさ・入力にも関わらない）。
- [ ] AC6: `wtmctl pane control <paneId> --cols C --rows R` で pane の大きさが C×R になり、所有者が自分になり、observe と同じ形のフレームが出る。`--cols/--rows` の既定は 120×40。
  0・1001・整数でない値は使い方の誤り（終了コード 2）で繋がない。
- [ ] AC7: stdin の `{"type":"terminal.input","text":"…"}` と `{"type":"terminal.input","bytes":"<base64>"}` が pane に届く。
- [ ] AC8: stdin の `{"type":"terminal.resize","cols":C,"rows":R}` で pane の大きさが C×R になる。
- [ ] AC9: `{"type":"terminal.release"}`・stdin の終わり・SIGINT/SIGTERM/SIGHUP のそれぞれで所有者が外れ、pane は残り、`terminal.closed`（`released`）を出して終了コード 0。
  control 中に pane が終わる・接続が切れると、observe と同じ（AC4）記録と終了コードで終わる。
- [ ] AC10: 別の所有者（`pane attach` か control）がいると control は stdout に何も出さず `pane_attached` で終わる。`--takeover` なら奪い、奪われた側の control は
  `terminal.closed`（`taken_over`）を出して終了コード 1（`attach_taken_over`）。`pane attach` と control の間でも同じ。
- [ ] AC11: 不正な行（JSON でない・未知の `type`・知らないキー・`text` と `bytes` の両方／どちらも無し・base64 でない・範囲外の `cols/rows`・`terminal.scroll`）は
  pane に何も送らず、stderr に理由の 1 行を出して、後続の正しい行は処理される。空行は何も出さない。
- [ ] AC12: 1 MiB を超える行は pane に何も送らず読み飛ばされ、次の行から処理が続く（行の途中で分割されて届いても同じ）。
- [ ] AC13: 閲覧・制御の両ストリームは既存の `/ws`（Cookie のセッション認証・Origin 検査）だけを使う——認証が無ければ（未ログイン・トークン誤り）stdout に何も出さず失敗し、pane に何も届かない。
- [ ] AC14: stdout の書き出し待ちが上限を超えるとサーバからの受信を止め、書き出しが追いつくと再開する（その後に届く SNAPSHOT は `full: true` のフレームになる。AC2）。
- [ ] AC15: `docs/wtmctl.md` に observe/control の節（記録の形・コマンド・終了コード・herdr との違い・所有者は安全の境界ではないこと）があり、
  `docs/herdr-parity.md` の H40 が更新され、backlog の項目が消し込まれ残りが `[ ]` で起きている。

## 未確定事項 / 確認したいこと

- 出力の書き出し待ちの上限の値——design で決める（行の上限は既存の INPUT フレームの上限と同じ 1 MiB に確定）。
- 問い合わせ（DA・DSR 等）をフレームから取り除くか（`pane attach` は取り除いている）——design で決める。
