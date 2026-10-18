# 検証結果

## 初期の最大化修正

- Web build（vue-tscとVite）PASS。E2E typecheck PASS。
- WebPreview unit: 3件PASS（既存helper自動起動/手動fallback、追加Esc/非アクティブ解除）。
- 実ブラウザ: remote-web-previewとvscode-cdp-remoteでviewport矩形一致・Fullscreen API不使用を確認。Webはiframe内状態を最大化/復帰後も保持、VSCodeは入力とfitも確認。
- 最終追加実行: remote-desktop / vscode-cdp（プラグイン経由とmobileの2件）の計3件PASS（20.9s）。デスクトップは最大化直後Esc、再最大化→ボタン復帰。VSCodeはviewport寸法/画像/入力/fit/Esc down/up/repeat/通常Esc/共有停止。実WindowsのキャプチャやOS設定変更は行わずsynthetic desktopと実Chromiumを使用。
- 合計5 E2Eが通過。最終ソース修正はRemoteDesktopWindowのfocus復元だけで、Web/remoteVSの通過後は該当コードを変更していない。
- 独立レビューと指摘修正後の再レビューPASS。git diff --check PASS。
- 現行ビルドの /tmp/vscode-cdp-fullscreen.png を目視し、ブラウザviewport全域と操作/復帰ボタンを確認。

ログ: /workspaces/sodashitsu-check-logs/20261018-maximize/ のbuild-final.log, typecheck-final.log, unit.log, e2e.log（Web/remoteVS成功）, e2e-final.log（最終desktop/CDP成功）。

初回desktop/standaloneCDP試験は、リポジトリの.sodaから出る未承認拡張のsticky通知が操作ボタンを遮り、最大化前に停止。個別テストのPJを専用stateDirへ設定し、ユーザーの拡張の影響を除外した。ユーザーの.soda、承認、稼働サーバーは変更していない。

## 旧ビルドでの負対照

新しい最大化操作を追加したWeb/remoteVS E2Eを修正前の成果物で実行し、未実装の最大化ボタンで失敗。生出力（失敗セクション）:

```text
  1) src/specs/remote-web-preview.spec.ts:12:1 › agent registers and opens a real HTTP/WS app through B's outbound-only delegation

    Test timeout of 90000ms exceeded.

    Error: locator.click: Test timeout of 90000ms exceeded.
    Call log:
      - waiting for locator('[data-web-preview]').getByRole('button', { name: '最大化', exact: true })


      76 |     await frame.locator("body").evaluate(el => { el.dataset.maximizeKept = "yes"; });
      77 |     const beforeMaximize = await preview.boundingBox();
    > 78 |     await preview.getByRole("button", {name:"最大化",exact:true}).click();
         |                                                                ^
      79 |     await expect.poll(()=>preview.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})).toEqual(await page.evaluate(()=>({x:0,y:0,width:innerWidth,height:innerHeight})));
      80 |     expect(await page.evaluate(()=>document.fullscreenElement)).toBeNull();
      81 |     await expect(frame.locator("body")).toHaveAttribute("data-maximize-kept","yes");
        at /workspaces/sodashitsu/packages/e2e/src/specs/remote-web-preview.spec.ts:78:64

    Error Context: test-results/remote-web-preview-agent-r-237e1--s-outbound-only-delegation/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-web-preview-agent-r-237e1--s-outbound-only-delegation/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-web-preview-agent-r-237e1--s-outbound-only-delegation/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2) src/specs/vscode-cdp-remote.spec.ts:10:1 › machine header routes only the selected remote VSCode and stops it on close or revocation

    Test timeout of 90000ms exceeded.

    Error: cdpSession.detach: Target page, context or browser has been closed

      165 |     await other?.close();await provider.close();
      166 |     for(const socket of sockets)socket.terminate();wss.close();await new Promise<void>(r=>http.close(()=>r()));
    > 167 |     await session.detach();await source.close();
          |                   ^
      168 |   }
      169 | });
      170 |
        at /workspaces/sodashitsu/packages/e2e/src/specs/vscode-cdp-remote.spec.ts:167:19

    Error Context: test-results/vscode-cdp-remote-machine--7767b-s-it-on-close-or-revocation/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/vscode-cdp-remote-machine--7767b-s-it-on-close-or-revocation/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/vscode-cdp-remote-machine--7767b-s-it-on-close-or-revocation/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2 failed
    src/specs/remote-web-preview.spec.ts:12:1 › agent registers and opens a real HTTP/WS app through B's outbound-only delegation
    src/specs/vscode-cdp-remote.spec.ts:10:1 › machine header routes only the selected remote VSCode and stops it on close or revocation
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/e2e@0.1.0 test: `playwright test src/specs/vscode-cdp-remote.spec.ts src/specs/remote-web-preview.spec.ts`
Exit status 1

```

