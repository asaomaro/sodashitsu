# 検証記録

関連ユニット: 7ファイル258件成功（/tmp/remote-tabs-tests-final.log）。その後のpreview関連最終確認は2ファイル15件成功（/tmp/remote-tabs-preview-final.log）。

実ブラウザの主要3件成功（/tmp/remote-tabs-e2e2.log）:
- Webプレビュー: B発の委譲接続、HTTP/module/API/SSE/upload/WS、UIでの登録・開く、通常タブの往復でiframe文書の属性とhelper接続を保持。
- デスクトップ: タブ選択から共有、実canvas画素、入力、日本語、最大化、共有停止・閉じる・無効化、別ブラウザへの漏洩なし。
- VSCode: タブ選択、遠隔CDPのcanvas、操作、日本語、リサイズ/全画面、閉じる・無効化、既存プラグイン部品とローカルの経路を維持。

初回のdesktop/VSCodeは、fixtureの拡張承認通知が新しい埋込みヘッダーに重なりクリック待ちになった。通知を利用者と同じ閉じる操作で退けるテスト補助へ変更。デスクトップの埋込みヘッダーの操作群も左詰めに配置した。修正後の3件は成功。

デスクトップ追加E2E: 9件成功、性能用1件は既定でskip（/tmp/remote-tabs-desktop-e2e.log）。解像度の1件はフロートの720x760へ戻る旧期待が残っており、新仕様のタブ全域1280x720へ修正して再実行する。

全体build/typecheckは成功（/tmp/remote-tabs-build-final.log、/tmp/remote-tabs-typecheck-final.log）。Vitestは696ファイル・11,084件すべて成功、264.82秒（/tmp/remote-tabs-all-tests.log）。最終のブラウザ検証と起動確認は完了後追記。

## 負の対照（生出力）

256KiB読取を32KiBへ戻すと、最大チャンクの実測アサーションが失敗。初期1MiB fixtureではtimeoutに達したため、256KiBに縮めた上でアサーション失敗まで確認した。unwatchのviewId条件を外すと、別タブのhelperを保持するテストが失敗。両ソースとも試行後は元のバイト列・SHA256一致を確認して復元。

### 読取バッチ

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/preview/PreviewStreams.test.ts (6 tests | 1 failed | 5 skipped) 1287ms
   × negotiated downloads batch buffered data above 32KiB while legacy readers stay bounded 1286ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/preview/PreviewStreams.test.ts > negotiated downloads batch buffered data above 32KiB while legacy readers stay bounded
AssertionError: expected 32768 to be greater than 32768
 ❯ src/preview/PreviewStreams.test.ts:91:54
     89|     expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(256 * 1024, 42)…
     90|     if (maxBytes) {
     91|       expect(Math.max(...chunks.map(c => c.length))).toBeGreaterThan(3…
       |                                                      ^
     92|       expect(chunks.every(c => c.length <= maxBytes)).toBe(true);
     93|     } else expect(chunks.every(c => c.length <= 32 * 1024)).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  23:54:39
   Duration  2.09s (tests 65%, transform 25%, import 10%)

```

### タブの許可の分離

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/preview/PreviewService.test.ts (9 tests | 1 failed | 8 skipped) 8ms
   × keeps separate browser-tab leases and only revokes the closed tab's helper 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/preview/PreviewService.test.ts > keeps separate browser-tab leases and only revokes the closed tab's helper
RpcError: viewer expired
 ❯ PreviewService.poll src/preview/PreviewService.ts:124:19
    122|   poll(clientId: string, viewId?: string): { displays: PreviewDisplay[…
    123|     this.sweep(); const v = [...this.viewers.values()].find((v) => v.c…
    124|     if (!v) throw new RpcError("not_found", "viewer expired");
       |                   ^
    125|     v.expires = Date.now() + 90_000;
    126|     return { helper: [...this.helpers.values()].some(h => h.viewerId =…
 ❯ src/preview/PreviewService.test.ts:84:14

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  23:54:01
   Duration  805ms (transform 73%, import 25%, tests 1%)

```

最終UIの追加確認ではdesktop解像度・desktop本体・VSCodeの3件成功。remote previewの後にモバイル幅へ変える試行は、既存のmachine切替仕様が外部machineを閉じてlocalへ戻すため失敗した（DOMにlocal workspaceの端末が表示）。PCブラウザを初期対象とする既存機能の範囲に合わせ、remoteプレビューの回帰テストからこの範囲外の期待を除いた。実装のエラーやhelper接続維持の失敗とは扱わず、PC向けプレビューを最終再確認する。

## 最終結果

- 全体 build / typecheck 成功。最後のローカル選択制限の追加も Web build（vue-tscを含む）と E2E typecheck 成功。
- 全体 Vitest: 696ファイル / 11,084件、すべて成功（ローカルでdesktopを選べない追加テストも含む）。
- 最終 desktop / display / VSCode E2E: 3件成功（/tmp/remote-tabs-e2e-final.log）。同ログの範囲外モバイル試行を除き、previewを再確認して1件成功（/tmp/remote-tabs-preview-e2e-final.log）。
- 追加desktop E2E成功分と合わせ、関係する13件成功。任意の性能計測1件は既定どおりskip。Windows実機・実接続での転送速度向上率は今回計測していない。
- 独立レビュー: 最後のローカル選択制限も含め再点検し必須指摘なし。git diff --check 成功。
- 稼働サーバーのhandoff・PR作成・mergeは今回実施していない。機能の利用には操作側/接続先とhelperの更新が必要。

起動確認: 作業フォルダ外のworktreeをcwdとし、最終ビルドのsmokeを実行してPASS。実PTY・実Chromiumでログイン、表示、入力往復を確認（/tmp/remote-tabs-smoke.log）。
