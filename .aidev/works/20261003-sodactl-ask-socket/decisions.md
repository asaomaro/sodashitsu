# 判断の記録: 20261003-sodactl-ask-socket

追記式。既存のエントリは書き換えない。

## D1: 規模は full・モードは autonomous

- **背景**: 着手時の判定（`aidev-00-start` 手順 4）。利用者に 3 択（full／light／full・自律）で確認した。
- **決定**: `profile: full`・`mode: autonomous`（`humanGates` なし）。ブランチは `main`（9514847）から切った `feature/sodactl-ask-socket`。
- **理由**: サーバに認証の要らない受け口を足す変更で、light の条件を満たさない。モードは利用者の選択。
- **影響**: 承認者のいる工程が無いので、方針（下の D3）と `design.md` は同じ approve ゲートで受ける（`protocol-autonomous.md`「方針の事前承認」）。人間の確認は PR に集約する。

## D2: requirements の途中の指示（汎用の口）と research の実施

- **背景**: requirements を書いている途中で利用者から「今後も特別な権限が必要ないものに対しては認証不要にする可能性があるので、汎用的な口にしておいて」。
- **決定**: 受け口を ask 専用にせず「登録した操作だけを受ける汎用の口」にした（US4・AC13・AC14・AC16 を足した）。この作業で載せる操作は ask だけ。
- **research**: `protocol.md`「4.5」の条件のうち「調査で解消すべき未確定事項が残る」「未検証の既存挙動に依存する」「技術的実現性が未確認（Windows のパイプ）」に当たるので実施した（委譲。`research.md`）。
- **requirements の独立点検**: 1 ラウンド・12 件（must 0）。全件を最小の差分で反映した。2 ラウンド目は打っていない。

## D3: design の方針

research の「design への申し送り」と R1〜R11 への答え。承認者がいないので、提示と決定を同じ場所に残す。

### 受け口の形

- (a) **新しい socket `<状態ディレクトリ>/pane.sock`**。既存の `agent-report.sock` には相乗りしない。
  - 理由: 既存は返事なし・`end` で処理・4096 バイトまで（research F12）で、返事を待つ操作と 256 KiB の定義を載せるには形を変える必要があり、要件が「既存の hook の動きは変えない」としている。
    相乗りだと古いサーバは黙って捨てる（R8）ので、sodactl から「古いサーバ」と「取り消し」を見分けにくい。
  - ファイル名は `agent-report.sock`（17 バイト）より短い 9 バイトにする。起動時のパスの長さの検査（`config.ts:156-167`）は `agent-report.sock` で測っているので、それを通った状態ディレクトリなら `pane.sock` も必ず通る（R2。検査は足さない）。
- (b) **場所の知らせ方 = 新しい環境変数 `SODA_PANE_SOCKET`**。加えて sodactl は、この変数が無く `SODA_AGENT_REPORT_SOCKET` が `…/agent-report.sock` の形のときに限り、**同じディレクトリの `pane.sock`** を試す。
  - 理由: handoff の前から動いている pane の環境は変えられない（R5）。版を上げて `soda handoff` した利用者の既存の pane（エージェントが動いているのは大抵これ）でも、ログインなしの ask が効くようにする。
    2 つの socket は同じ状態ディレクトリに置くと決めたので、導出は 1 行で済む。繋げなければ今までの経路へ落ちるだけなので、古いサーバで害は無い。
  - 採らなかった案: 環境変数だけ（古い pane は pane を開き直すまで今までどおり）。単純だが、きっかけになった使い方（動いている pane のエージェント）が handoff では直らない。
- (c) **やりとり = 1 接続 1 要求・1 行の JSON・返事 1 行**（`HandoffSocket` と同じ形。F24）。行の上限は 1 MiB（sodactl が標準入力から読む上限と同じ）。結果を待つ操作は、返事が出るまで接続を開けたままにする。**呼び出し側が接続を閉じたら取り消し**。
  - 採らなかった案: 多重化した長い接続（`BridgeEndpoint`）。sodactl は 1 回の起動で 1 つの操作しかしないので要らない。
