# 検証結果

- 全体build PASS。最終のWebレイアウト・配色とサーバWindowsパスも各パッケージbuildで更新済み。
- 最終の全体typecheck PASS: /tmp/soda-insights-final-typecheck.log。
- 全体テスト2回目: 949 files passed、1 skipped、13,576 tests passed、2 skipped。端末起動suiteのみ、negative controlからソースを復元したことによるdist鮮度チェックで失敗した。再build後に同suiteを単独再実行し1 test PASS。最終変更の集中検証は4 files / 29 tests PASS。
- 最初の全体テストでは、従来UsageAnalyticsテストが新しい子コンポーネントの自動読取をmockしていなかったため失敗した。既に隔離しているUsageHistoryPanelと同様に新コンポーネントもstub化し、親のアカウント取得・モデル起動の明示操作だけを試験する形に更新。最初のTUI fake-clock試験の17秒期待が16秒になる失敗は、単独再実行16 testsと2回目の全体テストで成功した。
- E2E usage-analytics-ui.spec.ts PASS。主要表示、役割ドーナツ、親子図、絞込、取得範囲、ツール詳細、JSONダウンロード、既存コストとAIレポート、狭幅、長い96字モデル名を検証。最終ログ /tmp/soda-insights-e2e-final-layout.log。
- Chromium 1223を明示した既存assertionのsmoke PASS: /tmp/soda-insights-smoke.log。ブラウザ→PTY入力往復まで確認。
- 実機handoffで実行中PTY5件継続、snapshotの7ペインIDすべて保持。最終ログ /tmp/soda-insights-final-handoff.log。
- 実ブラウザの受信frameとDOMでClaude/Codex、main/sub、実ツール名・呼出数を確認。狭幅は通常と条件展開の両方でscrollWidth<=clientWidth+1。最終ログ /tmp/soda-insights-live-browser-final.log、画像 /tmp/soda-insights-live-{desktop,mobile,mobile-filters}.png。取得分は継続集計中であり全利用量とは断定しない。
- アーティファクト3案はA/B/Cを実ブラウザで切替・描画し390pxでも横はみ出しなし。Pageを読戻してVisualizeの埋込を確認済み。

## negative control

修正部分のみを戻して失敗を確認し、各ファイルをバイト一致で復元した。CSSの対照は戻した状態でもWebを再buildしてからブラウザ検証し、復元・再build後の同じE2EはPASS。

### 中核とPC境界の6ケース

```text

CASE mixed-counts exit=1
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/usage/UsageInsights.test.ts (16 tests | 1 failed | 15 skipped) 111ms
   × keeps earlier cumulative usage when a session later starts emitting response records 110ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/usage/UsageInsights.test.ts > keeps earlier cumulative usage when a session later starts emitting response records
AssertionError: expected 60 to be 180 // Object.is equality

- Expected
+ Received

- 180
+ 60

 ❯ src/usage/UsageInsights.test.ts:64:60
     62|   {timestamp:'2026-10-16T00:00:01Z',type:'event_msg',payload:{type:'to…
     63|  ));
     64|  const r=await f.reader.read(range);expect(r.totals.total).toBe(180);e…
       |                                                            ^
     65| });
     66| it('does not let Claude discovery exhaust the Codex directory enumerat…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 15 skipped (16)
   Start at  08:47:15
   Duration  877ms (transform 67%, import 18%, tests 14%)


CASE discovery-fairness exit=1
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/usage/UsageInsights.test.ts (16 tests | 1 failed | 15 skipped) 226ms
   × does not let Claude discovery exhaust the Codex directory enumeration budget 225ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/usage/UsageInsights.test.ts > does not let Claude discovery exhaust the Codex directory enumeration budget
AssertionError: expected [ 'claude' ] to include 'codex'
 ❯ src/usage/UsageInsights.test.ts:69:60


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 15 skipped (16)
   Start at  08:47:17
   Duration  947ms (transform 55%, tests 26%, import 18%)


CASE metadata-retention exit=1
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/usage/UsageInsights.test.ts (16 tests | 1 failed | 15 skipped) 167ms
   × keeps metadata-only live sessions when usage is appended later 166ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/usage/UsageInsights.test.ts > keeps metadata-only live sessions when usage is appended later
AssertionError: expected { …(18) } to match object { role: 'sub', project: 'demo', …(1) }
(15 matching properties omitted from actual)

- Expected
+ Received

  {
-   "parent": StringContaining "parent",
-   "project": "demo",
-   "role": "sub",
+   "parent": null,
+   "project": "不明",
+   "role": "unknown",
  }

 ❯ src/usage/UsageInsights.test.ts:84:51
     82|  await writeFile(file,json({type:'session_meta',payload:{cwd:'/workspa…
     83|  await f.reader.read(range);await appendFile(file,json({timestamp:'202…
     84|  expect((await f.reader.read(range)).sessions[0]).toMatchObject({role:…
       |                                                   ^
     85| });
     86| it('recovers from page-capacity exhaustion and continues the file with…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 15 skipped (16)
   Start at  08:47:18
   Duration  903ms (transform 60%, tests 20%, import 19%)


CASE capacity-recovery exit=1
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/usage/UsageInsights.test.ts (16 tests | 1 failed | 15 skipped) 922ms
   × recovers from page-capacity exhaustion and continues the file without a permanent RPC failure 921ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/usage/UsageInsights.test.ts > recovers from page-capacity exhaustion and continues the file without a permanent RPC failure
Error: database or disk is full
 ❯ put src/usage/UsageInsights.ts:155:261

 ❯ UsageInsightsReader.consume src/usage/UsageInsights.ts:172:118
 ❯ UsageInsightsReader.read src/usage/UsageInsights.ts:80:80
 ❯ src/usage/UsageInsights.test.ts:90:41

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 15 skipped (16)
   Start at  08:47:20
   Duration  1.69s (tests 57%, transform 33%, import 9%)


CASE time-axis exit=1
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/web| src/dashboard/insightsModel.test.ts (4 tests | 1 failed | 3 skipped) 16ms
   × keeps missing days in the time axis rather than stretching sparse observations across the full chart 15ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/dashboard/insightsModel.test.ts > keeps missing days in the time axis rather than stretching sparse observations across the full chart
AssertionError: expected 'M0,50 L10,0' to be 'M140,50 L150,0' // Object.is equality

Expected: "M140,50 L150,0"
Received: "M0,50 L10,0"

 ❯ src/dashboard/insightsModel.test.ts:7:388


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  08:47:22
   Duration  288ms (environment 74%, transform 13%, tests 7%, import 5%, worker 1%)


CASE report-pc-boundary exit=1
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/web| src/dashboard/UsageInsightsPanel.test.ts (4 tests | 1 failed | 3 skipped) 78ms
   × invalidates the parent report filter before starting a new PC request 77ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/dashboard/UsageInsightsPanel.test.ts > invalidates the parent report filter before starting a new PC request
AssertionError: expected { from: '2026-10-03', …(2) } to be null

- Expected:
null

+ Received:
{
  "from": "2026-10-03",
  "timezone": "Asia/Tokyo",
  "to": "2026-11-01",
}

 ❯ src/dashboard/UsageInsightsPanel.test.ts:34:103
     32|  const machines=setup(async(id,p)=>{if(id==='remote')throw new Error('…
     33|  expect(wrapper!.emitted('insights')?.at(-1)?.[0]).toMatchObject({time…
     34|  machines.selectedId='remote';await flushPromises();expect(wrapper!.em…
       |                                                                                                       ^
     35| });
     36|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  08:47:23
   Duration  1.51s (transform 68%, import 16%, environment 10%, tests 5%)


```

