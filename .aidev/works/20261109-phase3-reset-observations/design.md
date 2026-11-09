# A19後の受信窓診断

A19はtone298、max streak172、nonToneReset3、broken/gap0で不合格。閾値変更・PASS化・native/transport変更をせず、原因を区別するfixture専用metadataを足す。

CaptureのSILENT=2は今までflags1/4集計に入っていなかった。正式packet flagsのbaseline/tone別件数だけ追加し、未観測はnull、観測済0は0。flags2が実際にA19へ現れたという主張ではない。

既存条件streak>0&&(!tone||broken||gap>60)が成立した直前だけ最大8件を記録し、超過件数を別に数える。wallMsはreceiver stopwatch起点の相対値、precedingStreakWallMs=lastTone-streakStart（直前有効tone窓の期間）。開始/終端のsilenceによるresetも含む。各行はwallMs,precedingStreakFrames,precedingStreakWallMs,leftRms,rightRms,left997Magnitude,right997Magnitude,leftClips,rightClips,failureMaskだけ。PCM/endpoint/PID/name/path/文字列なし。

maskは1左RMS<4000、2左RMS>7000、4左997magnitude<6500、8左997magnitude>9500、16左clip非0、32broken、64gap>60。右数値は診断のみで、既存判定は左tone、clip総計など元のまま。baseline/reset/streak/continuous/finalokの式、capture drain、生成PCMは変更しない。

JS resultはコピーで外部改変が内部へ戻らない。C#は最大8匿名objectの配列snapshotを返す。履歴や本番音声protocolではなく私有検証fixtureのJSONのみ。

独立点検対象は判定不変・境界8・unknown/zero区別・raw漏洩・C#/JS一致。実Windows/C#compileはRoot限定、Linuxにcompilerなし。
