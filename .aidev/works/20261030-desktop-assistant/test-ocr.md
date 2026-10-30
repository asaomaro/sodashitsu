# D3 OCR verification

- Full source `pnpm build` and `pnpm typecheck`: PASS. Final native package typecheck repeated after test-only annotations.
- Related source runtime:61 files /601 tests PASS (native +protocol). Existing server full baseline is documented under B2; no duplicate full12k suite for native-only behavior.
- Generated headless400x640 keyboard UI: PASS; explicit image→preview→recognition→result→common editor, reset note identity, save-note-pending import rejection, clear result/src on discard. Existing microphone/tools/chat paths also pass.
- Native main integration uses mocked Electron clipboard PNG Blob and mocked OCR runner; no real clipboard/Tesseract/capture/agent/model.
- PNG generated regular file tests verify headers/dimension limit, nonregular and symlink rejection, bounded read and cancellation. Runner tests use only EventEmitter/PassThrough child mocks: fixed stdin/stdout argv, restricted environment, output limit, abort wait-for-close and absolute deadline.
- Native image decode/crop, real OS clipboard, Tesseract recognition/language availability and real Windows desktop remain unverified on a device. Direct screen capture is deferred; OS-copied PNG/manual PNG is the implemented input.
- Windows unsigned zip packaging: generated main/preload/OCR runner/PNG/renderer assets in app.asar match byte-for-byte. Zip build exited0; unsigned148MiB development archive only, never installed or launched. Exact source CI is recorded after PR creation.

## Negative controls

Eight isolated intentional defects each failed the relevant runtime/assertion, then original source bytes were restored in `finally` and compared byte-for-byte. No dist-based test was used; UI reads assets directly. Final positive source checks were rerun after restoration.

The initial retiring-slot negative timed out because the test double blocked both input calls; changed the second input to a resolved image, then the intended promise-rejection assertion failed. The initial deadline negative reached a matcher TypeError when success produced a string; added an explicit Error-instance assertion and reran. These initial attempts are not counted as valid controls. UI fixture selectors were updated for nested OCR details and a legitimate preview image; fixture asset allowlist now includes ocr.js. These were verification harness failures, not device validation.

### close-deadline

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-ocr

 ❯ |@sodashitsu/desktop-assistant| src/ocrRunner.test.ts (5 tests | 1 failed | 4 skipped) 56ms
   × checks absolute deadlines when callbacks outrun the timeout 56ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/ocrRunner.test.ts > checks absolute deadlines when callbacks outrun the timeout
AssertionError: expected '' to be an instance of Error
 ❯ src/ocrRunner.test.ts:81:24
     79|   now = 60_000;
     80|   child.emit("close", 0);
     81|   expect(await caught).toBeInstanceOf(Error);
       |                        ^
     82|   expect((await caught).message).toMatch(/制限時間/);
     83| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  13:54:36
   Duration  194ms (tests 55%, transform 32%, import 11%, worker 2%)
```

### crop-expiry

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-ocr

 ❯ |@sodashitsu/desktop-assistant| src/ocr.test.ts (9 tests | 1 failed | 8 skipped) 7ms
   × cannot revive an expired or discarded image after native crop returns 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/ocr.test.ts > cannot revive an expired or discarded image after native crop returns
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/ocr.test.ts:168:78
    166|  let now=0; const {service}=fixture({now:()=>now,crop:()=>{now=300_000…
    167|  const image=(await service.input(1,"file"))!;
    168|  expect(()=>service.crop(1,image.state.imageId!,{x:0,y:0,width:1,heigh…
       |                                                                              ^
    169|  const other=fixture({crop:()=>{other.discard();return png();}}).servi…
    170|  const next=(await other.input(1,"file"))!;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  13:53:59
   Duration  154ms (transform 67%, import 19%, tests 9%, worker 4%)
```

### dimensions

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-ocr

 ❯ |@sodashitsu/desktop-assistant| src/png.test.ts (2 tests | 1 failed | 1 skipped) 6ms
   × rejects oversized dimensions and non-PNG before decoding 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/png.test.ts > rejects oversized dimensions and non-PNG before decoding
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/png.test.ts:16:32
     14|   const bytes = png();
     15|   bytes.writeUInt32BE(4000, 16);
     16|   expect(() => pngSize(bytes)).toThrow("3840");
       |                                ^
     17| });
     18| it("reads only a bounded regular file and honors cancellation", async …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  13:54:09
   Duration  125ms (transform 57%, import 23%, tests 13%, worker 6%)
```

### editor-lock

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-desktop-assistant-ocr/packages/desktop-assistant
> node scripts/verify-ui.mjs

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toHaveValue(expected) failed

Locator:  locator('#tool-text')
Expected: "保存中の文章"
Received: "画像から読み取った文字"
Timeout:  5000ms

Call log:
  - Expect "toHaveValue" locator('#tool-text') with timeout 5000ms
  - waiting for locator('#tool-text')
    14 × locator resolved to <textarea rows="3" disabled id="tool-text" maxlength="8192"></textarea>
       - unexpected value "画像から読み取った文字"

    at captureRawStack (/workspaces/sodashitsu-desktop-assistant-ocr/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-desktop-assistant-ocr/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toHaveValue (/workspaces/sodashitsu-desktop-assistant-ocr/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-desktop-assistant-ocr/packages/desktop-assistant/scripts/verify-ui.mjs:341:44 {
  matcherResult: {
    name: 'toHaveValue',
    expected: '保存中の文章',
    message: 'expect(locator).toHaveValue(expected) failed\n' +
      '\n' +
      "Locator:  locator('#tool-text')\n" +
      'Expected: "保存中の文章"\n' +
      'Received: "画像から読み取った文字"\n' +
      'Timeout:  5000ms\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toHaveValue" locator('#tool-text') with timeout 5000ms\n` +
      "  - waiting for locator('#tool-text')\n" +
      '    14 × locator resolved to <textarea rows="3" disabled id="tool-text" maxlength="8192"></textarea>\n' +
      '       - unexpected value "画像から読み取った文字"\n',
    pass: false,
    actual: '画像から読み取った文字',
    log: [
      `  - Expect "toHaveValue" locator('#tool-text') with timeout 5000ms`,
      "  - waiting for locator('#tool-text')",
      '    14 × locator resolved to <textarea rows="3" disabled id="tool-text" maxlength="8192"></textarea>',
      '       - unexpected value "画像から読み取った文字"'
    ],
    timeout: 5000,
    ariaSnapshot: '- textbox "扱う文章（8192文字以内）" [disabled]: 画像から読み取った文字'
  }
}

