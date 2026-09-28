# テスト結果: 02-server

## 実行したもの
- `pnpm build` — exit 0
- `pnpm typecheck` — exit 0
- `npx vitest run packages/protocol packages/client-core packages/server packages/web packages/cli` — 290 files / 5303 passed / 0 failed / 0 skipped（tui は 03 の修正が並行で進行中のため、この subtask の検証からは外した。tui は 03 の test で見る）
- 実装者の検証（記録）: `soda --state-dir <tmp> --session t`（dist）で裏の起動 → token の表示 → 接続 → 終了コード 0、2 回目は既存のサーバへ、`SODA_PANE_ID` で終了コード 1、`soda session stop` で `local-auth.json` が消える。
- 負の確認（変異の網羅）: PrefsSync 25 件・launch 8 件の変異がすべて新しいテストで落ちる（review.md のタスク点検ログ・`scratchpad/check-02r2-mut/`）。

## ラウンド 2（review の差し戻しの後）
- `pnpm build` — exit 0 / web の `vue-tsc` — exit 0
- `npx vitest run packages/protocol packages/client-core packages/server packages/web packages/cli` — 290 files / 5310 passed / 0 failed
- 実装者の記録: 負荷平均 19 の下で同時起動のテストが 1 回落ち、順序を待ちの時間に頼らない形に直した（L1・L3 の変異で落ちることを確認し直した）。WsGateway の 1MiB の入力の上限のテストが負荷で 1 回落ちた（既知の不安定。最終の実行では通過）。

### 負の確認（review の差し戻しの修正。直した行を戻して落ちることの生の出力）

