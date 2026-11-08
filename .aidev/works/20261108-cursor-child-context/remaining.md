# 残件の範囲と条件（削除しない）

- Cursor: この単位は終了子の保存済み文脈量/上限だけを接続。現在一覧/件数、子自身の消費input/output/cache/reasoning/total/costは未接続。installed CLIのafterAgentResponseは親UI requestごとにリセットしたturnEnded値を渡すが、managed childでの自己hook到達性は未証明。親hook値やmetadata.lastUsedModelを子へ流用せず、hook ledgerは作らなかった。消費値には、正式な子自身のresponse usageとgeneration/birth/ownerの結合、重複/累計の意味証明が必要。
- Copilot: b54の終了collectionは正式started/completed/failedのtoolCallIdと時刻等のmetadataだけ。子本文・子数値のopenerは未接続、toolCallIdは子session UUIDではない。親events/親session.usage_recordを子自身の本文/使用量へ読み替えない。正式child session/record bindingが必要。read-only環境調査でLinux npm package1.0.105を確認したが、以前の0.0.362 bundled SDK型をこの版の実確認と混同しない（現packageにsdk/index.d.ts無し）。未対応を上流API不存在とは言わない。
- 安全な子への直接指示: 現実装の正式外部入力transportはCodexの既存owned daemon＋loaded child＋canAcceptDirectInput=trueだけ。parent-managed falseを迂回せず、ほかkindは現在parent-draft。Cursor内部child hostのresume/親tool呼出しは、外部ユーザー入力capabilityの証明ではない。追加にはprovider正式target/owner/canAcceptとfresh scope/lease/ACK-vs-unknownが必要。推測CLI入力・別agentへのfallback・無断送信は行わない。Claudeは別担当調査、他providerもAPI不存在とは断定しない。

実managed-child DB・実モデル・実Windowsの追加実測はこの単位では行っていない。生成schema/SQLite/real hook IPC/authenticated own API/実DOMの検証と区別する。根拠が不足する残件はこの条件を維持し、同じ探索を繰り返さない。
