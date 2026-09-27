# 調査: 更新時の引き継ぎ（live handoff）

> 出典の書き方: `[H]<path>` = herdr のリポジトリ（手元の写し `/workspaces/web-tn-multiplexer/scratchpad/herdr`、コミット `da6bcd59`）。
> `[P]<file>` = 本 work の実測（`scratchpad/probe/` の使い捨てスクリプト。Linux・WSL2・Node v24.15.0・node-pty 1.2.0-beta.15）。
> `[N]` = Node.js v24 の公式文書 `https://nodejs.org/docs/latest-v24.x/api/process.html`（2026-09-27 に取得）。

## 調査の問い

- Q1: herdr はどうやって pane のプロセスを新しいサーバへ渡しているか。
- Q2: Node.js（ネイティブのアドオンを足さずに）で、PTY の端末（master のファイル記述子）を新しいサーバへ渡せるか。どの方式が取れるか。
- Q3: 渡した後の PTY を、新しいサーバが node-pty 無しで読み書き・大きさの変更・終了の検知できるか。
- Q4: 親子関係（終了の検知・終了コード・ゾンビ）と、起動した端末・systemd 等から見た振る舞いはどうなるか。
- Q5: 既存の永続化（`session.json`・`wtm.lock`・`serve.json`・画面履歴・会話の再開・名前付き session）とどう組み合わさるか。
- Q6: OS ごとの対応（Linux・macOS・Windows）。
- Q7: 受け渡しの経路の安全性（同じ利用者に限る・新しい待ち受けを作らない）。

## 判明した事実

### Q1: herdr の方式

- F1.1 herdr の `herdr update --handoff` は、古いサーバが**新しい版の実行ファイルを子プロセスとして起動**し（`server --handoff-import <socket> <token>`。
  `[H]src/server/handoff.rs:62-107` `spawn_handoff_import`、デーモンとして切り離す `detach_server_daemon_command`）、データディレクトリの
  Unix ドメイン socket（`herdr-handoff-<pid>.sock`、権限 0600。`handoff.rs:57-59,135-141,309-313`）で繋ぐ。
- F1.2 手順は行単位の合図の往復: 子が token を送る → 親が manifest（JSON。session のスナップショット＋ pane ごとの `pane_id`・`child_pid`・
  大きさ・キーボードのモード・題名・画面の ANSI）を送る → 子 `validated` → 親が PTY の master を **`SCM_RIGHTS`** で 64 本ずつ送る
  （`handoff.rs:25-29,386-424`）→ 子 `restored` → 子 `ready` → 親 `committed` → 子 `owned`（`handoff.rs:178-236`）。
  失敗したら親は子を殺して元に戻る（`cleanup_failed_import_child`・`lifecycle.rs` の `rollback_handoff_before_commit`）。
- F1.3 新しいサーバは受け取った fd を `from_raw_fd` で包んで読み書きし（`[H]src/pane.rs:2249-2419` `from_handoff_fd`）、
  **子プロセスを待つ手段が無いので、終了は読み取りの終わり（EOF/EIO）で知る**。終了の理由は分からないとしている
  （`pane.rs:2374-2375` のコメント "Imported handoff panes have no child wait handle, so their exit cause is unknowable"）。
- F1.4 引き継いだ pane には、大きさを 1 行減らして戻す「つつき」（SIGWINCH を起こす）で TUI に描き直させる
  （`[H]src/pty/actor/unix.rs:976-1010` `nudge`、最初のクライアントが繋いだとき `lifecycle.rs:284-291`）。画面の ANSI は、会話の識別を持たない
  pane にだけ渡す（`lifecycle.rs:80-95`）。
- F1.5 herdr のサーバは最初からクライアントと別のデーモンなので、サーバの pid が変わっても利用者の端末には影響しない（`handoff.rs:96` の切り離し）。
  文書は「実験的・明示の指定のときだけ」「Unix だけ」（`[H]docs/.../session-state.mdx`「Live handoff」節）。

### Q2: Node.js での受け渡しの方式

