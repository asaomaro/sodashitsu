# 概要の数値評価

利用者依頼は「エージェント利用分析」の概要画面に追加のモデル利用なしで点数/A～Eを表示すること。既存エージェント生成分析の作業記録に基づくassessmentは変更しない。rootが式・対象・最低件数・閾値を承認した。

指標は「ツール結果の機械評価（記録分）」のみ。サーバUsageInsights.tsのtotalsはinferred_tool/activityを除いた正式toolを同じ期間/CLI/役割/モデル/PC等の条件で集計する。toolsの内訳上限200に依存せず、totals.knownResults/errors/toolsを利用する。失敗を除いた既知結果/既知結果×100の小数点以下切捨てをBigIntの有理計算で行い、浮動小数誤差で境界を減点しない。A95/B90/C80/D60/E未満。既知結果10件未満・欠測・不整合は評価不能、正式10失敗/10既知だけは0点E。

正式Readの分類basis=inferredと、本文から推測したinferred_toolを区別する。前者の正式結果は保持し、後者は除外する。未知を成功・失敗に補わず、結果取得率(既知/全呼出)、非失敗/失敗/未知件数を別表示。0≤errors≤knownResults≤toolsのfinite/safeintを必須とする。partial/collectingなら暫定。outcomeは呼出し開始rowのatを保持するので「選択期間内に開始されたツールの、取得時点までに判明した結果」であり、期間内完了率ではない。成果品質・生産性・目的達成を評価せず、cache/低cost/多tool/子数・completed/startedを採点へ混ぜない。

Web UsageInsightsPanelのlayout overviewとTUI MonitorViewのsection0のみ。既存数値ロード/フィルタ/更新へ追随する純関数、追加RPC/LLM/設定保存/protocol変更なし。複数PC比較の機械点を無条件合算せず、詳細対象PCの結果だけを使用する。Web内訳はdetails、TUI同じ式と件数を表示。既存AI生成評価は別スコアとして保持。

独立レビューはreview_audio_integrationへ依頼。安全/式/未知の意味は関連計算回帰と不正分母負例、Web/TUI旧source負例→byte exact復元、生成DOMで確認する。全repo再build/testはせず対象3packages buildとTUI/core対象型のみ。
