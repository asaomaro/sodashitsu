# 検証

アシスタント型検査、212テスト、ホストバンドル確認を通過。WindowsネイティブElectronで隔離した新規userDataを使用。設定と操舵室（ログイン画面）の各showイベント1回、DOMテキスト、画像の複数色、ICO非emptyを確認。

## soda-first-open-final-tests.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  29 passed (29)
      Tests  212 passed (212)
   Start at  20:49:42
   Duration  2.85s (transform 51%, tests 29%, import 19%, worker 1%)

  Transform  |@sodashitsu/desktop-assistant| transforming modules took 11.92s · 51% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## soda-first-open-bundle-test.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  20:49:46
   Duration  723ms (tests 94%, transform 4%, import 2%)


```

## soda-first-open-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (35 tests | 1 failed | 34 skipped) 1041ms
   × waits past an early ready-to-show for settings content and repaints on the first activation 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > waits past an early ready-to-show for settings content and repaints on the first activation
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/main.test.ts:1437:92
    1435|  app.emit("activate");const settings=fixture.windows.at(-1)!;
    1436|  await new Promise(resolve=>setImmediate(resolve));
    1437|  expect(settings.url).toBe("soda-assistant://app/settings.html");expec…
       |                                                                                            ^
    1438|  finish();await vi.waitFor(()=>expect(settings.show).toHaveBeenCalledO…
    1439|  expect(settings.focus).toHaveBeenCalledOnce();expect(settings.webCont…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 34 skipped (35)
   Start at  20:46:56
   Duration  1.28s (tests 88%, transform 10%, import 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (35 tests | 1 failed | 34 skipped) 1912ms
   × waits for the first Soda document, then activates and repaints without a second open 1020ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > waits for the first Soda document, then activates and repaints without a second open
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/main.test.ts:1428:51
    1426|  expect(panel.options.show).toBe(false);expect(panel.options.icon).toM…
    1427|  expect(panel.show).not.toHaveBeenCalled();
    1428|  finish();await vi.waitFor(()=>expect(panel.show).toHaveBeenCalledOnce…
       |                                                   ^
    1429|  expect(panel.focus).toHaveBeenCalledOnce();expect(panel.webContents.i…
    1430|  await fixture.handlers.get("assistant:save")!(event,{enabled:false});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 34 skipped (35)
   Start at  20:46:58
   Duration  2.12s (tests 94%, transform 5%, import 1%)


```

## result.json

```text
{
  "settings": {
    "shows": 1,
    "textLength": 1986,
    "colors": 1057
  },
  "panel": {
    "shows": 1,
    "textLength": 47,
    "colors": 594
  },
  "iconEmpty": false
}
```

## 実行環境

アシスタントをdisable→enableで再起動しphase=runningを確認。配布先app-7004046c9ed4e760bbdeed7061dd8d60b899da41ad96743bd4ce94ea01115c1dのICOとWindows描画設定を照合。操舵室本体／既存端末は停止していない。
