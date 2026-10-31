# 独立レビュー

- review_pointer: ZIP境界・descriptor/CRC/derived directories・output FileHandle physical closeの追加回帰、downloadのprivate TLS headers前/body途中取消、3OS workflowを点検。追加must/shouldなし。
- review_transfer: Cache/Files/CatalogおよびCache testsの独立cross。公開後destinationのdev/ino確認不足(must)とregular file hardlink(should)を修正。実rename差替えと外部hardlinkで回帰を追加し、delta再レビューで両方解消、追加指摘なし。
- root ownership/ACLのcapability提供は呼出側の明示前提。この段階は準備基盤のみでGUIを起動しない。Windows/WSL production root providerと設定連携は後続。

- review_pointerによる凍結b5724c47の14-file全差分crossで、再利用のverify後の最後のroot.assert待機中にもcohort差替えが可能なmustを発見。verifyのcohort/engine identityを保持し、最後のfamilyLive後・成功返却前に両方を再照合。初回公開もengineを同様に再照合。13件目Cache回帰で最終root.assertから実readyを差し替え、成功を拒否することを確認。delta再レビューで解消・追加指摘なし。
