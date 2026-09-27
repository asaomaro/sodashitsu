# 調査: 製品名の改名（wtm → soda / Sodashitsu）の棚卸しと、移行スクリプトが触る手元の状態

## 調査の問い

- Q1: 古い名前はどんな形で、どこに現れるか（置換の順序と例外を決めるため）。
- Q2: 状態ディレクトリの場所・中身のうち、名前に古い名前を含むファイルは何か。`sessions/*/` はどうなっているか。
- Q3: 「古いサーバが動いている」はどう判定できるか（ロックの形）。
- Q4: エージェント連携の hook はどこに何を書くか（移行スクリプトが書き換える対象）。
- Q5: CLI のキャッシュ・worktree の既定の置き場・保存したレイアウトの中のパスはどうなっているか。
- Q6: 手で動かした worktree を `git worktree repair` で直せるか。
- Q7: ブラウザ側に持つもの（cookie・localStorage・sessionStorage）は何か。

## 判明した事実

### Q1: 古い名前の形（`git grep -i -E 'wtm|web-tn-multiplexer' -- ':!.aidev/works'`。421 ファイル・約 2956 箇所。2026-09-27・main b69303f）

- F1.1 形の一覧（件数の多い順の抜粋）: `wtm`（コマンド・文中の製品名・一時ディレクトリの接頭辞 `wtm-…-`）、`wtmctl`、`@wtm/*`（パッケージ）、
  環境変数 `WTM_*`（`WTM_SESSION`・`WTM_PANE_ID`・`WTM_SERVER_URL`・`WTM_COMMAND_ID`・`WTM_AGENT_REPORT_SOCKET`・`WTM_ACTIVE_{PANE_ID,PANE_CWD,TAB_ID,WORKSPACE_ID}`・
  `WTM_TAB_ID`・`WTM_WORKSPACE_ID`・`WTM_HANDOFF_NONCE`・`WTM_LAN_IP`・`WTM_WINDOWS_CONPTY`・`WTM_SMOKE_{MAIN,NODE,REMOTE_ROOT,SSH_ARGS}`）、
  `WTMCTL_URL`・`WTMCTL_TOKEN`、cookie `wtm_session`/`wtm_session_<名前>`、CSS 変数 `--wtm-*`（20 種）、localStorage `wtm.*.v1`、
  識別子 `WtmClient`・`WsWtmClient`・`WtmTestClient`・`runWtm`・`__wtmKeyboardCalls`・`__wtmFirstPaint`・`__wtmFirstPaintAccent`、
  Windows の大文字小文字の検査用の `Wtm_Session`・`Wtm_Pane_Id`（テスト）、中継の目印 `WTM-BRIDGE 1\n`（`packages/server/src/machine/bridgeFrames.ts:12`）、
  `web-tn-multiplexer`（状態ディレクトリの名前 `packages/server/src/config.ts:69,72`・docs の clone 先）。
- F1.2 名前に古い名前を含む追跡ファイルは 2 つ: `docs/wtmctl.md`、`packages/cli/skills/wtmctl/SKILL.md`。
- F1.3 機械的な置換の罠:
  - `~/.wtm/worktrees`（`packages/server/src/git/WorktreeService.ts:23` `defaultWorktreeRoot`、e2e の `join(homedir(), ".wtm", "worktrees", …)`）は
    利用者の決定で `~/.sodashitsu/worktrees` にする——`wtm`→`soda` の一律の置換では `.soda` になるので、先に置き換える。
  - `pnpm-lock.yaml` の integrity（`sha512-…8wtm6M5…`）に大文字小文字を無視すると `wtm` が偶然含まれる。lock は手で置換せず `pnpm install` で作り直す。
  - 正規表現の中の `\nwtm`・`\bwtmctl`（テスト）は `\n`+`wtm` なので一律の置換でよい。
  - `.aidev/works/**` は開発の記録なので触らない（`.aidev/backlog/product-roadmap.md` の出典は `.aidev/works/…` のパスで、`wtm` を含まない）。
  - `scratchpad/` は `.gitignore` に無い（main の `git status` に `?? scratchpad/`）。コミットに混ぜない。
