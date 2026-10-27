# 次: 暗号化接続のagent recipient

現状: crypto/Protocolの9laneにagent、role agent、B信頼設定peer role agentが既にあるが、DesktopEndpointService.startはviewerだけ許可し、Webは暗号化時agent欄を隠す。RootAのDesktopAgentAccess RPCはplaintextなので、そのまま通してE2Eとは呼べない。CLI DesktopAgentSessionはRootRPCだけ。

候補を設計・独立点検してから実装する（まだコード/最終仕様なし）。
1. CLI自身の永続identity（owner file/POSIX or DPAPI CurrentUser Windows）と明示provider fingerprint pin。秘密/復号画像を中継RootRPCに渡さない。既存DesktopEndpointStore/Protectorのowner/path/atomic/sync基盤を再利用するため、Node専用identity accessorを分離する候補。CLI runtimeはserver依存がdevのみなのでexport/依存の設計が要る。公開RPCで秘密鍵を返す方法は不可。
2. Bのprivate Backplane Relay.agentsへ、agent専用の有限RPC channelを接続。Role agentはown capture start/children/一般操作を許さず、sealed agent laneだけで attach/observe/act/release。既存AgentAccessの2分/観測digest/入力後fresh image/入力排他/取消を再利用。
3. 人の暗号化viewerが、Bで既に許可したagent fingerprintを明示選択してgrantする。grantをrecipient fingerprint+origin/public machine+viewer source epochへ結合し、agentは自身のkey/role証明とcapabilityの両方を必要にする。信頼設定だけで画面/操作を与えない。
4. grantはBからviewerへ暗号化され、CLIのagent attachも暗号化lane内で送る。SODA_DESKTOP_GRANTに暗号用のprefix付きコードを持たせ、旧CLIがRoot plaintext RPCへ誤送信しないよう拒否する。CLIはprovider pinを独立確認し、embedded codeのfingerprintを勝手に信頼しない。
5. Rootは /desktop-e2e でopaque bytes/routing only。新roleのhandshake routingは通すがBでtrust/role/purpose/grantが一致しなければ停止。no plaintext fallback。
6. Agent peer revoke/CLI disconnect/viewer close/topology/source change/handoffで、保留act/observeと入力leaseを即失効。新application packetを受けない。必要な終了応答は既存認証EOF/drainの設計を再利用。

分割候補: CLI identity/transport基盤（未公開）→ B recipient/grant binding（private生成統合）→ CLI session/MCP/model/UI公開と2方向E2E。この順で小さくPR。既存shared sourceやnative/clipboard/file/mic許可の合成を自動でagentへ与えない。生成helper/画像/生CtrlSpaceのみ、実OS入力/鍵の自動trust/OSサービス更新なし。

参照コード: server DesktopEndpointService.ts, DesktopEndpointBackplane.ts, DesktopEndpointStore.ts/Protector.ts, DesktopAgentAccess.ts, DesktopRelay.ts agent_grant。client-core DesktopE2e.ts/Wire.ts。CLI desktopSession.ts / commands/desktop.ts。
