# 他製品との差分をおすすめ順に実装する

利用者の指示: おすすめ順に全て進める（2026-10-26）。前回の6項目の範囲に狭めず、今回列挙した10項目を対象にする。機能は小さいPRに分け、各PRを実装/検証/独立レビュー/merge/反映する。未完了を完了扱いしない。既存dirty rootをreset/switch/pull/commitせず、mainから独立worktreeで開発する。

- [x] 1. PNG画像・HTML/表書式のclipboard。RTFも保持するがブラウザの対応形式を通知する。旧text互換、別bulk接続、有限chunk/世代/所有者/取消/最終適用時の許可を検査（taskcheck必須）。
- [x] 2. デスクトップ内のupload/download/D&D、転送一覧、cancel/resume。既存remote_work転送と区別し、既存ファイルの暗黙上書きを避ける（taskcheck必須）。
- [x] 3. 複数monitorの検出/切替/同時表示、個別座標/DPI/対象変化時解除（taskcheck必須）。
- [x] 4. native動画の回線/負荷に応じたFPS/解像度の適応。設定上限・表示倍率/OS解像度と分離（taskcheck必須）。
- [x] 5. native codec選択（H264 4:4:4、HEVC、AV1）。OS/GPU/browserの実capabilityを交渉し、非対応を偽装せずfallback（taskcheck必須）。
- [ ] 6. 仮想display/headless。ドライバーの存在/導入/権限を区別、実機設定を自動で変更しない検証経路も用意（taskcheck必須）。
- [ ] 7. UAC/昇格アプリ/サインアウト後signin。既存保護サービスの許可と世代/利用者操作を守る（taskcheck必須）。
- [ ] 8. 複数viewer。共有sourceと各viewerのbackpressure/許可/取消を分離、操作は明示排他（taskcheck必須）。
- [ ] 9. Linux/macOS native capture/input backend。OS許可とbackend利用条件を通知、実OS入力は自動試験しない（taskcheck必須）。
- [ ] 10. WSSを含む全経路のE2E。peer識別/鍵確認/nonceとreplay/世代/再接続/多viewerを設計し、中継に平文や鍵を渡さない（taskcheck必須）。

基盤: 旧peerに未知fieldを送らない。共有/clipboard/file/画面変更の許可を統合しない。生成画面/メモリ内clipboard/fake OS backendで検証し、現ユーザーのclipboard変更や実OS入力/ロック解除/OS設定変更を自動実行しない。OS権限や導入物が必要な機能は、必要物と検証範囲を明示し、実装済みと実機確認済みを区別する。

第2段階のresumeは同一共有窓での一時停止から再開。切断/再読込をまたぐresume、Explorerから手元への直接D&D、フォルダ一式は未対応とUI/docsへ明記し、一般的なリモート製品の全転送機能との同等性は主張しない。

第3段階の同時表示はphysical配置の一括canvas。複数画面のGPU合成とmonitor別の独立窓は未対応。actual複数モニターのcapture/input試験は行わず、fakeとactual readonly metadataを区別して記録した。

第4段階前半: native動画FPS/bitrateの自動調整を実装・独立レビュー・全体11,500件/ブラウザ17件（2 skip）検証済み。resolution barrierは後半の別差分で実装し、task 4は完了。

第4段階後半: 解像度の世代barrier、audio/peer維持、source/sentAt/freshAt分離、GPU lease安全、旧peer gateを実装。全体11,509件・ブラウザ22件（任意の長時間/性能2件skip）、両端Windows生成GPU検査・独立レビューと修正再レビューを通過。残り5〜10は未完了。

第5段階: codec交渉、実header正規化、非対応時の一度だけのH264復帰を実装。全体11,521件、新codecブラウザ9件・既存22件、両端Windows生成検査、独立レビュー通過。AV1/444の実hardware対応は当該両PCで未確認（実encode不可）で、software AV1 decode fixtureと区別する。第6〜10段階は未完了。

第6段階: PR #219でIDD/lease基盤、PR #220でローカル許可・protected purpose・helper/UI接続・署名package明示登録手順を実装。全体11,530件、browser12件、両端Windows compile/fake/拒否検査・driver Windows CI・独立レビュー通過。配布artifactは未署名で、署名済み配布/実DriverStore登録/実headless取得は未完了のためチェックは保留する。検証用unsigned版の自動導入、証明書trust/testsigning変更は行わない。第7〜10段階は未完了。

