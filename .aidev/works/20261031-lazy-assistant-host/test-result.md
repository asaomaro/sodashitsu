# 検証

初回build成功。関連30件成功。追加のmetadata-await競合10件成功。初回typecheckは試験のrelease mock型不一致を検出し修正。全体試験は905ファイル・13,138件中13,137件成功、未変更TUIの経過時間表示1件がtimeout。変更箇所+そのTUIを絞った45件、およびmain相当の既存worktreeでTUI14件が成功。再現せず、TUI sourceは変更せず記録した。全体typecheckの追加TS2352はfake watcherのcastだけをunknown経由へ修正、最終全体typecheck成功。

初回focusedは新worktreeのprotocol distが未buildで解決失敗したため、build後に再実行した。実機操作やapp起動はしていない。

## 順序の負例（意図したfactory生成のAssertionError）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-lazy-assistant-host

 ❯ |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts (10 tests | 1 failed | 9 skipped) 70ms
   × rechecks committed OFF after package metadata await even before watch delivery 69ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts > rechecks committed OFF after package metadata await even before watch delivery
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      [Function disabled],
      [Function attached],
    ]


Number of calls: 1

 ❯ src/assistant/AssistantLaunchController.test.ts:122:22
    120|   await writeAssistantEnabled(dir,false);release(installed);
    121|   await (controller as unknown as {queue:Promise<void>}).queue;
    122|   expect(create).not.toHaveBeenCalled();
       |                      ^
    123|  }finally {release?.(installed);await controller.stop();watch.mockRest…
    124| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  09:50:59
   Duration  1.09s (transform 70%, import 22%, tests 7%)


```

## 旧Controller復元・rebuildの負例（無効でもManaged moduleを評価）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-lazy-assistant-host

 ❯ |@sodashitsu/cli| src/entryLoading.test.ts (8 tests | 1 failed | 7 skipped) 80ms
   × disabled server launch controller does not evaluate the native GUI host 78ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/entryLoading.test.ts > disabled server launch controller does not evaluate the native GUI host
AssertionError: 
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^
Error: generated unavailable feature module
    at load (file:///tmp/soda-entry-load-MYeT9Q/loader.mjs:2:144)
    at nextLoad (node:internal/modules/esm/hooks:785:28)
    at AsyncLoaderHooksOnLoaderHookWorker.load (node:internal/modules/esm/hooks:410:26)
    at MessagePort.handleMessage (node:internal/modules/esm/worker:251:24)
    at [nodejs.internal.kHybridDispatch] (node:internal/event_target:843:20)
    at MessagePort.<anonymous> (node:internal/per_context/messageport:23:28)

Node.js v24.15.0
: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ load ../../../../tmp/soda-entry-load-MYeT9Q/loader.mjs:2:144
 ❯ execute src/entryLoading.test.ts:19:77
     17|  try {
     18|   const code=await new Promise<number|null>((resolve,reject)=>{child.o…
     19|   expect(timeout,"entry did not terminate").toBe(false);expect(code,er…
       |                                                                             ^
     20|   return {output,errors,modules:(await readFile(log,"utf8")).trim().sp…
     21|  }finally {clearTimeout(timer);child.kill();await rm(directory,{recurs…
 ❯ src/entryLoading.test.ts:57:16

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  09:51:19
   Duration  215ms (tests 63%, transform 24%, import 10%, worker 3%)


```

両負例とも対象sourceをbyte一致で復元、distを用いる負例は元/復元後ともrebuild済み。

## 全体試験の失敗箇所（生出力）

```text
 |@sodashitsu/tui| src/app/TuiApp.subagents.test.ts > 端末版のサブエージェントの表示 > 一覧を開いている間は、経過時間が進む（10 秒ごとに描き直す）。閉じたら描き直さない
AssertionError: expected ' 端末 グラフ 状況 他 ▾   │ t1   ＋            …' to match /T\s+17秒/

- Expected:
/T\s+17秒/

+ Received:
" 端末 グラフ 状況 他 ▾   │ t1   ＋                                   [ ＋作業ビュー ] session: work
 ▾ Spaces     開いた順   │┌─ pane p1 ───────[⋮][+][│][─][□][×]┐┌─ pane p2 ───────[⋮][+][│][─][□][×]┐
     w1                  ││                                   ││                                   │
   ◐ w2                  ││                                   ││                                   │
                         ││                                   ││                                   │
─ ▾ Agents ───グループ順─││                                   ││                                   │
 ◐ w2 t2              ⤷1 ││                                   ││                                   │
   Claude                ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
          ┌─ サブエージェント — worker ──────────────────────────────────────────────────┐         │
          │ T                                                                      16秒  │         │
          │                                                                              │         │
          │                                                                              │         │
          └──────────────────────────────────────────────────────────────────────────────┘         │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
                         ││                                   ││                                   │
 ＋新規 ⋯           🔔0  ││                                   ││                                   │
                       « │└───────────────────────────────────⋯└───────────────────────────────────⋯"

 ❯ src/app/TuiApp.subagents.test.ts:260:61
    258|       // 開いている間: 時間が進むと、キーを押さなくても描き直されて経過時間が進む。
    259|       await vi.advanceTimersByTimeAsync(12_000);
    260|       await vi.waitFor(async () => expect(await h.screen()).toMatch(/T…
       |                                                             ^
    261|       // 閉じたら、時間が進んでも描き直さない（余計な描画をしない）。
    262|       h.io.type("\x1b");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 904 passed (905)
      Tests  1 failed | 13137 passed (13138)
   Start at  09:51:50
   Duration  392.66s (tests 78%, import 12%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 240 times · 77.46s total, 28% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

関連45件成功ログ `/tmp/soda-lazy-host-final-focused.log`、main baseline14件成功 `/tmp/soda-lazy-host-main-baseline.log`。全体再実行はせず当該失敗を両treeで確認した。
