# Yukkuri Studio 検証記録

2026-10-11。配布パッケージ基盤と最初の動画制作プラグイン。

## 最終結果

- `pnpm build`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: 555 files / 10,377 tests PASS
- `node --test plugins/yukkuri-studio/studio.test.mjs`: 7 tests PASS
- `pnpm --filter @sodashitsu/e2e exec playwright test yukkuri-studio.spec.ts`: 1 test PASS
- `pnpm smoke`: PASS（ブラウザから実PTYへの入力まで）
- `git diff --check`: PASS
- 独立レビュー: `/root/review_plugins`。指摘修正と追加差分の再レビューとも要修正事項なし。
- 配布物: `release/yukkuri-studio-0.1.0.sodaplugin`（生成物。git管理外）

E2Eは実配布物のpack/install/enableから起動し、制作一覧、工程更新、台帳保存、進捗帯、1.2MiB動画の転送中に別の帯を閉じる動作、浮いた窓の操作開始と子iframeのクリックを確認。子文書が親DOMに触れず、サーバへのfetchも拒否されることを実ブラウザで観測。Nodeテストは実拡張プロセスとPythonジョブを起動し、並行する台帳更新を挟んでも完了とログが保存されることを確認。

生成スキルそのものの動画品質・音声エンジン・素材の検証はこの変更の対象外。Pythonジョブの自動テストは小さいfixtureプログラムを使う。

## 回帰テストの負の対照（生出力）

各ケースで修正箇所だけを戻し、指定テストが失敗することを確認。その後保存済みの元のbytesに戻し、一致をassertした。E2Eの対象プラグインは各実行でソースからpackされるため、古い配布物を使わない。

### quota

```text
✖ rejects oversized save without corrupting the readable previous library (17.367543ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 85.895886

✖ failing tests:

test at plugins/yukkuri-studio/studio.test.mjs:25:1
✖ rejects oversized save without corrupting the readable previous library (17.367543ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection.
      at async TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/studio.test.mjs:27:23)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /1MiB/,
    operator: 'rejects',
    diff: 'simple'
  }

```

### unicode

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/cli| src/pluginPackage.test.ts (10 tests | 1 failed | 9 skipped) 26ms
   ❯ portable plugins (10)
     × rejects server-forbidden fullwidth whitespace before changing existing configuration 25ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/pluginPackage.test.ts > portable plugins > rejects server-forbidden fullwidth whitespace before changing existing configuration
AssertionError: promise resolved "{ id: 'demo', version: '1.0.0', …(4) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "allow": [],
+   "enabled": false,
+   "id": "demo",
+   "path": "/tmp/soda-plugin-lQyUTz/state/plugins/demo-1.0.0-46bb1c85d464d752",
+   "reloadRequired": true,
+   "version": "1.0.0",
  }

 ❯ src/pluginPackage.test.ts:45:261


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  00:55:52
   Duration  490ms (transform 73%, import 20%, tests 6%, worker 1%)


```

### canonical

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/cli| src/pluginPackage.test.ts (10 tests | 1 failed | 9 skipped) 30ms
   ❯ portable plugins (10)
     × accepts reordered bundle files and verifies the same canonical bytes on enable 29ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/pluginPackage.test.ts > portable plugins > accepts reordered bundle files and verifies the same canonical bytes on enable
Error: installed plugin integrity mismatch
 ❯ changePlugin src/pluginPackage.ts:116:150
    114|           const files: PluginBundle["files"] = [];
    115|           for (const path of old.manifest.files) { const bytes = await…
    116|           if (hash(JSON.stringify(validateBundle({ format: "sodashitsu…
       |                                                                                                                                                      ^
    117|         }
    118|         entry.enabled = action === "enable";
 ❯ src/pluginPackage.test.ts:51:443

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  00:55:53
   Duration  449ms (transform 69%, import 22%, tests 9%, worker 1%)


```

### concurrent

```text
✖ concurrent updates serialize rather than losing job completion (13.073503ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 155.682862

✖ failing tests:

test at plugins/yukkuri-studio/studio.test.mjs:29:1
✖ concurrent updates serialize rather than losing job completion (13.073503ms)
  Error: EEXIST: file already exists, open '/tmp/studio-lock-s7t4n9/.yukkuri-studio/update.lock'
      at async open (node:internal/fs/promises:640:25)
      at async update (file:///workspaces/sodashitsu/plugins/yukkuri-studio/model.mjs:30:16)
      at async Promise.all (index 1)
      at async TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/studio.test.mjs:31:83)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    errno: -17,
    code: 'EEXIST',
    syscall: 'open',
    path: '/tmp/studio-lock-s7t4n9/.yukkuri-studio/update.lock'
  }

```

