# 検証

- 関連unit 7ファイル40件成功。設定移行、上下リサイズ、折返し、日本語、縦スクロール、短い情報に対する上限、取消、無効時の領域復帰を確認。
- 全体build/typecheck成功。Web native E2Eで増加/縮小/保存/再読込/自然行数上限/端末1行保持/モバイルを確認。
- 全UIは266ファイル4,261件実行。4,260件成功、サブエージェント経過時間の既存テスト1件が17秒期待に対して16秒になり失敗。対象ファイルの単独再実行14件すべて成功（時間依存の試験）。製品の該当処理は変更していない。
- 最終typecheck成功。native E2Eは境界追加後も成功（7.0秒）。作業フォルダ外worktreeで今回ビルドのsmoke: PASS。
- 独立レビュー、境界修正・ゼロ高さ条件の再レビュー完了、残る指摘なし。

## 元の横幅実装に戻した場合の失敗

TUI製品ファイルのみHEADの実装へ戻してテストを実行。失敗後、修正実装をbyte-for-byteで復元した。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/app/PaneStatuslines.test.ts (2 tests | 2 failed) 11ms
   × reserves the requested bottom rows, previews vertical resizing, caps it to content and keeps a terminal row 8ms
   × wraps full-width text without losing glyphs and scrolls rows in both directions 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/PaneStatuslines.test.ts > reserves the requested bottom rows, previews vertical resizing, caps it to content and keeps a terminal row
AssertionError: expected 26 to be 24 // Object.is equality

- Expected
+ Received

- 24
+ 26

 ❯ src/app/PaneStatuslines.test.ts:26:25
     24|   const h=harness(3), original=h.layout(), before=original.panes[0]!.c…
     25|   h.controller.adjust(original);let box=original.panes[0]!;
     26|   expect(box.content.h).toBe(before-3);expect(original.panes[1]!.conte…
       |                         ^
     27|   const x=box.content.x+box.content.w-1,y=box.content.y+box.content.h;
     28|   expect(h.mouse("down",x,y)).toBe(true);h.mouse("move",x,y-1000);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/tui| src/app/PaneStatuslines.test.ts > wraps full-width text without losing glyphs and scrolls rows in both directions
AssertionError: expected '                                     …' to match /[日本語制作状況確認]/

- Expected:
/[日本語制作状況確認]/

+ Received:
"                                                                                                                        "

 ❯ src/app/PaneStatuslines.test.ts:40:89


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed (2)
   Start at  15:44:48
   Duration  1.07s (transform 82%, import 16%, tests 1%)

```

## 独立レビュー指摘のnegative control

ドラッグ中の上限保存修正だけを戻してunitを実行し、失敗を確認。Webでは上限の2px補正だけを戻して再ビルド後にE2Eを実行し、端末領域が18px未満（16px）になる失敗を確認。各ファイルはbyte-for-byteで復元し、Webビルドも修正後に戻した。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/app/PaneStatuslines.test.ts (2 tests | 1 failed) 11ms
   × reserves the requested bottom rows, previews vertical resizing, caps it to content and keeps a terminal row 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/PaneStatuslines.test.ts > reserves the requested bottom rows, previews vertical resizing, caps it to content and keeps a terminal row
AssertionError: expected 9 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 9

 ❯ src/app/PaneStatuslines.test.ts:87:69
     85|   expect(short.panes[0]!.content.h).toBe(before - 1);
     86|   h.mouse("up", x, nextY - 1000);
     87|   expect(h.setShared.mock.calls.at(-1)![0].statuslineSettings.rows).to…
       |                                                                     ^
     88|   h.mouse("down", x, short.panes[0]!.content.y + short.panes[0]!.conte…
     89|   h.mouse("move", x, 1000);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  15:54:44
   Duration  1.04s (transform 82%, import 16%, tests 1%)

```

```text

Running 1 test using 1 worker

(node:3719840) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-13T06:55:01.381Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-13T06:55:01.382Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-QGxHQx/commands.json","count":0}
  ✘  1 src/specs/statusline.spec.ts:326:1 › native statusline settings, order, row bounds and mobile layout persist (8.9s)


  1) src/specs/statusline.spec.ts:326:1 › native statusline settings, order, row bounds and mobile layout persist 

    Error: expect(received).toBeGreaterThanOrEqual(expected)

    Expected: >= 18
    Received:    16

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      424 |     await expect
      425 |       .poll(async () => (await page.locator(".pane-layout-leaf").boundingBox())!.height)
    > 426 |       .toBeGreaterThanOrEqual(18);
          |        ^
      427 |     await expect.poll(async () => (await bar.boundingBox())!.height).toBeLessThanOrEqual(66);
      428 |     await page.setViewportSize({ width: 1280, height: 720 });
      429 |     const grownGrip = (await grip.boundingBox())!;
        at /workspaces/sodashitsu/packages/e2e/src/specs/statusline.spec.ts:426:8

    Error Context: test-results/statusline-native-statusli-6baaa-s-and-mobile-layout-persist/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/statusline-native-statusli-6baaa-s-and-mobile-layout-persist/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/statusline-native-statusli-6baaa-s-and-mobile-layout-persist/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/statusline.spec.ts:326:1 › native statusline settings, order, row bounds and mobile layout persist 
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test statusline.spec.ts --grep native statusline
```