第7段階の準備: worker scope v2・期待owner/logon/session/process/nonce・不可逆epoch・通知処理marker待機・取得/圧縮/出力待ち後のframe拒否と入力遮断の基盤を追加中。RunProtectedはまだproduction routeから呼ばず、管理者画面/UAC/signinの有効化は未完了。7Aのservice worker handshake、purpose/ローカル許可、protocol/helper/UI接続を次の差分で実装する。7Bの最小agentはE2E依存を解消してから有効化する。

第7段階7A（2026-10-27）: local allowElevated、purpose bits4〜7、nonce別v2 pipeとsame-tuple ACK、actual workerへのNative Guard接続、専用WS protocol/caps/options/helper-ready積、A/Bのfallback公開前拒否、UIの接続ごとの選択とcontrol再取得を実装。RunProtectedは新worker routeへ接続済みで、既定permissionはoff。実サービス更新・SYSTEM worker生成・実UAC/昇格画面の取得/入力は未検証。7B signinはE2E/peer trust依存のため未実装で、task7のチェックは保留する。

第8段階8A: 同一設定・明示選択の通常画像を最大8viewerで共有取得する経路を実装・独立レビュー・全体11,583件/ブラウザ17件/独立起動確認で検証済み。各viewer ACK/切断/許可を分離し、Bの排他input・seq変換・最後のhelper終了待ちを追加。native動画/音声/保護sourceへの拡張は未完了でtask8全体は保留する。

第8段階8B: 同じ通常sourceのnative encoder共有、consumer別UUID/連番/pending、future-keyからの復帰、設定不一致のviewer限定fallback、画像onlyとnativeの混在を実装・独立レビュー・全体11,598件/ブラウザ27件/独立起動確認で検証済み。WS/WSSのみ。音声/UDP/adaptation/保護sourceの共有は未完了でtask8は保留。

第8段階8C: PR #227でviewer別UDP/DTLSとWSS復帰、source keyframe要求のID変換・合計100ms制限、Bでの共有encoder adaptation抑止、画像onlyからのUDP参加を実装・独立レビュー済み。合計11603件（全体11602＋再build後のPTY1）とbrowser24件で検証。音声/自動調整/保護source等の共有とtask6/7B/9/10は未完了。


- [ ] 11. 音声受信の独立許可と、手元マイクを接続先アプリへ渡す経路（2026-10-27追加）。Windows通常単独共有の音声許可、専用lane、生成PCM、private pipe、仮想audio render endpoint、明示getUserMedia、停止時track/queue破棄、旧peer gateを実装中。システム音声受信は既存Opusを利用。マイクは固定48kHz mono PCM/20ms、最大12未ACK・B最新1待機・stale期限で開始。仮想ケーブルの署名済み導入/録音側アプリ選択は利用者側で必要で、自動driver導入や物理speakerへのfallbackはしない。実音声デバイスでの録音/再生は未検証。Opus入力圧縮、共有source mic/audio、Linux/macOS入力は残件。


画質記憶はPR #228でmainへ統合。画像/動画/表示のマシン別autosave、無効draft維持、一時fallbackからの希望route復帰、旧窓終了による上書き防止を実装。全体11605件/browser3件/負例4件/独立レビュー・再レビューと独立smoke通過。音声/マイクはPR #229で実装・検証済み。Windows通常単独共有の初期経路は実装済みで、全体11619件/browser12件、Windows生成sink・CI・独立レビュー通過。実デバイスと実通話アプリでの検証、入力Opus/共有audio/他OS拡張は残る。task6/7B/8全体/9/10も未完了。


第8段階8D: 通常native sourceのシステム音声取得・Opus圧縮を共通化し、viewer別音声lease/停止/UDP→WSS復帰/加入前queue除外を実装。旧peerと音声許可OFF・画像先行を実WSで検査し、全体11628件/browser11件を通過。共有sourceのadaptationとprotected scopeの合成は後続。

第9段階9A: Linux Portal実験版とnative契約を実装。OS picker・private FD/serial固定、入力capability、生Ctrl+Space、logind I/O失効、入力後画像のfloorを生成検証。Linuxはlocal SODA_DESKTOP_LINUX_PORTAL=1必須。damage-only producerの静止時には新画像を保証できず1.5秒で明示停止するため、通常利用互換性は未完了。macOSは契約/導入条件表示のみでhelper未実装。task9のチェックは保留する。

第10段階10A: endpoint暗号状態機械を追加中。独立pin/peerRole、両hello署名、ephemeral ECDH/HKDF/AES-GCM、9 lane/direction別鍵、replay/ordered FIFO/受信8件16MiB上限、握手/Session closeを生成検証。まだ製品routeには有効化しておらず、鍵保存とpin確認/全lane中継/agent recipient/多viewerとprotected scope接続が残る。task10全体は未完了。
