# 受信continuityのaggregate診断のみ

base8c2e。A14/A15はRoot実測でbaseline/total tone/wall/振幅/clip/scope/retirement/cleanup/生成clockが基準を満たしcontinuousだけfalse。旧receiptは最大streak/中断位置/flags1対4を保存しないため、何が中央でresetしたか未確定。今回の追加は次のRoot新jobでその区別をするfixture metadataのみ。A14/A15 source/receipt/readerを変更せず保持。author Windows/接続/model/audio/lock/UAC0。

## 変更と意味

- Receiver.csのPhase3Detectorに `continuity` を追加。最大streakはframes優先（同数ならwall大）で選んだ **同じ一区間** のframes/wallの組。二つの別区間の最大を合成しない。
- 元のstreakが>0で、既存条件によってresetされるときだけnonTone/broken/gap別件数とfirst/last reset wallを保存。理由は重複可能（同一windowでbroken+非toneなど）。zero streakに続く無音窓を「連続区間が何度も切れた」と数えない。tone期nonTone/broken/gapの全window件数とbaseline broken/gap window件数も別保存。
- first/last tone・reset・flag時刻は **receiver capture開始のStopwatch相対ms**。絶対時刻/ID/個人情報を含まない。tone期とはbaseline終了後の測定期（信号前/後のzero窓も含む）で、全windowが実toneだったと偽らない。
- Phase3Capture.Drainの既存Action<short[],bool>契約、flags&5でのpartial破棄/broken伝播を維持。新internal任意metadata observerをAの同じassembly内だけから設定し、実GetBuffer flagsの1(DATA_DISCONTINUITY)/4(TIMESTAMP_ERROR)をbaseline/測定期別に数える。own observerは同threadのprimitive counter/相対clock読取だけでI/O/allocating native処理/throwを追加しない。BCはobserver未設定で既存経路のまま。観測未接続はcaptureFlagsObserved=false＋flags件数nullで表し、未取得を0観測にしない。
- JS detector.mjsの既存pure referenceに同集計を反映。DetectorChecks.csは新fieldsをpure generated data/reflection/JSON辞書で検査し、native/COM/endpointを呼ばない。

**不変**: RMS/magnitude/clip、baseline>=90、tone>=290/span>=5700、同一streak>=280/wall>=5500、gap>60/broken/nontoneでreset、既存continuousは一度trueなら維持、所有/権限/fresh/TTL/packet/partial/zeroize/cleanup、A/run-a/absolute/BC/session/全builder/prepare/safety、製品ロジック。最大gap49msからgap原因を新しく作ったり、TIMESTAMP_ERRORを無視して通す変更はない。

Microsoft一次資料 `_AUDCLNT_BUFFERFLAGS`: [flagsの定義](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/ne-audioclient-_audclnt_bufferflags)。DATA_DISCONTINUITYとTIMESTAMP_ERRORは意味が異なるため診断件数を分けるが、両者での既存resetは維持する。

## author検査

新5生成回帰: broken中央/非tone中央と終端/初期baseline broken/flags期別/大gap、同一区間frames+wall/未知flags区別、C#既存predicate/flags-resetとobserver接続のsource確認。旧JS referenceで4FAIL、旧Receiver sourceで接続確認1FAIL→git-common-dir recovery事前退避から2source byteExact復元。これは **JS動作4件＋C#source wiring1件** の負例で、C#実compile/実行ではない（ログ/restoration.json）。復元後A/BC関連88PASS（positive-restored.log）、全MJS syntax0（syntax.json）。source-sha256.jsonは3runtime+test、関連不変9files、Windows未実施を記録。

Linuxにdotnet/mcs/csc無し。C#compile/生成exeの成功は未証明。新C#generated checksは旧Receiverでもコンパイル可能になるよう新methodをreflection経由、fieldsをJSON辞書経由で検査する（method不在/metadata不在でpure例外→exit2）。Rootが実C#負例を取る場合、private source copyで旧8c2e Receiver.cs＋新DetectorChecks.cs＋残6同source→generated-checks専用mainをfresh csc compile（compile exit0）→pure exe exit2を期待する。verify原本を一時旧版に書き換えない。正例は新8sourceからのpure exe exit0。

## Root再compileと新job

Receiver/DetectorChecksはA全3exeとBC全7exeへ同梱されるため、**既存A8source→3exeおよびBC12source→7exeの両builderをfresh outputへ実compileする必要がある**。builders自体・native製品C#は変更0。Root-only adapter作者UIへfrozen normalized3SHAを共有済み。compile/pure/sealsの実結果はRootのみが別証拠として追記する。旧bin/旧approval/旧jobを流用しない。sourceが2C#+1JS変わるためA/BC新manifest/prepare source pinsも更新、製品7package全buildは不要。

独立review（/root/review_audio_integration）完了、追加must/shouldなし。reviewerは4source/test SHA、9不変file、2復元SHA、旧4+1負例→88PASS/30syntax0を独立照合した。追加検査/Windows0。Root実音声/原因確認/合格は未証明、このmetadata追加だけでA14/A15を成功に読み替えない。
