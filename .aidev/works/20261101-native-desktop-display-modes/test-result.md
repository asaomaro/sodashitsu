# 検証

- build/typecheck成功。Node/provider/settings/UI: 初回60件成功、新規Web/TUI試験追加後は61件成功＋TUI label誤記1件失敗、誤記のみ修正後TUI8件成功（総62件）。
- Browser macos-sck生成helper経路1件成功。最大modeの選択・実canvas1920x1080等倍・操作/agent grantの失効をブラウザとサーバー状態で確認。
- Macの公開SDK compile、生成mode lease/source/input cleanup、negative controlsはCIで実施予定。実OS display/capture/inputは試験しない。
- 独立taskcheckでsource query後再照合/exact capture/input release前restoreの3mustを修正して再点検済み。crossの同寸法rotation/mode変更検出shouldも修正し、再点検で追加must/shouldなし。
- negative controlsはsnapshot照合・UUID・exact transfer・入力解除とrestoreの順序を一時コピー上で壊す4件を追加。既存各compile120s/self-test15sを維持し、Mac job予算だけ20→25分へ拡張。
