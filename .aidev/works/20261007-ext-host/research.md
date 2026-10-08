# 調査: 拡張の登録と起動（ext-host）のための、既存の作りの調査

> **調べ方と断り**: 2026-10-08、`feature/ext-host`（`ebcbdc0` に `origin/main` の `6fd30bb` を取り込んだ `913cf28`。表示の面の PR1 を含む）のコードを読んだ。読み取りは 3 つのサブエージェントに分け、
> 下の「実装アンカー」のうち **★** を付けた行番号は、監督のセッションが `grep` で開き直して確かめた。ほかの行番号は、サブエージェントの報告のまま（実装の前に開いて確かめる）。
> **ビルド・テスト・実機の操作はしていない**（読んだだけ）。エージェントの側の調査（F1〜F6）と、表示の面のための調査（R1〜R9）は `20261007-soda-extensions/research.md` にあり、ここでは繰り返さない。
> ここは「変更前の Sodashitsu」の事実。変更後の想定は、末尾の「design への申し送り」だけに書く。パスはリポジトリの根からの相対。

## 調査の問い

- Q1: 設定ファイルを安全に読む既存の型（`commands.json`）は、何を確かめ、何を画面へ送るか。読み直しの操作は、どこから呼ばれるか。
- Q2: 状態ディレクトリの「根」と「session ごと」は、どう分かれているか。根に置くファイルの排他は、どうなっているか。
- Q3: 「プロジェクトの根」を決められる既存の関数と、workspace・pane の所属の変化を知る手段は、何か。
- Q4: `/ws` の接続を、方式ごとに「画面だけ」に限る既存の型は、何で、どこまで信用できるか。
- Q5: 長く生きる子プロセスの既存の型（ssh の `MachineLink`）は、起動・停止・起動し直し・ログを、どうしているか。足りないものは何か。
- Q6: サーバの起動・停止・`soda handoff`・異常終了で、子プロセスはどう扱われているか。
- Q7: 環境変数から、秘密と pane ごとの値を落とす既存の型は、何か。
- Q8: 表示の面の台帳（`DisplayService`）は、面の持ち主・出来事の受け取りを、どう持っているか。
- Q9: 設定の画面・知らせ・確認のダイアログ・端末版・E2E・起動確認・文書の、足し方の型は、何か。

## 判明した事実

### E1: `commands.json` の読み方（Q1）

- `packages/server/src/commands/commandConfig.ts`: `loadCommandsFile(path, deps?): Promise<CommandCatalog & { warning?: string }>`（183 行付近）。`CommandCatalog { commands: CommandDef[]; problem: string | null }`。純粋な部分は `parseCommandsJson(text)`（130 行付近）。
  - 開き方: `O_RDONLY`、Unix だけ `| O_NOFOLLOW | O_NONBLOCK`。`ENOENT` は空（誤りではない）、`ELOOP` はリンクとして拒否。
  - **開いた fd の `stat()`** で: 通常ファイルでない → 拒否。Unix だけ、持ち主が自分でない → 拒否・`mode & 0o022`（ほかの利用者が書ける）→ 拒否。`mode & 0o044`（ほかの利用者が読める）は採って `warning`。**Windows は持ち主・権限を見ない**。
  - 同じ fd から、上限（`COMMANDS_FILE_MAX_BYTES = 65_536`）+1 バイトまで読み、超えたら拒否。`TextDecoder("utf-8", { fatal: true })`。
  - schema は `z.strictObject`（知らない項目は誤り）。id の重複は `superRefine`。**1 つでも規則の外なら、ファイル全体を採らない**（`rejected(problem)`）。
  - 誤りの文は、zod の最初の issue 1 件から、場所と種類だけで作る（`issueText`。値を入れない）。知らない項目の名前は `safeKeyName`（`/^[A-Za-z0-9_-]{1,32}$/` 以外は伏せる）。
  - 定数: `COMMAND_TEXT_MAX = 4096`・`COMMAND_DESCRIPTION_MAX = 200`・`COMMANDS_MAX = 100`。id の規則は `packages/protocol/src/commands.ts:13` ★ `COMMAND_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/`。
