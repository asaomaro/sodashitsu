# 独立レビュー

2026-10-26、実装と別のコンテキストでDesktopInputAcks、Provider、C# Host/input checks、synthetic helper、ブラウザ入力回帰を点検した。現時点で製品コードの修正必須点は見つからない。

- normal helperだけがconfigure/readyでprivate ACK pipeを交渉する。旧Bへ新ready fieldを出さず、Bはprivate fieldを外して既存strict readyを検査する。secure/旧helperはstdoutを維持する。
- stderrは96byteの行、64件の未完了seq、ASCIIの固定prefix、安全な整数に限定して扱い、診断本文を転送しない。ACKは実際にhelperへ送った未完了seqだけを一度消費し、stdout/stderrの重複を転送しない。
- ACK出力はOutputGateから分離され、成功したApplyInputの既存のseq/期限/権限/desktop検査を維持する。公開protocolの変更はない。
- parser/関連42件unitとブラウザ入力回帰の成功ログ、Windowsのpure input/native checksの成功を確認した。git diff --checkは成功した。

## 追加修正の再レビュー

stdoutを永久停止するsynthetic helperでは、後半の入力が既存の画像鮮度2秒以内に終わるタイミングへ依存する点を指摘した。修正後はlegacy/dedicatedを分け、dedicatedの初回burst全3件のACKをブラウザで確認してから、blurのreleaseで部分stdout ACKを閉じ、最大8件の保持出力を再開する。後半の通常入力は画像更新を維持するため、この指摘は解消した。

CreateNoWindowの検査失敗について、実装側は子PowerShellのprogress CLIXMLがstderrに混在することを切り分けた。SetUtf8Consoleのraw UTF-8 stderr設定、InputAckの先頭改行による診断部分行との分離、stderr全体一致ではなく単独ACK行を照合する検査へ変更されている。parserは引き続き固定ASCII行と未完了seqだけを採用し、診断を転送しない。この製品修正と検査変更に追加の指摘はない。

## 残る検証事項

この再レビュー時点では、修正後CreateNoWindow検証とlegacy/dedicated両ブラウザcaseが再実行中。以前のhelper-acks-native-pipes.logはframing検査失敗、native-final.logはProcess.StartのAccessDeniedで停止していたため、これらを成功扱いせず、最新の完了結果を記録する。製品差分の修正必須点はなく、git diff --checkは成功した。
