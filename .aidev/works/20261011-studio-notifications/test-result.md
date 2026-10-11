# 検証

- Node: 12テスト成功（モデル9、通知3）。
- 最終関連Vitest: 331テスト成功。server期待条件の一致/別ペイン/キュー中tab・PJ・instance・name変更、CLI構文、既存prompt、拡張起動を含む。
- build/typecheck成功。
- 新規通知と自動依頼のE2E2件成功。実sodactl（隔離した認証キャッシュ）と偽Claude/Codexを実PTYで動かし、利用者ブラウザ受信の出力とDOMで判定。
- 作業フォルダ外からのsmoke成功。
- 全体Vitest: 557ファイル、10,407成功/1失敗（295.27秒）。失敗は拡張envのSODA_SERVER_URL未設定を期待した旧仕様テスト。自サーバURL注入へ仕様変更したので、秘密変数の未設定確認と実際の待受URL一致へ期待値更新。対象の実子プロセス統合スイートを再実行する。
- E2Eの初回は試験セレクタが無いclassを参照、次はlabel完全一致で工程選択が見つからずタイムアウト。通知自体のDOMと実CLI→PTY出力は成功。実フォームのnameを指定して修正。製品コードへの変更なし。

## 負の対照

サーバの書込み直前の期待条件チェックだけ除去して対象回帰テストが失敗することを確認。finallyでbyte一致復元後build成功。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/surface/methods/agent.test.ts (25 tests | 4 failed | 21 skipped) 10ms
   ❯ agent.prompt expected scope (5)
     × refuses tab changes while queued before writing 7ms
     × refuses project changes while queued before writing 1ms
     × refuses instance changes while queued before writing 1ms
     × refuses name changes while queued before writing 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > agent.prompt expected scope > refuses tab changes while queued before writing
 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > agent.prompt expected scope > refuses project changes while queued before writing
Error: expected an error, got {"agent":{"instanceId":"a1","kind":"claude","label":"Claude Code","state":"idle","completionSeq":0,"serverSeenSeq":0,"verified":true,"since":1000,"name":"task-one"}}
 ❯ errorCode src/surface/methods/agent.test.ts:68:24
     66|
     67| function errorCode(result: Awaited<ReturnType<ReturnType<typeof setup>…
     68|   if (result.ok) throw new Error(`expected an error, got ${JSON.string…
       |                        ^
     69|   return result.error.code;
     70| }
 ❯ src/surface/methods/agent.test.ts:275:10

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > agent.prompt expected scope > refuses instance changes while queued before writing
Error: expected an error, got {"agent":{"instanceId":"replacement","kind":"claude","label":"Claude Code","state":"idle","completionSeq":0,"serverSeenSeq":0,"verified":true,"since":1000,"name":"task-one"}}
 ❯ errorCode src/surface/methods/agent.test.ts:68:24
     66|
     67| function errorCode(result: Awaited<ReturnType<ReturnType<typeof setup>…
     68|   if (result.ok) throw new Error(`expected an error, got ${JSON.string…
       |                        ^
     69|   return result.error.code;
     70| }
 ❯ src/surface/methods/agent.test.ts:275:10

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > agent.prompt expected scope > refuses name changes while queued before writing
Error: expected an error, got {"agent":{"instanceId":"a1","kind":"claude","label":"Claude Code","state":"idle","completionSeq":0,"serverSeenSeq":0,"verified":true,"since":1000,"name":"renamed"}}
 ❯ errorCode src/surface/methods/agent.test.ts:68:24
     66|
     67| function errorCode(result: Awaited<ReturnType<ReturnType<typeof setup>…
     68|   if (result.ok) throw new Error(`expected an error, got ${JSON.string…
       |                        ^
     69|   return result.error.code;
     70| }
 ❯ src/surface/methods/agent.test.ts:275:10

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 21 skipped (25)
   Start at  13:43:58
   Duration  969ms (transform 81%, import 17%, tests 1%)


```

旧サーバ互換性修正後、checked-onlyの必須expect/委譲の回帰テストと通知E2Eを再実行し成功。型チェック成功。既存E2E4件成功。

拡張統合スイート全体の単独再実行はexit 137で中断（原因未特定）。初回全体テストで他25件は成功済みのため、期待値を修正した環境変数の1件だけを再実行し成功。製品コードへの追加変更なし。

配布物: release/yukkuri-studio-0.4.1.sodaplugin。SHA256: 7e503a8055eb1c9520326f53693b7ae080b8bbe0f061d33857176470f23d5000。

導入: soda handoffで既存5ペインを全て保持。/workspaces/yukkuri-workへ0.4.1をinstall/enableしext reload成功。PJ拡張は承認none/pending（command変更によりブラウザの再承認待ち）。既存制作IDとskillDirを保持。実制作への通知テストは行わず、実CLI+実PTYの隔離E2Eで検証した。
