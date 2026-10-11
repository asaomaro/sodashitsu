# 既存制作物を一覧へ登録

videos/<series>/<slug>を探索し台本/infoから題を取得。通常slug.txtと移動済みvideo.txt、初期lab/thumb例外を認識。動画はwork内HTML優先、無い場合だけoutput代替。登録済みworkDir/prefixは除外し既存ID/工程/レビュー維持。追加は成果物有無と出自を記録し、全工程pending。台帳上限500制作/1MiB、探索500フォルダ。容量を事前に検証し制作ファイルを変更せず管理用orderだけ作る。UIの取り込みボタンとCLI import。実PJへの取り込みを行う。
