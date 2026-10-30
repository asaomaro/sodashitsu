# Stage A verification

- New package: 17 unit/injected-native tests passed. Temporary files and generated/mock adapters only.
- Headless Chromium generated DOM and actual keyboard flow passed: all three captains, enabled/tray save, failed-save recovery, character chat action, disconnected bubble state, close/settings/open actions. No real agent/capture/microphone/desktop touched.
- Two pointer-flow attempts timed out waiting for Chromium element stability/animation frames (30s then 5s). Keyboard verification does not establish pointer/native GUI or paint completion. The environment limitation is not classified as a fixed product issue.
- Windows x64 zip generated with Electron45.1.0/electron-builder26.18.0. ASAR contains main, CJS sandbox preload, three captain assets, bubble/settings assets and workspace protocol/zod dependencies. Native Windows launch remains unverified. No signing or installer/OS registration performed.
- Independent task/whole/correction reviews recorded in review.md.

## Negative controls (source restored byte-for-byte)

Changing the bubble character refresh guard to false and omitting startup rollback each fail at the intended assertions, not import/compilation/bootstrap timeouts.

### bubble-character-refresh

```text
FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > uses a focusable local bubble for user chat and closes it when disabled
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/main.test.ts:200:32
    198|   expect(bubble.hide).toHaveBeenCalledOnce();
    199|   await fixture.handlers.get("assistant:save")!(event, { enabled: true…
    200|   expect(bubble.isDestroyed()).toBe(true);
       |                                ^
    201|   await fixture.handlers.get("assistant:chat")!(event);
    202|   const updatedBubble = fixture.windows.at(-1)!;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### startup-rollback

```text
FAIL  |@sodashitsu/desktop-assistant| src/controller.test.ts > assistant native lifecycle > rolls startup back if saving fails
AssertionError: expected 2nd "vi.fn()" call to have been called with [ false ], but called only 1 times
 ❯ src/controller.test.ts:75:28
     73|     await expect(controller.update({ launchAtLogin: true })).rejects.t…
     74|     expect(native.startup).toHaveBeenNthCalledWith(1, true);
     75|     expect(native.startup).toHaveBeenNthCalledWith(2, false);
       |                            ^
     76|   });
     77|   it("serializes saves and snapshots mutable inputs", async () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Whole workspace and existing smoke

Full workspace `pnpm build` and `pnpm typecheck` passed. The existing `pnpm smoke` HTTP login/WebSocket hello/PTY echo/custom-command round trips passed, then Web UI smoke timed out at `.xterm-helper-textarea` visibility (15s). One source attempt and one clean baseline attempt (66b9057c tree-equal to main9418cb11) have the same failure. This does not establish a regression-free result or a fixed browser problem. No timeout/assertion was weakened in existing smoke. Whole source tests are recorded after completion below.

```text
smoke: FAIL page.waitForSelector: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('.xterm-helper-textarea') to be visible
```

The Windows generated CI workflow was independently reviewed after addition; no additional must/should. It runs generated adapter/keyboard tests and unsigned zip packaging, never the native app or agent.

## Whole source suite result

`pnpm exec vitest run --maxWorkers=4`: 864 files passed, 1 failed; **12,777 tests passed, 1 failed (12,778 total), 385.98s**. The sole failure is unchanged TUI elapsed-time rendering: expected `/T\s+17秒/`, received `T 16秒` in TuiApp.subagents.test.ts. The entire 14-test file passes on isolated source retry (4.38s) and the clean main-equivalent baseline (4.92s). These isolated passes do not prove the original failure's cause or non-regression. The unrelated test/assertion was not modified, and the whole suite was not repeated.

```text
FAIL  |@sodashitsu/tui| src/app/TuiApp.subagents.test.ts > 端末版のサブエージェントの表示 > 一覧を開いている間は、経過時間が進む（10 秒ごとに描き直す）。閉じたら描き直さない
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


 Test Files  1 failed | 864 passed (865)
      Tests  1 failed | 12777 passed (12778)
   Start at  09:15:40
   Duration  385.98s (tests 80%, import 11%, environment 4%, transform 4%)
```

Source/clean baseline smoke limitation and native Windows GUI remain open. Package generated tests pass; do not describe all-workspace tests or native UI as entirely green.
