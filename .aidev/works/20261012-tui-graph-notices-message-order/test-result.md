# 回帰検証

関連6ファイル47テスト、配線3ファイル30テスト成功。全体build/typecheck成功。修正前の4ファイルへ差し戻し、回帰テスト4件が失敗、復元後バイト一致。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/render/Renderer.test.ts (18 tests | 1 failed | 17 skipped) 27ms
   ❯ Renderer（pane の中身と最小限の chrome。AC2・AC6・AC10） (10)
     × stacks recent snackbar notifications at the top right in chronological order and restores covered content 26ms
 ❯ |@sodashitsu/tui| src/notify/notify.test.ts (16 tests | 2 failed | 14 skipped) 15ms
   ❯ NotificationController（web と同じ判定） (10)
     × keeps event snackbars until clicked or resolved, without expiring or evicting them for transient messages 8ms
     × keeps an unresolved snackbar when an unrelated shared notice is resolved 5ms
 ❯ |@sodashitsu/tui| src/modes/GraphView.test.ts (6 tests | 1 failed | 5 skipped) 1011ms
   × shows clickable workspace tab tags, highlights matching panes and offers graph actions 1010ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/render/Renderer.test.ts > Renderer（pane の中身と最小限の chrome。AC2・AC6・AC10） > stacks recent snackbar notifications at the top right in chronological order and restores covered content
AssertionError: expected [ Array(18) ] to have a length of 6 but got 18

- Expected
+ Received

- 6
+ 18

 ❯ src/render/Renderer.test.ts:104:30
    102|     );
    103|     const count = Math.floor((H - 1) / 3);
    104|     expect(result.toastHits).toHaveLength(count);
       |                              ^
    105|     expect(result.toastHits[0]).toMatchObject({ id: 24 - count, y: 1, …
    106|     expect(result.toastHits.at(-1)).toMatchObject({ id: 23, y: 1 + (co…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/tui| src/notify/notify.test.ts > NotificationController（web と同じ判定） > keeps event snackbars until clicked or resolved, without expiring or evicting them for transient messages
AssertionError: expected [ { fn: [Function], ms: 5000 } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/notify/notify.test.ts:127:24
    125|     s.timers[0]!.fn();
    126|     const id = s.ui.toasts[0]!.id;
    127|     expect(s.uiTimers).toHaveLength(0);
       |                        ^
    128|     for (let i = 0; i < 5; i++) s.ui.toast("message " + i);
    129|     for (const t of s.uiTimers) t.fn();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/tui| src/notify/notify.test.ts > NotificationController（web と同じ判定） > keeps an unresolved snackbar when an unrelated shared notice is resolved
AssertionError: expected [] to deeply equal [ 1 ]

- Expected
+ Received

- [
-   1,
- ]
+ []

 ❯ src/notify/notify.test.ts:226:38
    224|     const key=s.n.queued[0]!.key,id=s.ui.toasts[0]!.id;
    225|     s.n.onSharedNotification({notices:[{key,paneId:'p3',status:'deferr…
    226|     expect(s.ui.toasts.map(t=>t.id)).toEqual([id]);
       |                                      ^
    227|     s.n.onSharedNotification({notices:[{key,paneId:'p3',status:'resolv…
    228|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  |@sodashitsu/tui| src/modes/GraphView.test.ts > shows clickable workspace tab tags, highlights matching panes and offers graph actions
AssertionError: expected ' │                                   …' to contain '[Build] [Review]'

Expected: "[Build] [Review]"
Received: " │                                                      │                                           "

 ❯ src/modes/GraphView.test.ts:31:54
     29|   view.sync(true);
     30|   try{
     31|     await vi.waitFor(()=>expect(render().rowText(3)).toContain('[Build…
       |                                                      ^
     32|     view.handleMouse({action:'down',button:0,x:4,y:3});
     33|     let grid=render();expect(grid.cell(2,4)?.fg).toBe(theme.ui('--soda…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  3 failed (3)
      Tests  4 failed | 36 skipped (40)
   Start at  20:27:45
   Duration  1.97s (transform 61%, tests 25%, import 14%)

  Transform  |@sodashitsu/tui| transforming modules took 2.61s · 61% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