### stream-close

```text

Running 1 test using 1 worker

(node:2955492) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-10T15:55:55.250Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-10T15:55:55.251Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-sOa5RL/commands.json","count":0}
{"ts":"2026-10-10T15:55:56.665Z","level":"info","msg":"display script enabled","byClientId":"1754f427-1887-4589-95a3-a465d437735b","byKind":"desktop"}
{"ts":"2026-10-10T15:55:56.682Z","level":"info","msg":"extension started","extension":"user:yukkuri-studio","run":"b00f76d7-2538-4268-9f92-b7a31fc4f30a","state":"running"}
{"ts":"2026-10-10T15:55:56.718Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-studio","kind":"panel","format":"html","bytes":2463,"rev":1}
{"ts":"2026-10-10T15:55:56.720Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-progress","kind":"band","format":"html","bytes":1427,"rev":1}
{"ts":"2026-10-10T15:55:57.461Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-studio","kind":"panel","format":"html","bytes":6683,"rev":2}
{"ts":"2026-10-10T15:55:57.462Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-progress","kind":"band","format":"html","bytes":1445,"rev":2}
{"ts":"2026-10-10T15:55:57.727Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-studio","kind":"panel","format":"html","bytes":6716,"rev":3}
{"ts":"2026-10-10T15:55:57.730Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-progress","kind":"band","format":"html","bytes":1466,"rev":3}
{"ts":"2026-10-10T15:55:57.858Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-preview","kind":"panel","format":"script-html","bytes":2406,"rev":1}
{"ts":"2026-10-10T15:55:57.861Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-studio","kind":"panel","format":"html","bytes":6835,"rev":4}
{"ts":"2026-10-10T15:55:57.863Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-progress","kind":"band","format":"html","bytes":1466,"rev":4}
{"ts":"2026-10-10T15:55:58.081Z","level":"info","msg":"display closed","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-progress","reason":"dismissed"}
{"ts":"2026-10-10T15:55:58.710Z","level":"info","msg":"display set","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-studio","kind":"panel","format":"html","bytes":6835,"rev":5}
{"ts":"2026-10-10T15:56:13.119Z","level":"info","msg":"display closed","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-studio","reason":"closed"}
{"ts":"2026-10-10T15:56:13.119Z","level":"info","msg":"display closed","paneId":"5f268c56-6f4a-440c-b227-5e89eb19e5d2","name":"yukkuri-preview","reason":"closed"}
  ✘  1 src/specs/yukkuri-studio.spec.ts:11:1 › 配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる (18.1s)


  1) src/specs/yukkuri-studio.spec.ts:11:1 › 配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる ──────────────────

    Error: expect(locator).toContainText(expected) failed

    Locator: locator('[data-display-float] iframe[data-display-script]').contentFrame().locator('#loading')
    Expected substring: "再生・字幕・音声・クレジット"
    Received string:    "0.0 MiB 転送済み"
    Timeout: 15000ms

    Call log:
      - Expect "toContainText" locator('[data-display-float] iframe[data-display-script]').contentFrame().locator('#loading') with timeout 15000ms
      - waiting for locator('[data-display-float] iframe[data-display-script]').contentFrame().locator('#loading')
        33 × locator resolved to <p id="loading">0.0 MiB 転送済み</p>
           - unexpected value "0.0 MiB 転送済み"


      33 |  await expect(preview.locator('#loading')).toContainText('転送');
      34 |  await page.locator('[data-pane-band-close]').click();
    > 35 |  await expect(preview.locator('#loading')).toContainText('再生・字幕・音声・クレジット',{timeout:15000});
         |                                            ^
      36 |  const movieFrame=preview.frameLocator('#movie');await expect(movieFrame.locator('#sample')).toHaveText('動画の確認');
      37 |  // 不透明originと inherited CSP をブラウザで観測する。別文書でも親のDOM/ネットワークへは出ない。
      38 |  expect(await movieFrame.locator('body').evaluate(()=>{try{return parent.document.body.textContent;}catch{return 'isolated';}})).toBe('isolated');
        at /workspaces/sodashitsu/packages/e2e/src/specs/yukkuri-studio.spec.ts:35:44

    Error Context: test-results/yukkuri-studio-配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/yukkuri-studio-配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/yukkuri-studio-配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/yukkuri-studio.spec.ts:11:1 › 配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる ───────────────────
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test yukkuri-studio.spec.ts

```
