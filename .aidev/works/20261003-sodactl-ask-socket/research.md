# 調査: pane の中のプログラム向けのログイン不要の受け口

行番号は 2026-10-03 時点の `feature/sodactl-ask-socket`（9514847）のもの。「推測」「未確認」と書いていないものはコードか docs を読んで確かめた事実。

## 調査の問い

- Q1. サーバの ask の実装（`AskService` の公開 API・上限の数え方・`/ws` の `ask.open` の呼び出し元・切断時の取り消し・「どの pane からの質問か」の表示）
- Q2. 既存のローカル socket の作り方（`AgentReportSocket`・パスの決め方・起動／停止／handoff での扱い・名前付き session・パスの長さの上限）
- Q3. pane の環境変数（入れる場所・取り除く場所・handoff 後の既存 pane）
- Q4. sodactl 側（`runAsk`・引数の解析・`caller_pane_unknown`・`unauthenticated`・終了コード・テストの差し替え方）
- Q5. プロトコルの型（ask の型・エラー code の定義場所）
- Q6. テストと起動確認（統合テスト・socket のテスト・E2E・smoke）
- Q7. docs と skill の該当記述、`.aidev/conventions/` の 2 条項
- Q8. Windows の扱い（名前付きパイプ・機能を無効にしている既存の例）

## 判明した事実

### Q1. サーバの ask

- F1. `AskService` の公開 API は `subscribe(clientId)`・`open(clientId, {paneId, spec, timeoutMs})`・`get`・`answer`・`cancel(clientId, askId)`・`onClientGone(clientId)`・`dispose()`・`pendingCount`・`subscriberCount`（`packages/server/src/ask/AskService.ts:83-170`）。依存は `paneExists`・`isBrowserKind`・`bus`・`timers?`・`random?`・`logger?`（`AskService.ts:33-44`）。
- F2. `open` は `Promise<AskResult>` を返し、結果が決まるまで解決しない。検査の順は (1) `normalizeAskSpec` の失敗（対応していない型を除く）→ `invalid_ask_spec`、(2) `paneExists` が偽 → `not_found`（`pane not found: <id>`）、(3) 同じ pane に待ちがある → `ask_busy`、(4) 総数 `ASK_PENDING_MAX` 以上 → `ask_busy`、(5) 同じ `ownerClientId` の待ちが `ASK_PENDING_PER_CLIENT_MAX` 以上 → `ask_busy`、(6) 対応していない型 → `unavailable`（解決）、(7) `disposed` → `unavailable`、(8) 画面の購読者が 0 → `unavailable`（`AskService.ts:100-114`）。(1)〜(5) は同期の `throw new RpcError(...)`（Promise の reject ではない）。
- F3. 上限の数え方: 総数は `byId.size`、pane ごとは `byPane.has(paneId)`、接続あたりは `byId` を回して `ownerClientId === clientId` を数える（`AskService.ts:104-109`）。台帳は 1 つ（`byPane`・`byId`。`AskService.ts:62-63`）なので、同じ `AskService` を通す限り経路が違っても総数と pane ごとは一緒に数えられる。接続あたりは `open` の第 1 引数の文字列が同じものを 1 つの持ち主として数える。
- F4. 持ち主は `Entry.ownerClientId`（`AskService.ts:46-54`）。取り消しの入口は 3 つ: `cancel(clientId, askId)` は**画面の購読者だけ**が呼べる（購読者でなければ `ask_closed`。`AskService.ts:152-156`）、`onClientGone(clientId)` はその接続が出した質問を全部 `cancelled` で閉じる（`AskService.ts:159-162`）、`dispose()` は全部閉じる（`AskService.ts:165-170`）。**持ち主（質問を出した側）が askId を指定して取り消す公開 API は無い**（`open` は askId を呼び出し側に返さない）。
- F5. `open` に渡す `timeoutMs` の範囲の検査は `AskService` には無く、`/ws` の schema `AskOpenParams`（`packages/protocol/src/messages.ts:393-397`。`ASK_TIMEOUT_MIN_MS`〜`ASK_TIMEOUT_MAX_MS` の整数）が行う。`paneId`・`spec` がオブジェクトであることの検査も同じ schema。
- F6. `/ws` の RPC `ask.open` は `registerAskMethods` が登録し、`asks.open(ctx.clientId, params)` を呼ぶ（`packages/server/src/surface/methods/ask.ts:12-15`）。`deps.asks` が無ければ登録しない（`ask.ts:10-11`）。
- F7. 接続が切れたときの取り消しは `WsGateway` の `conn.onClose` → `this.onClientGone?.(clientId)`（`packages/server/src/ws/WsGateway.ts:155-168`）→ `composeServer` が渡した `asks.onClientGone(clientId)`（`packages/server/src/composeServer.ts:412-417`。中継の受け口用の 2 つ目の `WsGateway` も同じ `composeServer.ts:422-428`）。
- F8. `clientId` は `ClientRegistry.register()` の `randomUUID()`（`packages/server/src/clients/ClientRegistry.ts:62-63`。`WsGateway.ts:83`）。サーバの中から RPC を呼ぶ既存の例は固定の文字列 `GRAPH_CLIENT_ID = "graph"`（`composeServer.ts:144`・`composeServer.ts:347-356`）。
- F9. `AskService` の組み立ては `composeServer.ts:317-325`。`paneExists` は `session.getPane(paneId) !== undefined`、`isBrowserKind` は `clients.get(clientId)?.kind` が `desktop`／`mobile`。停止時は `asks.dispose()`（`composeServer.ts:756`）。
- F10. 「どの pane からの質問か」の表示は**サーバでは作らない**。サーバが配るのは `ask.opened`／`ask.closed` の `{askId, paneId}`（`AskService.ts:128`・`209`）と `AskPending {askId, paneId, spec}`（`packages/protocol/src/ask.ts:91-95`）だけで、文言はブラウザが `paneId` から自分のセッションの写しを引いて作る（`packages/web/src/components/AskDialog.vue:68-77` の `origin`）。pane が写しに無ければ `pane <paneId>` と出る（`AskDialog.vue:72`）。
- F11. handoff の間: `closeClients` が `/ws` と中継のチャネルを 1012 で閉じる（`composeServer.ts:468-473`）ので、`/ws` 経由の待ちは F7 の経路で `cancelled` になる。`AskService` 自体は handoff の手順（`pausePollers`・`closeClients`・`flushSession`。`composeServer.ts:448-477`）に入っていない。回答待ちはメモリだけ（`composeServer.ts:316` のコメント）。

### Q2. 既存のローカル socket

