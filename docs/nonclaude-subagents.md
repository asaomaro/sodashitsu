# Claude以外のサブエージェント取得

サイドバー・グラフ・Statusline・CLIの`subagents`は、子の件数と一覧を共有します。Claude・Muse・Copilot、および通常のCodexは実行中件数、Antigravityと後述のCodex再参照は存続する子の所属数です。`countBasis`省略または`working`は従来の実行中、`alive`は所属を表します。各子の`state`省略は従来の実行中で、明示値は`working`・`idle`・`unknown`です。子は独立したpaneではありません。トークン利用状況の主/子内訳とは別の情報です。

| 親CLI | 取得する正式記録 | 確認範囲 |
| --- | --- | --- |
| Claude Code | 既存のSubagentStart/Stop等のフック | 従来の対応を維持 |
| Codex | 親rolloutの`SubAgentActivity`のstarted/completed/interrupted | 0.166.0で隔離実CLIの子起動・終了を確認 |
| Muse Code | 親session streamの`subagent.control.*`の開始・状態・result_ready | 1.4.14-R7309.1で隔離実CLIの子起動・終了を確認 |
| GitHub Copilot CLI | 親`events.jsonl`のcustom_agent.started/completed/failed | 導入0.0.362のSDK schema・生成fixtureで確認。実CLI往復は未検証 |
| Antigravity CLI | 親の正式な`invoke_subagent`起動結果と、直属の子descriptorのUUID・`spawnStepIndex` | 1.4.12の隔離実CLIで子起動・応答・native list・killを確認。ALIVEは所属数、作業状態は不明 |
| Bob Shell、その他 | 未対応 | 正式な親子取得契約が未確認。件数を推測しない |

Codex・Muse・Copilot・Antigravityは約2秒ごとに、現在の親paneへ改めて結び付けられた会話の記録だけを読みます。保存済みの会話IDだけでは取得せず、現在のinstanceについてサーバが確認した証拠が必要です。読み終わるまでにinstanceや会話が変われば結果を捨てます。読み取りによるCLI・モデルの起動や、子への入力は行いません。

Codex・Muse・Copilotは開始済みの子を一覧に載せ、終了・失敗・割込の記録で外します。履歴や同じイベントを読み直しても件数を足しません。Codexのinteractedは入力の配達なので、再び実行中とは断定しません。正式startedで同じ親会話への所属を確認済みの子がcompleted後に改めてinteractedで参照された場合は、所属数`countBasis: alive`・作業状態`state: unknown`として表示します。既知の実行中が混ざる場合はその項目だけ`state: working`を明示します。completedだけで終わった過去の子を一覧へ戻すことはなく、再参照後のcompletedでunknown項目も外します。interruptedや未知kindは再参照の所属証拠を失効させ、新しい正式startedまで復帰させません。所属証拠のないinteractedや未知状態は引き続き未取得です。実行中の子への配達は実行中を維持します。所属証拠はcompleted後も含めて256件までで、超過時は未取得です。未知の状態、読めない記録、未確認の親は`undefined`（CLIでは`null`）です。従来の実行中件数の0件は取得済みの終了状態を意味します。Antigravityの所属数0件は、確認した直属フォルダにALIVEの子が無い状態です。サーバ再起動時も所属を再確認して正式記録の最終状態を読み戻します。

Codexの種類欄は記録にあるモデル名、説明は子の論理的なtask path末尾です。Museは記録にあるroleとobjective、CopilotはagentNameとagentDescriptionです。分からない値は補いません。子の記録閲覧の`hasTranscript`は従来のClaude経路だけに付き、この件数取得で他CLIの記録閲覧が有効になるわけではありません。

Codex・Muse・Copilotの上限は1回の読み取り4MiB、1行256KiB、1ファイル512MiB、保持する子の材料256件・イベントID2万件です。途中までしか読めない履歴や、破損・上限超過は未取得として扱います。一覧は64件まで。ファイルが入れ替わる・縮むと読み直します。改行のない末尾は書きかけとして次回へ残し、改行まで読み終えた状態だけを反映します。シンボリックリンク、複数ハードリンク、通常ファイル以外は読みません。

