# 検証

- build/typecheck成功。Node/provider/settings/UI: 初回60件成功、新規Web/TUI試験追加後は61件成功＋TUI label誤記1件失敗、誤記のみ修正後TUI8件成功（総62件）。
- Browser macos-sck生成helper経路1件成功。最大modeの選択・実canvas1920x1080等倍・操作/agent grantの失効をブラウザとサーバー状態で確認。
- Macの公開SDK compile、生成337件（mode lease/source/input cleanupを含む）、追加4件を含む全negative controls成功（Actions 41215827239 / job124580020334、head d354ec26）。実OS display/capture/inputは試験しない。
- 独立taskcheckでsource query後再照合/exact capture/input release前restoreの3mustを修正して再点検済み。crossの同寸法rotation/mode変更検出shouldも修正し、再点検で追加must/shouldなし。
- negative controlsはsnapshot照合・UUID・exact transfer・入力解除とrestoreの順序を一時コピー上で壊す4件を追加。既存各compile120s/self-test15sを維持し、Mac job予算だけ20→25分へ拡張。

## Mac negativeの生出力

```text
macos-generated	Generated negative controls (temporary source copies only)	2026-10-31T15:53:23.4229070Z display-live-snapshot exit 1
macos-generated	Generated negative controls (temporary source copies only)	2026-10-31T15:53:23.4230600Z {"generatedFailure":"GeneratedFailure(detail: \"display mode live query cannot accept stale snapshot\")"}
macos-generated	Generated negative controls (temporary source copies only)	2026-10-31T15:53:23.4231290Z display-exact-transfer exit 1
macos-generated	Generated negative controls (temporary source copies only)	2026-10-31T15:53:23.4233940Z {"generatedFailure":"GeneratedFailure(detail: \"explicit display dimensions override transfer width with exact pixels\")"}
macos-generated	Generated negative controls (temporary source copies only)	2026-10-31T15:53:23.4234590Z display-release-order exit 1
macos-generated	Generated negative controls (temporary source copies only)	2026-10-31T15:53:23.4235130Z {"generatedFailure":"GeneratedFailure(detail: \"display cleanup releases held key and button before restoring mode\")"}
macos-generated	Generated negative controls (temporary source copies only)	2026-10-31T15:53:23.4235910Z display-identity exit 1
macos-generated	Generated negative controls (temporary source copies only)	2026-10-31T15:53:23.4236360Z {"generatedFailure":"GeneratedFailure(detail: \"display mode rejects reused display ID\")"}
```

CIのbrowser screenshot出力先に残っていた開発PC固定pathをtest.info().outputPathへ修正。製品helperのbytesは変更していない。
