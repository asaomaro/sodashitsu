# 追補: メニュー先頭と通知スナックバー

要求: Web/TUIのペインメニューをボタン列の一番左へ移す。端末の通知をWebと同じく右上に出す。

実装: PaneActions/frameの順序変更、paintToastsを右上・古い→新しい順へ。入り切らなければ新しい通知を残す。クリック当たりも同位置に計算。狭幅は表示・当たりとも画面内に制限。

検証: 関連62件通過、全体ビルド・端末型チェック通過。review_history_usageによる独立レビュー指摘なし。

負の対照: 開始行を右下の条件へ戻し、右上のテストが失敗することを確認。元のファイルとバイト一致で復元してからビルド。

```text
FAIL  |@sodashitsu/tui| src/render/Renderer.test.ts > Renderer（pane の中身と最小限の chrome。AC2・AC6・AC10） > stacks recent snackbar notifications at the top right in chronological order and restores covered content
AssertionError: expected { id: 6, x: 61, y: 18, w: 18 } to match object { id: 6, y: 1 }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
    "id": 6,
-   "y": 1,
+   "y": 18,
  }

 ❯ src/render/Renderer.test.ts:88:33
     86|     }, s.panes, { toasts });
     87|     expect(result.toastHits).toHaveLength(H - 2);
     88|     expect(result.toastHits[0]).toMatchObject({ id: 6, y: 1 });
       |                                 ^
     89|     expect(result.toastHits.at(-1)).toMatchObject({ id: 23, y: H - 2 }…
     90|     expect(result.toastHits.every(hit => hit.x > W / 2 && hit.x + hit.…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

Web E2E4件通過。サーバhandoff完了、9実PTYを継続。端末クライアントは再起動で反映。
