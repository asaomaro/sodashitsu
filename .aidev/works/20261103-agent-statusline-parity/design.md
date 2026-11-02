# 設計と調査

- Copilot 1.0.105の実TUIを隔離設定で起動し、モデルターンなしでcustom statusLineのJSON入力を捕捉。認証whitelistのある試行も同一項目。settings.jsonが読まれることを実測。config.jsonは認証に使い製品の包みは書き換えない。
- 取得したトップ項目: session_id/model/cost/context_window/ai_used、私的なcwd/session_name/transcript_path/username等。後者は共有しない。total_tokens/current_context_tokens/remaining_tokens/total_nano_aiu/total_premium_requestsはそれぞれの単位で保持する。契約quotaは両試行とも入力に無し。
- Copilot raw total_input_tokensのcache内包関係は未確認。共通のcache除外inputへ変換せず省略し、native totalを保持する。独自入力splitを推測しない。
- AGYの既存包みと設定復元コードをprofile化し、インストール先basenameで選択。sidecar、設定root、復元を分離する。CopilotにAGY専用stack_with_defaultを書かない。元コマンドがないCopilotは数値の簡潔なfooterを返す。
- ローカルsocketで長さ/範囲を再検証し、既存UsageReportIntakeでpane・PID・会話の一致後にだけ採用。閉じたpaneの保留を破棄し、handoff/停止でintakeも閉じる。
- Muse 1.4.14-R7309.1からオフライン出力したMSP schemaを一次資料として使用。view/pageはread-only、backwardでもviewCursor昇順。各eventのsessionId一致を確認し公開metadataだけ投影。最大256イベント/256KiB、30秒TTL、同時1ホスト、timeout2秒、終了とcloseまで所有する。raw provider input/cacheから再集計しない。
- Muse usage --jsonはモデルターンなし、schema v1 allowance/window/weekly/tier/asOfMs。MSP SubscriptionUsageのobservedAtMsと取り違えない。windowDurationMinsはoptional。アカウントは背景で毎分1回、5秒/32KiB上限。nullは未取得。実環境ではnullだけ観測でき、non-nullは生成fixture。
- 共通任意項目: effort、文脈pressure・残量、cost estimate/partial、account balances。残量のみ割当は%のUsageWindowに押し込めず、単位変換も行わない。
- Web pane情報、account枠、TUI、sodactlテキスト/JSONへ反映。

一次資料: インストール済みCopilot help config/billing、実statusLine JSON、Muse schema generate-json-schemaとusage --help、https://antigravity.google/docs/cli/statusline/ 、https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference 。生成probeはprivateな一時directoryに保存し、内容や資格情報をリポジトリへ含めない。
