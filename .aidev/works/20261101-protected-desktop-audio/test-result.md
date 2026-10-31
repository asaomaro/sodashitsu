# 検証記録

- 実C#コンパイルと生成AudioChecks: owner ACL・client PID不一致時activationゼロ・生成PCM・停止/Dispose・private roleのstream/startup/heartbeat/source/QPC成功。
- Windows source私有コピーで5 guard（source/startup/heartbeat/stream/QPC）を一つずつ破壊→意図したassertion失敗→復元成功。製品bytes不変。生出力: /tmp/soda-protected-audio-negative.log。
- Node source私有コピーで3 guard（callback後dead再確認/stop時例外隔離/元startup期限）を破壊→assertion失敗→復元成功。製品bytes不変。生出力: /tmp/soda-protected-audio-node-negative.log。
- 既存Relay/Provider/Audioと追加lifetime/protocol/rolebinaryの関連6 suite323件成功。追加ordinary-user交渉feature有無・許可失効・QPC欠落/誤値・privileged偽claimの6件成功。最終unit5suite57件成功。lifetime10件はsynchronous cancellation、throw、receipt欠落のslot保持を含む。
- Browser default/UAC 2件成功。実H.264 pixels/継続描画、生成PCM→Opus実AudioDecoder output、source終了後VideoDecoder/AudioDecoder全閉鎖。helper optional音声loadを無効にした最終版でも2件成功。
- build/typecheck成功。
- 独立taskcheckの2 must（stop例外による後片付け中断、callback同期取消後の起動）を修正し回帰追加、再点検で解消。独立crossもmust/should解消。source activationと最終Opus送出にも取消後の再確認を追加。
- この結果は実SYSTEM画面+通常ユーザーWASAPI+GPUの実機確認を代用しない。

## soda-protected-audio-negative.log（生成負例の生出力）

```text
user_audio_generated_checks_passed: stream/PID, original startup, heartbeat, revocation and shared QPC; no device capture
desktop_audio_checks_passed: owner ACL, matching/denied client PID before source activation, generated PCM framing, cancel/stop/dispose; no WASAPI activation/input/capture
negative source
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "GeneratedChecks" を呼び出し中に例外が発生しました: "Audio source survived revocation" ---> System.Exception: Audio source survived revocation
   場所 SodaDesktopUserAudioRole.GeneratedChecks()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative startup
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "GeneratedChecks" を呼び出し中に例外が発生しました: "Original audio startup deadline extended" ---> System.Exception: Original audio startup deadline extended
   場所 SodaDesktopUserAudioRole.GeneratedChecks()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative heartbeat
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "GeneratedChecks" を呼び出し中に例外が発生しました: "Audio source survived heartbeat expiry" ---> System.Exception: Audio source survived heartbeat expiry
   場所 SodaDesktopUserAudioRole.GeneratedChecks()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative stream
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "GeneratedChecks" を呼び出し中に例外が発生しました: "Audio stream proof missing" ---> System.Exception: Audio stream proof missing
   場所 SodaDesktopUserAudioRole.GeneratedChecks()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
negative clock
System.Management.Automation.MethodInvocationException: "0" 個の引数を指定して "GeneratedChecks" を呼び出し中に例外が発生しました: "Audio QPC clock" ---> System.Exception: Audio QPC clock
   場所 SodaDesktopUserAudioRole.GeneratedChecks()
   場所 CallSite.Target(Closure , CallSite , Type )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
user_audio_generated_checks_passed: stream/PID, original startup, heartbeat, revocation and shared QPC; no device capture
desktop_audio_checks_passed: owner ACL, matching/denied client PID before source activation, generated PCM framing, cancel/stop/dispose; no WASAPI activation/input/capture
user_audio_5_source_negative_controls_and_restore_passed

```

## soda-protected-audio-node-negative-final.log（生成負例の生出力）

```text
NEGATIVE callback-dead
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-protected-desktop-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopProtectedAudio.generatedNegative.test.ts (10 tests | 1 failed | 9 skipped) 8ms
   × never spawns after a permission callback synchronously retires its own pending lease 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopProtectedAudio.generatedNegative.test.ts > never spawns after a permission callback synchronously retires its own pending lease
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "fixed-host",
      Array [
        "--role",
        "user-audio",
      ],
      Object {
        "shell": false,
        "stdio": Array [
          "pipe",
          "pipe",
          "pipe",
        ],
        "windowsHide": true,
      },
    ]


Number of calls: 1

 ❯ src/desktop/DesktopProtectedAudio.generatedNegative.test.ts:19:534


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  02:14:10
   Duration  173ms (transform 62%, import 25%, tests 10%, worker 4%)


RESTORED callback-dead
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-protected-desktop-audio


 Test Files  1 passed (1)
      Tests  1 passed | 9 skipped (10)
   Start at  02:14:11
   Duration  173ms (transform 62%, import 25%, tests 7%, worker 6%)


NEGATIVE stop-throw
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-protected-desktop-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopProtectedAudio.generatedNegative.test.ts (10 tests | 1 failed | 9 skipped) 8ms
   × continues retirement when disabling the PCM producer throws after a broken role stdin 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopProtectedAudio.generatedNegative.test.ts > continues retirement when disabling the PCM producer throws after a broken role stdin
AssertionError: expected [Function] to not throw an error but 'Error: broken role stdin' was thrown

- Expected:
undefined

+ Received:
"Error: broken role stdin"

 ❯ src/desktop/DesktopProtectedAudio.generatedNegative.test.ts:17:273


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  02:14:12
   Duration  170ms (transform 64%, import 22%, tests 10%, worker 3%)


RESTORED stop-throw
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-protected-desktop-audio


 Test Files  1 passed (1)
      Tests  1 passed | 9 skipped (10)
   Start at  02:14:13
   Duration  207ms (tests 45%, transform 37%, import 16%, worker 2%)


NEGATIVE original-startup
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-protected-desktop-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopProtectedAudio.generatedNegative.test.ts (10 tests | 1 failed | 9 skipped) 8ms
   × rejects a stale role handshake using the original startup deadline even before timer dispatch 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopProtectedAudio.generatedNegative.test.ts > rejects a stale role handshake using the original startup deadline even before timer dispatch
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "active": [Function alive],
        "id": "22222222-2222-4222-8222-222222222222",
        "send": [Function send],
        "state": [Function state],
        "synthetic": false,
        "videoTimestamp": [Function videoTimestamp],
        "write": [Function write],
      },
    ]


Number of calls: 1

 ❯ src/desktop/DesktopProtectedAudio.generatedNegative.test.ts:14:417


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  02:14:14
   Duration  166ms (transform 60%, import 27%, tests 10%, worker 3%)


RESTORED original-startup
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-protected-desktop-audio


 Test Files  1 passed (1)
      Tests  1 passed | 9 skipped (10)
   Start at  02:14:15
   Duration  206ms (tests 46%, transform 37%, import 15%, worker 2%)


protected_audio_3_node_negative_controls_and_restore_passed 094ef34634cbcdc3e0ad223033f7242b6800575e5f7c6040502d7814c0365338

```
