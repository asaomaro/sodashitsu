# Negative controls

修正した箇所だけを戻して各UI検証の失敗を確認後、修正済みファイルをバイト一致で復元。

## folding

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toBeVisible() failed

Locator:  locator('#apps-refresh')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" locator('#apps-refresh') with timeout 5000ms
  - waiting for locator('#apps-refresh')
    14 × locator resolved to <button type="button" id="apps-refresh">プラグイン一覧を更新</button>
       - unexpected value "hidden"

    at captureRawStack (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toBeVisible (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:558:47 {
  matcherResult: {
    message: 'expect(locator).toBeVisible() failed\n' +
      '\n' +
      "Locator:  locator('#apps-refresh')\n" +
      'Expected: visible\n' +
      'Received: hidden\n' +
      'Timeout:  5000ms\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toBeVisible" locator('#apps-refresh') with timeout 5000ms\n` +
      "  - waiting for locator('#apps-refresh')\n" +
      '    14 × locator resolved to <button type="button" id="apps-refresh">プラグイン一覧を更新</button>\n' +
      '       - unexpected value "hidden"\n',
    pass: false,
    actual: 'hidden',
    name: 'toBeVisible',
    expected: 'visible',
    log: [
      `  - Expect "toBeVisible" locator('#apps-refresh') with timeout 5000ms`,
      "  - waiting for locator('#apps-refresh')",
      '    14 × locator resolved to <button type="button" id="apps-refresh">プラグイン一覧を更新</button>',
      '       - unexpected value "hidden"'
    ],
    timeout: 5000,
    ariaSnapshot: '- main:\n' +
      '  - heading "アシスタントのツール" [level=1]\n' +
      '  - button "最小化": −\n' +
      '  - button "最大化"\n' +
      '  - button "閉じる": ×\n' +
      '  - navigation:\n' +
      '    - button "会話を開く"\n' +
      '  - group: 標準ツール\n' +
      '  - status'
  }
}

Node.js v24.15.0

```

## preview-revision

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toBeVisible() failed

Locator:  locator('#ocr-preview-panel')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" locator('#ocr-preview-panel') with timeout 5000ms
  - waiting for locator('#ocr-preview-panel')
    14 × locator resolved to <figure hidden="" id="ocr-preview-panel">…</figure>
       - unexpected value "hidden"

    at captureRawStack (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toBeVisible (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:710:52 {
  matcherResult: {
    message: 'expect(locator).toBeVisible() failed\n' +
      '\n' +
      "Locator:  locator('#ocr-preview-panel')\n" +
      'Expected: visible\n' +
      'Received: hidden\n' +
      'Timeout:  5000ms\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toBeVisible" locator('#ocr-preview-panel') with timeout 5000ms\n` +
      "  - waiting for locator('#ocr-preview-panel')\n" +
      '    14 × locator resolved to <figure hidden="" id="ocr-preview-panel">…</figure>\n' +
      '       - unexpected value "hidden"\n',
    pass: false,
    actual: 'hidden',
    name: 'toBeVisible',
    expected: 'visible',
    log: [
      `  - Expect "toBeVisible" locator('#ocr-preview-panel') with timeout 5000ms`,
      "  - waiting for locator('#ocr-preview-panel')",
      '    14 × locator resolved to <figure hidden="" id="ocr-preview-panel">…</figure>',
      '       - unexpected value "hidden"'
    ],
    timeout: 5000,
    ariaSnapshot: '- main:\n' +
      '  - heading "アシスタントのツール" [level=1]\n' +
      '  - button "最小化": −\n' +
      '  - button "最大化"\n' +
      '  - button "閉じる": ×\n' +
      '  - navigation:\n' +
      '    - button "会話を開く"\n' +
      '  - group:\n' +
      '    - text: 標準ツール\n' +
      '    - group:\n' +
      '      - text: 文章・メモ\n' +
      '      - paragraph: 文章は確認後に会話へ渡します。メモと読み上げはローカルで扱います。\n' +
      '      - text: 扱う文章（8192文字以内）\n' +
      '      - textbox "扱う文章（8192文字以内）": <img src=x onerror=alert(1)>認識結果です。\n' +
      '      - button "コピーした文章を読み込む"\n' +
      '      - button "文章をコピー"\n' +
      '      - button "要約の文面を作る"\n' +
      '      - combobox "翻訳先":\n' +
      '        - option "日本語" [selected]\n' +
      '        - option "英語"\n' +
      '      - button "翻訳の文面を作る"\n' +
      '      - button "読み上げ"\n' +
      '      - button "読み上げを止める"\n' +
      '      - text: この端末のメモ\n' +
      '      - combobox "この端末のメモ":\n' +
      '        - option "新しいメモ" [selected]\n' +
      '      - button "メモを保存"\n' +
      '      - button "メモを削除" [disabled]\n' +
      '    - group:\n' +
      '      - text: 音声入力・文字起こし\n' +
      '      - paragraph: 文字起こし先：このPCのWhisper（http://127.0.0.1:8080）。25MB以内・処理5分まで。\n' +
      '      - button "マイクの録音開始"\n' +
      '      - button "録音停止" [disabled]\n' +
      '      - button "録音を破棄" [disabled]\n' +
      '      - button "録音を文字起こし" [disabled]\n' +
      '      - status: 標準ツールを閉じたため録音を破棄しました。\n' +
      '      - button "音声ファイルを文字起こし"\n' +
      '      - button "文字起こしを停止" [disabled]\n' +
      '      - group "文字起こし音声のドロップ領域": 音声ファイルをここにドロップ（WAV・MP3・M4A・MP4・OGG・FLAC・WebM、25MiB以内）\n' +
      '      - status: 音声ファイルはまだ選択されていません。\n' +
      '      - button "この音声を文字起こし" [disabled]\n' +
      '      - button "選択を解除" [disabled]\n' +
      '      - status: generated.wav：確認してください。\n' +
      '      - text: 文字起こしの結果（確認・編集）\n' +
      '      - textbox "文字起こしの結果（確認・編集）": <img src=x onerror=alert(1)>認識結果です。\n' +
      '      - button "結果を扱う文章へ"\n' +
      '    - group:\n' +
      '      - text: 画像から文字を読み取る（OCR）\n' +
      '      - paragraph: PNGファイルをドロップするか、画像をコピーしてCtrl+V／⌘Vで貼り付けます。最大3840×2160・8MiB。取り込みだけではエージェントへ送りません。プレビューを確認してから認識ボタンを押してください。エージェントへ送信した画像は提供元にも渡り、操舵室には通常24時間の期限で保存されます。窓を閉じても送信済み画像は即時削除されません。\n' +
      '      - group "OCR画像のドロップ・貼り付け領域": PNG画像をここにドロップ／クリップボード画像を貼り付け\n' +
      '      - button "クリップボードの画像を貼り付け"\n' +
      '      - button "PNGファイルを選ぶ"\n' +
      '      - button "画像と結果を破棄"\n' +
      '      - group "切り出す範囲（画像の画素）":\n' +
      '        - text: 切り出す範囲（画像の画素） 左\n' +
      '        - spinbutton "左" [disabled]: "0"\n' +
      '        - text: 上\n' +
      '        - spinbutton "上" [disabled]: "0"\n' +
      '        - text: 幅\n' +
      '        - spinbutton "幅" [disabled]: "1200"\n' +
      '        - text: 高さ\n' +
      '        - spinbutton "高さ" [disabled]: "300"\n' +
      '      - button "この範囲に切り出す" [disabled]\n' +
      '      - button "文字を認識" [disabled]\n' +
      '      - status: 認識前のプレビュー\n' +
      '      - text: 認識結果（確認・編集）\n' +
      '      - textbox "認識結果（確認・編集）"\n' +
      '      - button "認識結果を扱う文章へ" [disabled]\n' +
      '    - group: リマインダー\n' +
      '  - separator\n' +
      '  - group: プラグインのUI・機能\n' +
      '  - status: 確認した結果を扱う文章へ移しました。会話には送っていません。\n' +
      '  - status'
  }
}

Node.js v24.15.0

```

packages/desktop-assistant/assets/tools.html: dfddb2b6e9d4eb3fa9179d519ba61e122b563c235c85261cbfc1d4e8bcae8308
packages/desktop-assistant/assets/ocr.js: a6e39364d4c679607d7cf9773bd82aba425defeddba5ddc754c8c3f79f0153f9
