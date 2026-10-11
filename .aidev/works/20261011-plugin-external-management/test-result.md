# Yukkuri Studioの管理先とmain反映

利用者の指定により、本体・manifest・README・単体テストを /workspaces/yukkuri-work/plugins/yukkuri-studio に移動。Sodashitsuコミットには含めない。配布基盤、汎用Commit Graph、外部Studioとの連携テストはSodashitsuで管理。

- 全体build・typecheck成功。
- 起動確認: /tmpからbuilt server smokeを実行。実Chromium、PTYの入力往復、はじめの案内、フォーカス復帰を確認しPASS。
- YUKKURI_STUDIO_SOURCEを指定: plugin-perspectives 2件成功、Studio/自動依頼/通知/検索/ドロップダウンの6件成功、計8件。
- YUKKURI_STUDIO_SOURCE未指定: plugin-perspectives 2件を想定どおりスキップ。
- 移動先のStudio単体テスト24件成功。
- 境界変更をreview_classic_controlsが独立点検。必須修正なし。
- 過去の検証記録の生出力は、内容を維持し行末空白だけ除去。

Sodashitsuは着手時からmain上でorigin/mainと一致していたため、別ブランチのmergeではなくmainへのコミットで反映する。yukkuri-work側に元からある別作業はコミット対象外。
