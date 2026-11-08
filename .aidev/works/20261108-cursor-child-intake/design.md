# Cursor子自身の設定と終了binding

初期base integration8a85748e、最終rebase先08b9c752。Root承認(b): DB lineage/createdAt＋child-self AARはモデル/effortのprivate観測だけ。現在存続/稼働中の証明にせず、Cursor current一覧/件数は未取得を維持。正式subagentStopと直属childfile終端一致だけを終了historyへ渡す。

所有: 新CursorChildReports/Observationsとtests、AgentReportSocketの専用whitelist、agent-hook-report.cjs、明示更新用AgentIntegrationInstaller、composeのreport fanout/closeのみ。親usage/starter/CLI settings/NativeReader current kindgateは緩和しない。新global hook自動導入0。終了historyRPC/UIは後続別commit。

自己contextと一致する正式model_id/model_paramsだけ。whole snapshotで最後の自己報告がfield欠測なら古いpairを混ぜない。親共通contextはno-update。正式モデルの代わりにDB lastUsedModel/type/suffix/親値/起動希望値を用いない。

offer時に親kind=cursor/instance/ref/verifiedを固定、PID報告があれば矛盾拒否、無ければ既存usageReportVerdictと同じbest-effort（PID検証済みとはしない）。queue2jobs/64pending、期限/親scope前後guard/close late discard。DB safe readerのphysical slot/2秒/サイズ/no follow/同parentUUIDを継承。型/数値/文字列のIPC上限を受口でも検証し本文を保存しない。

private getterは同entry/state/source/currentとsafe reopened DB/file revisionを再確認。Stop後の遅いAARは終端bindingを書き換えない。正式Stopとfile終端のstatus/parent/child/typeを照合。終了proofの記録世代が変わったら古いbindingを失効。hasTranscriptとusage権限を同一にしない。

独立taskcheck対象: 新IPC shape、scopeとqueue、safe opener継承、dedup/whole snapshot、Stop proof/再run失効、compose配線。生成fixtureだけで検査。実子hook発火/実モデル/Windows/ユーザー会話は未確認、生成入力を実取得成功としない。