- シェルへ渡す引数は `packages/server/src/commands/commandLaunch.ts:21` ★ `commandArgv(type, command, platform, env): string[]`。POSIX は `["/bin/sh", "-c"（shell 種は "-lc"）, command]`、Windows は `[ComSpec || "cmd.exe", "/d", "/s", "/c", "\"<command>\""]`。
  Windows の形は「実機では確かめていない」とコメントにある（同ファイル 19 行付近）。`shell` 種の起動 `spawnDetachedCommand`（54 行 ★）は `detached: true`・`stdio: "ignore"`・`unref()`・`windowsVerbatimArguments: win32`（**終了も出力も見ない**）。
- 読む時機: 組み立ての中（`packages/server/src/composeServer.ts:322` ★ で `CommandService` を作り、続けて `await commands.reload()`。**状態ディレクトリのロックより前**。読むだけなので害が無い）と、`command.reload`。ファイルの見張りは無い。
- 読み直しの呼び出し元: キーの操作 `reload_config`（`packages/client-core/src/keys/bindings.ts:71` 付近）→ `packages/web/src/actions/ActionDispatcher.ts:1471` ★ `reloadConfig()` が `conn.request("command.reload", {})`。**設定画面に、読み直しのボタンは無い**。
  端末版は `packages/tui/src/actions/TuiDispatcher.ts:1421` 付近。
- 画面へ送るのは `CommandInfo`（id・種類・説明・大きさ）と `problem`。**`command` の文字列は送らない**（`toCommandInfo` で落とす）。`command.updated` は、全接続（`sodactl`・中継越しも）へ配られる。
- `/ws` の `command.*` に、接続の種類の制限は無い。

### E2: 状態ディレクトリ（Q2）

- `packages/server/src/config.ts:165` 付近 `resolveServeOptions`: `sessionRoot`（根。`--state-dir` か既定）と `stateDir`（session ごと。名前付きは `<根>/sessions/<名前>`、既定の session は根そのもの。`packages/server/src/persist/namedSession.ts:45` 付近）。`ServeOptions` に両方ある。
- 根に置いて共有しているのは `machines.json` だけ（`packages/server/src/machine/MachineCatalog.ts`。渡しているのは `composeServer.ts:314` 付近の `root: options.sessionRoot`）。ほか（`soda.lock`・`auth.json`・`commands.json`・`prefs.json`・`pane.sock` など）は、すべて session ごと。
- ロックは `<stateDir>/soda.lock`（session ごと）。`listen()` の最初（`composeServer.ts:620` ★ `lock.acquire()`）で取る。
- **根の `machines.json` を守るロックは無い**。書くのは CLI（`soda machine …`）で、「読み直してから `saveCatalog`」の形（`packages/server/src/machine/machineCommands.ts`）。サーバは、1 秒ごとに `stat` の署名（`mtimeMs:size:ino`）を見て読み直す（`MachineManager.ts`）。
- `packages/server/src/persist/atomicFile.ts`: `writeFileAtomic(filePath, contents)`（同じディレクトリの一時ファイル → Windows 以外 `chmod 0o600` → `rename`。fsync なし）、
  `readFileWithBackup(filePath, backupsDir, parse): Promise<{kind:"ok";data} | {kind:"missing"} | {kind:"corrupt";backupPath}>`（解釈できないものは、退避の場所へ写して `corrupt`。元は消さない）。

### E3: プロジェクトの根と、workspace・pane の所属（Q3）

- `packages/protocol/src/model.ts` の `Workspace`: `id`・`label`・`cwd`・`tabIds`・`git: GitInfo | null` ほか。**`Workspace.cwd` は、作ったときと復元のときにしか入らない**（開いた場所のまま。`packages/server/src/session/SessionModel.ts:311`・`1400` 付近）。動くのは `Pane.cwd`。
- `packages/server/src/session/workspaceLabel.ts:55` ★ `findGitRoot(cwd, deps, signal?): Promise<string | null>`: git のコマンドを使わず、`.git`（ディレクトリ／`gitdir:` のファイル／bare）を親へたどる。linked worktree では、**worktree の根**を返す。
  **`realpath` はしない**（`path.resolve` だけ）。呼び出しは、自動の名前のためだけで、200ms の上限つき。
