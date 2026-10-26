# 他製品との差分をおすすめ順に実装する

利用者の指示: おすすめ順に全て進める（2026-10-26）。前回の6項目の範囲に狭めず、今回列挙した10項目を対象にする。機能は小さいPRに分け、各PRを実装/検証/独立レビュー/merge/反映する。未完了を完了扱いしない。既存dirty rootをreset/switch/pull/commitせず、mainから独立worktreeで開発する。

- [ ] 1. PNG画像・HTML/表書式のclipboard。RTFも保持するがブラウザの対応形式を通知する。旧text互換、別bulk接続、有限chunk/世代/所有者/取消/最終適用時の許可を検査（taskcheck必須）。
- [ ] 2. デスクトップ内のupload/download/D&D、転送一覧、cancel/resume。既存remote_work転送と区別し、既存ファイルの暗黙上書きを避ける（taskcheck必須）。
- [ ] 3. 複数monitorの検出/切替/同時表示、個別座標/DPI/対象変化時解除（taskcheck必須）。
- [ ] 4. native動画の回線/負荷に応じたFPS/解像度の適応。設定上限・表示倍率/OS解像度と分離（taskcheck必須）。
- [ ] 5. native codec選択（H264 4:4:4、HEVC、AV1）。OS/GPU/browserの実capabilityを交渉し、非対応を偽装せずfallback（taskcheck必須）。
- [ ] 6. 仮想display/headless。ドライバーの存在/導入/権限を区別、実機設定を自動で変更しない検証経路も用意（taskcheck必須）。
- [ ] 7. UAC/昇格アプリ/サインアウト後signin。既存保護サービスの許可と世代/利用者操作を守る（taskcheck必須）。
- [ ] 8. 複数viewer。共有sourceと各viewerのbackpressure/許可/取消を分離、操作は明示排他（taskcheck必須）。
- [ ] 9. Linux/macOS native capture/input backend。OS許可とbackend利用条件を通知、実OS入力は自動試験しない（taskcheck必須）。
- [ ] 10. WSSを含む全経路のE2E。peer識別/鍵確認/nonceとreplay/世代/再接続/多viewerを設計し、中継に平文や鍵を渡さない（taskcheck必須）。

基盤: 旧peerに未知fieldを送らない。共有/clipboard/file/画面変更の許可を統合しない。生成画面/メモリ内clipboard/fake OS backendで検証し、現ユーザーのclipboard変更や実OS入力/ロック解除/OS設定変更を自動実行しない。OS権限や導入物が必要な機能は、必要物と検証範囲を明示し、実装済みと実機確認済みを区別する。