Codexだけは、256KiBを超える行でも、先頭4KiB内の正式なenvelopeが子lifecycleと無関係だと確認できる場合、本文を保持せずJSON構文・UTF8・後方のdiscriminator重複をstream検証して読み飛ばします。対象は`response_item`・`compacted`、既知の`event_msg`の`user_message`/`agent_message`/`token_count`、および既知の非子`item_completed`（Extension等）です。SubAgentActivity、未知のheader、壊れた構文、深さ64超、discriminator/headerの保持上限超過は従来どおり未取得です。4MiBを超える1行も読込位置を進め、1回4MiB・1ファイル512MiBの上限を維持します。途中の履歴や改行未完の末尾を現在状態として配信しません。Muse/Copilot/Antigravityの読み取り規則は変わりません。

CLIが強制終了され、終了イベント自体が保存されなかった場合は、記録上の実行中が親の失効まで残る可能性があります。OSのプロセス数や時刻から勝手に終了扱いにはしません。記録形式はCLIの版で変わるため、未知の状態を正常な0件と扱いません。

Copilotの隔離実probeは、最初は隔離HOMEに認証が無いため停止しました。手元の認証を使う別probeはAPIへ届きましたが、導入CLIの候補モデルをAPIが`model_not_supported`で拒否したため打ち切りました。これはサブエージェント機能の不在を示しません。Antigravityについては、その後の隔離実起動で以下の所属記録を確認しました。Bobの実行ファイルはこの環境にありません。

## Antigravityの所属と作業状態の区別

`agy 1.4.12`を、新しい空の一時PJとprivate HOMEで3回実行しました。最初にネイティブ`invoke_subagent`で子を1件起動し、子の`send_message`による応答を確認しました。2回目はその自作会話だけを再開して`manage_subagents list`、3回目は同じ子だけをnative killしてlistを確認しました。3回とも終了コード0、各回のprint上限120秒・外側上限150秒内で終了しています。外部CLIやシェルで子を模倣していません。

親の `.system_generated/subagents/<子UUID>.json` の`conversationId`・`spawnStepIndex`を、同じ親の正式transcriptに記録された`invoke_subagent`と直後のprovider生成起動結果の子UUIDに照合します。起動時刻は正式起動結果の`created_at`です。クライアントからのパスや記録内のURIを辿りません。

実記録ではnative listの作業状態が`running`から`idle`になってもdescriptorは`SUBAGENT_STATE_ALIVE`のままでした。明示的なnative kill後に`SUBAGENT_STATE_KILLED`となり、listも0件でした。従ってALIVEは`countBasis: alive`の所属数・`state: unknown`として配信し、実行中とは表示しません。KILLEDは除外します。モデルの完了報告文、子からのメッセージ、古いlistの`running`を現在の作業状態と見なすことはありません。

親transcriptは4MiB・2万行・1行256KiB、直属の子フォルダは256項目・1秒、各descriptorは32KiBが上限です。配信する一覧は64件まで、件数は確認できたALIVE全件です。親会話/instanceの再照合、正確な親子UUID、親フォルダの実体、nofollow・通常ファイル・単一ハードリンク、読み取り前後の置換を検証します。未知のdescriptor状態、missing、未証明の起動、途中書き込み、上限超過は取得不明に戻ります。入れ子の子、現在の実行中/idle判定、子の本文閲覧には対応しません。旧kindのworking semanticsは変更しません。

[Antigravity実起動記録](../.aidev/works/20261107-antigravity-subagents/probe.md)とsanitizeした親子fixtureを保存しています。利用者の会話・paneは使用せず、private HOMEの認証コピー・raw記録は採取後に削除しました。

実CLIのfixtureは新しい空の一時PJと隔離HOMEだけで採取し、利用者paneや通常会話を操作していません。認証ファイル・account情報・利用者のプロンプト本文をリポジトリへ保存していません。production配線は一時サーバ・偽の親CLI・実記録形式から既存WebSocket event/snapshotまで確認します。[検証記録](../.aidev/works/20261107-nonclaude-subagents/)を参照してください。
