# 20261016-display-mount-scope: test-result

## 要件・設計（要約）
`soda.mount` は、Sodashitsu が起動した拡張が出した面だけに許す。pane のプログラム（`sodactl display set --script-html-file`）の面からは `component-error`（`pane_not_available`）。
判定は `DisplayInfo.source`（サーバが拡張の `display.set` にだけ付ける。`DisplayService.set` の `opts.owner`）を `terminalComponentAllowed` で見る。`/ws`・`pane.sock` の面には付かない。

## 負の対照（変更前）
- 単体: `terminalComponentAllowed({paneId, format:"script-html"} /* source なし */, "agent", …)` が `true`（変更前は通る）。
- E2E `display-mount-scope.spec.ts` の「pane のプログラムが出した…埋め込めない」を変更前のコードで実行:
  ```
  ✘  1 display-mount-scope.spec.ts:17 › pane のプログラムが出した script の面からは…埋め込めない
      Error: expect(locator).toHaveText(expected) failed
      Expected: "pane_not_available"
      Received: ""
  ```
  （pane の面から別 pane の端末を `interactive:true` で埋め込めていた）。拡張の面のテストは変更前から通る。

## 変更後
- 単体 `components.test.ts`: 拡張（user/project）は true、source なし・形の違う source・builtin は false。
- E2E: `display-mount-scope`（2 件）・`plugin-components`（3 件。拡張の面に切り替え）・`plugin-perspectives`・`plugin-discovery` が通る。
- `pnpm build`・`pnpm typecheck` 通過。`pnpm test`: 10744 通過・1 件失敗（`server/src/surface/methods/agent.test.ts` の agent.prompt の間隔 `expected 300 to be 1000`。この作業の差分（web・e2e・docs）と無関係）。
