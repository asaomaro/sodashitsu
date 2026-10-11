# 検証

- Node16件成功。既存フォルダ/名前の参照、登録時既存ファイル保持、旧hiddenフォルダ互換、外向きsymlinkからPJ外mkdirしない、実拡張のjobロック待ち中フォルダ変更拒否を確認。
- 関連E2E4件成功（Studio2/自動依頼1/通知1）。既存folder/prefix登録から実ブラウザで既存台本previewを確認。初回新規テストは閉じて始まるpreviewトレイを開いていなかったので、既存手順と同じクリックを追加し成功。
- E2E型チェック成功。プラグインのNodeソースと試験だけの変更でサーバ/Webソース変更なし。
- 配布物release/yukkuri-studio-0.5.0.sodaplugin、SHA256 84883f59dea178a7f044125f4e635f7ff2bc67a8ee0c132773b9cd8355e0728d。
- yukkuri-workへinstall/enable/ext reload成功。実行ファイル変更により承認pending。既存動画の移動/コピー/台帳workDir更新は行っていない。

## 負の対照

working予約時のlocation照合だけを除去し、ロック待ち中のフォルダ変更を検知しない回帰で失敗。finallyでbyte一致復元、16件再成功。

```text
✖ a folder change while a real extension waits for the job lock aborts the old script (157.095891ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 205.232327

✖ failing tests:

test at plugins/yukkuri-studio/studio.test.mjs:93:1
✖ a folder change while a real extension waits for the job lock aborts the old script (157.095891ms)
  AssertionError [ERR_ASSERTION]: changed folder must abort before launching

  false !== true

      at TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/studio.test.mjs:104:100)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

```
