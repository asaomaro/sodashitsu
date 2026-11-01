# デスクトップ通知の通知元と内容

- 通知に名前（未設定なら種類）、instance ID先頭8文字、作業場所を表示。
- フォーム題名・質問文、およびClaude/Codex会話記録の直近の応答を読み取り専用で取得。端末の承認画面自体は通知元を開いて確認する。
- 内容取得は同時4件・最大8ページ・10秒。取得失敗時は通知の種類と通知元を表示。
- 消滅・置換された通知への遅延結果は破棄し、既存通知の更新時も返答の下書きを保持。
- 独立レビュー review_notice_content：修正必須の指摘なし、関連32テスト通過。

## 検証

型検査、build:host成功。desktop-assistant全176テスト通過。生成UIをブラウザで操作し、通知内容の更新と返答の下書き保持を確認。

```text
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS
```

## 負の対照

今回のnoticeFeed.tsとnoticeConnection.tsのみ変更前へ一時復元し、新しい2テストを実行。失敗を確認後、変更後のバイト列へ復元して一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts (16 tests | 1 failed | 15 skipped) 12ms
   × identifies the named agent and previews form questions and the latest response 11ms
 ❯ |@sodashitsu/desktop-assistant| src/noticeConnection.test.ts (16 tests | 1 failed | 15 skipped) 65ms
   × reads notification content without generating or sending input and rejects late details 64ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/noticeConnection.test.ts > reads notification content without generating or sending input and rejects late details
AssertionError: expected 'ask.subscribe' to be 'agent.conversation' // Object.is equality

Expected: "agent.conversation"
Received: "ask.subscribe"

 ❯ src/noticeConnection.test.ts:462:26
    460|   f.socket.message({ id: "assistant-asks", result: { asks: [] } });
    461|   const request = JSON.parse(f.socket.sent.at(-1)!);
    462|   expect(request.method).toBe("agent.conversation");
       |                          ^
    463|   f.socket.message({
    464|     id: request.id,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts > identifies the named agent and previews form questions and the latest response
AssertionError: expected '操舵室 / worker' to contain '実装担当 (2fa22227)'

Expected: "実装担当 (2fa22227)"
Received: "操舵室 / worker"

 ❯ src/noticeFeed.test.ts:297:24
    295|   feed.shared({ notices: [] });
    296|   const notice = feed.notices[0]!;
    297|   expect(notice.title).toContain(`実装担当 (${agent.instanceId.slice(0, 8)…
       |                        ^
    298|   feed.details(notice.id, {
    299|     nextOffset: null,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 30 skipped (32)
   Start at  13:43:19
   Duration  799ms (transform 73%, import 21%, tests 6%)

```

## 実機への反映

デスクトップアシスタントをdisable→enableで再起動し、assistant.settings.getのphase=runningを確認。Windows側の実行パスはapp-6ebf14b81947eb56bd43a3665593a252204cdf46faa361d8f306e2c16f72b4a7。assets/bubble.jsとdist/main.mjsがビルド済み同梱ファイルと一致。

実サーバの検出済みアイドルCodexを通知元に8秒で閉じる検証フォームを出し、新しいNoticeConnectionが読み取り専用で次の内容を取得することを確認（フォームは終了済み）。

```text
通知元：Codex (0035845a) / ゆっくり動画作成 / 監督
質問内容：通知内容の表示確認 / 通知元と質問内容が表示されていますか？
```