- F2.1 Node.js の標準 API には `sendmsg`/`SCM_RIGHTS` で任意の fd を送る口が無い。`child_process` の IPC の `send(message, sendHandle)` は
  `net.Socket`・`net.Server`・`dgram.Socket` 等の handle だけを渡せ、端末（TTY）の handle は対象外（Node の文書の `subprocess.send` の節。
  **本 work では実物で試していない**——試す前に、他の方式で足りると分かったため）。herdr と同じ方式にするにはネイティブのアドオンが要る。
- F2.2 **`process.execve(file, args, env)` が使える**（`[N]` Added in v23.11.0・v22.15.0、**Stability: 1 - Experimental**、Windows・IBM i には無い）。
  文書は「標準入出力以外の資源は保たれない」と書くが、**実物では close-on-exec の付いていない fd は新しいプロセスに残る**（POSIX の execve の
  意味どおり）: node-pty で開いた PTY の master（fd 20）が execve の後も開いたまま、`tty.isatty` が真、書いた入力がシェルに届き、シェルの出力が
  読めた（`[P]a.cjs`・`b.cjs`）。**文書の記述と実物が食い違う点**なので、将来の Node で閉じるようになる余地がある（→ design への申し送り）。
- F2.3 node-pty（Linux）の master の fd は close-on-exec が**付いていない**: `forkpty` で開き、親側では `pty_nonblock` だけを掛け、
  close-on-exec を掛けるのは子の側（`pty_close_inherited_fds`）だけ（`node_modules/.pnpm/node-pty@1.2.0-beta.15/.../src/unix/pty.cc:132-146,439-495`）。
  macOS は `posix_openpt(O_RDWR)`（close-on-exec なし）で開き、子の側の `posix_spawn_file_actions_addclose` で閉じる（`pty.cc:742-821`）。
  node-pty の master の fd は `UnixTerminal` の `fd` で読める（`lib/unixTerminal.js:160-164`）。
- F2.4 execve の後もプロセスの pid は同じ（`[P]a.cjs` の `mypid` と `b.cjs` の `mypid` が一致）。libuv が作る socket（HTTP の待ち受け等）は
  close-on-exec が付くので閉じ、**同じポートにすぐ待ち受け直せた**（`[P]c.cjs`・`d.cjs` の `rebound`）。実験的の警告は出なかった（`[P]` 標準エラーが空）。
- F2.5 別の方式（新しいサーバを `child_process.spawn` の `stdio` 配列に master の fd を並べて子として起動し、古いサーバは終わる）も、
  fd の受け渡し自体は標準 API でできる（`stdio` の整数は親の fd を子へそのまま渡す——Node の文書の `options.stdio` の節。**実物では試していない**）。
  ただしサーバの pid が変わる（下の F4.3）。

- F2.6 **子プロセスに `stdio` の 4 つ目以降で渡した fd は、子の Node の中では close-on-exec が付いている**（`/proc/<pid>/fdinfo/3` の `flags: 02000002`。`[P]pf.cjs`）。
  その子がさらに execve すると fd 3 は閉じ、同じ番号を Node が起動時に開く `anon_inode:[eventpoll]` が使う——**「fd 3 が開いているか」だけを見ると
  残ったと誤判定する**（`[P]pf.cjs` の 2 段目）。子の中で node-pty で開いた PTY の master なら、execve の後も `dev:ino` が同じで `/dev/ptmx` を指した（`[P]pf2.cjs`）。

### Q3: 渡された PTY を node-pty 無しで扱えるか

- F3.1 読み取り: `new tty.ReadStream(fd)` で読める（node-pty 自身も同じ——`lib/unixTerminal.js:95`）。libuv は PTY の master を開き直さない
  （slave のときだけ開き直す）。
- F3.2 書き込み: `fs.writeSync(fd, …)` でシェルに届いた（`[P]b.cjs`）。master は非ブロッキングなので、`EAGAIN` に備えて書き直す待ち行列が要る
  （node-pty の `CustomWriteStream` と同じ。`lib/unixTerminal.js:287-340`）。
- F3.3 大きさの変更: node-pty のネイティブのモジュールの `resize(fd, cols, rows, pixelWidth, pixelHeight)`（`src/unix/pty.cc:546-` `PtyResize`、
  エクスポートは `pty.cc:869-872`）を、node-pty の `lib/utils.js` の `loadNativeModule('pty')` で読み込んで呼べる（`package.json` に `exports` が
  無いので深い読み込みができる）。execve の後のプロセスでこれを呼ぶと、シェルの `stty size` が `30 100` を返した（`[P]d.cjs`）。
