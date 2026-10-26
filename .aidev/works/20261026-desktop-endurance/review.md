# 独立レビュー

review_transferが文書/JSON/ログと実出力を照合。345点を実行時に検査した事実と、保存済みの毎分出力28点/summaryの違い、640×360/10fps/loopback/生成音声の範囲、実WAN・実画面60fps・音声endpoint未測定の線引きを確認。

毎分出力の記載29→実数28点、RSS配列20件→実RSSのある19点（最後は終了後の時刻だけ）へ修正。helper67.16MiB、A/B同居test worker506.5〜510.25MiBの範囲は19有効点から算出。raw-browser.logはgitignore対象なので、そのファイルだけ明示force-addして保存する。実装の変更はない。
