# 検証記録

WSL再起動で/tmpのログが失われたため、最終ビルド・型検査・E2Eを再実行。以後のログはこのフォルダへ保存。

- pnpm build: 成功。
- pnpm typecheck: 全パッケージとscripts成功。
- plugin-perspectives.spec.ts + yukkuri-studio.spec.ts: 4成功。ブラウザで2端末のDOM/シェル変数維持、タブ/ペインへのグラフ追加と削除、再起動後の復元、390pxモバイルの配置/タッチ設定、Git外PJへの承認とstandalone進捗表示、別PJからの候補除外、制作/動画プレビュー/工程操作、PJ分離/cwdを確認。
- node --test plugins/yukkuri-studio/studio.test.mjs: 8成功。
- 起動確認: 作業フォルダ外の/tmpから実行し、実物のシェル・Chromium・端末入力往復ともPASS。
- 全体Vitest（pnpm run test --maxWorkers=2）: 554ファイル/10,389テスト成功。1 suiteはソース更新日時とdistの前提ガードで停止（下記）。負の対照でbyte一致復元したExtensionHost.tsのmtimeがビルド後へ進んでいたためで、対象を強制ビルドして起動テストのみ再実行。

## 負の対照の生出力

各修正箇所だけを一時的に戻し、対象の回帰テストが失敗することを確認。finallyで元のbyte列に復元し、完全一致をassertした。以下は実行の生出力。

### negative-anchor-focus

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/actions/paneFocus.test.ts (3 tests | 1 failed | 2 skipped) 7ms
   × maps display anchors to their own live work pane 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/actions/paneFocus.test.ts > maps display anchors to their own live work pane
AssertionError: expected 'a' to be 'w' // Object.is equality

Expected: "w"
Received: "a"

 ❯ src/actions/paneFocus.test.ts:34:45
     32|  const panes=new Map([["w",worker],["a",anchor],["f",foreign]]) as Par…
     33|  const tabs=new Map([["t",{focusedPaneId:"w"}]]) as Parameters<typeof …
     34|  expect(workPaneForDisplay(panes,tabs,"a")).toBe("w");
       |                                             ^
     35|  expect(workPaneForDisplay(panes,tabs,"w")).toBe("w");
     36|  expect(workPaneForDisplay(panes,tabs,"missing")).toBeNull();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  11:08:55
   Duration  329ms (environment 75%, transform 15%, import 5%, tests 3%, worker 2%)


```

### negative-explicit-pj-root

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/extensions/projectRoot.test.ts (9 tests | 1 failed | 8 skipped) 10ms
   ❯ resolveProjectRoot (9)
     × uses an explicit PJ folder outside Git or inside a larger repository 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/projectRoot.test.ts > resolveProjectRoot > uses an explicit PJ folder outside Git or inside a larger repository
AssertionError: expected null to be '/tmp/soda-root-iP9AjZ/plain' // Object.is equality

- Expected:
"/tmp/soda-root-iP9AjZ/plain"

+ Received:
null

 ❯ src/extensions/projectRoot.test.ts:43:53
     41|   it("uses an explicit PJ folder outside Git or inside a larger reposi…
     42|     const plain=join(tmp,"plain");await mkdir(plain);
     43|     expect(await resolveProjectRoot(plain,{},true)).toBe(plain);
       |                                                     ^
     44|     const root=await repo(join(tmp,"repo"));const sub=join(root,"video…
     45|     expect(await resolveProjectRoot(sub,{},true)).toBe(sub);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  11:08:53
   Duration  422ms (transform 72%, import 24%, tests 3%, worker 1%)


```

### negative-mobile-app

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/mobile/MobileShell.test.ts (13 tests | 1 failed | 12 skipped) 75ms
   × keeps app view outside terminal scaling and lets swipes use native scrolling 75ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/mobile/MobileShell.test.ts > keeps app view outside terminal scaling and lets swipes use native scrolling
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/mobile/MobileShell.test.ts:329:317


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 12 skipped (13)
   Start at  11:08:56
   Duration  2.29s (transform 75%, import 14%, environment 8%, tests 3%)


```

### negative-pane-view-restore

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/session/SessionService.test.ts (197 tests | 1 failed | 196 skipped) 1159ms
   ❯ PJフォルダとプラグインタブ (2)
     × keeps work terminals alive across perspectives and restores only work panes 1157ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/session/SessionService.test.ts > PJフォルダとプラグインタブ > keeps work terminals alive across perspectives and restores only work panes
Error: {"kind":"corrupt","backupPath":"/tmp/soda-plugin-perspective-h0EA0y/session-backups/2026-10-11T02-08-52-552Z.json"}
 ❯ src/session/SessionService.test.ts:3569:35
    3567|       const {FsSessionFile}=await import("../persist/SessionFile.js");
    3568|       const file=new FsSessionFile(root);await file.save(toSessionFile…
    3569|       if(loaded.kind!=="ok")throw new Error(JSON.stringify(loaded));
       |                                   ^
    3570|       const restoredTerminals=new FakeTerminalManager();const restored…
    3571|       await restored.restore(loaded.data);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 196 skipped (197)
   Start at  11:08:50
   Duration  2.26s (tests 53%, transform 39%, import 8%)


```