- F3.4 終了の検知: シェルが終わると `tty.ReadStream` に `end`・`close`（`[P]d.cjs`。通常の終了）または `error`（`EIO`。`[P]b.cjs`。シグナルで
  終わらせたとき）が来る。
- F3.5 master が PTY かの確認: Linux では `/proc/self/fd/<fd>` の読み先が `/dev/ptmx`（`[P]d.cjs` の `link /dev/ptmx`）。macOS では `/proc` が無い。

### Q4: 親子関係と終了コード・ゾンビ

- F4.1 execve の後もサーバのプロセスは pane のシェルの**親のまま**だが、シェルを待つ node-pty のスレッド（`pty.cc:183-216` の `waitpid`）は
  execve で消える。Node には任意の pid を `waitpid` する API が無いので、**引き継いだ pane のシェルが終わるとゾンビ（`<defunct>`）になり、
  サーバが終わるまで残る**（`[P]a.cjs` の `ps` の出力 `Zs [sh] <defunct>`）。
- F4.2 Linux ではゾンビの `/proc/<pid>/stat` の 52 番目の欄（`exit_code`。waitpid の形）から終了コードが読める（`[P]d.cjs`: `exit 7` のシェルで
  `1792`＝ 7<<8）。
- F4.3 execve なら pid が変わらないので、起動した端末の前面のジョブ・Ctrl+C・systemd の主プロセスの見方・`wtm.lock`（中身は pid とホスト名。
  `packages/server/src/persist/StateDirLock.ts:9-11`）はそのまま。新しいサーバを子として起動して古いほうが終わる方式（F2.5）では pid が変わり、
  `wtm serve` を端末で起動していると端末には入力待ちが戻り、サーバは背景のプロセスグループに残って Ctrl+C が届かなくなる。systemd の
  `Type=simple` の既定（`KillMode=control-group`）では主プロセスの終了でサービスごと止まり、pane のプロセスも終わる（systemd の一般的な
  振る舞い。**本 work では実物で試していない**）。
- F4.4 `StateDirLock` は、ロックの pid が自分の pid と同じで、このプロセスがまだ持っていなければ「前に同じ pid で動いて落ちたプロセスの残り」とみなして
  取り直す（`StateDirLock.ts:40-46,190-196` `heldInThisProcess`・`isInUse`）。execve の後の新しいプロセスは `heldInThisProcess` が空なので、
  **そのまま取り直せる**。

### Q5: 既存の永続化との組み合わせ

- F5.1 起動は `composeServer.listen()`: ロック → auth → 待ち受け → `serve.json` → token → report socket → 復元（`sessionFile.load()` →
  `session.restore(data, { paneHistory })`、無ければ `ensureNotEmpty`）→ poller → `/ws` の受け付け（`packages/server/src/composeServer.ts` の `listen`）。
- F5.2 復元は pane ごとに `restorePaneProcess` → `spawnForPane`（新しいシェル）→ `maybeResumeAgentSession`（会話の再開のコマンドを打ち込む）
  （`packages/server/src/session/SessionService.ts:1129-1223`）。画面履歴は `spawnForPane` の `seed` でミラーへ先に書く（`SessionService.ts:1085-1111`）。
- F5.3 停止は `close()`: `persist.flush()`（`session.json`）→ 画面履歴の保存 → 全 pane の `terminals.dispose`（シェルを終わらせる）→
  WebSocket を 1001 で閉じる → ロックを放す（`composeServer.ts` の `close`）。
- F5.4 端末の層は `PtyBackend`/`PtyProcess` の interface が差し替え点（`packages/server/src/pty/PtyBackend.ts`。「差し替え点（D9）」）。
  `TerminalManager.create` が `PtyBackend.spawn` から `DefaultTerminalHost` を作り、終了で自分を捨てる（`terminal/TerminalManager.ts`）。
