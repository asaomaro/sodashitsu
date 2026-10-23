# 接続先のCtrl+Space割り当てを維持する

報告: 接続先でCtrl+SpaceをIME ON/OFFに割り当てても動作しない。共有画面のキー経路では通常のCtrl+Spaceは送れるが、フォーカス前から修飾キーを押した場合や手元IMEが物理修飾キーdownを消費した場合、その不足を補っていなかった。また物理SpaceにIMEOn/Offのkey名が付いた場合、専用IMEキーへ変換してしまっていた。

実機のイベント記録は採取していないため、sr-pcの報告原因がこのどちらかだと断定しない。接続元OSがイベントそのものをブラウザへ渡さない場合も、このWeb側の修正では取得できない。任意質問で手元IMEが切り替わるか確認を依頼したが、修正中は回答未受領。

## 修正

- code=Spaceは、keyがIMEOn/Offでも物理Spaceとして転送。既存のLang1/2専用キー処理は維持。
- ctrlKey/shiftKey/altKey/metaKeyの状態で不足する修飾キーdownを先に送り、左右の保持とkeyupを追跡。修飾キーがなくなったイベントでは残りを解放する。操作権・フォーカス・動画から画像への復帰など全release境界で追跡を初期化。
- プロトコルとWindows helperの変更はない。従来のControlLeft/RightとSpaceを送る。

## 検証

- 関連unit 21件成功（SpaceのIMEラベルを無視、Ctrl補完、左右、解放とreset）。
- ブラウザE2Eで本物のControl+Spaceに対し実際のWS送信4イベントを順序まで確認。DOMでIMEラベル付きSpace/修飾キーdownなしを再現し、ControlLeft down→Space down/up→ControlLeft upを確認した。keyの既定動作も抑止される。
- 関連E2E5件成功（既存IME3、入力、通常共有）。
- 独立レビュー review_transfer通過。全releaseの追跡初期化追加も再レビューで指摘なし。

## 負対照

それぞれ修正箇所だけを戻してWebを再ビルドし、同じブラウザE2Eが失敗することを確認。元のソースへバイト単位で復元する。

### ime

```text
  1) src/specs/remote-desktop-input.spec.ts:6:1 › focused desktop forwards keyboard and all five mouse buttons

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

    @@ -2,15 +2,15 @@
        Array [
          "ControlLeft",
          true,
        ],
        Array [
    -     "Space",
    +     "ImeOn",
          true,
        ],
        Array [
    -     "Space",
    +     "ImeOn",
          false,
        ],
        Array [
          "ControlLeft",
          false,

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      46 |       return prevented;
      47 |     })).toEqual([true,true,true]);
    > 48 |     await expect.poll(()=>keys().slice(beforeShortcut)).toEqual([["ControlLeft",true],["Space",true],["Space",false],["ControlLeft",false],["ControlRight",false]]);
         |                                                         ^
      49 |     for(const key of ["Tab","Control+a","Alt+x","NumpadEnter"]) await page.keyboard.press(key);
      50 |     await canvas.evaluate(el=>{for(const type of ["keydown","keyup"]){el.dispatchEvent(new KeyboardEvent(type,{code:"F13",key:"F13",bubbles:true,cancelable:true}));}});
      51 |     await expect(canvas).toBeFocused();
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-input.spec.ts:48:57

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

### modifier

```text
  1) src/specs/remote-desktop-input.spec.ts:6:1 › focused desktop forwards keyboard and all five mouse buttons

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 8
    + Received  + 0

    @@ -1,20 +1,12 @@
      Array [
        Array [
    -     "ControlLeft",
    -     true,
    -   ],
    -   Array [
          "Space",
          true,
        ],
        Array [
          "Space",
    -     false,
    -   ],
    -   Array [
    -     "ControlLeft",
          false,
        ],
        Array [
          "ControlRight",
          false,

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      46 |       return prevented;
      47 |     })).toEqual([true,true,true]);
    > 48 |     await expect.poll(()=>keys().slice(beforeShortcut)).toEqual([["ControlLeft",true],["Space",true],["Space",false],["ControlLeft",false],["ControlRight",false]]);
         |                                                         ^
      49 |     for(const key of ["Tab","Control+a","Alt+x","NumpadEnter"]) await page.keyboard.press(key);
      50 |     await canvas.evaluate(el=>{for(const type of ["keydown","keyup"]){el.dispatchEvent(new KeyboardEvent(type,{code:"F13",key:"F13",bubbles:true,cancelable:true}));}});
      51 |     await expect(canvas).toBeFocused();
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-input.spec.ts:48:57

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

## 最終確認

- 正常ソースへ復元後の関連E2E5件すべて成功。
- 実際にローカル欄でCtrlを押したままcanvasへ移動し、SpaceとCtrl解放を行うブラウザケースも成功。独立レビューで追加ケースも確認済み。
- build/typecheck/smoke成功。主作業フォルダのbuildと関連unit21件も成功。
- 全体unit: 737ファイル・11287件すべて成功。
