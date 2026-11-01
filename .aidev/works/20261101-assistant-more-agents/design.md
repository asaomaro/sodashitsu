# 設計

- グローバルConversationKindは広げず、assistant.conversationを追加する。strictなdeviceId/instanceId/offsetのみ受理し、呼出側からpane/path/sessionIdを選べない。
- AssistantSessionsが専用workspace/pane/actorと現在報告済みの会話IDを確認する。保存referenceのみでは認めない。開始前と非同期読取後に接続認可/中止/対象会話を再確認する。
- Claude/Codexは既存ConversationServiceを使う。追加2種類のreaderはRPC要求時にdynamic importする。追加のworker/SDK/agent起動なし。
- CopilotはCOPILOT_HOMEまたは~/.copilot/session-state/<UUID>/events.jsonl。AGYは~/.gemini/antigravity-cli/brain/<UUID>/.system_generated/logs/transcript.jsonl。UUID固定、canonical親・通常file・非symlink/nlink1・開いたFDのidentityを確認する。
- 末尾1MiBを読み、完全なJSONL行から最大100メッセージ/各8192文字を抽出する。前方の不完全行・推論・tool・Copilot subagentは表示しない。再読一致と再度path照合の後で返す。毎回reset snapshotとして返し、append/rename/同一inode書換後に古い本文を残さない。
- UIは同じdevice/kind/actor/paneを再確認し、reset時は既存表示を置換。テキストDOMのみ。返答は既存assistant.promptの待機中actor/最終入力guardを使う。

## 記録形式の根拠と検証限界

Copilot: 公式 https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/streaming-events と https://raw.githubusercontent.com/github/copilot-sdk/main/nodejs/src/generated/session-events.ts 、導入済みSDKの型でuser.message/assistant.messageのdata.contentとparentToolCallIdを確認。
AGY: 公式 https://antigravity.google/docs/hooks のtranscript位置と、導入済みagy 1.4.0の配布バイナリに含まれるschema識別子USER_INPUT/PLANNER_RESPONSE/content/created_atを確認。バイナリは実行せず、実会話記録は未取得。parserは生成fixtureで検証する。実CLIとの互換性を確認済みとはしない。