### negative-pj-mode

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/extensions/ExtensionHost.project.test.ts (53 tests | 1 failed | 52 skipped) 2125ms
   × invalidates cached Git roots when the same cwd becomes an explicit PJ and when it is cleared 2123ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionHost.project.test.ts > invalidates cached Git roots when the same cwd becomes an explicit PJ and when it is cleared
Error: until: 条件が成り立ちませんでした
 ❯ Object.until src/extensions/hostHarness.ts:224:13
    222|         await settleIo();
    223|       }
    224|       throw new Error("until: 条件が成り立ちませんでした");
       |             ^
    225|     },
    226|     async run<T>(p: Promise<T>): Promise<T> {
 ❯ src/extensions/ExtensionHost.project.test.ts:789:176

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 52 skipped (53)
   Start at  11:17:10
   Duration  3.32s (tests 67%, transform 27%, import 6%)


```

### negative-portable-pj

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/cli| src/pluginPackage.test.ts (13 tests | 1 failed | 12 skipped) 26ms
   × keeps PJ packages manageable after moving the project folder 25ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/pluginPackage.test.ts > keeps PJ packages manageable after moving the project folder
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/pluginPackage.test.ts:86:82
     84|  await changePlugin(join(project,'.soda'),'install',f.bundle,true);
     85|  const moved=join(f.root,'moved');await rename(project,moved);const ba…
     86|  expect((await listPlugins(base))[0]?.path.startsWith(join(base,'plugi…
       |                                                                                  ^
     87|  expect(await changePlugin(base,'enable','demo',true)).toMatchObject({…
     88|  await changePlugin(base,'disable','demo',true);expect((await listPlug…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 12 skipped (13)
   Start at  11:08:54
   Duration  479ms (transform 70%, import 22%, tests 6%, worker 1%)


```

### negative-virtual-commands

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/commands/CommandService.test.ts (28 tests | 1 failed | 27 skipped) 9ms
   × does not start popup, detached shell or pane commands from a display anchor 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/commands/CommandService.test.ts > does not start popup, detached shell or pane commands from a display anchor
AssertionError: promise resolved "{ type: 'pane', pane: { id: 'p9' } }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "pane": {
+     "id": "p9",
+   },
+   "type": "pane",
  }

 ❯ src/commands/CommandService.test.ts:529:105
    527| it('does not start popup, detached shell or pane commands from a displ…
    528|  const f=setup({virtual:true});await f.service.reload();
    529|  for(const commandId of ['git','htop','build'])await expect(f.service.…
       |                                                                                                         ^
    530|  expect(f.created).toEqual([]);expect(f.spawned).toEqual([]);expect(f.…
    531| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 27 skipped (28)
   Start at  11:08:49
   Duration  409ms (transform 70%, import 26%, tests 3%, worker 1%)


```

### negative-virtual-targets

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/session/SessionModel.test.ts (186 tests | 1 failed | 185 skipped) 13ms
   × rejects display anchors as swap and edge-drop targets without losing work panes 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/session/SessionModel.test.ts > rejects display anchors as swap and edge-drop targets without losing work panes
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/session/SessionModel.test.ts:2230:54
    2228|  const second=model.splitPane(first.pane.id,'right',undefined,model.re…
    2229|  const anchor=model.createDisplayAnchor(first.tab.id);const before=mod…
    2230|  expect(model.swapPaneWith(first.pane.id,anchor.id)).toBe(false);
       |                                                      ^
    2231|  expect(model.moveToEdge(first.pane.id,anchor.id,'right')).toBe(false);
    2232|  expect(model.replacePane(first.pane.id,anchor.id)).toBeNull();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 185 skipped (186)
   Start at  11:08:47
   Duration  984ms (transform 83%, import 15%, tests 2%)


```

## 全体テストで停止した前提ガードの生出力

```text
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/launch/soda.pty.integration.test.ts > soda（引数なし）を本物の端末で（node-pty。dist が無ければ skip：先に pnpm build。Windows は対象外）
Error: dist is older than src (run pnpm build first): src/extensions/ExtensionHost.ts
 ❯ src/launch/soda.pty.integration.test.ts:133:15
    131|       const stale = [...staleOutputs(SERVER_PKG), ...staleOutputs(TUI_…
    132|       if (stale.length > 0)
    133|         throw new Error(
       |               ^
    134|           `dist is older than src (run pnpm build first): ${stale.slic…
    135|         );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 554 passed (555)
      Tests  10389 passed | 1 skipped (10390)
   Start at  11:17:41
   Duration  500.56s (tests 88%, import 6%, environment 3%, transform 2%)

Environment  |@sodashitsu/web| happy-dom was created 183 times · 32.09s total, 29% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments

 ELIFECYCLE  Test failed. See above for more details.

```

再実行: pnpm --filter @sodashitsu/server exec tsc -b --force → pnpm exec vitest run packages/server/src/launch/soda.pty.integration.test.ts。再実行の結果: 1ファイル/1テスト成功（pty-retest.log）。最終的に555ファイル/10,390テストが成功。

## 進捗集約の負の対照

集約表示の修正だけを戻すと、新しい回帰テストが失敗することを確認。byte一致で復元後、Nodeテスト8件の成功を再確認。

```text
✖ standalone progress shows stage completion and attention counts (1.124099ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 57.16145

✖ failing tests:

test at plugins/yukkuri-studio/studio.test.mjs:58:1
✖ standalone progress shows stage completion and attention counts (1.124099ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /1\/9 工程完了/. Input:

  '<style>*{box-sizing:border-box}body{margin:0;background:var(--soda-bg);color:var(--soda-fg);font:14px/1.6 system-ui}main{padding:16px;max-width:960px;margin:auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:14px 0 8px}.muted,small{opacity:.75}.card{padding:12px;margin:10px 0;border:1px solid var(--soda-menu-border);border-radius:10px;background:var(--soda-menu-bg)}button,input,textarea,select{font:inherit;color:inherit;background:var(--soda-subtle-bg);border:1px solid var(--soda-menu-border);border-radius:6px;padding:5px 8px}button{cursor:pointer}button:hover{border-color:var(--soda-accent)}input,textarea,select{width:100%;margin:4px 0 8px}button:disabled{opacity:.7;cursor:default}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.row>*{flex:0 1 auto}.stage{display:grid;grid-template-columns:1fr auto;gap:8px;padding:5px 0;border-bottom:1px solid var(--soda-menu-border)}.badge{font-size:12px;border:1px solid var(--soda-menu-border);border-radius:20px;padding:1px 8px}.done{color:#70d8a0}.failed{color:var(--soda-error-fg)}.working,.review{color:var(--soda-warn-fg)}progress{width:100%;height:6px;accent-color:var(--soda-accent)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.title{font-size:16px;font-weight:600}label{display:block}a{color:var(--soda-accent)}</style><div class="row" style="padding:4px 10px"><strong>🎬 Yukkuri Studio</strong><small>1 制作</small></div>'

      at TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/studio.test.mjs:60:9)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.start (node:internal/test_runner/test:1096:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '<style>*{box-sizing:border-box}body{margin:0;background:var(--soda-bg);color:var(--soda-fg);font:14px/1.6 system-ui}main{padding:16px;max-width:960px;margin:auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:14px 0 8px}.muted,small{opacity:.75}.card{padding:12px;margin:10px 0;border:1px solid var(--soda-menu-border);border-radius:10px;background:var(--soda-menu-bg)}button,input,textarea,select{font:inherit;color:inherit;background:var(--soda-subtle-bg);border:1px solid var(--soda-menu-border);border-radius:6px;padding:5px 8px}button{cursor:pointer}button:hover{border-color:var(--soda-accent)}input,textarea,select{width:100%;margin:4px 0 8px}button:disabled{opacity:.7;cursor:default}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.row>*{flex:0 1 auto}.stage{display:grid;grid-template-columns:1fr auto;gap:8px;padding:5px 0;border-bottom:1px solid var(--soda-menu-border)}.badge{font-size:12px;border:1px solid var(--soda-menu-border);border-radius:20px;padding:1px 8px}.done{color:#70d8a0}.failed{color:var(--soda-error-fg)}.working,.review{color:var(--soda-warn-fg)}progress{width:100%;height:6px;accent-color:var(--soda-accent)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.title{font-size:16px;font-weight:600}label{display:block}a{color:var(--soda-accent)}</style><div class="row" style="padding:4px 10px"><strong>🎬 Yukkuri Studio</strong><small>1 制作</small></div>',
    expected: /1\/9 工程完了/,
    operator: 'match',
    diff: 'simple'
  }

```

## ビュー追加ボタンの配置・見た目

利用者の追加依頼により、デスクトップの［ビューを追加］をTabBar右端へ移し、既存tab-bar-newのスタイルを共有。単独タブでも入口を維持。モバイルの入口は残しsegトークンに合わせた。空のTabViews行は非表示にするがダイアログは維持。Webビルド成功、TabBar/MobileShellの57テスト成功、既存plugin-perspectives E2E 2成功。独立レビューreview_perspective_uiで追加指摘なし。