- F1.4 ページのタイトル: `packages/web/index.html:6` `<title>wtm</title>`、`packages/web/src/serverSession/documentTitle.ts` の既定 `wtm`／`wtm [名前]`。
- F1.5 LICENSE `Copyright (c) 2026 wtm contributors`、NOTICE 1〜2 行目、`third_party/herdr/README.md:12`（`@wtm/server`）。
- F1.6 `.aidev/config.yml` の `smokeCommands` が `@wtm/cli`・`WTMCTL_URL`・`WTM_SESSION`・`packages/cli/skills/wtmctl/SKILL.md` を含む（2・4・5 本目）。

### Q2: 状態ディレクトリ

- F2.1 既定の場所: Linux/macOS は `${XDG_STATE_HOME:-~/.local/state}/web-tn-multiplexer`、Windows は `%LOCALAPPDATA%\web-tn-multiplexer`
  （`LOCALAPPDATA` が無ければ `~/AppData/Local`）（`packages/server/src/config.ts:64-73` `defaultStateDir`）。`XDG_STATE_HOME` は空文字でも使う（`??`）。
- F2.2 中身のファイル名（固定の名前）: `session.json`（`persist/SessionFile.ts:140`）、`auth.json`（`persist/AuthFile.ts:43`）、`integrations.json`・`integrations-backups/`
  （`persist/IntegrationFile.ts:36-37`）、`session-history.json`（`persist/PaneHistoryFile.ts:11`）、`serve.json`（`persist/ServeRecordFile.ts:10`）、
  `commands.json`（`commands/commandConfig.ts:12`）、`machines.json`（`machine/MachineCatalog.ts:20`）、`handoff.json`（`handoff/HandoffManifest.ts:14`）、
  `agent-report.sock`（`config.ts` `agentReportSocketPathFor`）、`server.log`、`clipboard-images/`。**古い名前を含むのは次の 2 つだけ**:
  - `wtm.lock`（`persist/StateDirLock.ts:7` `STATE_DIR_LOCK_FILE`）。
  - `clipboard-images/wtm-image-<YYYYMMDDTHHMMSSZ>-<16hex>.<ext>`（`image/ImageStore.ts:19` `IMAGE_FILE_NAME_RE`・`:82`）。
- F2.3 名前付き session は `<状態ディレクトリ>/sessions/<名前>/` に同じ形で置かれる（`.aidev/config.yml` の smoke 3 本目の `sessions/smoke/auth.json`、
  `persist/namedSession.ts`）。それぞれが自分の `wtm.lock` を持つ。
- F2.4 Windows の報告の受け口は名前付きパイプ `\\.\pipe\wtm-agent-report-<hash>`（`config.ts` `agentReportSocketPathFor`）——ファイルではないので移行の対象外。
- F2.5 スクロールバックの編集の一時ディレクトリ `mkdtemp(<tmp>/wtm-scrollback-)`（`terminal/scrollbackEditor.ts:57`）と、その形だけを受け付ける検査
  （`handoff/HandoffManifest.ts:124`・`session/SessionService.ts:1333`）。一時的なものなので移行の対象外（名前は一緒に改める）。

### Q3: 動いているサーバの判定（`packages/server/src/persist/StateDirLock.ts`）

- F3.1 ロックの中身は 1 行目が pid、2 行目がホスト名（`tryCreate` の `${pid}\n${hostname}\n`）。2 行目の無い古い形もある（`parseHolder`）。
- F3.2 アプリの「使用中」の判定（`isInUse`）: ホスト名が自分と違えば使用中（pid の生死を確かめられない）。そうでなければ pid が生きているか
  （`process.kill(pid, 0)`。`EPERM` も生きているとみなす）。1 行目が数字でなければ読めない＝使用中とみなさない（落ちた残り）。
- F3.3 サーバは正常に止まるとロックを消す（`release`）。落ちた残りのロックは残る。

### Q4: エージェント連携の hook（`packages/server/src/agent/AgentIntegrationInstaller.ts`）

- F4.1 hook のスクリプトは**状態ディレクトリではなく、各エージェントの `hooks/` の下**に `wtm-agent-report.cjs` として写される（`:15` `HOOK_SCRIPT_NAME`、
  `:191` `hookScriptPathFor`、`:238` `copyFile`）。写す元は `packages/server/assets/agent-hook-report.cjs`。