- F12. `startAgentReportSocket(path, onReport, logger)` は `net.createServer` → `listenUnixSocketReplacingStale` → win32 以外で `chmod(path, 0o600)`（失敗は warn だけで続ける）→ `{path, close()}` を返す（`packages/server/src/agent/AgentReportSocket.ts:23-58`）。1 接続 1 メッセージ・返事なし・`MAX_LINE_BYTES = 4096`（超えたら `sock.destroy()`）・処理は `end` で行う（`AgentReportSocket.ts:21`・`24-38`）。`close()` は `server.close()` だけで socket のファイルは消さない（`AgentReportSocket.ts:54-56`。推測: Node は自分が listen した unix socket のファイルを `server.close()` で消す）。
- F13. `listenUnixSocketReplacingStale(server, path)` は listen が `EADDRINUSE` のとき（win32 以外）`unlink` してもう 1 回 listen する（`AgentReportSocket.ts:64-73`）。根拠は「`StateDirLock` が二重起動を防いでいるので残骸は消してよい」（`AgentReportSocket.ts:69`）。「execve で入れ替わった新しい版から見ると、古い版の socket のファイルは残骸と同じ」（`AgentReportSocket.ts:60-63`）。
- F14. パスは `agentReportSocketPathFor(stateDir, os)`: win32 は `\\.\pipe\soda-agent-report-<stateDir の sha256 の先頭 16 桁>`、それ以外は `<stateDir>/agent-report.sock`（`packages/server/src/config.ts:82-88`）。
- F15. パスの長さ: `maxUnixSocketPathBytes(os)` は linux 108・それ以外 103（`config.ts:91-93`）。`resolveServeOptions` は win32 以外で **`agentReportSocketPathFor` のパスだけ**を測り、超えたら `ConfigError`（終了コード 2。`config.ts:156-167`）。`handoff.sock`・`bridge.sock` は `agent-report.sock` よりファイル名が短い。テストは `packages/server/src/config.test.ts:121-123`。
- F16. docs の記述: `docs/tls-setup.md:463-466`「名前は短めに（Linux・macOS・WSL2）：公式フック連携の socket（`<状態ディレクトリ>/agent-report.sock`）のパスには OS の上限（Linux は 108 バイト、macOS は 103 バイト。macOS は未検証）があり、超えると `soda: the state dir path is too long: …` で起動しない（終了コード 2）。既定の状態ディレクトリ（Linux の `/home/<ユーザー名>/.local/state/sodashitsu`）なら、ユーザー名が 8 文字で 42 文字の名前まで通る。」
- F17. 名前付き session: 状態ディレクトリは `resolveSessionStateDir(base, name)` で、既定は `base`、名前付きは `<base>/sessions/<name>`（`packages/server/src/persist/namedSession.ts:45-49`。`config.ts:153-155`）。socket のパスは全て状態ディレクトリから決まる（F14・`handoffSocketPathFor`〔`packages/server/src/handoff/HandoffSocket.ts:18-20`〕・`bridgeSocketPathFor`〔`packages/server/src/machine/BridgeEndpoint.ts:28-30`〕）ので、session ごとに別になる。名前は 64 文字まで（`namedSession.ts:16`）。
- F18. 起動: `agentReportSocket` は `listen()` の 2.5（bind・`serve.json`・`local-auth.json`・token の後、復元の前）で立てる（`composeServer.ts:619-627`）。**`.catch` が無く platform の分岐も無い**ので、立てられなければ `listen()` 全体が失敗する（`catch` 節で後始末して投げ直す。`composeServer.ts:695-712`）。一方 `handoffSocket`（4.5）と `bridgeEndpoint`（4.6）は `platform() !== "win32"` のときだけ、復元と poller の後に立て、失敗しても warn で起動を続ける（`composeServer.ts:673-689`）。
- F19. `agentReportSocketPath` は `composeServer` の組み立て時に決めて `SessionService` へ渡す（`composeServer.ts:238`・`253`）。つまり socket を立てるより前に、pane の環境に入れるパスは確定している。
- F20. 停止: `close()` は `agentReportSocket?.close()` を早い段階（`wsServer.setReady(false)` の直後）で呼ぶ（`composeServer.ts:731`）。`handoffSocket` はロックを放す直前まで開けておく（`composeServer.ts:766-769`）。`bridgeEndpoint` は `setReady(false)` → `closeAll(1001)` → `close()`、finally でもう一度 `close()`（`composeServer.ts:730`・`750-751`・`770`）。起動失敗時の後始末は `composeServer.ts:704-706`。
- F21. handoff: `HandoffController.run` は `closeClients` → `pausePollers` → 各 pane の hold → `flushSession` → `handoff.json` → 返事 → `flushLog` → `execve`（`packages/server/src/handoff/HandoffController.ts:186-242`）。**3 つの socket（agent-report・handoff・bridge）を閉じる手順は無い**（依存 `closeClients`／`reopenClients` が触るのは `wsServer` と `bridgeEndpoint` の ready と既存チャネルだけ。`composeServer.ts:468-477`）。execve の後は新しい版の `listen()` が同じパスで立て直し、古いファイルは F13 で置き換わる（`bridge.sock` は一時ディレクトリで listen → 0600 → `rename` で置き換え。`BridgeEndpoint.ts:91-123`）。execve に失敗して元に戻すとき（`rollback`。`HandoffController.ts:175-180`）も socket は開いたまま。
- F22. 0600 にするまでの窓への対処は 3 通りある: `AgentReportSocket` は listen の後に chmod し、失敗しても warn で続ける（`AgentReportSocket.ts:44-50`）。`HandoffSocket` は chmod に失敗したら受け口を閉じて投げる（「権限を絞れない受け口は置かない」。`HandoffSocket.ts:75-83`）。`BridgeEndpoint` は 0700 の一時ディレクトリの中で listen → chmod 0600 → rename し、`accepting` が真になるまでに繋がった socket は捨てる（`BridgeEndpoint.ts:62-63`・`87-123`。理由は「待ち受けと chmod の間に、状態ディレクトリを読める別の利用者（umask で group に開いている等）が繋いで認証済みのチャネルを得る窓を作らない」）。
- F23. 状態ディレクトリ自体は `mkdir(dirname(lockPath), {recursive: true})` で mode の指定なし（`packages/server/src/persist/StateDirLock.ts:106`）。0700 にしている箇所は画像・ドロップの置き場だけ（`packages/server/src/image/ImageStore.ts:163`・`packages/server/src/file/FileStore.ts:201`）。
- F24. 既存の「返事を返す 1 行 JSON の socket」は `HandoffSocket`: 改行までを 1 行として読み、`MAX_LINE_BYTES = 4096` を改行の前の長さで判定、`{"op":...}` で分岐、知らない op は `{ok:false, reason:"bad_request", message}`、返事を書いたら `sock.end()`（`HandoffSocket.ts:16`・`49-73`・`92-126`）。多重化した長い接続の例は `BridgeEndpoint`（1 本の socket に複数チャネル。各チャネルを `WsConnection` として `WsGateway` に渡す。`BridgeEndpoint.ts:20-24`）で、「受け口に繋がった接続は認証済みとして扱う」（`BridgeEndpoint.ts:23`）＝ `/ws` の全 RPC が通る。

### Q3. pane の環境変数

