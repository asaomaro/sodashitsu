# デスクトップ・VSCodeの操作バーと文字入力欄の折り畳み

## 変更

- 上部の操作バーと下部の文字入力欄へ独立した開閉ボタンを追加。畳んだ状態では右上/右下の28pxボタンだけを残す。
- 接続・操作権限は変更せず、v-showで下書きを保持。畳むと操作画面へ、入力欄を開くと入力へフォーカスを戻す。
- 上部を畳むと情報・設定も閉じる。通常表示と最大化に対応し、VSCodeの通常表示ではposition:relativeでビュー自身をボタン配置の基準にする。
- 通常表示の開閉は表示領域を広げ、最大化中は映像領域の寸法を変えない。

## 検証

- Web build（vue-tsc含む）成功。
- E2E typecheck成功。
- 実ブラウザE2E: 4件成功（33.3秒）。通常表示・最大化で上下独立開閉、下書き保持、フォーカス復帰、復元ボタンがビュー内に収まること、最大化中のcanvas矩形維持、操作継続・Esc・plugin/mobile互換を確認。synthetic desktop・模擬CDP sourceを使い、実Windowsのキャプチャ・入力は行わない。
- review_view_maximizeによる独立レビューと追加変更の再レビュー: 必須指摘なし。
- git diff --check成功。

VSCodeの最大化直後は、枠が広がった後にsourceのリサイズ画像が届く。初回E2Eの矩形比較は古い画像を測ったため失敗。画面の新しい画像寸法をDOMで待つ前提へ修正し、remote VSCode単体では成功。最終実行は通常表示/最大化両方を含める。

## 負の対照

新しい開閉回帰試験を変更前のbuildへ当て、存在しない「操作バーを畳む」ボタンで失敗した。生出力:

```text
    Error: expect(locator).toBeVisible() failed

    Locator: locator('[data-remote-desktop]').getByRole('button', { name: '操作バーを畳む', exact: true })
    Expected: visible
    Timeout: 2000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" locator('[data-remote-desktop]').getByRole('button', { name: '操作バーを畳む', exact: true }) with timeout 2000ms
      - waiting for locator('[data-remote-desktop]').getByRole('button', { name: '操作バーを畳む', exact: true })


       at ../support/viewerControls.ts:9

       7 |   await input.fill("折りたたみ後も残す下書き");
       8 |   const collapseToolbar = view.getByRole("button", {name:"操作バーを畳む",exact:true});
    >  9 |   await expect(collapseToolbar).toBeVisible({timeout:2000});
         |                                 ^
      10 |   await collapseToolbar.click();
      11 |   await expect(view.getByRole("button", {name:"情報・設定",exact:true})).toBeHidden();
      12 |   await expect(input).toBeVisible();
        at checkCollapsibleViewerControls (/workspaces/sodashitsu/packages/e2e/src/support/viewerControls.ts:9:33)
        at /workspaces/sodashitsu/packages/e2e/src/specs/remote-desktop.spec.ts:58:5

```

ログは `/workspaces/sodashitsu-check-logs/20261018-viewer-controls/`。既存の個人設定 `.claude/`・`.soda/` は変更しない。

稼働サーバが返すindexとJSが新buildに一致し、開閉UIのラベルを含むことをHTTP200で確認。反映にはブラウザの再読み込みが必要。サーバの再起動は不要。
