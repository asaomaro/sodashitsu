# A21 private Native aggregate observer

Basef657。backend所有はNativeMic/Role/ProtectedMic getter、ここはA private-server/runAのみ。runtime追加module無し・FIXTURE_FILES12維持。public RPC/mic schema、合否/停止/expiry/権限変更なし。

Prototype fromViewerはReflect.apply元this/allargs/return/throwを保存し、正常returnしたstart候補idだけmax4instance/latest1を記録。正常returnはacceptedstartの証明ではなく、複数候補が同instanceに現れたら、同id/別id/cycleを問わずpermanentunknownになる（9cd521ad）。rawPCM/base64/endpoint/instance内容は記録しない。

server.close後のみgetterを最大2秒poll（元server退役待ち10秒の内側）。getterのexactid/nonce/coreclosed/physicalchild/binary/resource-release、max1/30s/nextstart clearはbackend契約。14fieldsはsource README参照。全shape/範囲/saturated/nullable意味を検査、不明を0へ補わない。

own wxserverreceipt→保存成功のみfixedchildIPC bool→runAは元server/actor退役後exactstreamidを選択してID無しownwxreceipt。診断例外/保存競合/IPC欠測はunknown、issues/measurement/retirement/stopmarker/exitへ使わない。stopworkだけ共有しduplicateIPC/disconnectによるwx再実行を防ぐ。

A21readerは別privateprefix、expectedhead/token/newNative/runA/privateServerpin未設定でRPC前停止。Native公式freezeはeb47add5 Native1746e5b9…/Rolee019020c…（最終review/buildは別gate）。Root統合HEAD・実source/bin/seal・actualstats観測は今後。
