# 子の会話とモデル・effortの記録

子への入力は追加せず、指示は親を通します。親の正式な子一覧、親の会話IDと現在のinstance、子の正式記録を照合できる場合だけ閲覧・設定の観測に使います。開始時に解決された値と、後のターンに記録された値は別です。モデル名のsuffix、親の設定、起動希望値からeffortを推測しません。

| 種類 | 会話・親子関係 | モデル / effort の追跡根拠と現状 |
| --- | --- | --- |
| Claude Code | 既存のフックが報告した親transcriptとagent_idから子jsonlを読む | assistant.message.modelは実応答の根拠。子の最新effortの正式記録は今回未確認。開始時の定義から補完しない |
| Codex | 親の正式SubAgentActivityのUUIDと、子rollout先頭session_metaのidおよびsource.subagent.thread_spawn.parent_thread_idを二重照合して閲覧 | 子の最後の完全なturn_contextのmodelとeffortを同一rowから採用。開始より古いtimestampは不採用、最新rowの欠落fieldは以前の値で埋めない |
| Muse Code | 以前の隔離実CLI記録にsubagent.control.child_session_boundのchild_session_idを確認。子の保存先はsession UUIDから決まる | 子のrun.model.configured.model_idを隔離実記録で確認。子の同記録にはeffort tier未取得。MSP session/readのstanding reasoningEffortはセッション既定値でありturn overrideとは別。子への結合は後段 |
| Antigravity CLI | 既存取得は正式invoke_subagent結果と親descriptorの子UUID/spawnStepIndexを照合。子brain transcriptが候補 | 子の最新effortとモデルの公開された記録fieldは今回未確認。descriptor ALIVEは所属のみで設定を意味しない |
| Copilot CLI | 正式子lifecycleのtoolCallIdはsession UUIDではない | lifecycleだけでは子の保存ファイルや設定へ結べない。APIが不存在との結論ではなく、現在は正式bindingの取得が未実装 |
| Grok | ネイティブ子起動のソース契約は確認したが、導入CLIの実子生成記録は未証明 | 親usageや起動profileを子へ転用しない。正式子bindingが未実装 |
| Cursor | SDK/CLIのnative子metadataは候補だが、現在の取得経路へ未配線 | 親afterAgentResponse hookは子の設定の証拠ではない。正式子bindingが未実装 |

Codexの観測は1子あたり先頭metadata最大256KiBと末尾256KiB、最大64子・4並列・全体2秒です。長いターンでturn_contextが末尾256KiBより前ならモデル・effortは未取得です。最新のCLIのライブ設定を常に示す保証ではなく、保存された最後のターン設定です。新しい記録・scope変更・ファイルの置換が検証中に起きたら値を返しません。モデル変更と古いeffortを混ぜず、未取得を開始時の値で埋めません。取得の失敗は件数や現在の作業状態を変更しません。

CodexのhasTranscriptは子ファイルの安全なopenと親子照合に成功した場合だけ付けます。既存のagent.subagent_transcriptを使い、同じfdで抜粋し、パス/fdのidentityと親scopeを最後に再確認します。1MiB窓・200件・1件4000文字・2秒、同じ親instance/会話に限る64件・30分の閲覧grantです。本文・認証値・記録パスを診断ログへ出さず、reasoningや添付データ・道具のbodyを会話として表示しません。
