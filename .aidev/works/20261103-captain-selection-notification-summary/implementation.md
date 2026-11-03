# 船長の会話内選択・通知の作業要約・一覧からの端末表示

## 会話内の選択と保存

設定画面の5種類分のモデル/effort欄を撤去。会話の専用セッションに種類→モデル→effortの3選択欄と通知要約on/offを置く。選択を自動保存し、最後の種類と種類別モデル/effortを保持する。既知モデルに未対応のeffortは既定に戻し、未知の保存済みモデル/effortは保存済みと明示して維持。選択変更は起動中のCLIへ送らず次回の新規専用セッションへ渡す。

保存はcontrollerの直列queue上で最新値へpatchし、立ち絵や接続を作り直さない。通常設定のsaveは最新captainKind/agentProfiles/notificationSummaryを維持し、古い設定フォームから上書きできない。

モデル候補は接続先サーバが読み取る。CodexのキャッシュはopenVerified/サイズ上限、MuseはMSP initialize/initialized/model/listだけ（session/turn開始なし、shell/write無効）、Agyは実CLIで確認したtab区切りmodels。Claude別名/Copilot代表候補には契約/CLI制約の注記。固定argv、10秒/2MiB上限、Windowsのnpm shim解決、POSIX owned group/Windows taskkillで終了を待つ。成功終了でも残ったgroupを掃除。候補は5分cache/同時要求集約、失敗cacheは5秒。

## 通知の作業要約

標準オン、専用船長の待機・会話caughtUpを待って直近6件へ依頼。目的/作業/成果検証/未完了/判断待ち/返信案を要求。既存のペイン要約は出所と会話IDが一致しfreshな場合だけ再利用。旧cacheは保存先を確認後sourceKind/sourceSessionIdを返却時に補完。会話は新しいtail APIで末尾1MiB内の最後12発言を読む。source前後のactor/作業場所/verified会話ID照合、部分取得の明示、抜粋の総量制限を行う。

captain promptはidleOnlyを付け、サーバの最終queued-input guardでもidleを要求。明確なbusy拒否だけ待機へ戻し、送信不明の切断/timeoutは再送しない。資料は完結JSONのまま縮め、通知はデータと明示しツール実行や他agentへの送信は要求しない。応答はmarkerから次userまでの最後assistantを採用し、commentaryを最終要約へ取り違えない。

actor/pane/会話変更、batchのid/key/source/message変更で古い処理と結果を破棄。再接続の同scopeはmarkerから結果を回収し二重依頼をしない。旧本文と新しい返信先を混在させず、新batchでは本文を空にする。通知元fenceの失敗は通知文fallbackにも流さず停止。船長自身の通知を除外し無限ループ防止。明示的な要約更新を用意。要約中のoffは次の依頼を止め、送信済みturnを強制終了しない。

要約欄の返答は既存source-replyへ手入力本文だけを送る。返信先は明示選択し、失効時に別sourceへ自動選択しない。pendingで二重送信を防ぎ、送信待ち中に編集した下書きを消さない。

## エージェント一覧

各行をkeyboard操作可能なbuttonにし、current rosterのsourceをnativeで再確認してreply専用端末を開く。通知の有無には依存しない。hidden/別role/非main frame/旧actor/接続先違いを拒否。開いたWeb応答窓でも既存actor/workspace guardを使う。

## 検証と独立レビュー

アシスタント全単体、関連server5ファイル、protocol全単体、Chromium生成UI、全体build/typecheckを実施。UIではcascadeと無効effort解除、再読込での種類/モデル/effort保持、summary toggle保持、手動返信の二重送信防止と下書き保持、HTML無害化、rosterクリックを確認。model catalogのCLI read-only順序/kill/キャッシュ制約、idle queued guard、実際の末尾記録、部分取得、busy待機/同scope再接続/clear/batch失効を検証。

7つのnegativeログは修正だけ外した時の期待失敗。各実験後はソースのバイト一致で復元。

独立レビュー: review_resource_monitor（保存/権限/モデルreader寿命/安全なcache/tail）、review_bubble_resize（UI/保存競合/返信）、review_character_persona（summaryのscope/batch/最終idle/最終回答/旧cache互換）。指摘は修正し、各差分の再レビューで必須指摘なし。追加の通知元失効とfallback分離も再レビュー済み。

差分が複数機能へ広がったため、protocol+catalog、serverの読取/最終入力guard、desktop UI/保存/要約の3つの実装コミットと検証記録コミットに分ける。

最終検証: 全体build/typecheck、アシスタント253件、関連server83件、protocol全件、Chromium UI確認を通過。handoff前後で既存11paneを保持し、アシスタントphase=running/stage=readyを確認。稼働APIで5種類のモデル候補取得を確認（Claude3/Codex8/Muse3/Agy6/Copilot2、代表候補の注記を含む）。モデル一覧取得は読み取りだけでモデルのturnを開始していない。