```
# 02-server の review の修正（9508f77・1dea1c6）の負の確認：生の出力
# 各変異は 1 行だけを書き換え、テストを走らせ、元に戻して cmp で一致を確かめた。

## N1 古い版のサーバの判定を外す（9508f77）
変異: packages/server/src/launch/findOrStart.ts
  - if (Date.now() - authMissingSince >= (deps.oldServerGraceMs ?? 2000)) {
  + if (false) {
コマンド: cd /workspaces/sodashitsu && npx vitest run packages/server/src/launch/findOrStart.test.ts -t 古い版のサーバ
終了コード: 1
出力（失敗の行・抜粋。vitest が出したまま）:
     × 持ち主と serve.json は合うのに local-auth.json が猶予を過ぎても無ければ、古い版のサーバとして案内して断る 5866ms
 Test Files  1 failed (1)
      Tests  1 failed | 18 skipped (19)
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
 FAIL  |@sodashitsu/server| src/launch/findOrStart.test.ts > findOrStart > 持ち主と serve.json は合うのに local-auth.json が猶予を過ぎても無ければ、古い版のサーバとして案内して断る
AssertionError: expected 'soda serve did not become ready withi…' to contain 'older version'
Expected: "older version"
Received: "soda serve did not become ready within 5 seconds"
 ❯ src/launch/findOrStart.test.ts:263:42
    261|     }).catch((e: unknown) => e);
    262|     expect(err).toBeInstanceOf(LaunchError);
    263|     expect((err as LaunchError).message).toContain("older version");
    264|     expect((err as LaunchError).hint).toContain("soda handoff");
    265|     expect(Date.now() - t0).toBeLessThan(3000);

復元: cmp 一致=True

## N2 時間切れで起動しなかった側も serve.out を読む（9508f77）
変異: packages/server/src/launch/findOrStart.ts
  - const out = started !== undefined ? await takeServeOut(outPath) : "";
  + const out = await takeServeOut(outPath);
コマンド: cd /workspaces/sodashitsu && npx vitest run packages/server/src/launch/findOrStart.test.ts -t 起動しなかった側の時間切れ
終了コード: 1
出力（失敗の行・抜粋。vitest が出したまま）:
     × 起動しなかった側の時間切れは serve.out を読まない・空にしない（起動した側の token を横取りしない） 358ms
 Test Files  1 failed (1)
      Tests  1 failed | 18 skipped (19)
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
 FAIL  |@sodashitsu/server| src/launch/findOrStart.test.ts > findOrStart > 起動しなかった側の時間切れは serve.out を読まない・空にしない（起動した側の token を横取りしない）
AssertionError: expected 'サーバの出力（末尾）:\nsoda: open http://127.0.…' not to contain 'THEIRS'
- Expected
+ Received
- THEIRS
+ サーバの出力（末尾）:
+ soda: open http://127.0.0.1:1/#token=<redacted>
+ soda: (token 付きの URL は今だけ表示します)
+ soda: open http://127.0.0.1:1/#token=THEIRS
+ soda: (token 付きの URL は今だけ表示します)
+ サーバは止めていません。/tmp/soda-find-RELLOG/server.log を確かめ、少し待ってからもう一度 soda を実行してください。
 ❯ src/launch/findOrStart.test.ts:281:43
    279|     expect(err).toBeInstanceOf(LaunchError);
    280|     expect((err as LaunchError).message).toContain("did not become rea…
    281|     expect((err as LaunchError).hint).not.toContain("THEIRS");
    282|     expect(await readFile(join(stateDir, "serve.out"), "utf8")).toBe(o…
    283|   });

復元: cmp 一致=True

## N3 端末（TTY）の確かめを外す（9508f77）
変異: packages/server/src/launch/tuiCommand.ts
  - if (!proc.isTty) {
  + if (false) {
コマンド: cd /workspaces/sodashitsu && npx vitest run packages/server/src/launch/findOrStart.test.ts -t 端末でなければ
終了コード: 1
出力（失敗の行・抜粋。vitest が出したまま）:
     × runTuiCommand: 標準入出力が端末でなければ、サーバを起動せずに一行の案内と help を出して 2（--state-dir・--session の形も同じ） 20ms
 Test Files  1 failed (1)
      Tests  1 failed | 18 skipped (19)
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
 FAIL  |@sodashitsu/server| src/launch/findOrStart.test.ts > findOrStart > runTuiCommand: 標準入出力が端末でなければ、サーバを起動せずに一行の案内と help を出して 2（--state-dir・--session の形も同じ）
Error: must not spawn
 ❯ spawnServe src/launch/findOrStart.test.ts:522:17
    520|         spawnServe: async (req) => {
    521|           spawned.push(req);
    522|           throw new Error("must not spawn");
    523|         },
    524|       });
 ❯ findOrStart src/launch/findOrStart.ts:122:23
 ❯ runTuiCommand src/launch/tuiCommand.ts:36:14
 ❯ src/launch/findOrStart.test.ts:519:20

復元: cmp 一致=True

## N4 読み込み時の期限切れセッションの掃除を外す（9508f77）
変異: packages/server/src/auth/AuthService.ts
  - if (this.pruneExpired(now)) await this.file.save(this.data);
  + （行を削除）
コマンド: cd /workspaces/sodashitsu && npx vitest run packages/server/src/auth/AuthService.test.ts
終了コード: 1
出力（失敗の行・抜粋。vitest が出したまま）:
     × 読み込みのときに、最後に使ってから 14 日を過ぎたセッションを auth.json から捨てる（期限の内側は残す） 16ms
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
 FAIL  |@sodashitsu/server| src/auth/AuthService.test.ts > DefaultAuthService — 期限の切れたセッションの掃除 > 読み込みのときに、最後に使ってから 14 日を過ぎたセッションを auth.json から捨てる（期限の内側は残す）
AssertionError: expected [ 'old', 'fresh' ] to deeply equal [ 'fresh' ]
- Expected
+ Received
+   "old",
 ❯ src/auth/AuthService.test.ts:218:27
    216|     ]);
    217|     await new DefaultAuthService(new FsAuthFile(dir)).initialize();
    218|     expect(await saved()).toEqual(["fresh"]);
    219|   });
    220|

復元: cmp 一致=True

## N5 発行時の期限切れセッションの掃除を外す（9508f77）
変異: packages/server/src/auth/AuthService.ts
  - this.pruneExpired(Date.now()); // 下の保存で一緒に書く
  + （行を削除）
コマンド: cd /workspaces/sodashitsu && npx vitest run packages/server/src/auth/AuthService.test.ts
終了コード: 1
出力（失敗の行・抜粋。vitest が出したまま）:
     × セッションを発行するときにも、期限の切れたものを捨ててから保存する（発行のたびに増え続けない） 69ms
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
 FAIL  |@sodashitsu/server| src/auth/AuthService.test.ts > DefaultAuthService — 期限の切れたセッションの掃除 > セッションを発行するときにも、期限の切れたものを捨ててから保存する（発行のたびに増え続けない）
AssertionError: expected [ 'fresh', …(1) ] to have a length of 1 but got 2
- Expected
+ Received
- 1
+ 2
 ❯ src/auth/AuthService.test.ts:229:20
    227|     const id = await auth.issueSession();
    228|     const hashes = await saved();
    229|     expect(hashes).toHaveLength(1);
    230|     expect(hashes).not.toContain("fresh");
    231|     expect(auth.verifySession(id)).toBe(true);

復元: cmp 一致=True

## N6 仮の入口の終了時のログアウトを外す（9508f77）
変異: packages/server/src/launch/placeholderEntry.ts
  - await postJson(target, "/api/logout", {}, 5000, cookie).catch(() => undefined);
  + void postJson;
コマンド: cd /workspaces/sodashitsu && npx vitest run packages/server/src/launch/findOrStart.test.ts -t runTuiCommand: 仮の入口
終了コード: 1
出力（失敗の行・抜粋。vitest が出したまま）:
     × runTuiCommand: 仮の入口は local-login → /ws → client.hello（desktop）で繋ぎ、繋ぎ先を 1 行表示して 0。断る事情は案内つきの 1 1854ms
 Test Files  1 failed (1)
      Tests  1 failed | 18 skipped (19)
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
 FAIL  |@sodashitsu/server| src/launch/findOrStart.test.ts > findOrStart > runTuiCommand: 仮の入口は local-login → /ws → client.hello（desktop）で繋ぎ、繋ぎ先を 1 行表示して 0。断る事情は案内つきの 1
AssertionError: expected [ { …(3) } ] to deeply equal []
- Expected
+ Received
- []
+ [
+   {
+     "createdAt": "2026-09-27T19:39:35.870Z",
+     "idHash": "00a1f88af3807cf5ecfd32cec1dc3ed3b133436e1c79e9b621060e5389e31b09",
+     "lastSeenAt": "2026-09-27T19:39:35.870Z",
+   },
+ ]
 ❯ src/launch/findOrStart.test.ts:485:31
    483|       sessions: unknown[];
    484|     };
    485|     expect(authJson.sessions).toEqual([]);
    486|     const nested = await runTuiCommand(
    487|       parseArgs(["--state-dir", stateDir]),

復元: cmp 一致=True

## N7 stopTarget のリモート（保存したマシン）の分岐を外す（1dea1c6）
変異: packages/web/src/actions/ActionDispatcher.ts
  - if (id !== LOCAL_MACHINE_ID) return { target: this.machines.statusOf(id)?.label ?? id, remote: true };
  + （行を削除）
コマンド: cd /workspaces/sodashitsu && npx vitest run packages/web/src/actions/ActionDispatcher.test.ts -t stopServer
終了コード: 1
出力（失敗の行・抜粋。vitest が出したまま）:
     × stopServer: 確認の文脈に止まるサーバ（ローカルはホスト名・保存したマシンはその名前）を入れる 24ms
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 172 skipped (174)
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
 FAIL  |@sodashitsu/web| src/actions/ActionDispatcher.test.ts > ActionDispatcher — D-7 の操作（20260927-cli-mode） > stopServer: 確認の文脈に止まるサーバ（ローカルはホスト名・保存したマシンはその名前）を入れる
AssertionError: expected { kind: 'confirmStopServer', …(2) } to deeply equal { kind: 'confirmStopServer', …(2) }
- Expected
+ Received
-   "remote": true,
-   "target": "GPU",
+   "remote": false,
+   "target": "devbox",
 ❯ src/actions/ActionDispatcher.test.ts:2637:32
    2635|     machines.select(id);
    2636|     dispatcher.run({ type: "stopServer" });
    2637|     expect(view.dialogContext).toEqual({ kind: "confirmStopServer", ta…
    2638|   });
    2639|

復元: cmp 一致=True

## N8 ConfirmDialog の止まるサーバの名前の文言を外す（1dea1c6）
変異: packages/web/src/components/ConfirmDialog.vue
  - const which = ctx.remote ? `保存したマシン「${ctx.target}」` : `このマシン（${ctx.target}）`;
  + const which = "この";
コマンド: cd /workspaces/sodashitsu && npx vitest run packages/web/src/components/ConfirmDialog.test.ts -t confirmStopServer
終了コード: 1
出力（失敗の行・抜粋。vitest が出したまま）:
     × confirmStopServer: 文言と「止める」ボタン。確定で confirmStopServer、取り消しは閉じるだけ 73ms
     × confirmStopServer: 保存したマシンを向いていれば、そのマシンの名前で確かめる（02 の review） 16ms
 Test Files  1 failed (1)
      Tests  2 failed | 38 skipped (40)
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
 FAIL  |@sodashitsu/web| src/components/ConfirmDialog.test.ts > ConfirmDialog — サーバの停止・キーからの worktree の削除 > confirmStopServer: 文言と「止める」ボタン。確定で confirmStopServer、取り消しは閉じるだけ
AssertionError: expected 'このの soda serve を止めますか？ そのサーバのすべての pan…' to contain 'このマシン（devbox）の soda serve を止めますか'
Expected: "このマシン（devbox）の soda serve を止めますか"
Received: "このの soda serve を止めますか？ そのサーバのすべての pane のプロセスが終わり、繋いでいる画面はすべて切れます。キャンセル止める"
 ❯ src/components/ConfirmDialog.test.ts:462:28
    460|     await wrapper.vm.$nextTick();
    461|     expect((wrapper.get("dialog").element as HTMLDialogElement).open).…
    462|     expect(wrapper.text()).toContain("このマシン（devbox）の soda serve を止めますか…
    463|     expect(wrapper.findAll("button")[1]!.text()).toBe("止める");
    464|     await wrapper.findAll("button")[1]!.trigger("click");
 FAIL  |@sodashitsu/web| src/components/ConfirmDialog.test.ts > ConfirmDialog — サーバの停止・キーからの worktree の削除 > confirmStopServer: 保存したマシンを向いていれば、そのマシンの名前で確かめる（02 の review）
AssertionError: expected 'このの soda serve を止めますか？ そのサーバのすべての pan…' to contain '保存したマシン「GPU」の soda serve を止めますか'
Expected: "保存したマシン「GPU」の soda serve を止めますか"
Received: "このの soda serve を止めますか？ そのサーバのすべての pane のプロセスが終わり、繋いでいる画面はすべて切れます。キャンセル止める"
 ❯ src/components/ConfirmDialog.test.ts:478:28
    476|     view.openDialogWithContext({ kind: "confirmStopServer", target: "G…
    477|     await wrapper.vm.$nextTick();
    478|     expect(wrapper.text()).toContain("保存したマシン「GPU」の soda serve を止めますか"…
    479|   });
    480|

復元: cmp 一致=True
```

