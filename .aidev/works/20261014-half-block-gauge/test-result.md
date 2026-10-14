# 検証

- pnpm build / pnpm typecheck: 通過。
- 関連8ファイル20テスト: 通過。割合の境界・隠したグラフ・旧設定・フッターCPU/メモリ/RSS・TUI設定候補プレビューを確認。
- Chromium: statusline設定・フッター設定の2 E2E通過。Web/mobileの設定選択・5記号プレビュー・ライブ表示・保存・共有。
- 作業フォルダ外からのsmoke: PASS。
- 負の対照: patternカタログは保ち、formatterだけ10個の旧処理へ戻してprotocolテスト。半段階の2テストが失敗し、バイト一致で復元した後13テスト通過。

## half-block-related.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer


 Test Files  8 passed (8)
      Tests  20 passed (20)
   Start at  21:13:13
   Duration  3.81s (transform 77%, import 17%, environment 3%, tests 3%)

  Transform  |@sodashitsu/tui| transforming modules took 10.16s · 80% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## half-block-e2e2.log

```text

Running 2 tests using 1 worker

(node:404827) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-14T12:14:14.263Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-14T12:14:14.263Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-vyIYML/commands.json","count":0}
  ✓  1 src/specs/statusline.spec.ts:326:1 › native statusline settings, order, row bounds and mobile layout persist (5.5s)
{"ts":"2026-10-14T12:14:19.631Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-14T12:14:19.632Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-aXzwNz/commands.json","count":0}
  ✓  2 src/specs/system-footer.spec.ts:3:1 › system footer settings persist, share across clients, and reserve desktop/mobile space (6.5s)

  2 passed (13.5s)

```

## half-block-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer

 ❯ |@sodashitsu/protocol| src/statusline.test.ts (7 tests | 1 failed) 23ms
   × renders five half-step blocks with ten-percent resolution 12ms
 ❯ |@sodashitsu/protocol| src/systemFooter.test.ts (6 tests | 1 failed) 28ms
   × shares the five-character half-step gauge for all footer percentages 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/statusline.test.ts > renders five half-step blocks with ten-percent resolution
AssertionError: expected '░░░░░░░░░░ 0%' to be '░░░░░ 0%' // Object.is equality

Expected: "░░░░░ 0%"
Received: "░░░░░░░░░░ 0%"

 ❯ src/statusline.test.ts:114:20
    112|   for (const [percent, bar] of examples) {
    113|     const result = statuslineGauge(percent, settings.graphs.context);
    114|     expect(result).toBe(`${bar} ${percent}%`);
       |                    ^
    115|     expect([...result.split(" ")[0]!]).toHaveLength(5);
    116|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/protocol| src/systemFooter.test.ts > shares the five-character half-step gauge for all footer percentages
AssertionError: expected [ 'CPU █████░░░░░ 50% (4核)', …(2) ] to deeply equal [ 'CPU ██▒░░ 50% (4核)', …(2) ]

- Expected
+ Received

  [
-   "CPU ██▒░░ 50% (4核)",
-   "メモリ 512MiB/1.0GiB ██▒░░ 50%",
-   "Soda 256MiB █▒░░░ 25%",
+   "CPU █████░░░░░ 50% (4核)",
+   "メモリ 512MiB/1.0GiB █████░░░░░ 50%",
+   "Soda 256MiB ███░░░░░░░ 25%",
  ]

 ❯ src/systemFooter.test.ts:116:90
    114|     serverRssBytes: 256 * 1024 ** 2,
    115|   } as SystemResources;
    116|   expect(systemFooterSegments(data, ["cpu", "memory", "serverMemory"],…
       |                                                                                          ^
    117|     "CPU ██▒░░ 50% (4核)",
    118|     "メモリ 512MiB/1.0GiB ██▒░░ 50%",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 11 passed (13)
   Start at  21:13:43
   Duration  293ms (transform 59%, tests 21%, import 16%, worker 4%)


```

## half-block-restored.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer


 Test Files  2 passed (2)
      Tests  13 passed (13)
   Start at  21:13:44
   Duration  554ms (transform 86%, import 8%, tests 4%, worker 2%)


```

