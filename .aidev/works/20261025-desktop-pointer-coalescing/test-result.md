# 検証結果

- pnpm build: 成功。
- Web / E2E typecheck: 成功。
- 関連unit: 4 files / 23 tests passed。
- 実ブラウザ remote-desktop-input / native-video: 6 passed / 実画面benchmark 1 skipped（明示指定が必要）。
- ブラウザの送信フレームで200 moveを最新move+keydown+keyupの3件に集約。blur前の保留moveはrelease後に送られない。Ctrl+Space、IME修飾キー回復、Esc、全5ボタンと同時押しの既存検証も通過。
- pnpm smoke: PASS。
- 独立レビュー: 製品コードの修正必須指摘なし。input unit 10件を別コンテキストでも実行。
- 実OSへの入力、実機の入力→画面反映時間は今回未測定。単独moveに最大1描画周期の待ちが加わる点を含め、体感全般の改善とは区別する。

## Negative control

submitだけを従来どおり即時全件sendへ戻し、burst回帰試験が実行時に失敗した。production sourceはtry/finallyでbyte一致へ復元した。

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-input

 ❯ |@sodashitsu/web| src/desktop/input.test.ts (10 tests | 1 failed | 9 skipped) 19ms
   × bounds a burst of 1000 pointer moves to one latest coordinate per browser frame 17ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  21:55:06
   Duration  713ms (environment 75%, transform 14%, import 4%, tests 4%, worker 3%)


(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/input.test.ts > bounds a burst of 1000 pointer moves to one latest coordinate per browser frame
AssertionError: expected [ { kind: 'pointer', …(4) }, …(999) ] to have a length of +0 but got 1000

- Expected
+ Received

- 0
+ 1000

 ❯ src/desktop/input.test.ts:19:18
     17|   const f = senderFixture();
     18|   for (let i = 0; i < 1000; i++) f.sender.submit(move(i / 1000));
     19|   expect(f.sent).toHaveLength(0);
       |                  ^
     20|   expect(f.frames.size).toBe(1);
     21|   f.tick();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```
