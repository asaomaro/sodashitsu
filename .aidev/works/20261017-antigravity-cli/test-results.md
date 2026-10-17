# 検証

## 信頼ダイアログ負の対照

追加manifestを入れる前の既存コードで実行した生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-antigravity

 ❯ |@sodashitsu/server| src/agent/antigravityManifest.test.ts (1 test | 1 failed) 59ms
   × identifies the observed agy workspace trust dialog as blocked 58ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/agent/antigravityManifest.test.ts > identifies the observed agy workspace trust dialog as blocked
AssertionError: expected { state: 'idle', ruleId: null, …(3) } to match object { state: 'blocked', …(1) }
(3 matching properties omitted from actual)

- Expected
+ Received

  {
-   "state": "blocked",
-   "visibleBlocker": true,
+   "state": "idle",
+   "visibleBlocker": false,
  }

 ❯ src/agent/antigravityManifest.test.ts:16:209


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  15:12:16
   Duration  331ms (transform 40%, import 34%, tests 25%, worker 1%)


```

## Bob/Copilot

別紙 test-results-bob-copilot.md。

## 未取得のcontext内訳を0扱いしない（負の対照）

修正前wrapperへの同じ入力での生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-antigravity

 ❯ |@sodashitsu/server| src/agent/antigravityStatusLineWrap.test.ts (7 tests | 1 failed | 6 skipped) 68ms
   × does not treat missing context counters as zero 66ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/agent/antigravityStatusLineWrap.test.ts > does not treat missing context counters as zero
AssertionError: expected { type: 'usage', paneId: 'p', …(5) } to not have property "contextTokens"

- Expected:
undefined

+ Received:
80

 ❯ src/agent/antigravityStatusLineWrap.test.ts:105:28
    103|     });
    104|     expect(reports[1]).toMatchObject({ type: "usage", inputTokens: 80 …
    105|     expect(reports[1]).not.toHaveProperty("contextTokens");
       |                            ^
    106|     expect(reports[1]).not.toHaveProperty("cacheReadTokens");
    107|   } finally { await socket.close(); }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  15:20:03
   Duration  443ms (transform 62%, tests 26%, import 11%, worker 2%)


```

## 標準statuslineの内訳のみのトークン（負の対照）

Bob/agy の total が無い場合、標準のtokens欄も空だった。同じ回帰テストの修正前出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-antigravity

 ❯ |@sodashitsu/protocol| src/statusline.test.ts (11 tests | 1 failed | 10 skipped) 7ms
   × shows known context token counts for Bob and agy without requiring a reported total 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/statusline.test.ts > shows known context token counts for Bob and agy without requiring a reported total
AssertionError: expected undefined to be 'Context tokens 19700' // Object.is equality

- Expected:
"Context tokens 19700"