- `GitInfo.repoKey` は、`git rev-parse --git-common-dir` の出力（`packages/server/src/git/GitInfoPoller.ts:195` 付近）。git のコマンドを呼ぶ・非同期で後から入る・「共通の `.git`」のパスで、作業ツリーの根ではない。
- pane は workspace を直接持たない（`Pane.tabId` → `Tab.workspaceId`）。pane から引くのは `SessionService.commandContext(paneId)`（`packages/server/src/session/SessionService.ts:828` ★。無ければ `NotFoundError`）。全部の一覧は `SessionService.snapshot()`（252 行 ★。`{ workspaces, tabs, panes, … }`）。
- bus（`packages/server/src/bus/EventBus.ts`。同期・発行順）に流れるのは `ServerEvent`（`packages/protocol/src/events.ts:203` 付近）**そのもの**で、`WsGateway` が全接続へ送る（サーバの中だけの知らせには使えない）。
  workspace を作ると `workspace.created` → `tab.created` → `pane.created`、消すと `pane.closed`（全部）→ `tab.closed` → `workspace.closed`。
  **起動のときの復元（`SessionService.restore`）は、bus に何も出さない**。pane が tab を移っても（別の workspace へも）、`pane.created`・`pane.closed` は出ない（何が出るかは未確認。`layout.updated`・`tab.updated`・`pane.updated` のどれかと推測）。
- 別のマシンの workspace は、手元のサーバのモデルに無い（`/ws?machine=` は、中身を解釈しない中継。`packages/server/src/machine/MachineRelay.ts:46` 付近）。先のサーバにとっては、`/ws` の 1 接続と同じ（`ClientRecord.viaBridge` が立つ）。

### E4: 接続の種類は自己申告（Q4）

- 認証は Cookie だけ（`packages/server/src/auth/AuthService.ts:91` 付近）。Origin の検査はあるが、ブラウザ以外は Origin を自由に付けられる（`sodactl` が実際に付けている）。
- `client.hello` の `kind`（`desktop`・`mobile`・`external`）は**自己申告**で、何度でも送れる。**端末版も `desktop`**。`sodactl` は `external`。
- 方式ごとの認可の仕組みは `ControlSurface` に無い（`MethodDef` は `schema` と `handler` だけ。`packages/server/src/surface/ControlSurface.ts:16` 付近）。種類で分けている先例は、サービスの側で `clients.get(id)?.kind` を見る形:
  `AskService.subscribe`（`packages/server/src/ask/AskService.ts:157` 付近。`isBrowserKind`）・`DisplayService.subscribe`（`isScreenKind`。注入は `composeServer.ts:350` ★ の近く）。
- サーバが自分で決める印は、`ClientRecord.viaBridge`（中継越し）と `MethodContext.sameMachine` だけ。
- **つまり**: ログイン済みの接続は、`desktop` を名乗れば「画面だけ」の方式を呼べる。種類の検査は、誤用を防ぐもので、権限の境界ではない。境界は「ログインしているか」（`/ws`）と「`pane.sock` に載せていないか」。

### E5: 長く生きる子プロセスの型（ssh）（Q5）

- `packages/server/src/machine/MachineLink.ts:39` 付近 `defaultSpawn = nodeSpawn(command, args, { shell: false, stdio: ["pipe","pipe","pipe"], windowsHide: true })`。**`detached`・`env`・`cwd` の指定は無い**（サーバの `process.env` をそのまま継ぐ。プロセスのグループもサーバと同じ）。
  差し替えは `MachineLinkDeps { spawn?, clock?, logger? }`。偽の子は `packages/server/src/machine/testing.ts` の `FakeChild`（`PassThrough` 3 本）と `ManualClock`。`ChildLike` に `pid` は無い。
