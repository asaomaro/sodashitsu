# 検証結果

Windows 11・Electron 45.1.0。プライベートな一時userDataへ設定とキャラクター素材だけを複製し、認証情報・端末・会話は複製しない。立ち絵→会話→設定ボタン1クリックの順で3回、毎回設定を閉じて作り直した。

画面拡大率のため最初のCopyFromScreenは座標不一致だったので証拠から除外。撮影スレッドをPer Monitor V2 DPI対応にし、GetClientRect/ClientToScreenによる設定クライアント領域の実画面を撮影し直した。画像は目視でも設定フォームを確認。旧版も同条件で3回正常表示で、今回の利用者報告の再現・完全解消は断定しない。

## Native baseline（DPI補正後）

```json
{
  "variant": "baseline",
  "cycles": [
    {
      "colors": 2448,
      "textLength": 2666
    },
    {
      "colors": 2448,
      "textLength": 2666
    },
    {
      "colors": 2448,
      "textLength": 2666
    }
  ]
}
```

## Native updated（DPI補正後）

```json
{
  "variant": "updated",
  "cycles": [
    {
      "colors": 2449,
      "textLength": 2666
    },
    {
      "colors": 2449,
      "textLength": 2666
    },
    {
      "colors": 2449,
      "textLength": 2666
    }
  ]
}
```

## soda-settings-visible-unit.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  30 passed (30)
      Tests  223 passed (223)
   Start at  23:42:41
   Duration  3.00s (transform 54%, tests 29%, import 17%, worker 1%)

  Transform  |@sodashitsu/desktop-assistant| transforming modules took 13.53s · 54% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## soda-settings-visible-build.log

```text

> @sodashitsu/desktop-assistant@0.1.0 build:host /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> tsc -b && node scripts/build-host.mjs

assistant_internal_resources_built_no_execution

```

## soda-settings-visible-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (41 tests | 1 failed | 40 skipped) 975ms
   × loads settings in a visible native window and activates the loaded content without another click 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > loads settings in a visible native window and activates the loaded content without another click
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/main.test.ts:1488:32
    1486|  await new Promise(resolve=>setImmediate(resolve));
    1487|  expect(settings.url).toBe("soda-assistant://app/settings.html");
    1488|  expect(settings.options.show).toBe(true);expect(settings.options.back…
       |                                ^
    1489|  expect(settings.show).not.toHaveBeenCalled();
    1490|  finish();await vi.waitFor(()=>expect(settings.show).toHaveBeenCalledO…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 40 skipped (41)
   Start at  23:45:59
   Duration  1.20s (tests 88%, transform 10%, import 2%)


```

逆検証はshow:falseへ戻すと表示ライフサイクルの仕様テストが失敗することを確認したもので、元のGPU/描画不具合を再現するテストではない。元ファイルとバイト単位一致で復元。
