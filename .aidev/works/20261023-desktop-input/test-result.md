# リモートデスクトップのキーと5ボタン入力

共有画面にフォーカスがあるときのEsc/Tab/修飾キー/長押しを接続先へ送り、修飾キーなしのEscを500ms以内に2回押したときだけ操作権を返し、最大化とフォーカスを解除する。文字欄はローカル入力。マウスはDOMのbuttonsマスクから5ボタンの変化を取り、同時押しのpointermoveも扱う。中央はMIDDLEDOWN/UP、戻る/進むはXDOWN/UPとmouseData 1/2を使い、右クリックへ丸めない。

追加キーと戻る/進むはWebSocket subprotocol、B capabilities、helper readyの対応確認後だけ有効。旧ブラウザ/Relay/Provider/helperには未知のJSON項目・入力を送らない。中央と既存キーは従来経路のまま利用可能。

## 検証

- 関連unit 40件成功。
- ブラウザで5ボタン/左＋中央同時押しの実際のWS送信、input_ack、auxclick/contextmenuのdefaultPrevented、URL不変を確認。
- Tab/Ctrl/Alt/テンキーEnter、DOMでのF13、単発Esc/間の別キー/リピート/2連打、最大化維持と解除、実フォーカスの解除を確認。
- 既存IMEブラウザ3ケースは成功。文字送信の既存E2Eも後述のフォーカス修正後に成功。
- Windows PowerShell validate-unlock-helper.ps1成功。native側は符号化と保持キーの純粋テストで、SendInputや実デスクトップ操作は実行しない。物理マウスによるsr-pc上のアプリ動作は未検証。
- 独立レビュー review_transfer: ツールバーから文字欄/外部へのフォーカス移動で保持キーを解放する必要を指摘、修正とブラウザ回帰テストを追加。最大化のTeleport中の一時フォーカス移動では操作権を失わず、nextTick後に実フォーカスが外なら返す。修正部分も再レビュー通過。

## 負対照

修正したVueだけを一時変更してWebを再ビルドし、同じブラウザ回帰テストを実行。毎回元のファイルへバイト単位で復元している。以下に生の出力を保存する。

### mouse

```text
  1) src/specs/remote-desktop-input.spec.ts:6:1 › focused desktop forwards keyboard and all five mouse buttons 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 4
    + Received  + 4

    @@ -22,21 +22,21 @@
        Array [
          2,
          "up",
        ],
        Array [
    -     3,
    +     2,
          "down",
        ],
        Array [
    -     3,
    +     2,
          "up",
        ],
        Array [
    -     4,
    +     2,
          "down",
        ],
        Array [
    -     4,
    +     2,
          "up",
        ],
      ]

      67 |     }
      68 |     await expect.poll(()=>buttons().length).toBe(10);
    > 69 |     expect(buttons()).toEqual([0,1,2,3,4].flatMap(button=>[[button,"down"],[button,"up"]]));
         |                       ^
      70 |     expect(page.url()).toBe(url);
      71 |     expect(await page.evaluate(()=>(window as any).mouseDefaults)).toEqual(expect.arrayContaining([[1,true],[2,true],[3,true],[4,true]]));
      72 |     // Chorded mouse presses are delivered as pointermove, not pointerdown.
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-input.spec.ts:69:23

    Error Context: test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-input.spec.ts:6:1 › focused desktop forwards keyboard and all five mouse buttons 
undefined
/workspaces/sodashitsu-desktop-input/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-input.spec.ts
```

### escape

```text
  1) src/specs/remote-desktop-input.spec.ts:6:1 › focused desktop forwards keyboard and all five mouse buttons 

    Error: expect(locator).toHaveClass(expected) failed

    Locator: locator('[data-remote-desktop]')
    Expected pattern: /maximized/
    Received string:  "desktop-window embedded"
    Timeout: 5000ms

    Call log:
      - Expect "toHaveClass" locator('[data-remote-desktop]') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]')
        14 × locator resolved to <section role="dialog" tabindex="-1" data-v-5f8087d1="" data-remote-desktop="" aria-label="リモートデスクトップ" class="desktop-window embedded">…</section>
           - unexpected value "desktop-window embedded"


      80 |     await page.keyboard.press("Escape");await page.keyboard.press("a");await page.keyboard.press("Escape");
      81 |     await expect(view).toHaveClass(/maximized/);await expect(canvas).toBeFocused();
    > 82 |     await expect.poll(()=>keys().filter(k=>k[0]==="Escape")).toEqual([["Escape",true],["Escape",false],["Escape",true],["Escape",false]]);
         |                        ^
      83 |     // Auto-repeat cannot become the second physical press.
      84 |     await page.keyboard.press("b");await page.keyboard.down("Escape");await page.keyboard.down("Escape");await page.keyboard.up("Escape");
      85 |     await expect(status).toHaveText("操作中");await expect(view).toHaveClass(/maximized/);
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-input.spec.ts:82:24

    Error Context: test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-input.spec.ts:6:1 › focused desktop forwards keyboard and all five mouse buttons 
undefined
/workspaces/sodashitsu-desktop-input/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-input.spec.ts
```

