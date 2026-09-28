# research: 端末版の起動・接続・認証（cli-mode）

調査日 2026-09-28。対象ブランチ feature/cli-mode（HEAD 28dd4da）。パスは断りが無ければ `packages/server/src/` からの相対。
`[H]` は herdr のソース（`/workspaces/sodashitsu/scratchpad/herdr/src/`）。`[実測]` は一時の `--state-dir`・乱数ポートで実際に起動して確かめたもの（後始末済み）。

---

## 1. いまの `soda` CLI

### 1.1 コマンドと引数なしの挙動

- コマンドの型: `serve | token-reset | session-list | session-delete | session-stop | handoff | handoff-preflight | bridge | machine | help`（`cliArgs.ts:6`）。
- **引数なし・`help`・`--help`・`-h` は help**（`cliArgs.ts:49`）。未知のコマンドは `ConfigError`（終了コード 2）（`cliArgs.ts:64`・`main.ts:164-168`）。
- 隠しコマンド `__handoff-preflight`（`cliArgs.ts:28,51-57`）。`machine` は専用の解釈（`cliArgs.ts:59-62`）、`bridge` も専用（`cliArgs.ts:63,212-227`）。
- 振り分けは `main.ts:137-162`。help の本文は `main.ts:20-34`（USAGE は `cliArgs.ts:30-31`）。
- → 端末版を引数なしに割り当てるには `cliArgs.ts:49` の `command === undefined` を新しいコマンド（例 `"tui"`）に変え、`help` 系だけを help に残す。引数なしで `--session`・`--state-dir` を受けるには、先頭がオプション（`-` 始まり）のときも端末版として解釈する分岐が要る（いまは `--session` が先頭だと `unknown command: --session`＝`cliArgs.ts:64`）。

### 1.2 状態ディレクトリの決まり方

- 既定: Linux/macOS は `$XDG_STATE_HOME/sodashitsu`（無ければ `~/.local/state/sodashitsu`）、Windows は `%LOCALAPPDATA%\sodashitsu`（`config.ts:66-73`）。
- `--state-dir` が「session の根」。名前付き session は `<根>/sessions/<名前>`、`default`・指定なしは根そのもの（`persist/namedSession.ts:45-49`、`config.ts:153-155`）。
- `--session` が無ければ環境変数 `SODA_SESSION`（serve・token reset・handoff だけ。`cliArgs.ts:162-180`、`main.ts:137`）。`session list/delete/stop`・`bridge` は `SODA_SESSION` を見ない（`cliArgs.ts:160`・`cliArgs.ts:208-211`）。
- Unix では `agent-report.sock` のパス長（Linux 108 バイト）で弾く（`config.ts:156-167`）。[実測] scratchpad の長いパスでは `soda serve` が起動できなかった（121 バイト）→ 端末版が新しい socket を置くなら同じ制約を受ける。

### 1.3 状態ディレクトリの中身と権限（[実測] Linux）

| ファイル | 内容 | 権限 | 根拠 |
|---|---|---|---|
| ディレクトリ本体 | — | **0755**（umask 次第。mode 指定なしの `mkdir`） | `persist/StateDirLock.ts:186`・`persist/atomicFile.ts:356`、[実測] |
| `soda.lock` | 1 行目 pid・2 行目ホスト名 | 0600（`open(...,"wx",0o600)`） | `persist/StateDirLock.ts:87,235,241` |
| `auth.json` | token の scrypt ハッシュ＋salt、セッション id の sha256 ハッシュ（**平文の token・cookie は無い**） | 0600 | `persist/AuthFile.ts:5-20,43-55`、`auth/AuthService.ts:126-131,143-152` |
| `serve.json` | pid・hostname・port・https・host・savedAt（秘密なし） | 0600 | `persist/ServeRecordFile.ts:10-37` |
| `session.json`・`integrations` 等 | 構成 | 0600（`writeFileAtomic`） | `persist/atomicFile.ts:354-367` |
| `server.log` | ログ | **0644**（`appendFile` の既定） | `log/Logger.ts:54`、[実測] |
| `agent-report.sock` | フック報告 | 0600（Windows は named pipe・権限は絞っていない） | `agent/AgentReportSocket.ts:43-50`、`config.ts:82-88` |
| `handoff.sock` | **制御の socket**（handoff/status/stop） | 0600（listen の後に chmod） | `handoff/HandoffSocket.ts:15,75-83` |
| `bridge.sock` | 中継の受け口（下の 2.3） | 0600（0700 の一時ディレクトリで listen→chmod→rename） | `machine/BridgeEndpoint.ts:26,91-123` |
| `images/` | 貼り付け画像 | 0700 / 各 0600 | `image/ImageStore.ts:86,163,179-183` |

