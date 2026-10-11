Node 24件成功。検索ブラウザテスト1件成功（dark/lightで実optionのコントラスト4.5以上、キーボード選択、検索動作）。修正CSSのみ除去したnegative controlは期待通り失敗。固定ファイルに戻してcmp一致確認、ブラウザテスト再成功。

配布SHA256 a4f2fb8f0ec9e43e7ef5d552efd07e1752dd7618d876305798a518156f2d82df

negative controlの生出力:
```text
    Error: expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      109 |    const lum=(rgb:number[])=>rgb.slice(0,3).map(x=>{const v=x/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i]!,0);
      110 |    const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
    > 111 |   }))).toBe(true);
          |        ^
      112 |   const series=app.getByLabel('シリーズ',{exact:true});await series.focus();await series.press('ArrowDown');await series.press('Enter');await expect(series).toHaveValue('kaisetsu');await series.selectOption('');
      113 |  }
      114 |  await c.request('prefs.set',{patch:{theme:'dracula'}});
        at /workspaces/sodashitsu/packages/e2e/src/specs/yukkuri-studio.spec.ts:111:8

    Error Context: test-results/yukkuri-studio-制作一覧を検索・絞り込み・ページ送りし、詳細から戻っても条件を維持する/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/yukkuri-studio-制作一覧を検索・絞り込み・ページ送りし、詳細から戻っても条件を維持する/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/yukkuri-studio-制作一覧を検索・絞り込み・ページ送りし、詳細から戻っても条件を維持する/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/yukkuri-studio.spec.ts:94:1 › 制作一覧を検索・絞り込み・ページ送りし、詳細から戻っても条件を維持する ────────────────────
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test yukkuri-studio.spec.ts --grep 制作一覧を検索 --workers=1

```