- F5.5 ミラーは `historyAnsi()`（通常の画面とスクロールバックを色つき ANSI で。代替画面とモードは含まない）と `flush()`（それまでの書き込みの
  処理を待つ）を持つ（`terminal/Mirror.ts:173-229`）。流す前の安全化は `terminal/historyAnsi.ts` の `sanitizeHistoryAnsi`。
- F5.6 ブラウザは閉じられた理由のコードが 4401（認証）以外なら「再接続中」にして繋ぎ直す（`packages/web/src/net/Connection.ts:335-362`）。
  Cookie は `auth.json` の中身から作られ、再起動をまたいで有効（既存のサーバの再起動と同じ）。
- F5.7 スクロールバックを $EDITOR で開いた pane は、`SessionService` のメモリの `scrollbackEditors`（pane → 元の pane・前の拡大表示・一時ディレクトリ）
  で後始末する（`SessionService.ts:142,449-458,658-707`）。メモリにしか無いので、execve で消える。
- F5.8 名前付き session の状態ディレクトリは `resolveSessionStateDir(base, session)`（`sessionCommands.ts:81` の使い方）。`wtm token reset` の
  入口が `--state-dir`・`--session`・`WTM_SESSION` の扱いの手本（`cliArgs.ts:36-170`・`applySessionEnv`）。
- F5.9 公式フック連携の socket は状態ディレクトリの `agent-report.sock`（0600。`agent/AgentReportSocket.ts:24-50`）で、パスの長さを起動前に
  検査している（`config.ts:90-93,157-166`。Linux 108・他 103 バイト）。残ったファイルは `EADDRINUSE` で消して待ち受け直す（`AgentReportSocket.ts:57-66`）。

### Q6: OS ごとの対応

- F6.1 Linux（WSL2 を含む）: F2.2〜F4.2 はすべてこの環境で実測。
- F6.2 macOS: `process.execve` はある（`[N]` は Windows・IBM i だけを除く）。master の fd に close-on-exec が付かないのは F2.3 のとおりだが、
  **実機では確かめていない**。`/proc` が無いので、PTY かの確認と終了コードの読み取りは Linux と同じにはできない。
- F6.3 Windows: `process.execve` が無く（`[N]`）、ConPTY は fd ではない。herdr も非対応。

### Q7: 受け渡しの経路の安全性

- F7.1 execve の方式なら、PTY の fd は**プロセスの外へ一度も出ない**（同じプロセスの中で像が入れ替わるだけ）。herdr の `SCM_RIGHTS` の socket の
  ような、fd を受け取る口が要らない。
- F7.2 引き継ぎを指示する経路は別に要る。Node からは `SO_PEERCRED`（接続相手の uid）を読めない（標準 API に無い）。既存の report socket と
  同じく、状態ディレクトリの中に置いて 0600 にする方式が取れる（F5.9）。シグナル（例 `SIGUSR2`）は同じ利用者にしか送れないが、`wtm.lock` の pid が
  別のプロセスに再利用されていると、そのプロセスを既定の動作（終了）で終わらせてしまう。

## 影響範囲

- `packages/server/src/pty/`（引き継いだ PTY の実装・node-pty の fd の取り出し）
- `packages/server/src/terminal/TerminalManager.ts`（引き継いだ PTY から端末を作る口）
- `packages/server/src/session/SessionService.ts`（復元で新しいシェルの代わりに引き継いだ端末を使う・`scrollbackEditors` の受け渡し）
- `packages/server/src/composeServer.ts`（引き継ぎの指示の受け口・引き継ぎの実行・起動時の受け取り）
- `packages/server/src/main.ts`・`cliArgs.ts`（`wtm handoff`）
- `docs/`（利用者向けの説明）・`docs/herdr-parity.md`

## 実現性 / リスク

- 実現できる: `process.execve` で**同じプロセスのまま新しい版に入れ替え、PTY の fd をそのまま持ち越す**方式なら、ネイティブのアドオンも
  デーモンの分割も要らない（F2.2〜F3.4）。