- 0600 は Windows では効かない（`persist/atomicFile.ts:351-352,361-363`：「保存場所（%LOCALAPPDATA% 等）で代える」）。
- 止めると `soda.lock`・3 つの socket は消え、**`serve.json` は残る**（[実測]。「止まっても消さない」`persist/ServeRecordFile.ts:6`）。

### 1.4 URL・ポートの決まり方と記録

- 既定 `127.0.0.1:7780`（`config.ts:9-14,137-138`）。非ループバックは `--cert/--key` 必須（`config.ts:141-146`）。
- 名前付き session で `--port` が無ければ前回の `serve.json` のポート（`composeServer.ts:633-637`）。既定の session は常に 7780（`composeServer.ts:631`）。
- 待ち受けの後に `serve.json` を書く（`composeServer.ts:489-491`）。実際のポートは `server.address()` から（`composeServer.ts:484-486`）。
- pane の `SODA_SERVER_URL` は `paneServerUrl`（ワイルドカードならループバックへ）（`composeServer.ts:487`、`util/net.ts:121-126`）。
- **「動いているサーバの接続先」を信じてよい条件は既にある**: `soda.lock` の持ち主（生きている・同じホスト）と `serve.json` の pid・hostname が一致するときだけ（`persist/namedSession.ts:118-149`。ブラウザの `server.sessions` の `endpoint`）。端末版の「動いているか・どこへ繋ぐか」はこれをそのまま使える。

### 1.5 `listen()` の段と「使える」までの窓（`composeServer.ts:433-573`）

0. `soda.lock` を取る（`:437-444`）→ 0'. auth.json を読む（`:471`）→ 1. bind（`:476-482`）→ 1''. `serve.json`（`:489`）→ 2. token（初回だけ作る `:493-494`）→ 2.5 agent-report.sock（`:497`）→ 3. 復元（`:505-529`）→ 4. poller → 4.5 `handoff.sock`（Windows 以外 `:539-544`）→ 4.6 `bridge.sock`（Windows 以外 `:546-553`）→ **5. `/ws` を受け付け始める `setReady(true)`（`:556`）**。
- それまでの `/ws` は 503（`ws/WsServerWs.ts:117-123`）。つまり **lock と serve.json が見えても、まだ繋げない時間がある**（復元＝全 pane のシェル起動の間）。
- 準備完了の目印として使えるもの: (a) `bridge.sock`・`handoff.sock` が現れて connect できる（Linux。どちらも復元の後に置かれる）、(b) `/ws` の upgrade が 503 でなくなる（全 OS）。

### 1.6 `soda token reset`

- `soda.lock` を取ってから `auth.json` を作り直す。**動いている間は断る**（終了コード 2）（`sessionCommands.ts:69-114`、`config.ts:249-260`）。理由: 動いているサーバは token をメモリに持ち auth.json を読み直さない（`sessionCommands.ts:71-73`）。
- `resetToken` は全セッションを失効させる（`auth/AuthService.ts:115-124`）。

### 1.7 動いているサーバの検出（`session list`・`session stop`）

