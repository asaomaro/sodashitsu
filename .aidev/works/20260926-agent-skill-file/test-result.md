# テスト結果: agent skill ファイル・pane の環境変数・自分の pane への操作の歯止め

## 実行したもの

- `pnpm -s build` — exit 0
- `pnpm -s typecheck` — exit 0（出力と終了コードを分けて記録。`> file 2>&1; echo $?`）
- `pnpm -s test` — **202 files / 3896 passed / 0 failed / 0 skipped**（exit 0。1 回の通常実行）
- `aidev smoke` — pass（exit 0・4 本。4 本目に `wtmctl skill` を足した）
- ビルド済みの wtmctl で `wtmctl skill` の出力・使い方の誤り（AC5・AC6）
- 実サーバ（ビルド済み・空きポート・一時の状態ディレクトリ）の pane の中から、ビルド済みの wtmctl で `pane close "$WTM_PANE_ID"`・`tab close <自分の tab>`（AC7・AC10・AC11・AC12 の実物での確認。1 回）
- 負の確認（変異）29 通り＋順序の誤り 1 通り（下記。各 1 回の通常実行）
- E2E は動かしていない（利用者の指示）。負荷試験・繰り返し実行もしていない。

## 受け入れ基準ごとの判定

- AC1: pass — `skill.test.ts`（front matter の `name: wtmctl`・`description`）と、FR1 (a)〜(h) の各節（「まず確かめる」「コマンドを知る」「接続と認証」「ID と自分の位置」「隣の pane で…」「エージェントを起動して…」「作法」「自分の pane の歯止め」）。各項の突き合わせは review で行う。
- AC2: pass — `skill.test.ts`「最初の節で pane の中にいるかを確かめ、無ければ止まる」。変異 N23 で検出。
- AC3: pass — `skill.test.ts`「本文の wtmctl のコマンドはすべて実在する」（USAGE_LINES と照合）。変異 N24（存在しない `wtmctl pane frobnicate` を足す）で検出。
- AC4: pass — `skill.test.ts`「wtmctl の全コマンドが本文に出てくる」。変異 N25（`wtmctl watch` を消す）・N27（USAGE_LINES から `wtmctl skill` を消す）で検出。
- AC5: pass — `skill.test.ts`（`readSkill` と `runSkill` がファイルそのもの）＋ビルド済みの wtmctl を誰も待ち受けていない `WTMCTL_URL` で打ち、exit 0・`cmp` 一致（下の生出力）。smoke の 4 本目も同じ。
- AC6: pass — `cliArgs.test.ts`（`skill extra`・`skill --x`・`skill --url`）＋ビルド済みで exit 2（下の生出力）。変異 N8 で検出。
- AC7: pass — `paneEnv.integration.test.ts`（実サーバ・実 PTY。起動時に作られた最初の pane と、wtmctl で作った pane の `WTM_SERVER_URL` が `http://127.0.0.1:<待ち受けたポート>`）。URL を決める位置を復元の後へ動かす変異 N28 で最初の pane のテストが落ちる。手動でも、既定以外のポートのサーバの pane の中で `--url` 無しの wtmctl がつながった（下の生出力）。
- AC8: pass — `net.test.ts` の `paneServerUrl` の表（0.0.0.0・::・::1・[::1]・localhost・IPv4・名前・ゾーン付き IPv6）。変異 N1 で検出。
- AC9: pass — `paneEnv.test.ts`（受け継いだ 5 つが消える・管理する値が入る・socket が無ければ無い・win32 だけ大文字小文字を区別しない）＋結合テスト（テストのプロセスに置いた `WTMCTL_TOKEN`・`WTMCTL_URL`・古い `WTM_SERVER_URL`・古い `WTM_AGENT_REPORT_SOCKET` が pane に見えない）。変異 N2・N2b・N3・N4・N5・N5b で検出。
- AC10: pass — `cliArgs.test.ts` の 4 段の優先順位。変異 N6 で検出。
- AC11: pass — `commands/{pane,attach,agentStart,agentRename}.test.ts`（9 コマンドのうち pane 単位の 7 つ。名前で指したエージェントも・`--wait` の経路も）と `selfGuard.test.ts`。メッセージの抜け道の案内・接続（`withSession`）や要求が無いことも確かめる。変異 N14〜N20（各呼び出しを 1 つずつ消す）・N9 で検出。手動でも `self_target`（exit 1）を確認。
- AC12: pass — `commands/{tab,workspace}.test.ts`（自分の tab・workspace は要求を送らず self_target、別のものは閉じる）。変異 N12・N13・N21・N22 で検出。手動でも `tab close` が `self_target`。
- AC13: pass — `selfGuard.test.ts`（caller が無い・別の origin・URL として読めない・http(s) でない・別の pane）と `cliArgs.test.ts`（`WTM_PANE_ID`/`WTM_SERVER_URL` が空・無い）。変異 N7・N9・N11 で検出。ループバックの名前の違いは同じサーバとみなす（decisions.md D7。変異 N10 で検出）。
- AC14: pass — `pane split`・`pane read`・自分の pane の `agent get`・`agent rename` が caller つきでも断られないテスト。それ以外（`agent wait`・`agent read` 等）はコードに呼び出しが無い（`grep assertNotSelf packages/cli/src/commands` は 9 箇所だけ）。
- AC15: pass — `paneEnv.test.ts`「token はどの値にも含まれない」と結合テスト（`WTMCTL_TOKEN` が `unset`）。変異 N2 で検出。
- AC16: pass（内容の突き合わせは review）— `docs/wtmctl.md` の新しい節と「herdr との対応と違い」、`docs/herdr-parity.md` の H39。
- AC17: pass — 既存のテストは期待値を変えずに全部通る（`pnpm -s test` 3896 passed。既存テストの変更は追記だけ）。

