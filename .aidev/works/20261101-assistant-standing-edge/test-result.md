# 立ち絵をプライマリ右下に詰める

## 変更

- 自動配置の16DIPの右・下余白をなくし、実際のプライマリを先頭にして作業領域の右端・下端に配置。
- 明示座標は維持し、小さい画面・負座標・取り外し時の制限も維持。
- 立ち絵横の設定アイコンと、そのDOM参照を削除。設定は吹き出しと通知領域から開ける。
- 標準SVGの倍率は維持。200x220の素材を正方形枠に収めたとき、右端x166は枠の80%、足の下端y211は211/220。右へ20%、下へ9/220動かして足元をタスクバーに合わせる。足より下の影は枠で切る。追加PNGの描画は変更しない。

## 検証

- アシスタント全体24ファイル170件pass。独立レビュー側の関連3ファイル40件もpass。
- build:host（tsc -bとネイティブ素材bundle）pass。
- 生成UI検証pass。立ち絵のボタン1つ、設定アイコンなし、会話を開く操作が動くことを確認。
- 旧geometryへ戻すと、自動配置の辺一致テストが失敗。byte-for-byte復元し、geometry全3件pass。
- 標準の男性・女性・ロボットの透明背景スクリーンショットで、描画右端・下端が192x192枠の端に一致することと、足の不透明色#172438が最終行191にあることを確認。
- 独立レビュー承認。実画面で足より下の影を余白として数えないようY移動量を修正し、その差分も再レビュー承認。

画素確認:

```text
captain-male: painted right/bottom=(192, 192); solid feet last row=191 (frame 192x192)
captain-female: painted right/bottom=(192, 192); solid feet last row=191 (frame 192x192)
captain-robot: painted right/bottom=(192, 192); solid feet last row=191 (frame 192x192)
```

## 修正前の失敗（生の出力）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/geometry.test.ts (3 tests | 1 failed | 2 skipped) 9ms
   × places the automatic character flush with the work-area right and bottom edges 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/geometry.test.ts > places the automatic character flush with the work-area right and bottom edges
AssertionError: expected { x: 1712, y: 832, width: 192, …(1) } to deeply equal { x: 1728, y: 848, width: 192, …(1) }

- Expected
+ Received

  {
    "height": 192,
    "width": 192,
-   "x": 1728,
-   "y": 848,
+   "x": 1712,
+   "y": 832,
  }

 ❯ src/geometry.test.ts:25:93
     23| it("places the automatic character flush with the work-area right and …
     24|   const prefs=DesktopAssistantPreferences.parse({characterSize:192});
     25|   expect(characterBounds(prefs,[{id:"primary",workArea:{x:0,y:0,width:…
       |                                                                                             ^
     26|   expect(characterBounds(prefs,[{id:"primary",workArea:{x:-1920,y:-108…
     27| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  12:48:49
   Duration  701ms (transform 77%, import 21%, tests 1%, worker 1%)

```

ログ: /tmp/assistant-standing-suite.log、/tmp/assistant-standing-build-final.log、/tmp/assistant-standing-ui-final.log、/tmp/assistant-standing-geometry-final.log。

## 実Windowsへの反映

再起動後phase:running。最終ビルドとWindows配置先のcharacter.html/character.js/style.css/main.mjsが一致。実画面を撮影して、立ち絵の設定アイコンがなく、足の下端がタスクバーに接することを目視確認。

物理ピクセルによる測定:

```json
{"window":{"right":3200,"bottom":1904,"width":384,"height":384},"primaryWorkArea":{"right":3200,"bottom":1904},"buttons":[]}
```

立ち絵のネイティブ窓の右端3200・下端1904は、プライマリの作業領域の右端3200・下端1904と一致。画像: /tmp/assistant-standing-taskbar-final.png。