- F25. 入れる場所は `buildPaneEnv`（`packages/server/src/session/paneEnv.ts:50-71`）: `SODA_PANE_ID`（65）・`SODA_SERVER_URL`（66）・`SODA_AGENT_REPORT_SOCKET`（67）・`SODA_SESSION`（68）・`extra`（69）。値が無ければ入れない。呼び出し元は `SessionService.envForPane`（`packages/server/src/session/SessionService.ts:1158-1165`）と独自コマンドの `commandEnv`（`SessionService.ts:763-771`。`ownPaneId` を省くと `SODA_PANE_ID` を入れない）。
- F26. 取り除く場所は同じ `buildPaneEnv` で、一覧は `PANE_ENV_DROPPED`（`paneEnv.ts:14-29`）: `SODACTL_URL`・`SODACTL_TOKEN`・`SODA_PANE_ID`・`SODA_SERVER_URL`・`SODA_AGENT_REPORT_SOCKET`・`SODA_SESSION`・`SODA_HANDOFF_NONCE`・`SODA_ACTIVE_*`・`SODA_COMMAND_ID`。win32 では大文字小文字を区別せずに落とす（`paneEnv.ts:55-63`）。**サーバが管理する変数は「落とす一覧」にも載せる**決まり（古い値を渡さないため。`paneEnv.ts:7-8`）。
- F27. `SODA_SERVER_URL` の値は `listen()` の bind の後に決まる `paneUrl`（`composeServer.ts:243`・`256`・`598-602`）。`agentReportSocketPath` は組み立て時の固定値（F19）。
- F28. テスト: `packages/server/src/session/paneEnv.test.ts`（19・38・46「token はどの値にも含まれない（AC15）」・56・98 行）、実物の pane の環境を `printf` で読む `packages/cli/src/paneEnv.integration.test.ts:148`・`186-212`。
- F29. handoff 後の既存 pane の環境: 引き継いだ pane はシェルのプロセスがそのまま（PTY の fd を渡す。`composeServer.ts:628-637`）なので、環境は起動した時の値のまま。docs に handoff と pane の環境の関係を書いた箇所は見つからなかった（未確認: `docs/verification.md` の handoff の節を通読はしていない。`SODA_SERVER_URL`・「環境変数」と handoff／引き継ぎが同じ行にある箇所は無い）。関連する既存の記述は「環境変数は起動した時の値のまま変わらない」（`docs/sodactl.md:505-507`。workspace・tab の ID を入れない理由として）。socket のパスは状態ディレクトリから決まるので、handoff の前後で `agent-report.sock` のパスは同じ（F14・F21）。ポートは handoff の前後で変わりうる（`composeServer.ts:574-576` が warn を出すだけ）。

### Q4. sodactl 側

- F30. `runAsk(cmd, store, deps)` の流れ（`packages/cli/src/commands/ask.ts:80-97`）: `cmd.opts.caller` が無ければ `caller_pane_unknown` → `resolveCallerPane`（接続の前に断る）→ `readAskSpec`（標準入力・JSON・`normalizeAskSpec`。誤りは `CliUsageError`、対応していない型は接続せず `unavailable` を出して終わる。`ask.ts:60-73`・`87-90`）→ `withSession` の中で `client.hello()` → `requestAsk` → `deps.print(result)`。
- F31. `requestAsk` は `client.request("ask.open", {paneId, spec, timeoutMs}, {timeoutMs: timeoutMs + ASK_REQUEST_SLACK_MS})`（15 秒の余裕。`ask.ts:16`・`104`）。接続が先に閉じたら `connection_closed`（`ask.ts:103`）。サーバの `invalid_ask_spec` は `CliUsageError`（終了コード 2）に読み替える（`ask.ts:105-107`）。送る `spec` は**読んだままのオブジェクト**（正規化した後の形ではない。`ask.ts:72`）。Ctrl+C・SIGTERM は何もしない（プロセスが終わって接続が閉じ、サーバ側が F7 で取り消す。`ask.ts:78`）。
- F32. 差し替えの口は `AskDeps { readStdin, print }` だけ（`ask.ts:20-24`・`51-54`）。接続（`withSession`）は引数ではなく import。
- F33. 引数の解析: `case "ask"` は `--url`・`--token`・`--timeout` だけ受け、位置引数は不可（`packages/cli/src/cliArgs.ts:378-384`）。`--timeout` は `ASK_TIMEOUT_MIN_MS`〜`ASK_TIMEOUT_MAX_MS` の整数、既定 `ASK_TIMEOUT_DEFAULT_MS`（`cliArgs.ts:627-633`）。`--machine` は `local` 以外で使い方の誤り（`cliArgs.ts:966-967`）、`local` は `cmd` をそのまま返す（`cliArgs.ts:969`）。
- F34. `opts.caller` は `globalOptsFrom` が `SODA_PANE_ID` と `SODA_SERVER_URL` の**両方**が空でないときだけ `{paneId, serverUrl}` を入れる（`cliArgs.ts:307-316`）。`opts.url` は `--url` → `SODACTL_URL` → `SODA_SERVER_URL` → 既定 `http://127.0.0.1:7780` の順で 1 つの文字列になる（`cliArgs.ts:311`）。**`GlobalOpts` に「`--url`／`SODACTL_URL` を明示したか」の印は無い**（`cliArgs.ts:118-125`）——解析の後では、明示した URL が `SODA_SERVER_URL` と同じ文字列かどうかしか分からない。`SODA_SERVER_URL` が入らない待ち受け（URL にできないもの。`docs/sodactl.md:502`）では `caller` が無く、今の ask は `caller_pane_unknown` になる（`ask.ts:82-84`）。
- F35. 歯止め: `resolveCallerPane(opts, target)` は `selfPaneId(opts)` が undefined なら `caller_pane_unknown` を投げる（`packages/cli/src/paneTarget.ts:15-33`）。`selfPaneId` は `opts.url` と `caller.serverUrl` の「origin の鍵」（ループバックの名前 `localhost`・`127.0.0.1`・`[::1]` は同じ扱い）が一致するときだけ pane の ID を返す（`packages/cli/src/selfGuard.ts:15-46`）。つまり `--url`／`SODACTL_URL` を明示しても、同じ origin（ループバックの別名を含む）なら通る。
- F36. `withSession`（`packages/cli/src/withSession.ts:15-36`）: キャッシュの cookie で接続 → `AuthError` ならキャッシュを消して再ログインへ → token（`--token`／`SODACTL_TOKEN`）が無ければ `UnauthenticatedError`（`withSession.ts:26-32`。メッセージは 2 種類）→ `login` → 保存 → 接続。`opts.machine` があれば `connect(url, cookie, machine)`（`withSession.ts:38-46`）。
- F37. 終了コード: `main().catch(reportAndExit)`（`packages/cli/src/main.ts:147-149`）。`reportAndExit` は `CliUsageError` → stderr に 2 行・終了コード 2、それ以外は `classify` して stderr に `{"error":{"code","message"}}`・終了コード 1（`packages/cli/src/output.ts:117-128`）。`classify`: `UnauthenticatedError` → `unauthenticated`、`AuthError` → `invalid_token`、`RpcFailure` → その `code`、`statusCode === 403` → `forbidden`、ほか `internal`（`output.ts:94-104`）。`RpcFailure(code: string, message)` は code が自由な文字列（`packages/cli/src/wsClient.ts:27-35`）。
- F38. 古いサーバ（`ask.open` を知らない）は `/ws` の `not_found`（`unknown method: ask.open`）で、「pane が無い」と同じ code になる（`packages/server/src/surface/ControlSurface.ts:35`・`AskService.ts:103`）。sodactl は今はどちらも `not_found` のまま終了コード 1（テスト `packages/cli/src/commands/ask.test.ts:140-141`）。
- F39. `ask.test.ts` の差し替え方（`packages/cli/src/commands/ask.test.ts`）: `vi.mock("../withSession.js", …)` で `withSession` を「`mockState.client` を `fn` に渡すだけ」の偽物にする（69-72）。偽のクライアントは `hello`・`request`・`onClose`・`close` を持つオブジェクト（53-67）。標準入力と出力は `AskDeps` の偽物（74）。`cmd()` は `parseArgs(["ask", ...argv], env)` に環境 `{SODA_PANE_ID: "p3", SODA_SERVER_URL: "http://127.0.0.1:7780"}` を渡して作る（8-15）。「定義の誤り・対応していない型では `hello` も `request` も呼ばれない」を確かめている（105-125）。
- F40. `packages/cli/src` で `node:net` を使っているのは smoke と結合テストだけ（空きポートの確保等）。sodactl の本体に unix socket／名前付きパイプへ繋ぐコードは無い。Node から繋ぐ既存の例は hook スクリプトの `net.connect(sock, …)`（`packages/server/assets/agent-hook-report.cjs:52-63`。unix のパスも Windows のパイプ名も同じ呼び方）と `soda bridge`（`packages/server/src/machine/bridgeCommand.ts:41`）。

