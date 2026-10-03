# テスト結果: pane の中のプログラム向けのログイン不要の受け口（pane.sock）と、sodactl ask のログイン不要化

対象のコミット: `feature/sodactl-ask-socket` の HEAD（test の差し戻しの修正と、落ちたときに code が読めるようにした assert を含む）。
この環境の既定の Node は v20.20.2（`package.json` の `engines` は 24 以上）。Node v24.21.0 は `npx -y node@24` で用意した。**どちらで走らせたかを各行に書く**。

## 実行したもの

- `pnpm build`（Node 20）— 終了コード 0
- `pnpm typecheck`（Node 20）— 終了コード 0
- `pnpm test`（全体。**Node 24**）— 379 ファイル・**6753 passed / 0 failed / 0 skipped**・終了コード 0
- `pnpm test`（全体。Node 20）— ラウンド 2 の 4 回: 3 回は 6751 passed / 1 failed / 1 skipped、1 回は 6750 passed / 2 failed / 1 skipped（下の「失敗の証跡」ラウンド 2）
- `pnpm lint`（Node 20）— 終了コード 1・22 errors。**`main`（9514847）でも同じ 22 errors・同じファイル**（worktree で `eslint . --ext .ts` を走らせて比べた。`no-control-regex` 17 件ほか。この work で足した・変えた行のものは無い）
- 起動確認（smoke。`aidev smoke`・10 本。**Node 24**・別のパスの checkout）— pass（下の「起動確認」）
- E2E `ask-form.spec.ts`・`ask-form-mobile.spec.ts`（Node 24）— **23 passed / 0 failed**（うち 3 件がこの work で足したログインなしの件）
- E2E 全体（22 spec。Node 24）— 144 passed / **18 failed**。18 件はどれも設定・テーマ・キー割り当て・モバイル等で、ask と受け口に関係しない。**`main`（9514847）で同じ 8 spec を走らせると 19 failed**（同じ 18 件＋ `mobile.spec.ts:18`）なので、この work より前からこの環境で落ちている（原因は調べていない。`CompileError: WebAssembly.instantiate() … Content Security policy` 等）
- 陰性対照（coding の中で実施。実装を一時的に戻して落ちることを確かめた）— `review.md`「タスク点検ログ」と `decisions.md` D6・D7 に記録（検査の順・待ちの上限・累積の上限・0700 の一時ディレクトリ・listen の途中の close・起動を続ける配線・handoff の pause/resume・fallback の条件・`urlExplicit`・`invalid_ask_spec` の読み替え・ECONNREFUSED の繋ぎ直し・pane の環境の秘密）

## 受け入れ基準ごとの判定