## 失敗の証跡

このラウンドでは（受け入れの）失敗が発生していない。以下は負の確認（実装を壊して、テストが落ちることを確かめたもの）の生の出力。

### ビルド済みの wtmctl（AC5・AC6）

```
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill > out.md; echo exit=$?; cmp out.md packages/cli/skills/wtmctl/SKILL.md && echo identical
exit=0
identical
$ node packages/cli/dist/main.js skill extra; echo exit=$?
wtmctl: unexpected argument: extra
wtmctl skill
exit=2
$ node packages/cli/dist/main.js skill --x; echo exit=$?
（以下、使い方の一覧が続く）
```

### 実サーバの pane の中から（AC7・AC10・AC11・AC12）

サーバは空きポート（既定の 7780 ではない）で起動。pane の中の wtmctl には `--url` を渡していない（`WTM_SERVER_URL` でつながる）。

```
$ wtmctl login --url http://127.0.0.1:46387 --token <TOKEN>
{"ok":true}
exit=0
first pane: p1
$ (pane の中で) wtmctl pane close "$WTM_PANE_ID"; echo exit=$?  ・ wtmctl pane close のあと WTM_PANE_ID= で抜け道を試さない（自分の pane が閉じるため）
--- pane read ---
sr024680@OSK2-024680-2:/tmp/tmp.XXXX$ export HOME=/tmp/tmp.XXXX/home; echo "url=$WTM_SERVER_URL id=$WTM_PANE_ID tok=${WTMCTL_TOKEN-unset}"; node /workspaces/web-tn-multiplexer-wt/agent-skill-file/packages/cli/dist/main.js pane close "$WTM_PANE_ID"; echo __rc:$?; node /workspaces/web-tn-multiplexer-wt/agent-skill-file/packages/cli/dist/main.js tab close $(node /workspaces/web-tn-multiplexer-wt/agent-skill-file/packages/cli/dist/main.js snapshot | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).panes[0].tabId))'); echo __rc2:$?; node /workspaces/web-tn-multiplexer-wt/agent-skill-file/packages/cli/dist/main.js agent list >/dev/null; echo __rc3:$?
url=http://127.0.0.1:46387 id=p1 tok=unset
{"error":{"code":"self_target","message":"refusing to close pane p1 because it is the pane this wtmctl runs in (WTM_PANE_ID=p1); to do it on purpose, run with WTM_PANE_ID unset, e.g. \"WTM_PANE_ID= wtmctl ...\""}}
__rc:1
{"error":{"code":"self_target","message":"refusing to close tab t1 because it contains the pane this wtmctl runs in (WTM_PANE_ID=p1); to do it on purpose, run with WTM_PANE_ID unset, e.g. \"WTM_PANE_ID= wtmctl ...\""}}
__rc2:1
__rc3:0
```