## デスクトップfocus復元の負対照

focus修正を含まないビルドで回帰実行。最大化直後Escでclassが残ることを検知。修正版は同じ試験を通過。

```text
  1) src/specs/remote-desktop.spec.ts:11:1 › B automatically connects back over WSS using the existing machine connection

    Error: expect(locator).not.toHaveClass(expected) failed

    Locator: locator('[data-remote-desktop]')
    Expected pattern: not /maximized/
    Received string: "desktop-window maximized soda-viewport-maximized"
    Timeout: 3000ms

    Call log:
      - Expect "not toHaveClass" locator('[data-remote-desktop]') with timeout 3000ms
      - waiting for locator('[data-remote-desktop]')
        10 × locator resolved to <section role="dialog" data-v-6dfa4336="" data-remote-desktop="" aria-label="リモートデスクトップ" class="desktop-window maximized soda-viewport-maximized">…</section>
           - unexpected value "desktop-window maximized soda-viewport-maximized"


      55 |     expect(await page.evaluate(()=>document.fullscreenElement)).toBeNull();
      56 |     await page.keyboard.press("Escape");
    > 57 |     await expect(view).not.toHaveClass(/maximized/, {timeout:3000});
         |                            ^
      58 |     await view.getByRole("button", { name: "最大化", exact: true }).click();
      59 |     await view.getByRole("button", { name: "元に戻す", exact: true }).click();
      60 |     // A second authenticated browser gets no screen data merely by logging in.
        at /workspaces/sodashitsu/packages/e2e/src/specs/remote-desktop.spec.ts:57:28

    Error Context: test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop.spec.ts:11:1 › B automatically connects back over WSS using the existing machine connection
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/e2e@0.1.0 test: `playwright test src/specs/remote-desktop.spec.ts`
Exit status 1

```

## 映像領域の負対照

外周だけを最大化する旧ビルドで、映像領域自身のviewport寸法一致を検査。情報欄の分だけ高さが欠け、x=9、y=147、1262×491になることを検知した。修正版は同じ条件で1280×720全面となる。生出力:

```text
  1) src/specs/remote-desktop.spec.ts:11:1 › B automatically connects back over WSS using the existing machine connection

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 4
    + Received  + 4

      Object {
    -   "height": 720,
    -   "width": 1280,
    -   "x": 0,
    -   "y": 0,
    +   "height": 491,
    +   "width": 1262,
    +   "x": 9,
    +   "y": 147,
      }

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      54 |     await expect.poll(()=>view.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})).toEqual(await page.evaluate(()=>({x:0,y:0,width:innerWidth,height:innerHeight})));
      55 |     expect(await page.evaluate(()=>document.fullscreenElement)).toBeNull();
    > 56 |     await expect.poll(()=>view.locator("[data-desktop-screen]").evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})).toEqual(await page.evaluate(()=>({x:0,y:0,width:innerWidth,height:innerHeight})));
         |                                                                                                                                                                         ^
      57 |     await page.keyboard.press("Escape");
      58 |     await expect(view).not.toHaveClass(/maximized/, {timeout:3000});
      59 |     await view.getByRole("button", { name: "最大化", exact: true }).click();
        at /workspaces/sodashitsu/packages/e2e/src/specs/remote-desktop.spec.ts:56:169

    Error Context: test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop.spec.ts:11:1 › B automatically connects back over WSS using the existing machine connection
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/e2e@0.1.0 test: `playwright test src/specs/remote-desktop.spec.ts`
Exit status 1

```

