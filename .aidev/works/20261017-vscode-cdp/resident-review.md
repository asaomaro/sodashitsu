# 常駐ブリッジの独立最終レビュー

対象: DesktopCdpDevices / DesktopCdpRelay / protocol / cdp-bridge / resident-bridge / DesktopCdpView / manifest / resident unit・E2E / vscode-cdp-dev --state-root。
実施: resume_resize_design。Windows実機・17883へは接続していない。実装の編集はしていない。

## 初回判定: 修正が必要

### P1: CdpCapture.stop の再入でcleanup完了を待たず次sessionへ進む

`cdp-client.mjs` の stop は冒頭で running=false を設定し、以後の呼び出しは即returnする。入力エラー等による内部stopがrelease/clearの途中に、residentのstop/WS断が入ると ResidentSession.finish のawait capture.stopが即完了となる。CDPを閉じてstopped ACKを返すため、viewport復元・入力解放より先に次の共有を始められる。

実CdpCapture＋実ResidentSessionで、Emulation.clearDeviceMetricsOverrideだけをdeferredにして確認。内部stopの後で同じshareのserver stopを送った結果:

```text
BEFORE_CLEAR_RESOLVED [ 'Emulation.clearDeviceMetricsOverride', 'cdp-close', 'stopped' ]
AFTER_CLEAR_RESOLVED [
  'Emulation.clearDeviceMetricsOverride',
  'cdp-close',
  'stopped',
  'Page.stopScreencast'
]
```

進行中の停止promiseを保持し、全てのstop呼び出しが同じcleanup完了を待つ修正が必要。親へ直接報告済み。

### P2: offlineで登録解除したbridgeが永久に再試行する

serverは不正/失効したresume資格もduplicate activeも1008で閉じる。一方runResidentは4403だけを恒久失効としてprofile削除・終了する。offline中にforgetされたbridgeは次のresumeで1008を受けて無限再試行する。

資格失効の4403と、一時的な重複接続の拒否を分離し、offline forget→resumeの試験を追加することを提案。親が採用しserver担当へ依頼済み。

## その他の確認

- server registryはhashのみ保存、0600のtemp＋rename、更新を直列化し、schema・サイズ・64件上限を持つ。statusからhash/secretは除かれる。
- viewerは既存cookie/Origin検査を継続、同一Soda userの境界で登録一覧を共有。初回token消費後はdevice資格でidle復帰し、自動共有再開しない。
- shareIdにより旧frame/input/control/cleanupを分離。busyはcleanup ACKまで保持。local allowInput/allowFitはprofile側から指定され、viewerが昇格できない。
- Windowsprofileの0600はWindows ACLを保証しない。ユーザー専用AppData保存と制約の文書化を前提とする。DPAPIは今回未実装。
- 対象消失後、起動中に別targetへ自動切替しない。ブリッジ再起動時は利用者へ再選択を求める。
- dev launcherの--state-rootはconnection.jsonのstateRoot/stateDir/originとの一致を確認し、既存token/plugin/tabを利用。mainや別stateの自動選択はない。実際の17883復元確認は親担当。
- legacy one-shotを維持、manifestにresident-bridge.mjsを追加。
- pnpm exec vitest run packages/server/src/desktop/DesktopCdpDevices.test.ts packages/server/src/desktop/DesktopCdpRelay.test.ts scripts/vscode-cdp-resident.test.ts --maxWorkers=2: **32件合格**。ログ `/tmp/vscode-cdp-resident-independent-review.log`。
- `git diff --check`: 合格。

上記2件の修正差分の再レビューを待つ。現時点で他のblockingな指摘はない。

## 修正差分の独立再レビュー

既指摘P1/P2は解消。追加のblocking指摘なし。

- P1: stopが進行中promiseを保持して返す変更を確認。queueのエラーhandlerからは引き続きvoid stopを使い、自己queue待ちのdeadlockを避けている。実CdpCapture＋実ResidentSessionによる独立の同じdeferred再現は以下となり、clear前のCDP close/ACKがなくなった。

```text
BEFORE_CLEAR_RESOLVED [ 'Emulation.clearDeviceMetricsOverride' ]
AFTER_CLEAR_RESOLVED [
  'Emulation.clearDeviceMetricsOverride',
  'Page.stopScreencast',
  'cdp-close',
  'stopped'
]
```

