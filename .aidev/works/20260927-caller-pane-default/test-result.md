# テスト結果: 呼び出し元の pane を既定の対象にする（`wtmctl pane current`・`pane split` の対象の省略・`--pane`・`--current`）

## 実行したもの
- `pnpm -s build` — exit 0
- `pnpm -s typecheck` — exit 0
- `pnpm -s test` — 5004 passed / 1 failed / 0 skipped（271 ファイル）。失敗は本 work が触っていない `@wtm/web` の `KeySettings.test.ts` の 1 件の 5000ms のタイムアウト（共有マシンの負荷）。
  そのファイルだけを 1 回だけ単独で打ち直して 98 passed / 0 failed（下の「失敗の証跡」）。
- 本 work の単体・結合テスト（全体の中）: `cliArgs.test.ts`・`cliArgs.machine.test.ts`・`paneTarget.test.ts`（新規 9 件）・`commands/pane.test.ts`（26 件）・
  `paneCurrent.integration.test.ts`（新規 2 件。実サーバ）・`skill.test.ts`（9 件）
- `aidev smoke` — pass（8 本。2 本目の wtmctl の smoke に本 work の手順を足した）
- 負の確認（変異の網羅。`scratchpad/negctl/sweep.py`）— 32 変異中 29 検出・3 生存（生存は全て観測上等価。下）

## 受け入れ基準ごとの判定
- AC1: pass — `commands/pane.test.ts`「pane の中で対象を省いた split は呼び出し元の pane を分ける」・`paneCurrent.integration.test.ts`（フォーカスを別の workspace へ移した後でも呼び出し元の tab に作る）・smoke（ビルド済みの wtmctl に `WTM_PANE_ID`・`WTM_SERVER_URL`）
- AC2: pass — `cliArgs.test.ts`「位置引数・--pane は明示の ID、--current は呼び出し元」・`commands/pane.test.ts`「明示の ID は呼び出し元より優先」
- AC3: pass — `cliArgs.test.ts` の 5 通りの組み合わせが `CliUsageError`（解釈の段階なので接続しない）
- AC4: pass — `cliArgs.test.ts`「--current は WTM_PANE_ID が無ければ使い方の誤り」（文面 `--current requires WTM_PANE_ID`）
- AC5: pass — `commands/pane.test.ts`「pane current は呼び出し元の pane に今の workspaceId と focused を足して出し…」
- AC6: pass — `paneCurrent.integration.test.ts`（実サーバで `pane.move_to_new_tab` の後、応答の tab・移動先の workspace・`focused: false` が出る）
- AC7: pass — `commands/pane.test.ts`（`--pane p4`・無い pane は `not_found`）
- AC8: pass — `commands/pane.test.ts`（`request`・`sendInput` が呼ばれない）
- AC9: pass — `paneTarget.test.ts`（別のポート・別のホスト・`WTM_SERVER_URL` 無し・読めない URL）・`commands/pane.test.ts`（`withSession` を呼ばない・明示の ID なら通る）
- AC10: pass — `cliArgs.machine.test.ts`（`--current` は使い方の誤り〔pane の外でも理由は --machine〕・省略は `focused`・明示の ID はそのまま）
- AC11: pass — `cliArgs.machine.test.ts`（`--machine local` は `caller` のまま）
- AC12: pass — `cliArgs.test.ts`（pane の外の省略は `focused`）・`commands/pane.test.ts`（`snapshot.focus.paneId` を分ける・current はフォーカスの pane で `focused: true`）
- AC13: pass — `paneTarget.test.ts`・`commands/pane.test.ts`（`focus: null` で `not_found`、`pane.split` を送らない）
- AC14: pass — 既存の `selfGuard.test.ts`・各コマンドの歯止めのテストが変更なしで通る（判定は export しただけ）。自分の pane の split は断らない（`commands/pane.test.ts`）
- AC15: pass — `USAGE_LINES`・help（`node packages/cli/dist/main.js help` に `pane current` と説明の 4 行）・skill（`--current` と `pane current` を使う手順）・`docs/wtmctl.md`。`skill.test.ts` が通る
- AC16: pass — `docs/wtmctl.md`「pane の環境変数」（workspace・tab の ID を入れない理由）・新しい節「呼び出し元の pane を対象にする」・herdr との違い、`docs/herdr-parity.md` の H39（と H41 の古い記述の追記）。目視
- AC17: pass — smoke の出力 `smoke(cli): wtmctl pane current / pane split (caller pane, not the focused one) ok (tab t2)`

