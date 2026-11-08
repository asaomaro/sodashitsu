# B/C clock診断接続のみ

base e46913db。run-bc.mjsのimportと既存catchだけを変更し、既存clockFailureEvidence accessorで由来が証明されたimmutable enum/receivedFrames/3timingをevidence.cadenceへ保持。任意Error/message/cause/偽cadenceは採用せず、既存failure='unreachable-or-unconfirmed'・失敗判定・finally/cleanup・全閾値を維持。A/run-a/absolute-pcm/BC session/C#は無変更。製品ロジック/package変更無し、C#再compile/全体build不要。

実source VMの生成2回帰（同じbranded snapshot保持・foreign/forged拒否）、BC意味8回帰、既存clock14回帰の計24PASS。旧BCだけへ戻して新snapshot保持回帰が1FAIL、foreign拒否はPASS。git-common-dir recoveryへ事前に自身のbytes/SHAを保存し、finallyでBC1source byteExact復元（restoration.json）。2変更MJS syntax0。A2sourceはe46913dbとbyte一致。

実Windows/model/audio/lock/UAC実行0。B/C実機開始はA成功後のRoot明示段階で、この診断接続は実行を許可/開始しない。新BC manifest/source pin更新が必要、古いjob/approval再利用禁止。独立review（/root/review_audio_integration）完了、阻害指摘なし。reviewerがruntime/test2SHA・A2e469不変を再計算し、旧1FAIL→24PASS/2syntax0を照合。追加実行0。
