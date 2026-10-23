# sr-pcの実装ソース取り込みと保守手順

sr-pcのC:/git/sodashitsu（HEAD `59774c5ddbb5d9bd18c184da4243d4168f3dd22a`）から8ファイルの本文を取得し、取得前のSHA-256と照合した。mainの基点は `63fbd79e`（PR #185）。mainにはデスクトップ実装が既に入り、sr-pcの古いHEAD上ではM/??と表示されていた。

## 照合と採用

| ファイル | sr-pc SHA-256 | 扱い |
| --- | --- | --- |
| `packages/protocol/src/desktop.ts` | `38b03feec574ccb86b0b8d0eff4a9a2b49cab101857505f5155a6f9695e6b820` | mainとバイト一致（PR #185反映済み） |
| `packages/server/src/desktop/DesktopProvider.ts` | `71f8797321d0eb021bc4c101c08682aea84d521f34d2ec0e34325d1c8bfa6b2d` | コメントだけ異なるためmainを維持 |
| `packages/server/src/desktop/DesktopRelay.ts` | `8a245b8ee9f1924790c0ba9e110b5112c54116578f49d609b08ee0b9bf634aea` | sr-pcは終了理由の処理が古いため新しいmainを維持 |
| `packages/server/src/machine/DelegationPairing.ts` | `586fc13ade826ec95c6b3b71290006a7f5eaf59e83cf5662c4348323a333a82d` | 改行をLFへ統一して診断処理を取り込み。例外の自由文面は除外し、通信コードだけ表示 |
| `scripts/remote-desktop/WindowsDesktopHost.cs` | `9c389e073c552d8629b176815b9434202f7f9fa62117fac6f18732c4f12e3391` | mainとバイト一致（PR #185反映済み） |
| `scripts/remote-desktop/WindowsDesktopUnlock.cs` | `324a6e87f3ed7aa08988c0e603e43a2594d9ca0545990fbea5fc103302583e4d` | mainとバイト一致（PR #185反映済み） |
| `scripts/remote-desktop/windows-helper.ps1` | `0fcbda9dc2b795cd58187dda690318ec506e7e0cd2b8d4d6773997742df22c0e` | mainとバイト一致（PR #185反映済み） |
| `packages/server/src/desktop/unlockFailure.ts` | `428b5cb935034604f7f59fbada9b3cd5e96517e4ad954807ca18f4309677b701` | mainとバイト一致（PR #185反映済み） |

二重に旧版へ戻さず、未反映だったDelegationPairingのHTTP/通信診断だけを取り込んだ。バックアップ本体・ログイン情報・実行時設定は取り込んでいない。`.gitignore`はルートの`.soda/maintenance-backups/`だけを除外する。通常の実装ファイルを除外しないことも`git check-ignore`で確認した。

`docs/remote-desktop.md`へTS/CS/PowerShellの用途、起動時コンパイルとdistの違い、サービスの更新、dirtyな接続先からの取り込みとmainの更新手順を追記した。sr-pc自体の更新・差分削除は今回行っていない。

## 検証

- `pnpm build`: 成功。
- `pnpm typecheck`: 成功。
- DelegationPairingの実ソケット試験: 4件成功。HTTP 503の本文/理由句を表示せず状態コードだけを返すことと、接続拒否のECONNREFUSED表示を検証。
- 初回の単体実行は、新しいworktreeにprotocol/distが未生成だったためsuite読込で失敗。依存をビルド後に成功。
- machine関連テスト: 14ファイル・101件成功。
- `pnpm smoke`: 成功。
- UI/CSの変更はないためブラウザE2EとWindows nativeの再実行なし。
- 別コンテキストreview_transferによる全体レビューとgitignore追加の再確認: 指摘なし。

## 回帰の負対照

DelegationPairing.tsだけをHEADの旧版へ戻し、新しい2件を実行。両方とも失敗した。修正版をバイト単位で復元・照合した。生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-source-maintenance

 ❯ |@sodashitsu/server| src/machine/DelegationPairing.test.ts (4 tests | 2 failed | 2 skipped) 32ms
   × reports a rejected HTTP upgrade promptly without response text or credentials 24ms
   × reports a refused transport by code 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/machine/DelegationPairing.test.ts > reports a rejected HTTP upgrade promptly without response text or credentials
AssertionError: expected '申請が終了しました。接続先・TLS・有効期限を確認して再申請してください' to contain 'HTTP 503'

Expected: "HTTP 503"
Received: "申請が終了しました。接続先・TLS・有効期限を確認して再申請してください"

 ❯ src/machine/DelegationPairing.test.ts:79:26
     77|   const result = await provider.request(`http://127.0.0.1:${addr.port}…
     78|   expect(result).toBeInstanceOf(Error);
     79|   expect(result.message).toContain("HTTP 503");
       |                          ^
     80|   expect(result.message).not.toContain("private");
     81|   expect(provider.list().requests).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/machine/DelegationPairing.test.ts > reports a refused transport by code
AssertionError: expected [Function] to throw error including 'ECONNREFUSED' but got '申請が終了しました。接続先・TLS・有効期限を確認して再申請してください'

Expected: "ECONNREFUSED"
Received: "申請が終了しました。接続先・TLS・有効期限を確認して再申請してください"

 ❯ src/machine/DelegationPairing.test.ts:92:80
     90|   const provider = new DelegationPairing({ invite: vi.fn(), changed: v…
     91|   cleanup.push(() => provider.close());
     92|   await expect(provider.request(`http://127.0.0.1:${addr.port}`, "Offl…
       |                                                                                ^
     93| });
     94|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 2 skipped (4)
   Start at  15:36:42
   Duration  859ms (transform 72%, import 23%, tests 4%, worker 1%)


```