- 停止（`finish`。483 行付近）: `stdin.end()` → `kill("SIGTERM")` → 2 秒（`killGraceMs`）後に `kill("SIGKILL")`。終わりの Promise `exited` は、**`exit` ではなく `close`**（stdio が全部閉じたとき）で決まる。孫プロセスが stdio を握っていると、`MachineManager.stop(waitMs = 3_000)` は、時間切れまで待つ。
- stdout は、行ではなくバイナリの枠（ssh の事情）。**子の stdout を行で読む先例は無い**。行の上限の先例は socket の側（`PaneSocket.ts:236` 付近。4 MiB を超えたら断る）。
- stderr は、末尾の 8 KiB だけ持ち、終わったときの理由の文に 1 行混ぜる。**子の stderr を行ごとに残す・画面で見せる先例は無い**。
- 起動し直し（`MachineManager.ts:18` 付近 `MANAGER_TIMINGS`）: 1 秒から倍々、上限 120 秒、揺らぎなし。60 秒以上つながった後の切断で、回数を戻す。
- 状態は、`machines.onChanged` → `bus.publish({ event: "machine.changed", … })`。同じ JSON なら配らない。
- 子の stdio の `error` に listener が無いと、サーバごと落ちる（`MachineLink.ts:335` 付近が、対策の先例）。

### E6: サーバの起動・停止・入れ替え・異常終了（Q6）

- `listen()`（`composeServer.ts:615` 付近〜）の順: ロック（620 ★）→ 引き継ぎの受け取り → 認証・設定の読み込み → bind → … → 復元 → poller の開始 → socket 類 → `wsServer.setReady(true)` → **最後に `void machines.start()`**（773 ★。待たない）。
  `listen()` の `catch` に `machines.stop()` は無い（最後の文だから）。子の起動を、それより前に置くなら、`catch` にも停止が要る。
- `close()`（798 行付近〜）: `control.beginClosing()` → … → `await machines.stop()`（813 ★）→ … → `terminals.dispose` → … → `finally` で `displays.dispose()`（847 ★）… `lock.release()`。
- 入れ替え（`packages/server/src/handoff/HandoffController.ts:145` 付近〜）: `closeClients` → `pausePollers`（`composeServer.ts:517` ★。最後が `await machines.stop()` 524 ★）→ pane を保つ → 保存 → `execve`。
  失敗したら `rollback()` → `resumePollers`（526 ★。`void machines.start()` 530 ★）。**`rollback` は、`pausePollers` が途中で投げたときも `resumePollers` を呼ぶ**（＝「止めていなくても呼べる」ことが前提）。
  `execve` で置き換わった後は、止めなかった子は、回収されずに残る（524 行のコメント）。Node が作る子の stdio のパイプは close-on-exec と**推測**（確かめていない）。そうなら、止めずに入れ替えると、子は標準入力の EOF だけを受ける。
- シグナル（`packages/server/src/main.ts:79` 付近・`serveShutdown.ts`）: 1 回目の SIGINT・SIGTERM・SIGHUP は `close()` を待って終わる。**2 回目は、待たずに終わる**（子の停止は終わっていないことがある）。
  `soda session stop` は、`handoff.sock` 経由で同じ `close()`。
- サーバに `uncaughtException`・`process.on("exit")` の後始末は無い。**サーバが SIGKILL・クラッシュで終わったとき、子を止めるコードは無い**（ssh は、標準入力の EOF で終わる連鎖に頼っている）。
- Windows: 入れ替え・`session stop`・`pane.sock`・bridge は無い（`unsupported`）。Windows で子へ SIGTERM を送ると何が起きるかは、コードにも文書にも書かれていない（Node の一般の動きでは、すぐの強制終了＝**推測**）。

### E7: 環境変数（Q7）

- `packages/server/src/session/paneEnv.ts:14` ★ `PANE_ENV_DROPPED`: `SODACTL_URL`・`SODACTL_TOKEN`・`SODA_PANE_ID`・`SODA_SERVER_URL`・`SODA_AGENT_REPORT_SOCKET`・`SODA_PANE_SOCKET`・`SODA_SESSION`・`SODA_HANDOFF_NONCE`・`SODA_ACTIVE_*`・`SODA_COMMAND_ID`。
  `buildPaneEnv(base, managed, platform)`（57 行 ★）は、これを落として（Windows は大文字小文字を区別せず）、pane ごとの値を足す。**落とす一覧であって、通す一覧ではない**（ほかの `process.env` は全部渡る）。
- サーバの token は `auth.json`、手元のログインの秘密は `local-auth.json` のファイルにあり、環境変数には置かれない。
- ssh と git の起動は、`buildPaneEnv` を通っていない（`SODACTL_TOKEN` も継ぐ）。

### E8: 表示の面の台帳（Q8）