## 受け入れ基準ごとの判定（この subtask の分）
- AC1: pass（サーバ側）— 引数なしの `soda` がサーバを見つける/裏で起動して繋ぐ（仮の入口。端末版の表示は 03）。
- AC11: pass（設定の共有の土台）— `prefs.*` の保存・配布・再起動後の復元、web の移行と反映（happy-dom のテスト）。
- AC18: pass — `/api/local-login` は秘密の不一致・別のアドレス・回数の制限で断る（integration・unit）。
- AC19: pass — 既存のテストは全部通る。設定がブラウザ同士でも共有されるようになった点は decisions D3 の意図した変化。

## 失敗の証跡
このラウンドでは失敗が発生していない（実装中の 1 回目の全体の実行で `WsGateway.integration` の時間に依る 1 件が落ち、単体・2 回目では通った——実装者の報告。負荷による不安定と見ており、この test では再現していない）。

## 起動確認（smoke）
subtask では打たない（親の統合 test で打つ）。

## 未検証の穴（skip / 環境不足）
- Windows の実機: WMI での起動・`cmd.exe` の引用・`serve.out` の NUL の扱い・`/api/local-login` の ACL の前提。
- 別のマシンからの `/api/local-login` は判定を差し替えたテストだけ。
- E2E（ブラウザ）は回していない。設定がブラウザ同士で共有されるようになったことの E2E への影響は見ていない。
