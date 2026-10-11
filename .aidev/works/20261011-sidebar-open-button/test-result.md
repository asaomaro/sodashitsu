# モダンのサイドバー開ボタン

畳んだ状態の開ボタンを、閉じるボタンと同じ位置・大きさで右罫線の上に配置。罫線をまたぐボタンを切らないよう、モダンで畳んだ状態のスクロールを一覧内へ移した。

Web build成功。実ブラウザの既存開閉テストに中心位置・罫線外側のヒット判定・外側クリックでの展開を追加し、1件成功。修正前のビルド済みUIでは位置の検査が失敗した。

## 修正前の生の出力

```text

Running 1 test using 1 worker

(node:765648) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-11T07:30:17.324Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-11T07:30:17.324Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-C9IFN3/commands.json","count":0}
  ✘  1 src/specs/ui-style-layout.spec.ts:52:1 › たたむ・広げるの印: 境の線の縦の中央にある。押すと畳み・広がる。印の上では幅のドラッグが始まらず、つまみの別の場所では今までどおり動く。畳んだ状態にも同じ印 (2.2s)


  1) src/specs/ui-style-layout.spec.ts:52:1 › たたむ・広げるの印: 境の線の縦の中央にある。押すと畳み・広がる。印の上では幅のドラッグが始まらず、つまみの別の場所では今までどおり動く。畳んだ状態にも同じ印

    Error: expect(received).toBeLessThanOrEqual(expected)

    Expected: <= 2
    Received:    10

      87 |   const t2 = (await toggle.boundingBox())!;
      88 |   expect(Math.abs(t2.y + t2.height / 2 - (nav2.y + nav2.height / 2))).toBeLessThanOrEqual(2);
    > 89 |   expect(Math.abs(t2.x + t2.width / 2 - (nav2.x + nav2.width))).toBeLessThanOrEqual(2);
         |                                                                 ^
      90 |   // 罫線の外側でもボタンが切られず、開く操作を受け付ける。
      91 |   const outerX = nav2.x + nav2.width + 4;
      92 |   const centerY = t2.y + t2.height / 2;
        at /workspaces/sodashitsu/packages/e2e/src/specs/ui-style-layout.spec.ts:89:65

    Error Context: test-results/ui-style-layout-たたむ・広げるの印--8fd89-みの別の場所では今までどおり動く。畳んだ状態にも同じ印/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/ui-style-layout-たたむ・広げるの印--8fd89-みの別の場所では今までどおり動く。畳んだ状態にも同じ印/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/ui-style-layout-たたむ・広げるの印--8fd89-みの別の場所では今までどおり動く。畳んだ状態にも同じ印/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/ui-style-layout.spec.ts:52:1 › たたむ・広げるの印: 境の線の縦の中央にある。押すと畳み・広がる。印の上では幅のドラッグが始まらず、つまみの別の場所では今までどおり動く。畳んだ状態にも同じ印
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test ui-style-layout.spec.ts --grep たたむ・広げるの印:
```

## 関連確認

区画見出しとカードの実ブラウザ検証2件成功。横スクロールの検査対象は、ボタンが外へ出るnavではなく一覧に変更。git diff --check成功。独立レビューで製品CSS・外側クリックの問題なし、旧テスト期待と文書の追従指摘を反映。
