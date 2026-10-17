# 検証結果

- `pnpm build`: 成功。
- `pnpm typecheck`: 成功。
- 関連Vitest: 21ファイル・383件成功（machine、WS、CLI引数/skill、protocol、Web StoreAdapter/MachineWiring、TUI controls/machines）。
- Playwright `outbound-delegation.spec.ts`: 2件成功。JSON招待による既存の操作・再起動復元と、コード交換によるWeb通知・入力確認・通知消去・接続成立をブラウザDOMで検証。
- TUIの通知は実アプリの描画出力で、コード表示・消去を確認。
- SSHの既存MachineLink/Manager/接続テストも上記に含む。
- 稼働サーバーへのhandoffなし。Windows実機・外部TLSプロキシは未検証。

## 試行制限の負の対照

独立レビューで、5回誤答時のterminate後も同一TCPバッチ中のWSフレームが処理される問題を発見。入口のreadyState検査と、5回到達時のbusy確定で修正。実WSのcork/uncorkで5誤答+正答を送るテストを追加。修正だけ一時除去して次の失敗を確認し、元のbytesへ復元して一致を確認。直接TSを実行するテストであり、ビルド成果物には依存しない。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-delegation

 ❯ |@sodashitsu/server| src/machine/DelegationPairing.test.ts (2 tests | 1 failed | 1 skipped) 20ms
   × ignores buffered frames after the fifth wrong guess terminates a request 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/machine/DelegationPairing.test.ts > ignores buffered frames after the fifth wrong guess terminates a request
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "Buffered guesses",
    ]


Number of calls: 1

 ❯ src/machine/DelegationPairing.test.ts:64:22
     62|   socket.uncork();
     63|   await closed;
     64|   expect(invite).not.toHaveBeenCalled();
       |                      ^
     65| });
     66|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  09:40:31
   Duration  523ms (transform 72%, import 23%, tests 4%, worker 1%)

```