- `session list`: 各 session の `soda.lock` を読み取り専用で `inspect`（`persist/namedSession.ts:81-89,102-116`、`persist/StateDirLock.ts:208-212`）。生死は `process.kill(pid,0)`（EPERM も生きている）（`persist/StateDirLock.ts:125-132`）、別ホストは使用中とみなす（`:265-274`）。
- `session stop`: `handoff.sock` に `{"op":"stop"}` → 返事の pid と `soda.lock` の持ち主を突き合わせ → lock が消えるまで待つ。**シグナルは送らない**（`stop/stopCommand.ts:17-24,163,240`）。Windows は非対応（`stop/stopCommand.ts:115-121`、`.aidev/works/20260927-session-stop/decisions.md:21-40`）。
- 制御の socket の受け付け（`handoff/controlRequests.ts:34-80`、`handoff/HandoffSocket.ts:92-126`）。

---

## 2. 認証

### 2.1 ブラウザと sodactl の経路

- token: 24 バイト乱数の base64url。保存は scrypt ハッシュだけ（`auth/AuthService.ts:10,126-131`）。**作ったときに一度だけ標準出力へ表示**（`main.ts:46-57,97-118`、`startupBanner.ts:48-52`）。
- `POST /api/login {token}` → Origin/Host の検査（`http/HttpServer.ts:110-116`）→ scrypt 照合 → 204 と `Set-Cookie: soda_session[_<名前>]=<id>; HttpOnly; SameSite=Strict; Max-Age=14日`（`http/HttpServer.ts:103-134`、`auth/AuthService.ts:13,23-25,135-154,222-227`）。失敗は rate limit（`http/HttpServer.ts:105-109,126`）。
- `/ws` の upgrade: パスが `/ws` → Origin/Host の検査（403）→ 起動中は 503 → Cookie の検証（401）→ `?machine=` の分岐（`ws/WsServerWs.ts:101-153`、`auth/AuthService.ts:86-90`）。
- sodactl: `--url`→`SODACTL_URL`→`SODA_SERVER_URL`→`http://127.0.0.1:7780`、token は `--token`/`SODACTL_TOKEN`（`packages/cli/src/cliArgs.ts:61,227-240`）。cookie を `~/.sodactl/session.json`（0600・ディレクトリ 0700・origin ごと）にキャッシュ（`packages/cli/src/session.ts:5-8,25-27,90-102`）。キャッシュが 401 なら token で 1 回だけ再ログイン（`packages/cli/src/withSession.ts:15-36`）。
- **pane の中の sodactl も token を持たない**: サーバは `SODACTL_TOKEN` を pane へ渡さず（`session/paneEnv.ts:5-6,14-20`）、pane の sodactl は利用者が事前に `sodactl login` した cookie を使う（`docs/sodactl.md:386-389`）。つまり **token なしで繋がる「pane 用の特別な経路」は HTTP 側には無い**。

### 2.2 Origin/Host の検査（Node の WS クライアントが満たす条件）

- 許可ホスト: `localhost`・`127.0.0.1`・`::1` の `:<port>`、`--host` そのもの、ワイルドカードなら全インタフェースの IP とホスト名（`auth/OriginPolicy.ts:33-59`）。
- `isAllowed`: Origin が `--origin` に一致、または Host が許可ホストで Origin が `<scheme>://<Host>` と一致（`auth/OriginPolicy.ts:61-69`）。Origin が無ければ拒否。
- sodactl は URL から `origin`・`host` ヘッダを自分で組んで送る（`packages/cli/src/wsClient.ts:225-229`、`packages/cli/src/httpAuth.ts:8-14`）。端末版も同じにすれば、ループバックの URL では常に通る。
- hello の `kind`: `desktop | mobile | external`（`packages/protocol/src/messages.ts:19-25`）。大きさを決められるのは `desktop`（または fit）だけ（`clients/SizeAuthority.ts:56`）。**端末版は `desktop` で hello する必要がある**（sodactl は `external`）。

### 2.3 既存の「同じ利用者なら認証済み」の経路 ＝ `bridge.sock`