### Q5. プロトコルの型

- F41. ask の型と検査は `packages/protocol/src/ask.ts`: 上限の定数（10-32 行。`ASK_SPEC_MAX_BYTES = 256 * 1024`・`ASK_TIMEOUT_DEFAULT_MS = 540_000`・`ASK_TIMEOUT_MIN_MS = 1_000`・`ASK_TIMEOUT_MAX_MS = 86_400_000`・`ASK_PENDING_MAX = 32`・`ASK_PENDING_PER_CLIENT_MAX = 8`）、`AskResult`（79-83）、`unsupportedTypeReason`（86-88）、`AskPending`（91-95）、`jsonBytes`（107）、`normalizeAskSpec`（153〜。戻りは `{ok:true, spec}` か `{ok:false, message, unsupportedType?}`。146-147）、`checkAskAnswer`（378）。`index.ts:13` で再輸出。
- F42. `/ws` の RPC の引数と結果の型は `packages/protocol/src/messages.ts`: `AskOpenParams`（393-398）・`AskSubscribeParams`／`AskGetParams`／`AskAnswerParams`／`AskCancelParams`（400-416）、方式の表（845-849）、結果の表（938-942。`"ask.open": AskResult`）。イベントは `packages/protocol/src/events.ts:172-178`。
- F43. エラー code は `ErrorCode` の union（`packages/protocol/src/errors.ts:2-86`）。ask 関係は `invalid_ask_spec`・`ask_busy`・`ask_closed`（84-86）、汎用は `unauthorized`・`not_found`・`invalid_params`・`spawn_failed`・`internal`（3-7）。`RpcError(code: ErrorCode, message)` と `toProtocolError()`（93-103）。`ControlSurface.invoke` が「知らない方式 → `not_found`」「schema 違反 → `invalid_params`」「`RpcError` → その code」「想定外 → `internal`（詳細は漏らさない）」に揃える（`ControlSurface.ts:33-52`）。「受け口がその操作を知らない」専用の code は今は無い。
- F44. sodactl 側だけの code（`caller_pane_unknown`・`self_target`・`connection_closed`・`timeout`・`unauthenticated`・`invalid_token` 等）は `ErrorCode` に入っておらず、`RpcFailure` の自由な文字列（F37）。

### Q6. テストと起動確認

- F45. `packages/server/src/agent/AgentReportSocket.test.ts`: `makeTempDir("soda-agent-report-")`（`os.tmpdir()` の下の `mkdtemp`。`packages/server/src/persist/atomicFile.ts:74-76`）に `agent-report.sock` を置き、`net.connect(path, () => sock.end(payload))` で送る（9-15・23-32）。残骸の作り直しは「普通のファイルを置いてから起動する」（61-69）。権限（0600）と Windows のテストは無い。
- F46. `packages/server/src/ask/ask.integration.test.ts`: `composeServerOnFreePort({host, stateDir, origin: []})` で実物を起動（76-88）、`/api/login` → cookie → `ws` で `/ws` → `client.hello`（45-63）。ケースは 90・108・116・129（ask_busy・invalid_ask_spec・not_found）・142・156（呼び出し側の切断 → `ask.closed`）・175・187（`server.log` に中身が出ない）行。`AskService` の単体は `AskService.test.ts`（297 行）。
- F47. E2E に ask のテストがある: `packages/e2e/src/specs/ask-form.spec.ts`（23 件ほど）・`ask-form-mobile.spec.ts`。sodactl の呼び方は `packages/e2e/src/support/ask.ts:32-58` の `runAsk`: ビルドした `packages/cli/dist/main.js` を `spawn(process.execPath, [CLI_MAIN, "ask", "--token", token, ...args])`、環境は `HOME`／`USERPROFILE`（使い捨て）・`SODA_PANE_ID`・`SODA_SERVER_URL`・`SODACTL_TOKEN`。**今の E2E は必ず token を渡している**（ログインなしの経路は通らない）。ブラウザの準備は `watchAskSubscriptions`（CDP で `ask.subscribe` の応答を数える。`support/ask.ts:61-97`）で待つ。SIGINT のテストは `ask-form.spec.ts:194`、pane の外は `ask-form.spec.ts:121`。
- F48. smoke（`.aidev/config.yml` の `smokeCommands`）で sodactl／ask に関係するもの: 2 本目 `pnpm --filter @sodashitsu/cli run smoke`（`packages/cli/package.json:13` → `dist/smoke.js`）、4 本目 `SODACTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/sodactl/SKILL.md`（skill ファイルを変えても通るが、`sodactl skill` の出力と一致が要る）。6〜8 本目（handoff・stop・machine の smoke）は ask を呼ばない。
- F49. `packages/cli/src/smoke.ts` の ask の部分（313-323）: サーバは同じプロセスの中で `composeServer` を起動（`smoke.ts:250-252`。状態ディレクトリは `mkdtemp(tmpdir()/sodactl-smoke-state-)`）。`inPaneEnv = {...env, SODA_PANE_ID, SODA_SERVER_URL}`（297-298）で (1) `ask` → `unavailable`・終了コード 0、(2) `{questions: []}` → 終了コード 2、(3) pane の外で `ask --url` → 終了コード 1 と `caller_pane_unknown`。**この時点ではセッションのキャッシュが `HOME` にある**（263・270 行で作られる）ので、(1) は今は `/ws` の経路で通っている。キャッシュの無い `HOME` で打つ例は 327-332。
- F50. handoff の統合テスト・smoke（`composeServer.handoff.integration.test.ts`・`handoffSmoke.ts`）と stop のもの（`composeServer.stop.integration.test.ts`・`stopSmoke.ts`）に、`agent-report.sock` を確かめる記述は無い（grep で 0 件）。

