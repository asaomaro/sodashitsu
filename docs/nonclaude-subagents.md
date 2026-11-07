# Claude以外のサブエージェント取得

サイドバー・グラフ・Statusline・CLIの`subagents`は、実行中の子の件数と一覧を共有します。子は独立したpaneではありません。トークン利用状況の主/子内訳とは別の情報です。

| 親CLI | 取得する正式記録 | 確認範囲 |
| --- | --- | --- |
| Claude Code | 既存のSubagentStart/Stop等のフック | 従来の対応を維持 |
| Codex | 親rolloutの`SubAgentActivity`のstarted/completed/interrupted | 0.166.0で隔離実CLIの子起動・終了を確認 |
| Muse Code | 親session streamの`subagent.control.*`の開始・状態・result_ready | 1.4.14-R7309.1で隔離実CLIの子起動・終了を確認 |
| GitHub Copilot CLI | 親`events.jsonl`のcustom_agent.started/completed/failed | 導入0.0.362のSDK schema・生成fixtureで確認。実CLI往復は未検証 |
| Antigravity CLI、Bob Shell、その他 | 未対応 | 親子IDと終了を結ぶ正式記録の取得が未確認。件数を推測しない |

Codex・Muse・Copilotは約2秒ごとに、現在の親paneへ改めて結び付けられた会話の記録だけを読みます。保存済みの会話IDだけでは取得せず、現在のinstanceについてサーバが確認した証拠が必要です。読み終わるまでにinstanceや会話が変われば結果を捨てます。読み取りによるCLI・モデルの起動や、子への入力は行いません。

開始済みの子を一覧に載せ、終了・失敗・割込の記録で外します。履歴や同じイベントを読み直しても件数を足しません。Codexのinteractedは入力の配達なので、それだけで終了済みの子が再び実行中とは断定せず未取得に戻します。実行中の子への配達は実行中を維持します。未知の状態、読めない記録、未確認の親は`undefined`（CLIでは`null`）です。0件は取得済みの終了状態を意味します。サーバ再起動時も所属を再確認して正式記録の最終状態を読み戻します。

Codexの種類欄は記録にあるモデル名、説明は子の論理的なtask path末尾です。Museは記録にあるroleとobjective、CopilotはagentNameとagentDescriptionです。分からない値は補いません。子の記録閲覧の`hasTranscript`は従来のClaude経路だけに付き、この件数取得で他CLIの記録閲覧が有効になるわけではありません。

上限は1回の読み取り4MiB、1行256KiB、1ファイル512MiB、保持する子の材料256件・イベントID2万件です。途中までしか読めない履歴や、破損・上限超過は未取得として扱います。一覧は64件まで。ファイルが入れ替わる・縮むと読み直します。改行のない末尾は書きかけとして次回へ残し、改行まで読み終えた状態だけを反映します。シンボリックリンク、複数ハードリンク、通常ファイル以外は読みません。

CLIが強制終了され、終了イベント自体が保存されなかった場合は、記録上の実行中が親の失効まで残る可能性があります。OSのプロセス数や時刻から勝手に終了扱いにはしません。記録形式はCLIの版で変わるため、未知の状態を正常な0件と扱いません。

Copilotの隔離実probeは、最初は隔離HOMEに認証が無いため停止しました。手元の認証を使う別probeはAPIへ届きましたが、導入CLIの候補モデルをAPIが`model_not_supported`で拒否したため打ち切りました。これはサブエージェント機能の不在を示しません。AGYの最近の記録・導入helpに、親子IDと終了を結ぶ取得契約を確認できていません。Bobの実行ファイルはこの環境にありません。

実CLIのfixtureは新しい空の一時PJと隔離HOMEだけで採取し、利用者paneや通常会話を操作していません。認証ファイル・account情報・利用者のプロンプト本文をリポジトリへ保存していません。production配線は一時サーバ・偽の親CLI・実記録形式から既存WebSocket event/snapshotまで確認します。[検証記録](../.aidev/works/20261107-nonclaude-subagents/)を参照してください。