- AC1: pass — E2E「ログインなし: ブラウザで決定 → answered・終了コード 0」（キャッシュの無い HOME・token なし・`SODA_PANE_SOCKET` だけ）。`paneEnv.integration.test.ts`: 実物の pane の中の `SODA_PANE_SOCKET` が、そのサーバの実在する `pane.sock`（socket・0600）と一致。
- AC2: pass — `paneSocket.integration.test.ts`（実物のサーバ＋ `/ws` の画面役）で `cancelled`・`timeout`・画面なしの `unavailable`。対応していない型は `ask.test.ts`（接続せず `unavailable`）。smoke 2 本目でログインなしの `unavailable`・終了コード 0。
- AC3: pass — 同結合テスト: `pane.write`・`agent.send_keys`・`workspace.create`・`pane.rename`・`ask.subscribe` はどれも `unknown_op` で、workspace の数・pane の画面が変わらない。
- AC4: pass — E2E: ダイアログの最上部に「pane「…」…のプログラムからの質問」が出る（位置と最初の見出しで確認）。結合テスト: 実在しない pane → `not_found`、`/ws` で出した質問と同じ pane へ受け口から出すと `ask_busy`（両方の順）。総数 32 は同じ `AskService` の台帳（既存の `AskService.test.ts`）で、受け口から 32 件を出す確認はしていない。
- AC5: pass（Linux）— `privateUnixSocket.test.ts`（0700 の一時ディレクトリで待ち受けてから rename・mode 0600）、結合テストと `paneEnv.integration.test.ts` で `pane.sock` が 0600。Windows は `config.test.ts`（`paneSocketPathFor` が undefined）・`paneEnv.test.ts`・`cliArgs.test.ts`（platform を差し替え）。**別の利用者で実際に繋げないこと・macOS・Windows の実機は未検証**（下）。
- AC6: pass — 結合テスト（待っている接続を閉じると `/ws` に `ask.closed`）、E2E（SIGINT でダイアログが閉じ、出し直せる）。
- AC7: pass — `paneSocket.test.ts`（無いパス・`unknown_op`・`bad_request` → fallback）、`ask.test.ts`（fallback で今までの `withSession`）、smoke 2 本目と E2E（受け口のパスなし・未ログイン → `unauthenticated`・終了コード 1）。
- AC8: pass — `paneSocket.test.ts`・`ask.test.ts`・`cliArgs.test.ts`（`--url`・空でない `SODACTL_URL` で受け口を使わない）。
- AC9: pass — `PaneSocket.test.ts`（JSON でない・`v` 違い・上限を超える行〔1 回・小分け〕・途中で切れる・行が揃わない、の後も次の要求が通る）。
- AC10: pass — 結合テスト: 2 つの状態ディレクトリのサーバで、片方にしか無い pane をもう片方の受け口へ送ると `not_found`、相手のサーバに質問が出ない。名前付き session（`--session`）そのものでは走らせていない（パスは状態ディレクトリから決まる。`config.ts`）。
- AC11: pass（Node 24）— smoke 6 本目: 実物の `soda handoff` の後、`SODA_PANE_SOCKET` なし・`SODA_AGENT_REPORT_SOCKET` だけの環境の sodactl が `unavailable`・終了コード 0（socket の変数なしは `unauthenticated`・1）。結合テスト（handoff の間は `pane_socket_busy`・元に戻ると受け付ける）。停止後に `pane.sock` が無い・残骸があっても起動できる、は `PaneSocket.test.ts`・`privateUnixSocket.test.ts`。**版をまたぐ handoff（古い版 → この版）は未検証**。
- AC12: pass — `docs/sodactl.md`「ログイン不要の受け口（`pane.sock`）」ほか。点検で実装と 1 つずつ照合（`review.md` T14）。`skill.test.ts` と smoke 4 本目（`sodactl skill | cmp`）。
- AC13: pass — `PaneOpRegistry.test.ts`・`PaneSocket.test.ts`（`test.echo` を登録して呼ぶ）、`packages/cli/src/paneSocket.integration.test.ts`（実物の `PaneSocket` × 実物の `callPaneOp`）。
- AC14: pass — `PaneSocket.test.ts`（知らない操作 → `unknown_op`。実在しない pane と組み合わせても）、`paneSocket.test.ts`（`unknown_op` → fallback）。
- AC15: pass — `paneEnv.integration.test.ts`: 実物の pane（最初の pane と後から作った pane）の `env` の全体に、そのサーバの token・session cookie・`local-auth.json` の秘密が現れない（わざと漏らすと落ちることを確認済み）。
- AC16: pass — `test.echo` が受け取った `paneId` を返す（`PaneOpRegistry.test.ts`・`PaneSocket.test.ts`・cli の結合テスト）。
- AC17: pass — `ask.test.ts`（定義の誤りではどちらにも繋がない・受け口が `invalid_ask_spec` を返すと使い方の誤り）、smoke 2 本目（ログインなしで `{questions: []}` → 終了コード 2・stderr に `invalid ask spec`）。

## 失敗の証跡

### ラウンド 1（fb16a92。Node v20.20.2）

