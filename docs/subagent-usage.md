# 子エージェントの利用状況

`agent.subagent_usage(paneId, agentId)` は、確認済みの親と子の対応から、子自身の数値記録だけを読みます。会話本文の閲覧許可とは別です。親の利用状況、アカウントの制限、週の集計を子へコピーせず、親の集計にも再加算しません。

| 種類 | 接続した数値記録 | 範囲と限界 |
| --- | --- | --- |
| Codex | 子 rollout の `token_usage_record.usage`、直近の `token_count.info.last_token_usage` | 出生後の子自身の response を重複排除して合算。fork の継承累計、thread/turn 累計は消費量へ使いません。コンテキストは直近の報告値です。 |
| Claude Code | 正式 hook に結ばれた子 transcript の assistant message usage | 出生後の message ID ごとの報告値。キャッシュ内訳が未報告なら省略し、部分値と表示します。合計は合成しません。 |
| Muse | 正式 child session に結ばれた usage report | 子の session stream の正式な単位・帰属を検証。キャッシュ不明時は正規化 input を省略します。 |
| Antigravity | 正式 invoke/descriptor に結ばれた子 transcript の完了 step | 出生後の step の報告値。合計や料金を推計しません。 |
| Grok | 正式 current child、または終了attemptを再検証した子の `usage.json` | 報告累計は子の配下を含む `subtree`。USD ticks の報告費用のみ。終了後は専用history APIの正式attempt proofが必要です。既存current APIのB grantだけでは履歴値を返しません。 |
| Cursor | 正式な終了履歴に固定した子 `store.db` の latest-root `token_details` | 保存済み文脈量と上限だけ。終了binding確立時のroot・DB/WAL世代を保持し、後から新しいrootへ切り替えません。消費トークン・費用・現在一覧の数値は未取得です。 |
| Copilot | 未接続 | 子自身の数値 reader は未実装です。親のsession使用量やtoolCallIdだけでは帰属させず、上流APIが存在しないとは断定しません。 |

`tokens.total` は正式に報告された種類だけに載ります。未報告の数値を 0 に置き換えず、費用・コンテキスト上限も推測しません。`observedAt` は元の記録時刻です。取得した現在時刻ではありません。`partial` は記録の一部・欠測を、`scanning` は未読部分が残ることを示します。途中の無取得は消費 0 の確定ではありません。

Codex の per-response usage と累計の区別は、[公式 0.166 の TokenUsageRecord](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/protocol.rs)、[記録を構築する実装](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/state/session.rs)、[再開時の公式回帰テスト](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/tests/suite/token_usage_rollout.rs)で確認しています。子による新しい API response の input に継承会話が含まれる場合、その response 自体の正式使用量は含みます。親の過去の response は含めません。

## 終了後と再取得

正式な current target で取得に成功した場合だけ、同じ親・instance・kind・会話 ID・子の出生を固定した grant を最大 64 件、30 分保持します。履歴を読むだけでは期限を延長しません。親の fresh proof、safe opener、既知の binding と同 ID の新 run を毎回検証し、失効時は返しません。未知の履歴 ID や存在するファイル名だけから grant は作りません。終了した子を件数や sidebar へ戻す処理もありません。

Grok 以外の終了後の値は、確認済み対応に基づく履歴として `partial` と固定の理由を返します。現在の子 run の追加確認を保証する表示ではありません。ファイルの置換・切り詰め・同サイズ書き換えを観測したら集計 cache を破棄し、同じ正式な関係を再検証して最初から読みます。再証明できない場合は数値を返しません。

1 回の明示問い合わせは子 1 件につき最大 4 MiB、記録は最大 512 MiB、1 行は最大 256 KiB、数値 cache は 64 件、同時物理処理は 4 件、期限は 2 秒です。巨大行や壊れた行は本文を保持せず部分値とします。重複排除の上限は 20,000 件で、上限を越えて古い ID を追い出して再加算することはありません。Grok ledger は 2 MiB までです。実行中の FD 処理が終わるまで同時処理枠を保持します。

専用の`agent.subagent_history_usage`は[終了履歴](subagent-history.md)のentryIdを検証します。Grokは正式attemptと親記録の最新EOF世代を読み直した場合に限り、正確な子自身のledgerを返します。現在一覧に戻したり、既存current APIのgrantを緩めたりしません。

## Cursorの終了子の保存済み文脈

正式Stop・子SQLiteの直属の系譜・子記録の終端が一致して終了bindingを作った時に、子自身のlatest-rootとDB/WALの世代をprivateに固定します。履歴の利用状況を初めて開いた時の最新値へ切り替えることはありません。同じ子が再開されてDBだけ先に更新された場合も、古いentryIdで新しい文脈量を返しません。読取り前後と所有FDの閉鎖後に、親scope・ファイルのns世代・namespaceを再照合します。

導入CLIの`ConversationStateStructure`にある`ConversationTokenDetails.used_tokens/max_tokens`だけを投影します。両fieldが実際に記録され、上限が正で整合する場合に限ります。未記録をprotobufの既定0で補いません。root本文は2MiBまで、元DB32MiB/WAL8MiBまでの既存private-copyと固定SQLite workerを使い、本文・暗号鍵・親の数値は返しません。取得元は「Cursor子DB」、範囲は子自身、常に一部取得です。正式な観測日時がないため、読取時刻を観測日時として表示しません。追加のモデル呼出しや既存フックの黙った更新はありません。

これは終了した子の専用履歴APIの対応です。現在の子一覧・件数、消費内訳・累計・費用の取得を意味しません。未知の取得元は、この版の共通表示では数値を表示せず未取得にします。旧版や別の接続先の対応状況と、消費ゼロは区別してください。