- `packages/server/src/display/DisplayService.ts`: 公開の口は `set(paneId, body)`（135 行 ★）・`close(paneId, sel, reason = "closed")`（210 行 ★）・`list`・`wait`・`features`・`subscribe`・`get`・`action`・`dismiss`・`report`・`onClientGone`・`dispose`。
- **面の持ち主は、記録していない**。`Entry`（65 行 ★）は `{ info, content, ttl }` だけで、鍵は pane と名前。同じ pane・同じ名前なら、誰が `set` しても上書きになり、誰でも `close` できる。
- 出来事（`display.action`・`display.closed`）は、`private pushEvent(paneId, ev)`（441 行 ★）が、**pane ごとの列**（64 件）に入れて、待っている `wait` を起こすだけ。bus には出ない。**サーバの中の別の部品が、出来事をコールバックで受け取る口は無い**。
  pane が閉じたとき（`onPaneClosed` 499 行 ★）は、列に足さずに列ごと捨てる（`display.removed` は bus に出る）。
- `set` の回数と量の頻度・面の数は、pane ごとに数える。全体は 64 面・32 MiB。
- `packages/protocol/src/display.ts` の main の版には、`script-html`・`display.send`・`focus_steal` は**まだ無い**（表示の面の PR3）。`DisplayInfo` に、持ち主の項目は無い。読み手の型はゆるい（未知の形式・理由・項目を通す）。引数の zod の schema は `packages/protocol/src/messages.ts:491` 付近〜（`DisplaySetParams` の欄は `z.unknown().optional()` で、本検査は `checkDisplaySet`）。
- `/ws` の登録は `packages/server/src/surface/methods/display.ts`（`registerDisplayMethods`）、受け口は `packages/server/src/panesocket/displayOps.ts`。組み立ては `composeServer.ts:350` ★。2 つの `WsGateway` の `onClientGone`（479 ★・491 ★）。
- **web・tui・client-core・e2e に、表示の面の実装は、まだ無い**（PR2 が実装中）。`docs/sodactl.md` に `display` の節も、まだ無い。

### E9: 画面・知らせ・端末版・E2E・起動確認・文書（Q9）

- 設定画面（`packages/web/src/components/SettingsDialog.vue`）: `.settings-body` の直下に `<section class="settings-section" aria-labelledby="…">` を足すと、左のメニューが自動で拾う。節を別の部品に分けた先例は `KeySettings.vue`。
  サーバの状態を見せる節の先例は「エージェント連携」（1241 行付近〜）: 開くたびに状態を取り直し（`ActionDispatcher.ts:727` 付近）、以降は `agent_integration.changed` で更新。行に、状態の文・入切（`role="switch"`）・ボタン・結果の `p[role=status]`。「ブラウザごとではない」（サーバ全体の設定）と明記する先例がある。
  2 段の確認の先例は、同じファイルの `confirmingOverrideReset`。**サーバの側の同意のダイアログの先例は無い**（エージェント連携は、ボタンを押すことが同意）。
- サーバから届く確認を、開いている設定を潰さずに出す先例は `packages/web/src/components/AskDialog.vue`（`view.openDialog` の 1 枠とは別の `<dialog>`。`showModal()`・`view.setAskOpen(true)` でキーを端末へ流さない・背景では閉じない・閉じたら、ほかのモーダルがあれば開く前の要素へ、無ければ pane の端末へ戻す）。
- トースト: `packages/web/src/store/view.ts:755` 付近 `toast(message, opts?: { kind?: "sticky"; actions?: ToastAction[]; wrap? })`。`sticky` は消えず、ボタンを置ける。
  **サーバ発の、汎用の知らせのイベントは無い**。先例は「id だけのイベント → 画面が取り直す」（`ask.opened`・`display.updated`）。サーバのエラーは、code から web の側の日本語を引く（`packages/client-core/src/net/clientError.ts`）。
- 端末版（`packages/tui`）にも設定のダイアログがある（`modes/SettingsDialog.ts`・`settings/sections.ts`）。面は出せない（名乗らない）。Web 版だけの機能は、`docs/tui-parity.md`「3. Web 版だけの拡張」の表に 1 行足す（末尾は W33・W32 の順。次は W34 と推測）。
- E2E（`packages/e2e/src/support/appServer.ts`）: `startAppServer(opts)` が、**同じ Node のプロセスの中で** `composeServer` を立てる。状態ディレクトリは一時のもので、`AppServer.stateDir` で読め、`restart()` で保ったまま立て直せる。設定ファイルを置く引数・環境変数を渡す引数は無い。
  設定を開く spec の先例は `specs/settings.spec.ts`（`openSettingsByKey`）。
