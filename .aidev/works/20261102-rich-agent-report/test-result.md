# 検証結果

## 回帰テストの負の対照

全文details追加と可読text変換だけを元に戻し、対応する回帰テスト2件が失敗することを確認。元のファイルをbyte単位で復元し、一致を確認した。生の出力は [negative-control.log](negative-control.log)。復元後に全体ビルドを実行。

## 最終検証

- 全体ビルド: pass（HTML保存グリッドの目視修正後に再ビルド）。
- 関連unit: 24件、互換性追加後17件、実数値metricsの5件がpass。
- Chromium E2E: 1件pass。新グラフ・比較の金額・生成ボタン・4区画のHTML・HTML保存・390pxと1440pxをブラウザDOMと要求で確認。長い担当名の折返しをスクリーンショットで目視。
- 起動smoke: PASS。一時サーバで端末の描画・入力のPTY往復を確認。インストール済みChromiumのパスだけを差し替え、元のassertionは維持。
- 単一HTML: 1440px/light・390px/darkで4カードと4指標を確認、横溢れなし、scriptなし。目視で空白の多い列配置を修正後、再確認。サンプルはartifacts/agent-analysis-report-preview.html（架空のデータであると明記）。
- 稼働サーバ: handoffで5実行端末を保持。7paneのIDを前後比較して全件保持。実ブラウザで旧画面なし・比較へ統合・生成画面あり・画面遷移時のモデル呼出0を確認。
- 最終型検査: pass。
- 全体テスト: 953ファイル中951pass・1skip、13,592件pass・1skip。既存UsageInsights.test.tsの容量回復1件が5秒時間切れ。ファイル単独再実行は18件全てpass（3.46秒）で再現なし。ソース・時間上限の変更は行っていない。全体成功とは記録しない。

UI E2Eは生成したRPC結果、CLIレポート互換性は隔離したfake CLIで検証。実際の有料モデルは検証で起動していない。

## 全体テストの時間切れ（生の出力）

```text
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


 Test Files  1 failed | 951 passed | 1 skipped (953)
      Tests  1 failed | 13592 passed | 1 skipped (13594)
```

単独再実行の生の結果:

```text
 /workspaces/sodashitsu-main-live-assistant-agents


 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  12:46:00
   Duration  3.46s (tests 80%, transform 16%, import 4%)
```
