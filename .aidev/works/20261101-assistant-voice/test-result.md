# デスクトップアシスタントのボイス

## 動作

- `voiceEnabled`でオン・オフ。未設定はオフ。設定の「船長のボイス」に切替・試聴・停止を追加。
- 新着通知・リマインダーと専用チャットの新しい返答をOSで読み上げる。初期履歴は末尾まで基準更新し、過去会話を再生しない。
- WindowsはSystem.Speech、日本語音声優先。macOSはsayの既定音声。Linuxは未対応と案内。読み上げ用の外部サービス送信なし。
- 600文字まで、コードブロックは画面確認の案内。音声は1プロセス、待機は最新1件だけ。重複を抑制。
- オフ・停止・ロック・スリープ・録音開始で止める。停止した待機要求、消滅した通知元や変更した会話の音声は破棄。子プロセスは終了後に次を再生。
- 新しい会話IDを検出してoffset0へ戻る場合も、履歴末尾へ追いついた状態をリセット。

## 検証

- desktop-assistant全192テスト通過。型検査・protocolビルド・hostビルド成功。
- 関連protocolテスト5件通過。
- ブラウザDOMでボイスのオン・オフ保存、試聴／停止の状態表示を操作し確認。既存の通知・会話・固定レイアウトも通過。
- Windows実機で本実装の固定PowerShellスクリプト・JSON標準入力を使い「こんにちは。操舵室の船長です。ボイスの動作を確認しています。」を再生。OS音声処理が正常終了（物理スピーカーの音の聴取はしていない）。
- 独立レビューreview_voice：停止待ち・履歴ページ・古い対象の待機音声・会話クリア時の追従状態について指摘を修正。最終再レビューで必須指摘なし。

```text
Windows native speech completed successfully
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS
```

## 負の対照：レビュー指摘

修正箇所のみ旧動作へ一時復元して対応する4テストが落ちることを確認。変更後のバイト列へ戻し一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/voice.test.ts (7 tests | 3 failed | 4 skipped) 9ms
   × baselines every historical page until reaching the conversation tail 5ms
   × drops queued speech for vanished sources and aborts invalid active speech 2ms
   × waits for the native child to close after an abort before releasing the speech slot 1ms
 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (29 tests | 1 failed | 28 skipped) 723ms
   × does not start speech after stop while a fullscreen policy read is pending 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > does not start speech after stop while a fullscreen policy read is pending
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/main.test.ts:1339:43
    1337|  await fixture.handlers.get("assistant:voice-stop")!(event);finish(fal…
    1338|  await new Promise(resolve=>setImmediate(resolve));await new Promise(r…
    1339|  expect(fixture.speech.mock.calls.length).toBe(count);
       |                                           ^
    1340|  await fixture.handlers.get("assistant:save")!(event,{enabled:false});
    1341| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/voice.test.ts > baselines every historical page until reaching the conversation tail
AssertionError: expected { …(2) } to be null

- Expected:
null

+ Received:
{
  "key": "reply:actor:large-history:page3",
  "text": "過去の末尾",
}

 ❯ src/voice.test.ts:105:32
    103|     messages: [{ id: "page3", role: "assistant", text: "過去の末尾" }],
    104|   };
    105|   expect(reader.observe(tail)).toBeNull();
       |                                ^
    106|   expect(
    107|     reader.observe({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/voice.test.ts > drops queued speech for vanished sources and aborts invalid active speech
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/voice.test.ts:127:35
    125|   valid = false;
    126|   voice.validate();
    127|   expect(jobs[0]!.signal.aborted).toBe(true);
       |                                   ^
    128|   jobs[0]!.done();
    129|   await vi.waitFor(() => expect(voice.snapshot().speaking).toBe(false)…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/voice.test.ts > waits for the native child to close after an abort before releasing the speech slot
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/voice.test.ts:154:19
    152|   callback(Error("aborted"));
    153|   await Promise.resolve();
    154|   expect(settled).toBe(false);
       |                   ^
    155|   child.emit("close");
    156|   await result;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  2 failed (2)
      Tests  4 failed | 32 skipped (36)
   Start at  16:39:40
   Duration  915ms (tests 77%, transform 19%, import 3%, worker 1%)

```

会話ID変更時の初期化を一時的に外し、既存の会話クリア回帰テストへ足した判定が落ちることを確認。変更後のバイト列へ戻し一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/assistantChat.test.ts (22 tests | 1 failed | 21 skipped) 61ms
   × restarts at offset zero when a live actor clears its conversation 60ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.test.ts > restarts at offset zero when a live actor clears its conversation
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/assistantChat.test.ts:214:50
    212|   await f.chat.refresh();
    213|   expect(f.chat.snapshot().messages).toEqual([]);
    214|   expect(f.chat.snapshot().conversationCaughtUp).toBe(false);
       |                                                  ^
    215|   await f.chat.refresh();
    216|   expect(f.chat.snapshot().conversationCaughtUp).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 21 skipped (22)
   Start at  16:41:01
   Duration  733ms (transform 70%, import 20%, tests 9%)

```

## 反映

ユーザーの依頼に従い、停止中に当該端末のvoiceEnabledだけをtrueへ変更。他の設定は維持。再起動後phase=running、Windows relay実行パスapp-e5873068413cda805738bafc2c56024ee5d5c269c56b95d4f51cceb485f28dadとビルド済みmain.mjs/settings.html/settings.jsの一致、設定voiceEnabled=trueを確認。
