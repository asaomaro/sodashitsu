# 作業

- [x] agent標準/local任意の設定保存と送信前preview
- [x] main所有画像uploadと専用actor固定prompt
- [x] server cancel/期限/idle guard、最終metadata後の再検査と物理slot保持
- [x] UIの明示送信・5分previewと送信後保持の説明
- [x] 独立全体レビュー2件と修正差分再レビュー（残指摘なし）
- [x] 関連59テスト・generatedUI・4件source negative（AssertionError）
- [x] 最終build/typecheck/全体試験・CI/PR/merge

制約: 音声ファイルのモデル直接入力はCLI公開経路の対応差があり未対応。Whisperは任意で別途設定し、自動fallbackにしない。実モデル/Windows GUIは別途確認。
