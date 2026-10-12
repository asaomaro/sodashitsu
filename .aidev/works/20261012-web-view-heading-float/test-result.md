# 検証

見出し対象43件成功。float関連108件成功。レビュー指摘の修正後90件成功。修正前への復元とcmp一致、意味上旧動作の対照を実施。以下は失敗の生出力。

## view-title-negative

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/display/displayLabel.test.ts (8 tests | 1 failed) 7ms
   × uses a standard view's function title instead of its internal display id 3ms
 ❯ |@sodashitsu/web| src/components/WorkspaceView.test.ts (2 tests | 1 failed) 54ms
   × standalone file tree has no duplicate title row and keeps refresh beside search 8ms
 ❯ |@sodashitsu/web| src/components/DisplayParts.test.ts (15 tests | 1 failed) 112ms
   × hides view function names without removing drag grips or action buttons 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/DisplayParts.test.ts > hides view function names without removing drag grips or action buttons
Error: Unable to get .display-head-drag-mark within: <div data-v-8b499f0c="" class="display-head pane-panel-head" data-display-chrome="" data-display-head="">
  <div data-v-8b499f0c="" class="display-head-grip" data-display-grip="" data-display-keepfocus="" data-pane-panel-label="">
    <!--v-if-->
    <!--v-if-->
  </div>
  <div data-v-8b499f0c="" class="display-head-actions">
    <!--v-if-->
    <!--v-if--><button data-v-8b499f0c="" type="button" class="display-head-btn" aria-label="この表示のメニュー" title="メニュー" aria-haspopup="menu" data-display-menu-button="" data-display-keepfocus=""> ⋮ </button><button data-v-8b499f0c="" type="button" class="display-head-btn" aria-label="パネルをたたむ" title="たたむ" data-pane-panel-fold="" data-display-keepfocus=""> ▸ </button><button data-v-8b499f0c="" type="button" class="display-head-btn" aria-label="この表示を閉じる" title="この表示を閉じる" data-pane-panel-close="" data-display-keepfocus=""> × </button>
  </div>
</div>
 ❯ VueWrapper.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/components/DisplayParts.test.ts:374:16
    372|   expect(panel.find(".display-head-label").exists()).toBe(false);
    373|   expect(panel.find("[data-display-grip]").exists()).toBe(true);
    374|   expect(panel.get(".display-head-drag-mark").text()).toBe("⠿");
       |                ^
    375|   expect(panel.get("[data-display-grip]").attributes("aria-label")).to…
    376|   expect(panel.find("[data-display-menu-button]").exists()).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/web| src/components/WorkspaceView.test.ts > standalone file tree has no duplicate title row and keeps refresh beside search
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/components/WorkspaceView.test.ts:43:37
     41|   });
     42|   await flushPromises();
     43|   expect(w.find("header").exists()).toBe(false);
       |                                     ^
     44|   expect(w.text()).not.toContain("ファイルツリー");
     45|   const refresh = w.get(".workspace-search button[type=button]");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/web| src/display/displayLabel.test.ts > uses a standard view's function title instead of its internal display id
