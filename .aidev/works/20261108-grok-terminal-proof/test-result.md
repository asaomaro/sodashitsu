# Grok終了attempt/history検証

製品runtime固定0668dfe6、test-only6146890e。Cursor先行65df6571は441f4aa4として証跡のみ同期（root統合時は重複skip）。

- Node24.22.2 / 8GiBのproduction `tsc -b packages/server`: exit0。変更の無いTUI/desktopの派生cacheはgit package tree OID一致確認後にだけ利用、build-cache.json。
- 実sourceと5選択fixtureのstrict/exactOptional/noUnchecked/NodeNext型: exit0。
- 新認証WS fixtureは現production buildの公開宣言に対する契約型: exit0。copyの2相対importだけdistへ向け、実行しない。全server test-inclusive型の実行とは主張しない。元fixtureSHAと方法はfixture-api-types-receipt.json。
- 5負例すべて期待失敗。親revision、namespace再生成、Native fresh失効、512MiB子上限、旧compose（bb4dc23c）の配線欠落。
- 3製品sourceのbyteExact/SHA完全復元を確認し、6 suites / 51 tests PASS。restoration.jsonと生ログを保持。

生成NativeServiceと認証WS/fake Grok CLIで、終了後active count0のまま正式entry→子本文→子usage120/cost報告値を取得。親99999を転用しない。新attemptをappendした直後とNative catchup後の両方で旧selectionを拒否。fresh失効/unknown/missingattempt/partial/置換/forget/4physicalclose上限も検証。

実Grokモデル/認証/ユーザー会話、Windows操作は0。生成CLI記録の結合であり、実Grok終端の実取得成功とは区別する。Cursor numeric、他provider新終了collection、Claude即resume未解決、保護音声実機、署名IDD依存は未完のまま維持。旧current usage/B grantを変更せず、新history-only exacttargetでのみGrok ended usageを提供。

独立review(root/backend)は提出後の判定待ち。
