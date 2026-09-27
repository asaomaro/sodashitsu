# 判断の記録（20260927-session-stop）

## D1: 着手の判定・profile・research を挟まない理由（2026-09-27・requirements）

- 背景: backlog `product-roadmap.md`「名前付き session の残り（止める）」を autonomous で進める（主エージェント経由のユーザーの依頼。
  worktree `feature/session-stop`、main 0b59897 から）。依存 `20260926-named-session` は deliver 済み。直前に着地した
  `20260926-live-handoff` が状態ディレクトリごとの Unix socket `handoff.sock`（0600・1 接続 1 行の JSON・`handoff`/`status`）を足している。
  herdr の一次資料（`/workspaces/web-tn-multiplexer/scratchpad/herdr/src/cli.rs` の `session_stop`・`print_session_help`、
  `src/session.rs` の `stop_session_with_timeout`・`stop_socket_with_timeout`・`wait_until_stopped_until`・`STOP_WAIT_TIMEOUT`）を主エージェントが直読した:
  (1) `herdr session stop <name> [--json]`、名前は必須で `default` が既定の session、(2) session の API socket に `server.stop` を 1 行の JSON で送る、
  (3) 繋げなければ `session <name> is not running or cannot be reached at <socket>` で終了コード 1、(4) 返事の後、socket に繋がらなくなるまで最長 15 秒待つ、
  待ちきれなければ `did not stop within …` で 1、(5) 成功は `stopped session <name>`／`{"stopped":true,"session":…}` で 0。
- 決定: profile は full（サーバの制御の口に新しい操作を足す＝安全面・プロセスの終わらせ方を含むため light ではない）。
  research は挟まない（`protocol.md`「4.5」の 5 条件を当てた: 依拠する既存の挙動——Ctrl+C の停止の経路 `main.ts` の `shutdown`・
  `composeServer.close()`・`HandoffSocket`・`StateDirLock.inspect`——は主エージェントがコードを直読して確かめた。技術的実現性が未確認なのは
  Windows の受け口（名前付きパイプの ACL を Node から絞れるか等）だけで、それはこの work の対象外に置く〔D2〕。利用者が操作する画面の部品は作らない）。
- 理由・代替案: research を挟む案は、Windows を対象に入れるなら要る（名前付きパイプの既定の DACL・リモートのクライアントの拒否を libuv が
  付けるかを実機で確かめる必要がある）。対象外にしたので不要。
- 影響: requirements の対象外に Windows を置き、backlog に `[ ]` で残す。

## D2: 止める経路は既存の `handoff.sock` に `stop` の操作を足す（Windows は非対応）（2026-09-27・requirements）

- 背景: backlog の注記どおり `wtm.lock` の pid へのシグナルは pid の再利用で無関係なプロセスを止めうる。止める経路は同じ利用者に限り、
  新しい TCP の待ち受けを作らず、Ctrl+C と同じ正常な停止（`session.json` の保存・画面履歴の保存・ロックの解放）を通す必要がある。
- 決定: `handoff.sock`（名前は変えない）に 1 行の `{"op":"stop"}` を足す。Windows では `wtm session stop` は非対応として終了コード 2 で断る
  （`wtm handoff` と同じ扱い）。
- 理由・代替案:
  - (a) 採用: 既存の制御の socket に操作を足す。同じ利用者に限る根拠（0600・状態ディレクトリの中）と、socket を置く・閉じる・古い socket を
    置き直す配線が既にある。返事に pid を載せ、CLI は `wtm.lock` の持ち主と突き合わせる（socket の相手が lock の持ち主であることの確かめ）。
  - (b) 却下: socket の名前を `control.sock` 等に改める。**新しい CLI と古いサーバ**の組（まさに `wtm handoff` で更新する場面）で、新しい CLI が
    古いサーバの `handoff.sock` を見つけられず引き継ぎが壊れる（互換のために両方を待ち受けると口が 2 つになる）。名前は据え置き、
    コードとドキュメントで「制御の socket」と説明する。
  - (c) 却下: `wtm.lock` の pid に SIGTERM を送る。pid の再利用で無関係なプロセスを止めうる（backlog の注記。`StateDirLock` の「扱わないこと」）。
    `/proc/<pid>/cmdline` 等で確かめる方法は Linux 以外で使えず、確かめと送信の間の競合も残る。
  - (d) 却下（この work では）: 既存の HTTP の待ち受けに token で認証した停止の API を足す。token はブラウザのログインの秘密で、LAN・リモートに
    渡している利用者がいる——停止の口がネットワークに出る。専用の秘密を状態ディレクトリに置く形なら Windows でも使えるが、秘密の置き場の
    権限（Windows の ACL）を確かめる必要があり、この work では確かめられない。
  - (e) 却下（この work では）: Windows の名前付きパイプ。Node の `net.Server` は名前付きパイプの DACL を指定できず（`readableAll`・`writableAll`
    で広げることしかできない）、既定の DACL とリモート（SMB 越し）のクライアントの扱いを実機で確かめられない。
