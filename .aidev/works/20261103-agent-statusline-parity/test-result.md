# 検証結果

- `pnpm typecheck`: 最終変更後も成功。
- built server smoke: 作業フォルダ外の`/tmp`から実行し成功。実ブラウザの自動ログイン・端末表示・入力往復・onboarding後の入力まで確認。Chromiumのみ既設パスを明示。
- `pnpm build`: 成功。Viteの既存の大きいchunk警告あり。
- 関連サーバー検証: 7 files / 50 tests 成功。全体実行で落ちたUsageInsightsも単独実行では成功。既存Claudeの実PTY・実包み統合も継続成功。
- Web関連: 3 files / 166 tests 成功（設定・ダッシュボード・pane情報）。
- Playwright: `usage-statusline-metadata.spec.ts` 1件成功。実ブラウザDOMで残量123.5、progressbar無し、未取得の誤表示無しを確認。スクリーンショットも目視確認。応答は生成数値を使い、収集側は別のsocket/adapterテストで検証。
- negative control 3件: 修正箇所のみ戻すと各テストが失敗、復元はbyte-identical。生出力は `negative-controls.md`。
- Native Muse: 自作echoセッションへの`view/page`成功（17 events、tokenUsageを含む）。モデルturn・resume・attachなし。
- Native Copilot: 認証whitelistの有無それぞれでcustom statusLineが実行。本文を送らず捕捉。契約quotaは入力に無し。cache内包が未確認のraw inputは共通disjoint入力に正規化しない。
- Muse allowance: 実環境はschema v1 / allowance:null / server_sent_no_usage。値がある場合、実epoch-msとover-quotaを生成fixtureで確認。

## 全体テストの生出力（失敗部分と集計）

前回作業でも発生しているUsageInsightsのページ容量/待機テスト1件。単独再実行では成功。全体全件成功とは記載しない。

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/usage/UsageInsights.test.ts > recovers from page-capacity exhaustion and continues the file without a permanent RPC failure
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/usage/UsageInsights.test.ts:86:1
     84|  expect((await f.reader.read(range)).sessions[0]).toMatchObject({role:…
     85| });
     86| it('recovers from page-capacity exhaustion and continues the file with…
       | ^
     87|  const f=await fixture({maxPages:32,maxBytesPerKind:4096}),file=join(f…
     88|  await writeFile(file,json(...Array.from({length:500},(_,i)=>usage('re…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 957 passed | 1 skipped (959)
      Tests  1 failed | 13645 passed | 1 skipped (13647)
   Start at  00:50:02
   Duration  209.93s (tests 60%, transform 18%, import 16%, environment 6%)


```

実ログ: `/tmp/soda-statusline-{build,full-test,final-focused,web,e2e}.log`。資格情報やnativeの私的payloadは収録しない。