TypeError: displayHeading is not a function
 ❯ src/display/displayLabel.test.ts:94:5
     92| it("uses a standard view's function title instead of its internal disp…
     93|   expect(
     94|     displayHeading({
       |     ^
     95|       name: "view-99f4d2ad",
     96|       title: "ファイルツリー",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  3 failed (3)
      Tests  3 failed | 22 passed (25)
   Start at  17:19:49
   Duration  1.88s (transform 67%, environment 15%, import 13%, tests 5%)

  Transform  |@sodashitsu/web| transforming modules took 2.49s · 67% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## view-heading-negative

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/display/displayLabel.test.ts (8 tests | 1 failed) 9ms
   × uses a standard view's function title instead of its internal display id 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/display/displayLabel.test.ts > uses a standard view's function title instead of its internal display id
AssertionError: expected '標準ビュー· view-99f4d2ad' to be 'ファイルツリー' // Object.is equality

Expected: "ファイルツリー"
Received: "標準ビュー· view-99f4d2ad"

 ❯ src/display/displayLabel.test.ts:99:5
     97|       source: { type: "builtin", id: "workspace", scope: "user" },
     98|     }),
     99|   ).toBe("ファイルツリー");
       |     ^
    100|   expect(
    101|     displayHeading({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
   Start at  17:20:37
   Duration  551ms (transform 51%, environment 31%, import 16%, tests 2%, worker 1%)


```

## view-title-drag-negative-e2e

```text

Running 7 tests using 1 worker

(node:268317) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T08:21:37.263Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T08:21:37.265Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-5jjqat/commands.json","count":0}
{"ts":"2026-10-12T08:21:38.031Z","level":"info","msg":"display set","paneId":"f00faee0-a82c-46e8-93eb-421394344463","name":"view-054e711141594c258cc3cf0b4be","kind":"band","format":"html","bytes":1023,"rev":1}
{"ts":"2026-10-12T08:21:38.086Z","level":"info","msg":"display set","paneId":"f00faee0-a82c-46e8-93eb-421394344463","name":"view-054e711141594c258cc3cf0b4be","kind":"band","format":"html","bytes":1023,"rev":2}
{"ts":"2026-10-12T08:21:38.975Z","level":"info","msg":"display set","paneId":"f00faee0-a82c-46e8-93eb-421394344463","name":"view-054e711141594c258cc3cf0b4be","kind":"band","format":"html","bytes":1022,"rev":3}
{"ts":"2026-10-12T08:21:39.217Z","level":"info","msg":"display closed","paneId":"f00faee0-a82c-46e8-93eb-421394344463","name":"view-054e711141594c258cc3cf0b4be","reason":"dismissed"}
  ✓  1 src/specs/statusline.spec.ts:5:1 › statusline follows pane focus and closing it removes the saved view (2.2s)
{"ts":"2026-10-12T08:21:39.353Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T08:21:39.354Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-CZAJYw/commands.json","count":0}
{"ts":"2026-10-12T08:21:39.759Z","level":"info","msg":"display set","paneId":"6dfe41e2-4b07-4b00-8d0e-9bab3a684df8","name":"view-77596e0ecc4246aba9e3a335576","kind":"band","format":"html","bytes":1025,"rev":1}
{"ts":"2026-10-12T08:21:39.870Z","level":"info","msg":"display set","paneId":"6dfe41e2-4b07-4b00-8d0e-9bab3a684df8","name":"view-77596e0ecc4246aba9e3a335576","kind":"band","format":"html","bytes":1067,"rev":2}
  ✓  2 src/specs/statusline.spec.ts:38:1 › band heights resize at the inner boundary and persist after reload (2.0s)
{"ts":"2026-10-12T08:21:41.365Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T08:21:41.366Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-3VGXQf/commands.json","count":0}
{"ts":"2026-10-12T08:21:41.764Z","level":"info","msg":"display set","paneId":"696e13f3-9dee-495f-9628-b26b84fa44ab","name":"view-2613539729394292875ddbc48cd","kind":"band","format":"html","bytes":1025,"rev":1}
{"ts":"2026-10-12T08:21:41.865Z","level":"info","msg":"display set","paneId":"696e13f3-9dee-495f-9628-b26b84fa44ab","name":"view-2613539729394292875ddbc48cd","kind":"band","format":"html","bytes":1067,"rev":2}
{"ts":"2026-10-12T08:21:42.702Z","level":"info","msg":"display set","paneId":"696e13f3-9dee-495f-9628-b26b84fa44ab","name":"view-2613539729394292875ddbc48cd","kind":"panel","format":"html","bytes":1067,"rev":3}
  ✓  3 src/specs/statusline.spec.ts:73:1 › band grip moves a tab view into a visible floating window (1.5s)
{"ts":"2026-10-12T08:21:42.837Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T08:21:42.837Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-KKcsho/commands.json","count":0}
{"ts":"2026-10-12T08:21:43.238Z","level":"info","msg":"display set","paneId":"9d6d1528-405e-4a96-8431-8556ff57471f","name":"view-4a515d95e05441bf8ee76a3d119","kind":"band","format":"html","bytes":1025,"rev":1}
{"ts":"2026-10-12T08:21:43.336Z","level":"info","msg":"display set","paneId":"9d6d1528-405e-4a96-8431-8556ff57471f","name":"view-4a515d95e05441bf8ee76a3d119","kind":"band","format":"html","bytes":1067,"rev":2}
{"ts":"2026-10-12T08:21:44.529Z","level":"info","msg":"display closed","paneId":"9d6d1528-405e-4a96-8431-8556ff57471f","name":"view-4a515d95e05441bf8ee76a3d119","reason":"dismissed"}
  ✓  4 src/specs/statusline.spec.ts:100:1 › pane menu and band menu/fold/close buttons work and statusline segments have distinct colors (1.8s)
{"ts":"2026-10-12T08:21:44.702Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T08:21:44.703Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-StUwTt/commands.json","count":0}
  ✓  5 src/specs/statusline.spec.ts:140:1 › notification test displays a snackbar at the top right without changing agent state (1.1s)
{"ts":"2026-10-12T08:21:45.818Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T08:21:45.819Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-wX2pKN/commands.json","count":0}
{"ts":"2026-10-12T08:21:46.363Z","level":"info","msg":"display set","paneId":"648246ae-9c30-4016-aa8e-67ea0a2f990f","name":"view-b4fa7649f5c9454182ea5ba3e6e","kind":"panel","format":"html","bytes":444,"rev":1}
{"ts":"2026-10-12T08:21:46.367Z","level":"info","msg":"display set","paneId":"648246ae-9c30-4016-aa8e-67ea0a2f990f","name":"view-725463bd0dfc4275aa2536c4403","kind":"band","format":"html","bytes":1067,"rev":1}
  ✓  6 src/specs/statusline.spec.ts:162:1 › collapsed views use an independent tray beside an open band and title visibility is configurable (1.7s)
{"ts":"2026-10-12T08:21:47.482Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T08:21:47.483Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-flD6pE/commands.json","count":0}
{"ts":"2026-10-12T08:21:47.928Z","level":"info","msg":"display set","paneId":"c70d8b00-0b82-4d9c-b80c-a1714bd5a13b","name":"view-48292e2795f449d7a1f853f2fed","kind":"panel","format":"html","bytes":444,"rev":1}
  ✘  7 src/specs/statusline.spec.ts:206:1 › file view has one function title and remains draggable when titles are hidden (6.6s)


  1) src/specs/statusline.spec.ts:206:1 › file view has one function title and remains draggable when titles are hidden 

    Error: expect(locator).toBeVisible() failed

    Locator: locator('.display-float')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" locator('.display-float') with timeout 5000ms
      - waiting for locator('.display-float')


      243 |     await page.mouse.up();
      244 |     const floating = page.locator(".display-float");
    > 245 |     await expect(floating).toBeVisible();
          |                            ^
      246 |     await expect(floating.locator(".workspace-list")).toContainText("example.txt");
      247 |     await expect(floating.locator("[data-display-float-title]")).toHaveCount(0);
      248 |     await page.screenshot({ path: "/tmp/view-hidden-title-drag.png" });
        at /workspaces/sodashitsu/packages/e2e/src/specs/statusline.spec.ts:245:28

    Error Context: test-results/statusline-file-view-has-o-b595f-able-when-titles-are-hidden/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/statusline-file-view-has-o-b595f-able-when-titles-are-hidden/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/statusline-file-view-has-o-b595f-able-when-titles-are-hidden/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/statusline.spec.ts:206:1 › file view has one function title and remains draggable when titles are hidden 
  6 passed (18.4s)
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test statusline.spec.ts

```

## view-float-negative

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/display/floatGeometry.test.ts (26 tests | 2 failed) 92ms
   ❯ defaultFloatRect (5)
     × 幅と高さは領域の6割以上・最初の窓は中央 21ms
     × 幅は 240〜領域−16 に丸める 2ms
 ❯ |@sodashitsu/web| src/store/display.placements.test.ts (4 tests | 1 failed) 78ms
   × a registered floating view opens initially but respects a user's later fold 16ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/display/floatGeometry.test.ts > defaultFloatRect > 幅と高さは領域の6割以上・最初の窓は中央
AssertionError: expected { x: 472, y: 8, w: 320, h: 300 } to deeply equal { x: 160, y: 100, w: 480, h: 300 }

- Expected
+ Received

  {
    "h": 300,
-   "w": 480,
-   "x": 160,
-   "y": 100,
+   "w": 320,
+   "x": 472,
+   "y": 8,
  }

 ❯ src/display/floatGeometry.test.ts:126:44
    124| describe("defaultFloatRect", () => {
    125|   it("幅と高さは領域の6割以上・最初の窓は中央", () => {
    126|     expect(defaultFloatRect(0, 320, AREA)).toEqual({ x: 160, y: 100, w…
       |                                            ^
    127|   });
    128|   it("i 番目は 24px ずつ左下へずれる", () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/web| src/display/floatGeometry.test.ts > defaultFloatRect > 幅は 240〜領域−16 に丸める
AssertionError: expected 240 to be 480 // Object.is equality

- Expected
+ Received

- 480
+ 240

 ❯ src/display/floatGeometry.test.ts:135:46
    133|   });
    134|   it("幅は 240〜領域−16 に丸める", () => {
    135|     expect(defaultFloatRect(0, 100, AREA).w).toBe(480);
       |                                              ^
    136|     expect(defaultFloatRect(0, 800, AREA).w).toBe(800 - FLOAT_INSET_PX…
    137|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/web| src/store/display.placements.test.ts > a registered floating view opens initially but respects a user's later fold
AssertionError: expected { dock: 'float', edge: null, …(1) } to match object { dock: 'float', collapsed: false }
(1 matching property omitted from actual)

- Expected
+ Received

  {
-   "collapsed": false,
+   "collapsed": true,
    "dock": "float",
  }

 ❯ src/store/display.placements.test.ts:158:35
    156|   } as DisplayInfo;
    157|   store.upsert(info);
    158|   expect(store.effectiveOf(info)).toMatchObject({ dock: "float", colla…
       |                                   ^
    159|   store.setFaceCollapsed(info, true);
    160|   expect(store.effectiveOf(info).collapsed).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  2 failed (2)
      Tests  3 failed | 27 passed (30)
   Start at  17:26:43
   Duration  3.09s (transform 55%, environment 26%, import 14%, tests 5%)


```

## view-float-review-negative

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/display/paneDisplayLayout.test.ts (40 tests | 1 failed) 22ms
   ❯ resolvePaneDisplays — 浮いた窓（手順 6） (9)
     × 窓の面が 2 つあれば、出た順に floats へ 6ms
 ❯ |@sodashitsu/web| src/store/display.placements.test.ts (4 tests | 1 failed) 21ms
   × a registered floating view opens initially but respects a user's later fold 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/display/paneDisplayLayout.test.ts > resolvePaneDisplays — 浮いた窓（手順 6） > 窓の面が 2 つあれば、出た順に floats へ
AssertionError: expected { x: 199, y: 114, w: 595, h: 341 } to deeply equal { x: 175, y: 138, w: 595, h: 341 }

- Expected
+ Received

  {
    "h": 341,
    "w": 595,
-   "x": 175,
-   "y": 138,
+   "x": 199,
+   "y": 114,
  }

 ❯ src/display/paneDisplayLayout.test.ts:356:31
    354|     const r = resolvePaneDisplays(input({ panels: [win("a", 1), win("b…
    355|     expect(r.floats.map((f) => f.id)).toEqual(["a", "b"]);
    356|     expect(r.floats[1]!.rect).toEqual(defaultFloatRect(1, 400, r.float…
       |                               ^
    357|     expect(r.floats[0]!.rect.x).not.toBe(r.floats[1]!.rect.x);
    358|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/web| src/store/display.placements.test.ts > a registered floating view opens initially but respects a user's later fold
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/store/display.placements.test.ts:160:45
    158|   expect(store.effectiveOf(info)).toMatchObject({ dock: "float", colla…
    159|   store.setFaceRect(info, {x: 20,y: 30,w: 500,h: 400});
    160|   expect(store.effectiveOf(info).collapsed).toBe(false);
       |                                             ^
    161|   store.setFaceCollapsed(info, true);
    162|   expect(store.effectiveOf(info).collapsed).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 42 passed (44)
   Start at  17:27:55
   Duration  1.50s (transform 59%, environment 24%, import 14%, tests 2%, worker 1%)


```

## 最終検証

- 全体build/typecheck成功。
- Web全体3537件成功・2件失敗。初期矩形の旧expectを新しい仕様へ更新。グラフ1件は並行検証の負荷でタイムアウトしたため、両ファイルをmaxWorkers=4で再検証して103件すべて成功。全体テストは重複実行せず関連箇所の再確認に限定。
- statusline.spec.ts: E2E8件すべて成功。非表示gripの24px以上、移動先floatのハイライト、実際のフロート表示、機能名/重複行、初期中央/広さ、初回resize後もopen、fold状態のreload保持をDOMで確認。
- /tmp/view-hidden-title-drag.png と /tmp/view-floating-centered.png を目視確認。
- git diff --check成功。