### focus

```text
  1) src/specs/remote-desktop-input.spec.ts:6:1 › focused desktop forwards keyboard and all five mouse buttons 

    Error: expect(received).toBeGreaterThan(expected)

    Expected: > 1
    Received:   1

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      44 |     const releases=sent.filter(m=>m.type==="release").length;
      45 |     await view.getByLabel("確定した文字を送る").focus();
    > 46 |     await expect.poll(()=>sent.filter(m=>m.type==="release").length).toBeGreaterThan(releases);
         |                                                                      ^
      47 |     await page.keyboard.up("Control");
      48 |     await information.focus();await page.keyboard.down("Shift");
      49 |     await page.evaluate(()=>{const outside=document.createElement("input");document.body.append(outside);outside.focus();});
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-input.spec.ts:46:70

    Error Context: test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-input-focus-203ad--and-all-five-mouse-buttons/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-input.spec.ts:6:1 › focused desktop forwards keyboard and all five mouse buttons 
undefined
/workspaces/sodashitsu-desktop-input/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-input.spec.ts
```

## フォーカス修正の追加検証

既存E2Eで通常のblur中はactiveElementが一時的にbodyになることを検出。relatedTargetがある場合はそちらで境界判定し、ない場合のみVue更新後に判定する。また文字送信後に下書きを空にするとフォーカス中のsubmitボタンが無効になってbodyへ移るため、空にする前にcanvasへ同期的にフォーカスする。どちらも独立レビューで確認した。以下は修正前の実行生出力（別の不具合ではなく追加したfocusout処理による退行を修正）。

```text
  1) src/specs/remote-desktop.spec.ts:12:1 › B automatically connects back over WSS using the existing machine connection 

    Error: expect(received).toContain(expected) // indexOf

    Expected substring: "日本語😀"
    Received string:    "{\"kind\":\"pointer\",\"x\":0.5,\"y\":0.5,\"event\":\"move\",\"button\":0}
    {\"kind\":\"pointer\",\"x\":0.5,\"y\":0.5,\"event\":\"down\",\"button\":0}
    {\"kind\":\"pointer\",\"x\":0.5,\"y\":0.5,\"event\":\"up\",\"button\":0}
    {\"kind\":\"key\",\"code\":\"KeyA\",\"down\":true}
    {\"kind\":\"key\",\"code\":\"KeyA\",\"down\":false}
    "

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      50 |     await view.getByLabel("確定した文字を送る").fill("日本語😀");
      51 |     await view.getByRole("button", { name: "文字を送る", exact: true }).click();
    > 52 |     await expect.poll(async () => readFile(record, "utf8").catch(() => "")).toContain("日本語😀");
         |                                                                             ^
      53 |     await expect.poll(async () => readFile(record, "utf8").catch(() => "")).toContain('"code":"KeyA"');
      54 |     await checkCollapsibleViewerControls(page, view, canvas, "確定した文字を送る", false);
      55 |     await view.getByRole("button", { name: "最大化", exact: true }).click();
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop.spec.ts:52:77

    Error Context: test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop.spec.ts:12:1 › B automatically connects back over WSS using the existing machine connection 
  3 passed (22.2s)
undefined
/workspaces/sodashitsu-desktop-input/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-ime.spec.ts remote-desktop.spec.ts
```

```text
  1) src/specs/remote-desktop.spec.ts:12:1 › B automatically connects back over WSS using the existing machine connection 

    Test timeout of 60000ms exceeded.

    Error: locator.fill: Test timeout of 60000ms exceeded.
    Call log:
      - waiting for locator('[data-remote-desktop]').getByRole('textbox', { name: '確定した文字を送る', exact: true })


       at ../support/viewerControls.ts:7

       5 |   const input = view.getByRole("textbox", { name: inputName, exact: true });
       6 |   const bounds = await canvas.boundingBox();
    >  7 |   await input.fill("折りたたみ後も残す下書き");
         |               ^
       8 |   const collapseToolbar = view.getByRole("button", {name:"操作バーを畳む",exact:true});
       9 |   await expect(collapseToolbar).toBeVisible({timeout:2000});
      10 |   await collapseToolbar.click();
        at checkCollapsibleViewerControls (/workspaces/sodashitsu-desktop-input/packages/e2e/src/support/viewerControls.ts:7:15)
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop.spec.ts:57:5

    Error Context: test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-B-automatic-d0463-existing-machine-connection/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop.spec.ts:12:1 › B automatically connects back over WSS using the existing machine connection 
  1 passed (1.3m)
undefined
/workspaces/sodashitsu-desktop-input/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-input.spec.ts remote-desktop.spec.ts
```

全体unit: 737ファイル・11281件成功。主作業フォルダへの反映後も関連unit45件成功。

最終ブラウザE2E: 5件すべて成功（IME3ケース、5ボタン/キー、既存共有・文字送信・折りたたみ・最大化・再接続）。最終Webビルド成功。
