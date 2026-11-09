# 8c4 source-only audit

raw入力のsourceSHAはpure-audit-source-sha256.json。実行runnerはcommon git recovery receiver-continuity-a19-audit/checks.mjsに保持。実Detector.metrics/generatedFrameを使用。C#Drain部分は逐次sample組立の対応モデルであり実C#実行とは主張しない。

- 960初期位相は全tone。packet4分割はbitexact300frame。
- callback壁時計を2/3窓batch（gap40/60ms）としても全PASS。
- 6s矩形toneのcapture窓offset全960caseは全PASS、最少299tone/streak、reset最大1。
- 途中2windowをzeroにする場合と半window位相反転の場合の両方で298tone/max172/reset3/broken0/gap0が再現。A19への帰属は不明。
- 単窓のzero区間0.5/1/2msは今回sweepでtone維持、4/5msでは997成分が閾値を下回る例あり。

現aggregateだけからzeroと位相を区別できないことが今回の診断追加理由。閾値は全て不変、実音声・Windows・モデル0。
