# 終了history Cursor先行 runtime検証

Source: fc56478a（依存は7785881b/b882025f/2adae5fa/d787300a/c416f4f7/dfd514d4/465e76ed/37530cee）、docs-only bb4dc23c。base86192d93。Grok後続は別treeで作業し、この固定Cursor sourceへ混在しない。

- Node24.22.2 PATH/8GiB検査heapでproduction `pnpm exec tsc -b packages/server` exit0。fresh treeのclient-core/TUI/desktop参照distも生成。raw history-production-build.log。
- 初回surface/compose試行はclient-core dist欠損でimport段階停止し、実テスト未実行。bootstrap後の認証WS結合を含む最終6suites38tests PASS。raw history-restored-final.log、exit0 history-test-receipt.json。
- Protocol full typecheck exit0、history-protocol-types.log。
- 新Service/collector/adapter/Cursor key test/surface test/生成compose fixtureを含む最終strict test-inclusive対象型 exit0。実設定tsconfig.runtime.json、history-types-final.log/receipt（sourceHEADbb4、Node24）。全repo suite/Web buildは重複実行しない。

## 負例と復元

5ケース・4製品source。entry selector除去、private current除去、Cursor file revision key除去、post-auth check除去、composeを861へ戻す旧配線。各新回帰は期待失敗し、finallyで全bytes復元。raw negative-history-*.log、4source SHAを含むhistory-restoration.json。復元後に38tests再PASS。先行collector stale grant2回帰の旧sourcefail→byteExact復元13PASSも保持。

## 実行した範囲

実packaged hook＋偽Cursor一度のSessionStart→専用child report IPC→正式DB lineage/child terminal→private binding→認証WS history一覧→entryId付きhistory transcriptまで、一時HOME/一時サーバで結合。本文の生成発言表示、未知entry拒否、後からchildfileが変われば旧選択拒否、親数値/current count不変を確認。新親/child actual conversationを呼ばず、通常server/pane/モデル/Windows/認証設定0。偽CLIであることを実Cursor稼働成功とは混同しない。

Historyはcurrent APIから独立。entryIdが失効した場合も現在の同IDへfallbackしない。Cursor数値は既存unavailable、親利用量を代用しない。metadata更新後も古い許可closureを保持しない。認証/親source/instance/ref/proof/current/record revisionを再照合し、owned fdは必ずclose。4 physical verifier/4caller tasksを実終了まで保持、caller2s/verify1500msを維持。

## 未完

UIは別担当の専用子会話窓へ接続中。Cursor current alive取得は未接続。Grokは別unitの正式attempt/parent namespace/EOF proof待ち。他providerのこの新終了collection producerは未接続で、既存current閲覧/grantを削除していない。終了collectionをactive件数や分析集計へ混ぜない。独立reviewへ提出し、main配布/実CLI検証完了とは記録しない。
