# 独立レビュー

- review_pointer: ZIP境界・descriptor/CRC/derived directories・output FileHandle physical closeの追加回帰、downloadのprivate TLS headers前/body途中取消、3OS workflowを点検。追加must/shouldなし。
- review_transfer: Cache/Files/CatalogおよびCache testsの独立cross。公開後destinationのdev/ino確認不足(must)とregular file hardlink(should)を修正。実rename差替えと外部hardlinkで回帰を追加し、delta再レビューで両方解消、追加指摘なし。
- root ownership/ACLのcapability提供は呼出側の明示前提。この段階は準備基盤のみでGUIを起動しない。Windows/WSL production root providerと設定連携は後続。
