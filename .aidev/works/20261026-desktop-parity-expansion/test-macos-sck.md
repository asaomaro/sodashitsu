# macOS ScreenCaptureKit実験版の検証

実Macは未登録。CIと生成backendでの検証を、実機互換性と区別する。OS画面/実入力/clipboard/権限promptやservice/driver導入は実行していない。

- Mac CI [40543568396](https://github.com/asaomaro/sodashitsu/actions/runs/40543568396): macos-latest SDKcompile/ad-hoc sign/probe成功、generated33件成功（FakeSink、CtrlSpace、replay/期限、全button、scope失効、未公開画像、途中書込み、text途中失効、Retina backing、生成8x8 JPEG）。Linux生成CIも成功。
- Mac自己検査はnormal capture modeへ入らない。負例はprivate temporary sourceコピーをcompileして --self-test だけ実行、元sourceのbyte一致を検査。
- Node関連unit22件成功。source fullは11,934件成功・既存TUI時計の17秒期待に16秒となる1件失敗。当該1件を同sourceで再実行し成功（合計11,935件検証）。単一runで全成功とは記さない。
- root fullは11,996件成功・既存WsGateway/PTY往復の10秒timeout1件失敗。当該1件の同source再実行は成功（合計11,997件検証）。製品修正済みとは主張しない。
- source/root build/typecheck成功。独立check worktree frozen install/fresh build/smoke PASS。
- browser3件をsource/rootで成功: Linux plain / Mac plain / Mac encryptedの生成backend、実canvasとbackend表示、raw CtrlSpace、unsupported通知、相互鍵承認と暗号化表示。実Swift backendのcapture/inputをブラウザで確認したものではない。
- encrypted試験の初回はpairing panelがcanvas中央clickを遮った。キーボード試験で必要なcanvas.focusに変更後、3件成功。製品コード変更なし。
- 同headのWindows保護CIは最初microphone_generated_pcm_checks_passed後exit5。failed jobだけ再実行して成功。Windows sourceへの変更はなく、初回失敗を記録する。
- 独立taskcheck/全体review2件のmust: queued画像の公開直前guard、text途中guard、scope失効後のcleanupを修正。物理pixel寸法pinも追加し、全て再レビュー通過。fake回帰と負例3件で失敗することを確認。
- 通常利用はmacOS14+、現地buildとSODA_DESKTOP_MACOS_SCK=1、Screen Recording許可。入力はlocal設定/起動引数/AX/PostEvent許可が別に必要。GPU動画/音声/保護/signinなどを含む他製品との同等対応完了とはしない。

検証済みSwift SHA256: `9918d257747057b67f8c8ae1a7505b654f658f5b544c71cd113ec0e708ed97a5`（CI head 0dd838a15d8fe636a085e642c86540e655b21057とbyte一致）

## CI負例の生出力

```text
macos-generated	Generated negative controls (temporary source copies only)	﻿2026-10-27T16:43:35.2025140Z ##[group]Run python3 scripts/remote-desktop/test-macos-desktop-helper.py
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:35.2025850Z [36;1mpython3 scripts/remote-desktop/test-macos-desktop-helper.py[0m
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:35.2092040Z shell: /bin/bash -e {0}
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:35.2092490Z ##[endgroup]
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:59.8828730Z queued-source exit 1
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:59.8831830Z {"generatedFailure":"GeneratedFailure(detail: \"queued source revocation never writes\")"}
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:59.8832440Z text-source exit 1
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:59.8833300Z {"generatedFailure":"GeneratedFailure(detail: \"text continued after source revocation\")"}
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:59.8834430Z release-source exit 1
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:59.8835030Z {"generatedFailure":"GeneratedFailure(detail: \"source revocation clears trackers without injection\")"}
macos-generated	Generated negative controls (temporary source copies only)	2026-10-27T16:43:59.8836710Z generated_negative_controls_pass
```
