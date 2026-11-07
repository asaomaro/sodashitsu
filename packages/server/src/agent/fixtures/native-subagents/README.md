# Native lifecycle fixtures

2026-11-07に隔離HOME/新しい空PJで一度だけ子へPROBE_CHILD_OKを依頼し、親が待機して終了する無害な実CLI probeを実施。Codex 0.166.0とMuse 1.4.14-R7309.1は成功した。

- codex.jsonl: 親rolloutのevent_msg/item_completed/SubAgentActivity行のみ。開始・完了・割込を保持。session_meta/account情報・プロンプト・関数引数・ツール結果は含めない。
- muse.jsonl: 親session streamのsubagent.control.*行のみ。recordはkind/subagent_id/parent_session_id/role/objective/depth/control_statusをホワイトリスト抽出し、それ以外のポリシー識別子・path・結果本文を除いた。行のID/sequence/型/version/時刻は実記録のまま。

認証はprivate temp HOMEにだけコピーし、各probeはtimeoutとprocess-group cleanup、finallyでcredential削除。rootのprobe-receiptsと負対照は.aidev/works/20261107-nonclaude-subagents/evidenceを参照。利用者paneや通常会話を利用していない。Copilotのtestデータは導入SDK schema由来の生成fixtureで、実CLI確認の証拠ではない。
