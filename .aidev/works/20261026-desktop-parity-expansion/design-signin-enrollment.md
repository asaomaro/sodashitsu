# 7B2a: 固定された登録情報と最小RPCの境界

7B1の候補検査の次に、専用agentへ渡す登録情報とRootから受け付ける要求の境界を固める。今回も常駐起動・service導入・実画面取得/入力を有効にしない。汎用serverをSYSTEMで起動しない設計を維持する。

登録情報はversion/purpose、UUID revision、設定対象のowner SID、固定のRoot HTTPS（loopbackのみHTTPも許す）origin/machine ID/43文字delegation token、専用providerの公開指紋、明示的なsignin許可と別のinput ceiling、登録済みviewer鍵だけを持つ。未知field・任意path/command/extension・非canonical URL・別owner・重複peerを拒否する。DPAPI/管理者保護した保存場所とserviceによる読み込み/鍵登録は後続で、このparserだけを信頼済み登録として使わない。

秘密をクラスの列挙可能fieldやtoJSON/inspect/errorへ出さない。networkへ渡す明示的なdelegation情報と、公開statusを区別する。decodeは有限UTF-8 bytesを同期で解析し、呼出側のbuffer/objectを保持しない。外部ファイル変更・失効の監視をparserに仮定せず、後続のservice lifetime/revisionで閉じる。

Root bridgeが送るJSONは16KiBで制限し、client.hello、desktop.capabilities、desktop.endpoint.status、desktop.endpoint.startだけに分類する。普通のdesktop.start・trust/initialize・exec/file/terminal/plugin/agentなどは表の追加をしない限り拒否する。endpoint.startは専用machine、固定Rootの/desktop-e2e、viewer roleへ限定する。image childに必要なparent/attachment/bindingは既存strict schemaとBのsealed invite照合へ渡す。相手の鍵の信頼・permit・暗号handshakeをこの分類だけで成立したことにしない。childの許可・保護source purpose・取得/入力のepoch barrierは後続の専用service/workerで積にする。

純粋な分類結果だけを返し、汎用ControlSurface/WsGatewayへraw method/paramsを転送する入口を作らない。未知methodや失敗を別経路へfallbackしない。制限を緩めるsource負例で、一般操作・別origin/machine・agent role・秘密の誤出力を検知する。

この差分の完成後も7B2の秘密保存/配布/service/専用agent接続、7B3 worker/epoch、7B4 UI/結合は未完了とする。

owner SIDの数字表現/上限と3つのwell-known service SID（18/19/20）を検査するが、全service accountや実在するuser accountの識別は行わない。後続の管理者enrollment/読み込みで、固定ownerの実identityとaccount typeを照合することを必須とする。parserのexpectedOwnerSidはその信頼済みloaderから渡し、Root入力から採らない。

数値構造の確認に用いた一次資料: [SID components](https://learn.microsoft.com/en-us/windows/win32/secauthz/sid-components)、[SID](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-sid)、[SID_IDENTIFIER_AUTHORITY](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-sid_identifier_authority)。本parserの件数・形式制限は完全なWindows account検証の代用ではない。