- `machine/BridgeEndpoint.ts:19-25`: 「**受け口に繋がった接続は認証済みとして扱う**（繋げるのは状態ディレクトリを読める同じ利用者だけ。token はハッシュでしか保存されず読めない）」。0600 になってから見える場所に置く（`:86-123`）、0600 にし終える前の接続は捨てる（`:62-63,92-96`）。
- 1 本の socket の上にチャネルを多重化し、各チャネルを `/ws` の 1 接続（`WsConnection`）として 2 つ目の `WsGateway` に渡す（`composeServer.ts:323-331`、`machine/BridgeEndpoint.ts:204-226,272-361`）。枠: 目印 `SODA-BRIDGE 1\n`＋HELLO、OPEN/CLOSE/TEXT/BINARY/PING/PONG（`machine/bridgeFrames.ts:12-17`）。
- セッション id は固定の `"bridge"`（失効の対象にならない。`machine/BridgeEndpoint.ts:32-33`）。
- `soda bridge` は stdin/stdout と `bridge.sock` を素通しで繋ぐだけ（`machine/bridgeCommand.ts:5-10,29-77`）。
- **制約**:
  - Windows では置かない（`composeServer.ts:545-553`、`machine/bridgeCommand.ts:34-37`、`.aidev/works/20260927-multi-host-machines/decisions.md:43`）。
  - OPEN の枠に行き先が無く、`?machine=` の中継は `WsServerWs` の router の中だけ（`ws/WsServerWs.ts:129-147`、`composeServer.ts:298-314`）→ **`bridge.sock` 経由ではほかのマシンへ行けない**（行くなら OPEN に selector を足す等の拡張が要る）。
- herdr も同じ方式: クライアント用 socket `herdr-client.sock` は 0600 だけが根拠で token は無い（`[H]server/socket_paths.rs:11-12,72-75`、`[H]server/headless.rs:319-322`）。Windows は named pipe に DACL `D:P(A;;GA;;;SY)(A;;GA;;;OW)`（SYSTEM と所有者だけ）を作成時に付ける（`[H]ipc.rs:134-162`）。

### 2.4 Windows で「同じ利用者だけ」を作る難しさ（既存の判断）

- Node の `net.Server` は named pipe の DACL を指定できない（広げる `readableAll`/`writableAll` しか無い）。既存の work はこれを理由に Windows の制御の socket を見送った（`.aidev/works/20260927-session-stop/decisions.md:36-37`）。
- agent-report の named pipe は権限を絞っていない（既知の制約。`agent/AgentReportSocket.ts:44-46`）。
- 同 decisions の (d)「状態ディレクトリに専用の秘密を置き HTTP で使う」は Windows でも使えるが、置き場の ACL を確かめる必要がある、として見送り（`.aidev/works/20260927-session-stop/decisions.md:33-35`）。

### 2.5 端末版がトークンを打たずに手元のサーバへ繋ぐ方式の候補

前提: token は平文で残らない（`auth/AuthService.ts:126-131`）ので「token をファイルから読む」は不可。