### Q7. docs と skill

- F51. 「ask にはログインが要る」に当たる記述:
  - `docs/sodactl.md:256` — 終了コード 1 になるものの一覧に `unauthenticated`。
  - `docs/sodactl.md:273` — 「リモートのマシンの pane の中で `sodactl ask` を打つので、**リモートのマシンで `sodactl login` 済み**であることが前提（pane の環境に token は入らない。既存の sodactl と同じ）。」
  - `docs/sodactl.md:520-523` — 「認証は pane の外と同じく、利用者が `sodactl login` で保存した session cookie（`~/.sodactl`）を使う。…」（「pane の中から使う」の「接続先と認証」。全コマンド共通の記述）。
  - `docs/sodactl.md:645-646` — herdr との違い「接続先は socket のパスではなく URL（`SODA_SERVER_URL`）で、認証は利用者の login のキャッシュ（herdr の socket はファイルの権限で守られ、認証が無い）」。`docs/sodactl.md:652` — 「herdr は socket のパスでつなぐので、この確かめが要らない」。
  - `docs/machines.md:121` — 「リモートのマシンで `sodactl login` を済ませておく必要があります（pane の環境に token は入りません）。」
  - `docs/verification.md:752` — 「保存した SSH のマシン: リモートのマシンで `sodactl login` を済ませ、…」。
  - `packages/cli/skills/sodactl/SKILL.md:36-39` — `unauthenticated`・`invalid_token` で失敗したら利用者に login を頼む（全コマンド共通）。ask の節（108-128）には login の記述は無い。
- F52. 「pane の環境に token は入らない」: `docs/sodactl.md:509-510`（「pane の環境に token・cookie は入らない。」）、`docs/sodactl.md:273`、`docs/machines.md:121`、コードのコメント `paneEnv.ts:5-6`。skill は `SKILL.md:39`（「token を探しに行かない（設定ファイル・状態ディレクトリを読まない）」）・`SKILL.md:190`。
- F53. pane の環境変数の表は `docs/sodactl.md:499-503`（3 行）。ask の節は `docs/sodactl.md:217-`（対象の説明 242-243・出力 245-258・どのブラウザに出るか 260-273）。サーバ側の上限は `docs/sodactl.md:212`。`docs/verification.md` の ask の節は 734-756、Windows のパイプの既知の制約は 419-421。`sodactl help` の文面にも ask の説明がある（`packages/cli/src/main.ts:59-61`）。
- F54. skill ファイルは `sodactl skill` がそのまま出す（`packages/cli/src/skill.ts:12-16`）。`packages/cli/src/skill.test.ts` が `USAGE_LINES` と skill のコマンドの食い違いを検査する（`skill.test.ts:26-79`）。
- F55. 条項の要点:
  - `e2e-observe-browser`（`.aidev/conventions/e2e-observe-browser.md`）: E2E の合否は利用者が見る場所（ブラウザの DOM・描画・ブラウザが送受信したフレーム〔CDP〕・ブラウザが送った要求）で判定する。テスト自身の WebSocket クライアントは前提作りとサーバ側の状態の確認だけに使い、そこに届いたイベントをブラウザの反映の合図にしない。直接読めないときは何を代わりに観測したかを spec のコメントに書く。固定時間の待ちだけを根拠にしない。
  - `regression-negative-control`（`.aidev/conventions/regression-negative-control.md`）: 回帰テストは、直した箇所だけを元に戻して落ちることを確かめてから採用する（ビルドした成果物を使うテストは戻した状態でビルドし直す）。落ちたときの生の出力を `test-result.md` に貼る。落ちなければテストを書き直すか、捕まえられない理由を記録する。実装を別のコンテキストに任せたときも、この確認の出力を報告に含めさせる。

### Q8. Windows

- F56. win32 でも `startAgentReportSocket` は呼ばれ（F18）、パスは名前付きパイプ（F14）。権限の限定はしていない: 「Windows の named pipe の権限限定は別途（既知の制約。docs/verification.md の手動確認へ回す）」（`AgentReportSocket.ts:44-49`）。`docs/verification.md:419-421` に未実装として載っている。`listenUnixSocketReplacingStale` は win32 では残骸の作り直しをしない（`AgentReportSocket.ts:68`）。
- F57. 名前付きパイプの名前は `stateDir` の sha256 の先頭 16 桁から決まる（F14）ので、パイプ名を知るのに秘密は要らない（状態ディレクトリのパスが分かれば計算できる）。Node の `net.Server.listen(<パイプ名>)` が作るパイプの既定の ACL で別の利用者が繋げるかどうかは**未確認**（コード・docs に記述なし。確かめた記録も見つからなかった）。
- F58. Windows で受け口を出さない・機能を無効にしている既存の例と書き方:
  - サーバの組み立てで出さない: `if (platform() !== "win32") { handoffSocket = await startHandoffSocket(...).catch(warn → undefined) }`（`composeServer.ts:675-680`）、`bridgeEndpoint.listen` も同じ形（`composeServer.ts:682-689`）。受け口のファイルのコメントに「Windows では作らない（呼び出し側が判断する）」（`HandoffSocket.ts:13`・`BridgeEndpoint.ts:24`）。
  - 指示を受けた側が断る: `HandoffController.request` は `d.platform === "win32" || !d.hasExecve` なら `{ok:false, reason:"unsupported", message}`（`HandoffController.ts:113-121`）。`platform` は依存として渡す（`composeServer.ts:488`）。
  - CLI が断る: `runHandoff` は `deps.platform === "win32"` で `ConfigError`（終了コード 2。`packages/server/src/handoff/handoffCommand.ts:82-87`）、`stopSession` は `StopFailure("unsupported_platform", …, 2, 案内)`（`packages/server/src/stop/stopCommand.ts:116-123`）、`runBridge` は stderr に 1 行出して 2 を返す（`packages/server/src/machine/bridgeCommand.ts:34-37`）。
  - 案内の文言を出さない: `sessionStopCommandFor` は win32 で `undefined`（`namedSession.ts:62`）。
  - smoke は Windows では何もせず成功（`handoffSmoke.ts:142`・`stopSmoke.ts:180`・`machineSmoke.ts:192`）。
  - どれも platform を引数・依存で受けてテストで差し替えられる形（`config.ts:82` の `os` 引数・`paneEnv.ts:53` の `platform` 引数）。

## 影響範囲

