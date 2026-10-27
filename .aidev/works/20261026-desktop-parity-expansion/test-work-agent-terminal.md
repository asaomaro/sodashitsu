# エージェント端末中継の検証

source3f615441（base79eadbcf）。生成CLIだけを使い、実ユーザーのエージェント/login/OS入力を操作しない。

- build/typecheck成功。新規unitと要求/CLI回帰23件成功、追加parserとsurface認可fixture7メソッドも最終全体で検証。
- 実ブラウザ3件成功: A実行/B操作、その逆、従来のA質問表示。起動承認表示、browser受信PTY出力、実ブラウザ入力→生成CLI反応、逆方向の一般machine接続なし、質問のB表示/A非表示、10秒超の回答待機、取消/資料削除、起動元shell復帰を確認。
- 独立レビュー2件、必須修正差分とcreate追加raceの再レビューも通過。
- 全体790ファイル/11829件すべて成功。独立worktree build/smoke成功。検証環境再起動で中断した試行は成功件数に含めず、保存場所を変更してfresh build/typecheck/全体を再実行した。実Windows端末の対話は未検証。

## 負例

以下は標準出力の抜粋。起動/終了見出しの一部を省略し、失敗の詳細は出力された行をそのまま記録する。

各guardを1つずつ外して実行し、finallyで元バイト列へ復元して完全一致を確認。askは10秒打ち切りへ戻してfresh buildしてから実ブラウザで検証。元に戻した後もfresh build/typecheckを行い、最終ブラウザ3件を再実行して成功。

### lease

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-work-agent-terminal

 ❯ |@sodashitsu/server| src/work/WorkAgentTerminal.test.ts (10 tests | 1 failed | 9 skipped) 8ms
   × includes admission/validation delay in a server-issued input lease 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/WorkAgentTerminal.test.ts > includes admission/validation delay in a server-issued input lease
AssertionError: expected [ { seq: 1, …(3) } ] to deeply equal [ { seq: 1, discarded: true } ]