- 起動確認: `packages/server/src/handoffSmoke.ts`・`stopSmoke.ts`・`machineSmoke.ts` は、1 本の `main()` に番号つきの段を並べる単独のスクリプト。Windows は先頭でスキップ。**「子プロセスが残っていない」ことを確かめる段は、無い**。
  新しい起動確認は、`.aidev/config.yml` の `smokeCommands` に行を足さないと走らない。
- 文書: `docs/` に、拡張の文書は無い。`AGENTS.md` の頭の案内は「- 〈何の話か〉（〈中身〉）は `docs/xxx.md`「節名」。」の形。
- `sodactl` のサブコマンドの足し方・古いサーバへの「未対応」の型は、`20261007-soda-extensions/research.md` R7。

## 影響範囲

- protocol: 新しい `extension.ts`、`messages.ts`（方式の表）、`events.ts`、`errors.ts`、`display.ts`（`DisplayInfo` に、出どころの項目を足す）、`index.ts`。
- server: 新しい `extensions/`（設定の読み込み・プロジェクトの根・承認の記録・行の切り出し・プロセス・ホスト・操作）、`display/DisplayService.ts`（持ち主と、出来事の受け取り口）、`surface/methods/`（新しい `extension.ts`・`index.ts`・`deps.ts`）、
  `composeServer.ts`（組み立て・`listen`・`close`・`pausePollers`・`resumePollers`）、`session/paneEnv.ts`（落とす一覧）、`handoffSmoke.ts`・`stopSmoke.ts`。
- cli: `cliArgs.ts`・`main.ts`・新しい `commands/ext.ts`・`skills/sodactl/SKILL.md`。
- client-core: `net/clientError.ts`（エラーの code の日本語）。
- web: 新しいストア・通信の係・節の部品・承認のダイアログ、`SettingsDialog.vue`・`main.ts`・`store/StoreAdapter.ts`・`actions/ActionDispatcher.ts`（`reloadConfig`）・`App.vue`。表示の面の PR2 の、パネルと帯の見出しの部品（出どころの表示）。
- e2e: 新しい spec と `support/` の helper。
- docs: 新しい `docs/extensions.md`・`docs/examples/`、`docs/sodactl.md`・`docs/tui-parity.md`・`AGENTS.md`。
- 触らない: `packages/tui`（対象外）・`third_party/ask-form/`・`panesocket/`（承認の操作を載せないことを、テストで見るだけ）・`handoff/`・表示の面の枠と静的ページ。
- **表示の面の作業と同じファイル**: `packages/server/src/display/DisplayService.ts`・`packages/protocol/src/display.ts`（表示の面の PR3 も触る）と、パネル・帯の見出しの部品（PR2 が作る）。足すだけにして、衝突を小さくする。

## 実現性 / リスク

- **実現できる**: 設定の読み込み・子プロセスの持ち主・状態の配り方・設定画面の節・別の `<dialog>` のどれも、先例がある。
- **孫プロセスごと止めるには、ssh の型（グループを分けない）では足りない**（E5）。コマンドはシェル経由で起動するので、シェルの子が残りうる。プロセスのグループを分けて、グループへ合図を送る形が要る（Windows は別の手段）。**実測していない**。
- **異常終了のときに子を止める手段が、Node には無い**（E6）。標準入力の EOF に頼る。
- **復元と、pane の移動は、bus だけでは追えない**（E3）。起動のときは一覧を自分で読み、pane の所属は、要求のたびに引き直す。
- **根に置く承認の記録に、排他が無い**（E2）。複数の session のサーバが、同時に書きうる。
- **表示の面の台帳に、持ち主と受け取り口を足す**（E8）。表示の面の PR3 と同じファイルを触る。
- **種類の検査は、境界ではない**（E4）。「画面からだけ承認できる」は、`pane.sock` に載せないことで守り、`/ws` の側は、誤用を防ぐだけ、と書く。
- **E2E は、サーバと同じプロセスから、実際に子プロセスを起動する**（E9）。Node のスクリプトを `process.execPath` で起動する形にすれば、差し替えの口は要らない。

