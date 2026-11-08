# 終了子の専用会話 UI 検証

製品固定 bf980324、最終 fixture-only 0e2e2d16。API契約は元7785881b/c416f4f7（本treeの6c5b8c63/068bfa33は重複依存）。実モデル・Windows・利用者記録・OS clipboard操作は0。

## 結果

- core関連3file: 31 pass（empty-restored.log）。Web関連6file:370 pass、TUI関連5file:215 pass（restored-*.log）。最終fixture修正後ContextMenu単体47 pass。
- core build0、変更core6file対象strict型0、TUI test-inclusive package型0。Web test-inclusive package型0（final-web-type-corrected.log/type-results.json）。
- 生成RPCのみの実Chrome/Vue/DOM:4テーマ、390px、focus、全終了menu入口、同window選択、exact entry本文/usage、失効消去、親下書き準備send0/checked明示send1を確認。current fallback0・control/child-send0・Infoに会話なし・active snapshot不変。final-browser.log/browser.json/PNG参照。
- 初回core型7件（helper引数の旧object literal互換）、Web型3件（fixture/closure narrow）と最終Web型1件（fixture verified欠測）はそれぞれdf795adf/0e2e2d16で修正。失敗raw logを残し、最終型結果と区別した。

## 負例と完全復元

negative.pyは自作sourceのみをgit-common-dir recoveryへbytes/SHA保存しfinallyで復元。guard/入口の旧動作でcore7fail・Web7fail・TUI5fail、誤ったcurrent経路への置換でWeb/TUI各1fail、旧menuによる実browser失敗を確認。11runtimeの前後SHA一致はrestoration.json。復元後core30/Web370/TUI215/同browser0。

空pageでもmore:trueなら『履歴なし』としない追加回帰は旧f376 readerで1fail、empty-restoration.jsonのSHA一致復元後core31pass。本文/利用量をcurrentへfallbackしない契約と、履歴のpending/unavailableをゼロにしない意味を検証した。

## 範囲・残件

これは生成fixtureによるUI/route/scope検証で、各CLIの実終了記録を取得した主張ではない。provider正式binding/collector/RPC配線・実測はAPI担当の別単位、非提供provider/旧peerはunavailable。終了履歴はactive/footerへ加算せず、Infoへ会話を戻さない。履歴からの子直接入力は提供せず、親へのchecked下書きのみ。最終独立レビューはagent_audio_backendが12c74ba5まで照合し、追加must/should無しで完了。