### 負の確認（変異 29 通り。各 1 回。`restored_cmp=ok` は元のファイルとバイト一致に戻したことの確認）

```
=== N1 packages/server/src/util/net.ts (test packages/server/src/util/net.test.ts) exit=1 restored_cmp=ok
--- mutation: 'isWildcardHost(bare) ? (bare === "::" ? "::1" : "127.0.0.1") : bare' -> 'bare'
     × http 0.0.0.0:7781 -> http://127.0.0.1:7781 17ms
     × https :::8443 -> https://[::1]:8443 2ms
      Tests  2 failed | 26 passed (28)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/util/net.test.ts > paneServerUrl（pane の環境の WTM_SERVER_URL。20260926-agent-skill-file） > http 0.0.0.0:7781 -> http://127.0.0.1:7781
AssertionError: expected 'http://0.0.0.0:7781' to be 'http://127.0.0.1:7781' // Object.is equality
 FAIL  src/util/net.test.ts > paneServerUrl（pane の環境の WTM_SERVER_URL。20260926-agent-skill-file） > https :::8443 -> https://[::1]:8443
AssertionError: expected 'https://[::]:8443' to be 'https://[::1]:8443' // Object.is equality

=== N3 packages/server/src/session/paneEnv.ts (test packages/server/src/session/paneEnv.test.ts) exit=1 restored_cmp=ok
--- mutation: 'const caseInsensitive = platform === "win32";' -> 'const caseInsensitive = false;'
     × 小文字の変種: win32 では消え、linux では残る（利用者の別の変数） 10ms
      Tests  1 failed | 4 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > 小文字の変種: win32 では消え、linux では残る（利用者の別の変数）
AssertionError: expected { wtmctl_token: 't', …(3) } to deeply equal { other: 'x', WTM_PANE_ID: 'p1' }

=== N4 packages/server/src/session/paneEnv.ts (test packages/server/src/session/paneEnv.test.ts) exit=1 restored_cmp=ok
--- mutation: 'if (managed.serverUrl) env["WTM_SERVER_URL"] = managed.serverUrl;' -> ''
     × 受け継いだ wtmctl の設定と古い WTM_* を消し、サーバの値を入れる（利用者の変数は写す） 12ms
      Tests  1 failed | 4 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > 受け継いだ wtmctl の設定と古い WTM_* を消し、サーバの値を入れる（利用者の変数は写す）
AssertionError: expected { PATH: '/usr/bin', …(3) } to deeply equal { PATH: '/usr/bin', …(4) }

=== N6 packages/cli/src/cliArgs.ts (test packages/cli/src/cliArgs.test.ts) exit=1 restored_cmp=ok
--- mutation: 'env["WTMCTL_URL"] ?? (serverUrl ? serverUrl : DEFAULT_URL)' -> '(serverUrl ? serverUrl : env["WTMCTL_URL"] ?? DEFAULT_URL)'
     × --url > WTMCTL_URL > WTM_SERVER_URL > 既定（AC10） 13ms
      Tests  1 failed | 113 passed (114)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/cliArgs.test.ts > parseArgs — pane の中の接続先と呼び出し元（20260926-agent-skill-file） > --url > WTMCTL_URL > WTM_SERVER_URL > 既定（AC10）
AssertionError: expected { kind: 'snapshot', opts: { …(3) } } to match object { opts: { url: 'http://envhost:2' } }

=== N7 packages/cli/src/cliArgs.ts (test packages/cli/src/cliArgs.test.ts) exit=1 restored_cmp=ok
--- mutation: 'if (paneId && serverUrl) opts.caller' -> 'if (paneId) opts.caller = { paneId, serverUrl: serverUrl ?? "" }; if (false) opts.caller'
     × WTM_SERVER_URL が無い なら caller を持たない（AC13） 20ms
     × WTM_SERVER_URL が空 なら caller を持たない（AC13） 3ms
      Tests  2 failed | 112 passed (114)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/cliArgs.test.ts > parseArgs — pane の中の接続先と呼び出し元（20260926-agent-skill-file） > WTM_SERVER_URL が無い なら caller を持たない（AC13）
 FAIL  src/cliArgs.test.ts > parseArgs — pane の中の接続先と呼び出し元（20260926-agent-skill-file） > WTM_SERVER_URL が空 なら caller を持たない（AC13）
AssertionError: expected [ 'caller', 'token', 'url' ] to deeply equal [ 'token', 'url' ]

=== N8 packages/cli/src/cliArgs.ts (test packages/cli/src/cliArgs.test.ts) exit=1 restored_cmp=ok
--- mutation: 'rejectExtra(positionals, 0, "wtmctl skill");' -> ''
     × ["skill","extra"] は使い方の誤り（AC6） 6ms
      Tests  1 failed | 113 passed (114)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/cliArgs.test.ts > parseArgs — skill > ["skill","extra"] は使い方の誤り（AC6）
AssertionError: expected function to throw an error, but it didn't

=== N9 packages/cli/src/selfGuard.ts (test packages/cli/src/selfGuard.test.ts) exit=1 restored_cmp=ok
--- mutation: 'if (target === undefined || target !== serverKeyOf(caller.serverUrl)) return undefined;' -> 'if (target === undefined) return undefined;'
     × 接続先の origin が pane のサーバと違えば断らない（別のサーバの同じ ID） 23ms
     × 既定のポートの省略は同じとみなし、ループバックでないホストは区別する 5ms
     × URL として読めなければ断らない 2ms
     × caller が無い・別のサーバなら断らない 5ms
     × 自分の pane が snapshot に無い・caller が無い・別のサーバなら断らない 2ms
      Tests  5 failed | 12 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/selfGuard.test.ts > assertNotSelfPane > 接続先の origin が pane のサーバと違えば断らない（別のサーバの同じ ID）
AssertionError: expected [Function] to not throw an error but 'RpcFailure: refusing to close pane p1…' was thrown
 FAIL  src/selfGuard.test.ts > assertNotSelfPane > 既定のポートの省略は同じとみなし、ループバックでないホストは区別する
AssertionError: expected [Function] to not throw an error but 'RpcFailure: refusing to close pane p1…' was thrown
 FAIL  src/selfGuard.test.ts > assertNotSelfPane > URL として読めなければ断らない

=== N10 packages/cli/src/selfGuard.ts (test packages/cli/src/selfGuard.test.ts) exit=1 restored_cmp=ok
--- mutation: 'LOOPBACK_HOSTS.has(u.hostname) ? "loopback" : u.hostname' -> 'u.hostname'
     × ループバックの名前の違い（localhost・127.0.0.1・[::1]）は同じサーバとして断る 14ms
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/selfGuard.test.ts > assertNotSelfPane > ループバックの名前の違い（localhost・127.0.0.1・[::1]）は同じサーバとして断る
AssertionError: expected function to throw an error, but it didn't

=== N11 packages/cli/src/selfGuard.ts (test packages/cli/src/selfGuard.test.ts) exit=1 restored_cmp=ok
--- mutation: 'if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;' -> ''
     × http(s) でない URL（origin が "null"）同士でも一致とみなさない 9ms
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/selfGuard.test.ts > assertNotSelfPane > http(s) でない URL（origin が "null"）同士でも一致とみなさない
AssertionError: expected [Function] to not throw an error but 'RpcFailure: refusing to close pane p1…' was thrown

=== N12 packages/cli/src/selfGuard.ts (test packages/cli/src/selfGuard.test.ts) exit=1 restored_cmp=ok
--- mutation: 'if (own !== undefined && own.tabId === tabId)' -> 'if (own !== undefined)'
     × 別の tab なら断らない 12ms
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/selfGuard.test.ts > assertNotSelfTab > 別の tab なら断らない
AssertionError: expected [Function] to not throw an error but 'RpcFailure: refusing to close tab t2 …' was thrown

=== N13 packages/cli/src/selfGuard.ts (test packages/cli/src/selfGuard.test.ts) exit=1 restored_cmp=ok
--- mutation: 'if (tab !== undefined && tab.workspaceId === workspaceId)' -> 'if (tab!.workspaceId === workspaceId)'
     × 自分の pane の tab が snapshot に無ければ断らない（投げない） 11ms
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/selfGuard.test.ts > assertNotSelfWorkspace > 自分の pane の tab が snapshot に無ければ断らない（投げない）
AssertionError: expected [Function] to not throw an error but 'TypeError: Cannot read properties of …' was thrown
"TypeError: Cannot read properties of undefined (reading 'workspaceId')"

=== N14 packages/cli/src/commands/pane.ts (test packages/cli/src/commands/pane.test.ts) exit=1 restored_cmp=ok
--- mutation: '  assertNotSelfPane(cmd.opts, cmd.paneId, "close");' -> ''
     × pane close p1 は接続せずに self_target 10ms
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/pane.test.ts > 自分の pane の歯止め（20260926-agent-skill-file。AC11・AC13・AC14） > pane close p1 は接続せずに self_target
AssertionError: promise resolved "undefined" instead of rejecting

=== N15 packages/cli/src/commands/pane.ts (test packages/cli/src/commands/pane.test.ts) exit=1 restored_cmp=ok
--- mutation: '  assertNotSelfPane(cmd.opts, cmd.paneId, "send input to");' -> ''
     × pane input p1 は接続せずに self_target 10ms
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/pane.test.ts > 自分の pane の歯止め（20260926-agent-skill-file。AC11・AC13・AC14） > pane input p1 は接続せずに self_target
AssertionError: promise resolved "undefined" instead of rejecting

=== N16 packages/cli/src/commands/pane.ts (test packages/cli/src/commands/pane.test.ts) exit=1 restored_cmp=ok
--- mutation: '  assertNotSelfPane(cmd.opts, cmd.paneId, "run a command in");' -> ''
     × pane run p1 は接続せずに self_target 14ms
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/pane.test.ts > 自分の pane の歯止め（20260926-agent-skill-file。AC11・AC13・AC14） > pane run p1 は接続せずに self_target
AssertionError: promise resolved "undefined" instead of rejecting

=== N17 packages/cli/src/commands/attach.ts (test packages/cli/src/commands/attach.test.ts) exit=1 restored_cmp=ok
--- mutation: '  assertNotSelfPane(cmd.opts, cmd.paneId, "attach to");' -> ''
     × 自分の pane には、端末を触らず・接続せずに self_target 24ms
      Tests  1 failed | 20 passed (21)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/attach.test.ts > runPaneAttach — 自分の pane（20260926-agent-skill-file。AC11） > 自分の pane には、端末を触らず・接続せずに self_target
AssertionError: promise resolved "undefined" instead of rejecting

=== N18 packages/cli/src/commands/agentStart.ts (test packages/cli/src/commands/agentStart.test.ts) exit=1 restored_cmp=ok
--- mutation: '  assertNotSelfPane(cmd.opts, cmd.paneId, "start an agent in");' -> ''
     × 自分の pane には接続せずに self_target 9ms
      Tests  1 failed | 12 passed (13)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/agentStart.test.ts > runAgentStart — 自分の pane（20260926-agent-skill-file。AC11） > 自分の pane には接続せずに self_target
AssertionError: promise resolved "undefined" instead of rejecting

=== N19 packages/cli/src/commands/agent.ts (test packages/cli/src/commands/agentRename.test.ts) exit=1 restored_cmp=ok
--- mutation: '    assertNotSelfPane(cmd.opts, target.paneId, "send a prompt to the agent in");' -> ''
     × agent prompt reviewer（--wait=false）は自分の pane なので送らない 4ms
     × agent prompt p2（--wait=false）は自分の pane なので送らない 1ms
     × agent prompt reviewer（--wait=true）は自分の pane なので送らない 5002ms
      Tests  3 failed | 16 passed (19)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/agentRename.test.ts > 自分の pane の歯止め（20260926-agent-skill-file。AC11・AC14） > agent prompt reviewer（--wait=false）は自分の pane なので送らない
 FAIL  src/commands/agentRename.test.ts > 自分の pane の歯止め（20260926-agent-skill-file。AC11・AC14） > agent prompt p2（--wait=false）は自分の pane なので送らない
TypeError: Cannot read properties of undefined (reading 'name')
 FAIL  src/commands/agentRename.test.ts > 自分の pane の歯止め（20260926-agent-skill-file。AC11・AC14） > agent prompt reviewer（--wait=true）は自分の pane なので送らない
Error: Test timed out in 5000ms.
TypeError: Cannot read properties of undefined (reading 'instanceId')

=== N20 packages/cli/src/commands/agent.ts (test packages/cli/src/commands/agentRename.test.ts) exit=1 restored_cmp=ok
--- mutation: '    assertNotSelfPane(cmd.opts, target.paneId, "send keys to the agent in");' -> ''
     × agent send-keys reviewer は自分の pane なので送らない 5ms
     × agent send-keys p2 は自分の pane なので送らない 1ms
      Tests  2 failed | 17 passed (19)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/agentRename.test.ts > 自分の pane の歯止め（20260926-agent-skill-file。AC11・AC14） > agent send-keys reviewer は自分の pane なので送らない
 FAIL  src/commands/agentRename.test.ts > 自分の pane の歯止め（20260926-agent-skill-file。AC11・AC14） > agent send-keys p2 は自分の pane なので送らない
Error: expected self_target

=== N21 packages/cli/src/commands/tab.ts (test packages/cli/src/commands/tab.test.ts) exit=1 restored_cmp=ok
--- mutation: '    assertNotSelfTab(cmd.opts, hello.snapshot, cmd.tabId, "close");' -> ''
     × 自分の pane を含む tab は tab.close を送らずに self_target 9ms
      Tests  1 failed | 4 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/tab.test.ts > runTabClose — 自分の pane を含む tab（20260926-agent-skill-file。AC12） > 自分の pane を含む tab は tab.close を送らずに self_target
AssertionError: promise resolved "undefined" instead of rejecting

=== N22 packages/cli/src/commands/workspace.ts (test packages/cli/src/commands/workspace.test.ts) exit=1 restored_cmp=ok
--- mutation: '    assertNotSelfWorkspace(cmd.opts, hello.snapshot, cmd.workspaceId, "close");' -> ''
     × 自分の pane を含む workspace は workspace.close を送らずに self_target 9ms
      Tests  1 failed | 5 passed (6)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/workspace.test.ts > runWorkspaceClose — 自分の pane を含む workspace（20260926-agent-skill-file。AC12） > 自分の pane を含む workspace は workspace.close を送らずに self_target
AssertionError: promise resolved "undefined" instead of rejecting

=== N23 packages/cli/skills/wtmctl/SKILL.md (test packages/cli/src/skill.test.ts) exit=1 restored_cmp=ok
--- mutation: 'test -n "${WTM_PANE_ID:-}"' -> 'true'
     × 最初の節で pane の中にいるかを確かめ、無ければ止まるよう指示する（AC2） 18ms
      Tests  1 failed | 8 passed (9)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/skill.test.ts > skill ファイル > 最初の節で pane の中にいるかを確かめ、無ければ止まるよう指示する（AC2）
AssertionError: expected 'まず確かめる\n\n操作の前に、自分が wtm の pane の中で動いて…' to contain 'test -n "${WTM_PANE_ID:-}"'

=== N24 packages/cli/skills/wtmctl/SKILL.md (test packages/cli/src/skill.test.ts) exit=1 restored_cmp=ok
--- mutation: '- この説明: `wtmctl skill`' -> '- この説明: `wtmctl skill`・`wtmctl pane frobnicate`'
     × 本文の wtmctl のコマンドはすべて wtmctl に実在する（AC3） 13ms
      Tests  1 failed | 8 passed (9)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/skill.test.ts > skill ファイル > 本文の wtmctl のコマンドはすべて wtmctl に実在する（AC3）
AssertionError: expected [ 'pane frobnicate' ] to deeply equal []

=== N25 packages/cli/skills/wtmctl/SKILL.md (test packages/cli/src/skill.test.ts) exit=1 restored_cmp=ok
--- mutation: '`wtmctl snapshot`・`wtmctl watch`' -> '`wtmctl snapshot`'
     × wtmctl の全コマンドが本文に出てくる（AC4） 19ms
      Tests  1 failed | 8 passed (9)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/skill.test.ts > skill ファイル > wtmctl の全コマンドが本文に出てくる（AC4）
AssertionError: expected [ 'watch' ] to deeply equal []

=== N26 packages/cli/src/skill.ts (test packages/cli/src/skill.test.ts) exit=1 restored_cmp=ok
--- mutation: '"../skills/wtmctl/SKILL.md"' -> '"../skills/SKILL.md"'
     × skillFilePath はパッケージの skills/wtmctl/SKILL.md 19ms
     × readSkill はファイルの内容そのもの・runSkill はそれを改行を足さずに書く 15ms
      Tests  2 failed | 7 passed (9)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/skill.test.ts > wtmctl skill（AC5） > skillFilePath はパッケージの skills/wtmctl/SKILL.md
AssertionError: expected '/workspaces/web-tn-multiplexer-wt/age…' to be '/workspaces/web-tn-multiplexer-wt/age…' // Object.is equality
 FAIL  src/skill.test.ts > wtmctl skill（AC5） > readSkill はファイルの内容そのもの・runSkill はそれを改行を足さずに書く
Error: ENOENT: no such file or directory, open '/workspaces/web-tn-multiplexer-wt/agent-skill-file/packages/cli/skills/SKILL.md'

=== N27 packages/cli/src/cliArgs.ts (test packages/cli/src/skill.test.ts) exit=1 restored_cmp=ok
--- mutation: '  "wtmctl skill",\n];' -> '];'
     × 本文の wtmctl のコマンドはすべて wtmctl に実在する（AC3） 14ms
      Tests  1 failed | 8 passed (9)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/skill.test.ts > skill ファイル > 本文の wtmctl のコマンドはすべて wtmctl に実在する（AC3）
AssertionError: expected [ 'skill' ] to deeply equal []

=== N2 packages/server/src/session/paneEnv.ts (test packages/server/src/session/paneEnv.test.ts) exit=1 restored_cmp=ok
--- mutation: '  "WTMCTL_TOKEN",\n' -> ''
     × 受け継いだ wtmctl の設定と古い WTM_* を消し、サーバの値を入れる（利用者の変数は写す） 14ms
     × token はどの値にも含まれない（AC15） 2ms
     × 小文字の変種: win32 では消え、linux では残る（利用者の別の変数） 2ms
      Tests  3 failed | 2 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > 受け継いだ wtmctl の設定と古い WTM_* を消し、サーバの値を入れる（利用者の変数は写す）
AssertionError: expected { PATH: '/usr/bin', …(5) } to deeply equal { PATH: '/usr/bin', …(4) }
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > token はどの値にも含まれない（AC15）
AssertionError: expected true to be false // Object.is equality
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > 小文字の変種: win32 では消え、linux では残る（利用者の別の変数）
AssertionError: expected { wtmctl_token: 't', other: 'x', …(1) } to deeply equal { other: 'x', WTM_PANE_ID: 'p1' }

=== N2b packages/server/src/session/paneEnv.ts (test packages/server/src/session/paneEnv.test.ts) exit=1 restored_cmp=ok
--- mutation: '  "WTMCTL_URL",\n' -> ''
     × 受け継いだ wtmctl の設定と古い WTM_* を消し、サーバの値を入れる（利用者の変数は写す） 24ms
     × URL・socket が無ければ入れない（受け継いだ古い値も残さない） 13ms
      Tests  2 failed | 3 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > 受け継いだ wtmctl の設定と古い WTM_* を消し、サーバの値を入れる（利用者の変数は写す）
AssertionError: expected { PATH: '/usr/bin', …(5) } to deeply equal { PATH: '/usr/bin', …(4) }
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > URL・socket が無ければ入れない（受け継いだ古い値も残さない）
AssertionError: expected true to be false // Object.is equality

=== N5 packages/server/src/session/paneEnv.ts (test packages/server/src/session/paneEnv.test.ts) exit=1 restored_cmp=ok
--- mutation: '  "WTM_SERVER_URL",\n' -> ''
     × URL・socket が無ければ入れない（受け継いだ古い値も残さない） 10ms
      Tests  1 failed | 4 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > URL・socket が無ければ入れない（受け継いだ古い値も残さない）
AssertionError: expected true to be false // Object.is equality

=== N5b packages/server/src/session/paneEnv.ts (test packages/server/src/session/paneEnv.test.ts) exit=1 restored_cmp=ok
--- mutation: '  "WTM_AGENT_REPORT_SOCKET",\n' -> ''
     × URL・socket が無ければ入れない（受け継いだ古い値も残さない） 13ms
      Tests  1 failed | 4 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/paneEnv.test.ts > buildPaneEnv > URL・socket が無ければ入れない（受け継いだ古い値も残さない）
AssertionError: expected true to be false // Object.is equality

```

