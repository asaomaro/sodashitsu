# 検証

## 範囲

`desktop session|mcp|model --headless` と `--local`、認証済み接続に結び付く内部viewer、Windows UI Automation。
`session`/MCPはUI情報を優先する。組み込みOpenAI computer toolは画像方式のままで、文書にもこの制限を明記した。

## 自動検証

- build成功。全体typecheck成功。
- DesktopUi / DesktopAgentAccess / desktop RPC / desktopMcp: 4ファイル35テスト成功。
- DesktopRelay: 314テスト成功（107.74秒）。
- 全体テスト: 973ファイル成功、既知の2ファイル失敗・1 skip。13808テスト成功、既知の3失敗・1 skip、SettingsDialog workerのOOMエラー1件。
- 追加した最終試験: headless relay 3成功、MCP/session 7成功。
- smoke: PASS（Webの文字入力がPTYへ届く起動確認を含む）。

全体テストの失敗は前回のbaselineで再現済みのSidebar.defaultLayout snapshot 2件、AssistantHostBundleのsynthetic Electron stubのnativeTheme不足、SettingsDialog workerのOOMと一致。今回、GUI実装は変更していない。生の集計:

```text
  Snapshots  2 failed
 Test Files  2 failed | 973 passed | 1 skipped (977)
      Tests  3 failed | 13808 passed | 1 skipped (13819)
     Errors  1 error
   Start at  16:14:03
   Duration  819.61s (tests 81%, import 12%, environment 4%, transform 4%)
```

## 独立レビュー

review_resource_monitorが全体差分をレビュー。`--machine`でのUI取得が取得元サーバーへ転送されること、認証・lease終了処理を確認。
指摘: UI署名にToggleState/IsSelected/ExpandCollapseStateがなく、利用者の変更後にも古い観測で状態変更できた。
修正: 上記の状態を署名に追加。Windows専用fixture検査を追加し、修正差分の再レビューでは必須指摘なし。

## Windows

先行するWindowsネイティブの試験では、自前のWinForms fixtureでset_value/invoke/toggleとパスワード除外が成功。
追加の状態照合修正を含む試験は未完了。sr-pcがロック状態である場合にavailable=falseとなることは確認した。
検証スクリプトは `node scripts/remote-desktop/verify-windows-ui.mjs`。自前の一時フォームだけを操作し、終了後に閉じる。一般のウィンドウ名や入力値は検証ログへ保存しない。


### Windows UI操作と負例（sr-pc、Windows Node 24.18.0）

自前のWinFormsフォームを使う検証で、修正後は次のstdoutとなり、exitCode=0だった。

```text
{"available":true,"elements":12,"setValue":true,"invoke":true,"toggle":true,"passwordExcluded":true,"changedStateRejected":true}
```

署名の状態追加3行だけを除いた別コピー（native実行用JS）に同一の検証を適用し、修正前が落ちることを確認した。stderrの失敗理由の生の出力（ユーザープロファイルを含むスタックのパス行は省略）:

```text
  if(!rejected.unavailable)throw Error('Changed checkbox state was accepted from a stale observation');
                                 ^

Error: Changed checkbox state was accepted from a stale observation
Node.js v24.18.0
```

修正前コピーSHA256: f7c702ce8b975c124ca4d60ef9cc9fc1c27b47acbebd22b8b8199985e19e7465。
修正後のnative実行用ソースは元ファイルを直接ステージし、SHA256 44d09f0c6260eab4bc6171e6871535a99d5b8e1a471df3517b4f1c9b708aba73 で一致を確認。元ファイルは負例のために書き換えず、同一検証の参照先のみ別コピーへ変更した。最初の30秒上限は試験全体に不足したため、120秒へ変更して実行した。

追加検証: ローカルの許可不要providerと無効なリモート共有設定を分離した試験、CLIの旧2分制限を超えて維持する試験。
