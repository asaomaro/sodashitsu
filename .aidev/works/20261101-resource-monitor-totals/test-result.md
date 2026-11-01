# 検証結果

Web typecheck/build成功。実際のブラウザが受け取ったsnapshotを基準にCPU/RSSの表示値を照合。アプリ報告の25%・123456789 bytesを含み、検索で一覧が空でも合計が変わらないことを検証。デスクトップ画面のスクリーンショット目視、390pxモバイル幅で横溢れなし。既存APIの変更なし。

```text

Running 1 test using 1 worker

(node:3096814) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-11-01T13:51:45.679Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-11-01T13:51:45.680Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-11-01T13:51:45.681Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-11-01T13:51:45.683Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-9a01IU/commands.json","count":0}
  ✓  1 src/specs/resource-monitor.spec.ts:4:1 › opens the resource monitor from Other, observes live processes, filters and pauses (6.1s)

  1 passed (8.3s)

```

稼働中サーバが配信する新しいJSに合計カードを含むことを確認。既に開いている画面は再読み込みで反映。