- F4.2 8 種の設定ファイルと hooks の場所（`:96-167` `HOOK_SPECS`）:

  | kind | 設定ファイル | hooks の場所 |
  |---|---|---|
  | claude | `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json` | `${CLAUDE_CONFIG_DIR:-~/.claude}/hooks` |
  | codex | `${CODEX_HOME:-~/.codex}/hooks.json` | `${CODEX_HOME:-~/.codex}/hooks` |
  | cursor | `~/.cursor/hooks.json` | `~/.cursor/hooks` |
  | copilot | `~/.copilot/hooks/wtm-agent-report.json` | `~/.copilot/hooks` |
  | devin | `${DEVIN_CONFIG_DIR:-~/.devin}/hooks.json` | `${DEVIN_CONFIG_DIR:-~/.devin}/hooks` |
  | factory | `~/.factory/hooks.json` | `~/.factory/hooks` |
  | grok | `~/.grok/hooks/wtm-agent-report.json` | `~/.grok/hooks` |
  | qwen | `~/.qwen/settings.json` | `~/.qwen/hooks` |

  環境変数は `||`（空文字なら既定）で読む（`:98-137`）。
- F4.3 エントリのコマンドは `node "<hooks>/wtm-agent-report.cjs" <kind>`（`:80-84` `hookCommand`）。qwen のエントリは `name: "wtm-agent-report"` も持つ（`:165`）。
  本製品のエントリかの判定はコマンド文字列に `wtm-agent-report.cjs` を含むか（`isOursNested`・`isOursField`）。設定ファイルは `JSON.stringify(…, null, 2)` で書く。
- F4.4 hook のスクリプト本体は `process.env.WTM_PANE_ID` と `process.env.WTM_AGENT_REPORT_SOCKET` を読み、無ければ何もしない
  （`packages/server/assets/agent-hook-report.cjs:10,34-35`）。**名前を変えた後のサーバは `SODA_*` を渡すので、写してある古いスクリプトは黙って何もしなくなる**。
  → 移行ではファイル名を変えるだけでなく、中身を同梱の新しい版に置き換える必要がある。

### Q5: CLI のキャッシュ・worktree・保存したレイアウト

- F5.1 CLI のキャッシュは `~/.wtmctl/session.json`（`packages/cli/src/session.ts:26` `defaultSessionFilePath`）。中身は origin ごとの `{cookie, createdAt}` で、
  `cookie` は `wtm_session=…`（`packages/cli/src/httpAuth.ts:5`）の形。token は保存しない。
- F5.2 cookie 名は `wtm_session`、名前付き session は `wtm_session_<名前>`（`packages/server/src/auth/AuthService.ts:9,19-21`）。サーバ側の session の実体は
  `auth.json` にあり cookie 名を含まないので、キャッシュの `wtm_session` を `soda_session` に書き換えれば CLI のログインは保たれる（推論。design で扱う）。
