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

## 正式能力と実装境界

- 導入codex-cli 0.166.0の `app-server generate-json-schema --experimental` で `Thread.canAcceptDirectInput:boolean|null` を確認。省略/null/falseはdirect不可。通常schema生成はexperimental fieldを省く。
- 同tagの `request_processors/thread_input.rs` はMultiAgent V2 ThreadSpawn子へのdirect API入力を拒否する。CLI `chatwidget.rs` のblocks_direct_inputもUserTurnを拒否し、thread_routing.rsはparent-ownedとして表示する。したがって `/subagents` で見えることは直接入力能力の証明にならない。
- 同daemon既存loaded親/子のexact ID・正式child record・入力能力・daemon/socket世代を照合。全設定override省略によりturn/startは既存thread設定を使用。idle中は正式start_or_steer_turn、activeはlatest formal inProgress turnのexpectedTurnIdを付ける。別clientの競合は同一子への正式provider意味に従い、失敗時のstartへの切替や再送はしない。
- private leaseは10秒/64件、owner connectionとexact parent/instance/child/start時刻に固定。送信は1回限りleaseを消費。request digest/結果は最大128件・30分後にprune対象、期限後も消費済leaseが復活しない。配送不明は同sourceの新leaseを拒否し、source失効まで保持。未確定entryと実行中予約の合計を128に制限し、上限時は新規control/sendを拒否する。未知entryは追い出さない。globalowned socket quotaは既存2/物理close後だけ解放。
- prepareとsendは共に正式recordをsafe-openし、同じprovider daemon世代/対象turnを再検証する。自分のsendは直列化、同requestIdの連打は同promise/同ACK。別requestIDの再送、接続/子/親scope喪失後の遅いACKは成功と断定しない。本文は永続化せずdigestのみ、例外本文/provider出力をlogへ送らない。

Claude 2.1.319 / 公式SDK 0.3.319の公開型では、streamInputは所有Query入力、stopTaskはtask停止、getSubagentMessagesは読取。SDKUserMessage.agent_idの注記は発話元帰属であり宛先保証として扱わない。Remote Controlは公式claude.ai/mobile接続で、任意既存PTYにtarget-agent送信する公開local attach APIを本調査では確認できなかった。API不存在/製品非対応と断定せず、Soda transport-not-connectedとして親下書きへ。新しいSDK Query/--resume/非公開socket/PTY子選択代行は採用しない。

生成結合は偽providerと自作記録のみ。正式実モデルへの子send成功や実ユーザーsessionへの送信を検証済みとはしない。Windowsのowned transportは既存Linux限定のままなのでdirect不可。終了子history/現在Cursor child-self intake/子数値取得は後続独立task。
