# レビュー記録: 20261003-sodactl-ask-socket

## タスク点検ログ

coding 工程のタスク単位の独立点検（委譲）で見つけ、その場で直した指摘。review 工程のラウンド指摘の件数には数えない。

- T1 [nit] `op`・`paneId`・`timeoutMs` の境界を「超えたら断る」側でしか確かめていない → 上限ちょうどで通る・空／欠落で断るテストを足した（72b2805） [conv:-]
- T1 [nit] ファイル全体の説明が `PANE_SOCKET_VERSION` の doc コメントになっていた → 空行で離し、定数に 1 行の説明（72b2805） [conv:-]
- T1 [nit] コメント「`params` の省略は `{}`」が schema の出力（undefined）と食い違う → 「受け口が `{}` として扱う」と書き直した（72b2805） [conv:-]
- T2 [should] 「0700 の一時ディレクトリで待ち受けてから見える場所へ出す」を確かめるテストが無く、窓のある実装でも通る → `listening` の時点の場所と権限を見るテストを足し、窓のある実装で落ちることを確かめた（73f6d8c） [conv:-]
- T2 [nit] 既に待ち受け中の server を渡すと、呼び出し側の待ち受けを閉じてしまう → 最初に断る（73f6d8c） [conv:-]
- T2 [nit] prettier の整形に合っていない行がある → 対応しない（このリポジトリに整形の検査の script が無く、周辺も同じ） [conv:-]
- T3 [nit] `invoke` が `null` の引数も `{}` として扱う（説明は undefined だけ） → undefined のときだけにし、`null` は `invalid_params`（984d539） [conv:-]
- T4 [should] 行の上限の「かたまりをまたいだ累積」を確かめるテストが無い → 足して、累積を消すと落ちることを確かめた（2983766） [conv:-]
- T4 [should] 待ちの上限 50ms に依るテストが、イベントループが止まると落ちうる → 余裕のある値にした（2983766） [conv:-]
- T4 [nit] 多バイト文字の分割のテストが固定の sleep 頼みで、割れて届いたかを確かめていない → 届いたかたまりを数える形にした（2983766） [conv:-]
- T4 [nit] 設計から変えた 2 点（返事を読まない相手を切る・受け付けていない間の接続を捨てる）にテストが無い → 足した（2983766） [conv:-]
- T4 [nit] 相手が書き込み側だけ閉じたときの契約（待つ操作は取り消し）を固定するテストが無い → 足した（2983766） [conv:-]
- T4 [nit] `listen()` の途中の `close()` で待ち受けと socket のファイルが残る → `close()` が進行中の listen を待ってから閉じる（2983766） [conv:-]
- T6 [nit] AC15 のテストの最後の assert が、入力に該当の文字列が無く常に通る → 親の環境の落とす変数に秘密の形の値を置き、pane へ渡らないことを見る形にした（16dea15） [conv:-]
- T10 [should] 受け口のパスの導出が実行中の OS のパス操作を使い、Windows のホストで単体テストが落ちる → `path.posix` にした（0b067ca） [conv:-]
- T10 [nit] 空の `SODACTL_URL` のときの `url` がテストで固定されていない → 既存の挙動のまま固定した。空文字の `url` 自体は以前からの挙動で、この作業では直さない（0b067ca。decisions.md D6） [conv:-]
- T10 [nit] `SODA_AGENT_REPORT_SOCKET` の末尾スラッシュ・相対パスからの導出が固定されていない → 絶対パスで末尾がちょうど `/agent-report.sock` のときだけ導出する、とテストで固定（0b067ca） [conv:-]
- T7 [should] 「受け口を置けなくても warn で起動を続ける」を確かめる結合テストが無い → 足して、`.catch` を外すと落ちることを確かめた（c7a9a5b） [conv:-]
- T7 [nit] `close()` が途中で投げた経路だけ、質問の後始末が受け口より先に走り、待っていた接続へ `cancelled` を書きに行く → `finally` で受け口を先に閉じる（c7a9a5b） [conv:-]
- T7 [nit] 「質問が出ない」を、イベントの到着を待たずに見ていた → `ask.subscribe` の往復の後に見る（c7a9a5b） [conv:-]
- T7 [nit] テスト名が確かめている内容より広い → 直した（c7a9a5b） [conv:-]
- T8 [nit] テストが置く `process.execve` の後始末が、ほかの後始末が投げると走らない → `finally` で外す（965f5bd） [conv:-]
- T8 [nit] 画面の役のクライアントが誤りの返事でも解決する → reject する（965f5bd） [conv:-]
- T8 [nit] `unavailable` の assert が質問の取り消しの確認を兼ねることが読めない → コメントに足した（965f5bd） [conv:-]
- T11 [should] 受け口が要求を読まずに断って切ると、クライアントの書き込みが EPIPE になり、届いていた `pane_socket_busy` を読めず `connection_closed` に化ける（別プロセスの再現で 500 回中 3 回） → 受け口が書き込み側だけ閉じ、要求を読み捨てて相手が閉じるか 1 秒まで待つ。別スレッドの受け口で、直す前は毎回落ちることを確かめた（a6a13f9） [conv:-]
- T11 [should] 「返事が割れて届いても 1 行として読む」テストが、実際には割れて届いていない → 前半を受け取ったのを見てから後半を書く形にし、かたまりごとに decode する実装で落ちることを確かめた（6481296） [conv:-]
- T11 [nit] 返事の行に大きさの上限が無い → 8 MiB を超えたら `connection_closed`（6481296） [conv:-]
- T12 [nit] テストの見出しコメントが最後の 1 件（実物の `callPaneOp`）と食い違う → 直した（af8f99d） [conv:-]
- T13 [nit] 秘密の検査が最初の pane しか見ていない → 後から作った pane も見る（f4f5044） [conv:-]
- T13 [nit] 直前の assert が通れば必ず通る assert → 消した（f4f5044） [conv:-]
- T13 [nit] 1 行が長すぎる → 既存の折り方に合わせた（f4f5044） [conv:-]
- T14 [should] 「受け口に操作を足すとき」の手順に protocol 側（名前の定数・引数の schema）が無い → 足した [conv:-]
- T14 [nit] 「`/ws` へ落ちないもの」に時間切れ・読めない返事・要求が揃わずに切られた場合が無い → 足した [conv:-]
- T15 [nit] 定義の誤り → 2 の手順が終了コードだけを見ていて、ほかの使い方の誤りと区別しない → stderr の `invalid ask spec` も見る [conv:-]
- T16 [nit] 成功時の `stderr` が空であることを見ていて、Node の警告で製品と無関係に落ちうる → `unauthenticated` を含まない、に緩めた [conv:e2e-observe-browser]
- T17 [nit] 足した行が既存の折り方（prettier の 100 桁）に合っていない → この work で足したファイルと、元は整形どおりだったファイルを prettier に通した（T2・T13 の同じ指摘もここで揃えた） [conv:-]
- cross [should] `soda handoff` で古い版が execve してから新しい版が受け口を置き直すまでの間、`sodactl ask` が繋げずに `/ws` へ落ち、未ログインの pane では `unauthenticated`（「login が要る」と誤って伝わる） → `ECONNREFUSED` のときだけ 5 秒まで繋ぎ直す。繋ぎ直しを外すと足した 2 件が落ちることを確かめた [conv:-]
- cross [nit] 相対の `--state-dir` だと pane の環境の `SODA_PANE_SOCKET` が相対パスになり、pane の cwd で別の場所を指す → サーバは絶対パスにして入れ、sodactl は相対の値を使わない [conv:-]

