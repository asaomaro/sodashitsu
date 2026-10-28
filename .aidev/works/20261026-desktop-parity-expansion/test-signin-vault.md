# 7B2b 検証記録

Base main99c5f60e314c9db9d5acdad78e1b6ebbe1000c50。読取helperとNode private child adapterを準備し、serviceへは接続しない。新規保存/ACL修復/サービス起動/鍵登録を行わない。

Native/taskcheck: owner固定path、SYS primary、機密ACL、read-only held handleと前後の同一性検査、buffer消去を点検。現時点mustなし。stdoutはNodeのprivate pipeで受ける契約と、helper側pipe type検査を追加。Node差分の独立点検は後続。

LocalMachine指定Unprotectの引数だけで、同一user/同一entropyのCurrentUser blobが必ず拒否されるとは仮定しない。生成データで実APIの結果を観測し、scope引数ではなくSYSTEM gate/機密ACL/用途とowner/strict schemaを必須とする。alternate-scope retryは実装しない。既存CurrentUser keyの別用途entropyとowner不一致は別に検証する。

Source build/unit、Windows生成検証、負例・独立最終点検は実行後に追記する。実SYSTEM readerとして起動せず、実enrollment/サインイン状態/画面にはアクセスしない。