- サーバ: `packages/server/src/composeServer.ts`（受け口の起動・停止・起動失敗時の後始末・`SessionService` へ渡すパス）、`packages/server/src/config.ts`（パスの決め方・長さの検査）、`packages/server/src/session/paneEnv.ts` と `SessionService.ts`（環境変数を足すなら `PaneEnvManaged`・`PANE_ENV_DROPPED`・`envForPane`・`commandEnv`）、`packages/server/src/ask/AskService.ts`（持ち主の数え方・取り消しの入口を変えるなら）。新しい受け口のファイルの置き場は未定（既存は `agent/`・`handoff/`・`machine/`）。
- sodactl: `packages/cli/src/commands/ask.ts`（経路の選択）、`packages/cli/src/cliArgs.ts`（`GlobalOpts`。URL を明示したかの印が要るなら `globalOptsFrom`）、新しい接続のコード（本体に socket のクライアントは無い。F40）、`packages/cli/src/main.ts` の help の文面。
- プロトコル: `packages/protocol/src/errors.ts`（受け口の code を `ErrorCode` に足すなら）、受け口のやりとりの型の置き場（未定）。
- テスト: `AskService.test.ts`・`ask.integration.test.ts`・`ask.test.ts`・`paneEnv.test.ts`・`paneEnv.integration.test.ts`・`config.test.ts`・`packages/cli/src/smoke.ts`（F49: いまの ask の smoke はキャッシュがある状態）・`packages/e2e/src/support/ask.ts`（F47: 必ず token を渡す）。
- docs／skill: F51〜F53 の行、`docs/tls-setup.md:463-466`（パスの上限の説明が `agent-report.sock` を名指し）、`packages/cli/skills/sodactl/SKILL.md`（4 本目の smoke が `sodactl skill` の出力と比べる）。
- 触れないもの: ブラウザ側（`AskDialog.vue`。表示は `paneId` から作るので経路に依らない。F10）、`agent-hook-report.cjs`（既存の hook の動きは変えない。要件の対象外）。

## 実現性 / リスク

- 実現性: `AskService.open` は第 1 引数が文字列の持ち主であればよく（F2・F3）、`/ws` 以外から呼んでいる既存の形（固定の clientId で `surface.invoke`。F8）もある。unix socket の起動・残骸の置き換え・0600・停止・handoff 後の立て直しは既存の 3 つの受け口に前例がある（F12〜F22）。
- R1（取り消しの入口）: 持ち主が質問を取り消す公開 API は `onClientGone(clientId)`（その持ち主の質問を全部閉じる）だけ（F4）。受け口の接続が切れたときにその 1 件だけを閉じるには、接続ごとに別の持ち主の文字列にするか、API を足す必要がある。持ち主の文字列を全接続で共通にすると「接続あたり 8」が受け口全体で 8 になる（F3）。
- R2（パスの長さ）: 起動時の長さの検査は `agent-report.sock`（17 バイト）だけを測る（F15）。それより長いファイル名の socket を足すと、検査を通ったのに listen が失敗する状態ディレクトリがありうる。
- R3（起動失敗の扱いの違い）: `agent-report.sock` は立てられないと起動が失敗し、`handoff.sock`・`bridge.sock` は warn で続ける（F18）。新しい受け口がどちらに倣うかで、`pane の環境にパスが入っているのに受け口が無い` 状態の有無が変わる（パスは組み立て時に環境へ入る。F19）。
- R4（0600 までの窓）: listen の後に chmod する形（`AgentReportSocket`・`HandoffSocket`）は、状態ディレクトリを読める別の利用者が繋げる窓がある（状態ディレクトリは mode の指定なしで作る。F22・F23）。窓を作らない既存の形は `BridgeEndpoint` だけ。
- R5（handoff 済みの古い pane）: handoff の前から動いている pane の環境は変えられない（F29）。新しい環境変数で受け口の場所を知らせると、版を上げて handoff した後の既存の pane にはその変数が無い。既存の変数（`SODA_AGENT_REPORT_SOCKET` のパス・`SODA_SERVER_URL`）は古い pane にもある。
- R6（handoff の最中）: handoff は `/ws` を閉じてから execve するが、3 つの socket は閉じない（F21）。受け口の接続で待っている質問は、execve でプロセスが入れ替わると接続ごと切れる。sodactl 側は「結果が出る前に接続が切れた」を今は `connection_closed`（終了コード 1）にしている（F31）。handoff の準備に失敗して元に戻った場合、`/ws` 経由の質問は取り消し済み（F11）だが受け口経由の質問は残る、という差が出る。
- R7（Windows）: 名前付きパイプを同じ利用者に限る実装は無く、既定の ACL も未確認（F56・F57）。
- R8（古いサーバとの見分け）: 受け口が無い古いサーバでは、新しい環境変数は pane に入らない。既存の `agent-report.sock` に相乗りする場合、古いサーバは返事を書かず `end` まで待って黙って捨てる（F12）ので、sodactl からは「返事が来ないまま接続が閉じる」ように見える（推測: 4096 バイトを超える定義では途中で `destroy` される）。
- R9（`not_found` の二義）: `/ws` では「知らない方式」と「pane が無い」が同じ `not_found`（F38）。AC14 の「受け口がその操作を知らない」を見分けるには、別の code か、code 以外の印が要る。
- R10（URL を明示したかの判定）: `GlobalOpts` からは明示したかどうかが分からない（F34）。今の歯止めは「origin が一致するか」で、明示していても同じ origin なら通る（F35）。AC8 の「明示しているときは受け口を使わない」をどちらの基準で判定するかで結果が変わる。
- R11（既存のテストが新しい経路を通らない）: E2E は token を必ず渡し（F47）、smoke の ask はキャッシュがある状態（F49）、単体は `withSession` を丸ごと偽物にしている（F39）。受け口を優先する実装にすると、これらは環境変数の与え方次第で黙って経路が変わる（`runAsk` の E2E は `SODA_SERVER_URL` を与えるが socket の変数は与えていない）。

## 実装アンカー

