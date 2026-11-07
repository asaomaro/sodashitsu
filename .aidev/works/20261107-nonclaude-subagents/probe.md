# 隔離probe

専用のmode0700 temp directoryにHOMEと空PJを作り、呼出し元のSODA_*/SODACTL_*/CODEX_*等を除く。必要な認証はprivate HOMEにだけコピーし、finallyで削除。各CLIは独立process groupで起動し、timeout時はSIGTERM→5秒後SIGKILLで後始末。stdout/stderrのrawはprivate temp内のみ、リポジトリにはホワイトリスト抽出fixtureとreceiptだけを保存。

送信した自作の無害なtaskは「子を1つだけ起動してPROBE_CHILD_OKだけを返させ、待機して終了後にPROBE_PARENT_OKを返す。ファイル・shell・network操作は禁止」。既存会話のresumeは行わない。

Codex: `codex exec --ignore-user-config --ignore-rules --enable multi_agent --model gpt-6-luna -c model_reasoning_effort=\"low\" --sandbox read-only --skip-git-repo-check --json -C <空PJ> <fixture task>`。上限150秒、実際9.66秒で終了。親rolloutの正式SubAgentActivity 3行を採取。

Muse: `muse exec --json --workspace <空PJ> --reasoning-effort low --max-model-steps 6 --disable-web-tools --disable-reminders --disable-request-user-input --no-foreign-personal-context --disable-write --disable-shell <fixture task>`。上限150秒、実際13.37秒。親のsubagent.control 8行を採取。

Copilot導入0.0.362: 最初の隔離HOMEでは認証なしで4.55秒終了。別の隔離HOMEで手元credentialをプロセス環境にだけ渡すとAPIへ到達したが、`--model gpt-5.1-codex-mini` はCLI候補にある一方APIではmodel_not_supported。CLI内蔵retryで98.96秒後にexit1（上限120秒）。そこで打切り。実subagent fixtureは未取得。付属`@github/copilot/sdk/index.d.ts`のcustom_agent.started/completed/failedを用いた生成unit fixtureと区別。

AGY導入1.4.12のhelp・binary中の公開型名・最近30件以内のbrain transcriptの構造を限定確認。一般tool_callsにはrun_command/read_file等があるが、親子ID/終了を結べる安定したlifecycle契約を確認していない。Bob実行ファイルは見つからない。これらはundefinedのまま。
