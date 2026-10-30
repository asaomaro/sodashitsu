# 検証

関連4ファイル47テスト通過。owned Node子と生成pipe、temp設定ファイルのみ。既定無効/コマンド不正でもdisabledなら起動0、重複start1子、EOF終了、exit75診断、永続enable/disable/監視、stop後の保存拒否、受理済保存drain、stop失敗時の保存drain、期限後bootstrap拒否、CLIのsessionスコープを検査。

最終build/typecheck/全体試験は実行中。Windows GUI、実agent、マイク、実画面、OSの登録変更は試験しない。

## 修正前の生の回帰出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-managed

 ❯ |@sodashitsu/desktop-assistant| src/managedLaunch.test.ts (4 tests | 1 failed | 3 skipped) 8ms
   × rejects expired bootstrap even if the timeout callback has not run 7ms
 ❯ |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts (3 tests | 1 failed | 2 skipped) 8ms
   × drains accepted self-disable persistence before stopping the owner 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/managedLaunch.test.ts > rejects expired bootstrap even if the timeout callback has not run
AssertionError: promise resolved "{ serverOrigin: 'http://127.0.0.1:77…' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "serverOrigin": "http://127.0.0.1:7780",
  }

 ❯ src/managedLaunch.test.ts:27:22
     25|  try { const ready=managedLaunch(pipe,stop);now.mockReturnValue(6100);
     26|   pipe.write('{"version":1,"serverOrigin":"http://127.0.0.1:7780"}\n');
     27|   await expect(ready).rejects.toThrow();expect(stop).toHaveBeenCalledO…
       |                      ^
     28|  } finally {now.mockRestore();pipe.destroy();}
     29| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts > drains accepted self-disable persistence before stopping the owner
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/assistant/AssistantLaunchController.test.ts:38:19
     36|   const closing=controller.stop().then(()=>{stopped=true;});
     37|   for(let i=0;i<10;i++) await Promise.resolve();
     38|   expect(stopped).toBe(false);
       |                   ^
     39|   release();await closing;expect(stopped).toBe(true);
     40|   disabled();expect(save).toHaveBeenCalledOnce();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 5 skipped (7)
   Start at  22:46:17
   Duration  745ms (transform 78%, import 20%, tests 1%)


```

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-managed

 ❯ |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts (4 tests | 1 failed | 3 skipped) 9ms
   × drains accepted writes even when the app cannot confirm exit 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts > drains accepted writes even when the app cannot confirm exit
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/assistant/AssistantLaunchController.test.ts:54:16
     52|   const closing=controller.stop().then(()=>{done=true;},()=>{done=true…
     53|   for(let i=0;i<15;i++) await Promise.resolve();
     54|   expect(done).toBe(false);release();await closing;expect(done).toBe(t…
       |                ^
     55|  } finally {release?.();await controller.stop().catch(()=>{});await rm…
     56| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  22:48:12
   Duration  717ms (transform 75%, import 23%, tests 1%)


```

最終build/typecheck、899ファイル13,016テスト通過（342.93秒）。PR #330 CI2件成功、main merge b269e73684e0fc3233db4161eb0943e6908a10f5。GitHub treeと検証済みlocal tree ef4a43abaa1c0699ef87bc21b2f5db4b41327af0一致。
