# 公開HTTPSアクセスの設定と検証

ユーザー指定: WSLの現行Sodashitsuを、同じLANのPCから操作委譲の接続先にする。加えてモバイルは携帯回線から利用。公開HTTPS方式を選択。

Cloudflared 2026.10.1を公式GitHubリリースのasset.digestと照合して導入。ユーザーsystemdサービスで外向きHTTP/2トンネルを起動。ルーター・Windows Firewallの開放、CA信頼ストア変更は行っていない。Quick Tunnelであり、再起動時にURLが変わる。状態ディレクトリpublic-access.jsonから現在URLを取得できる。

許可Originファイルと変更検知を追加。安全な通常ファイル・8KiB/32件の上限・HTTPS明示・壊れた場合追加分を拒否・CLI Origin維持。TLS前段HTTPのHTTPSログインCookieをSecureにし、成果物CSPへ明示HTTPSパスだけ許可。

独立レビューでask.localOnlyの起動時固定を指摘。動的判定、既存上限超えフォームの非表示、公開後は許可削除時にもunlimitedを再許可しないラッチを追加し、修正とCSPも再レビュー済み。阻害事項なし。

検証:
- pnpm build / pnpm typecheck成功。最終サーバーbuild成功。
- HTTP/WS/Origin/Ask関連: 7ファイル105件成功。ラッチ追加後の2ファイル43件も成功。
- 公開URL: 未認証/api/sessionは401、キャッシュ認証で204、不正Originのloginは403。認証済みWebSocketのhello成功。
- 公開machine-pairingへ実接続しpending受付、コードを使わずすぐ切断。マシン登録は作らない。
- 実ブラウザ390x844でHTTPS証明書検証あり・認証済みモバイルレイアウト表示を確認。/tmp/sodashitsu-public-mobile.png。
- handoffで8実端末を維持。更新前の全10ペインIDが更新後も残ることを公開WS経由で確認。
- 携帯回線の実端末からの接続は利用者の確認待ち。

## 負の対照

AskServiceの動的localOnlyをコンストラクターでbooleanへ固定する変更だけを一時挿入。動的制限と既存oversizeフォームの回帰テストが両方失敗した。元のbytesへ復元して一致を確認。TS直接実行テスト。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-delegation

 ❯ |@sodashitsu/server| src/ask/AskService.test.ts (42 tests | 2 failed | 40 skipped) 28ms
   ❯ AskService — ローカル起動の無制限（20261005-ask-local-no-limit） (5)
     × hides an existing oversized form after an external Origin is allowed 13ms
   × applies network media limits when an Origin is added after startup 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/ask/AskService.test.ts > AskService — ローカル起動の無制限（20261005-ask-local-no-limit） > hides an existing oversized form after an external Origin is allowed
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/ask/AskService.test.ts:782:41
    780|     expect(s.asks.get("b1","ask1").askId).toBe("ask1");
    781|     local=false;
    782|     expect(()=>s.asks.get("b1","ask1")).toThrow(/unknown or closed/);
       |                                         ^
    783|     expect(s.asks.subscribe("b1")).toEqual([]);
    784|     s.asks.dispose();await t.done;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/ask/AskService.test.ts > applies network media limits when an Origin is added after startup
AssertionError: expected { fileBytes: 8388608, …(7) } to not have property "unlimited"

- Expected:
undefined

+ Received:
true

 ❯ src/ask/AskService.test.ts:939:40
    937|   expect(s.asks.features().limits).toHaveProperty("unlimited",true);
    938|   local=false;
    939|   expect(s.asks.features().limits).not.toHaveProperty("unlimited");
       |                                        ^
    940| });
    941|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 40 skipped (42)
   Start at  10:42:47
   Duration  586ms (transform 72%, import 21%, tests 6%, worker 1%)

```
