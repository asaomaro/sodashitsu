# 吹き出しの隙間・マウスリサイズ・クリック開閉

## 変更

標準素材の帽子の上端（200x220 SVGのy30.5と立ち絵のY移動9/220）を基準に、吹き出しの見える下端と頭の隙間を6DIPへ。下側の余白を24→8pxにし、枠で切れていた尻尾の描画を除去。

透明な枠なし窓のため、ネイティブOSのresizableフラグではなく、8辺/隅のポインター捕捉と専用IPCで大きさを変える。右下につまみ。実際のネイティブカーソルDIPを使い、ローカル・現在の可視吹き出しだけを変更。開始トークン・owner・epoch・期限を確認し、非表示/ナビゲーション/設定更新で古い操作を無効化。最小320x420DIP（小さい画面は作業領域上限）、画面外への拡大を制限。大きさは実行中だけ再表示時も保持し、再起動で標準に戻る。

立ち絵からのクリックは表示/非表示の切替。トレイや設定からの明示的な開く操作は引き続き表示する。読み込み完了待ちの間に閉じてもready-to-showで勝手に開かないようにする。非表示では会話を終了しない。

## 検証

- アシスタント全体24ファイル174件pass。ビルド(tsc -b/host bundle)pass。
- 生成UI検証pass。マウスで枠を押して移動・解放し、開始/移動/終了のIPC呼出しを確認。短い画面の内部スクロール・通知・入力欄の既存検証もpass。
- 独立レビュー承認。関連2ファイル30件を独立実行してpass。
- 旧来の位置決め・常に開くだけの処理へ戻すと、隙間と再クリック開閉の2テストが失敗。byte-for-byte復元後、関連30件pass。
- 実Windowsでプライマリ右下のキャラクターを物理クリックして表示し、上枠を80物理pxドラッグ。高さ1280→1200、下端は1592で維持。次のクリックで非表示、さらにクリックで同じ窓と大きさを再表示。頭との隙間6.47DIPを確認。
- 実画面キャプチャで隙間と右下つまみ、内部レイアウトを目視確認。マウス位置は検証前の位置へ復元。

実Windows測定:

```json
{"gapDIP":6.4727272727272975,"before":{"x":2400,"y":312,"width":800,"height":1280,"bottom":1592},"afterDrag":{"x":2400,"y":392,"width":800,"height":1200,"bottom":1592},"hiddenOnNextClick":true,"shownOnFollowingClick":true,"restoredHeight":1200}
```

修正前対照（生の出力）:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/geometry.test.ts (5 tests | 1 failed | 4 skipped) 8ms
   × keeps the visible panel six pixels above the standard captain's cap at every character size 7ms
 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (25 tests | 1 failed | 24 skipped) 756ms
   × toggles the bubble on repeated captain clicks and preserves it without ending the session 14ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/geometry.test.ts > keeps the visible panel six pixels above the standard captain's cap at every character size
AssertionError: expected 42.9818181818182 to be close to 6, received difference is 36.9818181818182, but expected 0.5
 ❯ src/geometry.test.ts:42:65
     40|     const prefs=DesktopAssistantPreferences.parse({characterSize});con…
     41|     const bubble=bubbleBounds(prefs,displays);const visibleBottom=bubb…
     42|     expect(character.y+character.height*39.5/220-visibleBottom).toBeCl…
       |                                                                 ^
     43|   }
     44|   const prefs=DesktopAssistantPreferences.parse({characterSize:192});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > toggles the bubble on repeated captain clicks and preserves it without ending the session
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/main.test.ts:1262:30
    1260|   const count=fixture.windows.length;
    1261|   await fixture.handlers.get("assistant:chat")!(click);
    1262|   expect(bubble.isVisible()).toBe(false);expect(bubble.isDestroyed()).…
       |                              ^
    1263|   await fixture.handlers.get("assistant:chat")!(click);
    1264|   expect(bubble.isVisible()).toBe(true);expect(fixture.windows.length)…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 28 skipped (30)
   Start at  13:02:18
   Duration  947ms (tests 51%, transform 38%, import 11%)

```

ログ: /tmp/assistant-bubble-resize-toggle-suite.log、/tmp/assistant-bubble-resize-build.log、/tmp/assistant-bubble-resize-ui.log、/tmp/assistant-bubble-resize-final-focused.log。実画面: /tmp/assistant-bubble-resize-toggle.png。