- Expected
+ Received

  [
    {
-     "discarded": true,
+     "data": "b2xkIGVudGVyDQ==",
+     "expiresInMs": 1000,
+     "lease": "5317caa9-52f0-4d4f-9f41-8e053bc35465",
      "seq": 1,
    },
  ]

 ❯ src/work/WorkAgentTerminal.test.ts:49:42
     47|  let now=0;const t=new WorkAgentTerminal("r",()=>now),epoch=t.epoch,le…
     48|  now=2000;t.read("r",{epoch,ack:0,input:{seq:1,data:data("old enter\r"…
     49|  expect(t.exchange({epoch,ack:0}).input).toEqual([{seq:1,discarded:tru…
       |                                          ^
     50| });
     51|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  20:31:12
   Duration  588ms (transform 75%, import 23%, tests 2%, worker 1%)


```

### create

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-work-agent-terminal

 ❯ |@sodashitsu/server| src/work/WorkAgentRequests.test.ts (8 tests | 1 failed | 7 skipped) 21ms
   × does not publish a terminal request if its owner disconnects during inspect 20ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/WorkAgentRequests.test.ts > does not publish a terminal request if its owner disconnects during inspect
AssertionError: promise resolved "{ …(11) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "agentKind": "claude",
+   "args": [],
+   "expiresAt": 1793101274771,
+   "folder": "/tmp/soda-work-terminal-create-YGDO0q",
+   "id": "e215893d-bb4a-4a36-93d8-191d1275577e",
+   "identity": "861957672b67d7ab8cfa361eb286bed0617bca334746067d152c94d4e17344f8",
+   "paneId": "3a6beba7-0f0b-44f2-a126-4ab159b3929c",
+   "root": "/tmp/soda-work-terminal-create-YGDO0q",
+   "state": "pending",
+   "terminalHere": true,
+   "workspaceId": "4648e614-2a15-4fdb-b308-d78034b33e63",
  }

 ❯ src/work/WorkAgentRequests.test.ts:159:256


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  20:31:14
   Duration  679ms (transform 76%, import 20%, tests 4%)


```

### suspend

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-work-agent-terminal

 ❯ |@sodashitsu/server| src/work/WorkAgentTerminalBridge.test.ts (3 tests | 1 failed | 2 skipped) 9ms
   × refuses a job-suspend byte before any input reaches the fixed executor PTY 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/WorkAgentTerminalBridge.test.ts > refuses a job-suspend byte before any input reaches the fixed executor PTY
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "data": Array [
          26,
          115,
          104,
          101,
          108,
          108,
          32,
          99,
          111,
          109,
          109,
          97,
          110,
          100,
          13,
        ],
        "type": "Buffer",
      },
    ]


Number of calls: 1

 ❯ src/work/WorkAgentTerminalBridge.test.ts:20:186


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  20:31:15
   Duration  120ms (transform 58%, tests 18%, import 17%, worker 6%)


```

### owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-work-agent-terminal

 ❯ |@sodashitsu/server| src/work/WorkAgentTerminal.test.ts (10 tests | 1 failed | 9 skipped) 6ms
   × rejects another requester, a stale epoch, a sequence gap and an ACK of undelivered data 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/WorkAgentTerminal.test.ts > rejects another requester, a stale epoch, a sequence gap and an ACK of undelivered data
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/work/WorkAgentTerminal.test.ts:15:51
     13| it("rejects another requester, a stale epoch, a sequence gap and an AC…
     14|  const terminal=new WorkAgentTerminal("requester"),epoch=terminal.epoc…
     15|  expect(()=>terminal.read("other",{epoch,ack:0})).toThrow(/another/);
       |                                                   ^
     16|  expect(()=>terminal.exchange({epoch:"stale",ack:0})).toThrow(/generat…
     17|  expect(()=>terminal.exchange({epoch,ack:0,output:{seq:2,data:data("ba…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  20:31:16
   Duration  588ms (transform 75%, import 23%, tests 1%)


```

### ask

```text

Running 1 test using 1 worker

(node:3137304) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T11:32:03.859Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T11:32:03.860Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T11:32:03.860Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T11:32:03.867Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-RcZ3M9/commands.json","count":0}
{"ts":"2026-10-27T11:32:04.302Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T11:32:04.302Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T11:32:04.302Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T11:32:04.306Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-XmqfHT/commands.json","count":0}
{"ts":"2026-10-27T11:32:09.897Z","level":"info","msg":"ask opened","askId":"7536531531020ff164786056c1d10440","paneId":"13fa3312-6204-4ec2-94ee-47b03eb1bb48","questions":1,"media":1}
{"ts":"2026-10-27T11:32:19.915Z","level":"info","msg":"ask closed","askId":"7536531531020ff164786056c1d10440","paneId":"13fa3312-6204-4ec2-94ee-47b03eb1bb48","status":"cancelled"}
{"ts":"2026-10-27T11:32:26.118Z","level":"info","msg":"work agent proxy lifecycle","event":"closed","machineId":"8df60f6d55a09d108067ce4bc3758443","requestId":"79fe0c54-67a9-41df-a99d-3c43030bc2fe","paneId":"2159c14a-9daa-4cba-84ca-10812c2fe9b9","reason":"server_stopped"}
{"ts":"2026-10-27T11:32:26.120Z","level":"info","msg":"machine link closed","machine":"8df60f6d55a09d108067ce4bc3758443","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T11:32:26.121Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"8df60f6d55a09d108067ce4bc3758443","requestId":"79fe0c54-67a9-41df-a99d-3c43030bc2fe","paneId":"2159c14a-9daa-4cba-84ca-10812c2fe9b9","cause":"rpc_closed"}
  ✘  1 src/specs/work-agent-terminal.spec.ts:12:45 › work agent terminal on requester, execution PC A (22.7s)



    Error: expect(locator).toBeVisible() failed

    Locator: locator('dialog#soda-ask-dialog[open]')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" locator('dialog#soda-ask-dialog[open]') with timeout 5000ms
      - waiting for locator('dialog#soda-ask-dialog[open]')


      35 |   // An actual user can take longer than the bridge RPC's former 10-second limit.
      36 |   await expect.poll(()=>Date.now(),{timeout:15000,intervals:[1000]}).toBeGreaterThan(Date.now()+10500);
    > 37 |   await expect(dialog(page)).toBeVisible();await page.locator('[data-ask-submit]').click();await expect.poll(()=>replies.has(2)).toBe(true);expect(JSON.parse(replies.get(2).result.content[0].text)).toMatchObject({status:'answered',answers:{ok:'yes'}});
         |                              ^
      38 |   call(3,'取消の確認');await expect(dialog(page)).toBeVisible();mcp.stdin!.end();await expect(dialog(page)).toHaveCount(0);await expect.poll(async()=>(await readdir(join(requester.stateDir,'work-agent-asks'))).length).toBe(0);
      39 |   await page.locator('.xterm-helper-textarea').first().focus();await page.keyboard.type('quit');await page.keyboard.press('Enter');await expect.poll(()=>output).toContain('\x1b[?1049l');
      40 |   await page.keyboard.type("printf 'REQUESTER_SHELL_BACK\\n'");await page.keyboard.press('Enter');await expect.poll(()=>output).toContain('REQUESTER_SHELL_BACK');await operator.close();
        at /workspaces/sodashitsu-work-agent-terminal/packages/e2e/src/specs/work-agent-terminal.spec.ts:37:30

    Error Context: test-results/work-agent-terminal-work-a-82f8d-on-requester-execution-PC-A/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/work-agent-terminal-work-a-82f8d-on-requester-execution-PC-A/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/work-agent-terminal-work-a-82f8d-on-requester-execution-PC-A/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/work-agent-terminal.spec.ts:12:45 › work agent terminal on requester, execution PC A ─
undefined
/workspaces/sodashitsu-work-agent-terminal/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test work-agent-terminal.spec.ts --grep execution PC A

```
