# 調査: agent skill ファイル・pane の環境変数・自分の pane への操作の歯止め

一次資料 herdr は `/workspaces/web-tn-multiplexer/scratchpad/herdr`（以下 `[H]`）。本製品はこの worktree（以下 `[P]`）。すべて主エージェントが直読した。

## 調査の問い

- Q1: herdr の skill ファイルは何を教え、どう配り、どんな歯止めを置いているか。
- Q2: herdr は pane の環境に何を入れ、CLI はそれをどう使うか。自分の pane を対象にする操作を止めているか。
- Q3: 本製品は pane の環境に何を入れているか。サーバの環境に秘密が含まれうるか。
- Q4: pane を起動する時点で、サーバの待ち受けのアドレス・ポートは決まっているか。
- Q5: pane の中から wtmctl がループバックの URL でつないだとき、Origin/Host の検査を通るか。TLS の場合はどうか。
- Q6: wtmctl の各コマンドで、自分の pane かどうかを判定できる材料（snapshot）はいつ手に入るか。
- Q7: wtmctl に Markdown のファイルを同梱して実行時に読めるか（ビルドの形）。

## 判明した事実

### Q1: herdr の skill

- F1.1 skill は `[H]skills/herdr/SKILL.md`（214 行）。front matter は `name: herdr` と、「利用者が herdr を明示したときだけ使う。`HERDR_ENV=1` が要る」
  という `description`（`:1-4`）。
- F1.2 本文の最初の指示は「`test "${HERDR_ENV:-}" = 1` で確かめ、失敗したら herdr の中にいないと言って止まる。herdr の外からフォーカス中の
  session を調べたり操作したりしない」（`:10-16`）。
- F1.3 構文の正典は使っているバイナリ（`herdr --help` と各グループ）で、素の `herdr`（TUI が起動する）や、引数を省いた変更系のコマンド
  （既定値で実行されてしまう）で探らない（`:20-45`）。
- F1.4 ID は応答の JSON から読む・`HERDR_PANE_ID` 等で呼び出し元が分かる（`:61-91`）。エージェントの起動と協調（`:107-171`）：
  隣の pane を作る・`agent start`・`agent prompt --wait`・`blocked` は利用者に確かめてから答える・`timeout`/`stalled` の後に盲目的に送り直さない。
  普通のコマンドを別の pane で走らせる（`:173-202`）。
- F1.5 安全と協調の規則（`:204-214`）：フォーカスを奪わない・他のクライアントのフォーカス中の pane に頼らない・ID は JSON から・
  **自分が作っていない workspace・tab・pane・session を閉じない**・サーバを止めない・エラーは stderr の JSON で終了コード 1、構文の誤りは 2。
- F1.6 配り方: バイナリに埋め込み（`[H]src/main.rs:441-442` の `include_str!("../skills/herdr/SKILL.md")`）、`herdr --skill` で出す
  （`[H]src/main.rs:725-729`）。文書は「skill の仕組みのあるエージェントには `herdr` という名前の skill として入れる。無ければプロジェクトか利用者の
  指示に貼る」（`[H]docs/next/website/src/content/docs/agent-skill.mdx:24, 44`）。安全の規則は「`HERDR_ENV=1` が無ければ止まる。herdr の外の
  エージェントが自分のものでない session を操作しないため」（同 `:55-59`）。

### Q2: herdr の pane の環境と CLI

- F2.1 pane の起動時に `HERDR_ENV=1`・`HERDR_SOCKET_PATH`・`HERDR_BIN_PATH` と、`HERDR_WORKSPACE_ID`・`HERDR_TAB_ID`・`HERDR_PANE_ID` を入れる
  （`[H]src/pane.rs:148-174`・`[H]src/integration/env.rs:28-33`）。`CODEX_THREAD_ID`・`OMPCODE` は受け継がせない（`pane.rs:149-152`）。
- F2.2 herdr が管理する変数は、呼び出し側の `--env` と衝突しても herdr の値が勝つ（`[H]docs/next/website/src/content/docs/cli-reference.mdx:518`）。
- F2.3 CLI は `HERDR_PANE_ID` を `--current` と `pane split` の対象の省略時に使う（`[H]src/cli/target.rs:203-210`・`[H]src/cli/pane.rs:101-138`・
  `cli-reference.mdx:227-230`）。`caller_pane_id` の使い道はこれだけで、**自分の pane を対象にする操作を CLI が断る処理は無い**
  （`grep caller_pane_id src/cli` の結果が上の箇所だけ）。