（N2・N5 は 1 回目に置き換え元の文字列が prettier の整形で見つからず実行されなかったので、2 回目で行ごとに消す形 N2・N2b・N5・N5b にして実行した。）

### 負の確認 N28（URL を決める位置を復元・最初の workspace の作成の後へ動かす。ビルドし直して結合テストを実行）

```
=== N28 composeServer: URL を復元・最初の workspace の作成の後に決める（順序の誤り）
+import { paneServerUrl } from "./util/net.js";
+  /** pane の環境の `WTM_SERVER_URL`（`listen()` で待ち受けた後に決める。それまでは undefined）。`SessionService` が読むので、それより前に宣言する。 */
+  let paneUrl: string | undefined;
+    // pane の中の wtmctl の接続先（20260926-agent-skill-file）。待ち受けた後（`listen()` の 1.）に決まる。pane を起動するのはその後。
+    serverUrlForPanes: () => paneUrl,
+        // 1'. pane の中の wtmctl の接続先（20260926-agent-skill-file）。ポートは実際に待ち受けたもの（パイプ等で数でなければ `options.port`）。
build=0
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected false to be true // Object.is equality
restored
rebuild=0
```

変異の一覧: N1 全インタフェースのループバックへの置き換えを外す／N2 `WTMCTL_TOKEN` を消さない／N2b `WTMCTL_URL` を消さない／N3 win32 でも大文字小文字を区別する／
N4 `WTM_SERVER_URL` を入れない／N5 古い `WTM_SERVER_URL` を消さない／N5b 古い `WTM_AGENT_REPORT_SOCKET` を消さない／N6 `WTM_SERVER_URL` を `WTMCTL_URL` より優先／
N7 `WTM_SERVER_URL` が無くても caller を作る／N8 `skill` の余分な引数を許す／N9 origin を比べない／N10 ループバックを正規化しない／N11 http(s) 以外も比べる／
N12 自分の pane の tab かを見ない／N13 tab が無いときの防御を外す／N14〜N22 9 箇所の歯止めの呼び出しを 1 つずつ消す／N23 skill の最初の確認を消す／
N24 skill に存在しないコマンドを書く／N25 skill から `wtmctl watch` を消す／N26 skill のパスを誤る／N27 `USAGE_LINES` から `skill` を消す／N28 URL を決める順序の誤り。
**30 通りすべて検出**（見逃し 0）。

