# テスト結果: agent-hook-drift

実機（grok・qoder・qodercli・devin）はこの環境に無い。すべて一時ディレクトリでの単体・統合テストで、**文書の形に書けることだけ**を確かめた。

## 全体（worktree。T1〜T5 と点検の指摘の修正の後）

- `pnpm build`: エラー 0。`pnpm typecheck`: エラー 0。
- `pnpm test`: 421 ファイル中 420 通過、8260 件中 8257 通過、**3 件失敗**（すべて `packages/server/src/tui.integration.test.ts`）。
  - 切り分け: main（d40298a）を、この worktree と同じ長さのパスの worktree（`.claude/worktrees/agent-bbbb…`）で 2 回流して同じ 3 件が落ちる（5 件中 3 件失敗）。短いパス（/tmp）の main では 5 件通る。作業フォルダのパスが長いとサイドバーの表示が折り返されて画面の文字列の検査が合わない、という環境の違いで、退行ではない。
  - 途中で `scripts/migrate-from-wtm.test.ts` が 18 件落ちた。原因は本作業（今の installer が devin・grok を新しい場所・形に書くため、installer で作っていた「古い wtm の導入」が成り立たない）。テストが以前の版の場所・形を直接作るようにして直した（スクリプト本体は変えない）。

## AC ごとの判定

AC1・AC2（grok の形・平らな形の移行）、AC3〜AC5（devin の場所・古い場所・コメントつき）、AC6（qodercli）、AC7（受け口）、AC-I1・AC-I2（一覧・更新の文）、AC8（既存の kind のテストは変えずに通る）、AC9（docs）、AC10（本書）: 該当の単体・統合テストが通る。実機での確認は無い。

## 負の確かめ（直した箇所だけ戻して落ちること）

### T4（受け口の条件）

直す前（テストだけ足した状態）:

```
 × 連携の kind（grok・qodercli・devin）のセッション ID の報告が pane に記録される（claude・codex 以外も）
AssertionError: expected null to match object { kind: 'grok', sessionId: 'grok-1' }
```

直した後に、条件だけ `report.kind === "claude" || report.kind === "codex"` に戻した出力:

```
 × 連携の kind（grok・qodercli・devin）のセッション ID の報告が pane に記録される（claude・codex 以外も）
AssertionError: expected null to match object { kind: 'grok', sessionId: 'grok-1' }
 ❯ src/composeServer.subagents.integration.test.ts:492:64
 Tests  1 failed | 1 passed | 11 skipped (13)
```

戻した後、`git diff -- packages/server/src/composeServer.ts` は T4 の差分だけ（2 行）。

### 点検の指摘 1（シンボリックリンクの解決）: `realpath` の行だけ外す

```
     × シンボリックリンクの設定は、リンクの先を書き換えてリンクを残し、元の権限を保つ 18ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
      Tests  1 failed | 55 passed (56)
```

（権限を保つ部分は、同じテストの `0o644` の検査で見ているが、権限だけを外した確かめは取っていない。）

### 点検の指摘 2（Devin の古い場所 2 か所）: `~/.devin` の legacy だけ外す

```
     × 古い場所が DEVIN_CONFIG_DIR と ~/.devin の両方にあるとき、両方を見つけて片づける 20ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
      Tests  1 failed | 55 passed (56)
```

どちらも確かめの後、修正を戻して通ることを確認済み。

## 未検証の穴（実機）

- Devin CLI が `~/.config/devin/config.json` の `hooks.SessionStart` を読むか、`XDG_CONFIG_HOME` に従うか。
- Grok CLI が入れ子の形（`matcher` なし）を読むか、古い版が入れ子を受けるか、現行版が平らな形を受けるか。`GROK_HOME` の扱い。
- Qoder CLI が `~/.qoder/settings.json` を読むか、`async:true`・`matcher` なしの動き、`qoder --resume` の実在。
- Windows の `%APPDATA%\devin`（関数の単体テストのみ）。
