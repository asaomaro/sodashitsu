# 7B1: サインアウト状態の保護scopeの準備

第10段階の暗号化agent経路の後、サインアウト後の専用desktop agentを小さな差分で実装する。既存のowner/logon/processに束縛したDemandStart leaseを常駐化しない。最初の差分はWindows側の読み取り専用の状態検査と生成検証で、service導入・新しいcapture/input route・常駐起動は有効にしない。

## 境界

新しい検査は通常ロック中・UAC・既存signed-in ownerと別のpurposeを持つ。SYSTEM caller、対象が非0の物理console sessionであること、WTS state/username/tokenの各queryが期待に合うこと、input desktopがWinlogonであることをそれぞれ検査する。どれかの不明・例外・取得失敗を「ログオン利用者なし」に読み替えない。session取得前後を照合し、途中の切替を拒否する。

MicrosoftのWTSQueryUserTokenはログオン利用者のprimary tokenを返し、呼び出しにはLocalSystemとSE_TCB_NAMEが必要。成功したtoken handleは必ず閉じる。APIの失敗一般をsigned-outの証明には使わない。実装で仮にERROR_NO_TOKENを対象に限定しても、その値だけでsignin状態を確定しない。実機での戻り値・遷移の確認は別途必要。

WTSGetActiveConsoleSessionIdの0xFFFFFFFFはconsoleの未接続/切替中を含むため拒否する。WTSActiveは仕様上ログオン済み利用者の状態なので受け入れない。WTSConnectedについても、それだけでsigned-outと判断せず、成功した空のusername queryとtoken不在・正しいinput desktopとの積を必要とする。

読み取り専用のOS呼び出しを小さなhost interfaceへ閉じ、生成hostでquery順序・handle close・変化時拒否を検査する。結果には候補のsessionだけを渡し、username・token・認証情報を保存/表示しない。取得前のscopeを保持して取得後/入力前に再確認する上位の世代barrierは後続差分へ接続する。今回のguardだけでframe/inputを許可しない。

SYSTEMのprimary tokenのSeTcbは`GetTokenInformation(TokenPrivileges)`で読む。偽装client用の`PrivilegeCheck`へprimary tokenを渡さない。bufferを有限サイズで取得し、LUIDの一致と現在有効な属性を検査する。重複・不正長・無効/除去済みの対象privilegeは拒否し、有効化操作は行わない。独立点検でAPI契約の不一致を発見し、この方式へ修正した。

## 後続

- 7B2: 固定Root/machine/ownerと専用identityに束縛した最小agent/enrollment。一般exec/file/terminal/pluginをSYSTEMへ公開しない。管理者保護の導入物・秘密の保存・更新/失効境界を独立点検する。
- 7B3: 専用workerのpurpose/nonce/process/console世代、画像のみのsealed route、1viewerと明示view/control・期限・取消を接続する。別user/ownerのログオンで終了し、通常user agentへ権限を持ち越さない。
- 7B4: installer/UI/利用手順、生成Root/B/browser/worker結合、負例、全体/独立レビュー。実サービス導入・実signin/UAC操作は自動試験しない。

7B全体、task7全体をこの準備だけで完了にしない。

## 確認した一次資料（2026-10-28）

- [WTSQueryUserToken](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/nf-wtsapi32-wtsqueryusertoken): 権限、成功/失敗、token handleの寿命。
- [WTSGetActiveConsoleSessionId](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-wtsgetactiveconsolesessionid): consoleと切替時の戻り値。
- [WTS_CONNECTSTATE_CLASS](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/ne-wtsapi32-wts_connectstate_class): WTSActive/WTSConnectedの意味。上記の積による拒否方針は本製品の保守的な設計で、実OS互換性の確認済みという意味ではない。
- [GetTokenInformation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation) / [TOKEN_PRIVILEGES](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-token_privileges): primary tokenの読み取りと可変長のprivilege配列。

終了直前にもWTS state/name/token不在を再確認し、同一console上でsigninが始まった変化も拒否する。ただし複数のOS照会はatomic snapshotではなく、返却時点の不在や途中のABAを保証しない。後続のWTS/desktop event epoch barrierを必須とし、候補だけで取得・入力を許可しない。
