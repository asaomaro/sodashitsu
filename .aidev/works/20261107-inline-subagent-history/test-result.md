# 情報ウィンドウ内の子会話

Base907c5b97（backendのCodex履歴/最新turn metadataを含む）。依存としてスクロールバー52704/子effort注記f0b6を重複pick、session effort型eded3eb7はf37cf428に重複pick。統合時はこの作業のUI追加commitだけをpickする。

メインpane情報のinline子一覧に、hasTranscriptで取得可能と確認済みの子だけ「会話」を表示。既存SubagentTranscriptWindowをinlineモードで再利用し、同じ情報ウィンドウ内で1件を展開/切替する。別dialog/別ブラウザ窓なし。読むだけで子への入力APIは追加しない。元グラフの浮いた記録窓はdefault動作を維持。既存800件上限/1.5sポーリング/隠れたブラウザ停止/結果折畳みを再利用。

親pane/instance/kind/session/machine/clientId/接続/active/proofを監視し、切替・失効時にunmountして遅い結果を破棄、定期読取りを止める。閉じた子のボタンへ自動再開はしない。

子モデルはmodelBasis=turnの正式modelのみ。roleや旧開始modelを兼ねるtypeから現在モデルを推測しない。typeはモデル行でなく未取得セッション名の識別fallbackとtitleに残す。正式model優先と未取得時省略をWeb/TUI sidebar/情報で共通化。effortはsession既定の新basisも許容し、注記を戻さない。Launch値/model suffixは使わない。

- 関連6suites278 tests pass（共通helper/Web sidebar/PaneInfo/既存Transcript/TUI sidebar/Usage）。追加既存layout/render2suites28pass。client-core/Web/TUI型0、protocol/core build0。全体checks重複なし。
- 既存PaneInfo意味testでClaude/Codex両kind、proofない子ボタンなし、同窓inline、入力0、mutationRPC0、閉鎖後poll停止、親instance/proof/active/切断中の遅い結果破棄を確認。
- 実Chromium/Vueの生成fixture: 同情報ウィンドウ内のrelative会話枠、指示/返答表示、外部dialog0、入力0、agent.subagent_transcriptだけ1RPC、閉じる、モデル+effort表示、4テーマ、statearia/元paneheaderinfo/折畳み維持。inline.pngを目視。通常pane/実model/OS/clipboard操作なし。
- 旧4製品sourceでcore再build: 9fail/20pass、DOMもfail。raw negative.txt/negative-browser.txt。4source SHA256/cmp相当のbyte比較で完全復元し、core再build0、29tests/同DOM再pass。restoration.jsonの4SHAは最終製品sourceと一致。

TUIの子会話閲覧overlayは次の独立単位。今回はTUI表示のモデルmetadata整合だけを反映し、未実装履歴を対応済みとしない。実記録の取得証明・読み取り安全性はbackendの独立76関連検証で別担当、ここでは生成recordのUI経路を検証。
