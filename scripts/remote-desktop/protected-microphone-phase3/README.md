# 保護マイク phase3 A：新しい生成検証fixture

このディレクトリは検証専用で製品の動作を変えない。旧phase2のfixture本体は失われているため、旧SHAと同一とは扱わない。phase2結果は `.aidev/works/20261107-protected-microphone-native-session/phase2-record.md` を参照。今回の受信器・detector定数・clockは新source/SHAとして実測前に固定する。

現在はsourceとLinux上のメモリ内生成校正のみ。Windows compile、昇格receiverの実動、実WASAPI受音、UAC/lock操作は未実行。Aは **receiverだけ昇格／製品audio actorとprivate Node serverは通常user**。B/Cは下のrecipeのみで、このAプログラムから自動実行しない。利用者への新しい承認依頼を作るためのフラグではなく、既承認試験をrootがfreshな対象・独立taskcheck・操作枠と結び付ける内部実行ゲートを使う。

## 固定した判定

48kHz/mono/16bit/960samplesの997Hz、amplitude8000、300frames/6秒だけを生成する。音声API/既定端末/物理micは使わない。Workerをprewarmし、絶対20ms deadlineと最大16msの末尾spinを使う。OS timer・priorityの変更は無い。欠番、逆順、worker/main/callbackの20ms以上遅延、async callbackは失敗。main callbackは同期WS送信だけ。baseline/post-toneのzero intervalをtoneの直前で停止し、絶対producerとの二重稼働を避ける。finallyでworkerを終了する。

受信器は明示IDの `CABLE Output (VB-Audio Virtual Cable…)` captureだけ。renderは明示IDの対応CABLE Input。どちらもactive/各roleの既定端末ではない/unmuted/volume>0、開始前active session0を要求し、設定を書き換えない。rootは列挙候補が一意で対応する固定pairかを先に確認する。IMMDevice.GetDeviceを使い、GetDefaultAudioEndpointは既定端末との一致を**拒否**するreadonly比較のみに使う。loopback指定はしない。shared stereo16bit48k conversionが利用できなければ失敗する。

baselineは実wall2秒・最低90窓、左右RMS/997Hz magnitude各10以下。toneは左RMS4000..7000・997Hz magnitude6500..9500・clipping0を検出条件とする。左右の最大RMS/magnitude/clipは匿名数値として残す。これらは失われた旧detectorと同一と主張せず、生成理論RMS約5656.85・magnitude約8000から事前に固定した新閾値。

phase2と同じ最低総290窓かつfirst→last wall5700ms、**同一streakで**280窓かつwall5500msを要求する。wallgap>60ms、capture DATA_DISCONTINUITY/TIMESTAMP_ERROR、非toneでstreakを切る。単なる300frame/ACK/音声長の計算で受音成功としない。raw PCMはmemoryのみで、file/logに保存しない。合格のため閾値を後から緩めない。

## Source/校正（実音声無し）

- `node --test scripts/remote-desktop/protected-microphone-phase3/pure-checks.test.mjs`
- `node scripts/remote-desktop/protected-microphone-phase3/calibrate.mjs`：100 zero ticks、2秒、device/socket未接続。
- 同scriptに `generated-tone`：300frames/6秒をメモリ中だけで校正。
- `DetectorChecks.cs` はWindows compile後に単独実行できる純粋生成チェック。native facts/COM/audio clientを生成しない。Node版detectorの合格をC#版の実行結果と混同しない。

## Windowsで後から行うcompile/実行順（今は未実行）

1. rootがWindows操作枠と候補製品HEAD/clean/buildを固定する。本番server/既存pane/appには入力しない。旧claim/job/portを流用しない。
2. 通常user hidden Nodeから `build-fixture.mjs <新規出力directory>` を呼ぶ。固定Framework64 cscへargv配列で直接渡す。PowerShell/Bypass/driver/service/trust変更は無い。receiverはwinexe、probe/生成checksはconsole exeだがwindowsHideでのみ呼ぶ。compile source8件/SHA、binary3件/SHA、各exit0をcompile receiptへ残す。compileだけでreceiverは起動しない。
3. 生成checksを実行しC#側の純粋判定も確認。Windowsの100tick無音声clock校正も新SHAで通す。これは実受音合格ではない。
4. `prepare.mjs <private seed.json>` は `approved:false/expiresAt:null` のmanifestを新jobRootへ作る。seedはproductRoot/productHead/fixtureBin/gitExe/jobRoot/port18000..18999/固定captureEndpoint/renderEndpoint。normal Node24自身のSHA、全fixture sourceSHA、compile receiptSHA/binarySHAを持つ。PIN/tokenを入れない。
5. rootがfresh sameSID/logon/session/activeconsole、固定CABLE pair未使用・volume/mute/default無変更と操作枠を確認し、manifestのapprovedと4分以内のexpiryを実行直前に設定する。実行時にも候補git HEAD/clean、Node/source/binary/compile sourceSHAを再検証する。manifest自体やendpoint IDをstdoutに出さない。
6. `run-a.mjs <jobRoot/manifest.json>` を通常user/hiddenで起動。CreateNew claimは一回。通常Node ownerのPID/startticks/exeSHAをnative取得。own cwd/state/固定NodeREPL1pane/agent null/assistant0/REPLhistory空/preload無しでprivate serverを先にwarmし、own local-authのPIDとloopback cookieで認証する。秘密はrunnerのmemory以外に転送・表示しない。製品が作るprivate auth stateは正常終了後削除する。
7. `phase-warm-armed.json` はmedia0。rootが必要なfresh解除を既存の正式memory-only経路で一回行い、jobの `go` をCreateNewする。runnerはfresh native preflight後に `receiver-manifest.json` と `phase-awaiting-elevated-receiver.json` を出す。rootはこのown manifest/receiver binarySHA/Default上の自作fixtureだけを確認し、既承認のOS UAC導線でreceiverを起動する。runnerがrunas/PIN/lock/UACを自動操作することは無い。
8. receiver自身が自己elevated=true/非SYSTEM、owner通常権限、同SID/logon/session/activeconsole/unlocked/Default、ownerPID/start/exeSHA/短TTL、CABLE両端未使用を確認してarmed receipt。normal probeもreceiverのPID/start/SHA/tokenを再確認する。昇格processのimageは既存WindowsSigninProcessEvidence同様のQUERY_LIMITED_INFORMATION/QueryFullProcessImageNameで読み、MainModuleのVM_READ権限を前提にしない。sourceを開始しreadyのbackend=windows-gdi/secureDesktop/protectedMicrophone/mode=elevated-defaultを厳密確認。別mic ticketを使いactor running直後はzero pumpを先に維持し（既存無frame2秒を延長しない）、私有子process treeからexact `soda-native-host --role user-microphone --module UUID --sha256 SHA` を一意に確認し、実DLL SHA/通常権限/ownerlogon一致を採取する。親モデル・ACK・別preflight actorのSHAでは代用しない。
9. zero pump→receiver go。receiverはcapture未使用を再確認し、renderのsession1は証明済みown actorが開始した分だけ許す。own actor PID/start/exeSHAと通常tokenを再確認する。baseline readyが非無音ならtone0で停止。絶対300tone→zero pumpへ戻し、receiverの10.5秒有界測定完了を待ってからmicを止める。
10. 成功はissues0/実receiver同一streak-wall判定/clock成功に加え、actor stop・PID/start退役・receiver物理closeとPID/start退役・own server close0・CABLE両端session0/mute/volume/default不変を要求する。正常時だけprivate state削除。終了不明はfalseでstate/匿名診断を保持し、未知processをkillせずrootへ返す。既存の本番parent/pane集合はrootがbefore/after確認する。

