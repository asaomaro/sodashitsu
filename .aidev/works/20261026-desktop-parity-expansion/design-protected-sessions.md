# 第7段階: 昇格アプリ・UAC・サインアウト後のsignin

利用者の「すべて対応」を継続。7A（現在ログオン中のownerの昇格/UAC）と7B（サインアウト後の最小desktop agent）に分ける。7Aだけで第7段階を完了にしない。既存lock解除の安全境界を弱めない。

## 7A: 昇格/UAC

local allowElevatedをunlock/virtual/Inputとは別に保存し、viewer側も接続ごとに管理者画面を明示要求する。既定off・ブラウザへ非永続。旧peerにはfieldを送らない。仮想画面要求との併用は当初拒否し、実画面へfallbackしない。

専用subprotocol/caps/options/helper-readyの積で交渉。新保護serviceだけがSYSTEM workerを対象sessionへ起こす。service lease purpose bitはunlock=1/virtual=2/elevated=4とし、旧2引数leaseとvirtual/both文字列は互換を維持。新しい4〜7のみ固定modeとして受け付ける。どのpurposeからも許されないrouteへ進めない。

installed clientがread-onlyで現在のinput desktopを調べ、elevated-default（Default）かelevated-uac（Winlogon）だけを要求する。serviceはowner SID/logon/session/process handleとcreate time/heartbeatを検査し、workerにも認証済みpipeを通じて期待logonを渡す。任意desktop名・token・path・accountを要求させない。

workerは入力/取得前にSYSTEM、active console session、WTSユーザーSID/logon、lock状態とinput desktopが期待に合うことを検査。elevated-defaultはlogged-on ownerのDefaultのみ、elevated-uacは同ownerがunlockedのWinlogonのみ。従来locked Winlogon workerは別mode。異なるuser/session、signout、lock/UAC/default遷移で保持入力を解放し終了、接続し直して操作許可を再取得する。

保護sourceは原則GDI・画像のみ。clipboard/file/audio/native video/monitor mode変更は許可しない。UAC用routeにSASを許可しない。UACや昇格処理を自動承認せず、利用者が共有画面で操作する。例外内容は固定理由へ変換し、PINやwindow titleを記録しない。

fake desktop/owner/logonとkernel pipe/生成画像でmode別guard、scope prefix、許可撤回、保持キー解放、旧helper拒否を検査。実UAC生成・実昇格操作・実OS入力・lock/unlockは自動試験しない。Windows compile-onlyを両端とCIで確認し、ブラウザはsynthetic helperのprotected modesで検査する。

## 7B: サインアウト後signin

現owner process/logonに結ぶDemandStart leaseは、signoutで終了する設計。これを単純に永久化しない。Nodeの汎用server/remote execをSYSTEMとして永続起動する案は採らず、desktop限定の最小agentを明示導入する。

最小agentは固定されたA接続先・owner/machine ID・desktop専用identityと許可だけを持つ。filesystem/terminal/exec/pluginを公開しない。秘密は管理者保護とDPAPIで扱い、コマンドラインやログへ載せない。signin目的の許可はローカルで明示、対話接続ごとに新しいview/control grantと期限を取得し、パスワード/PIN保存や無人自動loginをしない。

signed-out状態はWTS/token/input desktopを積で判定。別userがログオンしている場合は公開・操作せず、ownerがログオンした場合もsignin shareを終了して通常user側へ接続を切り替え、権限を再取得する。新logonで古いgrantを再利用しない。

永続credential画面を実用化する前に、第10段階のE2E暗号化・peer pin/鍵確認・nonce/replay/role/source世代の設計を合わせる。A中継が汎用RPCをsystem agentへ転用できないことを独立レビューする。第8段階のcapture/input排他との整合も必要。7Bはこの依存を解消するまで有効化しない。

## 根拠（2026-10-26確認）

SendInputはUIPIで同等以下のintegrityにだけ入力できるため、非昇格helperのままでは昇格appを扱えない。WTSQueryUserTokenはLocalSystemとSeTcbを要求し、token handleの漏えいを防ぐ必要がある。OS policyを無効化して回避せず、限定workerの検査を追加する。

- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
- https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/nf-wtsapi32-wtsqueryusertoken

未完了: 7A/7Bとも実装・検証・実機確認。7Bの最小agent/enrollmentとE2E依存は別差分で具体化する。

## 独立設計点検で具体化した7A境界

worker scope v2は固定tuple: protocol version、role/mode（locked-winlogon/elevated-default/elevated-uac）、lease purpose bits、owner SID、expected logon SID、WTS session、source generationとUUID nonce、broker PID+creation time、worker PID+creation time。serviceが認証済み専用pipeの最初にworker_scopeを一度だけ送る。workerは自身のprocess identityと認証済みserver identityを両方照合する。以後のviewer configureにscope変更項目を認めない。

v2 workerはnonceを含む別pipe namespace/prefixを使い、legacy worker IPCと混ぜない。serviceは逆方向のworker_scope_readyで同じtupleを確認するまでviewer configureを転送しない。後続frame/input/controlはこの確定scopeのstreamへだけ流し、serviceの現generation/nonce/worker processが違う場合は公開しない。

captureの前にscope/source-generationのticketを取得し、取得/encode後・公開直前にも同じticketとSID/logon/session/mode/desktopを再検査する。途中で失効したframeは破棄する。入力前にも同じscopeを検査し、失効後の待機inputは破棄する。保持キー解除はscopeがまだ一致する間だけkeyupを送り、既に失効していればtrackerをclearして終了し、新desktopへkeyupを送らない。

WTS ownerはforeground process ownerの意味ではない。7Aではownerの同じinteractive desktop上に、owner自身がRunAsで開いた別accountのwindowも対象にする。foreground processのSID一致で制限する実装にはしない。別WTS sessionや別logonへの越境は常に拒否する。
