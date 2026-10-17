# 独立レビュー

実装者とは別コンテキストのreviewerが、未追跡の新規ファイルも含めて差分全体を確認した。

1. P1: .NET FrameworkのConsole.In.ReadLineAsyncが同期的に待つため、画面取得/UI loopを塞ぐ。専用background reader thread、8192字の行制限、64件のBlockingCollection、UI loopのTryTakeへ変更。
2. P2: benchmarkが900 frame/5fpsを許可する一方、固定100/120秒のtimeoutでは測定不能。frame数/fpsに応じて待機・全体timeoutを計算する形へ変更。

修正後の差分を再レビューし、2件とも解決、追加の重大な問題なしとの報告を受領。この初回レビュー時点ではWindows sourceはコンパイルのみで実画面・入力は未検証だった。許可後の実機検証はtest-result.mdを参照。詳細の原記録: /tmp/soda-desktop-review.md。

computer useの設計案を別コンテキストで追加点検し、未実装API/権限の区別に重大な問題なし。frame鮮度の表現を、参照frame自体の年齢ではなくBの最新frame送信時刻の検査であることが分かるよう修正した。製品コードの追加変更はない。


追加依頼の性能改善とエージェントAPIも独立レビューした。P2の旧act/新grant競合はdead世代の検査で解決し、P2の画像RPC送信queueは画像生成前の256KiB上限検査/lease失効で解決。いずれも回帰テストを追加しnegative controlを確認した。修正差分の再レビューで追加の重大な指摘なし。API文書もレビューし、手操作とagent操作の許可導線の説明と自動試験コマンドを補正した。原記録 `/tmp/soda-desktop-review.md`。

参照clientの終了処理修正も独立再レビューし、readline/stdinの終了、未完RPCの中断、socket終了、既存タイマー解除の整合を確認。追加の重大な問題なし。正常release/exit0とSIGTERMの恒久E2Eを最終実行し成功。

## 差分転送の独立レビュー

`/root/desktop_review` がprotocolの画像境界/重複/順序、Provider/RelayのchainとAPI fullキャッシュ、snapshot待機の失効再検査/queue上限、ブラウザの全patch decode後描画、Windowsのtile統合/fallback/静止通知、旧版へのcapability交渉を点検。重大指摘なし。

続けてrender失敗/失効テスト、refresh旧leaseテスト、delta E2EのcanvasとAPI画像観測、実機比較JSON/log、利用文書を独立点検。重大指摘なし。軽微な指摘（新テストコマンド掲載とdense更新時の送信数/CPU/RSSの明記）は文書へ反映。レビューの原記録は `/tmp/soda-desktop-review.md`。独立レビュアー自身は実機capture/inputを実行していない。

## 接続設定・減色の独立レビュー

`/root/desktop_review` がimage設定schema/旧A-B互換/helper適用ack、Windows減色/stride/cursor、ブラウザpreset/保存/invalid値と権限失効、pending reconnect取消、E2Eと文書を確認。P2: Providerへ加えたpermanent disposedフラグがcomposeServer.closeClientsからhandoff失敗rollback後も残る問題を検出。フラグを除去してdisposeの一時cleanupの意味を維持し、pending要求は取消す修正を行った。同一Provider再利用の回帰試験が成功。レビュアーが修正を再確認しP2解決、その他の重大指摘なしと報告。原記録 `/tmp/soda-desktop-review.md`。


## 動画・音声・clipboard・統合CLI/MCP/モデルの独立レビュー

`/root/desktop_review` が新protocol、Companion Hubと認証、Provider/Relayの所有者/queue、browser sender/receiverと窓、Windows clipboard/policy、CLI stdio/MCP/OpenAI入出力を読み取り点検（実機/モデル呼出しなし）。

- P1 frozen動画が操作面に残る: 2秒超の更新停止（初回12秒）検査、native画像即時復帰とheld input解放、動画の未描画/鮮度切れ時の入力拒否で修正。
- P2 混雑時media_stop drop: 制御送出不能時はB companionをclose/terminateし取得終了へ倒す。
- P2 stdout非読取でCLIが終了しない: PromiseのtimeoutだけではNode stdoutの書込みrequestが残ることを再レビューで再現。書込み待機2秒、CLIの停止時にlease/RPC/stdin即閉鎖、未完了pipeが残る場合は2.5秒でprocess終了するCLI専用期限へ修正。ライブラリはprocess.exitしない。

