# Provider別の子の中断・再開監査

Base 98eb55a6。Cursor(b) fixed seriesは別treeでroot review済み、ここへ混在変更しない。Windows・実モデル・実ユーザー会話操作なし。Codex修正の件数を他providerへ推測適用しない。

## 取得経路の突合

agentStart.tsの起動可能23kindとmodel.ts/messages.tsの会話連携12kindを確認。

|種類|既存子取得経路|再開の正式根拠と現在の監査状況|
|---|---|---|
|Claude|SubagentTracker hook + child observations|正式SubagentStartはresumeでも発火。現60秒Stop tombstoneは即resumeを拒否する。旧Start遅配との区別が必要なためguard単純解除は禁止。同期Stopとversioned profileの順序proofを調査中。|
|Codex|親SubAgentActivity + 正式runtime status + 自子record|6cdc hotfix済み。started所有proofはinterruptedでも保持、成功interacted後だけalive/unknownへ復帰。terminal単独・foreign/no-start/unknownkindは復帰不可。|
|Muse|親subagent.control.* + nested child binding|unknown/interrupted status後の正式runningは復帰可。terminal時のchild binding消去とresume時再bindingを独立監査中。writer未確認を不具合確定とはしない。|
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
