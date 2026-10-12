# 検証

対象5ファイル84件成功。全体build/typecheck成功、ブラウザE2E8件成功。右パネルの実際の罫線（d.x-1）でSGR入力を流してlive resizeとEsc復元を確認。TUIは日本語タイトル、普通のheader moveではdropしない、grip drop、背景消費、辺/cornerの反対辺固定、未保存保護、Esc closeを検証。WebはDOMでアイコン高さとボタン文字サイズ、背景click後の表示維持、Escで実際に消えることを確認。旧3ファイルへ戻し回帰6件失敗を確認して復元cmp一致。レビュー指摘の右上cornerと余白も負の対照を実施。

## window-controls-negative 生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/WindowOverlay.test.ts (8 tests | 4 failed) 47ms
   × float grip changes placement, ordinary header only moves, backdrop is consumed, and Esc closes 14ms
   × side and bottom edges resize independently and keep the opposite edge fixed 5ms
   × backdrop stays open and Esc honors unsaved content protection 3ms
   × the visible top corner resizes height while ordinary header remains a move handle 3ms
 ❯ |@sodashitsu/web| src/components/DisplayFloat.test.ts (21 tests | 1 failed) 530ms
   × Escape closes a floating view from its content and header 17ms
 ❯ |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts (12 tests | 1 failed) 1886ms
   × right view visible borders resize live and Escape restores them 66ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/DisplayFloat.test.ts > Escape closes a floating view from its content and header
AssertionError: expected "vi.fn()" to be called with arguments: [ { id: 'a' } ]

Number of calls: 0

 ❯ src/components/DisplayFloat.test.ts:388:30
    386|   const { w, controller } = setup();
    387|   await w.get("[data-display-float]").trigger("keydown", { key: "Escap…
    388|   expect(controller.dismiss).toHaveBeenCalledWith({ id: "a" });
       |                              ^
    389|   controller.dismiss.mockClear();
    390|   await w.get("[data-display-head]").trigger("keydown", { key: "Escape…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/6]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > right view visible borders resize live and Escape restores them
AssertionError: expected 33 to be greater than 33
 ❯ src/app/TuiApp.dockedViews.test.ts:404:76
    402|     h.io.type(`\x1b[<0;${x + 1};${divider.y + 3}M`);
    403|     h.io.type(`\x1b[<32;${x + dx + 1};${divider.y + 3}M`);
    404|     expect(layout().panes.find((p) => p.paneId === "view:files")!.fram…
       |                                                                            ^
    405|       oldWidth,
    406|     );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/6]⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > float grip changes placement, ordinary header only moves, backdrop is consumed, and Esc closes
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/modes/WindowOverlay.test.ts:129:70
    127|   };
    128|   expect(render().rowText(11)).toContain("日本語ビュー");
    129|   expect(win.handleMouse({ action: "down", button: 0, x: 0, y: 0 })).t…
       |                                                                      ^
    130|   expect(inner.handleMouse).not.toHaveBeenCalled();
    131|   win.handleMouse({ action: "down", button: 0, x: 35, y: 11 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/6]⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > side and bottom edges resize independently and keep the opposite edge fixed
AssertionError: expected ' ' to be '┌' // Object.is equality

Expected: "┌"
Received: " "

 ❯ src/modes/WindowOverlay.test.ts:155:32
    153|   f.win.handleMouse({ action: "up", button: 0, x: 16, y: 19 });
    154|   const grid = f.render();
    155|   expect(grid.rowText(11)[16]).toBe("┌");
       |                                ^
    156|   expect(grid.rowText(11)[78]).toBe("┐");
    157|   expect(grid.rowText(28)[78]).toBe("┘");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/6]⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > backdrop stays open and Esc honors unsaved content protection
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/modes/WindowOverlay.test.ts:176:70
    174|   const win = new WindowOverlay(inner, { w: 60, h: 20 }, controls);
    175|   win.render({ grid: new Grid(100, 40), theme: new ThemeColors("dracul…
    176|   expect(win.handleMouse({ action: "down", button: 0, x: 0, y: 0 })).t…
       |                                                                      ^
    177|   expect(inner.handleMouse).not.toHaveBeenCalled();
    178|   win.handleKey(chordToKeyInput("Escape")!);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/6]⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > the visible top corner resizes height while ordinary header remains a move handle
AssertionError: expected ' ' to be '┘' // Object.is equality

Expected: "┘"
Received: " "

 ❯ src/modes/WindowOverlay.test.ts:192:32
    190|   const grid = f.render();
    191|   expect(grid.rowText(8)[18]).toBe("┌");
    192|   expect(grid.rowText(28)[78]).toBe("┘");
       |                                ^
    193| });
    194|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯


 Test Files  3 failed (3)
      Tests  6 failed | 35 passed (41)
   Start at  18:09:33
   Duration  6.54s (transform 66%, tests 19%, import 11%, environment 4%)

  Transform  |@sodashitsu/web| transforming modules took 3.32s · 69% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

  Transform  |@sodashitsu/tui| transforming modules took 5.47s · 65% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## window-corner-negative 生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/WindowOverlay.test.ts (9 tests | 1 failed) 44ms
   × a registered float's right upper corner resizes without hitting Close 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > a registered float's right upper corner resizes without hitting Close
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/modes/WindowOverlay.test.ts:203:29
    201|  win.handleMouse({action:"move",button:32,x:83,y:8});
    202|  win.handleMouse({action:"up",button:0,x:83,y:8});
    203|  expect(controls.close).not.toHaveBeenCalled();
       |                             ^
    204|  const grid=render();expect(grid.rowText(8)[83]).toBe("┐");expect(grid…
    205| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
   Start at  18:10:18
   Duration  1.98s (transform 78%, import 19%, tests 3%)


```

## window-margin-negative 生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/WindowOverlay.test.ts (9 tests | 1 failed) 47ms
   × backdrop stays open and Esc honors unsaved content protection 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > backdrop stays open and Esc honors unsaved content protection
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/modes/WindowOverlay.test.ts:178:63
    176|   expect(win.handleMouse({ action: "down", button: 0, x: 0, y: 0 })).t…
    177|   expect(inner.handleMouse).not.toHaveBeenCalled();
    178|   expect(win.handleMouse({action:"down",button:0,x:20,y:10})).toBe(tru…
       |                                                               ^
    179|   win.handleKey(chordToKeyInput("Escape")!);
    180|   expect(controls.close).not.toHaveBeenCalled();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
   Start at  18:14:11
   Duration  1.76s (transform 79%, import 18%, tests 3%)


```

最終TUI関連47件成功。最新TUI build成功。Webの縮小アイコンを /tmp/view-floating-centered.png で目視確認。git diff --check成功。