`pnpm test`（全体）が 2 件失敗。

```
$ pnpm test
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  2 failed | 377 passed (379)
      Tests  2 failed | 6750 passed | 1 skipped (6753)
 FAIL  |@sodashitsu/cli| src/paneSocket.test.ts > callPaneOp（偽の受け口） > socket でないファイル・誰も待ち受けていない socket（繋がる前のエラー）→ fallback
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/paneSocket.test.ts:302:3
    300|   });
    301|
    302|   it("socket でないファイル・誰も待ち受けていない socket（繋がる前のエラー）→ fallback", async () …
       |   ^
    303|     const file = join(dir, "plain.sock");
    304|     await writeFile(file, "not a socket");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/composeServer.graph.integration.test.ts > composeServer: 連携の実行（20260927-agent-graph の 02） > 引き継ぎの間は実行を止め（元が完了しても動かない）、引き継ぎに失敗して元に戻ったら再び動く
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/composeServer.graph.integration.test.ts:725:25
    723|         ),
    724|       ) as { ok: boolean };
    725|       expect(answer.ok).toBe(true);
       |                         ^
```

- 1 件目（`paneSocket.test.ts`）は**この work の欠陥**: タスクをまたぐ点検の修正（`ECONNREFUSED` は 5 秒まで繋ぎ直す。fb16a92）で、既存のテストの前半「socket でないファイル → fallback」が
  繋ぎ直しに入るようになった（普通のファイルへの `connect` も `ECONNREFUSED` になる）。繋ぎ直しの上限 5 秒がテストの上限 5 秒と同じで、時間切れになる。修正直後に 4 ファイルだけ流したときは通っていた（上限ぎりぎりで間欠）。
  → coding へ差し戻す（テストの側を直す: 繋ぎ直しを見ないケースは `refusedRetryMs: 0`）。
- 2 件目（`composeServer.graph.integration.test.ts`）は**この環境の制約**: Node v20 に `process.execve` が無く、handoff が `unsupported` を返す（`decisions.md` D6）。この work の変更の前から同じかは、下のラウンド 2 で `main` と比べて確かめる。

### ラウンド 2（差し戻しの修正の後。Node v20.20.2 と v24.21.0）

差し戻しの修正（`paneSocket.test.ts` の 1 件に `refusedRetryMs: 0`）の後、`paneSocket.test.ts` を 3 回続けて 41 passed。

Node 24 の `pnpm test`（全体）は失敗なし:

```
$ node -v
v24.21.0
$ pnpm test
 Test Files  379 passed (379)
      Tests  6753 passed (6753)
```

Node 20 の `pnpm test`（全体）は、4 回とも `composeServer.graph.integration.test.ts` の 1 件が落ちる（この環境の制約。Node 20 に `process.execve` が無く handoff が `unsupported` を返す。この work では触っていないファイル）。
加えて、4 回のうち**最初の 1 回だけ**、この work で足した handoff の結合テスト（T8）が落ちた:

```
$ pnpm test        # Node v20.20.2・1 回目
 FAIL  |@sodashitsu/server| src/composeServer.handoff.integration.test.ts > composeServer: 引き継ぎの間の pane.sock（20261003-sodactl-ask-socket の T8） > 引き継ぎの間は、待っていた接続を返事なしで捨て、新しい接続を pane_socket_busy で断る。元に戻ると受け付けが戻る（AC11）
AssertionError: expected { ok: false, error: { …(2) } } to match object { ok: true, …(1) }
(3 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": true,
-   "result": {
-     "status": "unavailable",
-   },
+   "ok": false,
  }

 ❯ vi.waitFor.timeout src/composeServer.handoff.integration.test.ts:369:48
    367|       await vi.waitFor(
    368|         async () =>
    369|           expect(await call(sockPath, paneId)).toMatchObject({
       |                                                ^
    370|             ok: true,
    371|             result: { status: "unavailable" },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed | 377 passed (379)
      Tests  2 failed | 6750 passed | 1 skipped (6753)
   Start at  17:11:25
```