## 実装アンカー

- X1: 設定ファイルの読み方の手本（`packages/server/src/commands/commandConfig.ts` `loadCommandsFile`・`parseCommandsJson`・`issueText`・`safeKeyName`・`rejected`）— 開き方・fd の `stat`・上限・`strictObject`・誤りの文。
- X2: シェルへ渡す引数（`packages/server/src/commands/commandLaunch.ts:21` ★ `commandArgv`）— POSIX と Windows。拡張は `"popup"` 種と同じ `-c`（ログインシェルにしない）。
- X3: id の規則（`packages/protocol/src/commands.ts:13` ★ `COMMAND_ID_RE`）。
- X4: 状態ディレクトリの 2 つ（`packages/server/src/config.ts` `ServeOptions.stateDir`・`sessionRoot`）と、根に置く先例（`packages/server/src/machine/MachineCatalog.ts` `machinesFilePath`・`loadCatalog`・`saveCatalog`）。
- X5: JSON を安全に書く（`packages/server/src/persist/atomicFile.ts` `writeFileAtomic`・`readFileWithBackup`）。
- X6: git の根（`packages/server/src/session/workspaceLabel.ts:55` ★ `findGitRoot`。`WorkspaceLabelDeps` の作り方は、同ファイルの `rootWithin` の呼び出し元）。
- X7: pane → workspace（`packages/server/src/session/SessionService.ts:828` ★ `commandContext`）と、全部の一覧（252 ★ `snapshot`）。
- X8: bus の購読の手本（`packages/server/src/ask/AskService.ts:112` 付近。`opts.bus.subscribe((e) => …)`・`dispose`）。購読者の例外は、発行した側へ伝わるので、`try/catch` で包む（`DisplayService.ts:124` 付近）。
- X9: 接続の種類の検査の手本（`AskService.ts:157` 付近 `isBrowserKind`。注入は `composeServer.ts:350` ★ の `isScreenKind`）。
- X10: 子プロセスの持ち主の手本（`packages/server/src/machine/MachineLink.ts` `defaultSpawn`・`finish`・`exited`・`MachineLinkDeps`、`MachineManager.ts` `MANAGER_TIMINGS`・`start`・`stop`、`machine/testing.ts` `FakeChild`・`ManualClock`）。
- X11: 組み立てと寿命（`packages/server/src/composeServer.ts`: 生成 313〜322 ★ の近く・`listen` の 773 ★・`close` の 813 ★・`pausePollers` 524 ★・`resumePollers` 530 ★・`registerAllMethods` 429 ★・`displays` 350 ★）。
- X12: 環境変数（`packages/server/src/session/paneEnv.ts:14` ★ `PANE_ENV_DROPPED`・57 ★ `buildPaneEnv`、テストは `paneEnv.test.ts`）。
- X13: 表示の面の台帳（`packages/server/src/display/DisplayService.ts`: `Entry` 65 ★・`set` 135 ★・`close` 210 ★・`pushEvent` 441 ★・`remove` 481 ★・`onPaneClosed` 499 ★）と、型（`packages/protocol/src/display.ts` `DisplayInfo`・`readDisplayInfo`・`DisplayEvent`）。
- X14: `/ws` の方式の足し方（`packages/server/src/surface/methods/command.ts:16` 付近 `registerCommandMethods`、`index.ts`、`deps.ts` `MethodDeps`、`packages/protocol/src/messages.ts` `METHOD_SCHEMAS`・`MethodResultMap`、`events.ts` `ServerEvent`、`errors.ts`）。
- X15: 設定画面の節（`packages/web/src/components/SettingsDialog.vue:1241` 付近〜の「エージェント連携」、部品に分けた先例 `KeySettings.vue`、ストア `packages/web/src/store/agentIntegrations.ts`、イベントの振り分け `store/StoreAdapter.ts:177` 付近〜）。
- X16: 別の `<dialog>`（`packages/web/src/components/AskDialog.vue`: `showModal`・`view.setAskOpen`・`restoreFocus`）と、トースト（`packages/web/src/store/view.ts:755` 付近 `toast`）。
- X17: 読み直しの操作（`packages/web/src/actions/ActionDispatcher.ts:1471` ★ `reloadConfig`）。
- X18: `sodactl` のサブコマンド（`packages/cli/src/cliArgs.ts` `USAGE_LINES`・`Command`・`parseCommand`、`main.ts`、手本は `commands/display.ts` の `{status:"unsupported"}` の出し方、`skill.test.ts`）。
- X19: E2E（`packages/e2e/src/support/appServer.ts` `startAppServer`・`AppServer.stateDir`・`restart`、`specs/settings.spec.ts` `openSettingsByKey`、`support/ask.ts` の、ビルドした sodactl を子プロセスで動かす型）。
- X20: 起動確認（`packages/server/src/handoffSmoke.ts`・`stopSmoke.ts` の `main()` の段・`isAlive(pid)`・`until`）。
- X21: 端末版の対応表（`docs/tui-parity.md`「3. Web 版だけの拡張」の表の末尾）。
- X22: パネル・帯の見出しの部品（未特定 — 表示の面の PR2 が作る。`20261007-soda-extensions/tasks.md` の T12 の `対象` を見る）。
- X23: pane が tab・workspace を移ったときに bus に出るイベント（未特定 — `SessionService` の `moveToTab`・`moveToNewTab` の中の `publish` を見る）。