- F2.4 認証: CLI はソケットのファイルの権限で守られ、token は無い（`HERDR_SOCKET_PATH`。`[H]src/api/mod.rs:20, 98-100`）。

### Q3: 本製品の pane の環境

- F3.1 `envForPane` は `process.env`（サーバの環境）を丸ごと写し、`WTM_PANE_ID` を入れ、report の socket があれば `WTM_AGENT_REPORT_SOCKET` を入れる
  （`[P]packages/server/src/session/SessionService.ts:1039-1043`）。report の socket が無いとき、サーバが受け継いだ古い `WTM_AGENT_REPORT_SOCKET` は
  そのまま pane に渡る。
- F3.2 すべての pane の起動（新規・分割・復元・スクロールバックのエディタ）が `spawnForPane` を通り、そこで `envForPane` を使う
  （`SessionService.ts:270, 541, 621, 657, 1066-1076, 1176`）。
- F3.3 サーバ自身は token を環境から読まない（状態ディレクトリの auth.json。`[P]packages/server/src/composeServer.ts:100-104`）。サーバが読む環境変数は
  `WTM_WINDOWS_CONPTY` 等だけ（`grep` の結果）。ただし、サーバを起動したシェルで `WTMCTL_TOKEN`・`WTMCTL_URL` を export していれば、F3.1 の丸写しで
  そのまま全 pane に渡る。
- F3.4 `WTM_PANE_ID` を使うのは公式フック連携の report スクリプト（`[P]packages/server/assets/agent-hook-report.test.ts:36` が env の形を示す）。

### Q4: pane を起動する時点の待ち受け

- F4.1 `listen()` は bind（`composeServer.ts:236-241`）→ token → report socket → 復元または最初の workspace の作成（`:254-260`。ここで最初の pane が起動する）
  の順。**pane が起動する時点で待ち受けは済んでいる**。
- F4.2 `SessionService` は `listen()` より前に組み立てる（`composeServer.ts:153`）ので、URL は組み立て時には渡せず、後から読める形（関数・setter）が要る。
- F4.3 `--port` は 1〜65535 だけを受ける（`[P]packages/server/src/config.ts:79`）。ただしテストの補助 `listenOnFreePort` は `listen(0)` した後に
  `opts.port` を書き換える流儀がある（`[P]packages/server/src/composeServerOnFreePort.ts:22-33`）ので、実際のポートは `server.address()` から読むのが確実。
- F4.4 待ち受けのホストが全インタフェース（`0.0.0.0`・`::`）かは `isWildcardHost`（`[P]packages/server/src/util/net.ts`）。URL の host 部の形は `formatUrlHost`（IPv6 を角括弧で囲む）。
  ゾーン付きの IPv6 は WHATWG URL にできない（`util/net.ts` の `accessUrls` のコメント）。

### Q5: Origin/Host の検査

- F5.1 許可する Host は常に `localhost`・`127.0.0.1`・`::1`（ポート付き）を含み、全インタフェースならこのマシンの全アドレスとホスト名、
  そうでなければ `--host` の値を足す（`[P]packages/server/src/auth/OriginPolicy.ts:33-59`）。Origin は `<scheme>://<Host>` と一致する必要がある（`:61-69`）。
- F5.2 wtmctl は Origin と Host を接続先の URL から組み立てる（`[P]packages/cli/src/wsClient.ts:203-204`・`[P]packages/cli/src/httpAuth.ts:9-14`）。
  よって、ループバックか全インタフェースで待ち受けるサーバに `http(s)://127.0.0.1:<port>` でつなぐと検査を通る。特定の非ループバックのホストで
  待ち受けるサーバ（証明書が必須。`config.ts:121-124`）にはループバックでは届かないので、そのホストの URL を使う必要がある。
- F5.3 TLS: wtmctl は Node の既定の証明書の検証を使う（CA の追加の仕組みは持たない）。自己署名や mkcert の証明書では、利用者が Node に CA を
  教える（`NODE_EXTRA_CA_CERTS`）必要があるのは pane の外と同じ。`docs/tls-setup.md:66` の mkcert の例は `localhost 127.0.0.1` を含む。

### Q6: 自分の pane の判定材料

- F6.1 変更系のコマンドはどれも、操作の前に `client.hello()` で snapshot を得ている: `pane close`（`[P]packages/cli/src/commands/pane.ts:29-35`）・
  `pane input`/`run`（`:44-67` の `requirePaneExists`）・`tab close`（`[P]packages/cli/src/commands/tab.ts:24-30`）・`workspace close`（`[P]packages/cli/src/commands/workspace.ts:30-36`）・
  `agent prompt`/`send-keys`（`[P]packages/cli/src/commands/agent.ts:310-316, 340-345`。名前は `resolveAgentTarget` で pane ID に解決）・`agent start`（`[P]packages/cli/src/commands/agentStart.ts:62-65`）・
  `pane attach`（`[P]packages/cli/src/commands/attach.ts:95` の `runPaneAttach`）。
