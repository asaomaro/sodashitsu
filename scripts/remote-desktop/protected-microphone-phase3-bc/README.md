# 保護マイクphase3 B/C生成fixture（Aから分離）

製品/A fixtureを変更しない新source/SHA。Windows実行、lock/UAC、native token/COM実動、設定変更はこのsource準備では行わない。合成検証を実機成功の代わりにしない。B/CはAの「昇格receiverによるDefault受信」と別の試験で、いずれも **receiverとaudio actorは通常user**。

## 観測の区別

Bは実lockの後も専用固定CABLE capture receiverだけを観測目的で継続する。これは新fixtureだけの同SID/logon/session/非SYSTEM非昇格判定で、製品のWTS lock拒否を変更しない。BのreceiverはWTS0/1を区別し、双方の読み取り中に状態が遷移しても同一identityを推定で失効させない（unknown -1は拒否）。実lockはself/owner双方WTS0から記録し、LockWorkStationの戻り値を実lockとしない。

製品DesktopProvider.epochはconfig世代でnative desktop counterではない。ここではown private server内だけで実DesktopResourceChannel.beginの元の引数/戻り値を維持して受理されたmic resource grantを観測し、clean/supported/physicalcloseからその同一grantの失効を確認する。`epochBasis:resource-grant / nativeDesktopEpochKnown:false` として公開せず専用receiptへ記録する。SYS workerの非公開counter値を取得したとは言わない。production inspector/Runtime/import注入は使わず、private fixture childの起動前importだけ。

captureの実IAudioClient.GetBufferSizeをreadonlyで取得する。render側の実buffer長は製品actorから未公開なので、要求100msや時刻を「実buffer長」として扱わない。Bは実際の最後signal・quiet開始・capture buffer frames・停止遅延を記録し、固定2500ms＋実capturebuffer分までにquietへ達し、同一quiet100窓/1980msを要求する。この上限は検証fixtureの事前上限でありゼロ遅延停止の主張ではない。render実buffer測定は未取得と残す。quietは997Hz非検出だけでなく左右RMS/997magnitude各10以下、gap60ms/断絶で連続をresetする。quiet後の再signalは失敗。

CはWTS unlockedを維持し、通常receiverはInputDesktop=Defaultを要求しない。実mode証拠はrootが確認したown UAC対象と、正式readyの`windows-gdi/elevated-uac/secureDesktop/protectedMicrophone`の一致。Default成功、他のUAC、ACKだけ、source未達をUAC受信成功にしない。synthetic=trueや不明なsynthetic型は拒否し非合成証拠を明示する。997Hz300frames/絶対20ms/6秒、baseline2秒、同一streak280+5500ms/総290+5700ms/gap60ms等はAの固定detectorを使う。

## compileと純粋checks

`node build-fixture.mjs <新規出力dir>` は新BC4source＋固定A4source＋製品native4source、計12sourceを直接Framework64 csc /platform:x64でcompileする。出力はreceiver-bc/probe-bc/probe/operator-bc/uac-noop/generated-checks/generated-bc-checksの7exe。compileだけでnative/audio/GUIは起動しない。Aファイルはincludeするだけで変更しない。compile receiptの12source/binary7SHA、exit0を確認し、C#generated-checks/generated-bc-checksだけで純粋検証ができる。Windows compile自体はまだ未実行。

`node --test pure-checks.test.mjs` は合成B/C evidenceの拒否、B/Cのscope差、元method意味を保つepoch observerを確認する。Node reference checksはC#実動の代用ではない。

## 既承認試験をrootが実行するための段階

利用者への追加承認を要件化せず、rootの排他枠/fresh対象/復旧経路の確認を内部goへ結ぶ。operatorは **mainrunnerから起動しない**。

1. rootが候補HEAD/clean/build/非admin session1/同SID-logon-activeconsole/固定未使用CABLE pair/既定でない/unmuted/volumeを確認し、既存の正式なmemory-only解除/own UAC取消が使えることを確認する。未確認ならB/Cを開始しない。古いclaim/go/PIDを流用しない。
2. prepare.mjsへscenario BまたはC、productRoot/productHead/fixtureBin/gitExe/jobRoot/port18000..18999/固定capture/renderをseedで渡す。新jobdirにapproved:false/expiresAt:nullを作るだけ。root実行直前に4分以内expiryとapprovedを設定する。PIN/credential/tokenをmanifestへ入れない。
3. 通常user hidden Nodeでrun-bc.mjsを起動。own1pane/NodeREPL/cwd/agentnull/assistant0/履歴preload無効・loopback private state/authを先にwarmし、Workerもprewarmする（lock中でもendpointは開かない）。media0のwarm-armedでrootが必要な解除を正式経路で一回だけ行い、`go`をCreateNew。fresh unlocked/Default後に通常receiverを起動し、両endpoint未使用/own identityを確認してarmed。ここまでlock/UAC/画像保存は無し。
4. rootはreceiver-manifest.jsonのcontrollerPid/startticks/binarySHAを確認し、既存復旧経路確認の `recovery-ready.json` を `{ready:true,controllerPid,atMs}` で30秒以内に作る。同jobの `operator-go` をCreateNewした後に、operator-ready.json（Bはsource/actor/baseline準備後、Cはown source要求前）の到達後だけ固定operator-bc.exeへこのmanifest pathを渡して明示起動する。cold source待ちの前には起動しない。rootの所有確認の代わりにこのfileの有無だけで復旧可能と推測しない。

