# yukkuri-workのキャラクターを立ち絵に設定

## 実装

- 設定からyukkuri-workまたはyukkuri-kaisetsuフォルダを選択し、PNGをプレビューした後に取り込む。
- casts.jsonの名称、chars/<id>/normal.png、recipes/<id>.jsonの素材メモを読み取る。動画・音声・PSDのプログラムは実行しない。
- 最大64画像／回、カタログ128画像／16パック・8MiB。1画像128KiB、透明余白を詰めて最大辺512以下へ縦横比を保ち縮小。
- 上部の立ち絵選択にプレビューと素材メモ。取り込み後は素材の表示チェックを入れ、選択・保存で適用。
- 画像の縦横比に合わせてネイティブ窓を配置し、右端・足元と吹き出しの頭上位置を維持。
- ユーザーの取得済み画像を当該PCへ保存。元のyukkuri-workは変更せず、リポジトリや配布物へ素材を同梱しない。
- 音声は既存の独立設定を維持。VOICEVOX起動・キャラクター固有音声・口パクは今回の対象外。

## 検証

- desktop-assistant全198テスト通過、型検査・build:host成功。
- 独立レビューreview_yukkuri_characters：関連14テスト通過、必須指摘なし。
- ブラウザでフォルダ読み込み→プレビュー→明示追加→選択→保存のUI操作と素材メモを確認。
- Windowsの本実装のNativeImage処理で実素材57種類を正規化。警告なし、PNG最大130202バイト、素材メモ50件。補助変換用ElectronはGPUの終了ログを出したが、処理はexit=0で完了し、ずんだもん・霊夢のPNGを目視確認。
- 実カタログを設定画面へ渡したブラウザDOMで60選択肢（標準3＋追加57）、ずんだもんの画像decodeを確認。画像`/tmp/yukkuri-desktop-settings.png`を目視確認。

```text
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS
{"options":60,"selected":"plugin:yukkuri-work/zundamon","image":{"complete":true,"width":259,"height":512}}
```

## 負の対照

geometry.tsとcharacters.tsだけを作業前へ一時復元して、新しい縦横比・保存テストが落ちることを確認。変更後バイト列へ戻し一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/characters.test.ts (4 tests | 1 failed | 3 skipped) 21ms
   × keeps a full yukkuri-work roster and source notes in private PNG storage 20ms
 ❯ |@sodashitsu/desktop-assistant| src/geometry.test.ts (7 tests | 1 failed | 6 skipped) 12ms
   × keeps tall and wide custom artwork flush with the taskbar and anchors bubbles to its actual top 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/characters.test.ts > keeps a full yukkuri-work roster and source notes in private PNG storage
ZodError: [
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      0
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      1
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      2
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      3
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      4
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      5
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      6
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      7
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      8
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      9
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      10
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      11
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      12
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      13
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      14
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      15
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      16
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      17
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      18
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      19
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      20
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      21
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      22
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      23
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      24
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      25
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      26
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      27
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      28
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      29
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      30
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      31
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      32
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      33
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      34
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      35
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      36
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      37
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      38
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      39
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      40
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      41
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      42
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      43
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      44
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      45
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      46
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      47
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      48
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      49
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      50
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      51
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      52
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      53
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      54
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      55
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "credit"
    ],
    "path": [
      "characters",
      56
    ],
    "message": "Unrecognized key: \"credit\""
  },
  {
    "origin": "array",
    "code": "too_big",
    "maximum": 8,
    "inclusive": true,
    "path": [
      "characters"
    ],
    "message": "Too big: expected array to have <=8 items"
  }
]
 ❯ Characters.install src/characters.ts:126:23
    124|   }
    125|   install(input: CharacterPack) {
    126|     const pack = Pack.parse(input);
       |                       ^
    127|     return this.change(() => [...this.packs.filter((old) => old.id !==…
    128|   }
 ❯ src/characters.test.ts:76:15

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/geometry.test.ts > keeps tall and wide custom artwork flush with the taskbar and anchors bubbles to its actual top
AssertionError: expected 1 to be close to 0.5, received difference is 0.5, but expected 0.05
 ❯ src/geometry.test.ts:76:109
     74|  for(const ratio of [0.5,1.5]){
     75|   const char=characterBounds(prefs,displays,ratio),bubble=bubbleBounds…
     76|   expect(char.x+char.width).toBe(1920);expect(char.y+char.height).toBe…
       |                                                                                                             ^
     77|   expect(bubble.y+bubble.height).toBe(char.y+2);expect(notice.y+notice…
     78|  }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 9 skipped (11)
   Start at  16:57:37
   Duration  1.30s (transform 70%, import 26%, tests 2%, worker 1%)

```

## 当該PCへの反映

実素材を変換した57種類を停止中にassistant-characters.jsonへ保存（約7.9MB）。画像素材の表示だけを有効化し、現在のcaptain-male、ボイスや他の設定を維持。再起動後phase=runningを確認。実行中のWindows relayはapp-613a552b97d58c71103edab0ab74bc4d3c2e38e124fa2ce0765b8a8f542e8557を使用。
