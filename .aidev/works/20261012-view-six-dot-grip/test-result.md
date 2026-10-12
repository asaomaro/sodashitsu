# 検証

対象5ファイル67テスト成功。全体build/typecheck成功。名前表示中/非表示とも6点表示、上下帯の移動、名前/内容先頭行からのリサイズ、Esc復元、1行まで縮小、操作ボタンの反応を確認。旧ソース3ファイルへ戻して回帰5件失敗を確認し、復元後cmp一致。

## 負の対照 生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/components/DisplayParts.test.ts (15 tests | 1 failed) 153ms
   × hides view function names without removing drag grips or action buttons 16ms
 ❯ |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts (11 tests | 4 failed) 3469ms
   × bottom band grows from its upper boundary and Escape restores its height 59ms
   × band-bottom headers fold, move and close even when sharing a resize boundary 1062ms
   × band-top headers fold, move and close even when sharing a resize boundary 1058ms
   × renders band content on the first row and hides its name through shared settings 111ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/DisplayParts.test.ts > hides view function names without removing drag grips or action buttons
Error: Unable to get [data-view-drag-icon] within: <div data-v-8b499f0c="" class="display-head pane-panel-head" data-display-chrome="" data-display-head="">
  <div data-v-8b499f0c="" class="display-head-grip" data-display-grip="" aria-label="ビューを移動（pane のプログラムの表示（隔離）· PanelFunction）" title="ドラッグして移動（pane のプログラムの表示（隔離）· PanelFunction）" data-display-keepfocus="" data-pane-panel-label="">
    <!--v-if-->
    <!--v-if--><span data-v-8b499f0c="" class="display-head-label">pane のプログラムの表示（隔離）· PanelFunction</span>
  </div>
  <div data-v-8b499f0c="" class="display-head-actions">
    <!--v-if-->
    <!--v-if--><button data-v-8b499f0c="" type="button" class="display-head-btn" aria-label="この表示のメニュー" title="メニュー" aria-haspopup="menu" data-display-menu-button="" data-display-keepfocus=""> ⋮ </button><button data-v-8b499f0c="" type="button" class="display-head-btn" aria-label="パネルをたたむ" title="たたむ" data-pane-panel-fold="" data-display-keepfocus=""> ▸ </button><button data-v-8b499f0c="" type="button" class="display-head-btn" aria-label="この表示を閉じる" title="この表示を閉じる" data-pane-panel-close="" data-display-keepfocus=""> × </button>
  </div>
</div>
 ❯ VueWrapper.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/components/DisplayParts.test.ts:370:16
    368|   const panel = mountWith(DisplayPanelHead, { info: info("PanelFunctio…
    369|   expect(panel.find(".display-head-label").text()).toContain("PanelFun…
    370|   expect(panel.get("[data-view-drag-icon]").findAll("circle")).toHaveL…
       |                ^
    371|   settings.setViewTitleVisible(false);
    372|   await nextTick();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > bottom band grows from its upper boundary and Escape restores its height
AssertionError: expected 7 to be greater than 7
 ❯ src/app/TuiApp.dockedViews.test.ts:348:19
    346|   m("down", before.y);
    347|   m("move", before.y - 3);
    348|   expect(box().h).toBeGreaterThan(before.h);
       |                   ^
    349|   m("up", before.y - 3);
    350|   expect(box().h).toBeGreaterThan(before.h);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > band-bottom headers fold, move and close even when sharing a resize boundary
AssertionError: expected ' 端末 グラフ 状況 予約   │ t1   +             …' to contain '⠿'

- Expected
+ Received

- ⠿
+  端末 グラフ 状況 予約   │ t1   +                                                              [ビュー＋] session: work
+  ▾ Spaces     開いた順   │┌─ pane p1 ────────────────────────────────────────────────────────────────[⋮][+][│][─][□][×]┐
+      w1                  ││                                                                                            │
+      w2                  ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          │└────────────────────────────────────────────────────────────────────────────────────────────⋯
+                          │↕ ▍                                                                                [⋮] [-] [×]
+  ＋新規 ⋯           🔔0  │    ビューを待っています…
+                        « │

 ❯ src/app/TuiApp.dockedViews.test.ts:459:59
    457|     await vi.waitFor(() => expect(layout().panes.some((p) => p.paneId …
    458|     h.ws.event("prefs.changed", { prefs: { viewTitleVisible: false }, …
    459|     await vi.waitFor(async () => expect(await h.screen()).toContain("⠿…
       |                                                           ^
    460|     const header = { ...box() },
    461|       area = layout().paneArea,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > band-top headers fold, move and close even when sharing a resize boundary
AssertionError: expected ' 端末 グラフ 状況 予約   │ t1   +             …' to contain '⠿'

- Expected
+ Received

- ⠿
+  端末 グラフ 状況 予約   │ t1   +                                                              [ビュー＋] session: work
+  ▾ Spaces     開いた順   │↕ ▍                                                                                [⋮] [-] [×]
+      w1                  │    ビューを待っています…
+      w2                  │
+                          │┌─ pane p1 ────────────────────────────────────────────────────────────────[⋮][+][│][─][□][×]┐
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+  ＋新規 ⋯           🔔0  ││                                                                                            │
+                        « │└────────────────────────────────────────────────────────────────────────────────────────────⋯

 ❯ src/app/TuiApp.dockedViews.test.ts:459:59
    457|     await vi.waitFor(() => expect(layout().panes.some((p) => p.paneId …
    458|     h.ws.event("prefs.changed", { prefs: { viewTitleVisible: false }, …
    459|     await vi.waitFor(async () => expect(await h.screen()).toContain("⠿…
       |                                                           ^
    460|     const header = { ...box() },
    461|       area = layout().paneArea,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > renders band content on the first row and hides its name through shared settings
AssertionError: expected '                         │↕ Statuslin…' to contain '⠿'

Expected: "⠿"
Received: "                         │↕ Statusline FIRSTROW                                                              [⋮] [-] [×]"

 ❯ src/app/TuiApp.dockedViews.test.ts:542:23
    540|   await vi.waitFor(async () => expect(await row()).toContain("FIRSTROW…
    541|   expect(await row()).toContain("Statusline");
    542|   expect(await row()).toContain("⠿");
       |                       ^
    543|   h.ws.event("prefs.changed", { prefs: { viewTitleVisible: false }, re…
    544|   await vi.waitFor(async () => expect(await row()).not.toContain("Stat…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  2 failed (2)
      Tests  5 failed | 21 passed (26)
   Start at  17:50:03
   Duration  5.66s (tests 48%, transform 44%, import 7%, environment 2%)


```

ブラウザE2E8件成功。SVG6丸の常時表示、非表示中のgrip移動、既存bandの操作をDOMで確認。/tmp/view-floating-centered.pngを目視して6点アイコンを確認。git diff --check成功。