- P2: resume資格不正を4403、既存live接続との重複を1008へ分離。offline forget後の資格が4403になる回帰テストを確認。既存runResidentのprofile削除・終了分岐へ到達する。
- UI追加差分: 接続buttonがconnected/busyでdisabledになる前に、tabindex=-1のnative surfaceへfocusしてからconnectを送る変更は、FocusGuard内のfocus保持として妥当。新E2Eは接続後の操作するbutton enabledを直接検査する。最終の実ブラウザpositive/negative結果は親が別途実行・記録する。
- `scripts/vscode-cdp-dev.mjs --state-root`: stateRoot/stateDir/origin照合後に既存plugin/token/tabを再利用する差分を確認。テスト所有helperに限ったSIGKILL fallbackはE2E cleanup範囲内。
- 独立再実行: DesktopCdpRelay.test.ts / scripts/vscode-cdp.test.ts / scripts/vscode-cdp-resident.test.ts **56件合格**（`/tmp/vscode-cdp-resident-independent-rereview.log`）。`git diff --check`合格。

コードレビューの最終判定は通過。Windows実機、新UIの実ブラウザ確認、全体build/typecheck等の実行結果は親の検証記録と合わせて判断する。

## 最終UI・launcherの証拠確認

親から通知されたログを独立に読み、次を確認した。

- 新resident E2Eはheaderを余分にクリックしてfocusを戻す処理を削除し、接続後の「操作する」がenabledであることを直接検査する。stop/reload/server restart/profileだけのCLI再起動/forgetを通る実ブラウザ試験が **1件合格、8.5s**（`/tmp/vscode-cdp-resident-focus-e2e.log`）。
- focus移譲1行のみを外したnegative controlは、期待した「操作する」のenabled検査でdisabledとなり失敗（`/tmp/vscode-cdp-resident-ui-negative.log`）。親による元bytes復元と復元後web buildの報告あり。stop/forget/inviteでも、自身が消える・無効になる前にsurfaceへfocusを移す追加差分を確認した。
- READMEは登録・待機・明示的共有開始・失効・local policy・AppDataのACL依存/DPAPI未実装・Windows自動起動未導入を説明し、実装の境界と一致する。manifestはresident moduleを含む。
- 空きport 17948でdev launcherを同じstateから起動し直した親の実行ログは、`{"sameToken":true,"sameTab":true,"loginStatus":204}`（`/tmp/vscode-cdp-dev-reuse-check.log`）。既存state再利用の確認として妥当。

追加blocking指摘なし。復元後の新旧まとめE2E・smoke・対象単体・typecheckの最終結果は親が追記予定。

## 復元後の最終検証確認

- 対象単体/統合は5ファイル **68件合格**（`/tmp/vscode-cdp-resident-final-unit.log`）。
- 新旧E2Eのまとめ実行は **15件合格・既存app-view-directのA 1件timeout**（`/tmp/vscode-cdp-resident-final-e2e.log`）。新規CDP/residentの3件は通過。失敗したAの単独再実行は **1件合格、8.4s**（`/tmp/vscode-cdp-resident-recheck-app2.log`）。一発で16件全て合格したとは扱わない。先行するgrep不一致のNo tests foundは試験実行回数へ含めない。
- smokeは **PASS**（`/tmp/vscode-cdp-resident-smoke.log`）。同時実行のprocessInspector timeoutについては親の検証記録に記載されている。
- root build/typecheck、server最終build、復元後web build、E2E typecheckの合格通知を受領。検証結果と4本のnegativeの生出力は `resident-test-result.md` にまとまっている。
- 親は所有する17883の検証serverだけを同じstateで更新し、同じtoken/tab、最新assetの200/dist一致、Windows配置3ファイルの一致とNode syntax checkを確認したと報告。レビュー担当はWindows/liveへ接続していない。
- 最後の `git diff --check` 合格。コードと記録に追加のblocking指摘はない。

**最終判定: 通過。** 実験版としての制約、Windows実機の未確認範囲、既存E2Eの一時timeoutは検証記録・READMEの記載を維持する。

## テスト終了条件の追加確認

明示的なCLI停止の直後に `expect(child.signalCode).not.toBe('SIGKILL')` を追加した差分を確認。テスト所有helperの後始末用SIGKILL fallbackによって、正常停止の失敗を合格に隠すことを防ぐ検査であり妥当。製品実装の変更はない。resident E2Eの再実行ログ `/tmp/vscode-cdp-resident-graceful.log` は **1件合格、13.1s**。`git diff --check` 合格。最終判定は通過のまま。