- A1. `packages/server/src/ask/AskService.ts:100` `AskService.open` — 質問を出す入口。検査の順と上限（F2・F3）。
- A2. `packages/server/src/ask/AskService.ts:159` `AskService.onClientGone` — 持ち主の質問を閉じる唯一の入口（F4）。`:152` `cancel` は画面の購読者専用。
- A3. `packages/server/src/ask/AskService.ts:202` `close`（private） — 質問を閉じる 1 か所（台帳から外す・`ask.closed`・resolve）。
- A4. `packages/server/src/surface/methods/ask.ts:12` `registerAskMethods` — `/ws` の `ask.open` が `asks.open(ctx.clientId, params)` を呼ぶ。
- A5. `packages/server/src/composeServer.ts:317` `asks = new AskService(...)` — 組み立て。`:412-417`・`:422-428` 切断時の `asks.onClientGone`。`:756` `asks.dispose()`。
- A6. `packages/server/src/composeServer.ts:238` `agentReportSocketPath` — パスを決めて `:253` で `SessionService` へ渡す。`:436` 変数の宣言。
- A7. `packages/server/src/composeServer.ts:619-627` `listen()` の 2.5 — `startAgentReportSocket` の起動。`:673-689` handoff・bridge の受け口の起動（win32 以外・失敗は warn）。
- A8. `packages/server/src/composeServer.ts:704-706` — 起動失敗時の受け口の後始末。`:731`・`:750-751`・`:766-770` — `close()` での受け口の停止。
- A9. `packages/server/src/composeServer.ts:448-477` `HandoffController` の依存 `pausePollers`／`resumePollers`／`closeClients`／`reopenClients` — handoff の間に止める・戻すものの一覧。
- A10. `packages/server/src/agent/AgentReportSocket.ts:23` `startAgentReportSocket` — 既存の受け口（1 接続 1 メッセージ・返事なし）。`:64` `listenUnixSocketReplacingStale` — 残骸の置き換え（`HandoffSocket` も使う）。`:44-50` chmod と Windows の既知の制約のコメント。
- A11. `packages/server/src/handoff/HandoffSocket.ts:49` `startHandoffSocket` — 1 行の JSON を読んで返事を書く受け口。`:59-72` 行の読み方と上限、`:75-83` chmod に失敗したら置かない、`:92` `handleLine`（知らない op の返事 `:113-117`）。
- A12. `packages/server/src/machine/BridgeEndpoint.ts:91` `BridgeEndpoint.listen` — 0700 の一時ディレクトリ → 0600 → rename。`:126` `close`（socket のファイルを自分で消す `:155-158`）。
- A13. `packages/server/src/config.ts:82` `agentReportSocketPathFor` — unix のパスと Windows のパイプ名。`:91` `maxUnixSocketPathBytes`。`:156-167` 起動時の長さの検査。
- A14. `packages/server/src/persist/namedSession.ts:45` `resolveSessionStateDir` — session ごとの状態ディレクトリ。
- A15. `packages/server/src/session/paneEnv.ts:14` `PANE_ENV_DROPPED`、`:31` `PaneEnvManaged`、`:50` `buildPaneEnv`（`:65-69` で入れる）。
- A16. `packages/server/src/session/SessionService.ts:1158` `envForPane`、`:763` `commandEnv`、`:113` オプション `agentReportSocketPath`（`:149`・`:201` で保持）。
- A17. `packages/server/src/surface/ControlSurface.ts:33` `invoke` — 知らない方式・schema 違反・`RpcError`・想定外の例外を code に揃える既存の形。
- A18. `packages/server/src/handoff/HandoffController.ts:113-121` — Windows／execve なしを `unsupported` で断る形。`:186-242` handoff の手順。
- A19. `packages/cli/src/commands/ask.ts:80` `runAsk`、`:100` `requestAsk`、`:60` `readAskSpec`、`:20` `AskDeps`、`:16` `ASK_REQUEST_SLACK_MS`。
- A20. `packages/cli/src/cliArgs.ts:307` `globalOptsFrom`（`url`・`token`・`caller` の決め方）、`:118` `GlobalOpts`、`:113` `CallerPane`、`:378-384` `case "ask"`、`:966-969` `--machine` と ask。
- A21. `packages/cli/src/paneTarget.ts:15` `resolveCallerPane`、`packages/cli/src/selfGuard.ts:39` `selfPaneId`（`:23` `serverKeyOf`）。
- A22. `packages/cli/src/withSession.ts:15` `withSession`、`:13` `UnauthenticatedError`、`:26-32` 未ログインの投げ方。
- A23. `packages/cli/src/output.ts:117` `reportAndExit`、`:94` `classify`。`packages/cli/src/wsClient.ts:27` `RpcFailure`。`packages/cli/src/main.ts:81` `case "ask"`、`:59-61` help の ask の文面。
- A24. `packages/protocol/src/ask.ts:79` `AskResult`、`:153` `normalizeAskSpec`、`:10-32` 上限の定数、`:86` `unsupportedTypeReason`。`packages/protocol/src/messages.ts:393` `AskOpenParams`。
- A25. `packages/protocol/src/errors.ts:2` `ErrorCode`（ask は `:84-86`）、`:93` `RpcError`。
- A26. `packages/server/assets/agent-hook-report.cjs:52-63` — Node から受け口へ繋ぐ既存のクライアント（`net.connect(sock)`・1 秒で諦める）。
- A27. テスト: `packages/server/src/agent/AgentReportSocket.test.ts:9-32`（一時ディレクトリと socket の送り方）、`packages/server/src/ask/ask.integration.test.ts:45-88`（実物のサーバと `/ws` のクライアント）、`packages/cli/src/commands/ask.test.ts:53-74`（偽のクライアントと `vi.mock`）、`packages/server/src/session/paneEnv.test.ts:46`（token が入らない）、`packages/cli/src/paneEnv.integration.test.ts:148`（実物の pane の環境を読む）、`packages/server/src/config.test.ts:121-123`（パスの長さ）。
- A28. E2E: `packages/e2e/src/support/ask.ts:32` `runAsk`（sodactl の起動と環境）、`:61` `watchAskSubscriptions`。`packages/e2e/src/specs/ask-form.spec.ts:40`（一巡）・`:121`（定義の誤り・pane の外）・`:194`（SIGINT）。
- A29. smoke: `packages/cli/src/smoke.ts:313-323`（ask）、`:297-298`（`inPaneEnv`）、`:327-332`（キャッシュの無い HOME）。`.aidev/config.yml` の `smokeCommands` 2 本目・4 本目。
- A30. docs: `docs/sodactl.md:212`・`217-273`・`499-510`・`520-523`・`645-652`、`docs/machines.md:118-121`、`docs/verification.md:419-421`・`734-756`、`docs/tls-setup.md:463-466`、`packages/cli/skills/sodactl/SKILL.md:32-39`・`108-128`・`190`。
- A31. 「受け口に操作を登録する」に当たる既存の仕組み — 未特定（`/ws` の `ControlSurface.register` はあるが、ローカルの socket に操作を登録する仕組みは無い。`HandoffSocket` は `op` の if 分岐）。
- A32. Windows の名前付きパイプに ACL を付けるコード — 未特定（リポジトリに無い）。

## 実装時の注意