## 起動確認（smoke）

```
smoke(cli): wtmctl snapshot ok
smoke(cli): wtmctl agent list ok (no agents)
smoke(cli): wtmctl agent rename ok (named, resolved by name, cleared)
smoke(cli): wtmctl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)
smoke(cli): wtmctl agent send-keys ok (the RPC accepted the keys)
smoke(cli): wtmctl agent prompt ok (submitted; the shell printed the marker)
smoke(cli): wtmctl pane attach refuses a non-terminal (not_a_tty)
smoke(cli): wtmctl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: <省略>
wtm: deleted session smoke (/tmp/tmp.K6yCazrkFE/sessions/smoke)
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/wtmctl/SKILL.md
smoke: pass (exit 0, 4 本)
```

新しい入口 `wtmctl skill` のために `.aidev/config.yml` の `smokeCommands` に 4 本目を足した（誰も待ち受けていない接続先のまま、ビルド済みの wtmctl の出力が skill ファイルと一致すること）。

## 未検証の穴（skip / 環境不足）

- 本物のコーディングエージェント（Claude Code・Codex 等）に skill を入れて、書いた作法どおりに振る舞うかは確かめていない（この環境では動かせない）。
- Windows のサーバ・PowerShell の pane での環境変数（大文字小文字を区別しない取り除きは単体テストだけ）と、結合テスト（win32 は skip）。macOS も未確認。
- TLS（https）で待ち受けるサーバの pane の中からの接続（証明書に `127.0.0.1` が要る件）は実物で確かめていない（URL の組み立ては単体テストだけ）。
- `wtmctl skill` を Claude Code の skill として読み込ませたときの front matter の解釈は確かめていない。
- E2E は動かしていない（利用者の指示）。

## ラウンド 2（review ラウンド 1 の差し戻し後。docs・SKILL.md のみの変更）

- `pnpm -s build` exit 0・`pnpm -s typecheck` exit 0・`pnpm -s test` **202 files / 3896 passed / 0 failed**・`aidev smoke` pass（4 本）。
- このラウンドでは失敗が発生していない。
