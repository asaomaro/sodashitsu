# 検証結果

Windows 11 / Radeon 890M、Python 3.13.9、CORE 0.17.1、ONNX Runtime 1.23.2 DirectML。

GPU固定とAUTOのgpu:true、CPU固定のgpu:falseを確認。短文のウォーム合成（2回目）はGPU634ms / CPU4796ms / AUTO588ms。単一台詞の計測であり一般的な速度保証ではない。Windowsローカル保存先でユーザー辞書の追加・削除成功。

## soda-directml-check.log

```text
devices { kind: 'json', value: { cpu: true, cuda: false, dml: true } }
synthesis { mode: 'GPU', attempt: 0, ms: 3500, bytes: 191020 }
synthesis { mode: 'GPU', attempt: 1, ms: 634, bytes: 191020 }
versions {
  kind: 'json',
  value: [
    {
      version: '0.17.1',
      isDefault: true,
      accelerationMode: 'GPU',
      gpu: true,
      pid: 3048267
    }
  ]
}

```

## soda-directml-cpu.log

```text
devices { kind: 'json', value: { cpu: true, cuda: false, dml: true } }
synthesis { mode: 'CPU', attempt: 0, ms: 5312, bytes: 191020 }
synthesis { mode: 'CPU', attempt: 1, ms: 4796, bytes: 191020 }
versions {
  kind: 'json',
  value: [
    {
      version: '0.17.1',
      isDefault: true,
      accelerationMode: 'CPU',
      gpu: false,
      pid: 3048792
    }
  ]
}

```

## soda-directml-data-check.log

```text
devices { kind: 'json', value: { cpu: true, cuda: false, dml: true } }
dictionary saved true
dictionary removed
synthesis { mode: 'AUTO', attempt: 0, ms: 2009, bytes: 191020 }
synthesis { mode: 'AUTO', attempt: 1, ms: 632, bytes: 191020 }
versions {
  kind: 'json',
  value: [
    {
      version: '0.17.1',
      isDefault: true,
      accelerationMode: 'AUTO',
      gpu: true,
      pid: 3053827
    }
  ]
}

```

## soda-directml-final-unit.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  5 passed (5)
      Tests  13 passed (13)
   Start at  22:37:59
   Duration  2.27s (transform 46%, tests 41%, import 13%)

  Transform  |@sodashitsu/server| transforming modules took 2.38s · 46% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## soda-directml-production-check.log

```text
panes retained 7
endpoint { enabled: true, transport: 'ipc', origin: null }
assistant {
  enabled: true,
  canConfigure: true,
  phase: 'preparing',
  message: '初回は共通ランタイムを準備します。'
}
Soda RPC synthesized WAV 178732
versions [{"version":"0.17.1","isDefault":true,"accelerationMode":"AUTO","gpu":true,"pid":3057566}]

```

## soda-directml-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/voice/pythonLaunch.test.ts (2 tests | 1 failed) 10ms
   × bootstraps Windows Python with native paths and preserves source as an argument 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/voice/pythonLaunch.test.ts > bootstraps Windows Python with native paths and preserves source as an argument
AssertionError: expected [ '-u', '-c', 'print("日本語")' ] to include 'WIN:/mnt/c/音声/python'
 ❯ src/voice/pythonLaunch.test.ts:7:46
      5|  const convert=vi.fn((value:string)=>'WIN:'+value),launch=pythonLaunch…
      6|  const code='print("日本語")',args=launch.code(code);
      7|  expect(args.at(-1)).toBe(code);expect(args).toContain('WIN:'+profile.…
       |                                              ^
      8|  expect(launch.script('/voice/resident.py').at(-1)).toBe('WIN:/voice/r…
      9|  expect(launch.path(profile.runtimeDir)).toBe('WIN:'+profile.runtimeDi…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  22:39:20
   Duration  135ms (transform 54%, import 20%, tests 19%, worker 6%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/surface/methods/voiceCore.test.ts (1 test | 1 failed) 12ms
   × requires the request owner for cancellation and rejects the generic-operation bypass 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/voiceCore.test.ts > requires the request owner for cancellation and rejects the generic-operation bypass
AssertionError: expected { ok: true, …(1) } to match object { ok: false, …(1) }
(3 matching properties omitted from actual)

- Expected
+ Received

  {
-   "error": {
-     "code": "unauthorized",
-   },
-   "ok": false,
+   "ok": true,
  }

 ❯ src/surface/methods/voiceCore.test.ts:9:91
      7|  const requestId=randomUUID(),owner={clientId:'owner'} as MethodContex…
      8|  const pending=surface.invoke(owner,'voice.call',{operation:'synthesiz…
      9|  expect(await surface.invoke(other,'voice.call',{operation:'cancel',pa…
       |                                                                                           ^
     10|  expect(await surface.invoke(other,'voice.cancel',{requestId})).toMatc…
     11|  expect(await surface.invoke(owner,'voice.cancel',{requestId})).toMatc…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  22:39:21
   Duration  1.36s (transform 81%, import 17%, tests 1%)


```

## 本番反映完了

```text
panes retained 7
endpoint { enabled: true, transport: 'ipc', origin: null }
assistant { enabled: true, canConfigure: true, phase: 'running', message: '' }
Soda RPC synthesized WAV 178732
versions [{"version":"0.17.1","isDefault":true,"accelerationMode":"AUTO","gpu":true,"pid":3060190},{"version":"0.17.0","isDefault":false,"accelerationMode":"AUTO","gpu":true,"pid":3060185}]

```

CORE用TCP50022は待受なし、既存コンテナ50021とSoda7780は維持。0.17.0/0.17.1の同時GPU合成に成功。アシスタントrunning、7 pane ID保持（稼働PTY5件）。