## ラウンド 1（2589a21。作業全体の差分・委譲）

must 0・should 1・nit 5。should があるので coding へ差し戻す。`aidev coverage` は tasks 承認時と同じ（ac=17・design 17/17・tasks 17/17・gaps=0）。
AC1〜AC17 は実装と `test-result.md` の判定に食い違いなし（弱い所は「未検証の穴」に明記済みのもの）。安全（0600・0700 の一時ディレクトリ・登録した操作だけ・検査の順・ログ・上限・取り消しと台帳・fallback の線引き）にコードの上の穴は見つからなかった。

- [should] `soda handoff` の「受け付けを止めてから execve まで」の間の `sodactl ask` は、繋ぎ直さずに `pane_socket_busy`・終了コード 1 で終わる。同じ入れ替えの後半（`ECONNREFUSED`）は 5 秒まで繋ぎ直すのに揃っていない。`pane_socket_busy` は質問が出ていないと決まっているので、繋ぎ直しても二重にならない。終了コード 1 を受けた呼び出し側（ask-form）は別の聞き方へ切り替わり、きっかけと同じ「気づけない」が入れ替えの間だけ残る — 根拠: packages/cli/src/paneSocket.ts:60-68・packages/server/src/panesocket/PaneSocket.ts:184-190・packages/server/src/composeServer.ts:495 [conv:-]
- [nit] `pane.sock` を rename で置いてから受け付けを始めるまで（一時ディレクトリの削除 1 回分）に繋がった接続は何も書かずに捨てられ、繋ぎ直している sodactl が当たると `connection_closed` になる — 根拠: packages/server/src/panesocket/PaneSocket.ts:139-142・180-183、packages/server/src/infra/privateUnixSocket.ts:39-46 [conv:-]
- [nit] 「接続が切れたら取り消す」手段が 2 つあり（`PaneOpContext.signal` と `PaneSocketDeps.onConnectionGone`）、`askOp` は `signal` を使わず登録の外の配線に依る。結果を待つ操作を次に足す人が「登録 1 つ」で済まない — 根拠: packages/server/src/panesocket/askOp.ts:21-22、packages/server/src/composeServer.ts:343 [conv:-]
- [nit] socket のファイル名 `pane.sock`・`agent-report.sock` がサーバと sodactl に別々の文字列で書かれ、古い pane 向けの導出がその一致に依る（ずれを捕まえるのは smoke だけ） — 根拠: packages/server/src/config.ts:87・98、packages/cli/src/cliArgs.ts:139-141 [conv:-]
- [nit] `listenPrivateUnixSocket` は `BridgeEndpoint.listen` の手順の写しで、`BridgeEndpoint` の側に印が無い（安全に関わる手順が 2 か所） — 根拠: packages/server/src/infra/privateUnixSocket.ts:28-46、packages/server/src/machine/BridgeEndpoint.ts:104-121 [conv:-]
- [nit] handoff の結合テストの最後の `vi.waitFor` の `call` に時間切れが無く、最後の試行が待って止まると本当の原因が読めない（Node 20 で 1 回出た原因未特定の失敗は、これで説明がつく可能性——推測） — 根拠: packages/server/src/composeServer.handoff.integration.test.ts:228-249・367-378 [conv:-]

