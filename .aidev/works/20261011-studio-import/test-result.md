# 検証

Node19件成功、ブラウザStudio3件成功、E2E型チェック成功。105件の取り込み、登録済みID/工程維持、二重登録無し、legacy lab/output、外向きsymlink除外、容量拒否でmetadata無しを確認。実ブラウザから取り込み後2件の一覧と保持/未確認の工程、再取り込み0件を検証。

配布: release/yukkuri-studio-0.6.0.sodaplugin SHA256 33bf976c85ca2f4447c9a2fb3f1afbec91cf682a09dd7ad66506e1331469149e。

yukkuri-workへinstall/enable/ext reload後、承認pending。元台帳backup作成。実際のimportで164件追加/登録済み1/合計165/見送り0。再importは0追加/登録済み165。元の制作オブジェクトが完全一致、UUID重複なし、追加164件の全工程pendingを確認。

## 負の対照

local HTML優先の条件だけ戻してlegacy取り込み後再生成の回帰が失敗。finallyでbyte一致復元、19件再成功。

```text
✖ recognizes migrated video files and legacy lab source/output HTML without following outward symlinks (52.759727ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 97.182666

✖ failing tests:

test at plugins/yukkuri-studio/import.test.mjs:10:1
✖ recognizes migrated video files and legacy lab source/output HTML without following outward symlinks (52.759727ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + '/tmp/studio-scan-CVmBRk/output/legacy.html'
  - '/tmp/studio-scan-CVmBRk/lab/thumb/legacy/legacy.html'

      at TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/import.test.mjs:12:872)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '/tmp/studio-scan-CVmBRk/output/legacy.html',
    expected: '/tmp/studio-scan-CVmBRk/lab/thumb/legacy/legacy.html',
    operator: 'strictEqual',
    diff: 'simple'
  }

```
