# デスクトップアシスタントのエージェント一覧

## 実装と範囲

- 吹き出しの開閉できる一覧で、検出済みエージェントの名前・識別ID・作業場所・状態を表示。
- 作業中／確認待ち／待機中で絞り込み。状態変更と終了を通知接続から自動反映し、一覧の更新だけでは吹き出しを自動表示しない。
- 切断中の接続は表示しない。複数マシン通知を有効にした登録済み接続先も対象。
- 最大256件、作業中・確認待ち優先。総件数・作業中・確認待ちの件数と上限を表示。絞り込みは表示対象内に適用。
- 画面内のテーマ付きスクロール、一覧の開閉・絞り込みを更新時も維持。
- 操舵室で未検出のエージェント、旧形式など利用できないIDの作業場所は対象外。

## 検証

- desktop-assistant全179テスト通過、型検査・build:host成功。
- 実ブラウザDOMで3種の状態・名前・絞り込みを確認。256件の一覧内スクロールと上限による空表示の説明を確認。
- 400×640、400×540、320×480でドキュメントのスクロールがなく、入力欄が見えることを確認。
- 画面画像 `/tmp/assistant-agent-roster.png` を目視確認。
- 独立レビュー `review_agent_roster`：関連21テスト通過、必須修正なし。上限時の空表示の説明を改善し、その差分も再レビュー済み。

```text
PASS: fixed bubble, visible composer, internal conversation scroll and themed scrollbars at 400x640, 400x540 and 320x480, tools open/closed
PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing
generated Copilot and Antigravity bubble text and pinned reply PASS
```

## 負の対照

今回のnoticeFeed.ts・remoteNotices.tsだけを作業前のバイト列へ戻し、新しい3テストを実行。失敗後に変更後のバイト列へ復元し一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts (18 tests | 2 failed | 16 skipped) 23ms
   × lists active agents without waiting for notifications and follows state and lifecycle events 18ms
   × orders active work first and bounds the renderer roster while keeping totals 3ms
 ❯ |@sodashitsu/desktop-assistant| src/remoteNotices.test.ts (3 tests | 1 failed | 2 skipped) 64ms
   × includes remote agent names only while their notification connection is current and connected 62ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts > lists active agents without waiting for notifications and follows state and lifecycle events
AssertionError: expected undefined to deeply equal []

- Expected:
[]

+ Received:
undefined

 ❯ src/noticeFeed.test.ts:332:23
    330|   Object.assign(agent, { kind: "codex", name: "実装担当" });
    331|   feed.snapshot(snapshot);
    332|   expect(feed.agents).toEqual([]);
       |                       ^
    333|   feed.shared({ notices: [] });
    334|   expect(feed.notices).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts > orders active work first and bounds the renderer roster while keeping totals
TypeError: Cannot read properties of undefined (reading '0')
 ❯ src/noticeFeed.test.ts:359:20
    357|   feed.snapshot(snapshot);
    358|   feed.shared({ notices: [] });
    359|   const row = feed.agents[0]!;
       |                    ^
    360|   const rows = Array.from({ length: 300 }, (_, i) => ({
    361|     ...row,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/desktop-assistant| src/remoteNotices.test.ts > includes remote agent names only while their notification connection is current and connected
AssertionError: expected undefined to deeply equal []

- Expected:
[]

+ Received:
undefined

 ❯ src/remoteNotices.test.ts:100:28
     98|     },
     99|   ];
    100|   expect(f.service.agents).toEqual([]);
       |                            ^
    101|   n.options.status("connected");
    102|   expect(f.service.agents[0]!.title).toBe("sr-pc / 調査担当 / remote-proje…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  2 failed (2)
      Tests  3 failed | 18 skipped (21)
   Start at  14:59:42
   Duration  1.19s (transform 72%, import 23%, tests 4%, worker 1%)

```

## 実サーバの取得

```json
{
  "total": 1,
  "working": 1,
  "blocked": 0,
  "agents": [
    {
      "title": "Codex (0035845a) / ゆっくり動画作成 / 監督",
      "state": "working"
    }
  ]
}
```

## 実機への反映

デスクトップアシスタントをdisable→enableで再起動し、phase=runningを確認。準備は約80秒かかった。実行中のWindows relayはapp-548d3bdb8bb6e26d53c2960f2cce8fdb774701230ee983114a8b3c8f62493180を使用し、そのassets/bubble.js・dist/main.mjsが最新の同梱ビルドと一致することを確認。

Windows UI Automationで初期非表示の吹き出しを開く補助確認は、対象ウィンドウが見つからず実施できなかった（Bubble not visible）。表示の検証は上記の実ブラウザDOM・画像で実施。実サーバからの取得確認をWindows画面の目視確認で代用したとは扱わない。