- 返事が `ok: false` のまま 10 秒続いた（code は出力から読めなかった）。同じテストは単独で 4 回、サーバのパッケージだけで 2 回、全体であと 3 回（Node 20）と 1 回（Node 24）走らせて、どれも通った（再現していない）。
- 原因は**未特定**。落ちたときに返事の code が読めるよう、assert を返事の全体を比べる形に変えた（製品のコードは変えていない）。Node 20 は対象外の版（`engines` は 24 以上）で、このテストは Node 20 のときだけ `process.execve` の置き場を足して動かしている。
- 判定: 合格にする（Node 24 では失敗が出ていない）。ただし「未検証の穴」に残す。

smoke の 1 本目（`pnpm -s build && pnpm -s smoke`）は、**`/workspaces/sodashitsu` から走らせると落ちる**:

```
$ aidev smoke        # cwd=/workspaces/sodashitsu・Node 24
smoke: 20261003-sodactl-ask-socket
smoke: starting server on 127.0.0.1:36061 (state dir /tmp/soda-smoke-a8xhlt)
smoke: agent manifests ok (22/22)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane p2)
smoke: pane.subscribe ok
smoke: echo round trip ok
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke: FAIL locator.click: Timeout 30000ms exceeded.
smoke: fail (exit 1, 10 本)
…（`.xterm-helper-textarea` のクリックを `pane-frame-edge`〔pane の枠の上辺のメニュー〕が受けてしまい、30 秒で時間切れ）
smoke: fail (exit 1, 10 本)
```

切り分け（同じ smoke の 1 本目を、ビルドと実行場所を入れ替えて走らせた）:

| ビルド | 実行場所（cwd） | 結果 |
|---|---|---|
| この work（HEAD） | `/workspaces/sodashitsu` | 落ちる（Node 20・24 とも。2 回） |
| `main`（9514847） | `/workspaces/sodashitsu` | **落ちる**（同じ箇所） |
| この work（HEAD） | 別のパスの checkout | 通る |
| `main`（9514847） | 別のパスの checkout | 通る |

- この work の変更が原因ではない（`main` のビルドでも同じ場所で同じように落ち、この work のビルドは別の場所では通る。`packages/web` と `packages/server/src/smoke.ts` はこの work で変えていない）。
- 原因は**未特定**（推測: サーバを起動した場所が pane のシェルの cwd になり、プロンプトの長さで入力位置が変わって、1 行目にあるとき枠の上辺の当たり判定と重なる）。Web UI の既存の問題の可能性があるので follow-up に挙げる。

## 起動確認（smoke）

`aidev smoke` を、**この work の HEAD を別のパスに checkout した worktree**（scratchpad の下。`pnpm install --offline` → smoke の 1 本目がビルドする）で、**Node v24.21.0** で走らせた。
`/workspaces/sodashitsu` からは上の理由で 1 本目が落ちるため。worktree で記録された 1 行（`event: smoke, result: pass`）を、この work の `metrics.yml` へ写した（同じコミットの別の checkout での実行。`/workspaces/sodashitsu` での失敗の記録も `metrics.yml` に残っている）。
この work は新しい入口（サブコマンド・オプション）を足していないので `smokeCommands` に行は足さず、既存の 2 本目（cli）と 6 本目（handoff）にログインなしの ask の手順を足した。

