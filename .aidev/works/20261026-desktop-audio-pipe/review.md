# 独立レビュー

対象は `34d60222` からの未接続 native audio foundation。Host・ネットワーク受口にはまだ組み込まれておらず、この差分だけでは実音声の取得を開始しない。

## 指摘と修正確認

- P2: `WindowsDesktopAudio.cs` の pipe ACL は owner SID の allow のみで、NETWORK SID の deny または remote client の明示拒否がない。Windows の named pipe は既定で SMB 経由の接続も受けるため、設計の local-only を保証しない。同じ owner 資格を持つ remote client が接続枠を消費し得る。PID 一致確認を維持した上で NETWORK SID を拒否する等の制限と ACL 回帰検証が必要。[Microsoft の説明](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipes)
- 解消確認: `OwnerSecurity` は継承を無効にし、NETWORK SID の FullControl deny と owner SID の FullControl allow を明示した。WindowsIdentity は using で解放する。generated ACL test は両 SID・権限・拒否/許可・非継承を検査し、実 local owner/PID 接続テストも維持する。再点検で追加の指摘なし。
- 実装担当から NETWORK deny を除いた runtime negative が source activation 前に失敗し、計5種の negative 後に正しいソースへ byte 一致で復元したと報告された。本レビューで試験を重複実行していない。最終 positive の結果は検証記録へ記載する。

## 確認した点

- client PID と現在の許可を確認してから source factory を呼ぶ。拒否された接続では render endpoint の列挙・activation を行わない。
- WASAPI の COM interface slot、WAVEFORMATEX の pack、shared render loopback の設定、GetBuffer/ReleaseBuffer、COM 初期化と解放、silence/discontinuity と PCM 寸法の上限を確認した。
- pipe 待機と書き込みは有界。停止時は pipe を閉じ、worker の join 期限を超えた場合を成功扱いしない。次段階の統合には、設計どおりの fail-closed 終了処理が必要。
- Node parser は固定サイズと連番・安全な timestamp を検査する。Opus import/接続/encode の active 確認、保持2枚、setImmediate の圧縮、古い音声の破棄、stop 時の timer/socket/encoder/PCM 解放を確認した。
- generated-source tests は実音声を取得せず、実 SID ACL・PID・factory 順序・PCM framing・停止を検証する。WASAPI の実 device 互換性・実音声・ブラウザ統合はこの工程の検証範囲外。

コードの独立点検のみ実施。進行中の build/unit/native checks/negative の重複実行はしていない。最終検証結果は実装担当の検証記録へ記載する。
