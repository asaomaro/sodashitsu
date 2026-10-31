# Verification

- main 8c03db9d（PR339）を取り込み済み。build/typecheck成功。
- 集計/Schema/隔離fake CLI/RPC/auth/UI targeted tests成功。最後のreview修正対象5files46tests成功。
- 初回全体vitest: 908files pass、13149tests pass、1skip。App.testがasync DashboardViewの同期描画を期待したため失敗し、描画row待ちに修正（対象再実行pass）。review中のsource変更でpty freshness checkがdist staleと判定したため、source freeze後buildから再実行する。
- 負例は[negative-control.md](negative-control.md)に生出力を記録。実WTを変えない隔離copyに修正前の2か所だけ戻し、どちらも対象のassertionで失敗・復元copy SHA一致を確認。
- ローカル実WSブラウザ: legacy token URLが401だったためcookie方式へ修正。正規cookieでも機能操作前の接続中/最初のscreenボタン待ちで停止。生成RPC描画専用ケースも同じ初期停止。追加のbaseline切分けを繰り返さず、専用hosted workflowで検証する。
- browser workflowはgenerated logs/fake CLIと生成RPCだけを使用し、実モデルの呼出なし。desktop/narrow screenshotsとtraceを別outputに保持する。

最終freeze HEAD7296dcee（main PR340を含む）でbuild/typecheck成功。全体vitestは910files / 13,157testsすべて成功（365.58秒）。

Hosted run41153629630ではbuild/対象unit成功、生成RPCの実Vueブラウザ検証が1.7秒で成功し、desktop/narrowスクリーンショットを取得。rootでも配色・折返し・controlsを目視確認した。actualWSもメニュー・遅延読み込み・履歴・記録更新まで通過し、レポートエージェント選択のテストlocatorだけが不一致で失敗した。implicit labelにはoption文字列も含まれるためexact labelからcomboboxの役割と名前の先頭一致へ修正し、hostedを再実行する。

スクリーンショットartifact: usage-analytics-browser（run41153629630）、download `/tmp/soda-usage-analytics-browser-first/generated/usage-analytics-ui-generat-9bb46-t-desktop-and-narrow-widths/`。日別多数の棒の最新側を初期位置にする等の密度改善は任意follow-up（今回のmustではない）。


## 最終結果

ソースfreeze後の `pnpm build`・`pnpm typecheck` は成功。全体試験の生の集計:

```text
 Test Files  910 passed (910)
      Tests  13157 passed (13157)
   Start at  10:05:59
   Duration  365.58s
```

[Hosted run41154436680](https://github.com/asaomaro/sodashitsu/actions/runs/41154436680) は全段階成功。対象unit8files/39tests、実WS＋偽Claude CLIレポート7.8秒、生成RPCの実Vueブラウザ2.4秒。ブラウザが送る要求、描画数値、モデル呼出が明示操作時だけであること、選択期間payload、更新、狭幅のoverflowを検証した。実モデル/利用者の作業agentは呼んでいない。

成功artifactは `usage-analytics-browser`。download先 `/tmp/soda-usage-analytics-browser-success/` のactual/generated双方にdesktop/narrowスクリーンショットがある。画像を実際に開き、モデル構成・セッション比較・入力出力cache積み上げ・数値付き時刻帯heatmap・狭幅の折返しを確認した。rootも生成側画像を独立目視確認済み。

テストlocatorの1行修正後、productソースに変更はない。最終の追加commitはこの検証記録だけで、PRのexact-head CIを再確認して着地する。
