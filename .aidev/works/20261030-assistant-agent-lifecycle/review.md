# 独立レビュー

review_pointer / review_transferがread-onlyでsource差分全体を別コンテキストから点検。停止待ち入力、markerとbindingの保存差、handoff越境drain、GUI停止失敗時cleanup、late attached、drain再走/終端競合、argv証明の順序を指摘。各条件の修正前回帰を実行した後に修正し、最終差分再レビューで追加must/shouldなし。実モデル・OS入力・実画面は操作していない。