- `AskService.open` の (1)〜(5) の誤りは**同期の throw**（F2）。`asks.open(...)` を `try` の外で呼んで `.catch` だけ付けると拾えない（`ControlSurface.invoke` は `await def.handler(...)` を `try` の中に置いているので拾えている）。
- `open` は `timeoutMs`・`paneId` の型・`spec` がオブジェクトかを検査しない（F5）。`/ws` では zod の `AskOpenParams` が先に見ている。別の入口から呼ぶなら同じ検査が要る（`timeoutMs` が範囲外だと `setTimeout` の挙動に任される）。
- `open` は askId を返さない（F4）。持ち主の側から 1 件だけ閉じる手段は今は無い。
- `not_found` は `/ws` で「知らない方式」と「pane が無い」の両方に使われている（F38）。`docs/machines.md:120-121`・`docs/sodactl.md:256-257` はこの二義を前提に書かれている。
- pane の環境に変数を足すときは、`buildPaneEnv` の設定と `PANE_ENV_DROPPED` の両方に足す（F26）。`commandEnv`（独自コマンドの popup・裏での実行）は `SODA_PANE_ID` を入れないことがある（F25）。
- `agentReportSocketPath` は受け口を立てる前に pane の環境へ入ることが決まる（F19）。受け口の起動に失敗しても起動を続ける形にすると、環境のパスの先に受け口が無い状態がありうる（`SessionService.ts:109-112` のコメントは「未設定なら渡さない」と書くが、今の `composeServer` は常に渡す）。
- unix socket のパスの上限の検査は `agent-report.sock` のパスだけ（F15）。`docs/tls-setup.md:463-466` の「42 文字の名前まで通る」もこのファイル名が前提。
- `close()` の順序: `agentReportSocket` は早く閉じ、`handoffSocket` はロックを放す直前（F20）。`asks.dispose()` は finally の中（接続を閉じた後）。受け口の接続を残したまま `server.close()` を待つと、接続が生きている間はコールバックが呼ばれない（`composeServer.ts:747-748` のコメントが `/ws` について同じ注意を書いている。`BridgeEndpoint.close` は socket を `end` → 500ms で `destroy` してから `server.close` を待つ。`BridgeEndpoint.ts:126-154`）。
- handoff は socket を閉じずに execve する（F21）。元に戻す経路（`rollback`）では受け口は開いたまま。
- ログに定義・回答の中身を書かない（`AskService` の `logger` は askId・paneId・件数・結果の種類だけ。`AskService.ts:42`。統合テスト `ask.integration.test.ts:187` が `server.log` を調べる）。
- sodactl が送る定義は「読んだままのオブジェクト」で、正規化はサーバが行う（F31）。知らない項目もそのまま送られる。
- sodactl の ask は、対応していない型の定義では**接続せずに** `unavailable` を出し、定義の誤りでも接続しない（F30。テスト `ask.test.ts:105-125`）。pane の外では標準入力を読む前に `caller_pane_unknown`（`ask.ts:82-86`）。この順序は E2E（`ask-form.spec.ts:121`）と smoke（`smoke.ts:319-322`）が見ている。
- `ask.test.ts` は `withSession` をモジュールごと偽物にしている（F39）。経路の選択を `runAsk` の中に足すと、既存のテストは新しい接続のコードを差し替えないまま通ってしまうか、実物の socket へ繋ぎに行く。
- E2E の `runAsk` と smoke は、サーバを起動したプロセスの環境をそのまま子へ渡す（`...process.env`。F47・F49）。開発者が soda の pane の中でテストを走らせると、その pane の `SODA_*`（別のサーバの受け口のパスを含む）が子へ渡る（`SODA_PANE_ID`・`SODA_SERVER_URL` は上書きしているが、`SODA_AGENT_REPORT_SOCKET` は上書きしていない）。
- skill ファイルを変えたら、4 本目の smoke（`sodactl skill | cmp`）と `skill.test.ts`（コマンドの一覧との食い違い）が見る（F48・F54）。
- Windows の環境変数は大文字小文字を区別しない（`paneEnv.ts:55`）。Windows の名前付きパイプ名は `\\.\pipe\…` で、ファイルの権限・`chmod`・`unlink` の話が当てはまらない（F56）。
- テストの一時ディレクトリは `os.tmpdir()` の下（F45）。macOS の `tmpdir()` は長い（推測）ので、socket のファイル名を長くすると 103 バイトに近づく。
- 条項: E2E を書くなら合否はブラウザ側の観測と sodactl の stdout／終了コードで見る（F55。既存の `ask-form.spec.ts` の冒頭のコメントが同じ方針）。不具合を直して回帰テストを足したら、修正前で落ちることを確かめる。

## design への申し送り

判断はしない。未確定のまま残ったものを並べる。

- 新しい socket か、`agent-report.sock` への相乗りか。相乗りの場合の事実: 既存は返事なし・`end` で処理・4096 バイトで `destroy`（F12）、古いサーバは黙って捨てる（R8）、起動時の長さの検査と docs は既にこのパスを前提にしている（F15・F16）、古い pane の環境にもこのパスがある（R5）。新しい socket の場合の事実: 長さの検査の対象が増える（R2）、新しい環境変数は handoff 済みの古い pane に無い（R5）。
- 受け口の場所の知らせ方（新しい環境変数／既存の変数から決める）。`SODA_SERVER_URL` からは状態ディレクトリが分からない。既存の変数でパスを持つのは `SODA_AGENT_REPORT_SOCKET` だけ（F25）。
- 回答待ちの持ち主の数え方（R1）: 接続ごとに別の持ち主にするか、共通にするか、`AskService` に API を足すか。「接続あたり 8」の扱い（AC4 の未確定事項）。
- 受け口の接続が切れたときの取り消しの実装の口（`onClientGone` を使うか、askId を返す形に変えるか）。
- 受け口の起動に失敗したときに起動を続けるか（R3）、0600 までの窓をどう扱うか（R4。3 通りの前例。F22）。
- 停止・handoff での扱い: `close()` のどの時点で閉じるか（F20）、handoff の `closeClients`／`reopenClients` に入れるか（R6）、handoff で接続が切れた sodactl が何を返すか（今の `/ws` の経路は `connection_closed`）。
- 「受け口がその操作を知らない」の code と、古いサーバ（受け口はあるが返事が無い／受け口が無い）の見分け方（R8・R9）。`ErrorCode` に足すか、受け口専用の型にするか（F43・F44）。
- やりとりの形（1 接続 1 要求か多重か・行の上限〔定義は 256 KiB まで。既存の 2 つの受け口は 4096〕・すぐ返る操作と待つ操作）。前例は `HandoffSocket`（1 接続 1 行・返事あり）と `BridgeEndpoint`（多重）。
- 操作の登録の仕組みの置き場と、`paneId` の渡し方（受け口は接続元の pane を自分では確かめられない——接続元が名乗る `paneId` を `paneExists` で実在だけ確かめるのが今の ask と同じ扱い。F2）。
- `--url`／`SODACTL_URL` を「明示している」の判定基準（R10）: `GlobalOpts` に印を足すか、今の origin の一致で見るか。`--machine local`・`SODA_SERVER_URL` が無い待ち受け（F34）で受け口を使うかも未定。
- `/ws` へ落ちたことを利用者に知らせるか（要件の未確定事項のまま）。
- Windows: 名前付きパイプの既定の ACL は未確認（F57）。出さない場合の書き方の前例は F58。出さないなら pane の環境にも場所を入れない、で揃うかどうか。
- テストの組み方: ログインなしの経路を通す E2E・smoke の環境の作り方（F47・F49・R11）、AC5（ほかの利用者が繋げない）を自動で確かめる方法（既存の受け口に権限のテストは無い。F45）、AC13 のテスト用の操作をどこに登録するか。
- docs の書き換えの範囲: ask だけがログイン不要になるので、全コマンド共通の記述（`docs/sodactl.md:520-523`・`SKILL.md:36-39`）は残り、ask 固有の記述（`docs/sodactl.md:256`・`273`、`docs/machines.md:121`、`docs/verification.md:752`）が対象になる。herdr との違いの節（`docs/sodactl.md:645-652`）の扱いは未定。