```
$ node -v
v24.21.0
$ aidev smoke        # 抜粋: 各本の結果の行と、この work で足した手順の行
smoke: 20261003-sodactl-ask-socket
$ pnpm -s build && pnpm -s smoke
smoke: starting server on 127.0.0.1:34835 (state dir /tmp/soda-smoke-1jAQhh)
smoke: agent manifests ok (22/22)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane p2)
smoke: pane.subscribe ok
smoke: echo round trip ok
smoke: custom command popup round trip ok
smoke: PASS
$ pnpm --filter @sodashitsu/cli run smoke
smoke(cli): sodactl ask (unavailable without a browser / bad spec → 2 / outside a pane) ok
smoke(cli): sodactl ask without a login ok (pane socket → unavailable / derived from SODA_AGENT_REPORT_SOCKET / bad spec → 2; without the socket → unauthenticated)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
$ SODACTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/sodactl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && SODA_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { SODA_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
$ node packages/server/dist/handoffSmoke.js
handoff-smoke: not running → exit 3, nothing created ok
handoff-smoke: before: server pid 1310507, pane p1, shell pid 1310539
handoff-smoke: soda handoff → exit 0: soda: handoff complete: 1 pane(s) kept running
handoff-smoke: same server pid, /ws closed with 1012, handoff.json removed ok
handoff-smoke: same pane, same shell pid, previous screen visible, input/output ok
handoff-smoke: resize reaches the adopted pty ok
handoff-smoke: sodactl ask without a login in a pre-handoff pane environment (SODA_AGENT_REPORT_SOCKET only) → unavailable, exit 0 ok
handoff-smoke: pane closes when the adopted shell exits ok
handoff-smoke: ok
$ node packages/server/dist/stopSmoke.js
stop-smoke: ok
$ node packages/server/dist/machineSmoke.js
machine-smoke: ok
$ d=$(mktemp -d) && mkdir -p "$d/home/.wtmctl" && env -i PATH="$PATH" HOME="$d/home" XDG_STATE_HOME="$d/state" sh scripts/migrate-from-wtm.sh >"$d/out" && grep -q '^済み: CLI のキャッシュを移す' "$d/out" && test -d "$d/home/.sodactl" && env -i PATH="$PATH" HOME="$d/home" XDG_STATE_HOME="$d/state" sh scripts/migrate-from-wtm.sh | grep -q '移すものがありません'; rc=$?; rm -rf "$d"; exit $rc
$ node scripts/tui-pty-verify.mjs
tui-pty-verify: OK
smoke: pass (exit 0, 10 本)
```

## 未検証の穴（skip / 環境不足）

- **別の OS の利用者から `pane.sock` に繋げないこと**（実物では未検証。確かめたのはファイルの mode 0600 と置き方）。手順は `docs/verification.md`「共通：ログインなしの `sodactl ask`」。
- **macOS**（手元に無い。unix socket のパスの上限 103 バイト・`tmpdir()` の長さ）。**Windows の実機**（受け口を出さない・今までどおり login が要る、は platform を差し替えた単体テストだけ）。
- **版をまたぐ handoff**（`pane.sock` を持たない古い版から、この版へ `soda handoff` した後の、前から動いている pane）。smoke は同じ版どうしの handoff で、古い pane の環境を模している。
- **handoff の入れ替えの間の繋ぎ直し**（`ECONNREFUSED` で 5 秒まで）は単体テスト（残骸の socket → 置き直し）だけ。実物の handoff の最中に `sodactl ask` を打つ確認はしていない。
- **名前付き session（`--session`）の実物**・**保存した SSH のマシンの pane の中**でのログインなしの ask。
- **Node 20 で 1 回だけ出た T8 の結合テストの失敗**（原因未特定・再現せず）。
- **smoke の 1 本目が `/workspaces/sodashitsu` から落ちる件**と、**E2E 全体の 18 件の失敗**は、どちらも `main` で同じように落ちる（この work の範囲外。原因は未調査）。
- `pnpm lint` は `main` と同じ 22 errors のまま（この work の範囲外）。
- 受け口から質問を 32 件出して総数の上限に当てる確認、`close()` が途中で投げた経路での受け口と質問の後始末の順（コードを直したが、その経路だけを起こすテストは無い）。