Node.js v24.15.0
/workspaces/sodashitsu-desktop-assistant-ocr/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1
```

### late-result

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-ocr

 ❯ |@sodashitsu/desktop-assistant| src/ocr.test.ts (9 tests | 1 failed | 8 skipped) 8ms
   ❯ ephemeral OCR (8)
     × retains the physical input slot and ignores completion after discard 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/ocr.test.ts > ephemeral OCR > retains the physical input slot and ignores completion after discard
AssertionError: expected { state: { revision: 6, …(7) }, …(1) } to be null

- Expected:
null

+ Received:
{
  "state": {
    "enabled": true,
    "height": 1,
    "imageId": "3a040731-0631-4778-b7f8-d0ec438b042c",
    "message": "画像と範囲を確認し、「文字を認識」を押してください。",
    "revision": 6,
    "status": "ready",
    "text": "",
    "width": 1,
  },
  "uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
}

 ❯ src/ocr.test.ts:75:27
     73|     await expect(service.input(2, "file")).rejects.toThrow("完了");
     74|     finish(png());
     75|     expect(await request).toBeNull();
       |                           ^
     76|     expect(service.snapshot().imageId).toBeNull();
     77|     expect(options.input).toHaveBeenCalledTimes(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  13:54:07
   Duration  163ms (transform 66%, import 19%, tests 11%, worker 3%)
```

### output-cap

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-ocr

 ❯ |@sodashitsu/desktop-assistant| src/ocrRunner.test.ts (5 tests | 1 failed | 4 skipped) 60ms
   × bounds output and rejects after process closes 59ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/ocrRunner.test.ts > bounds output and rejects after process closes
AssertionError: expected "vi.fn()" to be called at least once
 ❯ src/ocrRunner.test.ts:68:22
     66|   await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
     67|   child.stdout.write(Buffer.alloc(256 * 1024 + 1));
     68|   expect(child.kill).toHaveBeenCalled();
       |                      ^
     69|   child.emit("close", 0);
     70|   expect((await caught).message).toContain("大きすぎ");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  13:54:07
   Duration  202ms (tests 55%, transform 33%, import 10%, worker 2%)
```

### owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-ocr

 ❯ |@sodashitsu/desktop-assistant| src/ocr.test.ts (9 tests | 1 failed | 8 skipped) 7ms
   ❯ ephemeral OCR (8)
     × pins image and owner for recognition and crop 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/ocr.test.ts > ephemeral OCR > pins image and owner for recognition and crop
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/ocr.test.ts:49:55
     47|     const { service, options } = fixture();
     48|     const image = (await service.input(1, "clipboard"))!;
     49|     await expect(service.run(2, image.state.imageId!)).rejects.toThrow…
       |                                                       ^
     50|     expect(() =>
     51|       service.crop(2, image.state.imageId!, { x: 0, y: 0, width: 1, he…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  13:54:00
   Duration  161ms (transform 70%, import 19%, tests 8%, worker 3%)
```

### retiring-slot

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-ocr

 ❯ |@sodashitsu/desktop-assistant| src/ocr.test.ts (9 tests | 1 failed | 8 skipped) 9ms
   ❯ ephemeral OCR (8)
     × retains the physical input slot and ignores completion after discard 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/ocr.test.ts > ephemeral OCR > retains the physical input slot and ignores completion after discard
AssertionError: promise resolved "{ state: { revision: 8, …(7) }, …(1) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "state": {
+     "enabled": true,
+     "height": 1,
+     "imageId": "a4461a9c-bda0-449b-8920-23ea58a167a8",
+     "message": "画像と範囲を確認し、「文字を認識」を押してください。",
+     "revision": 8,
+     "status": "ready",
+     "text": "",
+     "width": 1,
+   },
+   "uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
  }

 ❯ src/ocr.test.ts:74:43
     72|   const request = service.input(1, "clipboard");
     73|     service.discard(1);
     74|     await expect(service.input(2, "file")).rejects.toThrow("完了");
       |                                           ^
     75|     finish(png());
     76|     expect(await request).toBeNull();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  13:54:35
   Duration  172ms (transform 63%, import 19%, tests 14%, worker 4%)
```
