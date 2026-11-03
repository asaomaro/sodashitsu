# 通知の音声準備と表示タイミング

通知の表示・新着表示・アニメ開始を音声再生準備のcallbackへ移動。AssistantVoiceは準備中speaking=false、準備完了後speaking=true。CORE IPC/VOICEVOX HTTP双方の合成処理から再生開始を伝搬。WindowsはSoundPlayer.Load後の固定stdout marker、macOSはsayで一旦WAV生成後afplay、Linux WAVはaplayのspawnを合図にする。

停止/音声待機の置換/合成失敗時は文字通知のcallbackを残す。mainで最新epoch・source生存・有効設定・ロック状態を再確認。設定更新時はvoice.configureより前にepochを進め、古い設定の文字fallbackを抑止。

- desktop-assistant全30 files / 260 tests passed。
- 最終変更後のvoice/voicevox/main 3 files / 74 tests passed。
- desktop-assistant typecheck成功、build:host成功。
- Windows実機PowerShellでOS音声生成→SoundPlayer.Load→SODA_VOICE_READYまで成功。PlaySyncだけを試験用に外し、実際の音出しはしていない（native-prepare.txt）。macOS実機・可聴時刻の測定は未実施。
- negative control: voice.tsのみ修正前へ戻して準備中speaking=falseの検査が失敗（voice-negative.txt）。notifyBubbleのみ修正前へ戻して準備中通知非表示の検査が失敗（notice-negative.txt）。各試験後、保存した修正済みソースへ戻しbytes一致を確認。
- review_bubble_resize独立レビュー。停止時に文字通知も失う指摘を修正し、追加差分を再レビュー、必須指摘なし。
