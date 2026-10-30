# 検証

関連3ファイル59テストとgeneratedUIが通過（追加したprotocol境界試験は最終全体試験でも検査）。画像入力→provider呼出し、upload/abort/retarget/元期限/返却path、server保留writeの取消/expiry/workingと他client取消拒否、metadata中期限超過を検査。全て生成PNG・memory terminal・headless DOM。実エージェント/画面/音声は送っていない。

最終build/typecheck/全体試験は実行中。下記guardを元へ戻す/除去すると意図したAssertionErrorで失敗することを確認し、原本bytesを復元した。

## soda-agent-vision-final-guard-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-vision

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (36 tests | 1 failed | 35 skipped) 27ms
   × checks image expiry again after final target metadata inspection 26ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > checks image expiry again after final target metadata inspection
AssertionError: expected { ok: true, …(1) } to match object { ok: false }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": false,
+   "ok": true,
  }

 ❯ src/assistant/AssistantSessions.test.ts:816:35
    814|   const original=f.manager.target.bind(f.manager);
    815|   vi.spyOn(f.manager,"target").mockImplementation((...args)=>{const re…
    816|   release();expect(await pending).toMatchObject({ok:false});expect(hos…
       |                                   ^
    817|  } finally {now.mockRestore();release?.();}
    818| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 35 skipped (36)
   Start at  23:51:41
   Duration  1.63s (transform 82%, import 16%, tests 2%)


```

## soda-agent-vision-cancel-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-vision

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (36 tests | 1 failed | 35 skipped) 39ms
   × fences a queued image instruction after cancel 37ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > fences a queued image instruction after cancel
AssertionError: expected { ok: true, …(1) } to match object { ok: false }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": false,
+   "ok": true,
  }

 ❯ src/assistant/AssistantSessions.test.ts:791:35
    789|   if(reason==="expires")now.mockReturnValue(1101);
    790|   if(reason==="working")f.session.updatePaneRuntime(info.paneId,{agent…
    791|   release();expect(await pending).toMatchObject({ok:false});expect(hos…
       |                                   ^
    792|  } finally {now.mockRestore();release?.();}
    793| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 35 skipped (36)
   Start at  23:53:08
   Duration  2.26s (transform 81%, import 17%, tests 2%)


```

## soda-agent-vision-deadline-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-vision

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (36 tests | 1 failed | 35 skipped) 45ms
   × fences a queued image instruction after expires 43ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > fences a queued image instruction after expires
AssertionError: expected { ok: true, …(1) } to match object { ok: false }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": false,
+   "ok": true,
  }

 ❯ src/assistant/AssistantSessions.test.ts:791:35
    789|   if(reason==="expires")now.mockReturnValue(1101);
    790|   if(reason==="working")f.session.updatePaneRuntime(info.paneId,{agent…
    791|   release();expect(await pending).toMatchObject({ok:false});expect(hos…
       |                                   ^
    792|  } finally {now.mockRestore();release?.();}
    793| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 35 skipped (36)
   Start at  23:53:11
   Duration  2.36s (transform 81%, import 17%, tests 2%)


```

## soda-agent-vision-idle-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-agent-vision

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.test.ts (36 tests | 1 failed | 35 skipped) 55ms
   × fences a queued image instruction after working 52ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.test.ts > fences a queued image instruction after working
AssertionError: expected { ok: true, …(1) } to match object { ok: false }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": false,
+   "ok": true,
  }

 ❯ src/assistant/AssistantSessions.test.ts:791:35
    789|   if(reason==="expires")now.mockReturnValue(1101);
    790|   if(reason==="working")f.session.updatePaneRuntime(info.paneId,{agent…
    791|   release();expect(await pending).toMatchObject({ok:false});expect(hos…
       |                                   ^
    792|  } finally {now.mockRestore();release?.();}
    793| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 35 skipped (36)
   Start at  23:53:15
   Duration  2.60s (transform 80%, import 17%, tests 2%)


```

最終build/typecheck通過。初回全体はlocal OCR fixtureが新agent既定値を使う1件の期待値不一致（他13039件pass）。local providerを明示し対象18件と全体を再実行、899file13040test pass（362.49秒）。PR #332の同一head CI4件成功、merge adaa01a71e460cc4614f7dbb5b05c4d007114b18、GitHub/local tree 166df24c35caa3e55e48b6066de3f7c244df2f75一致。