- (d) **操作の登録 = `PaneOpRegistry`**（名前 → 引数の schema〔zod〕＋ handler）。受け口が共通に行うこと: 行の読み取り・上限・JSON の検査・`paneId` の実在の確認・schema の検査・エラーを code に揃える・接続が切れたら handler に知らせる（`AbortSignal`）。
  handler が受け取るのは `{paneId, connId, signal}` と検査済みの引数だけ。`/ws` の `ControlSurface` には繋がない（`/ws` の RPC を通す口にしない）。
- (e) **エラーの code**: 受け口専用に `unknown_op`（登録に無い操作）・`bad_request`（行が JSON でない・形が違う・上限の超過・版が違う）を足す。それ以外は既存の `ErrorCode`（`not_found`・`invalid_params`・`ask_busy`・`invalid_ask_spec`・`internal`）。
  `/ws` の `not_found` が「知らない方式」と「pane が無い」の両方に使われている（R9）ので、受け口では分ける。`ErrorCode`（`/ws` の union）には足さず、受け口の型（`packages/protocol/src/paneSocket.ts`）に置く。

### ask の載せ方

- (f) **持ち主 = 接続ごとの文字列 `pane-socket:<連番>`**。接続が切れたら `asks.onClientGone(持ち主)`。`AskService` は変えない（R1）。
  1 接続 1 要求なので「接続あたり 8」は受け口の質問には効かない（必ず 1）。効くのは総数 32 と「1 つの pane に同時に 1 つ」で、台帳が 1 つなので `/ws` の質問と合わせて数えられる（F3）。受け口の同時接続は 64 までにする（超えた接続は捨てる）。
- (g) **引数の検査は `/ws` と同じ schema**（`AskOpenParams` から `paneId` を除いた `{spec, timeoutMs}`）。`paneId` は受け口の共通の欄から渡す。

### 権限・起動・停止

- (h) **0600 になってから見える場所に置く**（`BridgeEndpoint.listen` と同じ手順: 0700 の一時ディレクトリで listen → chmod 0600 → rename。F22）。ログイン不要の口なので、chmod までの窓（R4）を作らない。権限を絞れなければ置かない。
  手順は小さな共通関数に切り出す（`BridgeEndpoint` 自体は書き換えない——この作業の対象外で、動いている受け口の退行を避ける）。
- (i) **起動に失敗しても `soda serve` は起動を続ける**（warn。`handoff.sock`・`bridge.sock` と同じ。R3）。受け口は便利のための口で、無くても `/ws` の経路がある。pane の環境のパスの先に受け口が無い状態はありうるが、sodactl は繋げなければ落ちるので害は無い。
- (j) **Windows（ネイティブ）では出さない**。サーバは受け口を立てず、pane の環境に `SODA_PANE_SOCKET` を入れず、sodactl も受け口を試さない。
  - 理由: 名前付きパイプを同じ利用者に限る実装が無く、既定の ACL で別の利用者が繋げるかは未確認（F56・F57）。確かめられないものをログイン不要で開かない（要件の非機能要件）。Windows は今までどおり `sodactl login` が要る。
- (k) **停止・handoff**: `close()` では `agentReportSocket` と同じ早い段階で閉じ、開いている接続は捨てる（待っている sodactl は `connection_closed`。`/ws` と同じ）。
  handoff では `closeClients` で受け付けを止めて開いている接続を捨て（`/ws` 経由の質問が取り消されるのと揃える。R6）、`reopenClients`（元に戻すとき）で受け付けを戻す。execve の後は新しい版が同じパスで立て直す（rename が古いファイルを置き換える）。

### sodactl

- (l) **経路の選択は共通の 1 か所**（`paneSocket.ts`）。受け口を使う条件: Windows でない・pane の中（`caller` がある）・受け口のパスが分かる（(b)）・`--url`／`SODACTL_URL` を明示していない・`--machine` が無い（`local` は可）。
  - 「明示している」は `GlobalOpts` に印 `urlExplicit` を足して見る（R10）。origin の一致では見ない——明示した利用者は「その URL へ繋ぐ」ことを選んでいるので、同じ origin でも今までの経路にする（AC8 の文言どおり）。