| 案 | 仕組み | Linux/WSL2 | Windows ネイティブ | `?machine=` | TLS | 備考 |
|---|---|---|---|---|---|---|
| **A. `bridge.sock` を直接使う** | 端末版が `bridge.sock` へ connect し、枠でチャネルを開く（`soda bridge` の相手側と同じ実装） | ◎ 既存（0600＝同じ利用者） | ✕ 無い | ✕（OPEN に selector を足す拡張が要る） | 不要（HTTP を通らない） | 新しい口を作らない。サーバ変更は最小。ブラウザの失効（token reset）でも切れない（`"bridge"`）|
| **B. ローカル専用の socket（新設 `client.sock`）で WS 相当** | herdr の `herdr-client.sock` と同型。A と同じ権限の根拠で、行き先（machine）付きの OPEN を持つ | ◎ | ✕（同上） | ◎（設計しだい） | 不要 | A の拡張版。`bridge.sock` と口が 2 つになる |
| **C. ローカルの秘密ファイル＋HTTP でログイン** | サーバが起動ごとに乱数の秘密を `<state>/local-auth`（0600）に書き、端末版が読んで `POST /api/local-login` 等で通常の cookie を得る → 以後は `/ws`（`?machine=` 含む）をブラウザと同じに使う | ◎ | △ `%LOCALAPPDATA%` 既定の ACL（所有者・SYSTEM・Administrators）に頼る。`--state-dir` を任意の場所にした場合は保証できない→ACL を確かめる（`icacls` 相当）か、Windows だけ C を許す等の判断が要る | ◎ そのまま | loopback でも https なら証明書に 127.0.0.1 が要る（`docs/sodactl.md:384-386`） | 経路が 1 本（ブラウザと同じ `/ws`）で、multi-host も失効もそのまま効く。**新しい HTTP の口がネットワークに出る**（秘密を知らなければ通らないが、LAN に出したサーバでは攻撃面が増える→ループバックからの要求だけ受ける等で絞る） |
| D. 制御の socket（`handoff.sock`）に「セッションを発行」の op を足す | 0600 の socket で cookie（セッション id）を払い出し、以後は HTTP の `/ws` | ◎ | ✕ | ◎ | C と同じ | `handoff.sock` の役割がさらに増える。Windows は C と同じ問題 |
| E. sodactl のキャッシュ cookie（`~/.sodactl/session.json`）を流用 | 既に login 済みなら使う | ○ | ○ | ◎ | C と同じ | 初回は token が要る（要件「token を毎回入れさせない」は満たすが「一度も入れない」は満たさない）。origin の文字列一致が要る（`packages/cli/src/session.ts:29-37`）|

所見:
- Linux/WSL2 だけなら **A/B が既存の信頼の根拠（0600・状態ディレクトリ）を再利用でき最も安全**（新しいネットワークの口ゼロ・TLS 不要・herdr と同型）。multi-host は B のように行き先付きの OPEN が要る。
- Windows ネイティブを同じ体験にするには、(i) C（ACL 依存）、(ii) Node から DACL 付きの named pipe を作る手段（ネイティブアドオン・`node-pty` のような既存依存には無い）、(iii) Windows は E（初回だけ token）で妥協、のいずれか。**Windows の扱いは design で決める未確定事項**（requirements の「方式は design」）。
- どの案でも、端末版の接続はブラウザの「ログアウト / token reset での失効（4401）」（`composeServer.ts:293-297`、`ws/WsGateway.ts:238-240`）の扱いを決める必要がある（A は失効しない）。

---

## 3. サーバを裏で起動する

### 3.1 既存のコード

- **サーバ自身を裏で起動するコードは無い**。`soda serve` はフォアグラウンドで、端末を閉じると SIGHUP で正常終了する（`main.ts:59-76`、`docs/verification.md:63`）。
- 切り離しの前例: 独自コマンドの裏の実行 `spawnDetachedCommand`（`detached: true`・`stdio: "ignore"`・`windowsHide: true`・`unref()`）（`commands/commandLaunch.ts:44-85`）。ssh の子（`windowsHide: true`）（`machine/MachineLink.ts:38-44`）。
- 子として `soda serve` を起動して出力を読む前例: `stopSmoke.ts:127-156`（`spawn(process.execPath, [MAIN, "serve", ...], { stdio: ["ignore","pipe","pipe"] })`）、login は `stopSmoke.ts:158-167`。
- 自分を置き換える前例（handoff の execve）: `process.execPath` ＋ `process.execArgv` ＋ `process.argv.slice(1)`（`composeServer.ts:377-381`）。→ 端末版からの起動も `spawn(process.execPath, [...process.execArgv, process.argv[1], "serve", ...])` とすれば、`alias soda="node .../dist/main.js"`（`docs/verification.md:17-24`）でも PowerShell の関数でも同じ入口になる。

### 3.2 herdr のやり方（`[H]server/autodetect.rs`）