### cacheWriteの重複

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/usage/UsageInsights.test.ts (17 tests | 1 failed | 16 skipped) 141ms
   × does not count Codex cache creation twice when explicit and cumulative samples overlap 140ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/usage/UsageInsights.test.ts > does not count Codex cache creation twice when explicit and cumulative samples overlap
AssertionError: expected { key: 'total', label: 'total', …(9) } to match object { total: 120, input: 50, …(3) }
(6 matching properties omitted from actual)

- Expected
+ Received

  {
    "cacheRead": 40,
    "cacheWrite": 10,
-   "input": 50,
+   "input": 60,
    "output": 20,
-   "total": 120,
+   "total": 130,
  }

 ❯ src/usage/UsageInsights.test.ts:102:54


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  08:58:36
   Duration  928ms (transform 65%, import 17%, tests 17%)


```

### 長いモデル選択肢の狭幅

```text

Running 1 test using 1 worker

(node:221364) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-11-02T00:00:33.953Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-11-02T00:00:33.954Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-11-02T00:00:33.954Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-11-02T00:00:33.956Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-PrnZl4/commands.json","count":0}
  ✘  1 src/specs/usage-analytics-ui.spec.ts:5:1 › generated usage analytics charts, date selection and explicit report work at desktop and narrow widths (3.5s)


  1) src/specs/usage-analytics-ui.spec.ts:5:1 › generated usage analytics charts, date selection and explicit report work at desktop and narrow widths

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: false
    Received: true

      203 |   await page.locator("[data-picker-dashboard]").click();
      204 |   await expect(hist).toContainText("claude · sonnet");
    > 205 |   expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
          |                                                                             ^
      206 |   await page.screenshot({
      207 |     path: test.info().outputPath("usage-analytics-narrow.png"),
      208 |     fullPage: true,
        at /workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/src/specs/usage-analytics-ui.spec.ts:205:77

    Error Context: test-results/usage-analytics-ui-generat-9bb46-t-desktop-and-narrow-widths/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/usage-analytics-ui-generat-9bb46-t-desktop-and-narrow-widths/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/usage-analytics-ui-generat-9bb46-t-desktop-and-narrow-widths/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/usage-analytics-ui.spec.ts:5:1 › generated usage analytics charts, date selection and explicit report work at desktop and narrow widths
undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test usage-analytics-ui.spec.ts --config /tmp/soda-resource-totals.config.mjs

```

### Windowsパス

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/usage/UsageInsights.test.ts (18 tests | 1 failed | 17 skipped) 136ms
   × extracts a Windows project name without retaining its absolute path in numeric storage 134ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/usage/UsageInsights.test.ts > extracts a Windows project name without retaining its absolute path in numeric storage
AssertionError: expected 'C:\Users\private-user\work\demo' to be 'demo' // Object.is equality

Expected: "demo"
Received: "C:\Users\private-user\work\demo"

 ❯ src/usage/UsageInsights.test.ts:106:32
    104| it('extracts a Windows project name without retaining its absolute pat…
    105|  const f=await fixture();await writeFile(join(f.project,'main.jsonl'),…
    106|  expect(r.byProject[0]?.label).toBe('demo');expect((await readFile(joi…
       |                                ^
    107|  expect(classifyTool('Read',{file_path:'C:\\Users\\private-user\\skill…
    108| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  09:07:27
   Duration  1.05s (transform 68%, import 18%, tests 14%)


```
