# 検証記録

## 実CLI・導入

- Muse Code 1.4.14-R7309.1: ローカルechoでSessionStart環境回収、親PID一致、状態、会話読取、UUID再開を確認。インストール済みCLIのMSP schemaをoffline exportし、initialize→initialized→session/read（非attach）/session/forkを生成した会話で確認。Metaモデルの試験は行っていない。
- Antigravity CLI 1.4.12: bubblewrapで元のhome変数を維持したまま設定領域をoverlayし、/usage、短い応答、own fixtureのread_fileを確認。元のglobal hookは0件。生成したtranscriptのPLANNER_RESPONSE/DONEトップレベル数値・tool_callsの構造を回帰fixtureへ反映。
- Copilot CLI: 利用者承認後、公式npm @github/copilot 1.0.105をLinuxへ導入。helpでmodel/reasoning-effort/JSON出力/利用ツール制限を照合。既存Windows npm shimは削除せず、LinuxのPATHで現行版を使用。

## 修正を外す負対照

各対象のバイト列を保存し、1箇所だけ旧挙動に戻して対象回帰テストを実行。失敗を確認してから、元のSHA-256とバイト一致で復元した。

| 対象 | 結果 | 生ログ |
| --- | --- | --- |
| 追加3種の共通会話parser | 失敗を確認、復元一致 | /tmp/soda-parity-negative-conversation.log |
| Muse巨大行からの復帰 | 失敗を確認、復元一致 | /tmp/soda-parity-negative-oversized.log |
| usage未取得activityのセッション表示 | 失敗を確認、復元一致 | /tmp/soda-parity-negative-activity.log |
| 投影失敗の一部取得印の保持 | 失敗を確認、復元一致 | /tmp/soda-parity-negative-projection.log |
| Muse別streamのToDoを作業抜粋から除外 | 失敗を確認、復元一致 | /tmp/soda-parity-negative-workcontext.log |

抜粋: `AssertionError: expected undefined to be 120`（巨大行復帰）、`AssertionError: expected [] to have a length of 1`（activity）、`AssertionError: expected false to be true`（投影）。別streamのToDoは、ガードを外すと`対象の作業`の代わりに`別会話の秘密`となり失敗。

## 段階の検証

- Muse初期core: 3ファイル115件pass。専用会話等: 3ファイル62件pass。設定/検出等: 4ファイル207件pass。
- 共通会話・履歴等: 5ファイル58件pass。
- 新MSP/隔離summary/追加3種の記録: 4ファイル16件pass。MSPの分割UTF8・読取ID・fork・SIGTERM無視の終了待ちを含む。
- UIの5種起動と未取得表示: 2ファイル19件pass。
- 最初の全体: 955ファイル/13,636件pass、2件fail、1件skip。UsageInsights容量回復とDesktopRelay通知の時間制限/待機失敗。関係3ファイル330件の再実行はpass（/tmp/soda-parity-target-recheck.log）。
- 最初の関連E2E: 15pass/1skip、過去一覧2件は旧dashboardへの導線を使って失敗。ブラウザDOM/traceで履歴画面が独立した現UIを確認し、「その他」→「セッション履歴」に修正。サーバAPIで表示判定を代用していない。

## 最終コードの検証

- 全体build pass: /tmp/soda-parity-build-verified.log。
- 全体typecheck pass: /tmp/soda-parity-types-verified.log。
- 全体unit（最終コード）: 955ファイル/13,636件pass、2件fail、1件skip。UsageInsights容量回復の5秒制限とDesktopEndpointBackplaneの画像ticket待機。失敗2ファイルの単独再実行は40件すべてpass（/tmp/soda-parity-final-targets.log）。時間制限を延ばしたり、無関係な製品コードは変更していない。生ログ: /tmp/soda-parity-tests-verified.log。
- 関連ブラウザ4spec: 17pass/1既存skip（/tmp/soda-parity-e2e-verified.log）。Museの実PTY/fake CLI起動・sessionフック・idle/working/blocked/idle・一般会話DOM、5種類の生成先選択とリッチレポート・グラフ起動・既存会話/要約/履歴を確認。
- desktop verify:ui pass（/tmp/soda-parity-assistant-ui-verified.log）。5種類のモデル/effortをDOMから入力し保存・再表示。初回の2profile固定期待値を5種類へ更新した。検証スクリプトの差分にも独立再レビューを行い必須なし。
- git diff --check pass。最終のcursor二重書込解消の差分にも独立再レビューを行い必須なし。

## 安全な反映とmain

- 検証済みの共通機能を4コミット（core、会話/隔離実行、数値分析、UI/文書）に分割し、mainへfast-forward。製品コードの最終commitはa19ab4fb。
- 実装したmuseSession helperでも、生成した会話を実CLIでsession/read（元ID一致）/session/fork（別ID）できることを確認。追加のモデルターンは送っていない。/tmp/soda-parity-native-msp.log。
- sodaの安全なhandoffは成功。coordinator PID3290557を維持し、実PTY6件を動かしたまま切替。前後の全8pane UUID保持をclient.helloで確認。/tmp/soda-parity-handoff.log。
- desktop assistantはrunning / readyを確認。更新によるエージェントの再起動やpaneの作り直しは行っていない。
- 5種類すべてのCLI available=true、integration installed=true / needsUpdate=false。既存Claude/Codex/Copilotは更新、Muse/Antigravityは不足フックを導入。Antigravity statuslineは既存のinstalledを維持。/tmp/soda-parity-installed.log。
- 起動中CLIが読み込み済みのhook設定は次回起動から反映される。作業中プロセスは保持した。
- mainをoriginへpush成功。残る差分はこの検証記録とタスク完了印だけ。
- 検証後に失われていたCLIの7780用cookie cacheは、既定のlocal-login経路で再発行して復旧した。秘密やcookieをログ・会話・gitへ出していない。その他の接続先のcacheは削除していない。
