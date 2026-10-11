# 検証記録

2026-10-11。最終チェックの結果は下に記録する。

## 回帰テストの負の対照

修正箇所だけを戻し、同じテストが落ちることを確認した。その後元のbytesを復元し、一致をassertした。テストはソースを直接使うため、ビルド済みコードの取り違えはない。

### zoom

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/session/SessionService.test.ts (197 tests | 1 failed | 196 skipped) 21ms
   ❯ PJフォルダとプラグインタブ (2)
     × persists and restores the PJ folder and plugin anchor without spawning its terminal 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/session/SessionService.test.ts > PJフォルダとプラグインタブ > persists and restores the PJ folder and plugin anchor without spawning its terminal
AssertionError: expected [Function] to throw an error
 ❯ src/session/SessionService.test.ts:3552:54
    3550|       expect(()=>service.moveToTab(first.pane.id,tab.tab.id)).toThrow(…
    3551|       expect(()=>service.moveToTab(tab.pane.id,first.tab.id)).toThrow(…
    3552|       expect(()=>service.zoomPane(tab.pane.id,"on")).toThrow();
       |                                                      ^
    3553|       await expect(service.openCommandPane(tab.pane.id, root, {shell:"…
    3554|       expect(terminals.createOptions).toHaveLength(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 196 skipped (197)
   Start at  09:30:01
   Duration  1.18s (transform 82%, import 15%, tests 2%)


```

### command-spawn

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/session/SessionService.test.ts (197 tests | 1 failed | 196 skipped) 29ms
   ❯ PJフォルダとプラグインタブ (2)
     × persists and restores the PJ folder and plugin anchor without spawning its terminal 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/session/SessionService.test.ts > PJフォルダとプラグインタブ > persists and restores the PJ folder and plugin anchor without spawning its terminal
AssertionError: expected [ Array(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/session/SessionService.test.ts:3554:39
    3552|       expect(()=>service.zoomPane(tab.pane.id,"on")).toThrow();
    3553|       await expect(service.openCommandPane(tab.pane.id, root, {shell:"…
    3554|       expect(terminals.createOptions).toHaveLength(1);
       |                                       ^
    3555|       const {toSessionFileData}=await import("../composeServer.js");
    3556|       const {FsSessionFile}=await import("../persist/SessionFile.js");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 196 skipped (197)
   Start at  09:30:03
   Duration  1.11s (transform 81%, import 16%, tests 3%)


```

### scope

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/extensions/ExtensionHost.project.test.ts (51 tests | 1 failed | 50 skipped) 65ms
   ❯ PJフォルダ変更と根の時間切れ (1)
     × immediately denies the old root, does not cache it after timeout, and retries the new folder 63ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionHost.project.test.ts > PJフォルダ変更と根の時間切れ > immediately denies the old root, does not cache it after timeout, and retries the new folder
AssertionError: expected { type: 'ext.result', id: 901, …(2) } to match object { ok: false, …(1) }
(7 matching properties omitted from actual)

- Expected
+ Received

  {
-   "error": {
-     "code": "not_found",
-   },
-   "ok": false,
+   "ok": true,
  }

 ❯ src/extensions/ExtensionHost.project.test.ts:764:48
    762|     old.say({id:901,method:"display.set",params:{paneId:"p1",name:"aft…
    763|     await x.until(()=>old.lines().some(l=>l["id"]===901));
    764|     expect(old.lines().find(l=>l["id"]===901)).toMatchObject({ok:false…
       |                                                ^
    765|     expect(x.host.canOpenTab(pkey(root,"a"),"w1")).toBe(false);
    766|     await x.run(x.host.reload());

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 50 skipped (51)
   Start at  09:30:05
   Duration  812ms (transform 73%, import 18%, tests 9%)


```

### unchanged-form

```text
✖ real extension runs fixed Python job and persists completion through a concurrent update (2277.874479ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2341.245156

✖ failing tests:

test at plugins/yukkuri-studio/studio.test.mjs:33:1
✖ real extension runs fixed Python job and persists completion through a concurrent update (2277.874479ms)
  AssertionError [ERR_ASSERTION]: polling unchanged state must preserve UI forms

  2 !== 1

      at TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/studio.test.mjs:44:51)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 2,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

```

### separate-form

```text

Running 1 test using 1 worker

(node:4066162) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-11T00:37:43.640Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-11T00:37:43.641Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-regMGe/commands.json","count":0}
{"ts":"2026-10-11T00:37:45.055Z","level":"info","msg":"display script enabled","byClientId":"c32b49d4-c210-44cc-bf61-e49f6cc517a7","byKind":"desktop"}
{"ts":"2026-10-11T00:37:45.067Z","level":"info","msg":"extension started","extension":"user:yukkuri-studio","run":"aee93d1d-5a48-4002-add3-aa1fa7f4827a","state":"running"}
{"ts":"2026-10-11T00:37:46.102Z","level":"info","msg":"display set","paneId":"4a2cf1c0-97bc-4f67-831b-785f60e07717","name":"yukkuri-studio","kind":"panel","format":"html","bytes":2463,"rev":1}
{"ts":"2026-10-11T00:37:46.104Z","level":"info","msg":"display set","paneId":"4a2cf1c0-97bc-4f67-831b-785f60e07717","name":"yukkuri-progress","kind":"band","format":"html","bytes":1427,"rev":1}
{"ts":"2026-10-11T00:37:46.300Z","level":"info","msg":"display set","paneId":"4a2cf1c0-97bc-4f67-831b-785f60e07717","name":"yukkuri-studio","kind":"panel","format":"html","bytes":6683,"rev":2}
{"ts":"2026-10-11T00:37:46.301Z","level":"info","msg":"display set","paneId":"4a2cf1c0-97bc-4f67-831b-785f60e07717","name":"yukkuri-progress","kind":"band","format":"html","bytes":1445,"rev":2}
{"ts":"2026-10-11T00:37:46.594Z","level":"info","msg":"display set","paneId":"4a2cf1c0-97bc-4f67-831b-785f60e07717","name":"yukkuri-studio","kind":"panel","format":"html","bytes":6716,"rev":3}
{"ts":"2026-10-11T00:37:46.596Z","level":"info","msg":"display set","paneId":"4a2cf1c0-97bc-4f67-831b-785f60e07717","name":"yukkuri-progress","kind":"band","format":"html","bytes":1466,"rev":3}
{"ts":"2026-10-11T00:37:51.648Z","level":"info","msg":"display closed","paneId":"4a2cf1c0-97bc-4f67-831b-785f60e07717","name":"yukkuri-studio","reason":"closed"}
{"ts":"2026-10-11T00:37:51.648Z","level":"info","msg":"display closed","paneId":"4a2cf1c0-97bc-4f67-831b-785f60e07717","name":"yukkuri-progress","reason":"closed"}
  ✘  1 src/specs/yukkuri-studio.spec.ts:13:1 › 配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる (8.3s)


  1) src/specs/yukkuri-studio.spec.ts:13:1 › 配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる ──────────────────

    Error: expect(locator).toHaveValue(expected) failed

    Locator:  locator('[data-plugin-view] iframe[data-display-frame]').contentFrame().locator('form[data-soda-action="review"] textarea')
    Expected: ""
    Received: "台本を作成中"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveValue" locator('[data-plugin-view] iframe[data-display-frame]').contentFrame().locator('form[data-soda-action="review"] textarea') with timeout 5000ms
      - waiting for locator('[data-plugin-view] iframe[data-display-frame]').contentFrame().locator('form[data-soda-action="review"] textarea')
        14 × locator resolved to <textarea name="note" maxlength="2000" placeholder="画面・字幕・読み・出典・素材の規約を確認した内容"></textarea>
           - unexpected value "台本を作成中"


      35 |  await studioFrame.locator('form[data-soda-action="stage"] select').nth(0).selectOption('script');await studioFrame.locator('form[data-soda-action="stage"] select').nth(1).selectOption('working');await studioFrame.locator('form[data-soda-action="stage"] textarea').fill('台本を作成中');await studioFrame.getByRole('button',{name:'更新する',exact:true}).click();
      36 |  await expect(studioFrame.getByText('台本を作成中',{exact:true})).toBeVisible();
    > 37 |  await expect(studioFrame.locator('form[data-soda-action="review"] textarea')).toHaveValue('');
         |                                                                                ^
      38 |  await expect(page.frameLocator('[data-pane-band] iframe').locator('body')).toContainText('台本: 作業中');
      39 |  await studioFrame.getByRole('button',{name:'video.html',exact:true}).click();
      40 |  await page.getByRole('button',{name:'表示を開く（yukkuri-preview）',exact:true}).click();
        at /workspaces/sodashitsu/packages/e2e/src/specs/yukkuri-studio.spec.ts:37:80

    Error Context: test-results/yukkuri-studio-配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/yukkuri-studio-配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/yukkuri-studio-配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/yukkuri-studio.spec.ts:13:1 › 配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる ───────────────────
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test yukkuri-studio.spec.ts -g 配布物

```

## 最終結果

- `pnpm build`: PASS
- `pnpm typecheck`: PASS
- `pnpm --filter @sodashitsu/e2e typecheck`: PASS（最後のセレクタ変更後）
- `pnpm test`: 554 files / 10,379 tests PASS、graph/perf.integration.test.ts の1件が `timed out waiting for cat in every pane`。変更していない性能試験の起動待ち。単独再実行では3件全てPASS。全体の再実行はしない。
- `node --test plugins/yukkuri-studio/studio.test.mjs`: 7 PASS
- 関連E2E: workspace-groups + Studio の33件PASS。最後のフォーム保持修正後、Studioの2件を再実行してPASS。
- `pnpm smoke`: PASS
- `git diff --check`: PASS
- 独立レビュー: review_plugins（サーバ/保存/安全）、review_ui_delivery（UI/プラグイン）。各指摘と最後の小修正を再レビューし、要修正事項なし。
- 配布物: release/yukkuri-studio-0.2.0.sodaplugin（git管理外）。0.1と制作データを共用し、導入でデータを消さない。

ブラウザの観測: PJ-folder設定ダイアログ、tabの種類選択、full plugin view（端末canvasなし）、工程更新、進捗帯、浮いた1.2MiB動画、親DOM/ネットワークへの拒否、再生クリック、terminalへの復帰。別テストで未初期化2PJの自動init、両PJでの制作一覧の分離、通常タブで実行したprintfの `$PWD` をブラウザのOUTPUTフレームから確認。

Node/サーバの観測: 新タブと分割のspawn cwd、既存paneのcwd保持、不正パス拒否、保存/読込/復元後のprojectDirとplugin保持、virtual anchorのPTY未起動、move/zoom/custom commandの拒否、フォルダ変更直後の旧拡張scope拒否、根のタイムアウト後に旧rootを採用せず再試行する動作。

### 全体テストの性能試験（生出力）

```text
 FAIL  |@sodashitsu/server| src/graph/perf.integration.test.ts > 連携の性能（pane 16・線 32。AC17） > 1 つの元が完了してから、2 本の線の先へ送り始めるまで 2 秒以内（3 回、別々の元で測る）
Error: timed out waiting for cat in every pane
 ❯ waitFor src/graph/perf.integration.test.ts:43:38
     41|   const deadline = Date.now() + timeoutMs;
     42|   while (!cond()) {
     43|     if (Date.now() > deadline) throw new Error(`timed out waiting for …
       |                                      ^
     44|     await new Promise((r) => setTimeout(r, stepMs));
     45|   }
 ❯ boot src/graph/perf.integration.test.ts:106:3
 ❯ src/graph/perf.integration.test.ts:156:17

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯



```

### 性能試験の単独再実行（生出力）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

{"ts":"2026-10-11T00:35:45.852Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-11T00:35:45.853Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-Jy3OTK/commands.json","count":0}
[graph-perf] {"case":"single-change","panes":16,"links":32,"limitMs":2000,"results":[{"source":0,"toStartMs":[7,7],"toSentMs":[306,306]},{"source":5,"toStartMs":[5,5],"toSentMs":[303,304]},{"source":10,"toStartMs":[5,5],"toSentMs":[351,351]}]}
{"ts":"2026-10-11T00:35:53.206Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-11T00:35:53.207Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-BiqKP7/commands.json","count":0}
[graph-perf] {"case":"blocked","panes":16,"links":32,"holdMs":1000,"limitMs":2000,"results":[{"source":0,"triggerStartMs":1311,"approvalStartMs":1321},{"source":5,"triggerStartMs":1007,"approvalStartMs":1012},{"source":10,"triggerStartMs":1142,"approvalStartMs":1149}]}
{"ts":"2026-10-11T00:36:03.168Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-11T00:36:03.168Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-aePW3y/commands.json","count":0}
[graph-perf] {"case":"burst","panes":16,"links":32,"limitMs":2000,"maxFirstStartMs":14,"firstStartMs":[12,12,12,13,13,13,13,13,13,13,13,13,13,13,14,14]}

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  09:35:43
   Duration  25.68s (tests 92%, transform 7%, import 1%)


```

## 新規タブダイアログのバランス調整（2026-10-11）

- input/select の font・padding・最小高さを共通化、項目間の余白を揃えた。PJパスは補足表示・折り返し。320px幅でもダイアログは左右8pxに収まる。
- 実ブラウザ計測: input/select はともに32.59375px、文字16px。デスクトップと320px幅のスクリーンショットを目視確認。
- web build（vue-tsc含む）pass、NameDialog 13 tests pass、Yukkuri Studio E2E 2 tests pass。画像取得用の一時計測は実行後に復元。
- 独立レビュー review_tab_dialog_balance: clean。
- docs/plugin-packages.md に導入範囲と提供画面の設計方針を追記。現状のPTYなしアンカーと、未実装のタブ配下の複数エージェント・作業ペイン管理を区別した。
