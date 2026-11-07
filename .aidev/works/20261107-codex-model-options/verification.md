# Codexモデル候補のread-only adapter

共通型93ff677b（このtreeでは4d4e7f38）とaudio共通WS transport a398c263へ依存。dispatcher/refresh/cache/fetchedAtはUI担当が所有し、この変更は新providerだけ。

- 正式な既存所有daemonへtyped/runtime allowlistのinitialize/model/listだけを送る。会話ID・親proofはカタログ読取りに不要。新CLI/daemon/session/modelturnは起動しない。
- model/listのmodel/displayName/supportedReasoningEffortsを取得し、hiddenを外す。起動希望モデル、デフォルトeffort、説明文から候補を発明しない。
- 最大4page/512raw rows/2MiB、limit128/includeHiddenfalse、cursorの循環/異常を拒否。通信全体10秒、各request3秒以内、共通WS枠が使用中なら反復せずfallback。
- CLIが空配列を正式に返したらsourcecliの空配列を維持し、旧cacheを復活させない。
- 接続不可/不正/上限/daemon入替時はmodels_cache.jsonを実体の根・nofollow・通常単一link・所有者（OSが提供する場合）・2MiB以内・前後metadata一致で読み、source local-cacheと最新利用可否未確認のmessageを明示。account identityやmodel_messages等の本文は返さない。
- cacheも読めない場合はsourceunavailable、models[]。Windows等のlive transportが未実装でもcachefallbackは既存の安全なファイル経路を維持する。

[公式model/list](https://learn.chatgpt.com/docs/app-server#list-models-modellist)と導入0.166.0生成schemaを根拠とする。CLIから取得した一覧もupstreamのキャッシュ更新を強制したり、将来のモデル利用権を保証するものではない。

## 検証

専用worktree/Node24/専用依存、source/fixtures固定。

- 10tests pass（tests.log）：catalog専用methods、正式field/effort、pagination/hidden/dedup、CLI空、cache source、壊れrow/cursorloop/容量/row上限、daemon世代変更、cache symlink/oversize。
- 以前のcache-only動作を新adapter内で再現し、live取得の回帰がfailする負例→byteexact復元（negative.log/restoration.json）。実CLIへ送信しないfakechannelだけを使用。
- source復元後のforcebuild exit0（build.log）。最終server typecheckはテストfixture込み（typecheck.log）。最初のbuildと負例の時間が重なったため最初のbuildを採用せず、復元後forcebuildを最終とした。
- 固定compiled helperの実read-only取得1回：sourcecli、8候補、32.19ms、session/modelturn0（actual-metadata.json）。モデル名・account・実ID・本文・pathをレシートへ含めない。

common dispatcherとの結合・全体CIはrootが統合後に確認。既存の音声file/利用者pane/sr-pc/設定には触れていない。
