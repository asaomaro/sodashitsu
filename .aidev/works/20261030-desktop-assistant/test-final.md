# Final development verification

Windows-native assistant / existing Soda and agents in WSL are the initial operating scope. All requested development phases are implemented. Real-device validation is explicitly separate; unsigned development zip delivery is the distribution scope.

- Final source full build: PASS (`/tmp/soda-assistant-completion-build.log`).
- Final source full typecheck: PASS (`/tmp/soda-assistant-completion-types.log`).
- Final source full runtime:890 files /12,922 tests PASS,350.54s (`pnpm exec vitest run --maxWorkers=4`, `/tmp/soda-assistant-completion-all-tests.log`). Initial `pnpm test --maxWorkers` was rejected by pnpm before any tests; corrected to the explicit Vitest invocation. Existing happy-dom/resource logs appear without test failures.
- Generated400x640 keyboard/DOM UI: PASS (`/tmp/soda-assistant-completion-ui.log`), including position save/restore, verbal notices, scoped replies, OCR/media boundaries, reminder, plugin operation/result and editor serialization.
- Unsigned Windows zip: PASS (`/tmp/soda-assistant-completion-pack.log`); main/preload/fullscreen/geometry/remote/characters/capture/reminder/OCR and UI archive bytes equal built source. No native app was installed/launched.
- Windows CI additionally compiles only Win32 probe declarations; it never calls Check/foreground APIs. Exact-head CI, clean external smoke and merge receipts are recorded in the final delivery PR.

## F behavior and review

Settings expose selected display and DIP coordinates while preserving unavailable monitor ids. Character/bubble bounds clamp to work areas. Native suspend/lock discards capture and clears OCR/audio, aborts the short foreground query, suppresses late popups and stops control/notice links on sleep. Resume applies current preferences before reconnecting original instances; a delayed settings save cannot start a new origin while suspended. Fullscreen check is a fixed read-only query with2s process timeout/2KiB output/restricted environment, single flight and2s cache; invalidation prevents old normal results from entering the new cache. Notifications retain the inbox and never steal focus; explicit chat remains available.

Final integration inspection found reconnect restore could focus a different live pane; the expanded panel now pins view focus and rejects foreign-focus input synchronously before returning to its target. Dedicated agent and plugin/notification targets remain distinct.

review_pointer independently checked F and found a lock transition after the asynchronous probe; fixed terminal lock check plus lock-screen epoch invalidation, with a regression. It suggested blocking origin changes during suspend; fixed updateBackend gate and regression. Correction review found no remaining must/should.

review_transfer re-read the whole product diff from9418cb11 through all phases and F, including persisted identity/session restoration, final queued input, IPC/native permissions, assets/bounded stores, approved plugin/run routing, remote machine/focus and sleep. No additional must. Its documentation correction (old future-work claims) is applied. No reviewer edited source, repeated full tests or executed actual foreground/GUI/media/model/agent APIs.

Real Windows GUI/tray/DPI/startup, OS trust, foreground query, native media/canvas/clipboard, real agent/forms and local Tesseract/Whisper recognition/playback remain device verification. Generated/adaptor/compile-only evidence does not mark these complete.

## F negative controls

Four isolated source defects failed the intended runtime/assertions; originals restored byte-for-byte in finally, then formatted and final positives/full suite run. No product-source mutation remains.

### soda-assistant-f-negative-foreign-focus

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts (3 tests | 1 failed | 2 skipped) 11ms
   × rejects restored foreign focus before input and returns to the pinned pane 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts > rejects restored foreign focus before input and returns to the pinned pane
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/actions/assistantPanelGuard.test.ts:119:36
    117|     const event = new KeyboardEvent("keydown", { key: "y", bubbles: tr…
    118|     document.getElementById("terminal")!.dispatchEvent(event);
    119|     expect(event.defaultPrevented).toBe(true);
       |                                    ^
    120|     update();
    121|     expect(focused).toBe(p);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  16:34:55
   Duration  861ms (transform 59%, environment 22%, import 16%, worker 2%, tests 1%)
```

### soda-assistant-f-negative-lock

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (18 tests | 1 failed | 17 skipped) 769ms
   × does not show a delayed popup after the desktop becomes locked 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > does not show a delayed popup after the desktop becomes locked
AssertionError: expected 2 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 2

 ❯ src/main.test.ts:1078:745


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  16:36:02
   Duration  943ms (tests 89%, transform 8%, import 2%)
```

### soda-assistant-f-negative-stale-quiet

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/fullscreen.test.ts (2 tests | 1 failed | 1 skipped) 6ms
   × does not cache a pre-resume normal result after invalidation 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/fullscreen.test.ts > does not cache a pre-resume normal result after invalidation
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/fullscreen.test.ts:46:21
     44|   policy.invalidate();
     45|   finish(false);
     46|   expect(await old).toBe(true);
       |                     ^
     47|   const fresh = policy.quiet();
     48|   await Promise.resolve();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  16:34:54
   Duration  150ms (transform 69%, import 17%, tests 10%, worker 4%)
```

### soda-assistant-f-negative-suspended-origin

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (18 tests | 1 failed | 17 skipped) 748ms
   × defers a changed server connection until resume even if a settings save completes during suspend 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > defers a changed server connection until resume even if a settings save completes during suspend
AssertionError: expected 2 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 2

 ❯ src/main.test.ts:1082:173


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  16:34:56
   Duration  911ms (tests 90%, transform 8%, import 2%)
```
