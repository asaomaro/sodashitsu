# 最小設計

契約: agent.subagent_control(paneId,agentId) は direct+短期lease または parent-draft+固定reason。agent.subagent_send はlease/request UUID/textだけ。送信結果 accepted は受付のみ、delivery-unknown は自動再送禁止。保存済みrequestは本文を保持せずdigestで照合し同結果を返す。旧peer/欠測能力はdirect不可。

Codex: 導入CLI 0.166.0生成schemaと既存 owned daemon UNIX WebSocket の正式 thread/read・thread/turns/list・turn/start・turn/steer を照合する。既存loaded親/子、正式child record、現在paneのkind/instance/session/fresh proof、daemon世代を確認。status read専用allowlistは変更しない。override/model/policy/daemon起動/resumeは禁止。activeはexpectedTurnIdを正式ページから取得し一致条件付きsteer。idle時startの同時writer/既存policy継承は正式sourceを検証後採用。

Claude: 2.1.319。公式CLIは子transcript内のfollowupを子へ配送する。しかし別 --resume は既存稼働子への送信証拠ではない。正式control/SDK target受口を追加調査し、未接続は製品非対応と表現しない。

共通verified親子resolverはbody権限と独立し、usage readerへsource/item/currentだけを渡す。終了子collector/RPCは別commit。履歴の旧情報パネルinline計画は専用会話へ変更する。active件数へ終了子を加算しない。

一次根拠:
- https://learn.chatgpt.com/docs/app-server （turn start/steer、expectedTurnId、ACKとturn/completed）
- https://learn.chatgpt.com/docs/developer-commands?surface=cli （/subagentsはCLI内で子を切替）
- https://code.claude.com/docs/en/sub-agents#observe-and-steer-running-forks （子transcript内followup）

独立taskcheck対象: protocol、target scope、正式送信transport、dedup/不明配送、終了履歴の保存/失効。UI表示は最終cross。新モデル呼出し/実会話/Windows操作なし、生成fixtureで検証。