## 実装時の注意

- bus に流したものは、全接続（`sodactl`・中継越しも）へ届く。**拡張の一覧・コマンド・ログを、イベントに載せない**（「変わった」だけを配り、画面が取り直す）。
- `EventBus` は同期で、購読者の例外は、発行した側（pane の処理）へ伝わる。拡張の側の処理は、必ず `try/catch` で包む。
- 子の `stdin`・`stdout`・`stderr` の `error` に listener を付ける（無いと、`EPIPE` でサーバごと落ちる）。
- `listen()` の `catch` に、拡張の停止を足す（`machines.start()` と違って、起動を待つ・途中で失敗しうる場所に置くなら）。
- `resumePollers` は「止めていなくても呼べる」こと（`start()` を何度呼んでも、二重に起動しない）。
- `execve` の前に、子が終わるのを**待つ**（待たずに入れ替えると、回収されない子が残る）。待ちには上限を付ける（入れ替えを、拡張が止められないように）。
- `Workspace.cwd` は、開いた場所のまま（`cd` しても変わらない）。プロジェクトの根は、これから決める。`Pane.cwd`（動く）や `identityCwdOf`（自動の名前用）を使わない——pane の中のプログラムが `cd` するだけで、根が変わってしまう。
- `findGitRoot` は `realpath` しない。承認の鍵には、`realpath` したものを使う。
- `server.log` は 1 行の JSON で、`fields` の `ts`・`level`・`msg` は上書きされる。拡張の id は `extension` などの名前で入れる。
- 文言は日本語の直書き。サーバのエラーは、code から web の側の日本語を引く（`clientError.ts` に足す）。
- `USAGE_LINES` を変えたら、`SKILL.md` も同じコミットで直す（`skill.test.ts`）。
- E2E は `pnpm build` の後に動く。合否は、ブラウザの DOM と、ブラウザが送受信したフレームで判定する（`.aidev/conventions/e2e-observe-browser.md`）。回帰テストは、守りを外すと落ちることを確かめる（`regression-negative-control.md`）。

## design への申し送り

- 設定の読み込みは、`loadCommandsFile` の型をなぞる（共通の関数に括り出すか、写すかは design で決める）。プロジェクトの設定は、持ち主と権限を見ない代わりに、根の実体のパスの下にあることを確かめる。
- プロセスのグループを分ける・`exit` で終わりを決める・停止の待ちに上限を付ける、の 3 つが、ssh の型との違い。
- 起動のときの workspace は、`snapshot()` から読む。pane の所属は、要求のたびに `commandContext` で引く。
- 承認の記録は、根に置くなら、「読み直してから書く」（`machines.json` の CLI と同じ）にする。
- `DisplayService` には、持ち主の札と、出来事の受け取り口を足す。既存の口の動きは変えない。
- 接続の種類の検査は、サービスの側に置く（`isScreenKind` を注入する）。docs には、境界でないと書く。
