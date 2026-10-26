# 第4段階の前半: native cadence

A capabilitiesからnativeCadenceを確認した場合だけDesktopOptionsへ追加し、Bはhelper-readyとの積で有効化する。helperはconfig opt-in時だけnativeCadence readyを返す。viewer readyには新fieldを出さず、既存media settings.adaptiveを使う。旧A/Bへ未知optionsを送らない。helperOptionsからnativeCadenceを除き、helperへは従来同様に無視可能なprivate configure hintを送り、readyで確認した場合だけnative_rateを送る。旧helperへ新commandを送らない。

最初の3 ACKをwarmupとして除き、最大24サンプル、8 ACKかつ1.5秒以上でp90 ACK/capture+conversion+encodeを評価（viewerがdecode時間を返すwindow3ではそれも利用）する。credit windowとACK時間、処理時間から維持可能なfpsを算出する。損失/送信待ちがあるときだけbitrateを下げる。固定的なWAN RTTだけではbitrateを下げ続けない。下限fps=min(5,user cap),128kbps、上限は開始時のuser cap。回復は10秒の余裕を待ち最大fpsの10%ずつ。履歴とsource instanceを共有しない。

private native_rate(id,fps,kbps)だけをhelperへ送る。同じencoder、同じ時計、同じgeneration/seq、audio、peer、画像snapshot、OS解像度、input/grantsを保つ。MF media typeは開始時max FPSを維持。helperは開始時上限を再検証する。cadenceは次frame期限へ反映する。bitrate変更のencoder失敗は既存video失敗通知経路へ戻す。

新modeはWSS/UDP共通。旧UDP bitrate-onlyの動作は旧helperとの互換として残す。FPS/解像度のうちresolution barrierは次差分であり、task 4は未完了。
