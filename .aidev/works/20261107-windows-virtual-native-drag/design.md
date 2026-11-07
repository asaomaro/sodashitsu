# U10: Windows所有IDDモニターのExplorer直接drag

Base: main 8687e50c。実機操作は禁止、runtime実装とmock/生成検証のみ。sr-pc所有者はbackend担当。

## 対象と境界

Windowsの通常Default desktopに専用IDDで追加した所有モニターだけを対象とする。private desktop、Windows仮想desktop切替、UAC/Winlogon、native Linux/macOSは対象外。初版は単一所有virtual sourceの共有を含み、virtualMonitorsによる物理source併用は拒否できる。通常の物理画面dragは既存動作を維持。

新しい明示opt-inとhost由来ready proofを組み合わせ、旧hostや要求なしではvirtual dragを公開しない。公開proofはfiles/resource fences/virtualDisplay/通常画面を必須とする。host内部の入力証明はsource/control epoch、live所有lease、選択モニターと構成・範囲に結び付ける。device消失/再作成/resize/構成変更/secure遷移で失効し、同名deviceや古いepochへ引き継がない。

既存の同SID/active console/Default/非昇格Explorer、750ms・二重選択、入力解放ACK、COPY専用、許可root、1000項目/100MiB、取消後の退役を維持する。clientがmonitor/device/ファイルpathを追加指定して権限を得る仕組みは作らない。

## 所有と点検

- 本担当: protocol desktop options/ready・feature negotiationで必要な最小追加、server DesktopProvider/DesktopSharedCapture、WindowsDesktopHostと必要なnative生成checks、関連tests/docs。
- UI担当: RemoteDesktopWindow等の表示gateとopt-in。bool/ready契約を直接調整し、こちらではUIを編集しない。
- taskcheck対象: protocol能力交渉、host pointer/lease/monitor条件、server/shared source証明伝搬・失効・旧host拒否（状態/プロトコル/安全に関わるため）。最終差分全体の独立reviewをrootまたは別担当が実施。
- 文書と検証記録は最後のcrossにまとめる。root全体CIと重複する全体testは流さない。

## 検証

署名前: fake所有device/clock/monitorによる許可成功と、旧host/未要求/物理source/別epoch/範囲外/同名device置換/resize/取消/secure/UAC拒否、共有viewer操作排他、既存通常drag回帰。採用テストの旧版負例とsource byte-exact復元を記録する。

署名後: 実IDDモニター上のExplorerから実browser-PC Explorerへcopyしhash照合、DPI/座標、取消/権限解除/device終了時の停止、元構成復帰を確認する。署名driver未取得のため未実施。mock成功を実Explorer dropや実IDD取得の合格に数えない。
