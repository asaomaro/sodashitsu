# 検証

- Web build成功、全パッケージtypecheck成功。
- Web196ファイル3553テスト成功。最終関連6ファイル112テスト、実ブラウザE2E3件も成功。
- 実ブラウザ: 閲覧専用は送信しない、interactive端末→指定背景paneへ送信、source paneへ誤送信しない、操作前/終了後はreadonly、IME候補取消で操作継続、モバイルinsertText日本語とEnter送信。既存のclip/visibility/reconnect/disposeも確認。
- 初期E2Eの操作開始失敗は既存500msのengageGuardによるクリック保護。共通settleEngageで前提を作り、入力可能DOMを確認してから操作する。
- モバイルinsertTextはxtermのscreenReaderMode=trueでは送信されないため、interactive時は標準の入力端末と同じfalseへ変更し、送信フレームと別の出力端末の描画で検証。

## 負の対照（生出力）

IME除外とフロートの両経路の除外を一時的に戻すと、それぞれの回帰テストが失敗した。finallyで製品ソースをバイト一致復元。

### ime

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /tmp/sodashitsu-plugin-components

 ❯ |@sodashitsu/web| src/term/embeddedKeys.test.ts (1 test | 1 failed) 26ms
   × plain Escape exits the app, but IME cancellation and modified Escape remain terminal input 21ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/term/embeddedKeys.test.ts > plain Escape exits the app, but IME cancellation and modified Escape remain terminal input
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/term/embeddedKeys.test.ts:21:54
     19|     { key: "Enter" },
     20|   ])
     21|     expect(isEmbeddedAppEscape({ ...ev, ...patch })).toBe(false);
       |                                                      ^
     22| });
     23|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  19:14:46
   Duration  1.05s (environment 73%, transform 14%, worker 6%, import 4%, tests 4%)

```

### float

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /tmp/sodashitsu-plugin-components

 ❯ |@sodashitsu/web| src/components/DisplayFloat.test.ts (22 tests | 1 failed | 21 skipped) 111ms
   × embedded terminal IME Escape and modified Escape do not close the float in capture or bubbling 107ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/DisplayFloat.test.ts > embedded terminal IME Escape and modified Escape do not close the float in capture or bubbling
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 6 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "id": "a",
      },
    ]

  2nd vi.fn() call:

    Array [
      Object {
        "id": "a",
      },
    ]

  3rd vi.fn() call:

    Array [
      Object {
        "id": "a",
      },
    ]

  4th vi.fn() call:

    Array [
      Object {
        "id": "a",
      },
    ]

  5th vi.fn() call:

    Array [
      Object {
        "id": "a",
      },
    ]

  6th vi.fn() call:

    Array [
      Object {
        "id": "a",
      },
    ]


Number of calls: 6

 ❯ src/components/DisplayFloat.test.ts:404:33
    402|    prevented.preventDefault();input.dispatchEvent(prevented);
    403|  }
    404|  expect(controller.dismiss).not.toHaveBeenCalled();
       |                                 ^
    405|  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles…
    406|  expect(controller.dismiss).toHaveBeenCalledOnce();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 21 skipped (22)
   Start at  19:15:20
   Duration  5.13s (transform 75%, import 15%, environment 8%, tests 2%)

  Transform  |@sodashitsu/web| transforming modules took 3.62s · 75% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```