- 引数なしの `herdr` の流れ（`:1-6,285-320`）: クライアント socket に connect できるか → できなければ `herdr server` を裏で起動 → socket が準備できるまで 50ms 間隔で最大 15 秒待つ（`:18-23,247-279`）→ 薄いクライアントとして繋ぐ（`:318-319`）。
- 「動いているか」の判定は **socket に connect できるか**だけ（ファイルが無い・ECONNREFUSED なら無い＝古い socket）（`:36-89`）。Windows は JSON API の status を読む／hello を書けるか（`:50-54,95-143`）。起動済みなら版の互換を確かめる（`:145-178,299-305`）。
- 起動（`:184-241`）: 自分の実行ファイル＋`server`、stdin/out/err は `/dev/null`、Unix は `pre_exec` で `setsid()`（`[H]platform/mod.rs:161-176`）、Windows は `DETACHED_PROCESS`（`[H]platform/windows.rs:1371-1375`）。**親が kill-on-close の Job の中なら（Windows Terminal 等）WMI の `Win32_Process.Create` で Job の外に起動**（`[H]platform/windows.rs:1199-1205,1207-1270,1349-1369`）。
- 起動した場所を `HERDR_STARTUP_CWD` で渡す（`[H]server/autodetect.rs:28-30,225-232`、`[H]server/headless/bootstrap.rs:123-124`）。`--session` 明示時は継承した socket の上書き変数を消す（`[H]server/autodetect.rs:234-238`）。
- 二重起動の防止は socket の「使用中なら断る・古ければ消す」（`[H]ipc.rs:81-116`、`[H]server/socket_paths.rs:60-70`）。ログは `herdr-server.log`（`[H]server/headless/bootstrap.rs:216-226`）。
- 入れ子: `HERDR_ENV=1` の中では既定で断る（`allow_nested`）（`[H]main.rs:3-4,444-470,786`）。

### 3.3 Node で `soda serve` を切り離して起動する案

- Linux/WSL2: `spawn(execPath, args, { detached: true, stdio: [...], cwd: process.cwd(), env })` → `unref()`。Node の `detached` は POSIX で `setsid()`（新しいセッション）なので、端末を閉じた SIGHUP・SSH の切断が届かない（サーバの SIGHUP 処理 `main.ts:76` は発火しない）。
- Windows: `detached: true` ＋ `windowsHide: true`。libuv は `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP` を付けるが **`CREATE_BREAKAWAY_FROM_JOB` は付けない**（libuv の `src/win/process.c` の注記。要実機確認）。→ **Windows Terminal・VS Code の統合端末のように kill-on-close の Job の中から起動すると、端末を閉じたときにサーバも殺されうる**。herdr が WMI を使う理由と同じ（`[H]platform/windows.rs:1199-1205`）。Node からの回避策の候補: PowerShell の `Invoke-CimMethod -ClassName Win32_Process -MethodName Create`／`Start-Process`（Job を抜けるかは要実機確認）／タスク スケジューラ。**3 環境の AC16 に直結するので research の実機確認項目**。
- 起動した場所: サーバは `process.cwd()` を「起動した場所」にする（`composeServer.ts:195-197`）ので、spawn の `cwd` に端末版の cwd を渡せば herdr の `HERDR_STARTUP_CWD` と同じになる。pane の環境もサーバの環境から作る（`session/paneEnv.ts:50-70`）ので、`env` は端末版の環境を渡す（`SODA_PANE_ID` 等の管理変数は `buildPaneEnv` が落とす `session/paneEnv.ts:14-29`）。
- **token の表示が失われる問題**: 初回起動の token は標準出力に一度だけ出る（`main.ts:46-57`、`startupBanner.ts:48-52`）。裏で起動して stdout を捨てると、**ブラウザ用の token が誰にも見えず、`soda token reset` は動いている間は断られる**（`sessionCommands.ts:69-114`）。対策の候補: 準備完了まで子の stdout/stderr を pipe で読み、端末版が token を表示してから切り離す／起動の出力を 0600 のファイルに書く／端末版の画面から token を表示・再発行する口を作る。design で決める。
- 起動失敗の表示: `EADDRINUSE`（7780 が他で使用中）等は子の stderr に案内つきで出て終了コード 2（`main.ts:86-93`、`config.ts:201-210,268-292`）。stderr を捨てると原因が見えない → 準備完了までは pipe で読む（または `server.log` を案内。warn/error は server.log にも出る `log/Logger.ts:16,50`）。

