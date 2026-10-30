# macOS system audio

Linux native audioの共有/Opus/Node private pathを流用し、macOSの同じ許可済みdisplay/filterのシステム音声受信へ拡張する。画面/入力と別のローカル音声許可＋viewer要求の両方を必要とする。無効時の録音処理は起動せず、Node終了/無音中切断/元source失効/旧リクエストでの再開を防ぐ。

実機確認を除く残件を止めずに進める指示の次段階。macOS SDKのコンパイルと生成sample/偽SCK/Unix peerをhosted CIで確認し、実収録/OS入力/再生/権限登録/driver導入は試験しない。
