# 終了子履歴の配線（Cursor先行 / Grok次単位）

base86192d93。終了子をactive/alive countへ合流しない。Info内の会話へは戻さず専用子会話窓へ。現在の子が0でも認証済み親から履歴一覧へ到達できる。生snapshot/利用量/費用は削除しない。

## 契約

- agent.subagent_history: paneId/offset/limit/revisionだけ。256件保持・公開64件/page、current/fresh親scopeをread前後照合。status unavailable/pendingを0件成功へ変換しない。incomplete/omittedBeforeを明示。
- row.entryIdはサーバ発行UUID。同formal event/同public metadataの再検証では維持、別attempt/source revision/metadata置換で新ID。古い選択が同じchild IDの新runへ切り替わらない。
- agent.subagent_history_transcript / agent.subagent_history_usage: strict {paneId,agentId,entryId}、本文のみoffset追加。既存current RPCにはfallbackしない。旧peerはmethod_not_found、UIはそのまま未対応表示。履歴control/sendは呼ばず親下書きのみ。
- 選択entryは再検証済みのprivate targetにのみ結ぶ。source/entry object identity/proof.currentを毎回照合し、認証失効・親/instance/ref・子run置換・closeで旧grant失効。

## private target / 読取り

collectorはgenericなprivate proofを保持するが公開rowへserializeしない。proofはサーバのprovider adapterだけが構成し、client path/role/model入力から作らない。HistoryServiceは4 physical tasks・caller 2秒。verifierは既存4 physical slots/1500ms、期限後も実終了までslot保持。対象は各source64/各履歴256の既存上限内。

本文は既存readTranscriptHandleの1MiB/200entries/text capを再利用し、child safe opened/current/unchangedをbefore/after検査、必ずfd close。履歴数値は独立singleton SubagentUsageServiceへexact-entry resolverを注入する。既存current usage service/既存64grantは変更しない。履歴readerのresolverが失効したらcurrentに戻らずunavailable。親数値を子へ転用/二重加算しない。

## Cursor先行

CursorChildObservationsのStop+DB exact lineage+直属childfile終端一致からのみ収集。private keyはowner source/child/file revision/lineage/terminalの固定SHA。child ID/settingsが同じでも新turnのfile revisionで別entryを選択する。自己観測済みmodel/effortのみ、createdAtは正式DB値、endedAtは時刻根拠が無いため省略。現在一覧/workingは未接続のまま。Cursor numericも既存fixed unavailableを維持。

## Grok次単位（現checkpointでは未配線）

Grok正式spawn/finishedのchild+attemptを記録し、非empty attempt、親namespace/reader generation/全EOF revisionをsafe re-openして終了proofを作る。新attempt、親file置換/rewind/partial/未読、親instance/ref変更では旧targetを失効。親設定を子へ流用しない。chat_historyとusage.jsonは用途別safe opener、双方の読取り前後で親attempt proofを再確認する。この正式proofがない段階ではGrok ended usageはunavailableのまま。既存B grantの拒否を単に削除して回避しない。

他providerの既存current閲覧/履歴grantは維持。この新終了collectionに未接続なproviderを『上流機能無し』とは扱わない。新規実モデル/Windows操作0。生成fixtureと実installed source/probe根拠は区別する。