## VSCode文字入力欄の位置の負対照

映像に重ねる汎用CSSの詳細度がformのabsolute指定に勝ち、入力欄が上部へ残った。`:where()`で汎用ルールの詳細度を下げて修正。修正前ビルドでform下端が期待842に対し95となることを検知。生出力:

```text
  1) src/specs/vscode-cdp.spec.ts:40:1 › real CDP pixels and input through the app view, explicit permissions and stop

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 842
    Received: 95

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      305 |     await expect.poll(() => colorError([22,88,144])).toBeLessThanOrEqual(3);
      306 |     await expect.poll(() => view.locator("form").evaluate(el => el.getBoundingClientRect().bottom))
    > 307 |       .toBe(await page.evaluate(() => innerHeight - 8));
          |        ^
      308 |     const fullImage = (await canvas.boundingBox())!;
      309 |     await page.mouse.click(fullImage.x + 100, fullImage.y + 70);
      310 |     await page.keyboard.press("End");
        at /workspaces/sodashitsu/packages/e2e/src/specs/vscode-cdp.spec.ts:307:8

    Error Context: test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp.spec.ts:40:1 › real CDP pixels and input through the app view, explicit permissions and stop
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test src/specs/vscode-cdp.spec.ts --grep real CDP

```

## 情報欄・映像領域の最終検証

- Web build（vue-tscとVite）、E2E typecheck PASS。unitは2ファイル5件PASS。
- 関連E2Eは合計7件PASS。desktop/display/settingsの3件（e2e-content.log）、Webの1件（e2e-content-final.log）、最終CSS修正後のremoteVS/standaloneCDP/mobileの3件（e2e-cdp-final.log、29.9s）。
- 最大化した外枠だけでなく映像領域/iframe自身のviewport寸法を観測。1600×900の模擬Windows対応モード選択と1:1画像表示、復帰後のモード再選択を確認。
- Web設定の開閉でiframe寸法・ページ状態が変わらず、タブ/ワークスペース往復でも状態を保持。設定内のhelper状態も確認。
- VSCodeの実Chromiumキャプチャで入力・文字送信・fit・最大化/復帰/Esc・停止・入力欄のbottom位置を確認。
- 新UIで非表示になった既存header/helper情報を探す古いテストは、canvasからの操作復帰と［情報・設定］を開く操作へ更新。最大化fit後は新画像/ACKの完了を待って入力する。中間の失敗結果もログに保存。
- 最終CDPスクリーンショットとdesktop全面スクリーンショットを目視確認。実WindowsのキャプチャやOS設定は変更せず、synthetic helperと実Chromiumのみで検証。
- 稼働中サーバーのindex.htmlが最新Webビルドを参照することを確認。ブラウザ再読み込みで反映できる。

最終ログ: build-content-final.log、typecheck-content-final.log、unit-content.log、e2e-content.log、e2e-content-final.log、e2e-cdp-final.log。負対照はnegative-content-area.logとnegative-cdp-form.log。保存先は /workspaces/sodashitsu-check-logs/20261018-maximize/。

## fit/クリック位置の追加検証

- fitを無効にしていた解像度追従との結合を解消。fit用canvasの実CSS矩形を描画した画像の比率・寸法へ一致させる。
- 旧ビルドでcanvasboxと実画像の縦横比差0.0972を検知。クリック座標自体が旧版で誤ることをこの負対照だけで証明したものではない。生出力:

