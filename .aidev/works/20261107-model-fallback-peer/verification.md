# 旧peer強制更新fallbackのscope

invalid_paramsの応答後、kind-only互換要求の前にepoch/active/kind/machineを再検証。peer変更/種類変更/画面closeで失効した場合はfallback自体を送らない。認証エラー等での再試行は既存どおり無し。

旧製品1fileで追加3ケースすべて失敗（negative.log）→byteexact復元15件成功（tests.log/restore.json）。生成APIfixtureのみ、実CLI/peer/通常pane操作無し。差分は同型変数の比較guardと回帰テストだけで、全体CI重複はしない。
