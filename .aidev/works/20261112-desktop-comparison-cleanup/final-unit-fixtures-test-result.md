# 最終unitのBackplane/Web fixture修正

基準 `a60874910798d1a73ca227a33c7bb24e11f5cf9e`、作業用worktree `/workspaces/sodashitsu-final-unit-fixtures`。担当は `DesktopEndpointBackplane.test.ts` と `RemoteDesktopVirtualNativeDrag.test.ts` の2ファイルだけ。本番ソース・プロトコル・権限条件・Windows設定は変更しない。

全体実行の失敗原本は `/tmp/soda-final-integration-20261113/unit.stderr`。担当の2ファイルだけで再現した出力:

```
DesktopEndpointBackplane.test.ts (22 tests | 2 failed)
TypeError: Cannot read properties of undefined (reading 'observationId')
TypeError: Cannot read properties of undefined (reading 'imageBase64')
RemoteDesktopVirtualNativeDrag.test.ts (9 tests | 3 failed)
AssertionError: expected false to be true
```

Backplaneは、viewerが最初の描画ACKを一度も送らず、helperのbackpressureを解除しないfixtureだった。現在のagent observeは要求とcaptureが対応した新しい画像を待つため、古い画像を使わずserver_busyを返していた。2つのagent検査のviewerだけ描画ACKを開始するようにし、実helper/loopback/RPC経路と従来のinput・recipient・別root・revokeのassertionを維持した。observeのframeSeqが初期画像より新しいことも確認する。

Webのready fixtureには廃止したresourceFencesが残り、strictなDesktopReadyがready全体を拒否していた。現在のschemaでfixtureをparseし、物理/仮想の明示要求・表示されたdrag対応・file grant・再接続/monitor変更を確認する。file laneは子socketのopenとvideo_viewer handshakeを通す。

旧missing-fence検査は削除。代わりのmissing-files検査では、parse可能な物理readyからfilesだけを省き、file lane handshakeとfiles_ready後も主接続が閉じられていないこととNativeTransferが出ないことを確認する。仮想dragとsecure/cover/multiple-monitors/no-virtual-sourceが同時に広告された矛盾したreadyは、schema拒否を明示する。これらをviewerの認可検査とは扱わない。missing-capabilityはparse可能なreadyとfile接続で確認する。

最終変更後の対象ファイルだけの実行結果:

```
pnpm --filter @sodashitsu/server exec vitest run src/desktop/DesktopEndpointBackplane.test.ts
Test Files  1 passed (1)
Tests       22 passed (22)

pnpm --filter @sodashitsu/web exec vitest run src/components/RemoteDesktopVirtualNativeDrag.test.ts
Test Files  1 passed (1)
Tests       9 passed (9)
```

productionの変更がないためproduction旧コードへの負例は追加していない。全体test/typecheckは重複実行せず、Rootの統合結果と対象31テストを使う。その他Relay/E2Eの失敗は別担当で、このcommitには含めない。