```text
  1) src/specs/remote-desktop-fit.spec.ts:8:1 › fitted desktop uses the visible image bounds for clicks through resize and 1:1 scrolling

    Error: expect(received).toBeLessThan(expected)

    Expected: < 0.001
    Received:   0.09722222222222232

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      49 |         const c = el as HTMLCanvasElement, r = c.getBoundingClientRect();
      50 |         return Math.abs(r.width / r.height - c.width / c.height);
    > 51 |       })).toBeLessThan(0.001);
         |           ^
      52 |       await expect.poll(() => view.locator("[data-desktop-screen]").evaluate(el =>
      53 |         el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
      54 |       )).toBe(true);
        at /workspaces/sodashitsu/packages/e2e/src/specs/remote-desktop-fit.spec.ts:51:11

    Error Context: test-results/remote-desktop-fit-fitted--7adb2-gh-resize-and-1-1-scrolling/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-fit-fitted--7adb2-gh-resize-and-1-1-scrolling/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-fit-fitted--7adb2-gh-resize-and-1-1-scrolling/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-fit.spec.ts:8:1 › fitted desktop uses the visible image bounds for clicks through resize and 1:1 scrolling
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/e2e@0.1.0 test: `playwright test src/specs/remote-desktop-fit.spec.ts`
Exit status 1

```

- Web build（vue-tscとVite）、E2E typecheck PASS。
- remote-desktop-fit/display/desktop 3件PASS（21.2s、e2e-fit.log）。新fitテストはDPR1.5で横長・縦長へresize、表示canvasのPNGから緑マーカー位置を実測して押し、ブラウザが送信したdown/upのnormalize座標が一致することを確認。1:1でscroll後の座標も確認。
- display/settings 2件PASS（17.8s、e2e-fit-settings.log）。displayテストには解像度追従中でもfitを有効化でき、不要なスクロールが出ない検証を追加。重複を除き関連E2E4件通過。
- Windowsの全体座標をWinForms VirtualScreenからnative modeのunionへ変更。Windows上でvalidate-display-lease.ps1のC#コンパイルとfake driver検査PASS（windows-fit-checks.log）。負originの複数モニター、physical mode3840×2160と1920×1080、absolute中央/端点、解像度変更後の全体矩形再読みを確認。
- Windowsの実入力・実キャプチャ・混在DPI実機の成功は未検証。実OS設定変更や入力を伴わないfake driver検査のみ。接続先Bにはこのhelperの更新が必要。
- 独立レビューでbrowser/Windows追加差分に必須指摘なし、クローズ可。git diff --check PASS。

## VSCode小数寸法/scrollbarの負対照

旧ビルドで表示領域601.75×401.75に602×402を要求し、収まる601×401の期待に失敗。headlessの負対照は寸法超過を検知し、Windows実機での連続振動そのものを再現したとは扱わない。生出力:

```text
  1) src/specs/vscode-cdp.spec.ts:40:1 › real CDP pixels and input through the app view, explicit permissions and stop

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

      Object {
    -   "height": 401,
    -   "width": 601,
    +   "height": 402,
    +   "width": 602,
      }

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      256 |       e.style.flex = "none"; e.style.width = "601.75px"; e.style.height = "401.75px";
      257 |     });
    > 258 |     await expect.poll(sourceSize).toEqual({ width:601, height:401 });
          |                                   ^
      259 |     await expect.poll(async () => {
      260 |       const b = (await canvas.boundingBox())!;
      261 |       return { width:b.width, height:b.height };
        at /workspaces/sodashitsu/packages/e2e/src/specs/vscode-cdp.spec.ts:258:35

    Error Context: test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp.spec.ts:40:1 › real CDP pixels and input through the app view, explicit permissions and stop
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test src/specs/vscode-cdp.spec.ts --grep real CDP

```

修正版の最終結果: Web build（vue-tsc含む）、E2E typecheck PASS。e2e-cdp-scroll-fit.logでremoteVS/standaloneCDP/mobile計3件PASS（26.5s）。共有元と画像が601×401に一致し、その後1.5秒間の実DOM寸法・scroll範囲が安定。元の画面寸法への再追従、実画像入力、最大化/復帰、Esc、共有停止まで確認。ログ: build-cdp-scroll-fit.log / typecheck-cdp-scroll-fit.log / negative-cdp-scroll-fit.log / e2e-cdp-scroll-fit.log。
