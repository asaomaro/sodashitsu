# Phase3 A/BC protected protocol negotiation

A run-a.mjs / BC session.mjs の viewer offered array に保護画面 protocol が無く、Relay の elevatedRequested 条件が false だった。両箇所だけ DESKTOP_PROTECTED_PROTOCOL を追加。features/elevatedDesktop/protectedMicrophone の opt-in、専用 microphone lane、権限/TTL/採点/cleanup は不変。製品 source 編集なし。

## 生成検証

protocol-negotiation.test.mjs は実 fixture の接続 array/start options を隔離 VM で評価し、checked-in DesktopRelay の elevatedDesktop/protectedMicrophone 代入式へ生成 caps と渡す。実 WS/native/device は起動しない。feature encoder は opaque marker とし、bit encoding 自体は対象外。旧2 source へ一時置換すると2件失敗（negative-old-fixtures.log）、git common recovery に保管した byte を戻して完全一致、A/BC pure と合わせ18PASS（positive-restored.log）。全 A/BC MJS syntax exit0。復元 SHA と8 C# unchanged SHA は restoration.json。

Windows 実行/音声/モデル/入力0。root の別 readonly 実機 positive は INPUT+PROTECTED/features:true の組合せであり、本fixtureの microphone-only resource lane と同一試験ではない。fixture欠落の根拠は既存 features:true のまま旧2fileが落ちる生成回帰と Relay predicate。

## 再配布境界

C#8 source は base と byte 一致、製品 C# 編集も無し。A8/3exe・BC12/7exe の既存コンパイルをこのJS-only修正で再実行する必要はない。root が実行前に既存 source/binary seal を再確認し、新しい MJS source manifest/job を prepare する。実受音/UAC/lock の成功はこの source 検査から主張しない。独立レビューは固定 commit 後に依頼。
