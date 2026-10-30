# 検証

controller/mainの関連2file32テスト通過。OS startupアダプターは生成spy、実Windows登録やagentは実行していない。OS起動無効化→保存→描画、保存失敗でOS復元・描画なし、OS変更失敗で保存なしを検査。最終build/typecheck/全体試験は実行中。

## 旧起動処理相当のnegative

managed初期化を従来のin-memory override/render相当へ戻して失敗確認し、原本bytesを復元した。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-managed-startup

 ❯ |@sodashitsu/desktop-assistant| src/controller.test.ts (14 tests | 3 failed | 11 skipped) 13ms
   × retires independent login startup through the native transition before enabling managed mode 8ms
   × restores login startup and avoids rendering managed UI when saving the transition fails 3ms
   × does not persist or render if retiring the OS login entry fails 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/controller.test.ts > retires independent login startup through the native transition before enabling managed mode
AssertionError: expected "vi.fn()" to be called once with arguments: [ false ]

Number of calls: 0

 ❯ src/controller.test.ts:183:25
    181|  const controller=new AssistantController({enabled:false,launchAtLogin…
    182|  await controller.initializeManaged("http://127.0.0.1:7781");
    183|  expect(native.startup).toHaveBeenCalledExactlyOnceWith(false);
       |                         ^
    184|  expect(save).toHaveBeenCalledWith(expect.objectContaining({enabled:tr…
    185|  expect(controller.preferences.launchAtLogin).toBe(false);expect(nativ…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/controller.test.ts > restores login startup and avoids rendering managed UI when saving the transition fails
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/controller.test.ts:190:69
    188|  const {native}=fixture();const save=vi.fn(async()=>{throw Error("gene…
    189|  const controller=new AssistantController({enabled:false,launchAtLogin…
    190|  await expect(controller.initializeManaged("http://127.0.0.1:7781")).r…
       |                                                                     ^
    191|  expect(native.startup).toHaveBeenNthCalledWith(1,false);expect(native…
    192|  expect(controller.preferences.enabled).toBe(false);expect(controller.…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/controller.test.ts > does not persist or render if retiring the OS login entry fails
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/controller.test.ts:198:69
    196|  const {native}=fixture();vi.mocked(native.startup).mockImplementation…
    197|  const save=vi.fn(async()=>{}),controller=new AssistantController({lau…
    198|  await expect(controller.initializeManaged("http://127.0.0.1:7781")).r…
       |                                                                     ^
    199|  expect(save).not.toHaveBeenCalled();expect(native.tray).not.toHaveBee…
    200| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 11 skipped (14)
   Start at  00:15:25
   Duration  681ms (transform 75%, import 22%, tests 2%, worker 1%)


```