### B

operatorは同user/通常権限/activeconsole/unlocked/Default/ownerPID+start+SHAを再確認し、root-goとfresh recoveryがあるときだけ待機。runnerは実source=elevated-defaultを開始し、mic running直後zero pumpで既存2秒期限を維持、actual actor PID/start/module SHA/通常tokenを証明。receiverのbaseline2秒の後、6秒toneを開始する。operatorはstable-tone（同一40窓/780ms）を待ち、復旧fresh確認後 **LockWorkStationを1回だけ** 呼ぶ。15秒で到達しなければlock0で失敗する。

receiverはself/owner WTS0、実signal消失/quietを観測。runnerは同resource grant invalidationとactor PID/startの実退役を **自分のcleanup前** に確認する。lockが最後tone生成から500ms以上前であることを要求し、単に6秒producerが終わっただけの無音をlock停止としない。transport閉鎖後も生成時計は予定どおり進み、送信したふりはせず生成終了時刻と区別する。

request-restore.json後はrootが既存の正式memory-only経路で解除する。runnerはnative-restoredを待ちfresh unlocked/Defaultを再確認。元mic socketの実closedを個別観測する。まだopenなら同じ旧idへ生成非zero frameを再提示し正式stopped/unavailable/closeを観測し、無応答はunknown failureとする。その後、新socketへ使用済み旧ticketも再提示して拒否を別に観測し、新actorが現れず、その後も2秒quietを保つことを要求する。current streamを新造して代用しない。unknown/復帰/受音再発は失敗で状態を保持する。

### C

root operatorはown uac-noop.exeの固定SHAを確認し、同user/fresh recovery/goから `ShellExecuteEx(runas)` を1回だけ発行する。own Noopは承認後起動してself identity/elevationをprivate receiptへ残し、何も操作せず終了する。要求通知はactualUacUnconfirmedとして扱う。

runnerは実source=elevated-uacへ到達するまでtoneを出さない。rootはそのown prompt（別ユーザー/別appでない）をfreshに確認して `own-uac-confirmed.json` を `{confirmed:true,sameUserConsent:true,credentialFieldsAbsent:true,jobId,noopExeSha256,atMs}` で作る。別credential/別userまたは判別不能なら拒否する。確認10秒以内＋正式native readyだけでreceiver-go/baseline2秒→6秒toneへ進む。receiverは自分の非昇格/ownerlogon/session/WTSunlockedと固定CABLEを検証し、実受音のframe/wallで採点する。

受信result後にrequest-resolve-own-promptが出たらrootがown promptだけaccept/cancelする。resolved通知に加え、cancelまたはown Noop PID/start退役、fresh Default/unlocked復帰を確認する。operatorはexpiryで自分だけexitするが、UAC promptが閉じた証明にはしない。復旧不明時にconsent.exe等の新PIDを推定killしない。

## 終了/未知

stopfile→receiver self TTL/物理close＋owned child exit0→private server close0→actual actor PID/start退役→CABLE両端session0/mute/volume/default不変を確認した場合だけprivate auth state削除。各rootごとのresultはevaluateB/Cが未取得をfalseへ倒し、失敗/unknownを成功扱いしない。own operator/Noop以外のprocessへkillや入力はしない。source/同意/実lock/受音未到達ならfailureとなり、成功のため設定・期限・採点を緩めない。本番parent/pane維持はrootがbefore/after確認する。

### 保護マイクの接続宣言

制御側の接続は `DESKTOP_MICROPHONE_PROTOCOL` に加え `DESKTOP_PROTECTED_PROTOCOL` と `protectedMicrophone` feature を提示する。`features:true` / `elevatedDesktop:true` だけでは Relay の `elevatedRequested` が成立しない。音声専用 lane は従来どおり microphone protocol 1個のみ。入力許可用 protocol はこの測定には追加しない。MJS 更新後は新しい job/source manifest を作り直す。C# source は変更していないため、この修正だけでは再コンパイル不要だが既存 source/binary seal の再確認は必要。

Aと同じ、既存sealed shared run-aのkeepaliveを使いviewer-open直後から1秒ごと正式heartbeatを送る。OPEN/approval期限/issuesを確認しcleanupでown timerを停止。frame ACKでprovider freshnessは更新されない。製品5秒guard/全期限/採点は不変、新job/source manifestが必要。
