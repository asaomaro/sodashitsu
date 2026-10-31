# 管理者画面の共有動画・通常ユーザー音声

新sharedProtectedVideo feature bit11・B cap・option・publicReadyを独立して交渉する。既存sharedProtected/実worker protectedVideo/nativeVideo証明に加え、各viewerのnative/shared/音声hintとBのローカル許可が揃ったときだけ既存共有sourceを利用する。

SYSTEM取得workerの音声・追加codec・UDP・自動調整・cadence・mic・clipboardは開かない。SharedCaptureはprivileged nativeAudio/protectedAudio claimを拒否し、private windows-qpc-v1を検査して内部B subscriptionにのみ渡す。Bが通常ユーザー音声のpublic proofを作り、私有フィールドをviewerへ出さない。

SharedNativeの一つのphysical video IDとSharedAudioの一つのordinary-user PCM/Opus actorを使い、消費・描画ACK・音声ON/OFFはviewerごとに保つ。roleは音声要求時だけdynamic import/起動し、SYSTEM helperに音声命令を送らない。先頭viewer終了や一方audioOFFで残りを止めず、最後の消費者・physical source終了で停止する。元期限・QPC・device receipt/実childcloseは単独protected audioの実装を共用する。異なるfeature/設定のgroupへ暗黙で参加しない。

権限・protocol・共有状態/退役はtaskcheck/cross対象。確認は生成画像/PCM/facts、loopback/所有pipeのみ。実保護OS・service・device変更なし。
