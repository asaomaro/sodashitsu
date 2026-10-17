# 検証結果

- `pnpm build`: 成功。
- `pnpm typecheck`: 成功。
- `pnpm exec vitest run packages/server/src/machine packages/server/src/ws/WsServerWs.test.ts packages/cli/src/cliArgs.test.ts packages/cli/src/skill.test.ts packages/protocol/src/delegation.test.ts`: 16ファイル・310件成功。
- `pnpm --filter @sodashitsu/e2e exec playwright test src/specs/outbound-delegation.spec.ts`: 1件成功。別サーバーへの外向き接続、ブラウザのマシン一覧、端末への実入力と受信出力、委譲側サーバー再起動後の入力を確認。画面 `/tmp/outbound-delegation-browser.png` も目視確認。
- 負の対照からの復元後、ライフサイクルの2ファイル・3件も成功。
- 最初のE2Eは再起動直後の古いonline表示で入力して失敗したため、ブラウザが新しい端末SNAPSHOTを受信してから入力するよう修正した。
- Windows実機・外部ネットワーク・実際のTLSリバースプロキシは未検証。Linuxの2つの実サーバーで共通処理を検証した。稼働中サーバーへのhandoffは実施していない。

## 修正を外した負の対照

それぞれ修正箇所だけ一時変更して実行し、失敗を確認した後、元のbytesへ戻して一致を確認。TypeScriptの直接実行であり、ビルド済み成果物を使うE2Eではない。

### 起動時の委譲復元を外す

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-delegation

{"ts":"2026-10-16T23:59:15.894Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-16T23:59:15.895Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-16T23:59:15.896Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-JbQYNS/commands.json","count":0}
{"ts":"2026-10-16T23:59:16.331Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-16T23:59:16.332Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-16T23:59:16.332Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-nfNE9J/commands.json","count":0}
{"ts":"2026-10-16T23:59:16.957Z","level":"info","msg":"machine link closed","machine":"3f548466a03176cc19ead20cf28024df","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-16T23:59:17.485Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-16T23:59:17.485Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-16T23:59:17.485Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-nfNE9J/commands.json","count":0}
{"ts":"2026-10-16T23:59:17.803Z","level":"info","msg":"agent resume skipped","paneId":"724415f7-7207-407e-bc33-97e94e9bdf9e","reason":"no-session-ref"}
 ❯ |@sodashitsu/server| src/machine/delegation.integration.test.ts (2 tests | 1 failed | 1 skipped) 11991ms
   × restores delegated providers after server replacement without another invitation 11990ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/machine/delegation.integration.test.ts > restores delegated providers after server replacement without another invitation
AssertionError: expected 'reconnecting' to be 'online' // Object.is equality

Expected: "online"
Received: "reconnecting"

 ❯ vi.waitFor.timeout src/machine/delegation.integration.test.ts:206:85
    204|   cleanup.push(() => restarted.close());
    205|   await vi.waitFor(
    206|     async () => expect((await operator.request("machine.list")).machin…
       |                                                                                     ^
    207|     { timeout: 10_000 },
    208|   );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  08:59:13
   Duration  14.37s (tests 84%, transform 14%, import 2%)

```

### 無応答検知の閾値を45秒から99秒へ変更

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-delegation

 ❯ |@sodashitsu/server| src/machine/ReverseConnections.test.ts (1 test | 1 failed) 1071ms
   × terminates silent links on provider heartbeat timeout instead of waiting indefinitely for TCP close 1070ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/machine/ReverseConnections.test.ts > terminates silent links on provider heartbeat timeout instead of waiting indefinitely for TCP close
AssertionError: expected 'online' to be 'reconnecting' // Object.is equality

Expected: "reconnecting"
Received: "online"

 ❯ src/machine/ReverseConnections.test.ts:39:71
     37|   await vi.waitFor(() => expect(reverse.list().delegations[0]?.state).…
     38|   clock.advance(45_000);
     39|   await vi.waitFor(() => expect(reverse.list().delegations[0]?.state).…
       |                                                                       ^
     40|   await reverse.stop(id);
     41|   expect(reverse.list().delegations).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  08:59:28
   Duration  1.68s (tests 68%, transform 25%, import 7%)

```

### 不正ハンドシェイクのsocket終了時予約解除を外す

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-delegation

{"ts":"2026-10-16T23:59:54.798Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-16T23:59:54.799Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-16T23:59:54.800Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-EBjFcr/commands.json","count":0}
{"ts":"2026-10-16T23:59:55.246Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-16T23:59:55.246Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-16T23:59:55.247Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-Xlyvu6/commands.json","count":0}
 ❯ |@sodashitsu/server| src/machine/delegation.integration.test.ts (2 tests | 1 failed | 1 skipped) 11064ms
   × outbound-only provider is listed/routed without SSH, permits operations, reconnects, and can be revoked from either end 11063ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/machine/delegation.integration.test.ts > outbound-only provider is listed/routed without SSH, permits operations, reconnects, and can be revoked from either end
AssertionError: expected [ { …(4) } ] to deep equally contain ObjectContaining{…}

- Expected:
ObjectContaining {
  "id": "953588cec90c2c6f08bd1cbc753c677e",
  "state": "online",
}

+ Received:
[
  {
    "id": "953588cec90c2c6f08bd1cbc753c677e",
    "label": "No inbound PC",
    "message": "操作されるPCからの接続待ち",
    "state": "connecting",
  },
]

 ❯ vi.waitFor.timeout src/machine/delegation.integration.test.ts:139:65
    137|   await vi.waitFor(
    138|     async () =>
    139|       expect((await operator.request("machine.list")).machines).toCont…
       |                                                                 ^
    140|         expect.objectContaining({ id: grant.machineId, state: "online"…
    141|       ),

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  08:59:52
   Duration  13.42s (tests 83%, transform 15%, import 3%)

```