## 負の確認（変異の網羅）

`regression-negative-control` は不具合修正の条項だが、判定の分岐を持つ新機能なので同じ要領で行った。実装の項を 1 つずつ書き換え、単体テスト 5 ファイル
（`cliArgs`・`cliArgs.machine`・`paneTarget`・`commands/pane`・`selfGuard`）を 1 回ずつ直列に走らせ、元に戻して `filecmp` で一致を確かめた（全て一致）。

```
M01 cliArgs.ts         if (given > 1) throw                                           DETECTED
M02 cliArgs.ts         [positional !== undefined, flagPane !== undefined, current]    DETECTED
M03 cliArgs.ts         [positional !== undefined, flagPane !== undefined, current]    DETECTED
M04 cliArgs.ts         if (positional !== undefined) return { kind: "id", paneId: p   DETECTED
M05 cliArgs.ts         if (flagPane !== undefined) return { kind: "id", paneId: fla   DETECTED
M06 cliArgs.ts         if (!envPane) throw new CliUsageError("--current requires      DETECTED
M07 cliArgs.ts         return { kind: "caller", paneId: envPane, explicit: true };    DETECTED
M08 cliArgs.ts         return envPane ? { kind: "caller", paneId: envPane, explicit   DETECTED
M09 cliArgs.ts         return envPane ? { kind: "caller", paneId: envPane, explicit   DETECTED
M10 cliArgs.ts         rejectExtra(positionals, 0, PANE_CURRENT_USAGE);               DETECTED
M11 cliArgs.ts         rejectExtra(positionals, 1, PANE_SPLIT_USAGE);                 DETECTED
M12 cliArgs.ts         target: parsePaneTarget(undefined, values, bools, env, PANE_   SURVIVED
M13 cliArgs.ts         if (selector !== "local" && sub === "pane" && rest.includes(   DETECTED
M14 cliArgs.ts         if ("target" in cmd && cmd.target.kind === "caller") {         DETECTED
M15 cliArgs.ts             if (cmd.target.explicit) {\n      throw                    SURVIVED
M16 cliArgs.ts         return { ...cmd, target: { kind: "focused" }, opts: { ...opt   DETECTED
M17 cliArgs.ts         if (selector === "local") return cmd;                          DETECTED
M18 paneTarget.ts      if (confirmed === undefined) {                                 DETECTED
M19 paneTarget.ts      return confirmed;                                              SURVIVED
M20 paneTarget.ts      const paneId = snapshot.focus?.paneId;                         DETECTED
M21 paneTarget.ts      if (paneId === undefined) throw new RpcFailure("not_found",    DETECTED
M22 paneTarget.ts            return resolveCallerPane(opts, target);                  DETECTED
M23 paneTarget.ts          case "focused":\n      return undefined;                   DETECTED
M24 paneTarget.ts          case "id":\n      return target.paneId;                    DETECTED
M25 selfGuard.ts       if (target === undefined || target !== serverKeyOf(caller.se   DETECTED
M26 commands/pane.ts   const paneId = knownPaneId ?? resolveFocusedPane(hello.snaps   DETECTED
M27 commands/pane.ts   const paneId = knownPaneId ?? resolveFocusedPane(snapshot);    DETECTED
M28 commands/pane.ts   if (pane === undefined) throw new RpcFailure("not_found", `p   DETECTED
M29 commands/pane.ts   const workspaceId = snapshot.tabs.find((t) => t.id === pane.   DETECTED
M30 commands/pane.ts   focused: snapshot.focus?.paneId === pane.id                    DETECTED
M31 commands/pane.ts     const knownPaneId = paneTargetIdBeforeConnect(cmd.opts, cm   DETECTED
M32 commands/pane.ts     const knownPaneId = paneTargetIdBeforeConnect(cmd.opts, cm   DETECTED
detected 29 / 32
```

生存 3 件はいずれも観測上等価:
- M12（`pane current` に位置引数を渡す）: 直前の `rejectExtra(positionals, 0, …)` が位置引数を必ず断るので、`positionals[0]` は常に undefined。
- M15（`parseMachinePrefixed` の explicit の検査を外す）: その前の `rest.includes("--current")` の検査（M13。検出）が先に断るので到達しない。二重の防御として残す。
- M19（`return confirmed` → `return target.paneId`）: どちらも同じ `WTM_PANE_ID` から作られる（`globalOptsFrom` と `parsePaneTarget`）。

## 失敗の証跡

全体テストの 1 回目（`pnpm -s test > scratchpad/test.log`、exit 1）:

```
{"ts":"2026-09-27T11:28:06.859Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-27T11:28:06.863Z","level":"info","msg":"custom commands loaded","file":"/tmp/wtm-compose-named-ui-GQUXVe/sessions/work/commands.json","count":0}
 ❯ |@wtm/web| src/components/KeySettings.test.ts (98 tests | 1 failed) 113705ms
   ❯ KeySettings — navigate の割り当ての追加・変更・削除（AC1・AC-I4） (4)
     × 外したキーは、別の navigate 操作へ割り当てられるようになる 7806ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@wtm/web| src/components/KeySettings.test.ts > KeySettings — navigate の割り当ての追加・変更・削除（AC1・AC-I4） > 外したキーは、別の navigate 操作へ割り当てられるようになる
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/components/KeySettings.test.ts:1197:3
    1195|   });
    1196|
    1197|   it("外したキーは、別の navigate 操作へ割り当てられるようになる", async () => {
       |   ^
    1198|     const { settings } = await mountKeys();
    1199|     navDeleteBtn("navigate_pane_left", "h").click();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

そのファイルだけを単独で 1 回打ち直した結果（exit 0）:

```
$ cd packages/web && npx vitest run src/components/KeySettings.test.ts
 Test Files  1 passed (1)
      Tests  98 passed (98)
```

本 work は `packages/web` を変えていない（`git diff --stat` に web の変更は無い）。負荷で揺れる既知のタイムアウトと判断した。

## 起動確認（smoke）

```
$ aidev smoke
smoke: 20260927-caller-pane-default
$ pnpm -s build && pnpm -s smoke
smoke: starting server on 127.0.0.1:39376 (state dir /tmp/wtm-smoke-WmjEUc)
{"ts":"2026-09-27T11:32:10.449Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-27T11:32:10.460Z","level":"info","msg":"custom commands loaded","file":"/tmp/wtm-smoke-WmjEUc/commands.json","count":1}
smoke: agent manifests ok (22/22)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane p2)
smoke: pane.subscribe ok
smoke: echo round trip ok
{"ts":"2026-09-27T11:32:11.700Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"69eb229b-44c3-4699-ae5e-228b639c0ceb","paneId":"p2"}
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("OSK2-024680-2: smoke"。H14/AC4）
smoke(web): typed into pane p2
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS
$ pnpm --filter @wtm/cli run smoke

> @wtm/cli@0.1.0 smoke /workspaces/web-tn-multiplexer-wt/caller-pane-default/packages/cli
> node --enable-source-maps dist/smoke.js

smoke(cli): temp server state dir /tmp/wtmctl-smoke-state-Sl5sKH, sandboxed HOME /tmp/wtmctl-smoke-home-bvO81k
{"ts":"2026-09-27T11:32:21.069Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-27T11:32:21.071Z","level":"info","msg":"custom commands loaded","file":"/tmp/wtmctl-smoke-state-Sl5sKH/commands.json","count":0}
smoke(cli): server listening on http://127.0.0.1:39210
smoke(cli): wtmctl workspace create ok (pane p2)
smoke(cli): wtmctl pane run ok (no --token needed; cached session reused)
smoke(cli): wtmctl pane read ok (echo round trip confirmed)
smoke(cli): wtmctl snapshot ok
smoke(cli): wtmctl pane current / pane split (caller pane, not the focused one) ok (tab t2)
smoke(cli): wtmctl workspace/pane report-metadata ok (normalized, in snapshot, cleared, bad source refused)
smoke(cli): wtmctl agent list ok (no agents)
smoke(cli): wtmctl agent rename ok (named, resolved by name, cleared)
smoke(cli): wtmctl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)
smoke(cli): wtmctl agent send-keys ok (the RPC accepted the keys)
smoke(cli): wtmctl agent prompt ok (submitted; the shell printed the marker)
smoke(cli): wtmctl pane attach refuses a non-terminal (not_a_tty)
smoke(cli): wtmctl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): wtmctl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: 7HVhj3r4fQx8NnxcVckYwADEsngWluOG
wtm: deleted session smoke (/tmp/tmp.8YMdEXqx68/sessions/smoke)
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/wtmctl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && WTM_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { WTM_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: Rrbul5rdOym9cTJ5mosTT26i9Eb4d4hR
$ node packages/server/dist/handoffSmoke.js
handoff-smoke: not running → exit 3, nothing created ok
handoff-smoke: before: server pid 445002, pane p1, shell pid 445035
handoff-smoke: wtm handoff → exit 0: wtm: handoff complete: 1 pane(s) kept running
handoff-smoke: same server pid, /ws closed with 1012, handoff.json removed ok
handoff-smoke: same pane, same shell pid, previous screen visible, input/output ok
handoff-smoke: resize reaches the adopted pty ok
handoff-smoke: pane closes when the adopted shell exits ok
handoff-smoke: ok
$ node packages/server/dist/stopSmoke.js
stop-smoke: not running → exit 3, nothing created ok
stop-smoke: started: pid 445504, pane p2, marker shown
stop-smoke: stopped: CLI exit 0, server exit 0, list shows stopped, lock released, state saved ok
stop-smoke: stopped → exit 3 ok
stop-smoke: restarted: same pane, previous screen restored ok
stop-smoke: ok
$ node packages/server/dist/machineSmoke.js
machine-smoke: remote wtm serve started (pid 445846)
machine-smoke: wtm machine add (probed over the fake ssh) and list ok
machine-smoke: local wtm serve connected to the remote machine (machine.list: online)
machine-smoke: relay ok: hello (hostname OSK2-024680-2), workspace.create and echo reached the remote wtm serve
machine-smoke: ok
smoke: pass (exit 0, 8 本)
```

新しい入口（`pane current`・対象を省いた `pane split`）は `smokeCommands` の 2 本目（`pnpm --filter @wtm/cli run smoke`）の中に手順を足したので、行は足していない。

## 未検証の穴（skip / 環境不足）
- 本物のエージェント（Claude Code・Codex）が skill の新しい手順（`--current`・`pane current`）どおりに振る舞うかは確かめていない。
- Windows のサーバ・PowerShell の pane、TLS のサーバの pane の中からの `--current`（証明書の名前の `WTMCTL_URL` で `caller_pane_unknown` になること）は実機で確かめていない（単体テストのみ）。
- `--machine`（local 以外）の省略がリモートのフォーカスの pane を分けることは、解釈の単体テストだけ（実際のリモートでは打っていない）。
- E2E は打っていない（利用者の指示。画面は変えていない）。