- リスク R1: Node の文書は fd が残ることを保証していない（F2.2）。将来の Node で閉じるようになると、execve の後に全 pane を失う。
- リスク R2: execve の後は元に戻れない（herdr の rollback に当たるものが無い）。新しい版が起動の途中で落ちると、pane を失う（普通の再起動と同じ結果）。
- リスク R3: 引き継いだ pane のシェルは終わってもゾンビとして残る（F4.1）。数は引き継いだ pane の数まで。
- リスク R4: macOS は未検証（F6.2）。
- リスク R5: `process.execve` は Experimental（F2.2）。

## 実装アンカー

- A1: PTY の interface（`packages/server/src/pty/PtyBackend.ts` `PtyProcess`・`PtyBackend`）— 引き継いだ PTY の実装を足す。
- A2: node-pty の実装（`packages/server/src/pty/NodePtyBackend.ts` `NodePtyProcess`）— master の fd を読み出す口を足す（`(pty as {fd}).fd`）。
- A3: 端末の作成（`packages/server/src/terminal/TerminalManager.ts` `DefaultTerminalManager.create`）— 引き継いだ PTY から `DefaultTerminalHost` を作る口。
- A4: 端末の流量制御（`packages/server/src/terminal/TerminalHost.ts:80-100`）— `pty.pause()`/`resume()` を使っている。
- A5: 復元（`packages/server/src/session/SessionService.ts:1129-1223` `restore`・`restorePaneProcess`・`spawnForPane`・`wireExit`）。
- A6: 起動と停止（`packages/server/src/composeServer.ts` `listen`・`close`）。
- A7: 状態ディレクトリのロック（`packages/server/src/persist/StateDirLock.ts`）— 変更不要（F4.4）。
- A8: CLI（`packages/server/src/cliArgs.ts` `parseArgs`・`applySessionEnv`、`packages/server/src/main.ts` `main`、`packages/server/src/sessionCommands.ts` `runTokenReset`）。
- A9: ローカル socket の手本（`packages/server/src/agent/AgentReportSocket.ts`）・パスの長さの検査（`packages/server/src/config.ts:157-166`）。
- A10: 原子的な書き込み（`packages/server/src/persist/atomicFile.ts` `writeFileAtomic`）。
- A11: ミラー（`packages/server/src/terminal/Mirror.ts` `historyAnsi`・`flush`）・安全化（`terminal/historyAnsi.ts` `sanitizeHistoryAnsi`）。

## 実装時の注意

- execve の前に JS の後始末は走らない（`[N]`「exit・close のイベントも後始末も走らない」）。`session.json` の保存・ログの書き出し・
  WebSocket の終了は execve の**前に** await して済ませる。
- 引き継ぐ PTY の読み取りは execve の前に止め、ミラーへの書き込みを `flush()` で待ってから画面を取る（止めた後に届いた出力は PTY の中に残り、
  新しいプロセスが読む）。
- 新しいプロセスでは、読まない（引き継がない）master の fd を閉じないと、そのシェルは端末を失わず（hangup が届かず）見えないまま残る。
- `tty.ReadStream` を同じ fd に 2 つ作らない（libuv の同じ fd の二重の監視）。引き継ぎの試験を同じプロセスの中で node-pty と並べて行わない
  ——子プロセスで execve して確かめる（`[P]` と同じ形）。
- 環境変数で渡すものは、新しいプロセスが読んだら `process.env` から消す（pane の環境に漏らさない。pane の環境は `buildPaneEnv` が作る）。

## design への申し送り

- 方式の選択（execve・子として起動して古いほうが終わる・ネイティブのアドオン・PTY を持つ別のデーモン）と、それぞれの具体的な破綻の場面を
  decisions に残す。
- R1（fd が残ること）を、execve の前に**その Node で実際に確かめる**手段を用意できるか（例: 事前の確認の子プロセスの中で fd を持って execve し、
  残るかを見る）。
- R2 を小さくするため、execve の前に新しい版を読み込めるか・引き継ぎの形式の版が合うかを確かめる。
- ゾンビ（R3）と終了コードの扱い（Linux は `/proc` から読める・macOS は不明）。
- 引き継ぎの指示の経路（ローカル socket かシグナルか）と、結果を CLI に返す方法（execve で接続が切れる）。
- 画面の続き（ミラーの中身を渡す・TUI をつつく）と、画面の内容を含む受け渡しの中身の置き場（0600・読んだら消す）。
