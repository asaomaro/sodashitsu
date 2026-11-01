# デスクトップの質問通知と選択ボタンが出ない問題

## 要望

操舵室側のフォームは従来どおり常に表示する。補佐として使うデスクトップ側にも、質問通知と「小窓で応答」「操舵室で開く」を出す。

## 実際の原因

実行中サーバのsnapshotにworkspace.id=w3と、そのworkspaceIdを参照するtabが残っていた。NoticeFeedがsnapshot全体にUUID検証を掛けていたため、専用アシスタントを含む正しいUUIDの項目もすべて読めず、NoticeConnectionが接続直後にofflineとなっていた。修正前の実データによる再現でZodのtabs[0].workspaceId/workspaces[0].idのinvalid_formatを確認。

旧形式・確認できない項目を個別に除外し、正しいUUIDの項目の通知は継続する。collection上限は維持。同じUUIDの更新データが無効なら古い操作対象を保持せず無効化する。旧形式IDを自動書換えせず、それ自体を新しい通知の操作対象にはしない。操舵室側の購読・フォーム表示には変更なし。

通知欄は会話とは別の枠にして、長い会話の更新でボタンを押し流さない。タイトルは1行で省略、ボタンは説明文より先に表示。短い画面で枠が高さ0にならないようにし、内部でスクロール。aria-liveの読み上げも維持。

## 検証

- native package typecheck/build: pass。
- アシスタント全体: 24ファイル、167件pass。
- 接続と通知projection: 30件pass。
- 生成UI: pass。100件の長い会話更新後も通知を保持。400x640/400x540/320x480、ツール開閉で両選択ボタンの非ゼロ・表示内のgeometryを確認。
- 独立レビュー: 通知枠の縮みとaria-liveに指摘。修正後、関連30件・生成UI・diff checkを独立に実行して再承認。
- 実際の同じサーバ・同じ旧形式データに対して、修正後のNoticeConnectionがconnectedとなり有効なUUID端末の通知を受信することを確認。
- アシスタントを再起動しphase:runningを確認。
- 実Windowsの確認用フォームで、UI Automationの結果は両ボタンともoffscreen:false/enabled:true。スクリーンショットでも目視確認。確認後、テスト呼出し元を閉じて質問をキャンセル・片付けた。
- 最初の確認用フォームは操舵室側からansweredとなり、既存の自動表示と回答を維持していることも確認。

実Windowsボタン検出:

```json
[{"name":"小窓で応答","offscreen":false,"enabled":true},{"name":"操舵室で開く","offscreen":false,"enabled":true}]
```

実行中アプリ: app-bfd2046e03494c63651c276f330b539ce889de5daee94b1bcc05df244408f1c5。
画像: /tmp/assistant-notice-buttons.png。ログ: /tmp/assistant-notice-suite.log、/tmp/assistant-notice-ui-final.log、/tmp/assistant-notice-types-final.log、/tmp/assistant-notice-build.log。

## 修正前で失敗する確認

NoticeFeedのみを修正前へ戻し、legacyの回帰テストが失敗することを確認した。復元後は修正済みファイルがbyte-for-byteで一致し、167件と生成UIが通った。

生の出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts (15 tests | 1 failed | 14 skipped) 10ms
   × keeps UUID workspace form notifications when legacy entities share the snapshot and event stream 9ms
 ❯ |@sodashitsu/desktop-assistant| src/noticeConnection.test.ts (15 tests | 1 failed | 14 skipped) 64ms
   × stays connected and projects questions despite an unrelated legacy workspace in hello and updates 63ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/noticeConnection.test.ts > stays connected and projects questions despite an unrelated legacy workspace in hello and updates
AssertionError: expected last "vi.fn()" call to have been called with [ 'connected' ]

- Expected
+ Received

  [
-   "connected",
+   "offline",
  ]

 ❯ src/noticeConnection.test.ts:428:20
    426|   f.socket.message({id:"assistant-shared",result:{notices:[]}});
    427|   f.socket.message({id:"assistant-asks",result:{asks:[]}});
    428|   expect(f.status).toHaveBeenLastCalledWith("connected");
       |                    ^
    429|   const askId=randomUUID(),paneId=f.snapshot.panes[0]!.id;
    430|   f.socket.message({event:"workspace.updated",data:{workspace:{id:"w3"…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts > keeps UUID workspace form notifications when legacy entities share the snapshot and event stream
ZodError: [
  {
    "origin": "string",
    "code": "invalid_format",
    "format": "uuid",
    "pattern": "/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/",
    "path": [
      "tabs",
      0,
      "workspaceId"
    ],
    "message": "Invalid UUID"
  },
  {
    "origin": "string",
    "code": "invalid_format",
    "format": "uuid",
    "pattern": "/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/",
    "path": [
      "workspaces",
      0,
      "id"
    ],
    "message": "Invalid UUID"
  }
]
 ❯ NoticeFeed.snapshot src/noticeFeed.ts:72:31
     70|
     71|   snapshot(input: unknown): void {
     72|     const snapshot = Snapshot.parse(input);
       |                               ^
     73|     this.panes = new Map(snapshot.panes.map((pane) => [pane.id, pane])…
     74|     this.tabs = new Map(snapshot.tabs.map((tab) => [tab.id, tab]));
 ❯ src/noticeFeed.test.ts:227:10

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 28 skipped (30)
   Start at  12:32:24
   Duration  782ms (transform 72%, import 23%, tests 6%)

```

確認用フォームのNode検証は、UI確認後に呼出し元をcloseした際、RPC Promiseが未settleのままtop-level awaitが残りexit 13となった（検証用スクリプトの後始末）。別の通知接続でstatus:connected、pendingQuestions:0を再確認し、フォームが片付いていることを確認した。製品のGUI表示確認とは分けて記録する。