- 影響: Windows の `wtm session stop` は backlog に `[ ]` で残す（候補 (d)(e) と、確かめる事項を添える）。

## D3: CLI の形と既定の session（2026-09-27・requirements）

- 背景: herdr は `herdr session stop <name> [--json]` で名前が必須（`default` で既定の session）。本製品の `wtm session delete` も名前が必須で、
  `WTM_SESSION` は `wtm serve`・`token reset`・`handoff` の既定にだけ使い、`session list`・`delete` は見ない（`cliArgs.ts` の `applySessionEnv`）。
- 決定: `wtm session stop <name> [--state-dir D] [--json]`。名前は必須、`default` が既定の session。`WTM_SESSION` は見ない。
- 理由・代替案: 名前を省いたら `WTM_SESSION` を使う案は、名前付き session の pane には `WTM_SESSION=<名前>` が入っている（20260926-named-session-ui）ため、
  pane の中で `wtm session stop` と打つだけで**その pane ごと**全シェルを止める。止めるのは全 pane のプロセスを終わらせる操作なので、
  対象を明示させる（herdr・`wtm session delete` と同じ）。
- 影響: 名前が無いと終了コード 2（使い方つき）。

## D4: 待つ上限・停止の手順の切り出し・socket を閉じる位置（2026-09-27・design）

- 背景: requirements の未確定事項（待つ上限・返事の形）と、AC7（止まる途中に届いた 2 回目の指示も 0 で終わる）の実現。
- 決定: (1) CLI が止まるのを待つ上限は 30 秒（herdr は 15 秒）。(2) `main.ts` の停止の手順を `serveShutdown.ts` に切り出し、シグナルと止める指示の
  2 つの入口を持たせる（止める指示は冪等、シグナルの 2 回目は従来どおり即座に終わる）。(3) `composeServer.close()` で制御の socket を閉じる位置を
  最初から `finally` の `lock.release()` の直前へ移す。(4) 返事は `{"ok":true,"pid","alreadyStopping"}`／断りは既存の `HandoffReply` と同じ `reason` の語彙（`busy`・`unsupported`）。
- 理由・代替案: (1) 本製品の停止は `session.json` に加えて画面履歴（全 pane の画面の直列化）を書き、pane の数に比例する。15 秒で足りない環境で
  「止まった」と言えず失敗を報告するより長めにとる。(2) `main.ts` は読み込むと起動するので単体テストできない（`cliArgs.ts` を分けたのと同じ理由）。
  止める指示の冪等は AC7 の要で、テストで確かめたい。(3) 最初に閉じたままだと、止まる途中の 2 回目の `wtm session stop` は繋げず、`wtm.lock` はまだ在るので
  「古い版か起動中」と誤って 1 を返す。止まる途中の handoff は `markClosing` の印で断るので、socket を開けておいても引き継ぎは始まらない。
- 影響: `close()` の順序が変わる（socket を閉じるのが後になる）。止まる途中の socket の接続は `HandoffSocket.close()` が待つ——CLI は 1 行で切るが、
  1 行を送らずに繋ぎっぱなしにする同じ利用者のプロセスがあると停止が待たされる（既存の Ctrl+C の経路でも同じ。後続で接続に期限を付ける）。

## D5: requirements AC10 の注記の追記（2026-09-27・design）

- 背景: design の点検で、引数の解釈の誤り（名前が無い等）が `--json` でも JSON にならない点が AC10 と食い違うと指摘された。
- 決定: 引数の解釈は全コマンド共通の `cliArgs`（`ConfigError`・テキスト・終了コード 2）のままとし、requirements AC10 に「引数の解釈の誤りはテキスト」と
  注記を足した（承認後の requirements の最小の追記）。名前の規則・存在・綴り・Windows は `runSessionStop` が `--json` で JSON を出す。
- 理由・代替案: `cliArgs` で `--json` を先読みして JSON にする案は、`wtm session delete` 等と挙動が割れる。
- 影響: なし（design の CLI の節に反映済み）。

## D6: 止める指示の後の Ctrl+C は「2 回目のシグナル」として即座に終わる（2026-09-27・design）

