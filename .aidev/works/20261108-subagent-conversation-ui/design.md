# 子会話UIの移行（利用者承認済み仕様）

旧仕様の「親の情報ウィンドウ内に子会話を展開」を、新仕様の「agents一覧で子を選択し、子専用会話画面を開く」へ置換する。親の情報ウィンドウは子のモデル・effort・状態・利用状況を保持し、会話本文と会話表示ボタンは置かない。

## 段階と所有

1. Webの一覧選択と専用会話窓。既存readonly transcriptを再利用。親名/子名/送信先を明示。親への依頼は下書きの編集確認後、別の明示送信操作でだけ `agent.prompt_checked` を使う。未対応peerへのunchecked fallbackはしない。
2. TUIも同じ導線へ移行（別commit）。
3. 正式 `agent.subagent_control/send` 契約が固定後、direct能力＋有効leaseを受け取った子だけ直接送信可能にする。ACKは受付として表示し、delivery-unknownは自動再送しない。
4. 終了子historyの専用入口を新会話画面側に保持し、子usageは本文可否と独立した取得契約で会話/情報両方へ表示する。

段階1のreadonlyは中間成果であり、3/4の機能完了を主張しない。既存の過去履歴・他CLIの取得の未完台帳は消去せず、この置換先へ引き継ぐ。

## 境界

- 子idをpaneとして扱わない。選択は親pane＋子id、親instance/kind/refkind/session、machine/client/connection/verifiedのscopeへ固定する。
- scopeが変われば窓を閉じて下書き・inflight結果を破棄し、旧本文/送信結果を新接続へ出さない。
- 現在一覧から外れた既取得子は同じ親scopeで既存server grantに従うreadonly閲覧を継続可能。明示hasTranscript失効は本文を外す。終了=作業完了とは推測しない。
- 親送信は別の送信先であることを常時表示。blocked actor/古いinstance/旧serverは既存checked APIが拒否する。自動送信・承認回答・モデル呼出は追加しない。
- 既存会話窓と同じ移動/resize/初期focus/ESC、狭幅表示、既存テーマ色・button feature属性を使う。

## 検証

Web関連既存意味test＋scope/late/blocked/明示送信の負例、実Vue/ブラウザDOM4テーマを検証する。旧Sidebar/PaneInfoを戻して新導線が失敗することを確認し、byteExact復元する。全体CIは統合ownerに任せ重複しない。最後に作者以外の独立レビューを行う。

Windows/利用者pane/実会話/実モデルには触れない。
