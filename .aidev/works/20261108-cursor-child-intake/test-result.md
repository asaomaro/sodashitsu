# Cursor(b) 最終検証

最終baseは08b9c752。自己3commitsだけを0367584b/57710a35/8c07ba02へrebaseし、composeの閉鎖3箇所でsubagentUsage.closeとcursorChildObservations.closeを双方保持した。send/control/usage登録、NativeReader/current kindgate/sharedresolverは変更しない。

- Node24.22.2を全pnpmコマンドのPATHへ明示。
- 6suites111tests PASS、exit0。positive-final.log。Reports/Observations/Socket/Installer/実packaged hook/生成compose結合を含む。
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc -b packages/server` exit0。build-final.log。参照graphもfreshbaseで生成。serverの新Reports/Observations js/d.tsの存在を確認。host/Web buildや全体testsは重複実行しない。
- 初期対象strict型exit0、typecheck-final-targeted.log。
- compose生成結合fixtureもtsconfig.targeted.jsonへ追加した最終strict/test-inclusive対象型exit0、typecheck-final-integration.log。production runtimeは検査中不変。

初期7負例のraw/restoration.jsonを保持。Reports/hook/Installerの復元SHAは現sourceと一致。Observationsは順序fixの旧d336で2fail→byteExact復元15pass（negative-same-child-order.log/order-restoration.json）、次file世代fixの旧b563で新回帰fail→byteExact復元16pass（negative-child-file-generation.log/file-generation-restoration.json）を保持し、最終Observations SHAは後者と一致。composeの旧配線負例は初期baseで取得済み、今回の差は両APIのclose合流だけ。現6suite結合を再実行し、消えた旧/tmp成功を捏造/流用していない。最終source SHAはfinal-source-sha.json。

同childのAAR→Stopは受信順で処理、別childは最大2並列。Stop後の同record世代の遅延AARは無視、新record世代の正当self AARは旧terminalを退役し設定だけを更新する。Stopに自己設定報告が無ければ旧設定を勝手にclearしない。parent common設定から子設定を作らない。

この段階はprivate intake/binding/getterまで。終了history RPC/intake、Grok正式attempt proofは後続未完。Cursor current所属/稼働は未取得のまま。実CLI自身のhook発火/実モデル/Windows/ユーザー会話0で、生成fixtureを実取得成功としない。root独立reviewへ提出。