- F6.2 snapshot の pane は `tabId`、tab は `workspaceId` を持つ（`[P]packages/protocol/src/model.ts:50-53`）。よって「自分の pane を含む tab・workspace」を
  追加の往復なしに判定できる。
- F6.3 CLI 側で投げた `RpcFailure(code, message)` は stderr の JSON と終了コード 1 になる（`[P]packages/cli/src/output.ts` の `classify`/`reportAndExit`）。

### Q7: ファイルの同梱

- F7.1 wtmctl は `tsc`（`rootDir: src`・`outDir: dist`）でビルドし、`bin` は `dist/main.js`（`[P]packages/cli/tsconfig.json`・`[P]packages/cli/package.json`）。
  tsc は `.md` を dist に写さない。
- F7.2 サーバは同梱物（`assets/agent-hook-report.cjs`）を `import.meta.dirname` からの相対（`dist/../assets`）で引く（`[P]packages/server/src/composeServer.ts:89-92`）。
  同じ形なら、`packages/cli/skills/...` を `src`・`dist` のどちらからも `../skills/...` で引ける。
- F7.3 コマンドの一覧は `cliArgs.ts` の `USAGE`（`:11-35`）と `main.ts` の `printHelp`（`:25-60`）の 2 か所にある。

## 影響範囲

- server: `SessionService`（pane の環境の組み立て）・`composeServer`（待ち受けた後に URL を決める）・`util/net.ts`（URL の組み立て）。
- cli: `cliArgs.ts`（接続先の優先順位・`skill` サブコマンド・呼び出し元の情報）・`main.ts`（help・分岐）・各変更系コマンド（歯止め）・新しい skill ファイル。
- docs: `docs/wtmctl.md`・`docs/herdr-parity.md`。

## 実現性 / リスク

- 実現できる。サーバ・プロトコルの RPC は変えない（歯止めは CLI 側だけで判定できる。F6）。
- リスク: TLS で全インタフェースに待ち受ける構成では、証明書に `127.0.0.1` が無いと pane の中の wtmctl が証明書の検証で失敗する（F5.3）。
  利用者は `WTMCTL_URL` を export して上書きできる（FR5 の優先順位）。docs に書く。
- リスク: 歯止めは CLI の中の判定なので、安全の境界ではない（環境変数を消せば効かない・生の `/ws` からは効かない）。docs と skill にそう書く。

## 実装アンカー

- A1: pane の環境の組み立て（`packages/server/src/session/SessionService.ts:1039-1043` `envForPane`）
- A2: 待ち受けの後・復元の前（`packages/server/src/composeServer.ts:236-254` の `listen()`）
- A3: URL の host 部の形（`packages/server/src/util/net.ts` `formatUrlHost`・`isWildcardHost`）
- A4: 接続先の決定（`packages/cli/src/cliArgs.ts:154-159` `globalOptsFrom`）
- A5: コマンドの一覧（`packages/cli/src/cliArgs.ts:11-35` `USAGE`・`packages/cli/src/main.ts:25-60` `printHelp`）
- A6: 各変更系コマンドの `hello()` の直後（F6.1 の各行）
- A7: 同梱物の引き方の手本（`packages/server/src/composeServer.ts:89-92` `agentHookScriptFor`）
- A8: 実サーバ・実 PTY の結合テストの手本（`packages/cli/src/main.integration.test.ts` の `composeServerOnFreePort`）

## 実装時の注意

- `exactOptionalPropertyTypes` が有効（`packages/cli/src/commands/workspace.ts:23` のコメント）。任意のプロパティに `undefined` を代入しない。
- `GlobalOpts` のリテラルはテストの多くのファイルにある（`{ url, token }`）。形を変えるなら任意のプロパティで足す。
- prettier は整形済みのファイルにだけ（利用者の memory）。

## design への申し送り

- 環境変数の名前と「pane の中にいる」印（`WTM_PANE_ID` で兼ねるか）。
- 歯止めの置き場（CLI）と、同じサーバかどうかの判定（接続先の origin と pane の環境の URL の origin の比較）。
- skill の言語（本製品の docs は日本語）と、置き場（`packages/cli/skills/wtmctl/SKILL.md`）。
