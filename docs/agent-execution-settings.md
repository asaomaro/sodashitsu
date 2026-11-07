# エージェントのeffortと承認設定の観測

paneフッターへ渡す値は、CLIの正式な記録・現在のCLIからのhook/statusline・既存のread-only APIで観測できたものだけです。起動プロファイルの希望値や設定ファイルの既定値から、現在のCLI設定を推定しません。未取得の項目はありません（0・許可済みとはしません）。値の表示選択はフッター設定で行います。

`AgentUsage.reasoningEffort`は互換のため維持し、`executionSettings`の各項目は`value`・`source`・`basis`・分かる場合だけ`observedAt`を持ちます。承認policy・承認mode・権限mode・sandbox種別は別の項目です。sandboxだけ分かっても承認値にはしません。観測は権限を設定する機能ではなく、実際の承認要求を省略する根拠にも使いません。

| CLI | effort | 承認等 | 観測の範囲 |
| --- | --- | --- | --- |
| Codex | `turn_context.effort` | 文字列の`approval_policy`、`sandbox_policy.type` | 最後に記録されたターン（`rollout` / `turn`）。複合policy objectは単純化せず未取得。sandboxは種別だけで、networkや個別許可の全内容ではない |
| Claude Code | 現取り込み経路では未取得 | 親hookの`permission_mode` | `hook`報告。default/plan/acceptEdits/auto/dontAsk/bypassPermissionsを区別。子agent_id付きhookの一時modeは親へ混ぜない |
| Muse Code | 既存MSP viewの`session/reasoningEffortChanged` | `session/approvalModeChanged.mode` | `muse-events` / `session`。standing session default/effective session modeの記録。ターンの一時指定は未反映の場合がある。allowAll/promptUnmatched/onRequest/denyUnmatchedをそのまま保持 |
| Antigravity CLI | 公式statuslineの`model.effort` | 承認は未取得。`sandbox.enabled`だけは別項目で報告 | `statusline`報告。cycle_modeはworkflow cycleの選択であり、承認policyやskip-permissionsと見なさない。省略をdefaultや全許可と推定しない |
| GitHub Copilot CLI | 既存statuslineでeffortが明示報告された場合だけ | 現SDK/取り込み経路に現在の承認設定がないため未取得 | 旧CLIや未導入wrapperでは項目なし。起動flagを実測へ流用しない |
| Bob Shell・その他 | 現取り込み経路では未取得 | 現取り込み経路では未取得 | 能力の不在を断定せず、値を作らない |

`turn`は過去の最後のターン設定、`session`はCLIが提供したセッション設定の記録、`hook`/`statusline`はその実行時の報告です。CLI内で設定を変えてから次の記録/報告までは古い可能性があります。provider時刻が無い場合は`observedAt`を省略し、ポーリング時刻を観測時刻に代入しません。

Claudeのhook-only更新では、既存の利用量・cost/context報告の時刻を更新しません。親paneのPID/session検証を通した後に値を重ねます。会話・instance・kindが変わった後や終了後に戻った非同期結果は配りません。同kindでも別sessionの値は引き継ぎません。既存hook/statusline wrapperの更新が必要な場合がありますが、本変更は利用者の設定を自動で書き換えません。従来どおりWindowsで未対応のwrapperは、その経路から値を取得できません。

追加のRPC・記録フォルダscan・モデルターンはありません。Codexは既存turn_context読取、Museは既存view/page、各wrapperは既存report socketを使います。会話本文・起動引数・パス・コマンド・個別の承認ルールは送信しません。

根拠: [Codex 0.166 protocol](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/protocol.rs)、[Claude公式hook input](https://code.claude.com/docs/en/hooks#common-input-fields)、[Antigravity公式statusline](https://antigravity.google/docs/cli/statusline/)、インストール済みMuse CodeのMSP schema（`SessionReasoningEffortChangedParams`/`SessionApprovalModeChangedParams`）、Copilot SDK schemaと既存statusline報告経路。検証は `.aidev/works/20261107-agent-execution-settings/` にあります。
