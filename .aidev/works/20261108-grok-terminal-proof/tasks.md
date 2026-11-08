# Tasks

- [x] 正式finished attemptとnamespace/全EOF private proofの実装
- [x] parent/child safe open・4physical/close・512MiB上限の生成回帰
- [x] Native getter/compose history collector接続（current/旧grant不変更）
- [x] 生成NativeService/認証WS child-only本文・tokens/cost結合
- [x] production参照build/最終fixture型/旧guard負例とbyte exact復元
- [ ] 独立review（root/backend）

壊れやすいtaskcheck: provider lifecycle、namespace/EOF/fresh、safe opener/lease、API用途選択/数値scope/compose配線。文書は最終cross。source固定0668dfe6、テスト追加6146890e。production build0、実source/選択fixture strict型0、生成WS fixtureの公開production API宣言に対する型0、復元後6 suites51 PASS。独立review待ち。
