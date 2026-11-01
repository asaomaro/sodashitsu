# 元の素材を使ったポーズ・表情・まばたき・口の切り替え

## 実装

- yukkuri-workのsprite.jsonとsprite/を読み込み、元のポーズbaseとe/blink/open/half差分を動画エンジンと同じclearRect→drawImageの順で合成。
- 対象は通常・考える・指差し・腕上げのポーズ、通常・笑顔・考える・驚きの表情。素材にない差分は標準へフォールバック。腕や手を新造しない。
- 待機中は6秒ごとに表情・ポーズの周期を進め、作業中は考える姿、通知／クリック時は驚き・腕上げ、発話中は指差し・笑顔と簡易口パク。まばたきも素材の差分を使う。
- 軽減設定・非表示・ロック時は標準の閉じ口へ戻して停止。旧素材や読み込み失敗は静止画へ戻す。
- 1キャラクター4MiB、保存全体128MiB。PNG差分は96枚以下、各512KiB、1024×1024以内。描画の内部解像度は最大辺512、合成キャッシュ24枚。
- ハッシュ指定ファイルと小さいindexで保持し、選択中のキャラクターだけを遅延読み込み。静止画カタログへ対応するactorSignatureを保存し、ストア更新の部分失敗で違う画像へ切り替わらないよう照合。
- 立ち絵専用IPCで現在の選択だけを返す。元の制作物・素材・音声設定を変更しない。

## 検証

- desktop-assistant全204テスト通過。型検査・hostビルド成功。
- 読み込み範囲、差分の座標、ハッシュ不一致、破損indexの保持、保存と復元、静止画との紐付け、ネイティブIPCの役割を検証。
- 実Canvasでポーズ／顔／まばたき／口の切り替え、置換画素、停止、破棄を確認。
- 実際のきりたんで通常・考える・通知・発話のPNGを目視確認。
- Windowsの実Electron（透明・非フォーカス・showInactive）でも、無操作のまま待つと考えるポーズへ移り、発話と通知で対応する差分へ移ることを確認。capturePageの画像も目視確認。
- 独立レビューreview_pose_expressions：関連ネイティブ5テスト、Canvasテスト通過。キャッシュの座標不足を修正し、再レビューで必須指摘なし。

```text
PASS: real canvas pose/face/blink/mouth switching, replacement pixels, reduced-motion reset and disposal
normal {"pose":"normal","face":"normal","mouth":"closed","blink":"false","width":348,"height":512}
thinking {"pose":"chin","face":"think","mouth":"closed","blink":"false","width":348,"height":512}
notification {"pose":"raise","face":"surprised","mouth":"closed","blink":"false","width":348,"height":512}
speaking {"pose":"point","face":"smile","mouth":"open","blink":"false","width":348,"height":512}
PASS: real canvas pose/face/blink/mouth switching, replacement pixels, reduced-motion reset and disposal
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS
```

## Windows実機の観測

```json
[
  {
    "idleWithoutInput": {
      "mode": "idle",
      "canvasVisible": true,
      "portraitDisplay": "none",
      "pose": "chin",
      "face": "think",
      "mouth": "closed",
      "blink": "false"
    },
    "focused": false
  },
  {
    "speaking": {
      "mode": "speaking",
      "canvasVisible": true,
      "portraitDisplay": "none",
      "pose": "point",
      "face": "smile",
      "mouth": "open",
      "blink": "false"
    }
  },
  {
    "notification": {
      "mode": "notice",
      "canvasVisible": true,
      "portraitDisplay": "none",
      "pose": "raise",
      "face": "surprised",
      "mouth": "closed",
      "blink": "false"
    }
  }
]
```

実素材57キャラクター、表情データ合計46,391,957バイト。ポーズと顔は共通の範囲で描画し、足元を揃える。Windowsの試験用ElectronではGPU終了ログも出たが、描画・capturePageは成功し、exit=0だった。

## レビュー指摘の負の対照

actor.jsのキャッシュキーだけを修正前へ戻し、同一PNGを異なる座標へ置換するCanvas回帰テストが落ちることを確認。変更後のバイト列へ戻して一致を確認。

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(received).toEqual(expected) // deep equality

- Expected  - 4
+ Received  + 4

  Array [
    Array [
-     0,
-     0,
+     255,
      255,
+     0,
      255,
    ],
    Array [
-     255,
-     255,
+     0,
      0,
+     255,
      255,
    ],
  ]
    at captureRawStack (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toEqual (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-actor-ui.mjs:23:31 {
  matcherResult: {
    actual: [ [ 255, 255, 0, 255 ], [ 0, 0, 255, 255 ] ],
    expected: [ [ 0, 0, 255, 255 ], [ 255, 255, 0, 255 ] ],
    message: 'expect(received).toEqual(expected) // deep equality\n' +
      '\n' +
      '- Expected  - 4\n' +
      '+ Received  + 4\n' +
      '\n' +
      '  Array [\n' +
      '    Array [\n' +
      '-     0,\n' +
      '-     0,\n' +
      '+     255,\n' +
      '      255,\n' +
      '+     0,\n' +
      '      255,\n' +
      '    ],\n' +
      '    Array [\n' +
      '-     255,\n' +
      '-     255,\n' +
      '+     0,\n' +
      '      0,\n' +
      '+     255,\n' +
      '      255,\n' +
      '    ],\n' +
      '  ]',
    name: 'toEqual',
    pass: false
  }
}

Node.js v24.15.0
```

## 実環境へ反映

停止中に57種類の差分を当該PCのassistant-character-actorsへ保存。既存のPNGや素材メモは維持して対応ハッシュだけを追加し、選択中のplugin:yukkuri-work/kiritanと全設定を維持。再起動後phase=runningを確認。

実行キャッシュapp-f83b9e26a4d64a09a9ec3d0504d0fc585618903e0dd84ed4d66b21d498dbd207のmain.mjs・actor.js・character.jsとビルド成果物の一致、選択中のキャラクターのハッシュ一致と差分読み込みを確認。
