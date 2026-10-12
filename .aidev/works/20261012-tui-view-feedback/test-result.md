TUI全体:651成功。TLSの3件はsandboxポート制限で実行できず、制限外で該当3件を実行して成功（合計654）。見える移動先ラベルと、離す前のビュー/端末サイズ更新、Esc復元を外側端末・実レイアウトで確認。TUI型検査・ビルド成功。
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  5 passed (5)
      Tests  22 passed (22)
   Start at  13:48:50
   Duration  2.99s (transform 62%, tests 22%, import 16%)

  Transform  |@sodashitsu/tui| transforming modules took 4.52s · 62% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/net/nodeTransport.tls.test.ts (3 tests | 3 skipped) 10007ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/net/nodeTransport.tls.test.ts > 証明書の指紋の照合（実物の TLS）
Error: Hook timed out in 10000ms.
If this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".
 ❯ src/net/nodeTransport.tls.test.ts:35:3
     33|   const seenCookies: string[] = [];
     34|
     35|   beforeAll(async () => {
       |   ^
     36|     server = createServer({ cert, key }, (req, res) => {
     37|       seenCookies.push(req.headers.cookie ?? "");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
Error: listen EPERM: operation not permitted 127.0.0.1
 ❯ Server.setupListenHandle [as _listen2] node:net:1986:21
 ❯ listenInCluster node:net:2065:12
 ❯ node:net:2274:7
 ❯ processTicksAndRejections node:internal/process/task_queues:90:21

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'EPERM', errno: -1, syscall: 'listen', address: '127.0.0.1' }
This error originated in "packages/tui/src/net/nodeTransport.tls.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯


 Test Files  1 failed | 56 passed (57)
      Tests  651 passed | 3 skipped (654)
     Errors  1 error
   Start at  13:49:39
   Duration  12.63s (tests 40%, transform 38%, import 22%)

  Transform  |@sodashitsu/tui| transforming modules took 34.55s · 38% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  13:51:17
   Duration  1.06s (transform 70%, import 15%, tests 14%)


```
