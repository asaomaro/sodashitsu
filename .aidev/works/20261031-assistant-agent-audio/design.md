# 設計

- CodexAudioは明示操作中だけcodex app-server proxyを接続。initialize→loaded/list→thread/read(id/cwd/idle)→最終所有/期限/取消検査→turn/start(localAudio)を一度だけ送る。create/resume/model/effort/API keyを使用しない。
- ファイルはサーバが所有する音声用領域のみ。Windowsアシスタント→WSLサーバへ有限chunkで転送し、rendererは送信先/pathを指定できない。
- 専用セッションのinstanceIdと実hook/記録で確認済みCodex sessionIdを両方固定。途中の差替え、disable、handoff、取消では送信を止める。受理後の会話処理は専用端末で確認する。
- 音声選択/録音の送信は明示。未対応kindは音声送信しない。ローカルWhisperは別の明示選択として維持。認識結果/モデル応答の実機精度とモジュール検証は区別する。


保存/寿命: 保存判定・作成・書込みを直列化し、保存済み+新規の200MiB/64件を検査。wx成功後のFD identityだけを失敗cleanup対象にする。通常5分retentionのunlinkを追跡して、suspendでtimer停止/物理削除のdrain、resumeは元のwall期限で再arm。close後の残ファイルは次の明示音声送信のsweepで期限切れを削除する。この停止中の保持はUI/文書に明記する。
