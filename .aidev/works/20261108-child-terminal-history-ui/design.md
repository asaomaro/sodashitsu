# 終了子history UI

基点main86192d93。最終固定契約は7785881b/c416f4f7。下の初期調査で定めた安全境界を実装した。

既存入口の発見:
- Web ActionDispatcher.showSubagents は count>=1 の時だけopen。Web pane context menuにはsubagents項目が無い。
- TUI TuiDispatcher.showSubagentsOf と ContextMenu は count>0 の時だけopen。
- Web SubagentListDialog/TUI SubagentList は現在のAgentInfo.subagentsだけを表示。
- 子専用会話store/UiStateはactive一覧内の子が前提。Info本文と会話導線はすでに撤去済み。

追加UI:
- 既存一覧/key/menuをagent存在時に開けるようにし、現在/終了を分離して選択する。all-endedでも終了一覧から専用会話へ到達できる。
- 子専用会話内にも兄弟/終了selectorを同じ窓内に置く。Infoに会話を戻さずSidebar infoも再追加しない。
- 終了rowは別metadataとして保持し、active AgentInfoへ合流せずcount/footerへ加算しない。
- startedAt/endedAt欠測を0/到着時刻へ補わない。既存model/effort helperの引数型を必要な観測fieldのPickへ狭め、履歴表示のために偽startedAtを作らない。

API担当との重要境界調整:
- 7785881bは先行collection契約のみ。agentIdを再開/別attemptで流用し得るため、history選択を既存current APIへ送る設計は採らない。
- server発行entryId(UUID、formal source/attempt/birthごと)をrowに持つ。
- 既存transcriptは未知param stripを行う旧peerがあるため、専用strict agent.subagent_history_transcript / agent.subagent_history_usageへ分離する。
- historicalでは必須entryIdを送信し、旧peerや読取失敗でもcurrent APIへfallbackしない。control/sendは呼ばず、閲覧と親checked下書きだけ。

collection reader:
- single inflight、64/page・最大256保持。UUIDrevisionが変わる/resetなら以前のpagesを破棄。親machine/client/connection/instance/kind/ref/session/verifiedを前後照合、close/切替で即破棄。
- 10秒firstpage確認、同revisionでは既loaded tailを保持。revision欠測時は単頁だけ、moreやnonprogressを無限poll/pageへ使わない。
- pending/unavailableは0件ではない。unknownをterminalに変換しない。明示completed/aborted/errorのみ。malformed id/entryId/enumは省略してincompleteにする。
- metadataは必要fieldだけにwhitelistし、過長文字/保持量を有界にする。モデル/effortには正式basis付きfieldだけを使う。

所有予定:
common 新reader/test、observed metadata helper型。
Web history部品/test、ChildConversationWindow/storeと関連tests、SubagentListのselection slot、SubagentListDialog、ActionDispatcher、ContextMenu。
TUI ChildConversationDialog/SubagentTranscript/SubagentList、UiState/TuiDispatcher/ContextMenu/OverlayHostとTuiAppの必要最小配線、関連tests。
Web→TUIを小commitへ分割し、runtime/API本体には触らない。正式追加contractを取り込んだ独立worktreeで実装する。実model/Windows/利用者records操作なし。

実装系列（契約固定後）: 2f95b21f common → 5553d1be Web → df795adf 型互換/失効/選択scope → 5ce2b2c7 TUI → f3767409 readonly predicate明示 → bf980324 空pageと空collectionの区別。契約は7785881b/c416f4f7の重複pick6c5b8c63/068bfa33（root統合時不要）。追加RPCは agent.subagent_history_transcript / agent.subagent_history_usage の strict 3IDsに確定し、optional selectorを旧current APIへ送る案は採用していない。

Webは親の既存pane menu/keyから0 currentでも一覧selectorへ入り、終了entryを選ぶと専用会話へ移る。同じ会話内の「子の一覧・終了履歴」からも選べる。TUIは既存一覧/menu/keyと、子会話のHで同overlay内selectorへ移る。0 currentでは終了selectorを初期表示。Hで現在/終了を切り替える。readonly historicalではcontrolを起動せず、直接送信predicateも明示false。既存の親checked送信だけを利用者の操作で行う。

正式entryがunreadable/not_foundになれば新歴史本文を消してpollを停止する。従来current/graph記録の保持は変更しない。型外terminal/revisionは拾わず、pending・unavailable・続きのある空pageを「履歴なし」にしない。current/歴史を混ぜず、異なるentry/attemptにUIが自動fallbackしない。
