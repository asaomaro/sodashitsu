# 待機モーションが停止する原因とOS追従の切り替え

## 原因

実ユーザー設定のreducedMotion=falseを確認。実際のWindows Electron透明・非フォーカスウィンドウでmatchMedia('(prefers-reduced-motion: reduce)').matches=true、mode=still、transformなしを確認。背景描画抑制の初期仮説も確認したが、backgroundThrottling=true/falseの両方でOSの軽減設定に従って停止していた。

## 修正

- followSystemMotionを設定に追加し、初期値trueでOSの設定を尊重。
- 「OSのモーション軽減設定に従う」をオフにした場合、このアプリだけ動かす。Windows側の設定は変更しない。
- JavaScriptの停止判定とCSSの軽減ルールの両方を切り替える。
- アプリ自身のreducedMotion=trueはOS追従にかかわらず優先して停止。
- 立ち絵専用IPCへboolを追加。権限は変更なし。

## 検証

- desktop-assistant全200テスト通過、型検査・protocolビルド・hostビルド成功。
- ブラウザでOS軽減中の追従オン→停止、追従オフ→再開、アプリ軽減オン→停止、設定の保存を確認。
- Windowsの実ElectronでもOS軽減=trueのまま、追従オフでmode=idle・scale変化・RAFカウント増加を確認。透明・非フォーカス条件でも描画が進んだ。
- backgroundThrottlingは既定値を維持。プローブのデフォルトtrueでも1秒の間にRAFが1→51へ進み、falseでは61→182だった。
- 独立レビューreview_motion_system：関連2テスト通過、必須指摘なし。

```text
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS
```

## 実Electronの修正前

```json
[
  {
    "backgroundThrottling": true,
    "visible": true,
    "focused": false,
    "first": {
      "visibility": "visible",
      "reduced": true,
      "disabled": false,
      "mode": "still",
      "transform": ""
    },
    "second": {
      "visibility": "visible",
      "reduced": true,
      "disabled": false,
      "mode": "still",
      "transform": ""
    }
  },
  {
    "backgroundThrottling": false,
    "visible": true,
    "focused": false,
    "first": {
      "visibility": "visible",
      "reduced": true,
      "disabled": false,
      "mode": "still",
      "transform": ""
    },
    "second": {
      "visibility": "visible",
      "reduced": true,
      "disabled": false,
      "mode": "still",
      "transform": ""
    }
  }
]
```

## 実Electronの修正後

```json
[
  {
    "backgroundThrottling": true,
    "visible": true,
    "focused": false,
    "first": {
      "frames": 1,
      "time": 633.0999999642372,
      "visibility": "visible",
      "reduced": true,
      "disabled": false,
      "transform": ""
    },
    "second": {
      "frames": 51,
      "time": 1642,
      "visibility": "visible",
      "reduced": true,
      "disabled": false,
      "mode": "idle",
      "transform": "scale(0.99981, 0.99142)"
    }
  },
  {
    "backgroundThrottling": false,
    "visible": true,
    "focused": false,
    "first": {
      "frames": 61,
      "time": 615.8000000119209,
      "visibility": "visible",
      "reduced": true,
      "disabled": false,
      "mode": "idle",
      "transform": "scale(0.99979, 0.99146)"
    },
    "second": {
      "frames": 182,
      "time": 1628.5,
      "visibility": "visible",
      "reduced": true,
      "disabled": false,
      "mode": "idle",
      "transform": "scale(0.99982, 0.9914)"
    }
  }
]
```

## 負の対照

character.jsとCSSのみ修正前のバイト列へ一時復元し、OS追従オフで再開するブラウザ判定が失敗することを確認。assetsを直接配信する検証のため、ビルド成果物の差し替えは不要。変更後のバイト列へ戻し一致を確認。

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('#character-motion')
Expected: "idle"
Received: "still"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" locator('#character-motion') with timeout 5000ms
  - waiting for locator('#character-motion')
    14 × locator resolved to <span data-motion="still" id="character-motion">…</span>
       - unexpected value "still"

    at captureRawStack (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toHaveAttribute (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:296:24 {
  matcherResult: {
    name: 'toHaveAttribute',
    expected: 'idle',
    message: 'expect(locator).toHaveAttribute(expected) failed\n' +
      '\n' +
      "Locator:  locator('#character-motion')\n" +
      'Expected: "idle"\n' +
      'Received: "still"\n' +
      'Timeout:  5000ms\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toHaveAttribute" locator('#character-motion') with timeout 5000ms\n` +
      "  - waiting for locator('#character-motion')\n" +
      '    14 × locator resolved to <span data-motion="still" id="character-motion">…</span>\n' +
      '       - unexpected value "still"\n',
    pass: false,
    actual: 'still',
    log: [
      `  - Expect "toHaveAttribute" locator('#character-motion') with timeout 5000ms`,
      "  - waiting for locator('#character-motion')",
      '    14 × locator resolved to <span data-motion="still" id="character-motion">…</span>',
      '       - unexpected value "still"'
    ],
    timeout: 5000,
    ariaSnapshot: '- img "船長"'
  }
}

Node.js v24.15.0
```

## 当該環境への反映

停止中にfollowSystemMotionだけをfalseへ変更し、reducedMotion=falseと選択中のキャラクターを維持。Windows全体の設定は変更していない。再起動後phase=running、app-4eab9ebe7d43177221f50702ad21da8d114f7bc34edba9bb93bd3bc5a1d49f96の実行とmain.mjs・character.js・CSS・settings.htmlの一致、保存済み設定を確認。