native factsは製品の `WindowsUserMicrophoneRole.Read` を同一compileに含めてprivate reflectionで呼ぶ（Main/endpointは実行しない）。native TokenGroups/LogonSID/ProcessIdToSessionId/WTS lock事実を弱めず使う。raw SID/logonSID/認証値/音声内容はreceiptへ出さない。argvには専用manifest pathだけで、PINは一切扱わない。

## B/C recipe（追加実装・独立点検後にのみ実行）

B：新job/新state/通常receiverでtone安定を独立確認→root正式lock→first WTS lock、source epoch失効、actor停止/物理close、最終tone wallを匿名採取。端末の実buffer長に基づくdrain窓後は無tone。旧stream/旧epochへgeneratedframeを送り直しても再開しない、解除後も旧actor/stream非復帰を確認する。今のA receiverはelevated Default限定のためBにそのまま使わない。

C：別job/通常receiverとown no-op昇格要求だけを準備→rootがfresh own UAC画面を確認→実source=elevated-uac/windows-gdi/secure/protectedMicを再証明してbaseline/6秒受音。Default上のA成功をUAC成功へ転用しない。別user/対象不明ならmedia0。rootがown要求だけaccept/cancel→own no-op退役/Default復帰を確認する。AのDefault限定receiver/manifestを緩和して使い回さない。

B/Cの前には既存のfresh unlock復旧が使えることをrootが確認する。使えなければ事実を返し、lock/UAC/PIN再試行ループ・新credential保存・自動ログイン設定を行わない。

### 保護マイクの接続宣言

制御側の接続は `DESKTOP_MICROPHONE_PROTOCOL` に加え `DESKTOP_PROTECTED_PROTOCOL` と `protectedMicrophone` feature を提示する。`features:true` / `elevatedDesktop:true` だけでは Relay の `elevatedRequested` が成立しない。音声専用 lane は従来どおり microphone protocol 1個のみ。入力許可用 protocol はこの測定には追加しない。MJS 更新後は新しい job/source manifest を作り直す。C# source は変更していないため、この修正だけでは再コンパイル不要だが既存 source/binary seal の再確認は必要。

### 受信器の取り付き診断

失敗時 `result.json.failureStage` は receiver取り付き、protected source ready/schema/proof、mic ticket/lane/running、actor、baseline/cadence/result/stopの固定段階（`A_FAILURE_STAGES`）、`other` / `unknown` のみ。元の `fixture-failed-closed` は維持し、例外本文は保存しない。これは停止箇所の識別であり token access 等の原因確定ではない。JS更新後は新jobとmanifestをprepareし直し、旧approval/expiry/goを再利用しない。

失敗時の `failureEvidence` はschema検証済み ready のbackend enum/保護・mic bool、正式protected failure code、正式mic state enumのみを保存する。一般 `error` はcode enum未定義のため `desktop_error_unclassified` とし、message/code本文を保存しない。観測をguardへ転用せず、元の生値に対する検証とTTLを維持する。

受信器の `receiver-armed.json` 待ちは90秒（rootの画像確認/UAC承諾往復用）。全体の承認期限は最大240秒のまま、各待機pollで期限・問題を確認する。期限延長や旧job再利用は行わず、他のidentity/media/採点条件は変えない。

receipt はCreateNew後のJSON書込み中にも存在し得るため、armed/baseline/result/server-readyのpollはSyntaxErrorとENOENTだけ既存期限内で再読する。完全JSONは元のidentity/proof guardにそのまま渡し、access/busy/その他IOエラーは即拒否。`failureClass` は `syntax_error/io_missing/io_access/io_busy/other`、`failureEvidence.receiptLastErrorClass` は過去の読取エラー分類（最終原因の断定ではない）。C#と期限は変えず、新job/source manifestが必要。
