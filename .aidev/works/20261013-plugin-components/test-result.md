# 検証結果

- `pnpm build`: 全パッケージ成功。最終Web差分も `pnpm --filter @sodashitsu/web build` 成功。
- `pnpm typecheck`: 全パッケージ成功。
- `pnpm exec vitest run packages/web`: 195ファイル・3549テスト成功。
- 最終の関連テスト（部品境界・SDK・Registry・Font・DisplayFrame）: 5ファイル・88テスト成功。
- 実ブラウザE2E `plugin-components.spec.ts`: 2件成功（ライブ出力/専用入力/read-only/clip/visibility/mobile/dispose、別tab背景端末/reconnect/close）。
- プロジェクト外cwdから起動確認: `node /tmp/sodashitsu-plugin-components/packages/server/dist/smoke.js`、PASS。
- 初期のE2E不合格は、worktreeの依存リンクが元repoのWeb配布物を参照したこと、モバイル既存sheetを開く操作不足、offline設定だけでWSが切れない試験手順が原因。依存リンクをworktreeへ向け、sheetを開き、WSの切断・接続拒否/再許可で検証した。

## 負の対照（生出力）

購読済みでもsubscribeする変更、およびmirrorもisVisible扱いする変更をそれぞれ一時的に戻し、対象の回帰テストだけを実行した。両方失敗し、finallyで製品ファイルをバイト一致復元。

### snapshot

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /tmp/sodashitsu-plugin-components

 ❯ |@sodashitsu/web| src/term/TerminalRegistry.test.ts (40 tests | 1 failed | 39 skipped) 45ms
   × adding a second mirror initializes it without resetting base scroll/selection or the first mirror 44ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/term/TerminalRegistry.test.ts > adding a second mirror initializes it without resetting base scroll/selection or the first mirror
AssertionError: expected [ [ 'pane.subscribe', …(1) ], …(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   [
+     "pane.subscribe",
+     {
+       "paneId": "agent",
+       "scrollbackLines": 1000,
+     },
+   ],
+   [
+     "pane.subscribe",
+     {
+       "paneId": "agent",
+       "scrollbackLines": 1000,
+     },
+   ],
+ ]

 ❯ src/term/TerminalRegistry.test.ts:630:26
    628|    registry.onOutput('agent',new TextEncoder().encode('after-barrier')…
    629|    await new Promise<void>(resolve => base.term.write('',resolve));
    630|    expect(conn.requests).toEqual([]);
       |                          ^
    631|    expect(base.term.buffer.active.viewportY).toBe(position);
    632|    expect(base.term.getSelection()).toBe(selection);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 39 skipped (40)
   Start at  18:49:49
   Duration  1.43s (transform 68%, import 17%, environment 12%, tests 4%)

```

### notify

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /tmp/sodashitsu-plugin-components

 ❯ |@sodashitsu/web| src/term/TerminalRegistry.test.ts (40 tests | 1 failed | 39 skipped) 28ms
   × a read-only mirror keeps LRU ownership but does not automatically mark background notifications seen 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/term/TerminalRegistry.test.ts > a read-only mirror keeps LRU ownership but does not automatically mark background notifications seen
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/term/TerminalRegistry.test.ts:648:45
    646|    const {registry}=makeRegistry({capacity:1});
    647|    const off=registry.attachMirror('background',{onOutput:vi.fn(),onSn…
    648|    expect(registry.isVisible('background')).toBe(false);
       |                                             ^
    649|    registry.acquire('foreground');
    650|    expect(registry.get('background')).toBeDefined();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 39 skipped (40)
   Start at  18:49:51
   Duration  1.31s (transform 67%, import 18%, environment 13%, tests 2%)

```

