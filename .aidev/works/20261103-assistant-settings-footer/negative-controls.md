# Negative control

settings.htmlの配置修正だけを戻すと固定footer検証が失敗。修正済みHTMLへバイト一致で復元。

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toBeVisible() failed

Locator: locator('.settings-footer')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('.settings-footer') with timeout 5000ms
  - waiting for locator('.settings-footer')

    at captureRawStack (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toBeVisible (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:283:72 {
  matcherResult: {
    message: 'expect(locator).toBeVisible() failed\n' +
      '\n' +
      "Locator: locator('.settings-footer')\n" +
      'Expected: visible\n' +
      'Timeout: 5000ms\n' +
      'Error: element(s) not found\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toBeVisible" locator('.settings-footer') with timeout 5000ms\n` +
      "  - waiting for locator('.settings-footer')\n",
    pass: false,
    actual: undefined,
    name: 'toBeVisible',
    expected: 'visible',
    log: [
      `  - Expect "toBeVisible" locator('.settings-footer') with timeout 5000ms`,
      "  - waiting for locator('.settings-footer')"
    ],
    timeout: 5000,
    ariaSnapshot: '- main:\n' +
      '  - heading "操舵室アシスタント" [level=1]\n' +
      '  - button "最小化": −\n' +
      '  - button "最大化"\n' +
      '  - button "閉じる": ×\n' +
      '  - group:\n' +
      '    - text: 基本設定\n' +
      '    - checkbox "アシスタントを有効にする"\n' +
      '    - text: アシスタントを有効にする 表示\n' +
      '    - combobox "表示":\n' +
      '      - option "キャラクターと通知領域アイコン" [selected]\n' +
      '      - option "通知領域アイコンのみ"\n' +
      '    - text: カラーテーマ\n' +
      '    - combobox "カラーテーマ":\n' +
      '      - option "通常"\n' +
      '      - option "ダークモード" [selected]\n' +
      '      - option "OSの明暗に合わせる"\n' +
      '    - text: 立ち絵\n' +
      '    - combobox "立ち絵":\n' +
      '      - option "男性船長"\n' +
      '      - option "女性船長" [selected]\n' +
      '      - option "ロボット船長"\n' +
      '      - option "操舵室アイコン"\n' +
      '    - img "選択中の立ち絵"\n' +
      '    - text: 立ち絵の大きさ\n' +
      '    - spinbutton "立ち絵の大きさ": "192"\n' +
      '    - text: 操舵室の接続先\n' +
      '    - textbox "操舵室の接続先":\n' +
      '      - /placeholder: http://127.0.0.1:7780\n' +
      '      - text: http://127.0.0.1:7780\n' +
      '    - paragraph: WSLで起動した操舵室にも、Windowsのlocalhostから接続できます。ログインは「操舵室を開く」から行います。\n' +
      '    - paragraph: 起動は操舵室の設定から有効にします。操舵室の終了・無効化とともに停止します。\n' +
      '  - group:\n' +
      '    - text: 配置\n' +
      '    - group "配置":\n' +
      '      - text: 配置 表示するディスプレイ\n' +
      '      - combobox "表示するディスプレイ":\n' +
      '        - option "プライマリの右下（自動）" [selected]\n' +
      '        - option "生成したディスプレイ"\n' +
      '      - text: 左位置（DIP）\n' +
      '      - spinbutton "左位置（DIP）": "0"\n' +
      '      - text: 上位置（DIP）\n' +
      '      - spinbutton "上位置（DIP）": "0"\n' +
      '      - paragraph: 自動を選ぶと位置の数値は使いません。ディスプレイが外れた場合は表示できる範囲へ移します。\n' +
      '  - checkbox "全画面中は通知で吹き出しを開かない（知らせは一覧に残す）" [checked]\n' +
      '  - text: 全画面中は通知で吹き出しを開かない（知らせは一覧に残す）\n' +
      '  - checkbox "登録済み・接続中の他マシンからも知らせを受ける（最大8台）" [checked]\n' +
      '  - text: 登録済み・接続中の他マシンからも知らせを受ける（最大8台）\n' +
      '  - checkbox "通知で吹き出しを開かない（会話から確認できます）"\n' +
      '  - text: 通知で吹き出しを開かない（会話から確認できます）\n' +
      '  - group:\n' +
      '    - text: 船長のボイス\n' +
      '    - group "船長のボイス":\n' +
      '      - text: 船長のボイス\n' +
      '      - checkbox "通知と新しい返答を声で読み上げる"\n' +
      '      - text: 通知と新しい返答を声で読み上げる 音声の生成元\n' +
      '      - combobox "音声の生成元":\n' +
      '        - option "PCの音声" [selected]\n' +
      '        - option "内蔵CORE（Sodashitsuが管理）"\n' +
      '        - option "外部VOICEVOX"\n' +
      '      - paragraph: このPCの音声で読み上げます。Windowsは日本語音声を優先し、macOSはOSの既定の音声を使います。LinuxのPC音声は未対応です。音声や出力先はOSで設定できます。過去の会話は読み上げません。\n' +
      '      - button "ボイスを試す"\n' +
      '      - button "読み上げを止める"\n' +
      '      - status: ボイスはオフです。\n' +
      '  - checkbox "待機中のキャラクターをゆっくり上下させる"\n' +
      '  - text: 待機中のキャラクターをゆっくり上下させる\n' +
      '  - checkbox "動きを抑える"\n' +
      '  - text: 動きを抑える\n' +
      '  - checkbox "OSのモーション軽減設定に従う（外すと、このアプリだけ動かします）" [checked]\n' +
      '  - text: OSのモーション軽減設定に従う（外すと、このアプリだけ動かします）\n' +
      '  - group:\n' +
      '    - text: プラグインの機能\n' +
      '    - group "プラグインの機能":\n' +
      '      - text: プラグインの機能\n' +
      '      - checkbox "追加キャラクター素材を表示する"\n' +
      '      - text: 追加キャラクター素材を表示する\n' +
      '      - checkbox "アシスタント用プラグインUIを展開する"\n' +
      '      - text: アシスタント用プラグインUIを展開する\n' +
      '      - checkbox "アシスタント用のプラグイン操作を実行する"\n' +
      '      - text: アシスタント用のプラグイン操作を実行する\n' +
      '      - paragraph: プログラムを含む拡張の有効化・プロジェクト承認は通常の操舵室で行います。ここでの素材追加はPNGだけを取り込み、プログラムは実行しません。\n' +
      '      - button "キャラクター素材フォルダを読み込む"\n' +
      '      - paragraph: casts.jsonとchars/を含む素材フォルダを選び、立ち絵を確認して追加します。PNG画像と表情・ポーズ差分を取り込めます。形式の詳細は操舵室のdocs/assistant-character-assets.mdを参照してください。\n' +
      '      - button "素材パックを選んで確認"\n' +
      '      - text: 追加済み素材パック\n' +
      '      - combobox "追加済み素材パック"\n' +
      '      - button "選んだ素材パックを削除"\n' +
      '  - group:\n' +
      '    - text: 専用エージェントのモデル・effort\n' +
      '    - group "専用エージェントのモデル・effort":\n' +
      '      - text: 専用エージェントのモデル・effort\n' +
      '      - paragraph: 空欄／既定値はエージェントの設定に従います。次回の専用セッション開始から反映します。起動中のセッションは停止・再作成が必要です。利用可能なモデルとeffortは契約・CLIの版・モデルに依存します。\n' +
      '      - text: Claude Code モデル\n' +
      '      - textbox "Claude Code モデル":\n' +
      '        - /placeholder: 空欄：エージェントの既定値\n' +
      '      - text: Claude Code effort\n' +
      '      - combobox "Claude Code effort":\n' +
      '        - option "エージェントの既定値" [selected]\n' +
      '        - option "low"\n' +
      '        - option "medium"\n' +
      '        - option "high"\n' +
      '        - option "xhigh"\n' +
      '        - option "max"\n' +
      '      - text: Codex モデル\n' +
      '      - textbox "Codex モデル":\n' +
      '        - /placeholder: 空欄：エージェントの既定値\n' +
      '      - text: Codex effort\n' +
      '      - combobox "Codex effort":\n' +
      '        - option "エージェントの既定値" [selected]\n' +
      '        - option "none"\n' +
      '        - option "minimal"\n' +
      '        - option "low"\n' +
      '        - option "medium"\n' +
      '        - option "high"\n' +
      '        - option "xhigh"\n' +
      '        - option "max"\n' +
      '        - option "ultra"\n' +
      '      - text: Muse Code モデル\n' +
      '      - textbox "Muse Code モデル":\n' +
      '        - /placeholder: 空欄：エージェントの既定値\n' +
      '      - text: Muse Code effort\n' +
      '      - combobox "Muse Code effort":\n' +
      '        - option "エージェントの既定値" [selected]\n' +
      '        - option "none"\n' +
      '        - option "minimal"\n' +
      '        - option "low"\n' +
      '        - option "medium"\n' +
      '        - option "high"\n' +
      '        - option "xhigh"\n' +
      '        - option "max"\n' +
      '        - option "ultra"\n' +
      '      - text: Antigravity CLI モデル\n' +
      '      - textbox "Antigravity CLI モデル":\n' +
      '        - /placeholder: 空欄：エージェントの既定値\n' +
      '      - text: Antigravity CLI effort\n' +
      '      - combobox "Antigravity CLI effort":\n' +
      '        - option "エージェントの既定値" [selected]\n' +
      '        - option "low"\n' +
      '        - option "medium"\n' +
      '        - option "high"\n' +
      '        - option "xhigh"\n' +
      '        - option "max"\n' +
      '      - text: GitHub Copilot CLI モデル\n' +
      '      - textbox "GitHub Copilot CLI モデル":\n' +
      '        - /placeholder: 空欄：エージェントの既定値\n' +
      '      - text: GitHub Copilot CLI effort\n' +
      '      - combobox "GitHub Copilot CLI effort":\n' +
      '        - option "エージェントの既定値" [selected]\n' +
      '        - option "none"\n' +
      '        - option "minimal"\n' +
      '        - option "low"\n' +
      '        - option "medium"\n' +
      '        - option "high"\n' +
      '        - option "xhigh"\n' +
      '        - option "max"\n' +
      '  - group:\n' +
      '    - text: 音声入力・文字起こし\n' +
      '    - group "音声入力・文字起こし":\n' +
      '      - text: 音声入力・文字起こし 処理先\n' +
      '      - combobox "処理先":\n' +
      '        - option "専用Codexのモデル（標準）"\n' +
      '        - option "ローカルWhisper（任意）" [selected]\n' +
      '      - paragraph: エージェントを選ぶと、確認した音声を送信ボタンから専用Codexとその提供元へ渡します。対応するCodex CLI・音声入力対応モデルが必要です。結果は会話に返します。Claude Codeなど未対応のエージェントへは送らず、別サービスへの自動切替もしません。接続先の操舵室に音声を通常5分間保存します。サーバ終了後の残りは次の音声送信時に期限切れを削除します。送信済みの処理は専用端末で確認・停止してください。\n' +
      '      - checkbox "音声入力を有効にする"\n' +
      '      - text: 音声入力を有効にする このPCのWhisperサーバ\n' +
      '      - textbox "このPCのWhisperサーバ":\n' +
      '        - /placeholder: http://127.0.0.1:8080\n' +
      '        - text: http://127.0.0.1:8080\n' +
      '      - paragraph: Whisperのモデルとサーバは別途用意してください。ローカルWhisperを選んだ場合だけ、選択した音声をこのローカルサーバへ送り、認識結果を確認してから会話へ渡します。マイクは吹き出しの「録音開始」を押したときだけ使い、停止後に試聴・文字起こし・破棄を選べます。\n' +
      '  - group:\n' +
      '    - text: 画像理解・文字認識（OCR）\n' +
      '    - group "画像理解・文字認識（OCR）":\n' +
      '      - text: 画像理解・文字認識（OCR） 処理先\n' +
      '      - combobox "処理先":\n' +
      '        - option "専用エージェントのモデル（標準）" [selected]\n' +
      '        - option "ローカルTesseract（任意）"\n' +
      '      - paragraph: エージェントを選ぶと、確認した画像を明示的に送信したときだけ、専用セッションへ渡します。画像はそのエージェントの提供元へ送られます。結果は会話で返します。現在はClaude Code/Codexの専用セッションが対象です。画像入力対応モデルを選んでください。別の処理先への自動切替はしません。\n' +
      '      - checkbox "画像理解・文字認識を有効にする"\n' +
      '      - text: 画像理解・文字認識を有効にする Tesseract実行ファイルの絶対パス\n' +
      '      - textbox "Tesseract実行ファイルの絶対パス":\n' +
      '        - /placeholder: C:\\Program Files\\Tesseract-OCR\\tesseract.exe\n' +
      '      - text: 認識言語\n' +
      '      - textbox "認識言語": jpn+eng\n' +
      '      - paragraph: Tesseractと日本語・英語の言語データを別途用意してください。画像は認識ボタンを押したときだけ、このPCのTesseractへ渡します。\n' +
      '  - button "保存"\n' +
      '  - button "操舵室を開く" [disabled]\n' +
      '  - status'
  }
}

Node.js v24.15.0

```
SHA256: 3a43b596fdbe7372d736625af073ef07e00e892146f965c51325be2b2d8c9580