### 3.4 「動いているか」の判定と準備完了の待ち方（案）

1. `soda.lock` を `StateDirLock.inspect()`（読み取り専用）で見る（`persist/StateDirLock.ts:208-212`）。持ち主が別ホストなら繋がずに案内（`persist/namedSession.ts:141` と同じ扱い）。
2. 持ち主が居れば `serve.json` を読み、pid・hostname が一致するときだけ port/https/host を使う（`persist/namedSession.ts:141-145` の条件そのもの）。
3. 持ち主が居なければ `soda serve` を切り離して起動し、準備完了を待つ:
   - Linux: `bridge.sock`（案 A/B なら自分の socket）に connect できる＝復元まで済んでいる（`composeServer.ts:546-556`）。
   - 全 OS: lock の持ち主＋`serve.json` の一致を待ち、`/ws` が 503 でなくなるまで再試行（`ws/WsServerWs.ts:117-123`）。
   - 子が先に終わったら（lock の競合・bind の失敗）その stderr を表示。**2 つの `soda` が同時に起動しても、2 つ目の serve は `soda.lock` で終了コード 2 になる**（`composeServer.ts:437-444`、`config.ts:238-247`）ので、端末版は子の失敗が「使用中」なら 1. からやり直せばよい。古い lock の同時の取り直しの競合は扱っていない（`persist/StateDirLock.ts:158-159`）。
- `serve.json` は止まっても残る（[実測]）ので、**`serve.json` 単独で「動いている」と判断してはいけない**。

---

## 4. TLS・待ち受けの既定

- 既定の待ち受けは `127.0.0.1`（`config.ts:10`）。ループバック以外は証明書が必須（`config.ts:141-146`）。
- `/api/login`・`/ws` は Origin/Host を見る（`http/HttpServer.ts:110-116`、`ws/WsServerWs.ts:113-116`）。Node のクライアントは sodactl と同じく `origin: <scheme>://<host>`・`host` を明示して送れば通る（`packages/cli/src/wsClient.ts:225-229`）。ループバックの 3 つの名前は常に許可（`auth/OriginPolicy.ts:47-49`）。
- TLS のサーバへループバックで繋ぐと、証明書に `127.0.0.1`/`::1` が要り、自己署名・mkcert の CA は `NODE_EXTRA_CA_CERTS` で教える（`docs/sodactl.md:384-386`）。**案 A/B（ローカル socket）なら TLS を通らないのでこの問題が無い**。HTTP の案（C/D/E）では端末版にも同じ条件が付く。

## 5. 複数ホスト（端末版が Web 版と同じことをするには）

- サーバ側: `/ws?machine=<id|名前>` は認証の後に中継へ（無い 404・未接続 503）（`ws/WsServerWs.ts:21-41,129-147`、`composeServer.ts:292-314`）。中継の接続も手元の失効で 4401（`composeServer.ts:293-297`）。
- 一覧: `machine.list`（有効なマシンの `id`・`label`・`state`・`message`）と `machine.changed` イベント（`packages/protocol/src/messages.ts:447-452`、`packages/protocol/src/model.ts:169-185`、`composeServer.ts:261`）。
- Web の配線（`packages/web/src/actions/MachineWiring.ts:8-15,42-120`）: 選んだマシンに**画面の接続**（`/ws?machine=<id>`、`packages/web/src/net/machineUrl.ts:1-9`）、選んでいない各マシン（ローカル含む）に**軽い接続**（`kind: "external"` で hello し snapshot とイベントだけ。購読・入力は送らない）（`packages/web/src/net/MachineSummaryClient.ts:4-8`）。選んだマシンが一覧から消えたらローカルへ戻る（`MachineWiring.ts:52-59`）。
- 端末版が同じことをするには: 同じ「画面の接続 1 本＋軽い接続 N 本」を張れる経路が要る。HTTP の `/ws`（案 C/D/E）ならそのまま。ローカル socket（案 A）では行き先を指定できないので、B のように OPEN に machine の selector を足し、サーバ側で `machines.route()`＋`relayToMachine` に繋ぐ拡張が要る（`composeServer.ts:298-314` と同じ処理をローカル socket 側にも置く）。
- sodactl の `--machine` も `/ws?machine=` を使う（`packages/cli/src/wsClient.ts:213-227,256-263`）。