範囲外（follow-up の候補。`decisions.md` D8 と PR 本文へ）: handoff で待っている質問が取り消される（既存）／`SODA_SERVER_URL` を入れられない待ち受けでは受け口があっても `caller_pane_unknown`／空の `SODACTL_URL`／受け口を置くのは復元の後なので、自動再開したエージェントがその前に打つと `/ws` へ落ちる・復元が 5 秒を超えても同じ／Claude Code のサンドボックスの中から unix socket へ繋げるかは未確認／smoke 1 本目・E2E 18 件・lint 22 件は `main` と同じ。

## ラウンド 2（8e813c5。ラウンド 1 の後の差分だけ・委譲）

must 0・should 0・nit 2。ラウンド 1 の 6 件は全部解消。nit 2 件はその場で直した（docs の 1 語とコメント。差し戻さない）。
繋ぎ直しの条件（`pane_socket_busy` を返すのは要求を読む前の 1 か所だけ・上限は最初に 1 回決めて延びない）、`accepting` の前倒し（0600 になる前に見える場所へ出ない・失敗後と `close()` 後に受け付けない）、取り消し（open と listener の登録の間に隙間が無い・全経路で abort・二重の取り消しなし）に欠陥は見つからなかった。

- [nit] docs の `pane_socket_busy` の項が「下の `ECONNREFUSED` の繋ぎ直し」と書くが、その説明は上にある → 直した — 根拠: docs/sodactl.md:553 [conv:-]
- [nit] 取り消しの listener が投げると uncaughtException（`soda serve` ごと落ちる）になるが、その結果がコメントにも判断にも無い → `askOp.ts` のコメントに書いた（いまの `onClientGone` に投げる経路は無い） — 根拠: packages/server/src/panesocket/askOp.ts:28-30 [conv:-]

範囲外（follow-up の候補に追加）: `soda handoff` が成功した直後は、ブラウザが繋ぎ直すまで質問を出せる画面が無く、繋ぎ直した `sodactl ask` は `unavailable`（終了コード 0）になる（呼び出し側は別の聞き方へ切り替わる）。docs に 1 文足した。`close()` が `server.close()` を待つ間に `listen()` を呼ぶと待ち受けだけ残る（いまの呼び方では起きない）。

## 通算

must 0・should 1・nit 7（ラウンド 1: should 1・nit 5／ラウンド 2: nit 2）。差し戻し 1 回。