- F5.3 worktree の既定の置き場は `~/.wtm/worktrees`（`WorktreeService.ts:22-24`。`\` を `/` に正規化する）。作成先は `<置き場>/<repo 名>/<ブランチの slug>`
  （`packages/protocol/src/worktreePath.test.ts:36-37` `defaultCheckoutPath`）＝置き場から深さ 2 のディレクトリ。`--worktree-dir` で変えられる（`config.ts` `worktreeDir`）。
- F5.4 保存したレイアウト（`session.json`）には workspace・pane の cwd が絶対パスで入る（`SessionService.test.ts:1300-1302` の `createWorkspace("/repo/.wtm/worktrees/feat", …)`
  が `workspace.cwd` に残る）。worktree を動かすと、ここの古いパスは使えない場所を指す。

### Q6: `git worktree repair`（この環境の git 2.43.0 で実測。`scratchpad/research/`）

- F6.1 `git worktree add ../old/wt1` → `mv old new` の後、元の repo の `git worktree list` は古いパスを `prunable` と表示する。
  `git -C new/wt1 worktree repair` は `repair: gitdir incorrect: …` を出して終了コード 0、以後 `git worktree list` は新しいパスを示し、worktree の中の `git status` が通る。
  2 回目の repair は何も出さず 0。
- F6.2 worktree の `.git` はファイル（`gitdir: <repo>/.git/worktrees/<id>`）。置き場から深さ 3 の `.git` ファイルが worktree の印になる（F5.3）。

### Q7: ブラウザ側

- F7.1 localStorage のキー: `wtm.prefs.v1`（好み全般。`packages/web/src/store/view.ts:56`）、`wtm.seen.v1`（`store/seen.ts:6`）、`wtm.hint.prefixHelp.v1`（`view.ts:58`）、
  `wtm.themeBoot.v1`（`packages/web/public/theme-boot.js:12`）。
- F7.2 sessionStorage の `wtm.view.v1`（`:<machineId>` 付きもある。`view.ts:9,16-17`）はタブごとの表示位置。
- F7.3 cookie は F5.2。ブラウザの cookie は名前が変わるので、移行の後は一度ログインし直す（token が要る）。

## 影響範囲

- 全パッケージ（protocol・server・cli・web・e2e）のソースとテスト、`packages/server/assets/agent-hook-report.cjs`、`packages/web/index.html`・`public/theme-boot.js`、
  docs 6 本・AGENTS.md・LICENSE・NOTICE・`third_party/herdr/README.md`・`.gitignore`・`.aidev/config.yml`・`.aidev/backlog/product-roadmap.md`、`pnpm-lock.yaml`。
- 手元の状態（移行スクリプトの対象）: 状態ディレクトリ・`~/.wtmctl`・`~/.wtm/worktrees`・8 種のエージェントの hook。

## 実現性 / リスク

- 置換は機械的にできる（F1.3 の例外を先に置き換える）。パッケージ名を変えると `node_modules` の workspace のリンクも変わるので `pnpm install` が要る。
- 移行スクリプトの JSON の書き換えは、`wtm-agent-report` という本製品固有の文字列の置換で足りる（JSON の構造を解かなくてよい。F4.3）。
- `.bat` はこの環境で実行できない（cmd が無い）。文字列の置換は cmd だけでは難しい。

## 実装アンカー

- A1: 状態ディレクトリの名前（`packages/server/src/config.ts:64-73` `defaultStateDir`）
- A2: ロックのファイル名（`packages/server/src/persist/StateDirLock.ts:7`）
- A3: 画像のファイル名（`packages/server/src/image/ImageStore.ts:19,82`）
- A4: hook の名前（`packages/server/src/agent/AgentIntegrationInstaller.ts:15,124,153,165`）、hook のスクリプトの環境変数（`packages/server/assets/agent-hook-report.cjs:34-35`）
- A5: CLI のキャッシュ（`packages/cli/src/session.ts:26`）
- A6: worktree の既定の置き場（`packages/server/src/git/WorktreeService.ts:23`）
- A7: cookie 名（`packages/server/src/auth/AuthService.ts:9`）
- A8: ページのタイトル（`packages/web/index.html:6`、`packages/web/src/serverSession/documentTitle.ts`）
- A9: 中継の目印（`packages/server/src/machine/bridgeFrames.ts:12`）、リモートのコマンド（`packages/server/src/machine/sshArgs.ts:37`）
- A10: smoke のコマンド（`.aidev/config.yml` `smokeCommands`）
- A11: 移行スクリプトの置き場 `scripts/`（既存は `scripts/run-quiet.mjs` だけ）。vitest の対象の決め方（ルートの `vitest.config.ts`）は未特定 — coding 側で確かめる。

## 実装時の注意

- `pnpm -s` は失敗しても何も出さないことがある。終了コードをファイルに残して確かめる（AGENTS の運用メモ）。
- prettier は新しいファイルか HEAD で整形済みのファイルだけ（置換で触る既存のファイルには当てない）。
- 移行スクリプトのテストは、一時的な HOME・XDG・`CLAUDE_CONFIG_DIR` 等を必ず渡す（渡し忘れると利用者の本物の `~/.claude` を書き換える）。

## design への申し送り

- 名前の対応表（一つの古い名前に一つの新しい名前）と、置換の順序（F1.3）を決める。
- 表示名（Sodashitsu）とコマンド名（soda）の使い分け（ページのタイトル・LICENSE・NOTICE・docs の見出し）。
- 移行スクリプトの検査の順序（全部検査してから動かす）、hook のスクリプトの置き換え方（同梱の版を写す）、`session.json` の worktree のパスの書き換え、
  CLI のキャッシュの cookie 名の書き換え、`.bat` の文字列の置換の手段。