## 6. パッケージ・ビルド

- `@sodashitsu/server` の `bin: { soda: ./dist/main.js }`、`private: true`、`build: tsc -b`（`packages/server/package.json`）。`@sodashitsu/cli` は `sodactl: ./dist/main.js`（`packages/cli/package.json`）。
- どちらも公開していないので **PATH には入らない**。docs は `alias soda="node <repo>/packages/server/dist/main.js"`（`docs/verification.md:17-24`、`docs/tls-setup.md:11-23`、`docs/migrate-from-wtm.md:36`）。
- `main.ts` は読み込むと起動する（`main.ts:173-176`）ので、端末版の解釈・判定は別ファイルに置いて単体テストする前例に従う（`cliArgs.ts:35`、`sessionCommands.ts:15`）。
- server は `ws`・`@xterm/headless`・`@xterm/addon-serialize` を既に依存に持つ（`packages/server/package.json`）→ 端末版を server パッケージに置けば WS クライアントと端末エミュレーション（pane の画面の保持）を追加の依存なしで使える。WS クライアントの実装は `packages/cli/src/wsClient.ts`（sodactl）にあるが、server は cli に依存していない（cli が devDependency で server に依存 `packages/cli/package.json`）。共有するなら protocol へ寄せるか複製（sodactl も smoke からの複製を選んだ前例 `packages/cli/src/wsClient.ts:13-17`）。
- 相対パスの資産（web の dist・third_party・assets）は `import.meta.dirname` からの相対（`composeServer.ts:107-122`）→ 端末版が同じ `dist/main.js` から `serve` を起動する限り影響なし。
- tsconfig: `rootDir: src`・テストは除外（`packages/server/tsconfig.json`）。

## 7. design へ渡す論点（事実から出てくるもの）

1. 認証方式: Linux/WSL2 は 0600 のローカル socket（`bridge.sock` の流用 or 新設）が既存の根拠と整合。Windows ネイティブは Node で DACL 付き named pipe を作れず（decisions 20260927-session-stop D2(e)）、秘密ファイル案は ACL 次第 → 方式を分けるか、共通に HTTP＋秘密ファイルにするかを決める。
2. multi-host をローカル socket で通すなら OPEN に行き先を足す（`bridge.sock` のプロトコル変更 or 別 socket）。
3. 初回 token の表示（裏で起動すると失われる）。
4. Windows の Job（kill-on-close）からの脱出（herdr は WMI）。3 環境の実機確認が要る。
5. Windows で裏のサーバを止める手段が無い（`soda session stop` 非対応・コンソールも無い）→ 端末版の自動起動を Windows で有効にするなら停止の口が必要。
6. 準備完了の判定（lock＋serve.json の一致→`/ws` 503 の間の再試行、または socket の出現）と、同時起動の扱い（2 つ目は lock で 2 → やり直し）。
7. 入れ子: pane の中では `SODA_PANE_ID`・`SODA_SERVER_URL` が入る（`session/paneEnv.ts:65-68`）→ herdr の `HERDR_ENV` と同じ判定に使える。
8. 引数なしの解釈の変更（`cliArgs.ts:49`）と、先頭が `--session`/`--state-dir` のときの扱い、help の入口。
9. 端末版は `kind: "desktop"` で hello（大きさの権限。`clients/SizeAuthority.ts:56`）。
