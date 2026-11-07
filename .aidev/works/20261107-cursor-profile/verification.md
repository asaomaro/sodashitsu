# Cursor専用アシスタント (1)

installed cursor-agent2026.11.05-86047dfの--help/models--helpで正式モデル一覧を確認し、--list-modelsをtmp cwd/入力無しで実行。exit0、270個のid-label候補がすべて既存安全modelID文法に適合。モデルturn/会話作成/承認/ユーザー設定変更なし。独立effort flag/構造化effort一覧は未確認のため、モデルvariantIDをそのまま選びeffortは既定のみ。接尾辞からeffortを推測せず、非空effort指定はprotocolで拒否。

512候補上限は独立23512契約で限定拡張。server読取2MiB/10s維持、schema/追加行上限が同一定数。desktopIPCはschemaに従い512件を受け取り、Web/desktopメニューに追加の128件打切りが無いことを確認。512超のschema拒否/600入力を512へ抑制するテストは旧版128で負例fail、exactrestore済。

Cursorの船長/要約の種類・モデル保存、共通文字起こしdraft/no autosend/context失効7種類、通知会話詳細対象を追加。実ブラウザでCursor選択/モデルvariant/effort既定/保存とreload復元を確認。Grok既存経路は維持。

protocol16＋上限追加、model9、desktop96、Web8テスト成功。desktop/Web/TUI型確認0。server全型は先行Grok/Cursorの会話provider(2)未統合に依存し後段へ。旧製品5ファイルのみの負例はmodel/desktop/Web/browser各失敗、byteexact復元後全成功（restore.json/raw logs）。全体build/test二重実行なし、sr-pc/利用者pane/実マイク操作なし。