- (m) **`/ws` へ落ちるのは「繋げなかった」か `unknown_op`・`bad_request` のときだけ**。繋がって要求を送った後に、返事なしで接続が閉じたら落ちない（`connection_closed`・終了コード 1）——質問が既に出ているかもしれず、落ちると二重に出る。
  操作そのもののエラー（`not_found`・`ask_busy`・`invalid_ask_spec` 等）も落ちない（`/ws` でも同じ結果になる）。
- (n) **落ちたことは知らせない**（要件の未確定事項）。落ちた先が成功すれば利用者に関係が無く、失敗すれば今までどおりのエラー（`unauthenticated` 等）が出る。stderr に 1 行足すと、stderr を見ている呼び出し側（ask-form 等）の出力が変わる。
  調べたいときのために、環境変数 `SODACTL_DEBUG=1` のときだけ stderr に経路を 1 行出す——は**足さない**（既存の sodactl にデバッグ出力の仕組みが無く、この作業で作ると範囲が広がる）。docs に見分け方（`unauthenticated` が出たら受け口が使えていない）を書く。

### テスト

- (o) 既存の E2E・smoke が開発者の pane の受け口へ漏れないよう、子プロセスの環境から `SODA_PANE_SOCKET`・`SODA_AGENT_REPORT_SOCKET` を外す（R11）。ログインなしの経路は、E2E に 1 件（キャッシュも token も無い HOME・ブラウザで回答）と smoke に 1 件（キャッシュの無い HOME で `unavailable`）を足す。
- (p) AC5 は、socket のファイルの mode（0600）を統合テストで見る。「ほかの利用者が繋げない」を別の利用者で実際に試すことは自動化しない（`docs/verification.md` の手動の手順に書く）。

### architecture を挟まない

- `protocol.md`「4.5」の 4 条件: モジュール間の境界は動かさない（サーバに受け口のファイルを足し、sodactl に接続のファイルを足すだけ。既存の責務は移さない）。新しい構造は「操作の登録」1 つで、`design.md` の「インターフェース」で型まで書ける大きさ。該当しないと判断した。

## D4: design の独立点検（1 ラウンド・11 件）と、それで足した決定

- **結果**: must 1・should 5・nit 5。全件を最小の差分で `design.md` に反映した。2 ラウンド目は打っていない（上限 2）。
- **足した決定**:
  - 検査の順は「形 → 操作（`unknown_op`）→ pane（`not_found`）→ 引数 → handler」。D3 (d) の並びは順序ではない（must の指摘）。
  - 受け口が要求を読まずに断るとき（同時接続の上限・handoff の途中）は、何も書かずに切るのではなく `pane_socket_busy` を返す。sodactl は `/ws` へ落ちず終了コード 1。D3 (e) の受け口専用の code は 3 つになる。
  - handoff 済みの古い pane の経路（D3 (b) の導出）は、handoff の smoke で実物の sodactl を使って確かめる。

## D5: tasks の独立点検（1 ラウンド・10 件）

- **結果**: should 7・nit 3。全件を反映した: 大きすぎた 2 タスクを割り（11 → 17 タスク）、テストの列挙の漏れ（`pane_socket_busy`・`pause`／`resume`・受け口を通した正常系・`paneSocketFor`・受け口の `invalid_ask_spec`）を足し、docs の前に行う確認（`SODA_PANE_ID` の名乗り）を T14 に入れた。
- **順序の決定**: 既存の smoke・E2E の環境の漏れを止める T9 を、sodactl が受け口を使い始める T12 の前提にした（このリポジトリのテストは soda の pane の中で走らせているので、順が逆だと開発者の本物のサーバへ質問が飛ぶ）。
- `sodactl help` の ask の文面（`main.ts`）は design の「対象範囲」に無いが、skill と揃えるため T14 で触る。