- 背景: requirements の機能要件「止める指示が重なっても正常な停止を途中で打ち切らない」と、既存の「停止の途中のシグナルは即座に終わる」（`main.ts` の `shutdown`）の関係。
- 決定: 打ち切らないのは**止める指示**が重なったときだけ。止める指示で始まった停止の途中に届いた終了のシグナル（Ctrl+C 等）は、既存どおり
  2 回目として `exit(1)` で即座に終わる。CLI はプロセスが終わった（`wtm.lock` の持ち主が居ない）のを見て 0 を報告する。
- 理由・代替案: 「待たずに終わりたい」という人の意思表示（2 回目の Ctrl+C）は既存の仕様で、止める指示を挟んだだけで効かなくなるのは驚きになる。
  止める指示は機械（スクリプト）からも来るので、そちらの重なりだけを冪等にする。CLI の 0 は「プロセスが終わった」の意味（design「エラー処理」）。
- 影響: requirements AC7 の「終了のシグナルを受けて止まる途中の止める指示」は冪等（シグナルが先・指示が後）。逆順（指示が先・シグナルが後）は本決定。

## D7: architecture を挟まない（2026-09-27・design）

- 背景: `protocol.md`「4.5」の architecture の 4 条件の判定。
- 決定: 挟まない。モジュール間の境界は動かさない（既存の制御の socket に op を 1 つ足し、受け付けの判断を同じ `handoff/` の中の新しい関数に置き、
  `main.ts` の中の停止の手順を同じパッケージの `serveShutdown.ts` に切り出すだけ。依存の向きは変わらない）。データモデルは 1 行の JSON の返事だけ。
- 影響: なし。design の点検は 2 ラウンドの上限まで行い、2 ラウンド目の指摘 9 件は直した（3 ラウンド目は行わず、残りは review に委ねる）。
- tasks の点検は 1 ラウンドで指摘 6 件を直した（機械的な追記のため 2 ラウンド目は行わない。残りは review に委ねる）。

## D8: `StopReply` 型は `HandoffSocket.ts` に置く（2026-09-27・coding T1）

- 背景: design は `StopReply` を `handoff/controlRequests.ts` に置くとしていた。
- 決定: `HandoffSocket.ts` に置く（`HandoffRequestHandler.stop` の引数の型で、`controlRequests.ts` が `HandoffSocket.ts` を import する向き）。
- 理由・代替案: design どおりだと `HandoffSocket.ts` ⇄ `controlRequests.ts` の循環 import になる。
- 影響: なし（型の置き場だけ）。

## D9: 止め始めたサーバは、受け付け済みの引き継ぎが終わるまで待つ（2026-09-27・coding cross の点検）

- 背景: D4(3) で制御の socket を閉じる位置を `close()` の最後へ移したため、以前は「最初に socket を閉じ、処理中の `{"op":"handoff"}` の接続の終わりを
  待つ」ことで暗に保たれていた順序（引き継ぎが execve か元に戻すまで停止の本体を始めない）が消えた。引き継ぎの最中に Ctrl+C／SIGTERM を受けると、
  保存・端末の破棄と、読み取りの停止・handoff.json・execve が並んで走りうる（`wtm session stop` は busy で断るので、この経路はシグナルだけ）。
- 決定: `ControlRequests.markClosing()` を `beginClosing(): Promise<void>` に改め、印を同期で立ててから `HandoffController.waitIdle()`（新設。受け付け済みの
  引き継ぎが終わるまで待つ）を待つ。`close()` は最初にこれを await する。
- 理由・代替案: execve の直前で `closing` を見て元に戻す案は、`HandoffController` に停止の知識を持ち込み、戻す手順の途中の状態を増やす。待つ案は以前の
  順序をそのまま明示にしたもの。引き継ぎが execve に成功すればこのプロセスは入れ替わり、受けたシグナルは失われる（以前と同じ）。
- 影響: design「インターフェース」の `markClosing` は `beginClosing` に読み替える。

## D10: 止まる途中の引き継ぎの断りは新しい reason `stopping`（2026-09-27・review ラウンド 1）

- 背景: 止まる途中の `{"op":"handoff"}` を `busy` で断ると、既存の `wtm handoff` が「the server keeps running as before」と事実と逆の案内を出す。
- 決定: `HandoffFailureReason` に `stopping` を足し、新しい `wtm handoff` はそのとき「shutting down; start it again with wtm serve」と出す。
- 理由・代替案: 文言（message）で見分ける案は壊れやすい。古い CLI は未知の reason でも「refused (stopping)」と出し、続けて「keeps running」と
  出す（古い CLI の文言は直せない。サーバは止まる）。
- 影響: requirements AC5 の「止める指示を受けた後の引き継ぎの指示は断る」の断り方が `stopping` になる。
