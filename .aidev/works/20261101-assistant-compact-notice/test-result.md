# 会話ウィンドウを閉じている間の通知専用吹き出し

## 動作

- 新着で会話ウィンドウを自動表示せず、立ち絵の帽子に接する位置へ340×220 DIPの通知専用吹き出しを表示。トレイ表示時は選択画面の右下。小さい画面は作業領域内に収める。
- 通知元と内容をプレーンテキストで表示し、取得後の詳細更新も反映。通知元が消えた場合は閉じる。
- 「内容を開く」は明示操作として会話ウィンドウを開く。×は通知専用吹き出しだけを閉じ、通知一覧は保持。
- 会話表示中は一覧だけを更新。通知専用吹き出しは1個を再利用し、新着が重なると最新を表示。
- ミュート・全画面・ロック・スリープ・無効化を尊重。遅延する全画面判定を世代で破棄し、フォーカスを奪わずshowInactiveで表示。
- 通知専用ドキュメントにはnotice-stateとnotice-dismissだけを追加。返答・録音・クリップボード等の操作は許可しない。

## 検証

- desktop-assistant全183テスト通過。型検査・build:host成功。
- 新規テスト：通知専用画面、詳細更新、明示展開、閉じても一覧を維持、会話表示中は重ねない、通知元消滅とロック時の終了、座標と小画面、IPC権限。
- ブラウザDOMで通知元・本文・詳細更新・長文の内部スクロール・HTML文字列の非実行・古いリビジョン破棄・表示／閉じる操作を確認。
- `/tmp/assistant-compact-notice.png` を目視し、金色・紺色の通知用吹き出しとしっぽを確認。
- 独立レビュー `review_compact_notice`：関連7テスト通過、修正必須の指摘なし。

```text
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS
```

## 負の対照

main.tsのみ作業前のバイト列へ一時復元して、新しい動作の3テストを実行し失敗を確認。変更後のバイト列へ復元し一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (27 tests | 3 failed | 24 skipped) 848ms
   × delivers a compact notification without opening chat and obeys mute 65ms
   × opens chat only on compact notice click, dismisses without losing inbox, and never overlays open chat 9ms
   × retires compact notifications when their source resolves or the screen locks 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > delivers a compact notification without opening chat and obeys mute
AssertionError: expected 'soda-assistant://app/bubble.html' to be 'soda-assistant://app/notice.html' // Object.is equality

Expected: "soda-assistant://app/notice.html"
Received: "soda-assistant://app/bubble.html"

 ❯ src/main.test.ts:383:22
    381|   await vi.waitFor(() => expect(bubble.showInactive).toHaveBeenCalledO…
    382|   expect(bubble.focus).not.toHaveBeenCalled();
    383|   expect(bubble.url).toBe("soda-assistant://app/notice.html");
       |                      ^
    384|   const bubbleEvent = { sender: bubble.webContents, senderFrame: bubbl…
    385|   expect(await fixture.handlers.get("assistant:notice-state")!(bubbleE…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > opens chat only on compact notice click, dismisses without losing inbox, and never overlays open chat
AssertionError: expected 'soda-assistant://app/bubble.html' to contain '/notice.html'

Expected: "/notice.html"
Received: "soda-assistant://app/bubble.html"

 ❯ src/main.test.ts:1279:22
    1277|  connection.options.changed([first],true);
    1278|  const compact=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(com…
    1279|  expect(compact.url).toContain("/notice.html");expect(compact.getBound…
       |                      ^
    1280|  const click={sender:compact.webContents,senderFrame:compact.webConten…
    1281|  await fixture.handlers.get("assistant:chat")!(click);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > retires compact notifications when their source resolves or the screen locks
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/main.test.ts:1302:67
    1300|  connection.options.changed([{id:"expired",title:"確認担当",message:"確認待ち"…
    1301|  const first=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(first…
    1302|  connection.options.changed([],false);expect(first.isDestroyed()).toBe…
       |                                                                   ^
    1303|  connection.options.changed([{id:"lock",title:"確認担当",message:"確認待ち",at…
    1304|  const locked=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(lock…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 24 skipped (27)
   Start at  15:55:28
   Duration  1.03s (tests 89%, transform 8%, import 2%)

```

## 実機への反映

disable→enableで再起動し、phase=runningを確認。Windows relay実行パスはapp-eaa73763bd30726fdea06d8784b0b24cb5b671f42864108349a913cd125277b3。同配置のnotice.html・notice.js・main.mjsが最新の同梱ビルドと一致。実際の新着の描画確認は上記ブラウザで行い、Windows画面の実通知を表示する検証は追加していない。
