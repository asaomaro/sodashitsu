# Provider別の子の中断・再開監査

初期base98eb55a6、Musefix最終base638cb4d3。Cursor(b) fixed seriesは別treeでroot review済み、ここへ混在変更しない。Windows・実モデル・実ユーザー会話操作なし。Codex修正の件数を他providerへ推測適用しない。

## 取得経路の突合

agentStart.tsの起動可能23kindとmodel.ts/messages.tsの会話連携12kindを確認。

|種類|既存子取得経路|再開の正式根拠と現在の監査状況|
|---|---|---|
|Claude|SubagentTracker hook + child observations|正式SubagentStartはresumeでも発火。現60秒Stop tombstoneは即resumeを拒否する。旧Start遅配との区別が必要なためguard単純解除は禁止。同期Stopとversioned profileの順序proofを調査中。|
|Codex|親SubAgentActivity + 正式runtime status + 自子record|6cdc hotfix済み。started所有proofはinterruptedでも保持、成功interacted後だけalive/unknownへ復帰。terminal単独・foreign/no-start/unknownkindは復帰不可。|
|Muse|親subagent.control.* + nested child binding|unknown/interrupted status後の正式runningは復帰可。terminalで最後の正式durable child/session bindingを削除していたためprivate保持へ修正。terminal0/getter拒否、formal resume→running/EOFでのみ再利用、spawnclear/新bound置換/invalidclear/namespace失効を維持。親EOFのbytes0で補足を迂回しmodelが落ちる別欠落もMuse限定で修正。writerが全resumeで再boundするとの実CLI主張はしない。|
|AGY|正式spawn proof + 毎回のALIVE/KILLED descriptor|ALIVEは所属unknown、idle完了でもKILLEDと混同しない。descriptorを毎回再読し、永久terminal墓標は持たない。missing/unknown state/foreignは未取得。|
|Copilot|custom_agent.* / subagent.*|新event IDの正式startedで再登録、同event replayは無視。completed/failed後を勝手にaliveへ戻さない。selected/deselectedは子ではない。|
|Grok|正式_x.ai/session/updateとattempt|新spawn attemptで再所属、旧attemptの遅延terminalを新attemptへ適用しない。progressだけでは未所有子/終了attemptを復帰させない。|
|Cursor|固定Cursor(b)のchild-self AAR/DB lineage/Stop終端（private）|正式current membershipは未接続。新file revision自己観測は旧terminalを退役、同revision遅延AARは無視。既存active countを失わせる公開current経路自体が無い。|

会話連携はあるが子取得は未接続: devin / droid / qwen / qodercli / bob。起動可能だが同子取得は未接続: pi / gemini / cline / opencode / kimi / kiro / amp / hermes / kilo / letta / maki。今回と同じ既存復帰foldの対象外であり、子機能が上流製品に存在しないとの意味ではない。全providerへ無根拠に子機能を新造しない。

## 共通境界

NativeServiceはcurrent kind/ref一致、fresh parent proof、同instance/source、read前後のscopeを保持。親/instance/ref変更では旧子・設定・会話proofを失効させる。unknown重要イベント/foreign/no-startは未取得、0/workingへ変換しない。現在一覧・終了history・設定取得を別の能力として記録する。

## Claude一次根拠

- https://code.claude.com/docs/en/hooks#subagentstart （resumeにもSubagentStart、入力にagent_id/type）
- https://code.claude.com/docs/en/sub-agents#resume-subagents （同IDのnew runとして再開）
- installed 2.1.319の埋込み実装: `ero`がSubagentStart入力を作り、共通`dO` runnerがfor-await。`wve`がSubagentStop入力を作り、通常runner/interrupt cleanupがfor-await、cleanup stagesはawait。
- `Rle`は正常stream完了後にcompletedへ遷移する一方、watchdogはtimer内でfailedを先行公開しabortする。resume側finalizing guardにはfeature条件がある。全中断経路で旧Stop ACK前に再Startしない保証は未確定。
- 既存InstallerはStart同期、Stop非同期。共有script更新だけで新ordered markerを付けると旧async設定を誤分類するため不可。受信時刻・hook本体のDate.nowをnative run世代とは扱わない。

終了history RPC/Grok正式attempt proof/子usage実取得追加/保護音声実機/署名IDD外部依存の残件は維持。

## Muse根拠と検証境界

installed muse-bin-1.4.14-R7309.1のoffline schema generate-ts（model/auth0）から、SubagentTargetParams.subagentIdはdurable child id（3064付近）、ApprovalSubagentOriginはchildRunId/childSessionIdを区別することを確認。生成schemaSHA256 cb6cfdce4b216aaa5dfbdd8057949645c584cf78aaead80192bed73c0c0a5225。全resumeでsession固定/再bound通知発火を実モデルで確認したわけではない。最後に正式に結ばれた関係をprivateに残すだけで、公開active/会話権限は既存current-member/EOF/fresh/safe openerを必須とする。記憶上限MAX256は不変。

共通失効はNativeService tests、種類別再開はRecords/Reader/Muse/Grok/AGY/ClaudeTrackerの8suites192tests PASS。Muse2件の旧source負例はそれぞれ1fail→byteExact復元。Copilotは正式schema生成fixture、AGYはdescriptor、Grokはattempt通知を根拠とし、実サービス再開をこの監査で実測したものではない。Cursorは前固定111tests/型/root独立reviewで新record世代旧terminal退役を確認済み、current一覧未接続をここで実装したとは扱わない。