各修正のnegative controlと原bytes復元を実施。最後は実CLI session/MCPのunread pipe→SIGTERM→子exitとviewerのlease失効を2件とも検証。終了期限だけ除去し再buildすると子exit:nullのままFAIL。ログはtest-result.mdへ生出力を掲載。

レビュアーが修正、回帰test、正負ログを再確認し3件とも解決、新たな重大な指摘なしと報告。stopVideoのnative即描画とreleaseも再確認。原レビュー `/tmp/soda-desktop-expansion-review.md` は最初の指摘記録のため、最終状態は本節を参照。

追加文書はfact-checkスキルにより別エージェントが危険度の高い10件を照合、9件確認・1件の待機時間表現を修正。公式の引用と実コード10件の機械照合が全成功。結果 `/tmp/soda-desktop-expansion.factcheck.md`。本文の初回12秒/開始後2秒超/500ms検査へ修正済み。

### 最終2点の追補レビュー

全体テスト終了後、旧Companion socketの遅延errorが置換後hostへ作用する問題へowner guardを追加。modelのroot/call statusが明示的にcompleted以外の場合は承認/入力前に拒否し、HTTP redirectも追跡しない。偽socket/模擬APIでのみ検証。`/root/desktop_review` が差分・3files15testsの成功・2つのnegative control失敗と復元記録を読み確認し、両修正は妥当、新たな重大な指摘なしと報告した。レビュアーはファイル書込み・テストの重複実行・実機/外部API呼出しを行っていない。


## 窓に合わせたWindows解像度変更・等倍表示の独立レビュー

`/root/desktop_review` がprotocol/Provider/Relay、browser選択と等倍表示、Windows display lease/guardian、対応モードと復元、テストと文書を読取り点検した。

- P1: 旧helper異常終了時のguardianが新共有の解像度を上書きする競合。device mutexをguardianのready前から復元完了まで保持し、次helperは元モード読取り前に同じmutexを待つ修正で解決。
- P2: 元のDEVMODE全体を復元すると後から現地で変更したrefresh/depthも戻す。現在属性を保ち、元の幅・高さだけをFields=0x180000で要求する修正で解決。

両修正はレビュアーが再確認済み。修正除去時の失敗と復元後の成功をtest-result.mdへ記録。最終Guard抽出と永続偽Driver検査の小差分も追加点検完了。WatchのPID/startTicks確認、ready前のcurrent確認、復元完了までのlock、disarm、幅高さ限定の復元が維持され、正負のnativeログとguardian probeも再確認済み。追加の重大指摘なし。

fact-checkスキルの別エージェント `/root/desktop_factcheck` が高リスク10件を確認し、公式引用とコード抜粋10件の機械照合をすべて成功と報告。必須修正なし。原記録 `/tmp/soda-display.factcheck.md`。実機での解像度切替・復元・DPI表示は未検証という留保を維持する。


## 最大化の独立レビュー

`/root/desktop_review` がtoggleMaximize/restoredSize/inset0/border-box、タイトルdblclick、drag取消、ResizeObserver連携とE2EのDOM観測を点検。初回button処理の置換漏れを指摘し、共通toggleへの接続、data属性とaria-pressedを修正した。最終差分を再読して解決、新たな重大な問題なしと報告。ファイル変更・実OS操作・テスト重複は行っていない。


## PR提出前のmain統合レビュー

origin/main 576dbfbd（VSCode共有・Antigravity対応を含む）を29b4053cで取り込み、protocol index/messages、composeServer、MachineHeaderの4競合を両機能維持で解消した。`/root/desktop_review` が接続経路・ready/auth・終了処理・両UI導線の統合差分を独立確認し重大指摘なしと報告。

その後のbuildでDesktopInput/DesktopViewerMessageのroot export衝突（TS2308）を検出。既存CDP側を維持し、新規PC共有側9filesをRemoteDesktopInput/RemoteDesktopViewerMessageへ改名した。schema wire形式は変更していない。同レビュアーがconst/type/schema/Provider/Relay/AgentAccess/CLI/model/Web/testsのconsumerとrepo全体の旧名検索を再点検し、重複0・置換漏れなし・修正妥当と報告。AGENTSに利用文書への索引を追加。
