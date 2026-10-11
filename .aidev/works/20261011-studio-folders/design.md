# 既存制作フォルダの参照

PJの実構成: videos/<series>/<slug>/<slug>.txtと派生成果物、images/scenes/BRIEF/REPORT/STATUS、outputへ配布コピー、output/webmへ録画・公開記録。調査時6系列164フォルダ、台本162、初期2本はlab/thumbに台本。既存ファイルを動かさず制作ごとにworkDir/artifactPrefixを登録する。未指定新規はvideos/<UUID>。台帳/order/taskは管理フォルダ。旧workDir無しの制作は旧hiddenフォルダを保持。PJ外・外向きsymlinkは拒否。

ジョブ台本/cwd/prefixは同じproject snapshotから取得し、working予約時にフォルダ設定が変わっていたら中止する。task更新は台帳ロック内。フォルダ変更はworkingジョブ中拒否。既存の進捗・検査資料があるだけでdoneにしない。既存PJデータの移動・参照先変更は行わない。
