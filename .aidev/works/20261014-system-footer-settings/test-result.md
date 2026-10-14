# 検証

- `pnpm build`: 通過。
- `pnpm typecheck`: 通過。
- 作業フォルダ外からのsmoke: PASS。
- 関連81ファイル882テスト: 通過。TUI全体、SettingsDialog、SystemFooter、protocol formatter/counts、server resources/server methods。
- Chromium: Web設定からの有効化、フッター左端からの専用設定、CPUの非表示、エージェント数・ASCIIグラフ、2ブラウザ共有・再読込、モバイル予約画面、空項目からの再設定を確認。
- 既存のdesktop layout stability / short login scroll: 2件通過。
- 初回の拡充E2Eは checked 要素の nth locator が uncheck で変動してタイムアウト。固定の全input locatorへ直し、再実行で確認。製品コードの失敗ではない。
- 空項目時の入口保持: Web/TUIの表示条件だけを fields.length > 0 に戻して負の対照を実行。両テストが失敗。元のバイト列に戻した後3テスト通過。
- 全体テストは前PRでmain既存のagentInput 1000ms期待/300ms実装の不一致が判明しているため、変更関連の範囲を実行。既存不一致には手を入れていない。

## 負の対照の生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer

stderr | src/components/SystemFooter.test.ts > keeps the left settings button when every field is hidden
[Vue warn]: injection "Symbol(connection)" not found. 
  at <SystemFooter ref="VTU_COMPONENT" > 
  at <VTUROOT>

 ❯ |@sodashitsu/web| src/components/SystemFooter.test.ts (2 tests | 1 failed) 102ms
   × keeps the left settings button when every field is hidden 27ms
 ❯ |@sodashitsu/tui| src/app/TuiApp.systemFooter.test.ts (1 test | 1 failed) 257ms
   × reserves one bottom row across screens and releases it when disabled 254ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/SystemFooter.test.ts > keeps the left settings button when every field is hidden
Error: Unable to get button[aria-label="フッターの設定"] within: <!--v-if-->
 ❯ VueWrapper.get ../../../sodashitsu/node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/components/SystemFooter.test.ts:53:19
     51|   const wrapper = mount(SystemFooter, { global: { plugins: [pinia] } }…
     52|   try {
     53|     await wrapper.get('button[aria-label="フッターの設定"]').trigger("click");
       |                   ^
     54|     expect(useViewStore().dialogContext?.kind).toBe("systemFooterSetti…
     55|     expect(wrapper.find("footer").exists()).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.systemFooter.test.ts > reserves one bottom row across screens and releases it when disabled
AssertionError: expected '' to contain '⋮'

- Expected
+ Received

- ⋮

 ❯ src/app/TuiApp.systemFooter.test.ts:36:48
     34|     h.app.prefs.apply({ systemFooterSettings: { enabled: true, fields:…
     35|     h.app.renderNow();
     36|     expect((await h.screen()).split("\n")[29]).toContain("⋮");
       |                                                ^
     37|     for (const screen of ["base", "graph", "dashboard", "schedule"] as…
     38|       h.app.ui.setScreen(screen);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 1 passed (3)
   Start at  20:54:57
   Duration  5.05s (transform 73%, import 17%, environment 6%, tests 4%)

  Transform  |@sodashitsu/web| transforming modules took 2.32s · 66% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

  Transform  |@sodashitsu/tui| transforming modules took 3.71s · 77% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## 復元後の生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer


 Test Files  2 passed (2)
      Tests  3 passed (3)
   Start at  20:55:04
   Duration  5.64s (transform 76%, import 15%, environment 6%, tests 4%)

  Transform  |@sodashitsu/web| transforming modules took 2.86s · 70% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

  Transform  |@sodashitsu/tui| transforming modules took 4.30s · 80% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## Chromium最終確認

```text

> @sodashitsu/e2e@0.1.0 test /workspaces/sodashitsu-system-footer/packages/e2e
> playwright test system-footer.spec.ts


Running 1 test using 1 worker

(node:364810) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-14T11:55:46.764Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-14T11:55:46.766Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-dGDjbh/commands.json","count":0}
  ✓  1 src/specs/system-footer.spec.ts:3:1 › system footer settings persist, share across clients, and reserve desktop/mobile space (13.0s)

  1 passed (16.5s)

```