+ Received:
undefined

 ❯ src/statusline.test.ts:210:115
    208|     const pane = { agent: { kind, label: kind, state: "idle" } } as im…
    209|     const usage = { kind, tokens: { basis: "context", input: 19700 } }…
    210|     expect(statuslineSegments(pane, usage, [], loadStatuslineSettings(…
       |                                                                                                                   ^
    211|     expect(statuslineSegments(pane, { ...usage, tokens: { basis: "cont…
    212|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 10 skipped (11)
   Start at  15:21:51
   Duration  172ms (transform 71%, import 16%, tests 9%, worker 4%)


```

## 最新mainでの失敗切り分け

baselineは origin/main 72d486a5、作業外のpristine worktree `/tmp/sodashitsu-antigravity-smoke-20261017` にpnpm install/buildして確認（各1回）。確認後にだけ、今回のsource変更とbuilt distをコピーしてsmoke用へ転用する。

| 検証 | 作業ブランチ | pristine main | 判断 |
| --- | --- | --- | --- |
| pane-info.spec.ts | 3失敗/1成功 | 同じ3失敗/1成功 | 常設statuslineによるusage_watch継続と古い「窓を閉じたら停止」の期待が不一致。退行ではない |
| surface/methods/agent.test.ts | delayMs期待1000/実300の1失敗 | 同じ1失敗 | 退行ではない |
| composeServer.usage.integration.test.ts | 全体runでは初回model:null/ゼロの1失敗。単独再実行9件成功 | 9件成功 | 全体run中の読取待ちの間欠的失敗。退行は再現せず |
| SettingsDialog固定行数 | 10期待/11の1失敗 | 対象外 | 新種別追加に合わせ既存テストを11へ更新し成功 |

ログ: `/tmp/antigravity-related-e2e.log`, `/tmp/antigravity-main-pane-info.log`, `/tmp/antigravity-failures-rerun.log`, `/tmp/antigravity-main-failures.log`。mainでの切り分けは追加で繰り返していない。

## 導入済み実CLI

隔離したserver/state/paneで `/home/asaomaro/.local/bin/agy --log-file <scratch>/agy.log` を起動。無入力のまま信頼ダイアログを観測し、Sodashitsuが `kind:agy,state:blocked` と判定した。Ctrl-Cとserver.closeで終了。認証/既存設定/信頼を変更せず、モデル呼び出しもしていない。

```json
{"check":"native agy in isolated Sodashitsu pane","kind":"agy","state":"blocked"}
```

`/tmp/soda-agy-live-check.mjs` と `/tmp/antigravity-live-check.log`。起動用port=0は製品が拒否したため空きportを確保して再実行した（製品不具合ではない）。

## 検証範囲の限界

実CLIの応答/working/ツール承認/実quota/statusline入力の受信、実会話resume、Windows/macOSは未実証。公開仕様に基づく合成入力と偽CLIで経路を検証した。コスト/effort/課金累計は取得不能として出さない。

## 最終成果物のbuild・typecheck・E2E・起動確認

- `pnpm build`: 成功（/tmp/antigravity-build-verified.log）。
- `pnpm typecheck`: 成功（/tmp/antigravity-typecheck-verified.log）。
- 最終製品コードで `antigravity-dashboard.spec.ts statusline.spec.ts`: 9件成功、解除日時追加による固定order期待1件だけ失敗。期待にotherLimitsResetを追加後、その1件を再実行して成功（/tmp/antigravity-e2e-final.log, /tmp/antigravity-statusline-setting-final.log）。合計10件の成功を確認。
- `dashboard-mobile.spec.ts`: 1件成功、画像記録2件skip。`pane-info.spec.ts`: 1件成功、mainで再現する既知3失敗（上表）。
- 実TUI: test-results-tui.md（Antigravityと合成Bob DB→adapter→実PTYの表示まで）。
- 作業外worktreeで `pnpm smoke`: PASS（/tmp/antigravity-smoke-final.log）。main baseline確認後、今回のsource差分/新規filesと最終buildの各package distをコピー。別state/server/実Chromiumでログイン→描画→PTY入力往復→案内を確認。稼働中serverのhandoffは行っていない。
- 独立レビューと各修正の再レビュー: review.md、残る修正要求なし。
- `git diff --check`: 成功。

## 最終全体テスト

`pnpm exec vitest run --maxWorkers=4`（root `pnpm test` と同じ vitest run にworker上限を指定）: 676ファイル、675成功/1失敗、10,937テスト中10,936成功/1失敗、311.50秒。

```text
 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > agent.prompt > 本文と Enter を 2 部分にして1000msの間を置くモード付き入力として書き、送信を始めた時点のエージェントを返す（AC2・AC4）
AssertionError: expected 300 to be 1000 // Object.is equality

- Expected
+ Received

- 1000
+ 300

 ❯ src/surface/methods/agent.test.ts:88:38
     86|     expect(result).toEqual({ ok: true, result: { agent: agent() } });
     87|     expect(s.host.modal).toHaveLength(1);
     88|     expect(s.host.modal[0]!.delayMs).toBe(1000);
       |                                      ^
     89|     expect(s.host.written).toEqual(["line1\nline2", "\r"]);
     90|     expect(s.noteInteraction).toHaveBeenCalledWith("c1", "p1");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 675 passed (676)
      Tests  1 failed | 10936 passed (10937)
   Start at  15:22:37
   Duration  311.50s (tests 82%, import 9%, environment 5%, transform 4%)


```

唯一の失敗はpristine mainでも同じ delayMs=1000期待/実300を確認した既知不一致。今回の変更のテストは成功。初回全体runで間欠的に失敗したClaude usage integrationも最終runは成功した。

最終ログ: `/tmp/antigravity-all-final.log`。最終製品コード以後の変更は、statusline E2Eの新フィールドに合わせる期待1行と記録のみ。build/typecheckは成功済み、E2E期待更新後の該当実ブラウザ再実行も成功。
